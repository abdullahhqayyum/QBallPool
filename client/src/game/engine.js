import Phaser from 'phaser'
import { createBalls, rehydrateBalls, syncBallGraphics, areBallsMoving, getBallState } from './balls'
import { stepPhysics, drawTable, checkPockets } from './physics'
import { setupCue, resetCue, shootCue, predictCueFirstContact } from './cue'
import { TABLE, BALL, POCKET } from './constants'
import { useGameStore } from '../store/gameStore'


let onGameOverCb = null
let onTurnEndCb  = null
let onPocketCb   = null

// ---------------------------------------------------------------------------
// Scale helpers — game always runs at TABLE.width × TABLE.height internally.
// The canvas is CSS-scaled down to fit the viewport. Pointer events arrive in
// CSS pixels so we must divide by this factor to get game-space coordinates.
// ---------------------------------------------------------------------------
export function getCanvasScale(game) {
  try {
    const canvas = game?.canvas
    if (!canvas) return 1
    const rect    = canvas.getBoundingClientRect()
    return rect.width / TABLE.width   // CSS width / logical width
  } catch {
    return 1
  }
}

// Compute the CSS width we want the canvas to occupy.
function computeCssWidth() {
  const padding = Math.min(16, window.innerWidth * 0.02)
  const HUD_H   = 62  // px reserved for HUD below canvas
  const maxByW  = window.innerWidth - padding * 2
  const maxByH  = Math.floor((window.innerHeight - HUD_H - padding * 2) / (TABLE.height / TABLE.width))
  return Math.min(maxByW, maxByH)
}
export function initEngine(containerId, gameState, onGameOver, onTurnEnd, onPocket) {
  onGameOverCb = onGameOver
  onTurnEndCb  = onTurnEnd
  onPocketCb   = onPocket

  const config = {
    type:            Phaser.AUTO,
    pixelArt:        false,
    antialias:       true,
    width:           TABLE.width,
    height:          TABLE.height,
    parent:          containerId,
    backgroundColor: '#5c3a1e',
    // We do NOT use Phaser.Scale.FIT — it changes the internal resolution and
    // breaks pointer coordinates. Instead we set the canvas CSS size manually.
    scene: {
      create() { sceneCreate.call(this, gameState) },
      update() { sceneUpdate.call(this) },
    },
  }

  const game = new Phaser.Game(config)

  // Apply CSS scaling once the canvas exists, and on every resize.
  const applyScale = () => {
    const canvas = game.canvas
    if (!canvas) return
    const padding = Math.min(16, window.innerWidth * 0.02)
    const HUD_H   = 62
    const maxByW  = window.innerWidth - padding * 2
    const maxByH  = Math.floor((window.innerHeight - HUD_H - padding * 2) / (TABLE.height / TABLE.width))
    const cssW    = Math.min(maxByW, maxByH)
    const cssH    = Math.round(cssW * (TABLE.height / TABLE.width))
    canvas.style.width       = cssW + 'px'
    canvas.style.height      = cssH + 'px'
    canvas.style.display     = 'block'
    canvas.style.margin      = `${padding}px auto 0`
    canvas.style.border      = 'none'
    canvas.style.outline     = 'none'
    canvas.style.touchAction = 'none'
  }

  // Canvas may not exist yet on the very first tick
  setTimeout(applyScale, 30)
  setTimeout(applyScale, 200)   // insurance

  window.addEventListener('resize',            applyScale)
  window.addEventListener('orientationchange', applyScale)

  // Store cleanup so destroyEngine can remove the listeners
  game.__scaleCleanup = () => {
    window.removeEventListener('resize',            applyScale)
    window.removeEventListener('orientationchange', applyScale)
  }

  return game
}

export function destroyEngine(game) {
  if (!game) return
  if (typeof game.__scaleCleanup === 'function') game.__scaleCleanup()
  game.destroy(true)
}

