import React from 'react'

export default function PocketCallModal({ onCall }) {
  // Simple pocket names
  const pocketNames = [
    'Top Left',   'Top Middle',   'Top Right',
    'Bot Left',   'Bot Middle',   'Bot Right',
  ]

  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: 'rgba(0,0,0,0.75)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 100, fontFamily: 'monospace',
    }}>
      <div style={{
        background: '#111', border: '1px solid #333',
        borderRadius: 10, padding: '32px 40px', textAlign: 'center',
      }}>
        <h3 style={{ color: '#fff', margin: '0 0 8px' }}>Call your pocket</h3>
        <p style={{ color: '#666', fontSize: 12, margin: '0 0 20px' }}>
          Where are you sinking the 8-ball?
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
          {pocketNames.map((name, i) => (
            <button
              key={i}
              onClick={() => onCall(i)}
              style={{
                padding: '10px 14px', borderRadius: 6,
                border: '1px solid #333', background: '#1a1a1a',
                color: '#fff', fontFamily: 'monospace',
                fontSize: 12, cursor: 'pointer',
              }}
            >
              {name}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
