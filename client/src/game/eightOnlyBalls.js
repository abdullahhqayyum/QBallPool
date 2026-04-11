import { BALL, TABLE } from './constants'
import { useGameStore } from '../store/gameStore'

const BALL_COLORS = { 8: '#111111' }

function makeBallTexture(scene, number, type) {
  const key = `ball_tex_${number}`
  if (scene.textures.exists(key)) return key

  const D   = BALL.radius * 2
  const res = 3
  const sz  = Math.ceil(D * res)
  const rr  = BALL.radius * res
  const cx  = sz / 2
  const cy  = sz / 2

  const cv  = document.createElement('canvas')
  cv.width  = sz
  cv.height = sz
  const ctx = cv.getContext('2d')

  const isCue = type === 'cue'
  const grad  = ctx.createRadialGradient(cx - rr*0.3, cy - rr*0.35, rr*0.05, cx, cy, rr)
  if (isCue) {
    grad.addColorStop(0, '#ffffff')
    grad.addColorStop(1, '#aaaaaa')
  } else {
    grad.addColorStop(0, '#555555')
    grad.addColorStop(1, '#000000')
  }
  ctx.beginPath()
  ctx.arc(cx, cy, rr, 0, Math.PI * 2)
  ctx.fillStyle = grad
  ctx.fill()

  if (!isCue) {
    // White dot
    ctx.beginPath()
    ctx.arc(cx, cy, rr * 0.38, 0, Math.PI * 2)
    ctx.fillStyle = '#ffffff'
    ctx.fill()
    // Number
    const fontSize = Math.round(rr * 0.62)
    ctx.font = `bold ${fontSize}px Arial`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = '#ffffff'
    ctx.fillText('8', cx, cy + fontSize * 0.05)
  }

  // Gloss
  const gloss = ctx.createRadialGradient(cx-rr*0.28, cy-rr*0.32, 0, cx-rr*0.18, cy-rr*0.22, rr*0.38)
  gloss.addColorStop(0, 'rgba(255,255,255,0.55)')
  gloss.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.beginPath()
  ctx.arc(cx, cy, rr, 0, Math.PI * 2)
  ctx.fillStyle = gloss
  ctx.fill()

  scene.textures.addCanvas(key, cv)
  return key
}

export function createEightOnlyBalls(scene) {
  const balls = []

  // Cue ball
  const cueKey = makeBallTexture(scene, 0, 'cue')
  const cue = {
    label: 'cue', type: 'cue',
    x: TABLE.playX1 + (TABLE.playX2 - TABLE.playX1) * 0.25,
    y: TABLE.height / 2,
    vx: 0, vy: 0, pocketed: false,
    _collidedWith: null, _railHit: false,
  }
  cue.gfx = scene.add.image(cue.x, cue.y, cueKey)
  cue.gfx.setDisplaySize(BALL.radius * 2, BALL.radius * 2)
  balls.push(cue)

  // 8 ball
  const eightKey = makeBallTexture(scene, 8, '8ball')
  const eight = {
    label: '8ball-8', type: '8ball',
    x: TABLE.playX1 + (TABLE.playX2 - TABLE.playX1) * 0.65,
    y: TABLE.height / 2,
    vx: 0, vy: 0, pocketed: false,
    _collidedWith: null, _railHit: false,
  }
  eight.gfx = scene.add.image(eight.x, eight.y, eightKey)
  eight.gfx.setDisplaySize(BALL.radius * 2, BALL.radius * 2)
  balls.push(eight)

  scene.registry.set('balls', balls)

  // Pretend all colored balls are already pocketed
  // so pocket call triggers correctly
  // Types and breakDone are intentionally NOT set here — the scene
  // will assign correct types based on the local player identity.

  // Force pocket call to appear immediately — pretend all balls are cleared
  scene.registry.set('calledPocket', null)
  useGameStore.setSelectingPocket(true)
  useGameStore.setCalledPocket(null)

  return balls
}
