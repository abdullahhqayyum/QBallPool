import React from 'react'

export default function MatchResult({ result, onRematch, onHome }) {
  const won = result === 'win'

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      fontFamily: 'monospace', color: '#fff'
    }}>
      <div style={{ fontSize: 64, marginBottom: 16 }}>
        {won ? '🏆' : '💀'}
      </div>
      <h2 style={{ fontSize: 32, margin: '0 0 8px' }}>
        {won ? 'You Win!' : 'You Lose'}
      </h2>
      <p style={{ color: '#666', marginBottom: 32 }}>
        {won ? 'Nice shot, legend.' : 'Better luck next time.'}
      </p>
      <div style={{ display: 'flex', gap: 12 }}>
        <button
          onClick={onRematch}
          style={{ padding: '10px 24px', background: '#1a6b2a', border: 'none', color: '#fff', borderRadius: 6, cursor: 'pointer', fontSize: 14 }}
        >
          Play Again
        </button>
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