// ---------------------------------------------------------------------------
// Scene create
// ---------------------------------------------------------------------------
function sceneCreate(gameState) {
  drawTable(this)

  const isRejoin = !!gameState?.game?.ball_state
  const isOnline = gameState?.mode === 'online'
  const userId   = gameState?.user?.id
  const game     = gameState?.game

  if (isRejoin && game?.ball_state) {
    rehydrateBalls(this, game.ball_state)
  } else if (typeof window !== 'undefined' && window.location?.search?.includes('testrack=1')) {
    createTestRack(this)
  } else {
    createBalls(this)
    // Allow player to place cue ball in kitchen before the opening break
    respawnCueBall(this)
  }

  const myTurn = isOnline ? game?.current_turn === userId : true

  this.registry.set('myTurn',               myTurn)
  this.registry.set('ballsWereMoving',      false)
  this.registry.set('shotFired',            false)
  this.registry.set('placingCueBall',       false)
  this.registry.set('firstCueContactLabel', null)
  this.registry.set('firstContactMade',     false)
  this.registry.set('railHitAfterContact',  false)
  this.registry.set('pocketedThisTurn',     [])
  this.registry.set('foul',                 false)
  this.registry.set('gameResult',           null)
  this.registry.set('calledPocket',         null)
  this.registry.set('needsTypeChoice',      false)
  this.registry.set('mode',                 gameState?.mode || 'offline')
  this.registry.set('gameId',               game?.id || null)
  this.registry.set('userId',               userId || null)
  this.registry.set('opponentId',           isOnline
    ? (game?.player1_id === userId ? game?.player2_id : game?.player1_id)
    : null
  )
  this.registry.set('wrongFirstContact', false)

  this.registry.set('pendingResult', null)

  // Whether the opening break shot has been taken (prevents assigning types on the break)
  this.registry.set('breakTaken', false)

  if (isRejoin && game?.my_type) {
    this.registry.set('myType',  game.my_type)
    this.registry.set('oppType', game.my_type === 'solid' ? 'stripe' : 'solid')
  } else {
    this.registry.set('myType',  null)
    this.registry.set('oppType', null)
  }

  // If ?testrack=1 is present, force types so pot/foul rules are active
  if (typeof window !== 'undefined' && window.location?.search?.includes('testrack=1')) {
    this.registry.set('myType',  'solid')
    this.registry.set('oppType', 'stripe')
  }

setupCue(this, (angle, power) => {
  // Block shooting while placing cue ball
  if (this.registry.get('placingCueBall')) return

  // Block shooting while waiting for pocket call on 8-ball
  const gs = useGameStore.getState()
  if (gs?.selectingPocket) return

  if (typeof this._cueBallPlacementCleanup === 'function') {
    this._cueBallPlacementCleanup()
    this._cueBallPlacementCleanup = null
  }
  if (isOnline) return
})

  if (typeof window !== 'undefined') {
    window.__runPoolCollisionDiagnostics = () => startCollisionDiagnostics(this)
  }

  const runAutoDiag =
    !isOnline && (
      gameState?.debugAutoShots === true ||
      (typeof window !== 'undefined' && window.location?.search?.includes('pooldiag=1')) ||
      (typeof window !== 'undefined' && window.localStorage?.getItem('pool:autoDiag') === '1')
    )

  if (runAutoDiag) startCollisionDiagnostics(this)
}

