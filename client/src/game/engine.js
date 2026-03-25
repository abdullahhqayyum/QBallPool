import Phaser from 'phaser'
import { createBalls, rehydrateBalls, syncBallGraphics, areBallsMoving, getBallState } from './balls'
import { stepPhysics, drawTable, checkPockets } from './physics'
import { setupCue, resetCue, shootCue, predictCueFirstContact } from './cue'
import { TABLE, BALL, POCKET } from './constants'

let onGameOverCb = null
let onTurnEndCb  = null
let onPocketCb   = null

export function initEngine(containerId, gameState, onGameOver, onTurnEnd, onPocket) {
  onGameOverCb = onGameOver
  onTurnEndCb  = onTurnEnd
  onPocketCb   = onPocket

  const config = {
    type:       Phaser.AUTO,
    pixelArt:   false,
    antialias:  true,
    width:      TABLE.width,
    height:     TABLE.height,
    parent:     containerId,
    backgroundColor: '#1a6b2a',
    // No physics plugin — we run our own step
    scene: {
      create() { sceneCreate.call(this, gameState) },
      update() { sceneUpdate.call(this) },
    },
  }

  return new Phaser.Game(config)
}

export function destroyEngine(game) {
  if (game) game.destroy(true)
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
  } else {
    createBalls(this)
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

  if (isRejoin && game?.my_type) {
    this.registry.set('myType',  game.my_type)
    this.registry.set('oppType', game.my_type === 'solid' ? 'stripe' : 'solid')
  } else {
    this.registry.set('myType',  null)
    this.registry.set('oppType', null)
  }

  setupCue(this, (angle, power) => {
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
      // If the cue ball collided with something
      if (b.label === 'cue' && b._collidedWith) {
        registerFirstCueContact(this, b._collidedWith)
      }
      // If something collided with the cue ball
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
    handleTurnEnd(this)
    return
  }

  if (shotFired && moving) {
    this.registry.set('ballsWereMoving', true)
  }
}

// ---------------------------------------------------------------------------
// Pocket handler (unchanged logic)
// ---------------------------------------------------------------------------
function handlePocket(scene, ball) {
  if (scene.registry.get('gameResult')) return

  const pocketedThisTurn = scene.registry.get('pocketedThisTurn') || []
  pocketedThisTurn.push(ball)
  scene.registry.set('pocketedThisTurn', pocketedThisTurn)

  if (onPocketCb) onPocketCb(ball)
  if (ball.type === 'cue') return

  if (ball.type === '8ball') {
    const myType = scene.registry.get('myType')
    const balls  = scene.registry.get('balls') || []
    const myTurn = scene.registry.get('myTurn')

    if (!myType) {
      scene.registry.set('gameResult', 'loss')
      if (onGameOverCb) onGameOverCb('loss')
      return
    }

    const myBalls    = balls.filter(b => b.type === myType)
    const allCleared = myBalls.every(b => b.pocketed)

    if (myTurn && allCleared) {
      const calledPocket = scene.registry.get('calledPocket')
      if (calledPocket === null || calledPocket === undefined) {
        scene.registry.set('gameResult', 'loss')
        if (onGameOverCb) onGameOverCb('loss')
        return
      }
      const pocketPos = POCKET.positions[calledPocket]
      const dist = Math.hypot(ball.x - pocketPos[0], ball.y - pocketPos[1])
      const result = dist < 60 ? 'win' : 'loss'
      scene.registry.set('gameResult', result)
      if (onGameOverCb) onGameOverCb(result)
    } else {
      scene.registry.set('gameResult', myTurn ? 'loss' : 'win')
      if (onGameOverCb) onGameOverCb(myTurn ? 'loss' : 'win')
    }
  }
}

// ---------------------------------------------------------------------------
// Turn end (unchanged logic)
// ---------------------------------------------------------------------------
function handleTurnEnd(scene) {
  scene.registry.set('foul', false)

  console.log('[TURN END INPUT]', {
    myTurn:               scene.registry.get('myTurn'),
    myType:               scene.registry.get('myType'),
    oppType:              scene.registry.get('oppType'),
    firstContactMade:     scene.registry.get('firstContactMade'),
    railHitAfterContact:  scene.registry.get('railHitAfterContact'),
    firstCueContactLabel: scene.registry.get('firstCueContactLabel'),
    pocketed:             (scene.registry.get('pocketedThisTurn') || []).map(b => b.label),
  })

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

  let assignedType = null
  const myType     = currentMyType
  const myTurn     = currentlyMine

  if (!myType) {
    const hasSolid  = objectBalls.some(b => b.type === 'solid')
    const hasStripe = objectBalls.some(b => b.type === 'stripe')

    if (hasSolid && hasStripe) {
      // If both solids and stripes were pocketed on the same turn,
      // automatically assign the shooter's type based on the first
      // ball pocketed (no modal choice). The first element of
      // pocketedThisTurn preserves pocket order.
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
// Cue ball placement (updated to use plain objects)
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

  cueBall.vx = 0
  cueBall.vy = 0

  scene.registry.set('placingCueBall',  true)
  scene.registry.set('shotFired',       false)
  scene.registry.set('ballsWereMoving', false)
  cueBall.pocketed = false
  if (cueBall.gfx) cueBall.gfx.setVisible(true)

  const clampToTable = (ptr) => ({
    x: Math.max(TABLE.playX1 + BALL.radius, Math.min(TABLE.playX2 - BALL.radius, ptr.x)),
    y: Math.max(TABLE.playY1 + BALL.radius, Math.min(TABLE.playY2 - BALL.radius, ptr.y)),
  })

  let previewPos = { x: TABLE.width * 0.25, y: TABLE.height * 0.5 }
  cueBall.x = previewPos.x
  cueBall.y = previewPos.y
  if (cueBall.gfx) cueBall.gfx.setPosition(previewPos.x, previewPos.y)

  const moveHandler = (ptr) => {
    previewPos = clampToTable(ptr)
    cueBall.x  = previewPos.x
    cueBall.y  = previewPos.y
    if (cueBall.gfx) cueBall.gfx.setPosition(previewPos.x, previewPos.y)
  }

  const placeHandler = (ptr) => {
    const pos = clampToTable(ptr)
    if (!isValidCuePlacement(scene, cueBall, pos.x, pos.y)) return

    cueBall.x = pos.x
    cueBall.y = pos.y
    cueBall.vx = 0
    cueBall.vy = 0
    cueBall.pocketed = false
    if (cueBall.gfx) cueBall.gfx.setPosition(pos.x, pos.y)

    scene.registry.set('placingCueBall',  false)
    scene.registry.set('shotFired',       false)
    scene.registry.set('ballsWereMoving', false)

    scene.input.off('pointermove', moveHandler)
    scene.input.off('pointerdown', placeHandler)

    if (typeof onPlaced === 'function') onPlaced()
  }

  scene.input.on('pointermove', moveHandler)
  scene.input.on('pointerdown', placeHandler)
}

// ---------------------------------------------------------------------------
// First contact tracking (now driven from stepPhysics _collidedWith tags)
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
// Diagnostics (unchanged, works with new plain objects)
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

  // For diagnostics, read actual first contact from registry
  const actualLabel = scene.registry.get('firstCueContactLabel') || 'none'
  const actualKind  = actualLabel === 'none' ? 'none' : actualLabel === 'cushion' ? 'wall' : 'ball'

  const match = active.predictedKind === actualKind && active.predictedLabel === actualLabel

  diag.results.push({ shot: active.name, predicted: `${active.predictedKind}:${active.predictedLabel}`, actual: `${actualKind}:${actualLabel}`, match })
  diag.activeShot = null
  diag.index += 1
  scene.registry.set('__collisionDiag', diag)
  console.log(`[DIAG] shot=${active.name} predicted=${active.predictedKind}:${active.predictedLabel} actual=${actualKind}:${actualLabel} match=${match}`)
}