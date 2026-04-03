import { BALL, TABLE, POCKET } from './constants'
import { shootCue } from './cue'

// ---------------------------------------------------------------------------
// Difficulty — error is in radians of angular wobble
// ---------------------------------------------------------------------------
const DIFFICULTY = {
  easy:   0.10,   // ~5.7 deg — clearly misses thin cuts
  medium: 0.032,  // ~1.8 deg — makes most shots, misses tough ones
  hard:   0.008,  // ~0.5 deg — near-perfect
}

const AI_THINK_MS = 900   // natural pause before shooting

// ---------------------------------------------------------------------------
// Entry point — called from engine.js when it's the AI's turn
// ---------------------------------------------------------------------------
export function triggerAIShot(scene) {
  if (scene._aiThinking) return
  scene._aiThinking = true

  setTimeout(() => {
    scene._aiThinking = false

    // AI cheat: if cheat is available and AI hasn't used it, 30% chance it cheats
    // (only on hard difficulty — easy/medium AI doesn't bother)
    const aiDifficulty = scene.registry.get('aiDifficulty') || 'medium'
    if (
      scene.registry.get('cheatAvailable') &&
      !scene.registry.get('cheatUsed') &&
      aiDifficulty === 'hard' &&
      Math.random() < 0.30
    ) {
      // Import lazily to avoid circular dep — engine imports ai, ai imports engine
      import('./engine').then(({ useCheat }) => useCheat(scene))
      return
    }

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
// Shot selection — main brain
// ---------------------------------------------------------------------------
function pickBestShot(scene) {
  const balls   = scene.registry.get('balls') || []
  const cueBall = balls.find(b => b.label === 'cue' && !b.pocketed)
  if (!cueBall) return null

  const oppType   = scene.registry.get('oppType')   // AI is always the opponent
  const aiType    = oppType
  const breakDone = scene.registry.get('breakDone')
  const eightBall = balls.find(b => b.type === '8ball' && !b.pocketed)

  // ── Break shot ──────────────────────────────────────────────────────────
  if (!breakDone || !aiType) {
    return makeBreakShot(scene, cueBall, balls)
  }

  const aiBalls = balls.filter(b => b.type === aiType && !b.pocketed)

  // ── Run at 8-ball if all own balls are cleared ──────────────────────────
  if (aiBalls.length === 0 && eightBall) {
    const shot = findBestDirectShot(scene, cueBall, [eightBall], balls)
    if (shot) {
      // Register the called pocket so game rules can validate
      import('../store/gameStore').then(({ useGameStore }) => {
        useGameStore.setCalledPocket(shot.pocketIdx)
        useGameStore.setSelectingPocket(false)
        scene.registry.set('calledPocket', shot.pocketIdx)
      })
      return { angle: shot.angle, power: shot.power }
    }
    return safetyShot(scene, cueBall, eightBall, balls)
  }

  if (aiBalls.length === 0) return fallbackShot(cueBall)

  // ── Try a direct pot on own balls ───────────────────────────────────────
  const directShot = findBestDirectShot(scene, cueBall, aiBalls, balls)
  if (directShot) return { angle: directShot.angle, power: directShot.power }

  // ── Try a 1-rail bank shot ──────────────────────────────────────────────
  const bankShot = findBestBankShot(scene, cueBall, aiBalls, balls)
  if (bankShot) return { angle: bankShot.angle, power: bankShot.power }

  // ── No pot available — play safe ────────────────────────────────────────
  return safetyShot(scene, cueBall, aiBalls[0], balls)
}

// ---------------------------------------------------------------------------
// Direct pot — ghost-ball method, scores every target × pocket combo
// ---------------------------------------------------------------------------
function findBestDirectShot(scene, cueBall, targets, allBalls) {
  // Own remaining balls (used for cue-ball end evaluation)
  const oppType = scene.registry.get('oppType')
  const ownBalls = allBalls.filter(b => b.type === oppType && !b.pocketed)

  let best = null

  for (const target of targets) {
    for (let pi = 0; pi < POCKET.positions.length; pi++) {
      const [px, py] = POCKET.positions[pi]

      // Ghost ball position
      const toPocketAngle = Math.atan2(py - target.y, px - target.x)
      const ghostX = target.x - Math.cos(toPocketAngle) * BALL.radius * 2
      const ghostY = target.y - Math.sin(toPocketAngle) * BALL.radius * 2

      if (isPathBlocked(cueBall, ghostX, ghostY, allBalls, target)) continue
      if (isPathBlocked(target,  px,     py,     allBalls, cueBall)) continue

      const cueAngle    = Math.atan2(ghostY - cueBall.y, ghostX - cueBall.x)
      const pocketAngle = toPocketAngle
      const cutAngle    = Math.abs(angleDiff(cueAngle, pocketAngle))
      if (cutAngle > Math.PI * 0.65) continue

      const cueDist    = Math.hypot(ghostX - cueBall.x, ghostY - cueBall.y)
      const targetDist = Math.hypot(px - target.x, py - target.y)
      const power      = choosePower(cueDist, targetDist, cutAngle)

      // ── Scoring factors ──────────────────────────────────────────────────
      const cutPenalty      = cutAngle / (Math.PI * 0.5)
      const distancePenalty = (cueDist + targetDist) / 800
      const crowding        = countNearby(target, allBalls, BALL.radius * 5) * 0.08
      // Reward pots into nearer pockets (less travel = less chance of rattle)
      const pocketDist      = Math.hypot(px - target.x, py - target.y)
      const pocketReward    = 1 - Math.min(1, pocketDist / 400)
      // Cue ball safety after the shot
      const cueEnd          = estimateCueBallEnd(cueBall, ghostX, ghostY, power)
      const cueSafety       = cueBallEndSafety(cueEnd, allBalls, ownBalls)

      const score = 1
        - cutPenalty      * 0.50
        - distancePenalty * 0.25
        - crowding
        + pocketReward    * 0.10
        + cueSafety

      if (score > (best?.score ?? -Infinity)) {
        best = {
          angle:     cueAngle + aimError(scene, cutAngle, cueDist),
          power,
          score,
          pocketIdx: pi,
        }
      }
    }
  }

  return best
}

// ---------------------------------------------------------------------------
// 1-Rail bank shot — reflect ghost position across each rail, check clearance
// ---------------------------------------------------------------------------
function findBestBankShot(scene, cueBall, targets, balls) {
  const rails = [
    { axis: 'y', val: TABLE.playY1 + BALL.radius },   // top rail
    { axis: 'y', val: TABLE.playY2 - BALL.radius },   // bottom rail
    { axis: 'x', val: TABLE.playX1 + BALL.radius },   // left rail
    { axis: 'x', val: TABLE.playX2 - BALL.radius },   // right rail
  ]

  let best = null

  for (const target of targets) {
    for (let pi = 0; pi < POCKET.positions.length; pi++) {
      const [px, py] = POCKET.positions[pi]

      for (const rail of rails) {
        // Reflect the pocket across the rail to find the bank target point
        let reflectX = px
        let reflectY = py
        if (rail.axis === 'y') reflectY = 2 * rail.val - py
        else                   reflectX = 2 * rail.val - px

        // Ghost ball toward the reflected pocket
        const toPocketAngle = Math.atan2(reflectY - target.y, reflectX - target.x)
        const ghostX = target.x - Math.cos(toPocketAngle) * BALL.radius * 2
        const ghostY = target.y - Math.sin(toPocketAngle) * BALL.radius * 2

        // Bounce point on the rail
        const bounceT = rail.axis === 'y'
          ? (rail.val - target.y) / (reflectY - target.y + 0.001)
          : (rail.val - target.x) / (reflectX - target.x + 0.001)
        if (bounceT < 0 || bounceT > 1) continue

        const bx = target.x + (reflectX - target.x) * bounceT
        const by = target.y + (reflectY - target.y) * bounceT

        // Validate bounce point is within rail bounds
        if (bx < TABLE.playX1 || bx > TABLE.playX2) continue
        if (by < TABLE.playY1 || by > TABLE.playY2) continue

        if (isPathBlocked(cueBall, ghostX, ghostY, balls, target)) continue
        if (isPathBlocked(target,  bx,     by,     balls, cueBall)) continue
        if (isPathBlocked({ x: bx, y: by }, px, py, balls, null))   continue

        const cueAngle = Math.atan2(ghostY - cueBall.y, ghostX - cueBall.x)
        const cueDist  = Math.hypot(ghostX - cueBall.x, ghostY - cueBall.y)
        const totalDist = cueDist
          + Math.hypot(bx - target.x, by - target.y)
          + Math.hypot(px - bx, py - by)

        // Bank shots score lower than direct — they're harder and riskier
        const score = 0.35 - totalDist / 2000

        if (score > (best?.score ?? -Infinity)) {
          best = {
            angle: cueAngle + aimError(scene, 0.3),
            power: Math.min(14, 8 + totalDist / 100),
            score,
            pocketIdx: pi,
          }
        }
      }
    }
  }

  return best
}

// ---------------------------------------------------------------------------
// Safety shot — nudge the target ball away and leave cue ball snookered
// ---------------------------------------------------------------------------
function safetyShot(scene, cueBall, target, allBalls) {
  if (!target) return fallbackShot(cueBall)

  // Find the best blocker: a ball that sits between a candidate hide spot and
  // the opponent's targets, making it hard for them to hit anything cleanly.
  const oppType    = scene.registry.get('oppType')
  const enemyBalls = allBalls.filter(b =>
    b.type !== oppType && b.type !== 'cue' && b.type !== '8ball' && !b.pocketed
  )

  // Try a few candidate hide spots behind blocker balls
  let bestAngle = null
  let bestScore = -Infinity

  for (const blocker of allBalls.filter(b => !b.pocketed && b !== cueBall && b !== target)) {
    // Shoot so cue ball rolls toward blocker and stops behind it
    const toBlocker = Math.atan2(blocker.y - cueBall.y, blocker.x - cueBall.x)
    const stopX = blocker.x - Math.cos(toBlocker) * BALL.radius * 3
    const stopY = blocker.y - Math.sin(toBlocker) * BALL.radius * 3

    // Check that we clip the target ball on the way (must make contact per rules)
    const pathHitsTarget = !isPathBlocked(cueBall, target.x, target.y, allBalls, target)

    // How well does the blocker hide the cue ball from enemy targets?
    const hiddenFrom = enemyBalls.filter(enemy => {
      return isPathBlocked({ x: stopX, y: stopY }, enemy.x, enemy.y, [blocker], null)
    }).length

    const dist  = Math.hypot(stopX - cueBall.x, stopY - cueBall.y)
    const score = hiddenFrom * 0.4 - dist / 800 + (pathHitsTarget ? 0.2 : -0.5)

    if (score > bestScore) {
      bestScore = score
      bestAngle = Math.atan2(target.y - cueBall.y, target.x - cueBall.x)
    }
  }

  // Fall through: nudge target toward a rail at low power
  const angle = bestAngle ??
    Math.atan2(target.y - cueBall.y, target.x - cueBall.x)

  return {
    angle: angle + aimError(scene, 0.05, 0),
    power: 4 + Math.random() * 2,
  }
}

// ---------------------------------------------------------------------------
// Break shot — aim at the head ball of the rack with maximum power
// ---------------------------------------------------------------------------
function makeBreakShot(scene, cueBall, balls) {
  // Head ball of rack is at approximately 60% of table width, vertically centered
  const rackX = TABLE.playX2 * 0.62
  const rackY = TABLE.height / 2

  // Aim slightly off-center for a better spread
  const offset = (Math.random() - 0.5) * BALL.radius * 0.5
  const angle  = Math.atan2(rackY + offset - cueBall.y, rackX - cueBall.x)

  return {
    angle: angle + aimError(scene, 0),
    power: 15 + Math.random() * 2,    // near-maximum power
  }
}

// ---------------------------------------------------------------------------
// Fallback — nothing else worked, just hit toward the rack
// ---------------------------------------------------------------------------
function fallbackShot(cueBall) {
  const angle = Math.atan2(TABLE.height / 2 - cueBall.y, TABLE.playX2 * 0.6 - cueBall.x)
  return { angle: angle + (Math.random() - 0.5) * 0.12, power: 10 }
}

// ---------------------------------------------------------------------------
// AI cue ball placement
// ---------------------------------------------------------------------------
export function triggerAIPlacement(scene) {
  if (scene._aiThinking) return
  scene._aiThinking = true

  setTimeout(() => {
    scene._aiThinking = false

    const balls   = scene.registry.get('balls') || []
    const cueBall = balls.find(b => b.label === 'cue')
    if (!cueBall) return

    const margin  = BALL.radius * 2.5
    const isBreak = !scene.registry.get('breakDone')
    const maxX    = isBreak
      ? TABLE.playX1 + (TABLE.playX2 - TABLE.playX1) * 0.25
      : TABLE.playX2 - BALL.radius

    const oppType = scene.registry.get('oppType')
    const targets = balls.filter(b => b.type === oppType && !b.pocketed)

    let bestSpot  = null
    let bestScore = -Infinity

    for (let x = TABLE.playX1 + BALL.radius + 2; x < maxX; x += margin) {
      for (let y = TABLE.playY1 + BALL.radius + 2; y < TABLE.playY2 - BALL.radius; y += margin) {
        const blocked = balls.some(b =>
          b !== cueBall && !b.pocketed &&
          Math.hypot(b.x - x, b.y - y) < BALL.radius * 2 + 1
        )
        const inPocket = POCKET.positions.some(([px, py]) =>
          Math.hypot(px - x, py - y) < POCKET.radius
        )
        if (blocked || inPocket) continue

        // Score by best available shot angle quality from this spot
        let shotScore = 0
        for (const t of targets) {
          for (let pi = 0; pi < POCKET.positions.length; pi++) {
            const [px, py] = POCKET.positions[pi]
            const toPocketAngle = Math.atan2(py - t.y, px - t.x)
            const ghostX = t.x - Math.cos(toPocketAngle) * BALL.radius * 2
            const ghostY = t.y - Math.sin(toPocketAngle) * BALL.radius * 2

            const fakeCue = { x, y, label: 'cue' }
            if (isPathBlocked(fakeCue, ghostX, ghostY, balls, t)) continue
            if (isPathBlocked(t, px, py, balls, fakeCue)) continue

            const cueAngle  = Math.atan2(ghostY - y, ghostX - x)
            const cutAngle  = Math.abs(angleDiff(cueAngle, toPocketAngle))
            if (cutAngle > Math.PI * 0.65) continue

            const cueDist    = Math.hypot(ghostX - x, ghostY - y)
            const targetDist = Math.hypot(px - t.x, py - t.y)
            const cut        = cutAngle / (Math.PI * 0.5)
            const dist       = (cueDist + targetDist) / 800
            shotScore = Math.max(shotScore, 1 - cut * 0.5 - dist * 0.3)
          }
        }

        const score = shotScore + Math.random() * 0.01

        if (score > bestScore) {
          bestScore = score
          bestSpot  = { x, y }
        }
      }
    }

    // Fallback: first valid spot
    if (!bestSpot) {
      outer:
      for (let x = TABLE.playX1 + BALL.radius + 2; x < maxX; x += margin) {
        for (let y = TABLE.playY1 + BALL.radius + 2; y < TABLE.playY2 - BALL.radius; y += margin) {
          const blocked = balls.some(b =>
            b !== cueBall && !b.pocketed &&
            Math.hypot(b.x - x, b.y - y) < BALL.radius * 2 + 1
          )
          const inPocket = POCKET.positions.some(([px, py]) =>
            Math.hypot(px - x, py - y) < POCKET.radius
          )
          if (!blocked && !inPocket) { bestSpot = { x, y }; break outer }
        }
      }
    }

    if (!bestSpot) return

    const { x, y } = bestSpot
    cueBall.x = x
    cueBall.y = y
    cueBall.vx = 0
    cueBall.vy = 0
    cueBall._placing = false
    if (cueBall.gfx) { cueBall.gfx.setPosition(x, y); cueBall.gfx.setVisible(true) }

    scene.registry.set('kitchenOnly', isBreak)

    if (typeof scene._cueBallPlacementCleanup === 'function') {
      scene._cueBallPlacementCleanup()
      scene._cueBallPlacementCleanup = null
    }
    scene.registry.set('placingCueBall', false)
    scene._suppressShotUntil = Date.now() + 120

    setTimeout(() => triggerAIShot(scene), 600)
  }, AI_THINK_MS)
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** True if any ball (other than `from` and `exclude`) blocks the line from→to */

function isPathBlocked(from, toX, toY, balls, exclude) {
  const dx   = toX - from.x
  const dy   = toY - from.y
  const dist = Math.hypot(dx, dy)
  if (dist < 0.001) return false
  const nx = dx / dist
  const ny = dy / dist
  const clearance = BALL.radius * 2 - 2   // slightly less than full diameter

  for (const b of balls) {
    if (b === from || b === exclude) continue
    if (b.pocketed) continue

    const fx   = b.x - from.x
    const fy   = b.y - from.y
    const proj = fx * nx + fy * ny
    if (proj < 0 || proj > dist) continue

    const perpX = from.x + nx * proj
    const perpY = from.y + ny * proj
    if (Math.hypot(b.x - perpX, b.y - perpY) < clearance) return true
  }
  return false
}

/** Power scaled by total travel distance and cut angle (thin cuts need more pace) */
function choosePower(cueDist, targetDist, cutAngle = 0) {
  const total = cueDist + targetDist
  // Base power covers the distance; thin cuts need extra pace to reach pocket
  const base      = Math.min(1, total / 380)
  const cutBoost  = cutAngle * 0.35
  // Don't hammer a short straight shot — risk scratching into opposite pocket
  const shortShot = total < 120
  const cap       = shortShot ? 9 : 16
  return Math.min(cap, 4.5 + base * 9 + cutBoost)
}

/** Absolute angular difference, normalised to [0, π] */
function angleDiff(a, b) {
  let d = ((a - b) + Math.PI * 3) % (Math.PI * 2) - Math.PI
  return Math.abs(d)
}

/** Count balls within `radius` of a position (proxy for crowding) */
function countNearby(pos, balls, radius) {
  return balls.filter(b => !b.pocketed && b !== pos && Math.hypot(b.x - pos.x, b.y - pos.y) < radius).length
}

/**
 * Aim error in radians.
 * Harder shots (thin cuts, long distance) get proportionally more error.
 * `cutAngle` is 0 for straight shots and increases for thinner cuts.
 */
function aimError(scene, cutAngle = 0, distance = 0) {
  const difficulty = scene.registry.get('aiDifficulty') || 'medium'
  const base       = DIFFICULTY[difficulty] ?? DIFFICULTY.medium
  // Thin cuts are genuinely harder — up to 1.6× at 90°
  const cutFactor  = 1 + (cutAngle / (Math.PI * 0.5)) * 0.6
  // Distance adds only a tiny extra wobble (max +30% at 600px)
  const distFactor = 1 + Math.min(distance, 600) / 600 * 0.3
  const scaled     = base * cutFactor * distFactor
  return (Math.random() - 0.5) * 2 * scaled
}
function estimateCueBallEnd(cueBall, ghostX, ghostY, power) {
  // After contact the cue ball deflects ~90° from the target-to-pocket line
  // Simplified: it just continues slightly past the ghost position
  const angle  = Math.atan2(ghostY - cueBall.y, ghostX - cueBall.x)
  const travel = power * 8   // rough pixels of post-contact travel
  return {
    x: ghostX + Math.cos(angle) * travel * 0.3,
    y: ghostY + Math.sin(angle) * travel * 0.3,
  }
}

function cueBallEndSafety(endPos, balls, ownBalls) {
  // Penalise if cue ball lands near any pocket (scratch risk)
  const nearPocket = POCKET.positions.some(([px, py]) =>
    Math.hypot(endPos.x - px, endPos.y - py) < BALL.radius * 5
  )
  // Reward if cue ball ends up near one of our remaining balls (easier next shot)
  const nearOwnBall = ownBalls.some(b =>
    !b.pocketed && Math.hypot(endPos.x - b.x, endPos.y - b.y) < BALL.radius * 10
  )
  let score = 0
  if (nearPocket)   score -= 0.18
  if (nearOwnBall)  score += 0.12
  return score
}