// ---------------------------------------------------------------------------
// Scene update — pure JS physics, no Matter
// ---------------------------------------------------------------------------
function sceneUpdate() {
  const balls = this.registry.get('balls') || []

  // Reset per-frame collision tags
  balls.forEach(b => {
    b._collidedWith = null
    b._railHit      = false
  })

  // Run physics step (friction, movement, rail bounce, ball-ball collision)
  stepPhysics(balls)

  // ---- First contact + rail tracking (replaces Matter collision events) ----
  if (this.registry.get('shotFired')) {
    balls.forEach(b => {
      if (b._railHit && this.registry.get('firstContactMade')) {
        this.registry.set('railHitAfterContact', true)
      }
    })

    balls.forEach(b => {
      if (!b._collidedWith) return
      if (b.label === 'cue' && b._collidedWith) {
        registerFirstCueContact(this, b._collidedWith)
      }
      if (b._collidedWith === 'cue') {
        registerFirstCueContact(this, b.label)
      }
    })
  }

  // Sync graphics
  syncBallGraphics(this)

  // Pocket detection
  checkPockets(this, (ball) => {
    ball.pocketed = true
    ball.vx = 0
    ball.vy = 0
    if (ball.gfx) ball.gfx.setVisible(false)
    handlePocket(this, ball)
  })

  // Turn-end detection
  const moving    = areBallsMoving(this)
  const wasMoving = this.registry.get('ballsWereMoving')
  const shotFired = this.registry.get('shotFired')

  if (shotFired && wasMoving && !moving) {
    const diag = this.registry.get('__collisionDiag')
    if (diag?.enabled) {
      finalizeDiagnosticShot(this)
      this.registry.set('ballsWereMoving', false)
      this.registry.set('shotFired',       false)
      queueNextDiagnosticShot(this)
      return
    }

    this.registry.set('ballsWereMoving', false)
    this.registry.set('shotFired',       false)

    // 8-ball was pocketed this shot — resolve immediately, skip turn-end foul logic
    const pending = this.registry.get('pendingResult')
    if (pending) {
      this.registry.set('pendingResult', null)
      this.registry.set('gameResult', pending)
      if (onGameOverCb) onGameOverCb(pending)
      return
    }

    handleTurnEnd(this)
    return
  }

  if (shotFired && moving) {
    this.registry.set('ballsWereMoving', true)
  }
}

// ---------------------------------------------------------------------------
// Pocket handler
// ---------------------------------------------------------------------------
function handlePocket(scene, ball) {
  if (scene.registry.get('gameResult')) return

  const pocketedThisTurn = scene.registry.get('pocketedThisTurn') || []
  pocketedThisTurn.push(ball)
  scene.registry.set('pocketedThisTurn', pocketedThisTurn)

  if (onPocketCb) onPocketCb(ball)
  if (ball.type === 'cue') return

  if (ball.type === '8ball') {
    const myType  = scene.registry.get('myType')
    const balls   = scene.registry.get('balls') || []
    const myTurn  = scene.registry.get('myTurn')
    const oppType = myType === 'solid' ? 'stripe' : 'solid'

    if (!myType) {
      scene.registry.set('pendingResult', 'loss')
      return
    }

    const actualPocketIdx = POCKET.positions.reduce((best, [px, py], i) => {
      const d = Math.hypot(ball.x - px, ball.y - py)
      return d < best.d ? { i, d } : best
    }, { i: -1, d: Infinity }).i

    const shooterType  = myTurn ? myType : oppType
    const shooterBalls = balls.filter(b => b.type === shooterType)
    const allCleared   = shooterBalls.every(b => b.pocketed)

    if (!allCleared) {
      scene.registry.set('pendingResult', myTurn ? 'loss' : 'win')
      return
    }

    const calledPocket = scene.registry.get('calledPocket')
    if (calledPocket === null || calledPocket === undefined) {
      scene.registry.set('pendingResult', myTurn ? 'loss' : 'win')
      return
    }

    const result = actualPocketIdx === calledPocket ? 'win' : 'loss'
    scene.registry.set('pendingResult', myTurn ? result : (result === 'win' ? 'loss' : 'win'))
  }
}

