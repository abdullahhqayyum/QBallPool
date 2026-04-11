import React, { useState, useEffect } from 'react'

export default function MatchResult({ result, onRematch, onHome, isOnline, onRematchRequest, onRematchCancel }) {
  const [rematchState, setRematchState] = useState('idle') // 'idle' | 'waiting' | 'opponent_wants'

  useEffect(() => {
    if (!isOnline || !onRematchRequest) return
    // Parent passes a setter so we can flip our local state when opponent acts
    if (typeof onRematchRequest === 'function') {
      onRematchRequest(() => setRematchState(prev => prev === 'idle' ? 'opponent_wants' : prev))
    }
  }, [isOnline, onRematchRequest])

  const isOffline = result && typeof result === 'object'
  const won       = isOffline ? null : result === 'win'
  const trophy    = isOffline ? '🏆' : (won ? '🏆' : '💀')
  const headline  = isOffline ? `${result.winner} Wins!` : (won ? 'You Win!' : 'You Lose')
  const subtitle  = isOffline
    ? `${result.winner === 'P1' ? 'P2' : 'P1'} better luck next time.`
    : (won ? 'Nice shot, legend.' : 'Better luck next time.')

  function handlePlayAgain() {
    if (!isOnline) { onRematch(); return }
    setRematchState('waiting')
    import('../socket/client').then(({ sendRematchRequest }) => sendRematchRequest())
  }

  function handleCancel() {
    setRematchState('idle')
    import('../socket/client').then(({ sendRematchCancel }) => sendRematchCancel())
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      fontFamily: 'monospace', color: '#fff',
    }}>
      <div style={{ fontSize: 64, marginBottom: 16 }}>{trophy}</div>
      <h2 style={{ fontSize: 32, margin: '0 0 8px' }}>{headline}</h2>
      <p style={{ color: '#666', marginBottom: 32 }}>{subtitle}</p>

      {isOnline && rematchState === 'opponent_wants' && (
        <div style={{
          marginBottom: 16, padding: '8px 20px',
          background: '#1a3a1a', border: '1px solid #2a6b2a',
          borderRadius: 6, fontSize: 13, color: '#88ff88',
        }}>
          🏓 Opponent wants a rematch!
        </div>
      )}

      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        {rematchState === 'waiting' ? (
          <>
            <div style={{
              padding: '10px 24px', background: '#1a3a1a',
              border: '1px solid #2a6b2a', borderRadius: 6,
              fontSize: 14, color: '#88ff88',
            }}>
              ⏳ Waiting for opponent…
            </div>
            <button
              onClick={handleCancel}
              style={{ padding: '10px 16px', background: '#3a1a1a', border: '1px solid #6b2a2a', color: '#ff8888', borderRadius: 6, cursor: 'pointer', fontSize: 13 }}
            >
              Cancel
            </button>
          </>
        ) : (
          <button
            onClick={handlePlayAgain}
            style={{ padding: '10px 24px', background: '#1a6b2a', border: 'none', color: '#fff', borderRadius: 6, cursor: 'pointer', fontSize: 14 }}
          >
            {isOnline && rematchState === 'opponent_wants' ? '✅ Accept Rematch' : 'Play Again'}
          </button>
        )}
        <button
          onClick={onHome}
          style={{ padding: '10px 24px', background: '#222', border: '1px solid #444', color: '#fff', borderRadius: 6, cursor: 'pointer', fontSize: 14 }}
        >
          Back to Games
        </button>
      </div>
    </div>
  )
}
