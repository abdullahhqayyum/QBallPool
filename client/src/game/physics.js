import { BALL, TABLE, POCKET } from './constants'

// ---------------------------------------------------------------------------
// Pure-JS physics step — called once per frame from engine.js
// No Matter.js involvement. All ball state is plain { x, y, vx, vy, ... }.
// ---------------------------------------------------------------------------

const ROLLING_FRICTION = 0.987   // velocity multiplied every frame
const MIN_SPEED        = 0.08    // below this → treat as stopped
const RESTITUTION      = 0.97    // ball-ball energy kept (near-elastic)
const RAIL_RESTITUTION = 0.75    // energy kept on rail bounce

// Maximum distance any ball travels in a single substep.
// Keeping this below BALL.radius * 0.5 means a fast ball can never
// skip through another ball in one frame — this is what prevents tunnel-through.
const MAX_STEP_DIST = BALL.radius * 0.4

export function stepPhysics(balls) {
  const active = balls.filter(b => !b.pocketed)

  // Work out how many substeps we need this frame so no ball moves more
  // than MAX_STEP_DIST per substep. Fast cue ball after a hard shot might
  // need 8-10 substeps; resting balls need only 1.
  const maxSpeed = active.reduce((m, b) => Math.max(m, Math.hypot(b.vx, b.vy)), 0)
  const substeps  = Math.max(1, Math.ceil(maxSpeed / MAX_STEP_DIST))
  const dt        = 1 / substeps

  for (let s = 0; s < substeps; s++) {
    // 1. Apply rolling friction (scaled to substep)
    const friction = Math.pow(ROLLING_FRICTION, dt)
    for (const b of active) {
      b.vx *= friction
      b.vy *= friction
      if (Math.abs(b.vx) < MIN_SPEED && Math.abs(b.vy) < MIN_SPEED) {
        b.vx = 0
        b.vy = 0
      }
    }

    // 2. Move balls by fractional step
    for (const b of active) {
      b.x += b.vx * dt
      b.y += b.vy * dt
    }

    // 3. Rail bounces
    const minX = TABLE.playX1 + BALL.radius
    const maxX = TABLE.playX2 - BALL.radius
    const minY = TABLE.playY1 + BALL.radius
    const maxY = TABLE.playY2 - BALL.radius

    for (const b of active) {
      if (b.x < minX) { b.x = minX; b.vx =  Math.abs(b.vx) * RAIL_RESTITUTION; b._railHit = true }
      if (b.x > maxX) { b.x = maxX; b.vx = -Math.abs(b.vx) * RAIL_RESTITUTION; b._railHit = true }
      if (b.y < minY) { b.y = minY; b.vy =  Math.abs(b.vy) * RAIL_RESTITUTION; b._railHit = true }
      if (b.y > maxY) { b.y = maxY; b.vy = -Math.abs(b.vy) * RAIL_RESTITUTION; b._railHit = true }
    }

    // 4. Ball-ball collisions (exact elastic, equal mass)
    for (let i = 0; i < active.length; i++) {
      for (let j = i + 1; j < active.length; j++) {
        const a = active[i]
        const b = active[j]

        const dx      = b.x - a.x
        const dy      = b.y - a.y
        const dist    = Math.hypot(dx, dy)
        const minDist = BALL.radius * 2

        if (dist < minDist && dist > 0.0001) {
          // Normalised collision axis
          const nx = dx / dist
          const ny = dy / dist

          // Push balls apart so they no longer overlap
          const overlap = (minDist - dist) / 2
          a.x -= nx * overlap
          a.y -= ny * overlap
          b.x += nx * overlap
          b.y += ny * overlap

          // Relative velocity along collision axis
          const dvx = a.vx - b.vx
          const dvy = a.vy - b.vy
          const dot = dvx * nx + dvy * ny

          // Only resolve if approaching
          if (dot > 0) {
            const impulse = dot * RESTITUTION
            a.vx -= impulse * nx
            a.vy -= impulse * ny
            b.vx += impulse * nx
            b.vy += impulse * ny
          }

          // Tag for first-contact tracking in engine (only first substep tag matters)
          a._collidedWith = a._collidedWith || b.label
          b._collidedWith = b._collidedWith || a.label
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Table drawing (unchanged)
// ---------------------------------------------------------------------------
export function drawTable(scene) {
  const { width, height, playX1, playX2, playY1, playY2 } = TABLE
  const gfx = scene.add.graphics()

  // Full canvas wood background — matches engine backgroundColor so no black seam
  gfx.fillStyle(0x5c3a1e)
  gfx.fillRect(0, 0, width, height)

  // Subtle wood grain lines
  gfx.lineStyle(1, 0x4a2e14, 0.4)
  for (let y = 8; y < height; y += 16) {
    gfx.beginPath()
    gfx.moveTo(0, y)
    gfx.lineTo(width, y)
    gfx.strokePath()
  }

  // Inner cushion shadow (dark band inside the wood)
  const cushionW = playX1
  gfx.fillStyle(0x3a2010)
  gfx.fillRect(cushionW - 4, cushionW - 4, playX2 - playX1 + 8, 4)           // top
  gfx.fillRect(cushionW - 4, playY2,       playX2 - playX1 + 8, 4)            // bottom
  gfx.fillRect(cushionW - 4, cushionW - 4, 4, playY2 - playY1 + 8)            // left
  gfx.fillRect(playX2,       cushionW - 4, 4, playY2 - playY1 + 8)            // right

  // Green felt
  gfx.fillStyle(0x1a6b2a)
  gfx.fillRect(playX1, playY1, playX2 - playX1, playY2 - playY1)

  // Felt centre line
  gfx.lineStyle(1, 0x177526, 0.3)
  gfx.beginPath()
  gfx.moveTo(width / 2, playY1)
  gfx.lineTo(width / 2, playY2)
  gfx.strokePath()

  // Baulk circle (left quarter)
  gfx.lineStyle(1, 0x177526, 0.3)
  gfx.strokeCircle(width * 0.25, height / 2, 40)

  // Pockets
  POCKET.positions.forEach(([px, py]) => {
    // Drop shadow
    gfx.fillStyle(0x000000, 0.5)
    gfx.fillCircle(px + 2, py + 2, 22)
    // Pocket hole
    gfx.fillStyle(0x050505)
    gfx.fillCircle(px, py, 20)
    // Pocket rim
    gfx.lineStyle(2, 0x3a2010)
    gfx.strokeCircle(px, py, 20)
  })
}

// ---------------------------------------------------------------------------
// Pocket detection — works on plain ball objects
// ---------------------------------------------------------------------------
export function checkPockets(scene, onPocket) {
  const balls = scene.registry.get('balls') || []

  balls.forEach((ball) => {
    if (ball.pocketed) return

    POCKET.positions.forEach(([px, py]) => {
      const dx = ball.x - px
      const dy = ball.y - py
      if (Math.hypot(dx, dy) < POCKET.radius * 0.85) {
        onPocket(ball)
      }
    })
  })
}

export function drawPocketHighlights(graphics, pockets, selectedPocket) {
  graphics.clear()

  pockets.forEach((pocket, i) => {
    const isActive = selectedPocket === null || selectedPocket === i

    graphics.fillStyle(isActive ? 0xff0000 : 0x550000, 0.9)
    graphics.fillCircle(pocket.x, pocket.y, 22)

    if (isActive) {
      graphics.lineStyle(3, 0xff4444, 1)
      graphics.strokeCircle(pocket.x, pocket.y, 26)
    }
  })
}