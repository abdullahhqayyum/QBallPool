import { CUE, BALL, TABLE } from './constants'
import { useGameStore } from "../store/gameStore"
import { getCanvasScale, snapshotForCheat, startRecording } from './engine'


let aimLine        = null
let powerBar       = null
let pullLine       = null
const MIN_AIM_DISTANCE = 10

const PTR_SMOOTH_ALPHA     = 0.3
const DEFLECT_SMOOTH_ALPHA = 0.25
// How much the aim angle drifts per frame while dragging back (0 = frozen, 1 = full tracking)
const AIM_DRAG_SENSITIVITY = 0.03
// If the pointer comes within this many px of the cue ball during drag, cancel the shot
const CANCEL_RADIUS = 14
let   smoothedPtr          = null
let   smoothedDeflect      = null
// Spin state: -1..+1
let spinX = 0  // -1 left, +1 right
let spinY = 0  // -1 backspin, +1 topspin

function smoothPointer(raw) {
  if (!smoothedPtr) {
    smoothedPtr = { x: raw.x, y: raw.y }
  } else {
    smoothedPtr = {
      x: smoothedPtr.x + (raw.x - smoothedPtr.x) * PTR_SMOOTH_ALPHA,
      y: smoothedPtr.y + (raw.y - smoothedPtr.y) * PTR_SMOOTH_ALPHA,
    }
  }
  return smoothedPtr
}


function stabilizePointer(previous, next) {
  if (!next) return previous || null
  if (!previous) return { x: next.x, y: next.y }
  const dx   = next.x - previous.x
  const dy   = next.y - previous.y
  const dist = Math.hypot(dx, dy)
  if (dist < CUE.pointerJitterPx) return previous
  return {
    x: previous.x + dx * CUE.pointerSmoothingAlpha,
    y: previous.y + dy * CUE.pointerSmoothingAlpha,
  }
}