// ---------------------------------------------------------------------------
// Turn end
// ---------------------------------------------------------------------------
function handleTurnEnd(scene) {
  scene.registry.set('foul', false)
  // Clear any previous called pocket at the start of a new turn
  scene.registry.set('calledPocket', null)
  useGameStore.setCalledPocket(null)
  useGameStore.setSelectingPocket(false)

  const pocketedThisTurn     = scene.registry.get('pocketedThisTurn') || []
  const firstContactMade     = scene.registry.get('firstContactMade')
  const railHitAfterContact  = scene.registry.get('railHitAfterContact')
  const firstCueContactLabel = scene.registry.get('firstCueContactLabel')
  const currentMyType        = scene.registry.get('myType')
  const currentOppType       = scene.registry.get('oppType')
  const currentlyMine        = scene.registry.get('myTurn')

  scene.registry.set('pocketedThisTurn',    [])
  resetCue(scene)
  scene.registry.set('firstContactMade',     false)
  scene.registry.set('railHitAfterContact',  false)
  scene.registry.set('firstCueContactLabel', null)

  const objectBalls = pocketedThisTurn.filter(b => b.type !== 'cue')
  const scratched   = pocketedThisTurn.some(b => b.type === 'cue')
  const expectedType = currentlyMine ? currentMyType : currentOppType

  if (scratched) {
    scene.registry.set('foul', true)
    switchTurn(scene)
    respawnCueBall(scene, () => notify(scene, { switched: true, foul: true, ballInHand: true }))
    return
  }

  if (!firstContactMade) {
    scene.registry.set('foul', true)
    switchTurn(scene)
    respawnCueBall(scene, () => notify(scene, { switched: true, foul: true, ballInHand: true }))
    return
  }

  if (firstContactMade && !railHitAfterContact && objectBalls.length === 0) {
    scene.registry.set('foul', true)
    switchTurn(scene)
    respawnCueBall(scene, () => notify(scene, { switched: true, foul: true, ballInHand: true }))
    return
  }

  scene.registry.set('foul', false)

  if (expectedType) {
    if (!firstCueContactLabel) {
      scene.registry.set('foul', true)
      switchTurn(scene)
      respawnCueBall(scene, () => notify(scene, { switched: true, foul: true, ballInHand: true }))
      return
    }

    const balls     = scene.registry.get('balls') || []
    const firstBall = balls.find(b => b.label === firstCueContactLabel)
    const firstType = firstBall?.type

    if (!firstType) {
      scene.registry.set('foul', true)
      switchTurn(scene)
      respawnCueBall(scene, () => notify(scene, { switched: true, foul: true, ballInHand: true }))
      return
    }

    let firstContactFoul = false
    if (firstType === '8ball') {
      const shooterBalls = balls.filter(b => b.type === expectedType)
      firstContactFoul   = !shooterBalls.every(b => b.pocketed)
    } else if (firstType !== expectedType) {
      firstContactFoul = true
    }

    if (firstContactFoul) {
      scene.registry.set('foul', true)
      switchTurn(scene)
      respawnCueBall(scene, () => notify(scene, { switched: true, foul: true, ballInHand: true }))
      return
    }
  }

  if (objectBalls.length === 0) {
    switchTurn(scene)
    notify(scene, { switched: true, foul: false })
    return
  }

  // ── Mark break as taken after first shot ──
  const breakTaken = scene.registry.get('breakTaken')
  if (!breakTaken) {
    scene.registry.set('breakTaken', true)   // ← flips AFTER this break resolves
    if (objectBalls.length === 0) {
      switchTurn(scene)
      notify(scene, { switched: true, foul: false })
    } else {
      // Pocketed on the break — keep turn but no type assigned
      notify(scene, { switched: false, foul: false })
    }
    return  // ← exits before the type-assignment block below
  }

  let assignedType = null
  const myType     = currentMyType
  const myTurn     = currentlyMine

  if (!myType) {
    const hasSolid  = objectBalls.some(b => b.type === 'solid')
    const hasStripe = objectBalls.some(b => b.type === 'stripe')

    if (hasSolid && hasStripe) {
      const first = objectBalls[0]
      if (first && first.type) {
        assignedType = myTurn ? first.type : (first.type === 'solid' ? 'stripe' : 'solid')
        scene.registry.set('myType',  assignedType)
        scene.registry.set('oppType', assignedType === 'solid' ? 'stripe' : 'solid')
      }
    } else if (hasSolid) {
      assignedType = myTurn ? 'solid' : 'stripe'
      scene.registry.set('myType',  assignedType)
      scene.registry.set('oppType', assignedType === 'solid' ? 'stripe' : 'solid')
    } else if (hasStripe) {
      assignedType = myTurn ? 'stripe' : 'solid'
      scene.registry.set('myType',  assignedType)
      scene.registry.set('oppType', assignedType === 'stripe' ? 'solid' : 'stripe')
    }
  }

  const finalMyType       = scene.registry.get('myType')
  const finalMine         = currentlyMine
  const finalExpectedType = finalMine ? finalMyType : scene.registry.get('oppType')
  const myBallsIn         = finalExpectedType
    ? objectBalls.filter(b => b.type === finalExpectedType)
    : objectBalls.filter(b => b.type === 'solid' || b.type === 'stripe')

  // ── Check if all my balls are now cleared — prompt pocket call for 8-ball ──
  if (finalMine && finalMyType) {
    const allBalls   = scene.registry.get('balls') || []
    const myRemaining = allBalls.filter(b => b.type === finalMyType && !b.pocketed)
    if (myRemaining.length === 0) {
      // Last ball just went in — open pocket selector, block shooting until chosen
      useGameStore.setSelectingPocket(true)
      useGameStore.setCalledPocket(null)
      scene.registry.set('calledPocket', null)
    }
  }
  // ── end pocket call ──

  if (myBallsIn.length > 0) {
    notify(scene, { switched: false, foul: false, assignedType })
  } else {
    switchTurn(scene)
    notify(scene, { switched: true, foul: false, assignedType })
  }
}
function switchTurn(scene) {
  scene.registry.set('myTurn', !scene.registry.get('myTurn'))
}

