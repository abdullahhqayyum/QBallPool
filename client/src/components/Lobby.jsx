import React, { useState } from 'react'

export default function Lobby({ onStart, user }) {
  const [mode,       setMode]       = useState('offline')
  const [roomId,     setRoomId]     = useState('')
  const [difficulty, setDifficulty] = useState('medium')

  function handleStart() {

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

    onStart({ mode, difficulty: mode === 'ai' ? difficulty : undefined, user })
  }

  const modeLabels = { offline: 'Local 2P', ai: 'vs AI', online: 'Online' }

  const isIOS = typeof navigator !== 'undefined' && /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.navigator.standalone

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
              color:        '#fff',
              cursor:       'pointer',
              fontSize:     13,
              fontFamily:   'monospace',
              fontWeight:   mode === m ? 'bold' : 'normal',
              transition:   'all 0.15s',
            }}
          >
            {modeLabels[m]}
          </button>
        ))}
      </div>

      {mode === 'ai' && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
          <div style={{ color: '#555', fontSize: 11 }}>DIFFICULTY</div>
          <div style={{ display: 'flex', gap: 8 }}>
            {['easy', 'medium', 'hard'].map(d => (
              <button
                key={d}
                onClick={() => setDifficulty(d)}
                style={{
                  padding:      '8px 18px',
                  borderRadius: 8,
                  border:       difficulty === d ? '2px solid #c8a020' : '2px solid #333',
                  background:   difficulty === d ? '#3a2e08' : '#111',
                  color:        difficulty === d ? '#f5c518' : '#555',
                  cursor:       'pointer',
                  fontSize:     12,
                  fontFamily:   'monospace',
                  fontWeight:   difficulty === d ? 'bold' : 'normal',
                  textTransform: 'uppercase',
                  transition:   'all 0.15s',
                }}
              >
                {d}
              </button>
            ))}
          </div>
        </div>
      )}

      {mode === 'online' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%', maxWidth: 280 }}>
          <input
            placeholder="Room ID"
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

          <div style={{ color: '#777', fontSize: 11, marginTop: 6 }}>
            Can enter anything — should be the same for both players.
          </div>
        </div>
      )}

      <button
        onClick={handleStart}
        style={{
          padding:      '16px 64px',
          borderRadius: 12,
          border:       'none',
          background:   '#1a6b2a',
          color:        '#fff',
          fontSize:     22,
          fontFamily:   'monospace',
          fontWeight:   'bold',
          letterSpacing: 3,
          cursor:       'pointer',
          boxShadow:    '0 4px 24px rgba(26,107,42,0.4)',
          transition:   'all 0.15s',
        }}
        onMouseEnter={e => { e.currentTarget.style.background = '#22882e' }}
        onMouseLeave={e => { e.currentTarget.style.background = '#1a6b2a' }}
      >
        PLAY
      </button>

      {isIOS && (
        <div style={{
          color:        '#444',
          fontSize:     11,
          textAlign:    'center',
          maxWidth:     260,
          lineHeight:   1.5,
          fontFamily:   'monospace',
          marginTop:    10,
        }}>
          📲 For best experience on iPhone:<br/>
          <span style={{ color: '#666' }}>Share → Add to Home Screen</span>
        </div>
      )}

      <div style={{ color: '#333', fontSize: 11 }}>
        playing as guest · {user?.id?.slice(0, 14)}
      </div>

    </div>
  )
}