// ---------------------------------------------------------------------------
// Convert a DOM clientX/Y to game-space coordinates.
// Because we CSS-scale the canvas (keeping the internal resolution at
// TABLE.width × TABLE.height), raw clientX is in screen pixels and must be
// divided by the current CSS scale factor.
// ---------------------------------------------------------------------------
export function clientToGame(scene, clientX, clientY) {
  const canvas = scene.game?.canvas
  if (!canvas) return { x: clientX, y: clientY }
  const rect = canvas.getBoundingClientRect()
  const isPortrait = window.innerHeight > window.innerWidth

  if (isPortrait) {
    // After rotate(90deg) clockwise the canvas bounding rect is:
    //   rect.width  = TABLE.height * s   (screen horizontal = table short axis)
    //   rect.height = TABLE.width  * s   (screen vertical   = table long axis)
    // Mapping back to game space:
    //   game X = how far down the screen you are (from rect.top), scaled
    //   game Y = how far from the RIGHT edge of the rect you are, scaled
    const s      = rect.height / TABLE.width   // uniform scale factor
    const localX = clientX - rect.left
    const localY = clientY - rect.top
    return {
      x: localY           / s,
      y: (rect.width - localX) / s,
    }
  }

  const scale = rect.width / TABLE.width
  return {
    x: (clientX - rect.left) / scale,
    y: (clientY - rect.top)  / scale,
  }
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------
export function setupCue(scene, onShoot) {
  aimLine  = scene.add.graphics()
  powerBar = scene.add.graphics()
  pullLine = scene.add.graphics()

  const toGame = (ptr) => {
    // Phaser wraps the native event. On touch, the native event is at ptr.event.
    // We need the *original* clientX/Y before Phaser processes it, because
    // Phaser computes ptr.x/y from the unrotated canvas rect (wrong in portrait).
    const native = ptr.event
    if (native) {
      // TouchEvent: use changedTouches
      const touch = native.changedTouches?.[0] ?? native.touches?.[0]
      if (touch) return clientToGame(scene, touch.clientX, touch.clientY)
      // MouseEvent
      if (native.clientX !== undefined) return clientToGame(scene, native.clientX, native.clientY)
    }
    // Last resort: use Phaser's coords (only correct in landscape)
    return clientToGame(scene, ptr.x + (scene.game?.canvas?.getBoundingClientRect().left ?? 0),
                              ptr.y + (scene.game?.canvas?.getBoundingClientRect().top  ?? 0))
  }

  let dragStart   = null
  let dragCurrent = null
  let lockedAngle = null   // aim direction fixed at pointerdown, never changes during drag
  let power       = 0

  const cancelShot = () => {
    if (!dragStart) return
    dragStart   = null
    dragCurrent = null
    lockedAngle = null
    power       = 0
    smoothedPtr = null
    smoothedDeflect = null
    aimLine.clear()
    powerBar.clear()
    if (pullLine) pullLine.clear()
    if (scene.game?.canvas) scene.game.canvas.style.cursor = 'crosshair'
  }

  const releaseShot = (gameX, gameY) => {
    if (!dragStart) return

    const rawRelease   = { x: gameX, y: gameY }
    const releasePoint = !dragCurrent
      ? rawRelease
      : Math.hypot(rawRelease.x - dragCurrent.x, rawRelease.y - dragCurrent.y) <= CUE.releaseBlendThresholdPx
        ? dragCurrent
        : stabilizePointer(dragCurrent, rawRelease)

    const shotPoint = releasePoint || rawRelease
    const dist = Math.hypot(shotPoint.x - dragStart.x, shotPoint.y - dragStart.y)

    const firedAngle = lockedAngle  // use the angle locked at pointerdown
    dragStart   = null
    dragCurrent = null
    lockedAngle = null

    aimLine.clear()
    powerBar.clear()
    if (pullLine) pullLine.clear()
    scene.game.canvas.style.cursor = 'crosshair'

    if (dist < 8 || power < 0.5) { power = 0; return }

    const cueBall = getCueBall(scene)
    if (!cueBall) return

    const angle = firedAngle !== null ? firedAngle : Math.atan2(cueBall.y - shotPoint.y, cueBall.x - shotPoint.x)

    snapshotForCheat(scene)   // ← NEW: save state before shot executes
    startRecording(scene)
    scene.registry.set('firstCueContactLabel', null)
    scene.registry.set('shotFired', true)
    shootCue(scene, angle, power)
    onShoot(angle, power)
    power = 0
  }

  const renderDrag = (gameX, gameY) => {
    if (!dragStart) return
    const current = { x: gameX, y: gameY }

    const cueBall = getCueBall(scene)
    if (!cueBall) return

    // Cancel if pointer comes back close to the cue ball — reliable cancel zone
    if (Math.hypot(current.x - cueBall.x, current.y - cueBall.y) < CANCEL_RADIUS) {
      cancelShot()
      return
    }

    const dist = Math.hypot(current.x - dragStart.x, current.y - dragStart.y)
    power      = Math.min((dist / CUE.dragForMaxPower) * CUE.maxPower, CUE.maxPower)
    // Slowly drift the aim toward where the pointer currently is — feels like
    // resistance rather than a hard lock. AIM_DRAG_SENSITIVITY controls the speed.
    if (lockedAngle !== null) {
      const rawAngle = Math.atan2(cueBall.y - current.y, cueBall.x - current.x)
      // Angular delta wrapped to [-π, π] so we always take the short arc
      let delta = rawAngle - lockedAngle
      if (delta >  Math.PI) delta -= Math.PI * 2
      if (delta < -Math.PI) delta += Math.PI * 2
      lockedAngle += delta * AIM_DRAG_SENSITIVITY
      drawAimLineByAngle(scene, lockedAngle)
      updateCursor(scene, dragStart, lockedAngle)
    }
    drawPowerBar(scene, power)
    drawPullLine(scene, dragStart, current, power)
  }

  // ---- Mouse events on window (catches drags that leave the canvas) --------
const handleWindowMouseMove = (evt) => {
    if (!dragStart) return
    const gp = clientToGame(scene, evt.clientX, evt.clientY)
    dragCurrent = gp
    renderDrag(gp.x, gp.y)
    smoothPointer(gp)
  }

  const handleWindowMouseUp = (evt) => {
    if (!dragStart) return
    const gp = clientToGame(scene, evt.clientX, evt.clientY)
    releaseShot(gp.x, gp.y)
  }

  const handleWindowTouchMove = (evt) => {
    if (!dragStart) return
    evt.preventDefault()
    const t  = evt.changedTouches[0]
    const gp = clientToGame(scene, t.clientX, t.clientY)
    dragCurrent = gp
    renderDrag(gp.x, gp.y)
    smoothPointer(gp)
  }

  const handleWindowTouchEnd = (evt) => {
    if (!dragStart) return
    evt.preventDefault()
    const t  = evt.changedTouches[0]
    const gp = clientToGame(scene, t.clientX, t.clientY)
    releaseShot(gp.x, gp.y)
  }

  window.addEventListener('mousemove',  handleWindowMouseMove)
  window.addEventListener('mouseup',    handleWindowMouseUp)
  window.addEventListener('touchmove',  handleWindowTouchMove, { passive: false })
  window.addEventListener('touchend',   handleWindowTouchEnd,  { passive: false })

  // ---- Cancel on right-click or Escape ------------------------------------
  const handleContextMenu = (evt) => {
    if (!dragStart) return
    evt.preventDefault()
    cancelShot()
  }
  const handleKeyDown = (evt) => {
    if (evt.key === 'Escape' && dragStart) cancelShot()
  }
  window.addEventListener('contextmenu', handleContextMenu)
  window.addEventListener('keydown',     handleKeyDown)

  // ---- Phaser pointer events (already in game-space) -----------------------
  scene.input.on('pointermove', (ptr) => {
    // Don't draw or update aim while placing cue ball or selecting pocket
    if (scene.registry.get('placingCueBall')) return
    try {
      const gs = useGameStore.getState()
      if (gs?.selectingPocket) return
    } catch (e) {}

    if (!canShoot(scene)) return
    // Phaser pointer coords are already in game-space — no conversion needed
    const gp = toGame(ptr)
    if (dragStart) {
      dragCurrent = gp
      renderDrag(gp.x, gp.y)
      smoothPointer(gp)
    } else {
      const cueBall = getCueBall(scene)
      if (!cueBall) return
      const angle = Math.atan2(cueBall.y - gp.y, cueBall.x - gp.x)
      drawAimLine(scene, gp)
      updateCursor(scene, gp, angle)
    }
  })

  scene.input.on('pointerdown', (ptr) => {
    if (!canShoot(scene)) return
    const gp = toGame(ptr)
    const cueBall = getCueBall(scene)
    if (!cueBall) return

    // Skip if clicking directly on cue ball — that's placement territory
    if (Math.hypot(gp.x - cueBall.x, gp.y - cueBall.y) < BALL.radius * 1.2) return

    dragStart   = gp
    dragCurrent = gp
    lockedAngle = Math.atan2(cueBall.y - gp.y, cueBall.x - gp.x)
    power = 0
    smoothedPtr = null; smoothedDeflect = null
  })

  scene.input.on('pointerup', (ptr) => {
    const gp = toGame(ptr)
    releaseShot(gp.x, gp.y)
  })

// Window-level mousedown + touchstart to start an aiming drag when the
// pointer originates outside the canvas (or leaves it). This lets players
// begin aiming by clicking/tapping the page near the table.
const handleWindowMouseDown = (evt) => {
  if (dragStart) return
  if (!canShoot(scene)) return
  const cueBall = getCueBall(scene)
  if (!cueBall) return
  const gp = clientToGame(scene, evt.clientX, evt.clientY)

  // Allow drag from anywhere — no area restriction.
  // Only skip if clicking directly ON the cue ball (that belongs to placement).
  if (Math.hypot(gp.x - cueBall.x, gp.y - cueBall.y) < BALL.radius * 1.2) return

  dragStart   = gp
  dragCurrent = gp
  lockedAngle = Math.atan2(cueBall.y - gp.y, cueBall.x - gp.x)
  power       = 0
  smoothedPtr = null
  smoothedDeflect = null
}

const handleWindowTouchStart = (evt) => {
  if (dragStart) return
  if (!canShoot(scene)) return
  const cueBall = getCueBall(scene)
  if (!cueBall) return
  const t  = evt.changedTouches[0]
  const gp = clientToGame(scene, t.clientX, t.clientY)

  // Allow drag from anywhere — only skip if touching directly on cue ball.
  if (Math.hypot(gp.x - cueBall.x, gp.y - cueBall.y) < BALL.radius * 1.2) return

  dragStart   = gp
  dragCurrent = gp
  lockedAngle = Math.atan2(cueBall.y - gp.y, cueBall.x - gp.x)
  power       = 0
  smoothedPtr = null
  smoothedDeflect = null
}

window.addEventListener('mousedown',  handleWindowMouseDown)
window.addEventListener('touchstart', handleWindowTouchStart, { passive: true })

// AFTER
  const cleanup = () => {
    window.removeEventListener('mousemove',    handleWindowMouseMove)
    window.removeEventListener('mouseup',      handleWindowMouseUp)
    window.removeEventListener('touchmove',    handleWindowTouchMove)
    window.removeEventListener('touchend',     handleWindowTouchEnd)
    window.removeEventListener('contextmenu',  handleContextMenu)
    window.removeEventListener('keydown',      handleKeyDown)
    window.removeEventListener('mousedown',    handleWindowMouseDown)
    window.removeEventListener('touchstart',   handleWindowTouchStart)
  }
  scene.events.once('shutdown', cleanup)
  scene.events.once('destroy',  cleanup)
}

export function resetCue(scene) {
  if (aimLine)  aimLine.clear()
  if (powerBar) powerBar.clear()
  if (pullLine) pullLine.clear()
  smoothedPtr = null; smoothedDeflect = null
  spinX = 0
  spinY = 0
  if (scene) {
    scene.registry.set('shotFired', false)
    scene.registry.set('firstCueContactLabel', null)
    scene.registry.set('spin', { x: 0, y: 0 })
  }
}

// ---------------------------------------------------------------------------
// Shoot
// ---------------------------------------------------------------------------
export function shootCue(scene, angle, power) {
  const cueBall = getCueBall(scene)
  if (!cueBall) return

  const normalizedPower = Math.max(0, Math.min(1, power / CUE.maxPower))
  const curvedPower     = Math.pow(normalizedPower, CUE.powerCurve)
  const speed = (CUE.minForce + (CUE.maxForce - CUE.minForce) * curvedPower) * 280

  cueBall.vx    = Math.cos(angle) * speed
  cueBall.vy    = Math.sin(angle) * speed
  cueBall.spinX = spinX
  cueBall.spinY = spinY
}

// ---------------------------------------------------------------------------
// Aim line drawing
// ---------------------------------------------------------------------------
function drawAimLine(scene, ptr) {
  const cueBall = getCueBall(scene)
  if (!cueBall || !aimLine) return

  // Use raw pointer directly — no smoothing so the drawn line matches
  // exactly the angle that will be locked on pointerdown
  const angle = Math.atan2(cueBall.y - ptr.y, cueBall.x - ptr.x)

  const cx = cueBall.x
  const cy = cueBall.y

  aimLine.clear()

  const cueStartX = cx - Math.cos(angle) * BALL.radius
  const cueStartY = cy - Math.sin(angle) * BALL.radius
  const cueRawEndX = cx - Math.cos(angle) * (BALL.radius + CUE.aimLineLength)
  const cueRawEndY = cy - Math.sin(angle) * (BALL.radius + CUE.aimLineLength)
  // Clamp cue stick end so it never draws through the cushion
  const cueEndX = Math.max(TABLE.playX1 + 2, Math.min(TABLE.playX2 - 2, cueRawEndX))
  const cueEndY = Math.max(TABLE.playY1 + 2, Math.min(TABLE.playY2 - 2, cueRawEndY))
  aimLine.lineStyle(1.5, 0xd4a96a, 0.6)
  aimLine.beginPath()
  aimLine.moveTo(cueStartX, cueStartY)
  aimLine.lineTo(cueEndX, cueEndY)
  aimLine.strokePath()

  const hit = getFirstHitBall(scene, cx, cy, angle)

  if (hit) {
    const impact  = getImpactGeometry(cueBall, hit, angle)
    const illegal = isIllegalTarget(scene, hit)

    if (!impact) {
      const wallPoint = raycastToWall(cx, cy, angle)
      drawDottedLine(aimLine, cx, cy, wallPoint.x, wallPoint.y, illegal ? 0xff3333 : 0xffffff, 0.2)
      return
    }
    const { ghostX, ghostY, deflectAngle, targetAngle, centrality } = impact

    // Cue path up to ghost ball position
    const lineColor = illegal ? 0xff3333 : 0xffffff
    drawDottedLine(aimLine, cx, cy, ghostX, ghostY, lineColor, 0.35)
    aimLine.lineStyle(1, lineColor, 0.3)
    aimLine.strokeCircle(ghostX, ghostY, BALL.radius)
    drawArrowTip(aimLine, ghostX, ghostY, angle, lineColor, 0.35)

    // Yellow arrow — skip entirely if illegal, shorter length
    if (!illegal) {
      const MAX_DEFLECT   = 80
      const MIN_DEFLECT   = 14
      const deflectLength = MIN_DEFLECT + (MAX_DEFLECT - MIN_DEFLECT) * centrality

      const tex = hit.x + Math.cos(targetAngle) * deflectLength
      const tey = hit.y + Math.sin(targetAngle) * deflectLength
      aimLine.lineStyle(1.5, 0xffdd44, 0.8)
      aimLine.beginPath()
      aimLine.moveTo(hit.x, hit.y)
      aimLine.lineTo(tex, tey)
      aimLine.strokePath()
      drawArrowTip(aimLine, tex, tey, targetAngle, 0xffdd44, 0.8)

      if (centrality < 0.98) {
        const cex = ghostX + Math.cos(deflectAngle) * deflectLength * 0.6
        const cey = ghostY + Math.sin(deflectAngle) * deflectLength * 0.6
        aimLine.lineStyle(1, 0xffffff, 0.25)
        aimLine.beginPath()
        aimLine.moveTo(ghostX, ghostY)
        aimLine.lineTo(cex, cey)
        aimLine.strokePath()
        drawArrowTip(aimLine, cex, cey, deflectAngle, 0xffffff, 0.25)
      }
    }
  } else {
    const wallPoint = raycastToWall(cx, cy, angle)
    drawDottedLine(aimLine, cx, cy, wallPoint.x, wallPoint.y, 0xffffff, 0.2)
    drawArrowTip(aimLine, wallPoint.x, wallPoint.y, angle, 0xffffff, 0.35)
  }
}

// ---------------------------------------------------------------------------
// Geometry helpers
// ---------------------------------------------------------------------------
function getImpactGeometry(cueBall, targetBall, angle) {
  const dx = Math.cos(angle)
  const dy = Math.sin(angle)
  const cx = cueBall.x
  const cy = cueBall.y
  const bx = targetBall.x
  const by = targetBall.y

  const fx = bx - cx
  const fy = by - cy
    const t  = fx * dx + fy * dy
    if (t <= 0) return null

    const closestX = cx + dx * t
    const closestY = cy + dy * t
    const offset   = Math.hypot(bx - closestX, by - closestY)

    const radiusSum = BALL.radius * 2
    if (offset >= radiusSum) return null

    const backDist = Math.sqrt(radiusSum * radiusSum - offset * offset)
    const ghostX   = cx + dx * (t - backDist)
    const ghostY   = cy + dy * (t - backDist)

    // Collision normal — exactly what stepPhysics uses
    const ndx  = bx - ghostX
    const ndy  = by - ghostY
    const ndist = Math.hypot(ndx, ndy) || 1
    const nx   = ndx / ndist
    const ny   = ndy / ndist

    // Simulate the impulse exactly as stepPhysics does
    // Use physics restitution constant to match stepPhysics behavior
    const RESTITUTION = 0.97

    // cue incoming direction (unit)
    const dot     = dx * nx + dy * ny
    const impulse = dot * RESTITUTION

    // Cue ball post-collision direction
    const cueDx = dx - impulse * nx
    const cueDy = dy - impulse * ny

    // Target ball post-collision direction
    const tgtDx = impulse * nx
    const tgtDy = impulse * ny

    const centrality = 1 - (offset / radiusSum)

    return {
      ghostX,
      ghostY,
      deflectAngle: Math.atan2(cueDy, cueDx),
      targetAngle:  Math.atan2(tgtDy, tgtDx),
      centrality,
    }
}

function getFirstHitBall(scene, cx, cy, angle) {
  const balls    = scene.registry.get('balls') || []
  const dx       = Math.cos(angle)
  const dy       = Math.sin(angle)
  let   closest  = null
  let   closestT = Infinity

  balls.forEach(ball => {
    if (ball.pocketed)        return
    if (ball.label === 'cue') return

    const fx = ball.x - cx
    const fy = ball.y - cy
    const t  = fx * dx + fy * dy
    if (t < 0) return

    const closestX = cx + dx * t
    const closestY = cy + dy * t
    const dist     = Math.hypot(ball.x - closestX, ball.y - closestY)
    const radiusSum = BALL.radius * 2

    if (dist <= radiusSum) {
      const impactT = t - Math.sqrt(Math.max(0, radiusSum ** 2 - dist ** 2))
      if (impactT > 0 && impactT < closestT) {
        closestT = impactT
        closest  = ball
      }
    }
  })

  return closest
}

function raycastToWall(cx, cy, angle) {
  const dx   = Math.cos(angle)
  const dy   = Math.sin(angle)
  const minX = TABLE.playX1
  const maxX = TABLE.playX2
  const minY = TABLE.playY1
  const maxY = TABLE.playY2

  const ts = []
  if (dx > 0) ts.push((maxX - cx) / dx)
  if (dx < 0) ts.push((minX - cx) / dx)
  if (dy > 0) ts.push((maxY - cy) / dy)
  if (dy < 0) ts.push((minY - cy) / dy)

  const t = Math.min(...ts.filter(t => t > 0))
  return { x: cx + dx * t, y: cy + dy * t }
}

// ---------------------------------------------------------------------------
// Drawing utilities
// ---------------------------------------------------------------------------
function drawDottedLine(gfx, x1, y1, x2, y2, color, alpha) {
  const dist = Math.hypot(x2 - x1, y2 - y1)
  if (dist <= 0) return
  const steps = dist / 8
  const dx    = (x2 - x1) / dist
  const dy    = (y2 - y1) / dist

  gfx.lineStyle(1, color, alpha)
  for (let i = 0; i < steps; i++) {
    if (i % 2 === 0) {
      gfx.beginPath()
      gfx.moveTo(x1 + dx * i * 8,       y1 + dy * i * 8)
      gfx.lineTo(x1 + dx * (i * 8 + 5), y1 + dy * (i * 8 + 5))
      gfx.strokePath()
    }
  }
}

function drawArrowTip(gfx, x, y, angle, color, alpha = 0.6) {
  const size = 7
  const a1   = angle + Math.PI * 0.8
  const a2   = angle - Math.PI * 0.8
  gfx.lineStyle(1.5, color, alpha)
  gfx.beginPath()
  gfx.moveTo(x + Math.cos(a1) * size, y + Math.sin(a1) * size)
  gfx.lineTo(x, y)
  gfx.lineTo(x + Math.cos(a2) * size, y + Math.sin(a2) * size)
  gfx.strokePath()
}

function drawPowerBar(scene, power) {
  if (!powerBar) return
  const pct   = power / CUE.maxPower
  const color = pct < 0.5 ? 0x44ff44 : pct < 0.8 ? 0xffaa00 : 0xff3300
  powerBar.clear()
  powerBar.fillStyle(0x000000, 0.35)          // more transparent background track
  powerBar.fillRoundedRect(18, 355, 154, 16, 4)
  powerBar.fillStyle(color, 0.6)              // semi-transparent fill
  powerBar.fillRoundedRect(20, 357, 150 * pct, 12, 3)
}

function drawPullLine(scene, dragStart, ptr, power) {
  if (!pullLine) return
  const pct   = power / CUE.maxPower
  const color = pct < 0.5 ? 0x44ff44 : pct < 0.8 ? 0xffaa00 : 0xff3300
  const cueBall = getCueBall(scene)
  if (!cueBall) return

  pullLine.clear()
  drawDottedLine(pullLine, cueBall.x, cueBall.y, ptr.x, ptr.y, color, 0.5)
  pullLine.lineStyle(1.5, color, 0.7)
  pullLine.strokeCircle(ptr.x, ptr.y, 6 + pct * 10)
}

// ---------------------------------------------------------------------------
// Cursor (desktop only — no-op on touch)
// ---------------------------------------------------------------------------
function updateCursor(scene, ptr, angle) {
  if (!scene.game?.canvas) return
  const myType  = scene.registry.get('myType')
  const myTurn  = scene.registry.get('myTurn')
  const cueBall = getCueBall(scene)
  if (!cueBall) return

  const distToMouse = Math.hypot(ptr.x - cueBall.x, ptr.y - cueBall.y)
  if (distToMouse < MIN_AIM_DISTANCE) return

  const hit = getFirstHitBall(scene, cueBall.x, cueBall.y, angle)

  if (hit && myType) {
    const oppType       = scene.registry.get('oppType')
    const myBallsDone   = areMyBallsDone(scene)
    const isOpponentBall = (myTurn && hit.type !== myType && hit.type !== '8ball') ||
                           (!myTurn && hit.type !== oppType && hit.type !== '8ball')
    const is8Ball        = hit.type === '8ball'

    if (isOpponentBall || (is8Ball && !myBallsDone)) {
      scene.game.canvas.style.cursor = 'not-allowed'
      return
    }
  }

  scene.game.canvas.style.cursor = 'crosshair'
}

// ---------------------------------------------------------------------------
// Prediction (used by diagnostics)
// ---------------------------------------------------------------------------
export function predictCueFirstContact(scene, angle) {
  const cueBall = getCueBall(scene)
  if (!cueBall) return { kind: 'none', label: null }

  const hit = getFirstHitBall(scene, cueBall.x, cueBall.y, angle)
  if (hit) {
    return { kind: 'ball', label: hit.label, x: hit.x, y: hit.y }
  }

  const wallPoint = raycastToWall(cueBall.x, cueBall.y, angle)
  return { kind: 'wall', label: 'cushion', x: wallPoint.x, y: wallPoint.y }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function canShoot(scene) {
  try {
    const store = useGameStore.getState?.()
    if (store?.selectingPocket) return false
    if (scene._suppressShotUntil && Date.now() < scene._suppressShotUntil) return false
  } catch (e) {}
  if (scene.registry.get('shotFired'))      return false
  if (scene.registry.get('placingCueBall')) return false
  const balls  = scene.registry.get('balls') || []
  const moving = balls.some(b => !b.pocketed && (Math.abs(b.vx) > 0.08 || Math.abs(b.vy) > 0.08))
  if (moving) return false
  const mode = scene.registry.get('mode')
  if (mode === 'online') return !!scene.registry.get('myTurn')
  return true
}

function getCueBall(scene) {
  const balls = scene.registry.get('balls') || []
  return balls.find(b => b.label === 'cue' && !b.pocketed)
}

function areMyBallsDone(scene) {
  const myType = scene.registry.get('myType')
  const balls  = scene.registry.get('balls') || []
  return balls.filter(b => b.type === myType).every(b => b.pocketed)
}

function isIllegalTarget(scene, hit) {
  if (!hit) return false
  const myType  = scene.registry.get('myType')
  if (!myType) return false
  const myTurn  = scene.registry.get('myTurn')
  const oppType = scene.registry.get('oppType')

  // Type assigned to the current shooter
  const shooterType = myTurn ? myType : oppType

    if (hit.type === '8ball') {
    // 8-ball is legal only if the current shooter has cleared all their balls
    const balls        = scene.registry.get('balls') || []
    const shooterBalls = balls.filter(b => b.type === shooterType)
    const allCleared   = shooterBalls.length === 0 || shooterBalls.every(b => b.pocketed)
    return !allCleared
  }

  // Opponent's ball type is illegal for the current shooter
  const opponentType = myTurn ? oppType : myType
  return hit.type === opponentType
}

function drawAimLineByAngle(scene, angle) {
  const cueBall = getCueBall(scene)
  if (!cueBall || !aimLine) return

  const cx = cueBall.x
  const cy = cueBall.y

  aimLine.clear()

  // Cue stick
  aimLine.lineStyle(1.5, 0xd4a96a, 0.6)
  aimLine.beginPath()
  aimLine.moveTo(cx - Math.cos(angle) * BALL.radius, cy - Math.sin(angle) * BALL.radius)
  aimLine.lineTo(cx - Math.cos(angle) * (BALL.radius + CUE.aimLineLength), cy - Math.sin(angle) * (BALL.radius + CUE.aimLineLength))
  aimLine.strokePath()

  const hit = getFirstHitBall(scene, cx, cy, angle)

  if (hit) {
    const impact  = getImpactGeometry(cueBall, hit, angle)
    const illegal = isIllegalTarget(scene, hit)

    if (!impact) {
      const wallPoint = raycastToWall(cx, cy, angle)
      drawDottedLine(aimLine, cx, cy, wallPoint.x, wallPoint.y, illegal ? 0xff3333 : 0xffffff, 0.2)
      return
    }
    const { ghostX, ghostY, deflectAngle, targetAngle, centrality } = impact

    // Aim line to ghost — red if illegal
    const lineColor = illegal ? 0xff3333 : 0xffffff
    drawDottedLine(aimLine, cx, cy, ghostX, ghostY, lineColor, 0.35)
    aimLine.lineStyle(1, lineColor, 0.3)
    aimLine.strokeCircle(ghostX, ghostY, BALL.radius)
    drawArrowTip(aimLine, ghostX, ghostY, angle, lineColor, 0.35)

    // Yellow arrow — skip entirely if illegal, shorter length
    if (!illegal) {
      const MAX_DEFLECT   = 80   // shortened from 140
      const MIN_DEFLECT   = 14   // shortened from 20
      const deflectLength = MIN_DEFLECT + (MAX_DEFLECT - MIN_DEFLECT) * centrality

      const tex = hit.x + Math.cos(targetAngle) * deflectLength
      const tey = hit.y + Math.sin(targetAngle) * deflectLength
      aimLine.lineStyle(1.5, 0xffdd44, 0.8)
      aimLine.beginPath()
      aimLine.moveTo(hit.x, hit.y)
      aimLine.lineTo(tex, tey)
      aimLine.strokePath()
      drawArrowTip(aimLine, tex, tey, targetAngle, 0xffdd44, 0.8)

      if (centrality < 0.98) {
        const cex = ghostX + Math.cos(deflectAngle) * deflectLength * 0.6
        const cey = ghostY + Math.sin(deflectAngle) * deflectLength * 0.6
        aimLine.lineStyle(1, 0xffffff, 0.25)
        aimLine.beginPath()
        aimLine.moveTo(ghostX, ghostY)
        aimLine.lineTo(cex, cey)
        aimLine.strokePath()
        drawArrowTip(aimLine, cex, cey, deflectAngle, 0xffffff, 0.25)
      }
    }
  } else {
    const wallPoint = raycastToWall(cx, cy, angle)
    drawDottedLine(aimLine, cx, cy, wallPoint.x, wallPoint.y, 0xffffff, 0.2)
    drawArrowTip(aimLine, wallPoint.x, wallPoint.y, angle, 0xffffff, 0.35)
  }
}

// Export debug helpers
export function setSpin(x, y) {
  spinX = Math.max(-1, Math.min(1, x))
  spinY = Math.max(-1, Math.min(1, y))
}

export function getSpin() {
  return { x: spinX, y: spinY }
}
export { drawAimLine }