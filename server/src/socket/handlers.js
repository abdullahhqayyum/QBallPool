const RoomManager = require('../rooms/RoomManager')
const { saveState, getGame } = require('../db/games')

function isUuid(value) {
  return typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

function registerHandlers(io, socket) {
  // ── HOST: just reserve the code — do NOT add player yet ─────────────────
  socket.on('create_room', ({ code }) => {
    const upper = (code || '').trim().toUpperCase()
    const existing = RoomManager.getRoom(upper)
    console.log(`[create_room] code=${upper} exists=${!!existing} socket=${socket.id}`)
    if (!existing) RoomManager.createRoom(upper)
    socket.emit('room_created', { code: upper })
  })

  // ── BOTH PLAYERS join via join_room ───────────────────────────────────────
  socket.on('join_room', async ({ code, playerId, gameId }) => {
    const upper = (code || '').trim().toUpperCase()
    const room = RoomManager.getRoom(upper)

    console.log(`[join_room] code=${upper} playerId=${playerId} socket=${socket.id} roomExists=${!!room} players=${room?.players?.length ?? 'N/A'}`)
    if (room) {
      console.log(`[join_room] current players:`, room.players.map(p => `${p.playerId}(${p.socketId})`))
    }

    if (!room) {
      socket.emit('error', { message: 'Room not found. Check the code and try again.' })
      return
    }

    const alreadyIn = room.players.some(p => p.playerId === playerId)
    console.log(`[join_room] alreadyIn=${alreadyIn}`)
    if (alreadyIn) {
      socket.join(upper)
      socket.data.roomId   = upper
      socket.data.playerId = playerId
      return
    }

    if (room.players.length >= 2) {
      console.log(`[join_room] FULL — rejecting ${playerId}`)
      socket.emit('error', { message: 'Room is already full.' })
      return
    }

    room.addPlayer(socket, playerId)
    socket.join(upper)
    socket.data.roomId   = upper
    socket.data.playerId = playerId
    socket.data.gameId   = gameId

    console.log(`[join_room] ${playerId} joined ${upper} — now ${room.players.length}/2`)

    socket.emit('room_joined', { roomId: upper, playerId, isP1: room.players.length === 1 })

    if (room.isReady()) {
      const p1Id = room.players[0]?.playerId
      const p2Id = room.players[1]?.playerId

      if (!isUuid(gameId)) {
        room.currentTurn = p1Id
        io.to(upper).emit('game_start', {
          player1_id:   p1Id,
          player2_id:   p2Id,
          current_turn: p1Id,
          ballState:    room.ballState,
        })
      } else {
        try {
          const game        = await getGame(gameId)
          const currentTurn = game.current_turn || p1Id
          room.currentTurn  = currentTurn
          room.gameId       = gameId
          io.to(upper).emit('game_start', {
            player1_id:   game.player1_id || p1Id,
            player2_id:   game.player2_id || p2Id,
            current_turn: currentTurn,
            ballState:    game.ball_state,
          })
        } catch (err) {
          console.error('Failed to load game:', err)
        }
      }
    }
  })

  socket.on('turn_complete', async ({ gameId, ballState, nextTurnPlayerId, ballInHand }) => {
    console.log('[turn_complete] received, ballInHand:', ballInHand, 'nextTurn:', nextTurnPlayerId)
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
        ballInHand: !!ballInHand,
      })
    } catch (err) {
      console.error('Failed to save turn:', err)
      socket.emit('error', { message: 'Failed to save turn' })
    }
  })

  socket.on('game_over', async ({ gameId, winnerId }) => {
    const roomId = socket.data.roomId
    if (!roomId) return

    // Always tell both players the game is over — never gate on DB
    io.to(roomId).emit('game_over', { winnerId })

    // Persist result only when we have real UUIDs (not guest room codes)
    if (isUuid(gameId) && isUuid(winnerId)) {
      try {
        const { endGame } = require('../db/games')
        await endGame(gameId, winnerId)
      } catch (err) {
        console.error('Failed to save game result:', err)
      }
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