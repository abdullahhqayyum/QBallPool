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
  1:  0xf5c518, 2:  0x1a66cc, 3:  0xff3300,
  4:  0x6600cc, 5:  0xff6600, 6:  0x006600,
  7:  0x990000, 8:  0x111111,
  9:  0xf5c518, 10: 0x1a66cc, 11: 0xff3300,
  12: 0x6600cc, 13: 0xff6600, 14: 0x006600,
  15: 0x990000,
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

function makeGfx(scene, type, color, x, y) {
  if (type === 'stripe') {
    const outer = scene.add.circle(0, 0, BALL.radius, 0xffffff)
    const inner = scene.add.circle(0, 0, BALL.radius * 0.62, color)
    return scene.add.container(x, y, [outer, inner])
  }
  return scene.add.circle(x, y, BALL.radius, color)
}

export function createBalls(scene) {
  const balls = []

  // Cue ball
  const cue = makeBallState('cue', 'cue', CUE_BALL_POS.x, CUE_BALL_POS.y)
  cue.gfx = scene.add.circle(CUE_BALL_POS.x, CUE_BALL_POS.y, BALL.radius, 0xffffff)
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
      ball.gfx     = makeGfx(scene, type, color, x, y)
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

    const number = parseInt(label.split('-')[1]) || null
    const color  = type === 'cue' ? 0xffffff : BALL_COLORS[number] || 0x888888

    const ball = makeBallState(label, type, x, y)
    ball.number   = number
    ball.vx       = vx
    ball.vy       = vy
    ball.pocketed = pocketed

    if (!pocketed) {
      ball.gfx = makeGfx(scene, type, color, x, y)
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