function notify(scene, payload) {
  const ballState     = getBallState(scene)
  const mode          = scene.registry.get('mode')
  const gameId        = scene.registry.get('gameId')
  const userId        = scene.registry.get('userId')
  const opponentId    = scene.registry.get('opponentId')
  const myTurnNow     = !!scene.registry.get('myTurn')
  const engineMyType  = scene.registry.get('myType')
  const engineOppType = scene.registry.get('oppType')

  if (mode === 'online' && gameId && userId && opponentId) {
    const nextTurnPlayerId = myTurnNow ? userId : opponentId
    import('../socket/client').then(({ sendTurnComplete }) => {
      sendTurnComplete(gameId, ballState, nextTurnPlayerId)
    })
  }

  if (onTurnEndCb) {
    onTurnEndCb({
      ...payload,
      ballState,
      myTurn:  myTurnNow,
      myType:  engineMyType,
      oppType: engineOppType,
    })
  }
}

// ---------------------------------------------------------------------------
// Cue ball placement
// ---------------------------------------------------------------------------
function isValidCuePlacement(scene, cueBall, x, y) {
  const balls = scene.registry.get('balls') || []

  for (const b of balls) {
    if (b === cueBall)   continue
    if (b.pocketed)      continue
    const minDist = BALL.radius * 2 + 1
    if (Math.hypot(x - b.x, y - b.y) < minDist) return false
  }

  for (const [px, py] of POCKET.positions) {
    if (Math.hypot(x - px, y - py) < POCKET.radius - 2) return false
  }

  return true
}

