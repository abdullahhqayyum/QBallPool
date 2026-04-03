import React, { useState } from 'react'

const FORMSPREE_ID = 'mkopqpvq'

export default function Lobby({ onStart, user }) {
  const [mode,       setMode]       = useState('offline')
  const [roomId,     setRoomId]     = useState('')
  const [difficulty, setDifficulty] = useState('medium')

  // Feedback form state
  const [feedbackOpen,   setFeedbackOpen]   = useState(false)
  const [feedbackMsg,    setFeedbackMsg]    = useState('')
  const [feedbackStatus, setFeedbackStatus] = useState(null) // 'sending' | 'sent' | 'error'

  const [feedbackName,   setFeedbackName]   = useState('')
  const [feedbackEmail,  setFeedbackEmail]  = useState('')

  function handleStart() {
    if (mode === 'online') {
      const room   = (roomId || `room-${Date.now()}`).trim()
      const userId = user?.id || `guest-${Date.now()}`
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

  async function handleFeedbackSubmit() {
    if (!feedbackMsg.trim() || !feedbackName.trim()) return
    setFeedbackStatus('sending')
    try {
      const res = await fetch(`https://formspree.io/f/${FORMSPREE_ID}`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body:    JSON.stringify({
          name:     feedbackName.trim(),
          email:    feedbackEmail.trim() || undefined,
          message:  feedbackMsg.trim(),
          _subject: `8-Ball Feedback from ${feedbackName.trim()}`,
          _replyto: feedbackEmail.trim() || undefined,
        }),
      })
      if (res.ok) {
        setFeedbackStatus('sent')
        setFeedbackMsg('')
        setFeedbackName('')
        setFeedbackEmail('')
        setTimeout(() => { setFeedbackStatus(null); setFeedbackOpen(false) }, 2500)
      } else {
        setFeedbackStatus('error')
      }
    } catch {
      setFeedbackStatus('error')
    }
  }

  const modeLabels = { offline: 'Local 2P', ai: 'vs AI', online: 'Online' }
  const isIOS = typeof navigator !== 'undefined' &&
    /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.navigator.standalone

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

      {/* Title */}
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 48, marginBottom: 4 }}>🎱</div>
        <h1 style={{ color: '#fff', fontSize: 32, margin: 0, letterSpacing: 2 }}>8-BALL</h1>
        <div style={{ color: '#555', fontSize: 12, marginTop: 4 }}>BETA</div>
      </div>

      {/* Mode selector */}
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

      {/* AI difficulty */}
      {mode === 'ai' && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
          <div style={{ color: '#555', fontSize: 11 }}>DIFFICULTY</div>
          <div style={{ display: 'flex', gap: 8 }}>
            {['easy', 'medium', 'hard'].map(d => (
              <button
                key={d}
                onClick={() => setDifficulty(d)}
                style={{
                  padding:       '8px 18px',
                  borderRadius:  8,
                  border:        difficulty === d ? '2px solid #c8a020' : '2px solid #333',
                  background:    difficulty === d ? '#3a2e08' : '#111',
                  color:         difficulty === d ? '#f5c518' : '#555',
                  cursor:        'pointer',
                  fontSize:      12,
                  fontFamily:    'monospace',
                  fontWeight:    difficulty === d ? 'bold' : 'normal',
                  textTransform: 'uppercase',
                  transition:    'all 0.15s',
                }}
              >
                {d}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Online room ID */}
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

      {/* Play button */}
      <button
        onClick={handleStart}
        style={{
          padding:       '16px 64px',
          borderRadius:  12,
          border:        'none',
          background:    '#1a6b2a',
          color:         '#fff',
          fontSize:      22,
          fontFamily:    'monospace',
          fontWeight:    'bold',
          letterSpacing: 3,
          cursor:        'pointer',
          boxShadow:     '0 4px 24px rgba(26,107,42,0.4)',
          transition:    'all 0.15s',
        }}
        onMouseEnter={e => { e.currentTarget.style.background = '#22882e' }}
        onMouseLeave={e => { e.currentTarget.style.background = '#1a6b2a' }}
      >
        PLAY
      </button>

      {/* iOS tip */}
      {isIOS && (
        <div style={{
          color:      '#444',
          fontSize:   11,
          textAlign:  'center',
          maxWidth:   260,
          lineHeight: 1.5,
          fontFamily: 'monospace',
          marginTop:  10,
        }}>
          📲 For best experience on iPhone:<br/>
          <span style={{ color: '#666' }}>Share → Add to Home Screen</span>
        </div>
      )}

      {/* Guest label */}
      <div style={{ color: '#333', fontSize: 11 }}>
        playing as guest · {user?.id?.slice(0, 14)}
      </div>

      {/* ── Feedback ── */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0 }}>

        {/* Toggle button */}
        <button
          onClick={() => { setFeedbackOpen(o => !o); setFeedbackStatus(null) }}
          style={{
            background:   '#fff',
            border:       '1px solid #fff',
            color:        '#111',
            fontSize:     11,
            fontFamily:   'monospace',
            cursor:       'pointer',
            padding:      '6px 10px',
            borderRadius: 8,
            letterSpacing: 1,
            transition:   'filter 0.15s',
            filter:       feedbackOpen ? 'brightness(0.9)' : 'none',
          }}
        >
          {feedbackOpen ? '✕ close' : '💬 send feedback'}
        </button>

        {/* Form */}
        {feedbackOpen && (
          <div style={{
            marginTop:    10,
            width:        280,
            background:   '#111',
            border:       '1px solid #2a2a2a',
            borderRadius: 10,
            padding:      16,
            display:      'flex',
            flexDirection:'column',
            gap:          10,
          }}>
            <div style={{ color: '#555', fontSize: 10, letterSpacing: 1 }}>
              BUG? IDEA? ANYTHING?
            </div>

            {/* Name — required */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label style={{ color: '#444', fontSize: 10, letterSpacing: 1 }}>
                NAME <span style={{ color: '#cc3300' }}>*</span>
              </label>
              <input
                placeholder="your name"
                value={feedbackName}
                onChange={e => setFeedbackName(e.target.value)}
                disabled={feedbackStatus === 'sending' || feedbackStatus === 'sent'}
                style={{
                  background:   '#0d0d0d',
                  border:       `1px solid ${!feedbackName.trim() && feedbackStatus === 'error' ? '#cc3300' : '#2a2a2a'}`,
                  borderRadius: 6,
                  color:        '#ccc',
                  fontFamily:   'monospace',
                  fontSize:     12,
                  padding:      '7px 10px',
                  outline:      'none',
                }}
              />
            </div>

            {/* Email — optional */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label style={{ color: '#444', fontSize: 10, letterSpacing: 1 }}>
                EMAIL <span style={{ color: '#333' }}>(optional — for replies)</span>
              </label>
              <input
                placeholder="you@example.com"
                type="email"
                value={feedbackEmail}
                onChange={e => setFeedbackEmail(e.target.value)}
                disabled={feedbackStatus === 'sending' || feedbackStatus === 'sent'}
                style={{
                  background:   '#0d0d0d',
                  border:       '1px solid #2a2a2a',
                  borderRadius: 6,
                  color:        '#ccc',
                  fontFamily:   'monospace',
                  fontSize:     12,
                  padding:      '7px 10px',
                  outline:      'none',
                }}
              />
            </div>

            {/* Message */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label style={{ color: '#444', fontSize: 10, letterSpacing: 1 }}>
                FEEDBACK <span style={{ color: '#cc3300' }}>*</span>
              </label>
              <textarea
                rows={4}
                placeholder="bug, idea, complaint, compliment..."
                value={feedbackMsg}
                onChange={e => setFeedbackMsg(e.target.value)}
                disabled={feedbackStatus === 'sending' || feedbackStatus === 'sent'}
                style={{
                  background:   '#0d0d0d',
                  border:       '1px solid #2a2a2a',
                  borderRadius: 6,
                  color:        '#ccc',
                  fontFamily:   'monospace',
                  fontSize:     12,
                  padding:      '8px 10px',
                  resize:       'vertical',
                  outline:      'none',
                  lineHeight:   1.5,
                }}
              />
            </div>

            {feedbackStatus === 'sent' ? (
              <div style={{ color: '#1a6b2a', fontSize: 12, textAlign: 'center' }}>
                ✓ got it — thanks!
              </div>
            ) : feedbackStatus === 'error' ? (
              <div style={{ color: '#cc3300', fontSize: 11, textAlign: 'center' }}>
                failed to send — try again
              </div>
            ) : (
              <button
                onClick={handleFeedbackSubmit}
                disabled={!feedbackMsg.trim() || !feedbackName.trim() || feedbackStatus === 'sending'}
                style={{
                  background:    feedbackMsg.trim() && feedbackName.trim() ? '#1a3a2a' : '#111',
                  border:        `1px solid ${feedbackMsg.trim() && feedbackName.trim() ? '#1a6b2a' : '#222'}`,
                  borderRadius:  6,
                  color:         feedbackMsg.trim() && feedbackName.trim() ? '#4ade80' : '#333',
                  fontFamily:    'monospace',
                  fontSize:      12,
                  padding:       '8px',
                  cursor:        feedbackMsg.trim() && feedbackName.trim() ? 'pointer' : 'default',
                  transition:    'all 0.15s',
                  letterSpacing: 1,
                }}
              >
                {feedbackStatus === 'sending' ? 'SENDING...' : 'SEND →'}
              </button>
            )}
          </div>
        )}
      </div>

    </div>
  )
}