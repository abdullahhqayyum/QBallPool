import React from 'react'

export default function HUD({ gameState, pocketed, myType, myTurn, foul }) {
  const solids  = [1,2,3,4,5,6,7]
  const stripes = [9,10,11,12,13,14,15]

  function ballPocketed(type, n) {
    return pocketed?.includes(`${type}-${n}`)
  }

  const turnText = gameState?.mode === 'offline'
    ? (myTurn ? 'P1 TURN' : 'P2 TURN')
    : (myTurn ? 'YOUR TURN' : 'THEIR TURN')

  return (
    <div style={{
      position: 'absolute', bottom: 0, left: 0, right: 0,
      background: 'rgba(0,0,0,0.85)',
      borderTop: '1px solid #333',
      padding: '8px 16px',
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      fontFamily: 'monospace',
      zIndex: 20,
      pointerEvents: 'none',
    }}>

      {/* Solids */}
      <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
        <span style={{ fontSize: 10, color: '#666', marginRight: 4 }}>
          {gameState?.mode === 'offline'
            ? (myType === 'solid' ? 'P1' : myType === 'stripe' ? 'P2' : 'P1')
            : myType === 'solid' ? 'YOU' : 'OPP'}
          {gameState?.mode === 'offline'
            ? (myType === 'stripe' ? 'P1' : myType === 'solid' ? 'P2' : 'P2')
            : myType === 'stripe' ? 'YOU' : 'OPP'}
          </span>
        {solids.map(n => (
          <div key={n} style={{
            width: 16, height: 16, borderRadius: '50%',
            background: ballPocketed('solid', n) ? '#111' : getBallColor(n),
            opacity: ballPocketed('solid', n) ? 0.25 : 1,
            border: '1px solid #333',
          }} />
        ))}
      </div>

      {/* Turn indicator */}
      <div style={{ textAlign: 'center' }}>
        {foul && <div style={{ color: '#ff4444', fontSize: 10, marginBottom: 2 }}>FOUL</div>}
        <div style={{
          fontSize: 13, fontWeight: 'bold', padding: '4px 14px',
          borderRadius: 6,
          background: myTurn ? '#1a6b2a' : '#6b1a1a',
          color: '#fff',
        }}>
          {turnText}
        </div>
        {!myType && gameState?.mode !== 'offline' && (
          <div style={{ fontSize: 9, color: '#555', marginTop: 2 }}>pot a ball to assign</div>
        )}
      </div>

      {/* Stripes */}
      <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
        {stripes.map(n => (
          <div key={n} style={{
            width: 16, height: 16, borderRadius: '50%',
            background: ballPocketed('stripe', n) ? '#111' : '#fff',
            opacity: ballPocketed('stripe', n) ? 0.25 : 1,
            border: `3px solid ${ballPocketed('stripe', n) ? '#222' : getBallColor(n)}`,
          }} />
        ))}
        <span style={{ fontSize: 10, color: '#666', marginLeft: 4 }}>
          {gameState?.mode === 'offline' ? 'P2' : myType === 'stripe' ? 'YOU' : 'OPP'}
        </span>
      </div>

    </div>
  )
}

function getBallColor(n) {
  const colors = {
    1: '#f5c518', 2: '#1a66cc', 3: '#ff3300', 4: '#6600cc',
    5: '#ff6600', 6: '#00aa44', 7: '#990000',
    9: '#f5c518', 10: '#1a66cc', 11: '#ff3300', 12: '#6600cc',
    13: '#ff6600', 14: '#00aa44', 15: '#990000',
  }
  return colors[n] || '#888'
}