function respawnCueBall(scene, onPlaced) {
  const balls   = scene.registry.get('balls') || []
  const cueBall = balls.find(b => b.label === 'cue')
  if (!cueBall) return
  cueBall.vx       = 0
  cueBall.vy       = 0
  cueBall.pocketed = false

  // Make cue ball visible so the player can click it to pick up
  if (cueBall.gfx) cueBall.gfx.setVisible(true)

  // Mark placing so physics/step logic can ignore the cue while it's being positioned
  cueBall._placing = true

  scene.registry.set('placingCueBall',  true)
  scene.registry.set('shotFired',       false)
  scene.registry.set('ballsWereMoving', false)

  const breakTaken  = scene.registry.get('breakTaken')
    const maxX        = breakTaken ? TABLE.playX2 - BALL.radius : TABLE.playX1 + (TABLE.playX2 - TABLE.playX1) * 0.25
  const clampToTable = (x, y) => ({
    x: Math.max(TABLE.playX1 + BALL.radius, Math.min(maxX, x)),
    y: Math.max(TABLE.playY1 + BALL.radius, Math.min(TABLE.playY2 - BALL.radius, y)),
  })

  // Place at a default valid position but keep invisible until drag starts
  cueBall.x = TABLE.width * 0.25
  cueBall.y = TABLE.height * 0.5
  if (cueBall.gfx) cueBall.gfx.setPosition(cueBall.x, cueBall.y)

  let dragging     = false
  let lastValidPos = { x: cueBall.x, y: cueBall.y }

  const updateTint = (valid) => {
    if (cueBall.gfx) cueBall.gfx.setAlpha(valid ? 1 : 0.45)
  }

  const cleanup = () => {
    scene.input.off('pointerdown', downHandler)
    scene.input.off('pointermove', moveHandler)
    scene.input.off('pointerup',   upHandler)
    if (cueBall.gfx) { cueBall.gfx.setAlpha(1); cueBall.gfx.setVisible(true) }
    cueBall._placing = false
    scene.registry.set('kitchenOnly', false)
  }

  const downHandler = (ptr) => {
    // Only start drag if clicking on or near the cue ball
    if (Math.hypot(ptr.x - cueBall.x, ptr.y - cueBall.y) > BALL.radius * 3) return
    dragging = true
    scene.registry.set('placingCueBall', true)

    // Optional: indicate kitchen-only placement when break hasn't been taken
    scene.registry.set('kitchenOnly', !scene.registry.get('breakTaken'))
  }

  const moveHandler = (ptr) => {
    if (!dragging) return
    const pos = clampToTable(ptr.x, ptr.y)
    cueBall.x = pos.x
    cueBall.y = pos.y
    if (cueBall.gfx) cueBall.gfx.setPosition(pos.x, pos.y)
    updateTint(isValidCuePlacement(scene, cueBall, pos.x, pos.y))
  }

  const upHandler = (ptr) => {
    if (!dragging) return
    dragging = false

    const pos   = clampToTable(ptr.x, ptr.y)
    const valid = isValidCuePlacement(scene, cueBall, pos.x, pos.y)

    if (valid) {
      cueBall.x = pos.x
      cueBall.y = pos.y
      cueBall.vx = 0
      cueBall.vy = 0
      if (cueBall.gfx) { cueBall.gfx.setPosition(pos.x, pos.y); cueBall.gfx.setVisible(true) }
      lastValidPos = { x: pos.x, y: pos.y }
      updateTint(true)
      scene.registry.set('placingCueBall', false)
      cueBall._placing = false
      scene.registry.set('kitchenOnly', false)
      scene._suppressShotUntil = Date.now() + 120
    } else {
      // Snap back to last valid spot (or keep hidden if never placed)
      cueBall.x = lastValidPos.x
      cueBall.y = lastValidPos.y
      if (cueBall.gfx) { cueBall.gfx.setPosition(lastValidPos.x, lastValidPos.y); cueBall.gfx.setVisible(true) }
      updateTint(true)
      scene.registry.set('placingCueBall', false)
      cueBall._placing = false
      scene.registry.set('kitchenOnly', false)
      scene._suppressShotUntil = Date.now() + 120
    }
  }

  scene.input.on('pointerdown', downHandler)
  scene.input.on('pointermove', moveHandler)
  scene.input.on('pointerup',   upHandler)

  // Called by the shoot flow — tear down drag handlers after the shot fires
  scene._cueBallPlacementCleanup = cleanup
}
// ---------------------------------------------------------------------------
// First contact tracking
// ---------------------------------------------------------------------------
function registerFirstCueContact(scene, label) {
  if (!scene.registry.get('shotFired'))        return
  if (scene.registry.get('placingCueBall'))    return
  if (!label || label === 'cushion')           return
  if (scene.registry.get('firstCueContactLabel')) return
  scene.registry.set('firstCueContactLabel', label)
  scene.registry.set('firstContactMade',     true)
}

// ---------------------------------------------------------------------------
// Diagnostics
// ---------------------------------------------------------------------------
function startCollisionDiagnostics(scene) {
  if (scene.registry.get('__collisionDiag')?.enabled) return

  const tests = [
    { name: 'center-medium', angle: 0.0,   power: 9  },
    { name: 'center-hard',   angle: 0.0,   power: 14 },
    { name: 'slight-up',     angle: -0.12, power: 12 },
    { name: 'slight-down',   angle:  0.12, power: 12 },
    { name: 'rail-glance',   angle: -0.38, power: 11 },
  ]

  const diag = { enabled: true, seedState: getBallState(scene), tests, index: 0, activeShot: null, results: [] }
  scene.registry.set('__collisionDiag', diag)
  console.log('[DIAG] Starting automated collision diagnostics…')
  queueNextDiagnosticShot(scene)
}

