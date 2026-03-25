const RoomManager = require('../rooms/RoomManager')
const { saveState, getGame } = require('../db/games')

function isUuid(value) {
  return typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

function registerHandlers(io, socket) {
  socket.on('join_room', async ({ roomId, playerId, gameId }) => {
    const room   = RoomManager.getOrCreateRoom(roomId)
    const joined = room.addPlayer(socket, playerId)

    if (!joined) {
      socket.emit('error', { message: 'Room is full' })
      return
    }

    socket.join(roomId)
    socket.data.roomId   = roomId
    socket.data.playerId = playerId
    socket.data.gameId   = gameId

    socket.emit('room_joined', {
      roomId,
      playerId,
      isP1: room.players[0]?.socketId === socket.id,
    })

    if (room.isReady()) {
      const p1Id = room.players[0]?.playerId
      const p2Id = room.players[1]?.playerId

      if (!isUuid(gameId)) {
        room.currentTurn = p1Id
        io.to(roomId).emit('game_start', {
          player1_id: p1Id,
          player2_id: p2Id,
          current_turn: p1Id,
          ballState: room.ballState,
        })
      } else {
        try {
          const game = await getGame(gameId)
          const currentTurn = game.current_turn || p1Id

          room.currentTurn = currentTurn

          io.to(roomId).emit('game_start', {
            player1_id: game.player1_id || p1Id,
            player2_id: game.player2_id || p2Id,
            current_turn: currentTurn,
            ballState: game.ball_state,
          })
          room.gameId = gameId
        } catch (err) {
          console.error('Failed to load game:', err)
        }
      }
    }
  })

  socket.on('turn_complete', async ({ gameId, ballState, nextTurnPlayerId }) => {
    const roomId = socket.data.roomId
    if (!roomId) return

    const room = RoomManager.getRoom(roomId)
    if (!room) return

    if (room.currentTurn !== socket.data.playerId) {
      socket.emit('error', { message: 'Not your turn' })
      return
    }

    if (!ballState || !Array.isArray(ballState)) {
      socket.emit('error', { message: 'Invalid turn state' })
      return
    }

    if (!nextTurnPlayerId) {
      socket.emit('error', { message: 'Missing next turn player' })
      return
    }

    try {
      if (isUuid(gameId)) {
        await saveState(gameId, ballState, nextTurnPlayerId)
      }

      room.ballState = ballState
      room.currentTurn = nextTurnPlayerId

      socket.to(roomId).emit('turn_done', {
        nextTurnPlayerId,
        ballState,
      })
    } catch (err) {
      console.error('Failed to save turn:', err)
      socket.emit('error', { message: 'Failed to save turn' })
    }
  })

  socket.on('game_over', async ({ gameId, winnerId }) => {
    const roomId = socket.data.roomId
    if (!roomId) return

    try {
      const { endGame } = require('../db/games')
      await endGame(gameId, winnerId)
      io.to(roomId).emit('game_over', { winnerId })
    } catch (err) {
      console.error('Failed to end game:', err)
    }
  })

  socket.on('disconnect', () => {
    const roomId = socket.data.roomId
    if (!roomId) return
    const room = RoomManager.getRoom(roomId)
    if (room) {
      room.removePlayer(socket.id)
      socket.to(roomId).emit('opponent_disconnected', {
        message: 'Opponent disconnected. Game saved — they can rejoin.'
      })
      if (room.isEmpty()) RoomManager.deleteRoom(roomId)
    }
  })
}

module.exports = { registerHandlers }
