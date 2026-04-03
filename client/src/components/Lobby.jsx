import React, { useState, useRef, useEffect } from 'react'
import socket from '../socket/client.js'

const FORMSPREE_ID = 'mkopqpvq'

const ACCENT   = '#c1ff72'   // lime green
const ACCENT2  = '#ff6af0'   // pink
const ACCENT3  = '#5edfff'   // cyan
const BG       = '#f0ede6'   // warm off-white
const CARD     = '#ffffff'
const TEXT     = '#111111'
const MUTED    = '#888'

export default function Lobby({ onStart, user }) {
  const [mode,          setMode]          = useState('offline')
  const [onlineRole,    setOnlineRole]    = useState(null)      // 'host' | 'guest'
  const [joinCode,      setJoinCode]      = useState('')        // guest types this
  const [generatedCode, setGeneratedCode] = useState(null)      // host sees this
  const [waiting,       setWaiting]       = useState(false)     // host waiting for opponent
  const [difficulty,    setDifficulty]    = useState('medium')
  const [feedbackOpen,  setFeedbackOpen]  = useState(false)
  const [feedbackName,  setFeedbackName]  = useState('')
  const [feedbackEmail, setFeedbackEmail] = useState('')
  const [feedbackMsg,   setFeedbackMsg]   = useState('')
  const [feedbackStatus,setFeedbackStatus]= useState(null)

  // FIX 1: stable userId — computed once per mount, not on every click.
  // Previously `guest-${Date.now()}` was called inside handleGuestJoin, so every
  // call (including the retry after reconnect) produced a different playerId.
  // The server's `alreadyIn` check uses playerId, so the host's reconnect attempt
  // looked like a new player and filled the second slot before the real guest arrived.
  const userIdRef = useRef(user?.id || `guest-${Date.now()}`)
  // Keep in sync if the user prop changes (e.g. after login)
  useEffect(() => {
    if (user?.id) userIdRef.current = user.id
  }, [user?.id])

  // FIX 2: debug socket listeners moved inside the component with cleanup.
  // Previously they were at module scope, so on every hot-reload they stacked up
  // and each 'connect' event would fire doEmit() multiple times, causing the host
  // to emit join_room more than once and fill both player slots itself.
  useEffect(() => {
    const onConnect      = () => console.log('[Socket] CONNECTED, id:', socket.id)
    const onConnectError = (e) => console.error('[Socket] CONNECT ERROR:', e.message, e)
    const onDisconnect   = (r) => console.log('[Socket] disconnected:', r)
    socket.on('connect',       onConnect)
    socket.on('connect_error', onConnectError)
    socket.on('disconnect',    onDisconnect)
    return () => {
      socket.off('connect',       onConnect)
      socket.off('connect_error', onConnectError)
      socket.off('disconnect',    onDisconnect)
    }
  }, [])

  function handleHostCreate() {
    // Generate code immediately on the client so the UI updates right away
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
    let code = ''
    for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)]

    setGeneratedCode(code)
    setWaiting(true)

    const userId = userIdRef.current

    function doEmit() {
      socket.off('game_start')

      socket.once('game_start', ({ player1_id, player2_id, current_turn, ballState }) => {
        onStart({
          mode: 'online',
          game: {
            id:           code,
            player1_id,
            player2_id,
            current_turn,
            ball_state:   ballState ?? null,
            my_type:      null,
          },
          user: { ...(user || {}), id: userId, isGuest: !user?.id },
        })
      })

      // Step 1: reserve the code on the server
      socket.emit('create_room', { code })

      // Step 2: join the room ourselves (so game_start fires when guest arrives)
      socket.once('room_created', ({ code: confirmedCode }) => {
        socket.emit('join_room', { code: confirmedCode, playerId: userId, gameId: confirmedCode })
      })
    }

    if (socket.connected) {
      doEmit()
    // handleHostCreate, in the else branch:
    } else {
      socket.off('connect')          // ← ADD THIS
      socket.once('connect', doEmit)
      socket.connect()
    }
  }

  // Keep a ref so the game_start closure can read the latest generatedCode
  const generatedCodeRef = useRef(null)
  useEffect(() => { generatedCodeRef.current = generatedCode }, [generatedCode])

  function handleGuestJoin() {
    const code = joinCode.trim().toUpperCase()
    if (!code) return
    const userId = userIdRef.current  // FIX: use stable ref, not Date.now()

    function doEmit() {
      console.log('[Guest] connected, emitting join_room with code:', code)
      socket.off('error')
      socket.off('game_start')

      socket.once('error', ({ message }) => {
        console.error('[Guest] server error:', message)
        alert(message)
      })

      socket.once('game_start', ({ player1_id, player2_id, current_turn, ballState }) => {
        console.log('[Guest] game_start received!')
        onStart({
          mode: 'online',
          game: {
            id:           code,
            player1_id,
            player2_id,
            current_turn,
            ball_state:   ballState ?? null,
            my_type:      null,
          },
          user: { ...(user || {}), id: userId, isGuest: !user?.id },
        })
      })

      socket.emit('join_room', { code, playerId: userId, gameId: code })
    }

    console.log('[Guest] join clicked, socket.connected:', socket.connected)
    if (socket.connected) {
      doEmit()
    // handleGuestJoin, in the else branch:
    } else {
      socket.off('connect')          // ← ADD THIS  
      socket.once('connect', () => {
        console.log('[Guest] connect fired')
        doEmit()
      })
      socket.connect()
    }
  }

  function handleStart() {
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
        setTimeout(() => setFeedbackStatus(null), 3000)
      } else {
        setFeedbackStatus('error')
      }
    } catch {
      setFeedbackStatus('error')
    }
  }

  const modeLabels    = { offline: '👥 Local 2P', ai: '🤖 vs AI', online: '🌐 Online' }
  const difficultyColors = { easy: ACCENT, medium: ACCENT3, hard: ACCENT2 }
  const isIOS = typeof navigator !== 'undefined' &&
    /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.navigator.standalone

  return (
    <div style={{
      minHeight:     'auto',
      background:    BG,
      fontFamily:    '"Inter", "Helvetica Neue", Arial, sans-serif',
      color:         TEXT,
      overflowY:     'visible',
      overflowX:     'clip',
      paddingBottom: 24,
    }}>

      {/* ── Noise texture overlay ── */}
      <div style={{
        position:   'fixed', inset: 0,
        backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.035'/%3E%3C/svg%3E")`,
        pointerEvents: 'none', zIndex: 0,
      }} />

      <div style={{ position: 'relative', zIndex: 1, maxWidth: 480, margin: '0 auto', padding: '0 24px 80px' }}>

        {/* ── Hero ── */}
        <div style={{ paddingTop: 72, paddingBottom: 16, textAlign: 'center' }}>

          {/* Ball cluster */}
          <div style={{ position: 'relative', width: 100, height: 100, margin: '0 auto 28px' }}>
            {[
              { emoji: '🎱', size: 52, top: 24, left: 24, z: 3 },
              { emoji: '🟡', size: 32, top: 0,  left: 4,  z: 2 },
              { emoji: '🔵', size: 28, top: 8,  left: 62, z: 2 },
              { emoji: '🔴', size: 26, top: 58, left: 66, z: 1 },
            ].map((b, i) => (
              <div key={i} style={{
                position: 'absolute', top: b.top, left: b.left,
                fontSize: b.size, zIndex: b.z,
                filter: 'drop-shadow(0 4px 8px rgba(0,0,0,0.15))',
              }}>{b.emoji}</div>
            ))}
          </div>

          <h1 style={{
            fontSize: 52, fontWeight: 900, margin: '0 0 6px',
            letterSpacing: -2, lineHeight: 1,
            background: `linear-gradient(135deg, ${TEXT} 0%, #444 100%)`,
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
          }}>
            Q-Ball
          </h1>
          <div style={{
            display: 'inline-block',
            background: ACCENT, color: TEXT,
            fontSize: 10, fontWeight: 800,
            letterSpacing: 3, padding: '3px 10px',
            borderRadius: 20, marginBottom: 16,
            textTransform: 'uppercase',
          }}>
            BETA
          </div>
          <p style={{ color: MUTED, fontSize: 15, margin: '0 0 40px', lineHeight: 1.6 }}>
            8-ball pool in your browser.<br/>No download. No account.
          </p>
        </div>

        {/* ── Mode selector ── */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 2, color: MUTED, marginBottom: 10, textTransform: 'uppercase' }}>
            Game Mode
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
            {Object.entries(modeLabels).map(([m, label]) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                style={{
                  padding:      '14px 8px',
                  borderRadius: 14,
                  border:       mode === m ? `2px solid ${TEXT}` : '2px solid #e0ddd6',
                  background:   mode === m ? TEXT : CARD,
                  color:        mode === m ? BG : MUTED,
                  cursor:       'pointer',
                  fontSize:     12,
                  fontWeight:   700,
                  fontFamily:   'inherit',
                  transition:   'all 0.15s',
                  lineHeight:   1.4,
                  boxShadow:    mode === m ? '0 4px 16px rgba(0,0,0,0.12)' : 'none',
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* ── AI difficulty ── */}
        {mode === 'ai' && (
          <div style={{
            background: CARD, borderRadius: 16,
            padding: '16px', marginBottom: 16,
            border: '1.5px solid #e0ddd6',
          }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 2, color: MUTED, marginBottom: 10, textTransform: 'uppercase' }}>
              Difficulty
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              {['easy','medium','hard'].map(d => (
                <button
                  key={d}
                  onClick={() => setDifficulty(d)}
                  style={{
                    flex:         1,
                    padding:      '10px 4px',
                    borderRadius: 10,
                    border:       difficulty === d ? `2px solid ${difficultyColors[d]}` : '2px solid #e0ddd6',
                    background:   difficulty === d ? difficultyColors[d] + '22' : 'transparent',
                    color:        difficulty === d ? TEXT : MUTED,
                    cursor:       'pointer',
                    fontSize:     12,
                    fontWeight:   difficulty === d ? 800 : 500,
                    fontFamily:   'inherit',
                    textTransform:'capitalize',
                    transition:   'all 0.15s',
                  }}
                >
                  {d}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── Online: host or guest choice ── */}
        {mode === 'online' && !onlineRole && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
            {[
              { role: 'host', emoji: '🎱', label: 'Create Game', sub: 'Get a shareable code' },
              { role: 'guest', emoji: '🔗', label: 'Join Game',   sub: "Enter a friend's code" },
            ].map(({ role, emoji, label, sub }) => (
              <button
                key={role}
                onClick={() => setOnlineRole(role)}
                style={{
                  padding: '18px 12px', borderRadius: 14,
                  border: '2px solid #e0ddd6', background: CARD,
                  color: TEXT, cursor: 'pointer', fontFamily: 'inherit',
                  textAlign: 'center', transition: 'all 0.15s',
                }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = TEXT; e.currentTarget.style.background = TEXT; e.currentTarget.style.color = BG }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = '#e0ddd6'; e.currentTarget.style.background = CARD; e.currentTarget.style.color = TEXT }}
              >
                <div style={{ fontSize: 28, marginBottom: 6 }}>{emoji}</div>
                <div style={{ fontWeight: 800, fontSize: 13 }}>{label}</div>
                <div style={{ color: MUTED, fontSize: 11, marginTop: 3 }}>{sub}</div>
              </button>
            ))}
          </div>
        )}

        {/* ── Host: generate code ── */}
        {mode === 'online' && onlineRole === 'host' && (
          <div style={{ background: CARD, borderRadius: 16, padding: 20, marginBottom: 16, border: '1.5px solid #e0ddd6' }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 2, color: MUTED, marginBottom: 12, textTransform: 'uppercase' }}>
              Create a Room
            </div>

            <button
              onClick={handleHostCreate}
              disabled={waiting}
              style={{
                width: '100%', padding: '14px', borderRadius: 12,
                border: 'none',
                background: waiting ? '#e0ddd6' : TEXT,
                color: waiting ? MUTED : BG,
                fontFamily: 'inherit', fontSize: 15, fontWeight: 800,
                cursor: waiting ? 'default' : 'pointer', letterSpacing: 1,
                marginBottom: 12,
              }}
            >
              {waiting ? 'Code Generated ✓' : 'Generate Code →'}
            </button>

            {/* Code field + copy button — shown once code exists */}
            {generatedCode && (
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10 }}>
                <input
                  readOnly
                  value={generatedCode}
                  style={{
                    flex: 1, padding: '11px 14px', borderRadius: 10,
                    border: '1.5px solid #e0ddd6', background: BG,
                    color: TEXT, fontFamily: 'monospace', fontSize: 20,
                    fontWeight: 800, letterSpacing: 5, outline: 'none',
                    textAlign: 'center',
                  }}
                />
                <button
                  onClick={() => navigator.clipboard?.writeText(generatedCode)}
                  title="Copy code"
                  style={{
                    padding: '11px 14px', borderRadius: 10,
                    border: '1.5px solid #e0ddd6', background: BG,
                    fontSize: 18, cursor: 'pointer', flexShrink: 0,
                  }}
                >
                  📋
                </button>
              </div>
            )}

            {generatedCode && (
              <div style={{ color: MUTED, fontSize: 12, textAlign: 'center', marginBottom: 8 }}>
                ⏳ Waiting for opponent to join…
              </div>
            )}

            <button
              onClick={() => { setOnlineRole(null); setGeneratedCode(null); setWaiting(false) }}
              style={{ background: 'none', border: 'none', color: MUTED, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}
            >
              ← Back
            </button>
          </div>
        )}

        {/* ── Guest: enter code ── */}
        {mode === 'online' && onlineRole === 'guest' && (
          <div style={{ background: CARD, borderRadius: 16, padding: 20, marginBottom: 16, border: '1.5px solid #e0ddd6' }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 2, color: MUTED, marginBottom: 10, textTransform: 'uppercase' }}>
              Enter Room Code
            </div>
            <input
              placeholder="e.g. X4K9PQ"
              value={joinCode}
              onChange={e => setJoinCode(e.target.value.toUpperCase())}
              maxLength={6}
              style={{
                width: '100%', padding: '14px', borderRadius: 10,
                border: '1.5px solid #e0ddd6', background: BG,
                color: TEXT, fontFamily: 'monospace', fontSize: 22,
                fontWeight: 800, letterSpacing: 6, outline: 'none',
                boxSizing: 'border-box', textAlign: 'center', textTransform: 'uppercase',
              }}
            />
            <button
              onClick={handleGuestJoin}
              disabled={joinCode.trim().length < 4}
              style={{
                width: '100%', padding: '14px', borderRadius: 12, marginTop: 10,
                border: 'none',
                background: joinCode.trim().length >= 4 ? TEXT : '#e0ddd6',
                color: joinCode.trim().length >= 4 ? BG : MUTED,
                fontFamily: 'inherit', fontSize: 15, fontWeight: 800,
                cursor: joinCode.trim().length >= 4 ? 'pointer' : 'default',
                letterSpacing: 1,
              }}
            >
              Join Room →
            </button>
            <button
              onClick={() => setOnlineRole(null)}
              style={{ marginTop: 10, background: 'none', border: 'none', color: MUTED, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}
            >
              ← Back
            </button>
          </div>
        )}

        {/* ── Play button — hidden in online mode (host/guest have their own CTAs) ── */}
        {mode !== 'online' && <button
          onClick={handleStart}
          style={{
            width:         '100%',
            padding:       '18px',
            borderRadius:  16,
            border:        'none',
            background:    ACCENT,
            color:         TEXT,
            fontSize:      18,
            fontFamily:    'inherit',
            fontWeight:    900,
            letterSpacing: 2,
            cursor:        'pointer',
            boxShadow:     `0 8px 32px ${ACCENT}66`,
            transition:    'all 0.15s',
            marginBottom:  32,
            textTransform: 'uppercase',
          }}
          onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = `0 12px 40px ${ACCENT}88` }}
          onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)';    e.currentTarget.style.boxShadow = `0 8px 32px ${ACCENT}66` }}
        >
          Play Now →
        </button>}

        {/* ── Feedback section ── */}
        <div style={{
          background:   CARD,
          border:       '1.5px solid #e0ddd6',
          borderRadius: 20,
          padding:      24,
          marginBottom: 40,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: feedbackOpen ? 20 : 0 }}>
            <div>
              <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 2 }}>Got feedback?</div>
              <div style={{ color: MUTED, fontSize: 12 }}>Bugs, ideas, complaints — all welcome.</div>
            </div>
            <button
              onClick={() => { setFeedbackOpen(o => !o); setFeedbackStatus(null) }}
              style={{
                background:   feedbackOpen ? '#f0ede6' : TEXT,
                color:        feedbackOpen ? TEXT : BG,
                border:       'none',
                borderRadius: 10,
                padding:      '8px 16px',
                fontSize:     12,
                fontWeight:   700,
                fontFamily:   'inherit',
                cursor:       'pointer',
                transition:   'all 0.15s',
                flexShrink:   0,
                marginLeft:   12,
              }}
            >
              {feedbackOpen ? 'Close' : 'Write →'}
            </button>
          </div>

          {feedbackOpen && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

              {/* Name */}
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1, color: MUTED, textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>
                  Name <span style={{ color: ACCENT2 }}>*</span>
                </label>
                <input
                  placeholder="your name"
                  value={feedbackName}
                  onChange={e => setFeedbackName(e.target.value)}
                  disabled={feedbackStatus === 'sending' || feedbackStatus === 'sent'}
                  style={{
                    width:        '100%',
                    padding:      '11px 14px',
                    borderRadius: 10,
                    border:       '1.5px solid #e0ddd6',
                    background:   BG,
                    color:        TEXT,
                    fontFamily:   'inherit',
                    fontSize:     13,
                    outline:      'none',
                    boxSizing:    'border-box',
                  }}
                />
              </div>

              {/* Email */}
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1, color: MUTED, textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>
                  Email <span style={{ color: MUTED, fontWeight: 400 }}>(optional — so we can reply)</span>
                </label>
                <input
                  placeholder="you@example.com"
                  type="email"
                  value={feedbackEmail}
                  onChange={e => setFeedbackEmail(e.target.value)}
                  disabled={feedbackStatus === 'sending' || feedbackStatus === 'sent'}
                  style={{
                    width:        '100%',
                    padding:      '11px 14px',
                    borderRadius: 10,
                    border:       '1.5px solid #e0ddd6',
                    background:   BG,
                    color:        TEXT,
                    fontFamily:   'inherit',
                    fontSize:     13,
                    outline:      'none',
                    boxSizing:    'border-box',
                  }}
                />
              </div>

              {/* Message */}
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1, color: MUTED, textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>
                  Message <span style={{ color: ACCENT2 }}>*</span>
                </label>
                <textarea
                  rows={4}
                  placeholder="What's broken? What's missing? What's great?"
                  value={feedbackMsg}
                  onChange={e => setFeedbackMsg(e.target.value)}
                  disabled={feedbackStatus === 'sending' || feedbackStatus === 'sent'}
                  style={{
                    width:        '100%',
                    padding:      '11px 14px',
                    borderRadius: 10,
                    border:       '1.5px solid #e0ddd6',
                    background:   BG,
                    color:        TEXT,
                    fontFamily:   'inherit',
                    fontSize:     13,
                    outline:      'none',
                    resize:       'vertical',
                    lineHeight:   1.6,
                    boxSizing:    'border-box',
                  }}
                />
              </div>

              {feedbackStatus === 'sent' ? (
                <div style={{
                  background:   ACCENT + '33', border: `1.5px solid ${ACCENT}`,
                  borderRadius: 10, padding: '12px 16px',
                  color: TEXT, fontSize: 13, fontWeight: 700, textAlign: 'center',
                }}>
                  ✓ Sent! Thanks for the feedback.
                </div>
              ) : feedbackStatus === 'error' ? (
                <div style={{
                  background: ACCENT2 + '22', border: `1.5px solid ${ACCENT2}`,
                  borderRadius: 10, padding: '12px 16px',
                  color: TEXT, fontSize: 13, textAlign: 'center',
                }}>
                  Something went wrong — try again.
                </div>
              ) : (
                <button
                  onClick={handleFeedbackSubmit}
                  disabled={!feedbackMsg.trim() || !feedbackName.trim() || feedbackStatus === 'sending'}
                  style={{
                    padding:       '13px',
                    borderRadius:  10,
                    border:        'none',
                    background:    feedbackMsg.trim() && feedbackName.trim() ? TEXT : '#e0ddd6',
                    color:         feedbackMsg.trim() && feedbackName.trim() ? BG : MUTED,
                    fontFamily:    'inherit',
                    fontSize:      13,
                    fontWeight:    700,
                    cursor:        feedbackMsg.trim() && feedbackName.trim() ? 'pointer' : 'default',
                    transition:    'all 0.15s',
                    letterSpacing: 1,
                  }}
                >
                  {feedbackStatus === 'sending' ? 'Sending...' : 'Send Feedback →'}
                </button>
              )}
            </div>
          )}
        </div>

        {/* ── Footer ── */}
        <div style={{ textAlign: 'center', color: '#bbb', fontSize: 11, paddingBottom: 16 }}>
          {isIOS && (
            <div style={{ marginBottom: 12, color: MUTED }}>
              📲 iPhone tip: Share → Add to Home Screen for fullscreen
            </div>
          )}
          <div>guest · {user?.id?.slice(0, 14)}</div>
        </div>

      </div>
    </div>
  )
}