function queueNextDiagnosticShot(scene) {
  const diag = scene.registry.get('__collisionDiag')
  if (!diag?.enabled) return

  if (diag.index >= diag.tests.length) {
    console.log('[DIAG] Completed.')
    console.table(diag.results)
    const mismatches = diag.results.filter(r => !r.match)
    if (mismatches.length) console.warn('[DIAG] Mismatches:', mismatches)
    else console.log('[DIAG] All predictions matched.')
    return
  }

  const test = diag.tests[diag.index]

  setTimeout(() => {
    rehydrateBalls(scene, diag.seedState)
    scene.registry.set('shotFired',       false)
    scene.registry.set('ballsWereMoving', false)

    const prediction = predictCueFirstContact(scene, test.angle)

    diag.activeShot = {
      name: test.name, angle: test.angle, power: test.power,
      predictedKind: prediction.kind, predictedLabel: prediction.label,
      actualLabel: null, actualKind: null, startedAt: Date.now(),
    }

    scene.registry.set('__collisionDiag', diag)
    scene.registry.set('shotFired', true)
    shootCue(scene, test.angle, test.power)
  }, 250)
}

function finalizeDiagnosticShot(scene) {
  const diag   = scene.registry.get('__collisionDiag')
  const active = diag?.activeShot
  if (!diag?.enabled || !active) return

  const actualLabel = scene.registry.get('firstCueContactLabel') || 'none'
  const actualKind  = actualLabel === 'none' ? 'none' : actualLabel === 'cushion' ? 'wall' : 'ball'

  const match = active.predictedKind === actualKind && active.predictedLabel === actualLabel

  diag.results.push({ shot: active.name, predicted: `${active.predictedKind}:${active.predictedLabel}`, actual: `${actualKind}:${actualLabel}`, match })
  diag.activeShot = null
  diag.index += 1
  scene.registry.set('__collisionDiag', diag)
  console.log(`[DIAG] shot=${active.name} predicted=${active.predictedKind}:${active.predictedLabel} actual=${actualKind}:${actualLabel} match=${match}`)
}

function createTestRack(scene) {
  // Minimal rack: 1 solid, 1 stripe, 1 eight ball — easy to test all pot rules
  const balls = [
    { label: 'cue',    type: 'cue',    x: 200, y: 200, vx: 0, vy: 0, pocketed: false },
    { label: 'solid1', type: 'solid',  x: 500, y: 160, vx: 0, vy: 0, pocketed: false },
    { label: 'stripe1',type: 'stripe', x: 500, y: 240, vx: 0, vy: 0, pocketed: false },
    { label: '8',      type: '8ball',  x: 580, y: 200, vx: 0, vy: 0, pocketed: false },
  ]

  // Give each ball a Phaser graphics object same way createBalls does
  balls.forEach(b => {
    const gfx = scene.add.graphics()
    const color = b.type === 'cue'    ? 0xffffff
                : b.type === 'solid'  ? 0xe05c00
                : b.type === 'stripe' ? 0x0055ff
                :                       0x111111
    gfx.fillStyle(color, 1)
    gfx.fillCircle(0, 0, BALL.radius)
    if (b.type === 'stripe') {
      // White stripe band
      gfx.fillStyle(0xffffff, 1)
      gfx.fillRect(-BALL.radius, -4, BALL.radius * 2, 8)
      gfx.fillStyle(0x0055ff, 1)
      gfx.fillCircle(0, 0, BALL.radius * 0.55)
    }
    if (b.type === '8ball') {
      gfx.fillStyle(0xffffff, 1)
      gfx.fillCircle(0, 0, BALL.radius * 0.38)
    }
    gfx.x = b.x
    gfx.y = b.y
    b.gfx = gfx
  })

  scene.registry.set('balls', balls)

  // Pre-assign types so pot rules are active immediately — no break needed
  scene.registry.set('myType',  'solid')
  scene.registry.set('oppType', 'stripe')
}