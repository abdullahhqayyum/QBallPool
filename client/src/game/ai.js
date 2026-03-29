import { BALL, TABLE, POCKET } from './constants'
import { shootCue } from './cue'

// Difficulty controls how much random error is added to the aim angle
const DIFFICULTY = {
  easy:   0.18,  // ~10 degree wobble
  medium: 0.08,
  hard:   0.02,
}

const AI_THINK_MS  = 900   // pause before shooting (feels natural)
const AI_ERROR     = DIFFICULTY.medium

// ---------------------------------------------------------------------------
// Entry point — called from engine.js when it's the AI's turn
// ---------------------------------------------------------------------------
export function triggerAIShot(scene) {
  if (scene._aiThinking) return
  scene._aiThinking = true

  setTimeout(() => {
    scene._aiThinking = false
    if (scene.registry.get('shotFired'))      return
    if (scene.registry.get('placingCueBall')) return

    const shot = pickBestShot(scene)
    if (!shot) return

    scene.registry.set('firstCueContactLabel', null)
    scene.registry.set('shotFired', true)
    shootCue(scene, shot.angle, shot.power)
  }, AI_THINK_MS)
}

// ---------------------------------------------------------------------------
// Shot selection
// ---------------------------------------------------------------------------
function pickBestShot(scene) {
  const balls    = scene.registry.get('balls') || []
  const cueBall  = balls.find(b => b.label === 'cue' && !b.pocketed)
  if (!cueBall) return null

  const myType   = scene.registry.get('myType')
  const oppType  = scene.registry.get('oppType')
  // AI is always P2 (myTurn === false), so its type is oppType
  const aiType   = oppType

  // Determine which balls the AI should be potting
  const aiBalls  = balls.filter(b => b.type === aiType && !b.pocketed)
  const allDone  = aiBalls.length === 0
  const eightBall = balls.find(b => b.type === '8ball' && !b.pocketed)

  const targets = allDone && eightBall ? [eightBall] : aiBalls

  if (targets.length === 0) return fallbackShot(cueBall)

  // Score every (target ball, pocket) combination and pick the best
  let best = null

  for (const target of targets) {
    for (let pi = 0; pi < POCKET.positions.length; pi++) {
      const [px, py] = POCKET.positions[pi]

      // Angle from target ball to pocket
      const toPocketAngle = Math.atan2(py - target.y, px - target.x)

      // Ghost ball position — where cue ball centre must be to send target to pocket
      const ghostX = target.x - Math.cos(toPocketAngle) * BALL.radius * 2
      const ghostY = target.y - Math.sin(toPocketAngle) * BALL.radius * 2

      // Angle from cue ball to ghost ball
      const angle = Math.atan2(ghostY - cueBall.y, ghostX - cueBall.x)

      // Check nothing blocks the cue-ball path to the ghost ball
      if (isPathBlocked(cueBall, ghostX, ghostY, balls, target)) continue

      // Check nothing blocks the target ball's path to the pocket
      if (isPathBlocked(target, px, py, balls, cueBall)) continue

      // Score: prefer close targets and centred pocket angles
      const cueDist    = Math.hypot(ghostX - cueBall.x, ghostY - cueBall.y)
      const targetDist = Math.hypot(px - target.x, py - target.y)
      const score      = 1 / (cueDist + targetDist * 0.5 + 1)

      if (!best || score > best.score) {
        best = { angle, power: choosePower(cueDist, targetDist), score, pocketIdx: pi }
      }
    }
  }

  if (!best) return fallbackShot(cueBall)

  // When potting 8-ball, also call the pocket via the store
  if (allDone && eightBall && best.pocketIdx !== undefined) {
    import('../store/gameStore').then(({ useGameStore }) => {
      useGameStore.setCalledPocket(best.pocketIdx)
      useGameStore.setSelectingPocket(false)
      scene.registry.set('calledPocket', best.pocketIdx)
    })
  }

  // Add human-like error
  const error = (Math.random() - 0.5) * 2 * AI_ERROR
  return { angle: best.angle + error, power: best.power }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function isPathBlocked(from, toX, toY, balls, exclude) {
  const dx   = toX - from.x
  const dy   = toY - from.y
  const dist = Math.hypot(dx, dy)
  if (dist < 0.001) return false
  const nx = dx / dist
  const ny = dy / dist

  for (const b of balls) {
    if (b === from || b === exclude) continue
    if (b.pocketed) continue

    const fx     = b.x - from.x
    const fy     = b.y - from.y
    const proj   = fx * nx + fy * ny
    if (proj < 0 || proj > dist) continue

    const perpX  = from.x + nx * proj
    const perpY  = from.y + ny * proj
    const perp   = Math.hypot(b.x - perpX, b.y - perpY)
    if (perp < BALL.radius * 2) return true
  }
  return false
}

function choosePower(cueDist, targetDist) {
  // Scale power with total distance — closer shots hit softer
  const total = cueDist + targetDist
  const raw   = Math.min(1, total / 400)
  // Map 0..1 → 6..14 power range (never too weak, never full blast)
  return 6 + raw * 8
}

function fallbackShot(cueBall) {
  // No clear shot — just smash toward the centre of the rack
  const angle = Math.atan2(TABLE.height / 2 - cueBall.y, TABLE.playX2 * 0.6 - cueBall.x)
  const error = (Math.random() - 0.5) * 0.15
  return { angle: angle + error, power: 10 }
}

export function triggerAIPlacement(scene) {
  if (scene._aiThinking) return
  scene._aiThinking = true

  setTimeout(() => {
    scene._aiThinking = false

    const balls   = scene.registry.get('balls') || []
    const cueBall = balls.find(b => b.label === 'cue')
    if (!cueBall) return

    // Find a valid spot — scan left-to-right, top-to-bottom
    const margin = BALL.radius * 2.5
    let placed   = false

    // If it's the opening break, restrict AI placement to the kitchen
    const isBreak = (scene.registry.get('breakShotsRemaining') ?? 0) > 0
    const maxX    = isBreak
      ? TABLE.playX1 + (TABLE.playX2 - TABLE.playX1) * 0.25
      : TABLE.playX2 - BALL.radius

    outer:
    for (let x = TABLE.playX1 + BALL.radius + 2; x < maxX; x += margin) {
      for (let y = TABLE.playY1 + BALL.radius + 2; y < TABLE.playY2 - BALL.radius; y += margin) {
        // No overlap with other balls
        const blocked = balls.some(b =>
          b !== cueBall && !b.pocketed &&
          Math.hypot(b.x - x, b.y - y) < BALL.radius * 2 + 1
        )
        // Not inside a pocket
        const inPocket = POCKET.positions.some(([px, py]) =>
          Math.hypot(px - x, py - y) < POCKET.radius
        )
        if (!blocked && !inPocket) {
          cueBall.x = x
          cueBall.y = y
          cueBall.vx = 0
          cueBall.vy = 0
          cueBall._placing = false
          if (cueBall.gfx) { cueBall.gfx.setPosition(x, y); cueBall.gfx.setVisible(true) }
          // Respect kitchen-only placement state for consistency with player UI
          scene.registry.set('kitchenOnly', isBreak)
          placed = true
          break outer
        }
      }
    }

    if (!placed) return  // table totally full, shouldn't happen

    // Clean up placement listeners and release the lock
    if (typeof scene._cueBallPlacementCleanup === 'function') {
      scene._cueBallPlacementCleanup()
      scene._cueBallPlacementCleanup = null
    }
    scene.registry.set('placingCueBall', false)
    scene._suppressShotUntil = Date.now() + 120

    // Now trigger the shot after a short extra pause
    setTimeout(() => triggerAIShot(scene), 600)
  }, AI_THINK_MS)
}