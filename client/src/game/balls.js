import { BALL, TABLE } from './constants'

const CUE_BALL_POS = {
  x: TABLE.playX1 + (TABLE.playX2 - TABLE.playX1) * 0.25,
  y: TABLE.height / 2,
}
const RACK_TIP    = {
  x: TABLE.playX1 + (TABLE.playX2 - TABLE.playX1) * 0.65,
  y: TABLE.height / 2,
}
const ROW_SPACING = BALL.radius * 2.05
const COL_SPACING = BALL.radius * 2.05 * Math.sin(Math.PI / 3)

const BALL_ORDER = [
  1,
  9,  2,
  3,  8,  10,
  4,  14, 15, 11,
  7,  5,  6,  12, 13,
]

const BALL_COLORS = {
  1:  '#f5c518', 2:  '#1a55cc', 3:  '#dd2200',
  4:  '#5500bb', 5:  '#ff6600', 6:  '#00aa44',
  7:  '#aa0000', 8:  '#111111',
  9:  '#f5c518', 10: '#1a55cc', 11: '#dd2200',
  12: '#5500bb', 13: '#ff6600', 14: '#00aa44',
  15: '#aa0000',
}

function getBallType(number) {
  if (number === 8) return '8ball'
  if (number <= 7)  return 'solid'
  return 'stripe'
}

// Create a plain-JS ball state object (no Matter body)
function makeBallState(label, type, x, y) {
  return {
    label,
    type,
    x,
    y,
    vx: 0,
    vy: 0,
    pocketed: false,
    // Collision tracking — reset each frame by engine
    _collidedWith: null,
    _railHit: false,
  }
}

function lighten(hex, amt) {
  const n = parseInt(hex.slice(1), 16)
  const r = Math.min(255, ((n >> 16) & 0xff) + Math.round(255 * amt))
  const g = Math.min(255, ((n >> 8)  & 0xff) + Math.round(255 * amt))
  const b = Math.min(255, ( n        & 0xff) + Math.round(255 * amt))
  return `rgb(${r},${g},${b})`
}

function darken(hex, amt) {
  const n = parseInt(hex.slice(1), 16)
  const r = Math.max(0, ((n >> 16) & 0xff) - Math.round(255 * amt))
  const g = Math.max(0, ((n >> 8)  & 0xff) - Math.round(255 * amt))
  const b = Math.max(0, ( n        & 0xff) - Math.round(255 * amt))
  return `rgb(${r},${g},${b})`
}

function makeBallTexture(scene, number, type) {
  const key = `ball_tex_${number}`
  if (scene.textures.exists(key)) return key

  const D    = BALL.radius * 2
  const R    = BALL.radius
  const res  = 3
  const sz   = Math.ceil(D * res)
  const rr   = R * res

  const cv   = document.createElement('canvas')
  cv.width   = sz
  cv.height  = sz
  const ctx  = cv.getContext('2d')

  const cx   = sz / 2
  const cy   = sz / 2

  const isCue    = type === 'cue'
  const is8ball  = type === '8ball'
  const isStripe = type === 'stripe'
  const color    = isCue ? '#ffffff' : BALL_COLORS[number]

  const baseGrad = ctx.createRadialGradient(
    cx - rr * 0.3, cy - rr * 0.35, rr * 0.05,
    cx,            cy,             rr
  )
  if (isCue) {
    baseGrad.addColorStop(0,    '#ffffff')
    baseGrad.addColorStop(0.55, '#e8e8e8')
    baseGrad.addColorStop(1,    '#aaaaaa')
  } else {
    baseGrad.addColorStop(0,    lighten(color, 0.7))
    baseGrad.addColorStop(0.4,  lighten(color, 0.15))
    baseGrad.addColorStop(0.85, color)
    baseGrad.addColorStop(1,    darken(color, 0.45))
  }
  ctx.beginPath()
  ctx.arc(cx, cy, rr, 0, Math.PI * 2)
  ctx.fillStyle = baseGrad
  ctx.fill()

  if (isStripe) {
    ctx.save()
    ctx.beginPath()
    ctx.arc(cx, cy, rr, 0, Math.PI * 2)
    ctx.clip()

    const bandH = rr * 0.9
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, cy - bandH / 2, sz, bandH)

    const capGrad = ctx.createRadialGradient(
      cx - rr * 0.3, cy - rr * 0.35, rr * 0.05,
      cx, cy, rr
    )
    capGrad.addColorStop(0,    lighten(color, 0.7))
    capGrad.addColorStop(0.4,  lighten(color, 0.15))
    capGrad.addColorStop(0.85, color)
    capGrad.addColorStop(1,    darken(color, 0.45))

    ctx.fillStyle = capGrad
    ctx.fillRect(0, 0,              sz, cy - bandH / 2)
    ctx.fillRect(0, cy + bandH / 2, sz, sz - (cy + bandH / 2))

    ctx.restore()
  }

  if (!isCue) {
    const circR = rr * (isStripe ? 0.42 : 0.48)
    ctx.beginPath()
    ctx.arc(cx, cy, circR, 0, Math.PI * 2)
    ctx.fillStyle = '#ffffff'
    ctx.fill()
  }

  if (!isCue) {
    const fontSize = Math.round(rr * (number >= 10 ? 0.52 : 0.62))
    ctx.font        = `bold ${fontSize}px Arial, sans-serif`
    ctx.textAlign   = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillStyle   = is8ball ? '#ffffff' : '#111111'
    ctx.fillText(String(number), cx, cy + fontSize * 0.05)
  }

  const glossGrad = ctx.createRadialGradient(
    cx - rr * 0.28, cy - rr * 0.32, 0,
    cx - rr * 0.18, cy - rr * 0.22, rr * 0.38
  )
  glossGrad.addColorStop(0,   'rgba(255,255,255,0.55)')
  glossGrad.addColorStop(0.5, 'rgba(255,255,255,0.12)')
  glossGrad.addColorStop(1,   'rgba(255,255,255,0)')
  ctx.beginPath()
  ctx.arc(cx, cy, rr, 0, Math.PI * 2)
  ctx.fillStyle = glossGrad
  ctx.fill()

  const rimGrad = ctx.createRadialGradient(cx, cy, rr * 0.72, cx, cy, rr)
  rimGrad.addColorStop(0,   'rgba(0,0,0,0)')
  rimGrad.addColorStop(1,   'rgba(0,0,0,0.45)')
  ctx.beginPath()
  ctx.arc(cx, cy, rr, 0, Math.PI * 2)
  ctx.fillStyle = rimGrad
  ctx.fill()

  scene.textures.addCanvas(key, cv)
  return key
}

