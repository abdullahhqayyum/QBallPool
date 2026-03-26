import { CUE, BALL, TABLE } from './constants'
import { useGameStore } from "../store/gameStore"
import { getCanvasScale } from './engine'

let aimLine        = null
let powerBar       = null
let pullLine       = null
const MIN_AIM_DISTANCE = 10

const PTR_SMOOTH_ALPHA     = 0.3
const DEFLECT_SMOOTH_ALPHA = 0.25
let   smoothedPtr          = null
let   smoothedDeflect      = null

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

function smoothDeflectEndpoint(raw) {
  if (!smoothedDeflect) {
    smoothedDeflect = { x: raw.x, y: raw.y }
  } else {
    smoothedDeflect = {
      x: smoothedDeflect.x + (raw.x - smoothedDeflect.x) * DEFLECT_SMOOTH_ALPHA,
      y: smoothedDeflect.y + (raw.y - smoothedDeflect.y) * DEFLECT_SMOOTH_ALPHA,
    }
  }
  return smoothedDeflect
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
function clientToGame(scene, clientX, clientY) {
  const canvas = scene.game?.canvas
  if (!canvas) return { x: clientX, y: clientY }
  const rect  = canvas.getBoundingClientRect()
  const scale = rect.width / TABLE.width    // CSS width ÷ logical width
  return {
    x: (clientX - rect.left)  / scale,
    y: (clientY - rect.top)   / scale,
  }
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------
export function setupCue(scene, onShoot) {
  aimLine  = scene.add.graphics()
  powerBar = scene.add.graphics()
  pullLine = scene.add.graphics()

  let dragStart   = null
  let dragCurrent = null
  let power       = 0

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

    dragStart   = null
    dragCurrent = null

    aimLine.clear()
    powerBar.clear()
    if (pullLine) pullLine.clear()
    scene.game.canvas.style.cursor = 'crosshair'

    if (dist < 8 || power < 0.5) { power = 0; return }

    const cueBall = getCueBall(scene)
    if (!cueBall) return

    const aimPtr = smoothedPtr || shotPoint
    const angle  = Math.atan2(cueBall.y - aimPtr.y, cueBall.x - aimPtr.x)

    scene.registry.set('firstCueContactLabel', null)
    scene.registry.set('shotFired', true)
    shootCue(scene, angle, power)
    onShoot(angle, power)
    power = 0
  }

  const renderDrag = (gameX, gameY) => {
    if (!dragStart) return
    const current = { x: gameX, y: gameY }
    const dist    = Math.hypot(current.x - dragStart.x, current.y - dragStart.y)
    power         = Math.min((dist / CUE.dragForMaxPower) * CUE.maxPower, CUE.maxPower)

    const cueBall = getCueBall(scene)
    if (!cueBall) return
    const angle = Math.atan2(cueBall.y - current.y, cueBall.x - current.x)
    drawAimLine(scene, current)
    drawPowerBar(scene, power)
    drawPullLine(scene, dragStart, current, power)
    updateCursor(scene, current, angle)
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

  // ---- Touch events on window (mobile drag-to-aim) -------------------------
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

  // ---- Phaser pointer events (already in game-space) -----------------------
  scene.input.on('pointermove', (ptr) => {
    if (!canShoot(scene)) return
    // Phaser pointer coords are already in game-space — no conversion needed
    if (dragStart) {
      dragCurrent = { x: ptr.x, y: ptr.y }
      renderDrag(ptr.x, ptr.y)
      smoothPointer({ x: ptr.x, y: ptr.y })
    } else {
      const cueBall = getCueBall(scene)
      if (!cueBall) return
      const angle = Math.atan2(cueBall.y - ptr.y, cueBall.x - ptr.x)
      drawAimLine(scene, { x: ptr.x, y: ptr.y })
      updateCursor(scene, { x: ptr.x, y: ptr.y }, angle)
    }
  })

  scene.input.on('pointerdown', (ptr) => {
    if (!canShoot(scene)) return
    dragStart   = { x: ptr.x, y: ptr.y }
    dragCurrent = { x: ptr.x, y: ptr.y }
    power = 0
    smoothedPtr = null; smoothedDeflect = null
  })

  scene.input.on('pointerup', (ptr) => {
    releaseShot(ptr.x, ptr.y)
  })

  const cleanup = () => {
    window.removeEventListener('mousemove',  handleWindowMouseMove)
    window.removeEventListener('mouseup',    handleWindowMouseUp)
    window.removeEventListener('touchmove',  handleWindowTouchMove)
    window.removeEventListener('touchend',   handleWindowTouchEnd)
  }
  scene.events.once('shutdown', cleanup)
  scene.events.once('destroy',  cleanup)
}

export function resetCue(scene) {
  if (aimLine)  aimLine.clear()
  if (powerBar) powerBar.clear()
  if (pullLine) pullLine.clear()
  smoothedPtr = null; smoothedDeflect = null
  if (scene) {
    scene.registry.set('shotFired',           false)
    scene.registry.set('firstCueContactLabel', null)
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

  cueBall.vx = Math.cos(angle) * speed
  cueBall.vy = Math.sin(angle) * speed
}

// ---------------------------------------------------------------------------
// Aim line drawing
// ---------------------------------------------------------------------------
function drawAimLine(scene, ptr) {
  const cueBall = getCueBall(scene)
  if (!cueBall || !aimLine) return

  const sp    = smoothPointer(ptr)
  const angle = Math.atan2(cueBall.y - sp.y, cueBall.x - sp.x)

  const cx = cueBall.x
  const cy = cueBall.y

  aimLine.clear()

  // Cue stick
  aimLine.lineStyle(1.5, 0xd4a96a, 0.6)
  aimLine.beginPath()
  aimLine.moveTo(cx - Math.cos(angle) * BALL.radius, cy - Math.sin(angle) * BALL.radius)
  aimLine.lineTo(cx - Math.cos(angle) * (BALL.radius + 80), cy - Math.sin(angle) * (BALL.radius + 80))
  aimLine.strokePath()

  const hit = getFirstHitBall(scene, cx, cy, angle)

  if (hit) {
    const impact = getImpactGeometry(cueBall, hit, angle)
    if (!impact) {
      const wallPoint = raycastToWall(cx, cy, angle)
      drawDottedLine(aimLine, cx, cy, wallPoint.x, wallPoint.y, 0xffffff, 0.2)
      return
    }

    const { ghostX, ghostY, deflectAngle, centrality } = impact

    drawDottedLine(aimLine, cx, cy, ghostX, ghostY, 0xffffff, 0.35)

    aimLine.lineStyle(1, 0xffffff, 0.3)
    aimLine.strokeCircle(ghostX, ghostY, BALL.radius)

    drawArrowTip(aimLine, ghostX, ghostY, angle, 0xffffff, 0.35)

    const MAX_DEFLECT  = 140
    const MIN_DEFLECT  = 20
    const deflectLength = MIN_DEFLECT + (MAX_DEFLECT - MIN_DEFLECT) * centrality

    const hx    = hit.x
    const hy    = hit.y
    const rawEx = hx + Math.cos(deflectAngle) * deflectLength
    const rawEy = hy + Math.sin(deflectAngle) * deflectLength

    const sde = smoothDeflectEndpoint({ x: rawEx, y: rawEy })
    const smoothDeflectAngle = Math.atan2(sde.y - hy, sde.x - hx)

    aimLine.lineStyle(1.5, 0xffdd44, 0.6)
    aimLine.beginPath()
    aimLine.moveTo(hx, hy)
    aimLine.lineTo(sde.x, sde.y)
    aimLine.strokePath()

    drawArrowTip(aimLine, sde.x, sde.y, smoothDeflectAngle, 0xffdd44, 0.6)

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

  const radiusSum   = BALL.radius * 2
  const radiusSumSq = radiusSum * radiusSum
  const offsetSq    = offset * offset

  if (offsetSq >= radiusSumSq) return null

  const backDist   = Math.sqrt(radiusSumSq - offsetSq)
  const ghostX     = cx + dx * (t - backDist)
  const ghostY     = cy + dy * (t - backDist)
  const deflectAngle = Math.atan2(by - ghostY, bx - ghostX)
  const centrality = 1 - (offset / radiusSum)

  return { ghostX, ghostY, deflectAngle, centrality }
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
  powerBar.fillStyle(0x222222, 0.9)
  powerBar.fillRoundedRect(18, 355, 154, 16, 4)
  powerBar.fillStyle(color, 1)
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
  aimLine.lineTo(cx - Math.cos(angle) * (BALL.radius + 80), cy - Math.sin(angle) * (BALL.radius + 80))
  aimLine.strokePath()

  const hit = getFirstHitBall(scene, cx, cy, angle)

  if (hit) {
    const impact = getImpactGeometry(cueBall, hit, angle)
    if (!impact) {
      const wallPoint = raycastToWall(cx, cy, angle)
      drawDottedLine(aimLine, cx, cy, wallPoint.x, wallPoint.y, 0xffffff, 0.2)
      return
    }
    const { ghostX, ghostY, deflectAngle, centrality } = impact
    drawDottedLine(aimLine, cx, cy, ghostX, ghostY, 0xffffff, 0.35)
    aimLine.lineStyle(1, 0xffffff, 0.3)
    aimLine.strokeCircle(ghostX, ghostY, BALL.radius)
    drawArrowTip(aimLine, ghostX, ghostY, angle, 0xffffff, 0.35)

    const MAX_DEFLECT   = 140
    const MIN_DEFLECT   = 20
    const deflectLength = MIN_DEFLECT + (MAX_DEFLECT - MIN_DEFLECT) * centrality
    const hx    = hit.x
    const hy    = hit.y
    const rawEx = hx + Math.cos(deflectAngle) * deflectLength
    const rawEy = hy + Math.sin(deflectAngle) * deflectLength
    const sde   = smoothDeflectEndpoint({ x: rawEx, y: rawEy })
    const smoothDeflectAngle = Math.atan2(sde.y - hy, sde.x - hx)
    aimLine.lineStyle(1.5, 0xffdd44, 0.6)
    aimLine.beginPath()
    aimLine.moveTo(hx, hy)
    aimLine.lineTo(sde.x, sde.y)
    aimLine.strokePath()
    drawArrowTip(aimLine, sde.x, sde.y, smoothDeflectAngle, 0xffdd44, 0.6)
  } else {
    const wallPoint = raycastToWall(cx, cy, angle)
    drawDottedLine(aimLine, cx, cy, wallPoint.x, wallPoint.y, 0xffffff, 0.2)
    drawArrowTip(aimLine, wallPoint.x, wallPoint.y, angle, 0xffffff, 0.35)
  }
}