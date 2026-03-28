import React, { useState } from 'react'

export default function Lobby({ onStart, user }) {
  const [mode,   setMode]   = useState('offline')
  const [roomId, setRoomId] = useState('')

  function handleStart() {
    if (mode === 'ai') return

    if (mode === 'online') {
      const room     = (roomId || `room-${Date.now()}`).trim()
      const userId   = user?.id || `guest-${Date.now()}`
      onStart({
        mode: 'online',
        game: {
          id:           room,
          player1_id:   userId,
          player2_id:   'opponent',
          current_turn: userId,
          ball_state:   null,
          my_type:      null,
        },
        user: { ...(user || {}), id: userId, isGuest: true },
      })
      return
    }

    onStart({ mode, user })
  }

  const modeLabels = { offline: 'Local 2P', ai: 'vs AI', online: 'Online' }

  return (
    <div style={{
      minHeight:      '100dvh',
      background:     '#0a0a0a',
      display:        'flex',
      flexDirection:  'column',
      alignItems:     'center',
      justifyContent: 'center',
      fontFamily:     'monospace',
      padding:        24,
      gap:            32,
    }}>

      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 48, marginBottom: 4 }}>🎱</div>
        <h1 style={{ color: '#fff', fontSize: 32, margin: 0, letterSpacing: 2 }}>8-BALL</h1>
        <div style={{ color: '#555', fontSize: 12, marginTop: 4 }}>BETA</div>
      </div>

      <div style={{ display: 'flex', gap: 10 }}>
        {['offline', 'ai', 'online'].map(m => (
          <button
            key={m}
            onClick={() => setMode(m)}
            style={{
              padding:      '10px 20px',
              borderRadius: 8,
              border:       mode === m ? '2px solid #1a6b2a' : '2px solid #333',
              background:   mode === m ? '#1a6b2a' : '#111',
              color:        m === 'ai' ? '#555' : '#fff',
              cursor:       m === 'ai' ? 'not-allowed' : 'pointer',
              fontSize:     13,
              fontFamily:   'monospace',
              fontWeight:   mode === m ? 'bold' : 'normal',
              transition:   'all 0.15s',
            }}
          >
            {modeLabels[m]}
            {m === 'ai' && <div style={{ fontSize: 9, color: '#444', marginTop: 2 }}>coming soon</div>}
          </button>
        ))}
      </div>

      {mode === 'online' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%', maxWidth: 280 }}>
          <input
            placeholder="Room ID (leave blank for new room)"
            value={roomId}
            onChange={e => setRoomId(e.target.value)}
            style={{
              padding:      '10px 14px',
              borderRadius: 8,
              border:       '1px solid #333',
              background:   '#111',
              color:        '#fff',
              fontFamily:   'monospace',
              fontSize:     13,
              outline:      'none',
            }}
          />
        </div>
      )}

      <button
        onClick={handleStart}
        disabled={mode === 'ai'}
        style={{
          padding:      '16px 64px',
          borderRadius: 12,
          border:       'none',
          background:   mode === 'ai' ? '#222' : '#1a6b2a',
          color:        mode === 'ai' ? '#444' : '#fff',
          fontSize:     22,
          fontFamily:   'monospace',
          fontWeight:   'bold',
          letterSpacing: 3,
          cursor:       mode === 'ai' ? 'not-allowed' : 'pointer',
          boxShadow:    mode === 'ai' ? 'none' : '0 4px 24px rgba(26,107,42,0.4)',
          transition:   'all 0.15s',
        }}
        onMouseEnter={e => { if (mode !== 'ai') e.currentTarget.style.background = '#22882e' }}
        onMouseLeave={e => { if (mode !== 'ai') e.currentTarget.style.background = '#1a6b2a' }}
      >
        PLAY
      </button>

      <div style={{ color: '#333', fontSize: 11 }}>
        playing as guest · {user?.id?.slice(0, 14)}
      </div>

    </div>
  )
}
