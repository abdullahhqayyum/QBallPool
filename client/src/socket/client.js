import { io } from 'socket.io-client'

const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:3001'
const socket     = io(SERVER_URL, { autoConnect: false })

let _scene = null
let _onTurnDone = null
let _onGameOver = null
let _onRematchRequested = null
let _onRematchStart     = null

export function setScene(scene) { _scene = scene }
export function setOnTurnDone(cb) { _onTurnDone = cb }
export function setOnGameOver(cb) { _onGameOver = cb }
export function setOnRematchRequested(cb) { _onRematchRequested = cb }
export function setOnRematchStart(cb)     { _onRematchStart     = cb }

export function connectSocket()    { socket.connect() }
export function disconnectSocket() { socket.disconnect() }

export function joinRoom(roomId, playerId, gameId) {
  // Avoid repeated connect calls while a connection is already in progress.
  if (!socket.connected && !socket.active) socket.connect()
  // Server expects `code`; keep `roomId` too for compatibility/debugging.
  socket.emit('join_room', { code: roomId, roomId, playerId, gameId })
}

export function resumeGame(gameId, playerId) {
  if (!socket.connected && !socket.active) socket.connect()
  socket.emit('resume_game', { gameId, playerId })
}

export function sendTurnComplete(gameId, ballState, nextTurnPlayerId, ballInHand, shooterType, receiverType) {
  socket.emit('turn_complete', { gameId, ballState, nextTurnPlayerId, ballInHand, shooterType, receiverType })
}

export function sendBallPositions(positions) {
  if (socket.connected) socket.emit('ball_positions', { positions })
}

export function sendGameOver(gameId, winnerId) {
  socket.emit('game_over', { gameId, winnerId })
}

export function sendRematchRequest() { socket.emit('rematch_request') }
export function sendRematchCancel()  { socket.emit('rematch_cancel') }

function processTurnDone({ nextTurnPlayerId, ballState, ballInHand, shooterType, receiverType }) {
  if (!_scene) return
  const userId = _scene.registry.get('userId')
  const isMyTurn = nextTurnPlayerId === userId
  console.log('[turn_done processed] nextTurnPlayerId:', nextTurnPlayerId, 'userId:', userId, 'isMyTurn:', isMyTurn)
  // Clear interpolation targets — turn_done gives us authoritative positions
  Object.keys(remoteTargets).forEach(k => delete remoteTargets[k])
  _scene.registry.set('myTurn', isMyTurn)
  if (_onTurnDone) {
    _onTurnDone(ballState, isMyTurn, ballInHand, shooterType, receiverType)
  }
}

socket.on('turn_done', ({ nextTurnPlayerId, ballState, ballInHand, shooterType, receiverType }) => {
  // Buffer the event if scene isn't ready yet — retry until it is
  if (!_scene) {
    const retry = setInterval(() => {
      if (!_scene) return
      clearInterval(retry)
      processTurnDone({ nextTurnPlayerId, ballState, ballInHand, shooterType, receiverType })
    }, 200)
    return
  }
  processTurnDone({ nextTurnPlayerId, ballState, ballInHand, shooterType, receiverType })
})

socket.on('rematch_requested', () => {
  if (_onRematchRequested) _onRematchRequested()
})

socket.on('rematch_start', ({ player1_id, player2_id, current_turn, gameId }) => {
  if (_onRematchStart) _onRematchStart({ player1_id, player2_id, current_turn, gameId })
})

// Target positions for smooth interpolation — keyed by ball label
export const remoteTargets = {}

socket.on('ball_positions', ({ positions }) => {
  if (!_scene) return
  if (_scene.registry.get('myTurn')) return

  positions.forEach(({ label, x, y, pocketed }) => {
    if (pocketed) {
      const balls = _scene.registry.get('balls') || []
      const ball  = balls.find(b => b.label === label)
      if (ball && !ball.pocketed) {
        ball.pocketed = true
        ball.x = x
        ball.y = y
        if (ball.gfx) ball.gfx.setVisible(false)
      }
    } else {
      remoteTargets[label] = { x, y }
    }
  })
})

socket.on('opponent_disconnected', ({ message }) => {
  console.warn(message)
  if (_scene) {
    _scene.registry.set('opponentDisconnected', true)
  }
})

socket.on('game_start', ({ player1_id, player2_id, current_turn, ballState, gameId }) => {
  console.log('[game_start received] ballState:', !!ballState, 'scene exists:', !!_scene)
  console.log('[game_start received] balls in scene:', _scene?.registry?.get('balls')?.length)
  if (!_scene) return
  _scene.registry.set('opponentDisconnected', false)

  const userId = _scene.registry.get('userId')

  _scene.registry.set('player1_id', player1_id)
  _scene.registry.set('player2_id', player2_id)
  _scene.registry.set('opponentId', userId === player1_id ? player2_id : player1_id)
  _scene.registry.set('myTurn', current_turn === userId)

  if (ballState) {
    const sceneBalls = _scene.registry.get('balls')
    if (sceneBalls && sceneBalls.length > 0) {
      import('../game/balls').then(({ rehydrateBalls }) => {
        try {
          rehydrateBalls(_scene, ballState)
        } catch (err) {
          console.error('[socket] rehydrateBalls failed', err)
          _scene.registry.set('remoteBallState', ballState)
        }
      }).catch(err => {
        console.error('[socket] import rehydrateBalls failed', err)
        _scene.registry.set('remoteBallState', ballState)
      })
    } else {
      _scene.registry.set('remoteBallState', ballState)
    }
  }

  console.log(
    'Game start — I am:', userId,
    '| P1:', player1_id,
    '| P2:', player2_id,
    '| myTurn:', current_turn === userId,
  )
})

socket.on('game_over', ({ winnerId }) => {
  if (!_scene) return
  const userId = _scene.registry.get('userId')
  _scene.registry.set('gameResult', winnerId === userId ? 'win' : 'loss')
  const result = winnerId === userId ? 'win' : 'loss'
  if (_onGameOver) _onGameOver(result)
})

socket.on('error', ({ message }) => {
  console.error('Socket error:', message)
})

export default socket