function makeGfx(scene, type, color, x, y, number) {
  const key    = makeBallTexture(scene, number, type)
  const sprite = scene.add.image(x, y, key)
  sprite.setDisplaySize(BALL.radius * 2, BALL.radius * 2)
  return sprite
}

export function createBalls(scene) {
  const balls = []

  // Cue ball
  const cue = makeBallState('cue', 'cue', CUE_BALL_POS.x, CUE_BALL_POS.y)
  const cueKey = makeBallTexture(scene, 0, 'cue')
  cue.gfx = scene.add.image(CUE_BALL_POS.x, CUE_BALL_POS.y, cueKey)
  cue.gfx.setDisplaySize(BALL.radius * 2, BALL.radius * 2)
  balls.push(cue)

  // Object balls
  let idx = 0
  for (let row = 0; row < 5; row++) {
    for (let col = 0; col <= row; col++) {
      const number = BALL_ORDER[idx++]
      const type   = getBallType(number)
      const color  = BALL_COLORS[number]
      const x      = RACK_TIP.x + row * COL_SPACING
      const y      = RACK_TIP.y - row * ROW_SPACING / 2 + col * ROW_SPACING

      const ball   = makeBallState(`${type}-${number}`, type, x, y)
      ball.number  = number
      ball.gfx     = makeGfx(scene, type, color, x, y, number)
      balls.push(ball)
    }
  }

  scene.registry.set('balls', balls)
  return balls
}

export function rehydrateBalls(scene, ballState) {
  const existing = scene.registry.get('balls') || []
  existing.forEach(b => { try { b.gfx?.destroy() } catch {} })

  const balls = []

  ;(ballState || []).forEach(({ label, x, y, vx = 0, vy = 0, pocketed }) => {
    const type   = label === 'cue'              ? 'cue'
                 : label.startsWith('solid')    ? 'solid'
                 : label.startsWith('stripe')   ? 'stripe'
                 : label.startsWith('8ball')    ? '8ball'
                 : 'unknown'

    const number = type === 'cue' ? 0 : (parseInt(label.split('-')[1]) || null)
    const color  = type === 'cue' ? 0xffffff : BALL_COLORS[number] || 0x888888

    const ball = makeBallState(label, type, x, y)
    ball.number   = number
    ball.vx       = vx
    ball.vy       = vy
    ball.pocketed = pocketed

    if (!pocketed) {
      ball.gfx = makeGfx(scene, type, color, x, y, number)
    }

    balls.push(ball)
  })

  scene.registry.set('balls', balls)
  return balls
}

export function syncBallGraphics(scene) {
  const balls = scene.registry.get('balls') || []
  balls.forEach(ball => {
    if (!ball.pocketed && ball.gfx) {
      ball.gfx.setPosition(ball.x, ball.y)
    }
  })
}

export function areBallsMoving(scene) {
  const balls = scene.registry.get('balls') || []
  return balls.some(b =>
    !b.pocketed && (Math.abs(b.vx) > MIN_SPEED_THRESHOLD || Math.abs(b.vy) > MIN_SPEED_THRESHOLD)
  )
}
const MIN_SPEED_THRESHOLD = 0.08

export function getBallState(scene) {
  const balls = scene.registry.get('balls') || []
  return balls.map(b => ({
    label:    b.label,
    x:        b.x,
    y:        b.y,
    vx:       b.vx,
    vy:       b.vy,
    pocketed: b.pocketed,
  }))
}