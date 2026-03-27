import { TABLE, BALL, POCKET } from './constants'
import { drawTable, stepPhysics } from './physics'
import { setupCue, resetCue } from './cue'

// Cue ball starts left-centre
const CUE_START = { x: 160, y: 200 }

// Target balls lined up on the right half, spread vertically
const TARGET_BALLS = [
  { label: 'b1', x: 580, y: 110 },
  { label: 'b2', x: 580, y: 155 },
  { label: 'b3', x: 580, y: 200 },
  { label: 'b4', x: 580, y: 245 },
  { label: 'b5', x: 580, y: 290 },
]

export function diagCreate() {
  drawTable(this)

  // Build ball list: cue + targets
  const cueBall = { label: 'cue', type: 'cue', x: CUE_START.x, y: CUE_START.y, vx: 0, vy: 0, pocketed: false }
  const targets = TARGET_BALLS.map(t => ({ ...t, type: 'solid', vx: 0, vy: 0, pocketed: false }))
  const allBalls = [cueBall, ...targets]

  // Give each ball a graphics object
  const ballGfx = this.add.graphics()
  allBalls.forEach(b => { b.gfx = ballGfx }) // shared gfx, redrawn each frame

  this.registry.set('balls',           allBalls)
  this.registry.set('shotFired',       false)
  this.registry.set('placingCueBall',  false)
  this.registry.set('myTurn',          true)
  this.registry.set('myType',          null)
  this.registry.set('mode',            'offline')
  this.registry.set('ballsWereMoving', false)

  this._diagBallGfx = ballGfx
  this._diagAllBalls = allBalls
  this._diagCueBall  = cueBall
  this._diagTargets  = targets
  this._diagMoving   = false

  // Draw static ruler + target markers (drawn once, under balls)
  const staticGfx = this.add.graphics()
  drawRulerAndMarkers(this, staticGfx)

  // Overlay for hit result dots (persists)
  this._diagResultGfx = this.add.graphics()

  // Wire up real cue controls
  setupCue(this, () => {
    this._diagMoving = true
  })
}

export function diagUpdate() {
  const balls   = this._diagAllBalls
  const cueBall = this._diagCueBall

  if (this._diagMoving) {
    // Reset per-frame tags
    balls.forEach(b => { b._collidedWith = null; b._railHit = false })
    stepPhysics(balls)

    // Log first rail hit
    if (!this._diagRailLogged) {
      balls.forEach(b => {
        if (b._railHit) {
          this._diagRailLogged = true
          console.log(`[DIAG] Rail contact: ${b.label} hit rail at (${b.x.toFixed(1)}, ${b.y.toFixed(1)})`)
          // Mark rail contact point with a cyan dot
          this._diagResultGfx.fillStyle(0x00ffff, 0.9)
          this._diagResultGfx.fillCircle(b.x, b.y, 5)
        }
      })
    }

    // Log first ball-ball contact
    if (!this._diagContactLogged) {
      balls.forEach(b => {
        if (b._collidedWith && b.label === 'cue') {
          this._diagContactLogged = true
          const hit = balls.find(t => t.label === b._collidedWith)
          console.log(`[DIAG] Cue first contact: hit ${b._collidedWith} at (${hit?.x.toFixed(1) ?? '?'}, ${hit?.y.toFixed(1) ?? '?'})`)
          // Mark contact point with a green dot
          this._diagResultGfx.fillStyle(0x00ff88, 0.9)
          this._diagResultGfx.fillCircle(hit?.x ?? b.x, hit?.y ?? b.y, 5)
        }
      })
    }

    const stillMoving = balls.some(b => !b.pocketed && (Math.abs(b.vx) > 0.08 || Math.abs(b.vy) > 0.08))
    if (!stillMoving) {
      this._diagMoving = false
      this.registry.set('shotFired',       false)
      this.registry.set('ballsWereMoving', false)

      // Record where each target ended up vs its start
      this._diagTargets.forEach(t => {
        if (t.pocketed) return
        const orig = TARGET_BALLS.find(o => o.label === t.label)
        const dx = +(t.x - orig.x).toFixed(1)
        const dy = +(t.y - orig.y).toFixed(1)
        if (Math.abs(dx) > 2 || Math.abs(dy) > 2) {
          console.log(`[DIAG] ${t.label} moved: Δx=${dx} Δy=${dy} — final pos (${t.x.toFixed(1)}, ${t.y.toFixed(1)})`)
          // Yellow dot at final position
          this._diagResultGfx.fillStyle(0xffff00, 0.9)
          this._diagResultGfx.fillCircle(t.x, t.y, 5)
          // White dot at original position
          this._diagResultGfx.fillStyle(0xffffff, 0.4)
          this._diagResultGfx.fillCircle(orig.x, orig.y, 5)
        }
      })

      // Reset after 2s so you can shoot again
      this.time.delayedCall(2000, () => {
        resetDiag(this)
      })
    }
  }

  // Redraw all balls every frame
  drawBalls(this)
}

