import React, { useState } from 'react'
// import { joinRoom } from '../socket/client'

export default function Lobby({ onStart, user, onBack }) {
  const [mode, setMode]       = useState('offline') // 'offline' | 'online' | 'ai'
  const [roomId, setRoomId]   = useState('')
  const [name, setName]       = useState('')

  function handleStart() {
    if (mode === 'online') {
      const room = (roomId || 'room1').trim()
      const fallbackId = `guest-${Date.now()}`
      const userId     = user?.id || fallbackId
      const isGuest    = !!user?.isGuest

      // Initial local placeholders are overwritten by server game_start
      // with real player1_id/player2_id/current_turn once both join.
      const player1Id = userId
      const player2Id = 'opponent'

      onStart({
        mode: 'online',
        game: {
          id: room,
          player1_id: player1Id,
          player2_id: player2Id,
          current_turn: player1Id,
          ball_state: null,
          my_type: null,
        },
        user: {
          ...(user || {}),
          id: userId,
          isGuest,
        }
      })
      return
    }

    // For offline/ai, start immediately
    onStart({ mode, roomId, playerName: name, user })
  }

  return (
    <div>
      {onBack && <button onClick={onBack}>← Back</button>}
      <h1>8-Ball Pool</h1>
      <select value={mode} onChange={e => setMode(e.target.value)}>
        <option value="offline">Local 2P</option>
        <option value="ai">vs AI</option>
        <option value="online">Online</option>
      </select>
      {mode === 'online' && (
        <>
          <input placeholder="Your name" value={name} onChange={e => setName(e.target.value)} />
          <input placeholder="Room ID" value={roomId} onChange={e => setRoomId(e.target.value)} />
        </>
      )}
      <button onClick={handleStart}>Start Game</button>
    </div>
  )
}
