import Phaser from 'phaser'
import { createBalls, rehydrateBalls, syncBallGraphics, areBallsMoving, getBallState } from './balls'
import { createEightOnlyBalls } from './eightOnlyBalls'
import { stepPhysics, drawTable, checkPockets } from './physics'
import { setupCue, resetCue, shootCue, predictCueFirstContact, clientToGame } from './cue'
import { TABLE, BALL, POCKET } from './constants'
import { useGameStore } from '../store/gameStore'
import { triggerAIShot, triggerAIPlacement } from './ai'
import { remoteTargets } from '../socket/client'


let onGameOverCb = null
let onTurnEndCb  = null
let onPocketCb   = null
let _lastPositionBroadcast = 0

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
    autoFocus:       false,
    disableVisibilityChange: true,
    fps: {
      panicMax:        60,
      smoothStep:      false,
    },
    scene: {
      create() { sceneCreate.call(this, gameState) },
      update() { sceneUpdate.call(this) },
    },
  }
 const game = new Phaser.Game(config)

  // Force Phaser to never pause regardless of tab/window visibility.
  // disableVisibilityChange in config is unreliable in Phaser 3.60+,
  // so we also override it directly after construction.
  game.events.on('hidden', () => {
    if (game.loop) game.loop.wake()
  })
  game.events.on('blur', () => {
    if (game.loop) game.loop.wake()
  })
  // Belt-and-suspenders: poll every 500ms and wake the loop if it fell asleep
  const keepAliveInterval = setInterval(() => {
    try {
      if (game.loop && !game.loop.running) game.loop.wake()
    } catch (e) {}
  }, 500)
  game.__keepAliveInterval = keepAliveInterval
  // Apply CSS scaling once the canvas exists, and on every resize.
  const applyScale = () => {
    const canvas = game.canvas
    if (!canvas) return

    const vw = window.innerWidth
    const vh = window.innerHeight
    const isPortrait = vh > vw

    if (isPortrait) {
      // In portrait the wrapper div handles rotation + scale via CSS transform.
      // Set the canvas to its natural game size so the transform math is correct.
      canvas.style.width       = TABLE.width  + 'px'
      canvas.style.height      = TABLE.height + 'px'
      canvas.style.display     = 'block'
      canvas.style.margin      = '0'
      canvas.style.border      = 'none'
      canvas.style.outline     = 'none'
      canvas.style.touchAction = 'none'
    } else {
      const padding = Math.min(16, vw * 0.02)
      const HUD_H   = 62
      const maxByW  = vw - padding * 2
      const maxByH  = Math.floor((vh - HUD_H - padding * 2) / (TABLE.height / TABLE.width))
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
  if (game.__keepAliveInterval) clearInterval(game.__keepAliveInterval)
  game.destroy(true)
}
// ---------------------------------------------------------------------------
// Rewind recording + playback
// ---------------------------------------------------------------------------

/** Start fresh recording for a new shot */
export function startRecording(scene) {
  scene._rewindFrames = []
  scene._rewindRecording = true
}

/** Append one frame — called every sceneUpdate while recording */
function recordFrame(scene) {
  if (!scene._rewindRecording) return
  if (!scene.registry.get('shotFired')) return
  const balls = scene.registry.get('balls') || []
  // Store only positions — velocity not needed for visual playback
  scene._rewindFrames.push(
    balls.map(b => ({ x: b.x, y: b.y, pocketed: b.pocketed }))
  )
}

/** Discard recording on normal turn end */
export function discardRecording(scene) {
  scene._rewindFrames    = null
  scene._rewindRecording = false
}

/** Snapshot ball state before the shot for restoration after rewind */
let _preCheatSnapshot = null

export function snapshotForCheat(scene) {
  const balls = (scene.registry.get('balls') || []).map(b => ({
    label: b.label, x: b.x, y: b.y, vx: 0, vy: 0, pocketed: b.pocketed,
  }))
  _preCheatSnapshot = {
    balls,
    myTurn:         scene.registry.get('myTurn'),
    placingCueBall: !!scene.registry.get('placingCueBall'),
  }
}

/**
 * Play back recorded frames in reverse, then restore pre-shot state.
 * `onComplete` is called when the animation finishes (used to trigger confetti).
 */
export function useCheat(scene, onComplete) {
  if (!_preCheatSnapshot) return

  const frames = scene._rewindFrames || []
  scene._rewindRecording = false   // stop recording immediately
  scene._rewindFrames    = null

  // Freeze physics during rewind
  scene._rewindPlaying = true
  scene.registry.set('shotFired',       false)
  scene.registry.set('ballsWereMoving', false)

  const reversed   = frames.slice().reverse()
  const totalFrames = reversed.length
  if (totalFrames === 0) {
    _finishCheat(scene, onComplete)
    return
  }

  const DURATION_MS = Math.min(700, Math.max(300, totalFrames * 6))
  const startTime   = performance.now()
  const balls       = scene.registry.get('balls') || []

  function step(now) {
    if (!scene._rewindPlaying) return  // cancelled

    const elapsed  = now - startTime
    const progress = Math.min(1, elapsed / DURATION_MS)
    // Ease-in so it starts fast and slows as it reaches origin
    const eased    = 1 - Math.pow(1 - progress, 2)
    const frameIdx = Math.min(totalFrames - 1, Math.floor(eased * totalFrames))
    const snap     = reversed[frameIdx]

    balls.forEach((b, i) => {
      if (!snap[i]) return
      b.x = snap[i].x
      b.y = snap[i].y
      b.vx = 0
      b.vy = 0
      if (b.gfx && !b.pocketed) b.gfx.setPosition(b.x, b.y)
    })

    if (progress < 1) {
      requestAnimationFrame(step)
    } else {
      _finishCheat(scene, onComplete)
    }
  }

  requestAnimationFrame(step)
}

function _finishCheat(scene, onComplete) {
  const { balls: snap, myTurn, placingCueBall: hadBallInHand } = _preCheatSnapshot
  _preCheatSnapshot    = null
  scene._rewindPlaying = false

  // Full state restore
  rehydrateBalls(scene, snap)

  scene.registry.set('shotFired',            false)
  scene.registry.set('ballsWereMoving',      false)
  scene.registry.set('firstContactMade',     false)
  scene.registry.set('firstCueContactLabel', null)
  scene.registry.set('railHitAfterContact',  false)
  scene.registry.set('pocketedThisTurn',     [])
  scene.registry.set('foul',                 false)
  scene.registry.set('myTurn',               myTurn)

  scene.registry.set('pendingResult',        null)

  const cheatPlayer = myTurn ? 'p1' : 'p2'
  const cheatUsedMap = { ...(scene.registry.get('cheatUsedMap') || {}), [cheatPlayer]: true }
  scene.registry.set('cheatUsedMap',   cheatUsedMap)
  scene.registry.set('cheatAvailable', false)

  useGameStore.setCheatUsed(cheatPlayer)
  useGameStore.setCheatAvailable(false)

  resetCue(scene)

  // If the player had ball-in-hand before the shot, restore it
  if (hadBallInHand) {
    respawnCueBall(scene, null, false)
  }

  if (onComplete) onComplete()
}

// ---------------------------------------------------------------------------
// Scene create
// ---------------------------------------------------------------------------
function sceneCreate(gameState) {
  console.log('[sceneCreate] mode:', gameState?.mode)
  console.log('[sceneCreate] ball_state:', gameState?.game?.ball_state)
  console.log('[sceneCreate] game.id:', gameState?.game?.id)
  drawTable(this)

  const isRejoin = !!gameState?.game?.ball_state
  const isOnline = gameState?.mode === 'online'
  const userId   = gameState?.user?.id
  const game     = gameState?.game

  if (isRejoin && game?.ball_state) {
    rehydrateBalls(this, game.ball_state)
  } else if (typeof window !== 'undefined' && window.location?.search?.includes('eightonly=1')) {
    createEightOnlyBalls(this)
  } else if (typeof window !== 'undefined' && window.location?.search?.includes('testrack=1')) {
    createTestRack(this)
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

  this.registry.set('cheatUsedMap',   {})   // { p1: bool, p2: bool }
  this.registry.set('cheatAvailable', false)
  this._rewindFrames    = null
  this._rewindRecording = false
  this._rewindPlaying   = false
  this.registry.set('pendingResult', null)

if (isRejoin && game?.my_type) {
  this.registry.set('myType',  game.my_type)
  this.registry.set('oppType', game.my_type === 'solid' ? 'stripe' : 'solid')
} else {
  this.registry.set('myType',  null)
  this.registry.set('oppType', null)
  this.registry.set('breakDone', false)
  this.registry.set('postBreakConfirm', false)
}

  // If ?testrack=1 is present, force types so pot/foul rules are active
  // For eightonly test — assign types based on who the local player is
  if (typeof window !== 'undefined' && window.location?.search?.includes('eightonly=1')) {
    const isP1 = !isOnline || game?.player1_id === userId
    this.registry.set('myType',    isP1 ? 'solid' : 'stripe')
    this.registry.set('oppType',   isP1 ? 'stripe' : 'solid')
    this.registry.set('breakDone', true)
  }

  if (typeof window !== 'undefined' && window.location?.search?.includes('testrack=1')) {
    this.registry.set('myType',  'solid')
    this.registry.set('oppType', 'stripe')
    this.registry.set('breakDone', true)   // skip break rules in test mode
  }

  // Decide if AI should go first (coin flip) and respawn cue ball AFTER registry state is set
  const aiGoesFirst = gameState?.mode === 'ai' && Math.random() < 0.5
  if (aiGoesFirst) {
    this.registry.set('myTurn', false)
  }

  if (!isRejoin && !(typeof window !== 'undefined' && window.location?.search?.includes('testrack=1'))) {
    // Allow player (or AI) to place cue ball in kitchen before the opening break
    respawnCueBall(this, null, true)
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
  // Don't run physics or logic while rewind animation is playing
  if (this._rewindPlaying) return

  // Interpolate remote ball positions when spectating opponent's turn
  // Interpolate remote ball positions when spectating opponent's turn
  if (this.registry.get('mode') === 'online' && !this.registry.get('myTurn')) {
    const sceneBalls = this.registry.get('balls') || []
    sceneBalls.forEach(ball => {
      if (ball.pocketed) return
      const t = remoteTargets[ball.label]
      if (!t) return
      ball.x += (t.x - ball.x) * 0.18
      ball.y += (t.y - ball.y) * 0.18
      if (ball.gfx) ball.gfx.setPosition(ball.x, ball.y)
    })
  }
  // Record frame if a shot is in progress
  recordFrame(this)

  const balls = this.registry.get('balls') || []

  // Reset per-frame collision tags
  balls.forEach(b => {
    b._collidedWith = null
    b._railHit      = false
  })

  // Run physics step (friction, movement, rail bounce, ball-ball collision)
  stepPhysics(balls)

    // (break handling now uses `breakShotsRemaining` counter)

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
  // ── Continuously gate shooting when 8-ball is the only ball left ──
  const mt = this.registry.get('myType')
  const allBalls = this.registry.get('balls') || []
  const myTurn = this.registry.get('myTurn')
  const oppType = mt === 'solid' ? 'stripe' : mt === 'stripe' ? 'solid' : null
  const shooterType = myTurn ? mt : oppType

  if (shooterType && myTurn) {
    const shooterBalls  = allBalls.filter(b => b.type === shooterType)
    const eightBall     = allBalls.find(b => b.type === '8ball')
    const allCleared    = shooterType && (shooterBalls.length === 0 || shooterBalls.every(b => b.pocketed))
    const eightStillUp  = eightBall && !eightBall.pocketed
    const alreadyCalled = this.registry.get('calledPocket') !== null &&
                          this.registry.get('calledPocket') !== undefined

    if (myTurn && allCleared && eightStillUp && !alreadyCalled) {
      this.registry.set('selectingPocket', true)
      useGameStore.setSelectingPocket(true)
    }
  }

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
    // Balls stopped — close cheat window and discard recording
    useGameStore.setCheatAvailable(false)
    this.registry.set('cheatAvailable', false)
    discardRecording(this)

    const diag = this.registry.get('__collisionDiag')
    if (diag?.enabled) {
      finalizeDiagnosticShot(this)
      this.registry.set('ballsWereMoving', false)
      this.registry.set('shotFired',       false)
      queueNextDiagnosticShot(this)
      return
    }

    // ── Settling guard: require several consecutive still frames before ending ──
    // This prevents the turn ending (and game-over firing) on the very frame
    // a ball disappears into a pocket. Give physics a few frames to settle.
    const stillFrames = (this._stillFrameCount || 0) + 1
    this._stillFrameCount = stillFrames
    if (stillFrames < 3) return

    this._stillFrameCount = 0
    this.registry.set('ballsWereMoving', false)
    this.registry.set('shotFired',       false)

    const pending = this.registry.get('pendingResult')
    // AFTER:
    if (pending) {
      console.log('[sceneUpdate] consuming pendingResult:', pending, 'myTurn:', this.registry.get('myTurn'))
      this.registry.set('pendingResult', null)
      this.registry.set('gameResult', pending)
      notifyGameOver(this, pending)
      return
    }

    handleTurnEnd(this)
    return
  }

  if (shotFired && moving) {
    // Reset still-frame counter when balls resume moving
    this._stillFrameCount = 0
    this.registry.set('ballsWereMoving', true)

    // Stream positions to opponent in online mode (~20fps)
    const mode = this.registry.get('mode')
    if (mode === 'online' && this.registry.get('myTurn')) {
      const now = Date.now()
      if (now - _lastPositionBroadcast > 50) {
        _lastPositionBroadcast = now
        const balls = this.registry.get('balls') || []
        const positions = balls.map(b => ({
          label:    b.label,
          x:        b.x,
          y:        b.y,
          pocketed: b.pocketed,
        }))
        import('../socket/client').then(({ sendBallPositions }) => {
          sendBallPositions(positions)
        })
      }
    }
    // Open cheat window once balls are moving (only if not yet used)
    const isMyTurnForCheat = this.registry.get('myTurn')
    const modeForCheat = this.registry.get('mode')
    const cheatAllowedThisTurn = modeForCheat === 'offline' || isMyTurnForCheat
    const cheatUsedMap    = this.registry.get('cheatUsedMap') || {}
    const currentPlayer   = this.registry.get('myTurn') ? 'p1' : 'p2'
    const thisPlayerUsed  = !!cheatUsedMap[currentPlayer]

    if (!thisPlayerUsed && !this.registry.get('cheatAvailable') && cheatAllowedThisTurn) {
      this.registry.set('cheatAvailable', true)
      useGameStore.setCheatAvailable(true)
    }
  }

  // ── AI turn trigger ──
  // replace the AI trigger block:
  // ── AI turn trigger ──
  const mode = this.registry.get('mode')
  if (mode === 'ai' && !this._aiThinking) {
    const aiTurn = !this.registry.get('myTurn')   // ← read fresh, not cached
    if (aiTurn) {
      if (this.registry.get('placingCueBall')) {
        triggerAIPlacement(this)
      } else if (
        !this.registry.get('shotFired') &&
        !this.registry.get('ballsWereMoving')
      ) {
        triggerAIShot(this)
      }
    }
  }
  // ── end AI trigger ──
  // ── end AI trigger ──
}

// ---------------------------------------------------------------------------
// Pocket handler
// ---------------------------------------------------------------------------
function handlePocket(scene, ball) {
  console.log('[handlePocket] ball:', ball.type, 'existingPendingResult:', scene.registry.get('pendingResult'))
  if (scene.registry.get('gameResult')) return

  const pocketedThisTurn = scene.registry.get('pocketedThisTurn') || []
  pocketedThisTurn.push(ball)
  scene.registry.set('pocketedThisTurn', pocketedThisTurn)

  if (onPocketCb) onPocketCb(ball)
  if (ball.type === 'cue') return

  if (ball.type === '8ball') {
    const myType  = scene.registry.get('myType')
    const balls   = scene.registry.get('balls') || []
    const myTurn  = scene.registry.get('myTurn')   // true = player1's turn
    const oppType = myType === 'solid' ? 'stripe' : 'solid'
    // Diagnostic logs requested by user: print key 8-ball conditions early
    try {
      const _calledPocket    = scene.registry.get('calledPocket')
      const _shooterType     = myTurn ? myType : oppType
      const _shooterBalls    = balls.filter(b => b.type === _shooterType)
      const _allCleared      = _shooterBalls.length === 0 || _shooterBalls.every(b => b.pocketed)
      const _actualPocketIdx = POCKET.positions.reduce((best, [px, py], i) => {
        const d = Math.hypot(ball.x - px, ball.y - py)
        return d < best.d ? { i, d } : best
      }, { i: -1, d: Infinity }).i
      console.log('[8ball] myTurn:', myTurn, 'myType:', myType, 'shooterType:', _shooterType)
      console.log('[8ball] allCleared:', _allCleared, 'shooterBalls:', _shooterBalls.length)
      console.log('[8ball] calledPocket:', _calledPocket, 'actualPocket:', _actualPocketIdx)
      console.log('[8ball] ball position:', Math.round(ball.x), Math.round(ball.y))
    } catch (e) {
      console.warn('[8ball] diagnostic log failed', e)
    }

    if (!myType) {
      // 8-ball potted before types assigned — shooter always loses
      scene.registry.set('pendingResult', myTurn ? 'loss' : 'win')
      return
    }

    const actualPocketIdx = POCKET.positions.reduce((best, [px, py], i) => {
      const d = Math.hypot(ball.x - px, ball.y - py)
      return d < best.d ? { i, d } : best
    }, { i: -1, d: Infinity }).i

    const calledPocket = scene.registry.get('calledPocket')
    console.log('[8ball pocketed] calledPocket:', calledPocket, 'actualPocket:', actualPocketIdx, 'ball pos:', Math.round(ball.x), Math.round(ball.y))
    console.log('[8ball pocketed] pocket positions:', POCKET.positions.map(([x,y],i) => `${i}:(${Math.round(x)},${Math.round(y)})`).join(' '))

    const shooterType  = myTurn ? myType : oppType
    const shooterBalls = balls.filter(b => b.type === shooterType)
    // A ball pocketed this same turn counts as cleared — check ALL of that type
    const allCleared   = shooterBalls.length === 0 || shooterBalls.every(b => b.pocketed)

    if (!allCleared) {
      // Shooter potted 8-ball too early — shooter loses
      scene.registry.set('pendingResult', myTurn ? 'loss' : 'win')
      return
    }

    if (calledPocket === null || calledPocket === undefined) {
      // No pocket was called — shooter loses
      scene.registry.set('pendingResult', myTurn ? 'loss' : 'win')
      return
    }

    // Correct pocket called and potted — shooter wins; wrong pocket — shooter loses
    const shooterWins = actualPocketIdx === calledPocket
    console.log('[8ball result] shooterWins:', shooterWins, 'myTurn:', myTurn, 'pendingResult will be:', myTurn ? (shooterWins ? 'win' : 'loss') : (shooterWins ? 'loss' : 'win'))
    // pendingResult is ALWAYS from player1's perspective (myTurn=true means p1 shot)
    scene.registry.set('pendingResult',
      myTurn
        ? (shooterWins ? 'win' : 'loss')
        : (shooterWins ? 'loss' : 'win')   // p2 won means p1 lost
    )
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

  const handleFoulBallInHand = () => {
    const isOnline = scene.registry.get('mode') === 'online'
    if (isOnline) {
      respawnCueBall(scene, null)  // moves cue to center first
      scene.registry.set('placingCueBall', true)
      notify(scene, { switched: true, foul: true, ballInHand: true })  // ball state now has valid position
    } else {
      respawnCueBall(scene, () => notify(scene, { switched: true, foul: true, ballInHand: true }))
    }
  }
  scene.registry.set('pocketedThisTurn',    [])
  resetCue(scene)
  scene.registry.set('firstContactMade',     false)
  scene.registry.set('railHitAfterContact',  false)
  scene.registry.set('firstCueContactLabel', null)

  const objectBalls = pocketedThisTurn.filter(b => b.type !== 'cue')
  const scratched   = pocketedThisTurn.some(b => b.type === 'cue')
  const expectedType = currentlyMine ? currentMyType : currentOppType

  console.log('[turnEnd] firstContactMade:', firstContactMade, 'scratched:', scratched, 'breakDone:', scene.registry.get('breakDone'), 'objectBalls:', objectBalls.length)

  // ── Break guard — skip foul logic for the opening shot, but DO assign types ──
  const breakDone = scene.registry.get('breakDone')
  if (!breakDone) {
  scene.registry.set('breakDone', true)

  if (scratched) {
    switchTurn(scene)
    handleFoulBallInHand()
    return
  }

  if (objectBalls.length === 0) {
    // Potted nothing on break — next player gets postBreakConfirm window
    scene.registry.set('postBreakConfirm', true)
    switchTurn(scene)
    notify(scene, { switched: true, foul: false })
    return
  }

  // Potted something on break — table stays open, NO type assigned.
  // Breaker keeps their turn but postBreakConfirm is NOT set because
  // the breaker already took their confirmation implicitly by continuing.
  // Types will be assigned on the next pot by whoever pots first.
  notify(scene, { switched: false, foul: false })
  return
}
    // ── end break guard ──
    // ── end break guard ──

    if (scratched) {
      scene.registry.set('foul', true)
      switchTurn(scene)
      handleFoulBallInHand()
      return
    }

    // Foul: cue ball didn't contact anything at all
    if (!firstContactMade) {
      scene.registry.set('foul', true)
      switchTurn(scene)
      handleFoulBallInHand()
      return
    }

    // Foul: no ball pocketed and no rail hit after contact
    if (!railHitAfterContact && objectBalls.length === 0) {
      scene.registry.set('foul', true)
      switchTurn(scene)
      handleFoulBallInHand()
      return
    }

  scene.registry.set('foul', false)

  // Foul: hit wrong ball first (only applies once types are assigned)
  if (expectedType) {
    const balls     = scene.registry.get('balls') || []
    const firstBall = balls.find(b => b.label === firstCueContactLabel)
    const firstType = firstBall?.type

    // If the first-contact ball can't be resolved (e.g. it pocketed this
    // frame and was removed from the active list), do NOT treat it as an
    // automatic foul — fall through to normal resolution instead.
    if (firstType) {
  let firstContactFoul = false
  if (firstType === '8ball') {
    const shooterBalls = balls.filter(b => b.type === expectedType)
    // Only foul if shooter still has balls left — if none exist, 8-ball is legal
    firstContactFoul = shooterBalls.length > 0 && !shooterBalls.every(b => b.pocketed)
  } else if (firstType !== expectedType) {
    firstContactFoul = true
  }

  if (firstContactFoul) {
    scene.registry.set('foul', true)
    switchTurn(scene)
    handleFoulBallInHand()
    return
  }
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

  // ── Post-break confirmation turn ──
  // If this is the first shot after a scoreless break, the shooting player
  // keeps their turn after potting to "confirm" their group — but ONLY this once.
  const isPostBreakConfirm = scene.registry.get('postBreakConfirm')
  if (isPostBreakConfirm) {
    scene.registry.set('postBreakConfirm', false)  // consume the flag immediately

    if (objectBalls.length === 0) {
      // Potted nothing on confirmation turn — switch normally
      switchTurn(scene)
      notify(scene, { switched: true, foul: false, assignedType })
      return
    }

    // Potted something — type was just assigned above, keep turn (confirmation complete)
    notify(scene, { switched: false, foul: false, assignedType })
    return
  }
  // ── end post-break confirmation ──

  const finalMyType       = scene.registry.get('myType')
  const finalMine         = currentlyMine
  const finalExpectedType = finalMine ? finalMyType : scene.registry.get('oppType')
  const myBallsIn         = finalExpectedType
    ? objectBalls.filter(b => b.type === finalExpectedType)
    : objectBalls.filter(b => b.type === 'solid' || b.type === 'stripe')

  // Check if the current shooter just cleared all their balls — open pocket call for EITHER player
  const shooterTypeForCall = finalMine ? finalMyType : scene.registry.get('oppType')
  if (shooterTypeForCall) {
    const allBalls_ = scene.registry.get('balls') || []
    const remaining = allBalls_.filter(b => b.type === shooterTypeForCall && !b.pocketed)
    if (remaining.length === 0) {
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
  const wasMyTurn = scene.registry.get('myTurn')
  scene.registry.set('myTurn', !wasMyTurn)
  // Always wipe the called pocket on turn change — prevents stale value
  // from one player's call leaking into the next player's 8-ball check
  scene.registry.set('calledPocket', null)
  useGameStore.setCalledPocket(null)
  // Clear any stale AI thinking lock so CPU can respond immediately
  try {
    scene._aiThinking = false
  } catch (e) {}
  console.log(`[switchTurn] p1Turn was=${wasMyTurn} → now=${!wasMyTurn}`)
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
    const ballInHand = !!scene.registry.get('placingCueBall')
    // Send type assignment so the opponent's client can update their HUD
    // engineMyType is always from local player's perspective (player1)
    // engineOppType is what the opponent should set as their myType
    console.log('[notify] mode:', mode, 'ballInHand:', ballInHand, 'myTurnNow:', myTurnNow, 'myType:', engineMyType, 'oppType:', engineOppType)
    import('../socket/client').then(({ sendTurnComplete }) => {
      // Send types from absolute perspective:
      // shooterType = what the player who just shot has
      // receiverType = what the opponent has
      // myTurnNow is AFTER switchTurn, so: if it's now my turn, I was the receiver, opponent was shooter
      const shooterType   = myTurnNow ? engineOppType : engineMyType
      const receiverType  = myTurnNow ? engineMyType  : engineOppType
      sendTurnComplete(gameId, ballState, nextTurnPlayerId, ballInHand, shooterType, receiverType)
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

// Called by handleTurnEnd/handlePocket when a game-over result is resolved in online mode
function notifyGameOver(scene, result) {
  console.log('[notifyGameOver] result:', result, 'userId:', scene.registry.get('userId'))
  const mode       = scene.registry.get('mode')
  const gameId     = scene.registry.get('gameId')
  const userId     = scene.registry.get('userId')
  const myTurnNow  = !!scene.registry.get('myTurn')

  if (mode === 'online' && gameId && userId) {
    // result is from local player's perspective: 'win' | 'loss'
    const winnerId = result === 'win' ? userId : scene.registry.get('opponentId')
    import('../socket/client').then(({ sendGameOver }) => {
      sendGameOver(gameId, winnerId)
    })
  }

  if (onGameOverCb) onGameOverCb(result)
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

export function respawnCueBall(scene, onPlaced, kitchenOnly = false) {
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

  const maxX = kitchenOnly
    ? TABLE.playX1 + (TABLE.playX2 - TABLE.playX1) * 0.25
    : TABLE.playX2 - BALL.radius
  const clampToTable = (x, y) => ({
    x: Math.max(TABLE.playX1 + BALL.radius, Math.min(maxX, x)),
    y: Math.max(TABLE.playY1 + BALL.radius, Math.min(TABLE.playY2 - BALL.radius, y)),
  })
  // Place at a default valid position but keep invisible until drag starts
  // WITH THIS:
  cueBall.x = TABLE.width * 0.25
  cueBall.y = TABLE.height * 0.5
  if (cueBall.gfx) cueBall.gfx.setPosition(cueBall.x, cueBall.y)

  // ── Ball is already at a valid position — allow shooting immediately.
  // The player can still drag it to reposition, but doesn't have to.
  cueBall._placing = false
  scene.registry.set('placingCueBall', false)

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

  // WITH THIS (same logic, but re-enables dragging without re-blocking shooting):
  const downHandler = (ptr) => {
      const native = ptr.event
      const touch  = native?.changedTouches?.[0] ?? native?.touches?.[0]
      const client = touch ?? native
      const gp     = (client?.clientX !== undefined)
        ? clientToGame(scene, client.clientX, client.clientY)
        : { x: ptr.x, y: ptr.y }

      const distToBall = Math.hypot(gp.x - cueBall.x, gp.y - cueBall.y)

      // Only enter drag mode if tapping near the cue ball.
      // Tapping elsewhere = aiming — let cue.js handle it, do NOT block shooting.
      if (distToBall > BALL.radius * 3) return

      dragging = true
      // Only set placingCueBall while actively dragging, so shooting stays
      // unblocked if the player simply taps away from the ball.
      cueBall._placing = true
      scene.registry.set('placingCueBall', true)
      scene.registry.set('kitchenOnly', kitchenOnly)
    }

    const moveHandler = (ptr) => {
      if (!dragging) return

      const native = ptr.event
      const touch  = native?.changedTouches?.[0] ?? native?.touches?.[0]
      const client = touch ?? native
      const gp     = (client?.clientX !== undefined)
        ? clientToGame(scene, client.clientX, client.clientY)
        : { x: ptr.x, y: ptr.y }

      const pos = clampToTable(gp.x, gp.y)
      cueBall.x = pos.x
      cueBall.y = pos.y
      if (cueBall.gfx) cueBall.gfx.setPosition(pos.x, pos.y)
      updateTint(isValidCuePlacement(scene, cueBall, pos.x, pos.y))
    }

    const upHandler = (ptr) => {
      if (!dragging) return
      dragging = false

      const native = ptr.event
      const touch  = native?.changedTouches?.[0] ?? native?.touches?.[0]
      const client = touch ?? native
      const gp     = (client?.clientX !== undefined)
        ? clientToGame(scene, client.clientX, client.clientY)
        : { x: ptr.x, y: ptr.y }

      const pos   = clampToTable(gp.x, gp.y)
      const valid = isValidCuePlacement(scene, cueBall, pos.x, pos.y)

      if (valid) {
        cueBall.x = pos.x
        cueBall.y = pos.y
        lastValidPos = { x: pos.x, y: pos.y }
      } else {
        // Snap back to last valid position
        cueBall.x = lastValidPos.x
        cueBall.y = lastValidPos.y
      }

      cueBall.vx = 0
      cueBall.vy = 0
      if (cueBall.gfx) {
        cueBall.gfx.setPosition(cueBall.x, cueBall.y)
        cueBall.gfx.setVisible(true)
        cueBall.gfx.setAlpha(1)
      }

      // Ball is placed — stop blocking the shoot flow.
      // Player can now aim and shoot, OR tap the ball again to reposition.
      cueBall._placing = false
      scene.registry.set('placingCueBall', false)
      scene.registry.set('kitchenOnly', false)
      scene._suppressShotUntil = Date.now() + 200
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