function resetDiag(scene) {
  // Put all balls back to start
  const cueBall = scene._diagCueBall
  cueBall.x = CUE_START.x; cueBall.y = CUE_START.y
  cueBall.vx = 0; cueBall.vy = 0; cueBall.pocketed = false

  TARGET_BALLS.forEach(orig => {
    const b = scene._diagTargets.find(t => t.label === orig.label)
    if (!b) return
    b.x = orig.x; b.y = orig.y
    b.vx = 0; b.vy = 0; b.pocketed = false
  })

  scene.registry.set('shotFired',       false)
  scene.registry.set('ballsWereMoving', false)
  scene._diagMoving = false
  scene._diagResultGfx.clear()
  scene._diagRailLogged    = false
  scene._diagContactLogged = false
}

function drawBalls(scene) {
  const gfx = scene._diagBallGfx
  gfx.clear()

  scene._diagAllBalls.forEach(b => {
    if (b.pocketed) return
    if (b.label === 'cue') {
      gfx.fillStyle(0xffffff, 1)
      gfx.lineStyle(1, 0xcccccc, 1)
    } else {
      gfx.fillStyle(0xe05c00, 1)
      gfx.lineStyle(1, 0xff8833, 1)
    }
    gfx.fillCircle(b.x, b.y, BALL.radius)
    gfx.strokeCircle(b.x, b.y, BALL.radius)
  })
}

function drawRulerAndMarkers(scene, gfx) {
  const { playX1, playX2, playY1, playY2, width, height } = TABLE

  // ── Horizontal ruler along top cushion ──────────────────────────────────
  // Major tick every 50px, minor every 10px
  for (let x = playX1; x <= playX2; x += 10) {
    const isMajor = (x - playX1) % 50 === 0
    const tickH   = isMajor ? 10 : 5
    gfx.lineStyle(1, 0xffffff, isMajor ? 0.6 : 0.25)
    gfx.beginPath()
    gfx.moveTo(x, playY1)
    gfx.lineTo(x, playY1 + tickH)
    gfx.strokePath()
    if (isMajor) {
      scene.add.text(x - 8, playY1 + 12, `${x}`, { fontSize: '9px', fill: '#ffffff99' })
    }
  }

  // ── Horizontal ruler along bottom cushion ───────────────────────────────
  for (let x = playX1; x <= playX2; x += 10) {
    const isMajor = (x - playX1) % 50 === 0
    const tickH   = isMajor ? 10 : 5
    gfx.lineStyle(1, 0xffffff, isMajor ? 0.6 : 0.25)
    gfx.beginPath()
    gfx.moveTo(x, playY2)
    gfx.lineTo(x, playY2 - tickH)
    gfx.strokePath()
    if (isMajor) {
      scene.add.text(x - 8, playY2 - 22, `${x}`, { fontSize: '9px', fill: '#ffffff99' })
    }
  }

  // ── Vertical ruler along left cushion ───────────────────────────────────
  for (let y = playY1; y <= playY2; y += 10) {
    const isMajor = (y - playY1) % 50 === 0
    const tickW   = isMajor ? 10 : 5
    gfx.lineStyle(1, 0xffffff, isMajor ? 0.6 : 0.25)
    gfx.beginPath()
    gfx.moveTo(playX1, y)
    gfx.lineTo(playX1 + tickW, y)
    gfx.strokePath()
    if (isMajor) {
      scene.add.text(playX1 + 12, y - 5, `${y}`, { fontSize: '9px', fill: '#ffffff99' })
    }
  }

  // ── Centre cross-hair lines (faint) ─────────────────────────────────────
  gfx.lineStyle(1, 0xffffff, 0.08)
  gfx.beginPath()
  gfx.moveTo(width / 2, playY1); gfx.lineTo(width / 2, playY2)
  gfx.moveTo(playX1, height / 2); gfx.lineTo(playX2, height / 2)
  gfx.strokePath()

  // ── Target ball start markers (white rings so you can see if they moved) ─
  TARGET_BALLS.forEach(t => {
    gfx.lineStyle(1, 0xffffff, 0.35)
    gfx.strokeCircle(t.x, t.y, BALL.radius + 2)
    // Y coordinate label next to each target
    scene.add.text(t.x + BALL.radius + 4, t.y - 5, `y:${t.y}`, { fontSize: '9px', fill: '#ffffff66' })
  })

  // ── Cue start marker ────────────────────────────────────────────────────
  gfx.lineStyle(1, 0x88ffff, 0.4)
  gfx.strokeCircle(CUE_START.x, CUE_START.y, BALL.radius + 3)
  scene.add.text(CUE_START.x - 12, CUE_START.y + 16, 'CUE', { fontSize: '9px', fill: '#88ffff88' })
}
