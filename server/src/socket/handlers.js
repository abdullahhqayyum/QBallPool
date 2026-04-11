const RoomManager = require('../rooms/RoomManager')
const { createGame, saveState, getGame, endGame, getOngoingGames, upsertUserStats } = require('../db/games')

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

    // If this room already has a saved DB game and the joining player is
    // a freshly-generated guest id (non-UUID), update the existing guest
    // slot so server-side turn checks use the new socket/playerId.
    if (room.gameId && !isUuid(playerId)) {
      const existingGuestSlot = room.players.find(
        p => !isUuid(p.playerId) && p.socketId !== socket.id
      )
      if (existingGuestSlot) {
        console.log(`[join_room] updating guest slot from ${existingGuestSlot.playerId} to ${playerId}`)
        existingGuestSlot.playerId = playerId
        existingGuestSlot.socketId = socket.id
        // If currentTurn referenced the old guest id, update it to the new one
        if (!isUuid(room.currentTurn) && room.currentTurn === existingGuestSlot.playerId) {
          room.currentTurn = playerId
        }
      }
    }

    console.log(`[join_room] ${playerId} joined ${upper} — now ${room.players.length}/2`)

    socket.emit('room_joined', { roomId: upper, playerId, isP1: room.players.length === 1 })

    if (room.isReady()) {
      const p1Id = room.players[0]?.playerId
      const p2Id = room.players[1]?.playerId

      // If room already has a gameId (set by resume_game), load it instead of creating new
      const existingGameId = room.gameId

      if (existingGameId && isUuid(existingGameId)) {
        // Resume path — room was recreated by resume_game, load saved state
        try {
          const game        = await getGame(existingGameId)
          const currentTurn = game.current_turn || p1Id
          room.currentTurn  = currentTurn

          io.to(upper).emit('game_start', {
            player1_id:   game.player1_id || p1Id,
            player2_id:   game.player2_id || p2Id,
            current_turn: currentTurn,
            ballState:    game.ball_state,
            gameId:       existingGameId,
          })
        } catch (err) {
          console.error('Failed to load existing game:', err)
        }

      } else if (!isUuid(gameId)) {
        // New game path
        room.currentTurn = p1Id
        const eitherIsReal = isUuid(p1Id) || isUuid(p2Id)

        if (eitherIsReal) {
          try {
            const savedGame = await createGame(p1Id, p2Id, room.ballState, upper)
            room.gameId = savedGame.id
            io.to(upper).emit('game_start', {
              player1_id:   p1Id,
              player2_id:   p2Id,
              current_turn: p1Id,
              ballState:    room.ballState,
              gameId:       savedGame.id,
            })
          } catch (err) {
            console.error('Failed to create game in DB:', err)
            io.to(upper).emit('game_start', {
              player1_id:   p1Id,
              player2_id:   p2Id,
              current_turn: p1Id,
              ballState:    room.ballState,
            })
          }
        } else {
          io.to(upper).emit('game_start', {
            player1_id:   p1Id,
            player2_id:   p2Id,
            current_turn: p1Id,
            ballState:    room.ballState,
          })
        }

      } else {
        // gameId is already a UUID (direct resume via join_room)
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

  // ── RESUME: join an existing DB-backed game by its UUID (room key = gameId)
  socket.on('resume_game', async ({ gameId, playerId }) => {
    if (!isUuid(gameId) || !isUuid(playerId)) {
      socket.emit('error', { message: 'Invalid resume parameters.' })
      return
    }

    // Load game first so we have the room_code
    let game
    try {
      game = await getGame(gameId)
    } catch (err) {
      console.error('[resume_game] Failed to load game:', err)
      socket.emit('error', { message: 'Could not load saved game.' })
      return
    }

    const roomCode = game.room_code

    // Create/get room under UUID key
    let room = RoomManager.getRoom(gameId)
    if (!room) {
      RoomManager.createRoom(gameId)
      room = RoomManager.getRoom(gameId)
    }

    // Also re-register under the original room code so guests can rejoin with it
    if (roomCode && !RoomManager.getRoom(roomCode)) {
      RoomManager.rooms.set(roomCode, room)
    }

    const alreadyIn = room.players.some(p => p.playerId === playerId)
    if (!alreadyIn) {
      if (room.players.length >= 2) {
        socket.emit('error', { message: 'Room is already full.' })
        return
      }
      room.addPlayer(socket, playerId)
    }

    socket.join(gameId)
    if (roomCode) socket.join(roomCode)
    socket.data.roomId   = gameId
    socket.data.playerId = playerId
    socket.data.gameId   = gameId

    const p1Id        = game.player1_id
    const p2Id        = game.player2_id
    const currentTurn = game.current_turn || p1Id
    room.currentTurn  = currentTurn
    room.gameId       = gameId

    console.log(`[resume_game] ${playerId} joined room ${gameId} (code: ${roomCode}) — ${room.players.length}/2`)

    // Migrate any existing guest socket from the short code room into the UUID room
    if (roomCode) {
      const theIo = socket.server || io
      try {
        theIo.sockets.sockets.forEach(s => {
          if (s.data?.roomId === roomCode && s.id !== socket.id) {
            s.leave(roomCode)
            s.join(gameId)
            s.data.roomId = gameId
            // Add to room players if not already present
            if (!room.players.some(p => p.socketId === s.id)) {
              room.players.push({ socketId: s.id, playerId: s.data.playerId })
            }
            console.log(`[resume_game] migrated ${s.data?.playerId} from ${roomCode} to ${gameId}`)
          }
        })
      } catch (err) {
        console.error('[resume_game] failed to migrate guest sockets:', err)
      }
    }

    // Emit game_start immediately to this player — don't wait for opponent
    socket.emit('game_start', {
      player1_id:   p1Id,
      player2_id:   p2Id,
      current_turn: currentTurn,
      ballState:    game.ball_state,
      gameId,
    })

    // If opponent is also here, notify them too
    if (room.isReady()) {
      socket.to(gameId).emit('game_start', {
        player1_id:   p1Id,
        player2_id:   p2Id,
        current_turn: currentTurn,
        ballState:    game.ball_state,
        gameId,
      })
    }
  })

  socket.on('turn_complete', async ({ gameId, ballState, nextTurnPlayerId, ballInHand, shooterType, receiverType }) => {
    console.log('[turn_complete] gameId:', gameId, 'isUuid:', isUuid(gameId), 'ballState length:', ballState?.length)
    const roomId = socket.data.roomId
    console.log('[turn_complete] socket.data.roomId:', roomId)
    if (!roomId) return

    const room = RoomManager.getRoom(roomId)
    console.log('[turn_complete] room players:', room?.players?.map(p => `${p.playerId}(${p.socketId})`))
    if (!room) return

    // Client sends room code as gameId — use room.gameId (UUID) instead
    const realGameId = isUuid(gameId) ? gameId : room.gameId

    // Allow turn when currentTurn matches socket playerId, or when both are
    // ephemeral guest IDs (non-UUID). This handles guest reconnections where
    // a new guest id was generated.
    const isCorrectTurn = room.currentTurn === socket.data.playerId ||
      (!isUuid(room.currentTurn) && !isUuid(socket.data.playerId))

    if (!isCorrectTurn) {
      socket.emit('error', { message: 'Not your turn' })
      return
    }

    // If currentTurn references an old ephemeral guest id, sync it to the
    // new socket.playerId so future checks and saves align with the reconnect.
    if (!isUuid(room.currentTurn) && socket.data.playerId !== room.currentTurn) {
      console.log(`[turn_complete] guest ID drift: updating currentTurn from ${room.currentTurn} to ${socket.data.playerId}`)
      // Update currentTurn and the guest slot in room.players
      const oldGuestId = room.currentTurn
      room.currentTurn = socket.data.playerId
      const guestSlot = room.players.find(p => !isUuid(p.playerId))
      if (guestSlot) guestSlot.playerId = socket.data.playerId
      // Also ensure any saved references to the old guest id don't block logic
      // (we don't remove the old id elsewhere to preserve auditability)
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
      if (isUuid(realGameId)) {
        await saveState(realGameId, ballState, nextTurnPlayerId)
        console.log('[turn_complete] saved state for gameId:', realGameId)
      }

      room.ballState   = ballState
      room.currentTurn = nextTurnPlayerId

      console.log('[turn_complete] emitting turn_done to room:', roomId)
      socket.to(roomId).emit('turn_done', {
        nextTurnPlayerId,
        ballState,
        ballInHand:   !!ballInHand,
        shooterType:  shooterType  || null,
        receiverType: receiverType || null,
      })
    } catch (err) {
      console.error('Failed to save turn:', err)
      socket.emit('error', { message: 'Failed to save turn' })
    }
    })

    // Relay live ball positions to the other player (no server-side logic)
    socket.on('ball_positions', ({ positions }) => {
      const roomId = socket.data.roomId
      if (!roomId) return
      socket.to(roomId).emit('ball_positions', { positions })
    })

    socket.on('get_ongoing_games', async ({ userId }) => {
      if (!isUuid(userId)) return
      try {
        const games = await getOngoingGames(userId)
        socket.emit('ongoing_games', { games })
      } catch (err) {
        console.error('Failed to fetch ongoing games:', err)
        socket.emit('error', { message: 'Could not load ongoing games' })
      }
  })

  // Rematch flow: players can request a rematch; when both have requested start a fresh game
    socket.on('rematch_request', async () => {
    const roomId = socket.data.roomId
    if (!roomId) return
    const room = RoomManager.getRoom(roomId)
    if (!room) return

    if (!room.rematchVotes) room.rematchVotes = new Set()
    room.rematchVotes.add(socket.data.playerId)

    // Tell the opponent someone wants a rematch
    socket.to(roomId).emit('rematch_requested')

    // Both players voted — start rematch
    // Replace the "Both players voted" block inside socket.on('rematch_request', ...)
        if (room.rematchVotes.size >= 2) {
          room.rematchVotes.clear()
          room.ballState   = null
          room.state       = 'playing'
          room.currentTurn = room.players[0]?.playerId || null

          const p1Id = room.players[0]?.playerId
          const p2Id = room.players[1]?.playerId

          // Create a fresh DB game for the rematch so it appears in game list
          // and can be resumed if anyone disconnects
          if (isUuid(p1Id) || isUuid(p2Id)) {
            try {
              const newGame = await createGame(p1Id, p2Id, null, room.id)
              room.gameId = newGame.id

              io.to(roomId).emit('rematch_start', {
                player1_id:   p1Id,
                player2_id:   p2Id,
                current_turn: room.currentTurn,
                gameId:       newGame.id,
              })
            } catch (err) {
              console.error('[rematch] failed to create new game:', err)
              io.to(roomId).emit('rematch_start', {
                player1_id:   p1Id,
                player2_id:   p2Id,
                current_turn: room.currentTurn,
              })
            }
          } else {
            io.to(roomId).emit('rematch_start', {
              player1_id:   p1Id,
              player2_id:   p2Id,
              current_turn: room.currentTurn,
            })
          }
        }
  })

  socket.on('rematch_cancel', () => {
    const roomId = socket.data.roomId
    if (!roomId) return
    const room = RoomManager.getRoom(roomId)
    if (!room) return
    room.rematchVotes?.delete(socket.data.playerId)
  })

  socket.on('game_over', async ({ gameId, winnerId, loserId }) => {
    const roomId = socket.data.roomId
    if (!roomId) return

    const room = RoomManager.getRoom(roomId)
    if (room && typeof room.finish === 'function') room.finish()

    io.to(roomId).emit('game_over', { winnerId })

    // Use room.gameId as fallback same as turn_complete
    const realGameId = isUuid(gameId) ? gameId : room?.gameId

    if (isUuid(realGameId)) {
      try {
        const realWinnerId = isUuid(winnerId) ? winnerId : null
        await endGame(realGameId, realWinnerId)
        if (isUuid(winnerId)) await upsertUserStats(winnerId, true)
        if (isUuid(loserId))  await upsertUserStats(loserId, false)
      } catch (err) {
        console.error('Failed to save game result:', err)
      }
    }
  })

  socket.on('disconnect', () => {
    console.log('[disconnect] socket.data.roomId:', socket.data.roomId, 'playerId:', socket.data.playerId)
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