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
  // Exclude balls that are currently being placed by the player
  const active = balls.filter(b => !b.pocketed && !b._placing)

  const maxSpeed = active.reduce((m, b) => Math.max(m, Math.hypot(b.vx, b.vy)), 0)
  const substeps  = Math.max(1, Math.ceil(maxSpeed / MAX_STEP_DIST))
  const dt        = 1 / substeps

  for (let s = 0; s < substeps; s++) {
    // 1. Apply rolling friction (scaled to substep)
    const friction = Math.pow(ROLLING_FRICTION, dt)
    for (const b of active) {
      b.vx *= friction
      b.vy *= friction
      // Spin decays each frame
      if (b.spinX) b.spinX *= 0.98
      if (b.spinY) b.spinY *= 0.98
      if (Math.abs(b.vx) < MIN_SPEED && Math.abs(b.vy) < MIN_SPEED) {
        b.vx = 0; b.vy = 0
      }
    }

    // 2. Move balls by fractional step
    for (const b of active) {
      b.x += b.vx * dt
      b.y += b.vy * dt
    }

    // 3. Rail bounces — sidespin affects angle off rail
    const minX = TABLE.playX1 + BALL.radius
    const maxX = TABLE.playX2 - BALL.radius
    const minY = TABLE.playY1 + BALL.radius
    const maxY = TABLE.playY2 - BALL.radius

    for (const b of active) {
      const sx = b.spinX || 0
      const sy = b.spinY || 0
      if (b.x < minX) {
        b.x   = minX
        b.vx  = Math.abs(b.vx) * RAIL_RESTITUTION
        b.vy += sx * 0.8   // sidespin transfers to Y on vertical rail
        b._railHit = true
      }
      if (b.x > maxX) {
        b.x   = maxX
        b.vx  = -Math.abs(b.vx) * RAIL_RESTITUTION
        b.vy -= sx * 0.8
        b._railHit = true
      }
      if (b.y < minY) {
        b.y   = minY
        b.vy  = Math.abs(b.vy) * RAIL_RESTITUTION
        b.vx += sy * 0.8   // topspin/backspin transfers to X on horizontal rail
        b._railHit = true
      }
      if (b.y > maxY) {
        b.y   = maxY
        b.vy  = -Math.abs(b.vy) * RAIL_RESTITUTION
        b.vx -= sy * 0.8
        b._railHit = true
      }
    }

    // 4. Ball-ball collisions — spin affects cue ball path after contact
    for (let i = 0; i < active.length; i++) {
      for (let j = i + 1; j < active.length; j++) {
        const a = active[i]
        const b = active[j]

        const dx   = b.x - a.x
        const dy   = b.y - a.y
        const dist = Math.hypot(dx, dy)
        const minDist = BALL.radius * 2

        if (dist < minDist && dist > 0.0001) {
          const nx = dx / dist
          const ny = dy / dist

          const overlap = (minDist - dist) / 2
          a.x -= nx * overlap
          a.y -= ny * overlap
          b.x += nx * overlap
          b.y += ny * overlap

          const dvx = a.vx - b.vx
          const dvy = a.vy - b.vy
          const dot = dvx * nx + dvy * ny

          if (dot > 0) {
            const impulse = dot * RESTITUTION
            a.vx -= impulse * nx
            a.vy -= impulse * ny
            b.vx += impulse * nx
            b.vy += impulse * ny

            // Apply spin to cue ball post-collision
            // Perpendicular to collision normal = tangent direction
            if (a.label === 'cue' || b.label === 'cue') {
              const cue    = a.label === 'cue' ? a : b
              const sx     = cue.spinX || 0
              const sy     = cue.spinY || 0
              // Tangent vector (perpendicular to collision normal)
              const tx     = -ny
              const ty     =  nx
              // Sidespin nudges cue ball along tangent
              const spinForce = 0.6
              cue.vx += tx * sx * spinForce
              cue.vy += ty * sx * spinForce
              // Topspin/backspin adds/removes speed along shot direction
              const speed  = Math.hypot(cue.vx, cue.vy)
              const factor = 1 + sy * 0.25
              if (speed > 0) {
                cue.vx = (cue.vx / speed) * speed * factor
                cue.vy = (cue.vy / speed) * speed * factor
              }
            }
          }

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
  const g = scene.add.graphics()

  const railColor    = 0x5a2d0c  // dark mahogany
  const railDark     = 0x3d1e08
  const cushionColor = 0xd4c89a  // cream/ivory
  const feltColor    = 0x2e8b57  // teal-green

  // ── Full background (wood) ──
  g.fillStyle(railColor)
  g.fillRect(0, 0, width, height)

  // Wood grain
  g.lineStyle(1, railDark, 0.35)
  for (let y = 6; y < height; y += 12) {
    g.beginPath(); g.moveTo(0, y); g.lineTo(width, y); g.strokePath()
  }

  // ── Corner pocket cutouts (diagonal chamfers in the rail) ──
  const cornerR = playX1 + 4
  g.fillStyle(0x080808)
  // top-left
  g.fillTriangle(0, 0, cornerR * 2, 0, 0, cornerR * 2)
  // top-right
  g.fillTriangle(width, 0, width - cornerR * 2, 0, width, cornerR * 2)
  // bottom-left
  g.fillTriangle(0, height, cornerR * 2, height, 0, height - cornerR * 2)
  // bottom-right
  g.fillTriangle(width, height, width - cornerR * 2, height, width, height - cornerR * 2)

  // ── Cream cushion inset band ──
  const cx1 = playX1 - 5
  const cy1 = playY1 - 5
  const cw  = (playX2 - playX1) + 10
  const ch  = (playY2 - playY1) + 10
  g.fillStyle(cushionColor)
  g.fillRect(cx1, cy1, cw, ch)

  // Cushion inner shadow
  g.fillStyle(0xb8a878)
  g.fillRect(cx1 + 2, cy1 + 2, cw - 4, 3)   // top edge shadow
  g.fillRect(cx1 + 2, cy1 + 2, 3, ch - 4)   // left edge shadow

  // ── Felt ──
  g.fillStyle(feltColor)
  g.fillRect(playX1, playY1, playX2 - playX1, playY2 - playY1)

  // Felt subtle centre line
  g.lineStyle(1, 0x267a47, 0.25)
  g.beginPath(); g.moveTo(width / 2, playY1); g.lineTo(width / 2, playY2); g.strokePath()

  // Baulk circle
  g.lineStyle(1, 0x267a47, 0.2)
  g.strokeCircle(width * 0.25, height / 2, 38)

  // ── Rail diamonds ──
  g.fillStyle(0xffffff, 0.7)
  const diamondSize = 3
  // Top & bottom rails — 6 evenly spaced per side
  const hPositions = [1, 2, 3, 4, 5, 6].map(i => playX1 + (playX2 - playX1) * i / 7)
  hPositions.forEach(x => {
    // top rail
    g.fillTriangle(x, cy1 + 3, x - diamondSize, cy1 + 7, x + diamondSize, cy1 + 7)
    g.fillTriangle(x, cy1 + 11, x - diamondSize, cy1 + 7, x + diamondSize, cy1 + 7)
    // bottom rail
    const by = cy1 + ch
    g.fillTriangle(x, by - 3, x - diamondSize, by - 7, x + diamondSize, by - 7)
    g.fillTriangle(x, by - 11, x - diamondSize, by - 7, x + diamondSize, by - 7)
  })
  // Left & right rails — 3 per side
  const vPositions = [1, 2, 3].map(i => playY1 + (playY2 - playY1) * i / 4)
  vPositions.forEach(y => {
    // left
    g.fillTriangle(cx1 + 3, y, cx1 + 7, y - diamondSize, cx1 + 7, y + diamondSize)
    g.fillTriangle(cx1 + 11, y, cx1 + 7, y - diamondSize, cx1 + 7, y + diamondSize)
    // right
    const rx = cx1 + cw
    g.fillTriangle(rx - 3, y, rx - 7, y - diamondSize, rx - 7, y + diamondSize)
    g.fillTriangle(rx - 11, y, rx - 7, y - diamondSize, rx - 7, y + diamondSize)
  })

  // ── Pockets ──
  POCKET.positions.forEach(([px, py]) => {
    // Outer wood ring
    g.fillStyle(railDark)
    g.fillCircle(px, py, 22)
    // Inner black hole
    g.fillStyle(0x050505)
    g.fillCircle(px, py, 18)
    // Subtle rim highlight
    g.lineStyle(1.5, 0x7a4a1a, 0.8)
    g.strokeCircle(px, py, 19)
    // Depth shadow inside
    g.fillStyle(0x000000, 0.6)
    g.fillCircle(px + 2, py + 2, 14)
    g.fillStyle(0x000000)
    g.fillCircle(px, py, 14)
  })
}

// ---------------------------------------------------------------------------
// Pocket detection — works on plain ball objects
// ---------------------------------------------------------------------------
export function checkPockets(scene, onPocket) {
  const balls = scene.registry.get('balls') || []

  const MIDDLE_POCKET_INDICES = [1, 4]

  balls.forEach((ball) => {
    if (ball.pocketed) return

    POCKET.positions.forEach(([px, py], i) => {
      const dx   = ball.x - px
      const dy   = ball.y - py
      const dist = Math.hypot(dx, dy)

      const isMiddle = MIDDLE_POCKET_INDICES.includes(i)

      if (dist >= POCKET.radius * 0.85) return

      if (isMiddle) {
        const speed = Math.hypot(ball.vx, ball.vy)
        if (speed > 0.3) {
          // Only reject if ball is moving almost purely horizontally
          // (parallel to the rail) — vy is tiny relative to vx
          const absVy = Math.abs(ball.vy)
          const absVx = Math.abs(ball.vx)
          if (absVy < absVx * 0.25) return
        }
      }

      onPocket(ball)
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