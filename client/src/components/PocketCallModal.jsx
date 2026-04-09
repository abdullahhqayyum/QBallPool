import React from 'react'
import ReactDOM from 'react-dom'
import { POCKET } from '../game/constants'
import { TABLE } from '../game/constants'

const POCKET_LABELS = ['TL', 'TM', 'TR', 'BL', 'BM', 'BR']

export default function PocketCallModal({ onCall, canvasRect, showBanner = true }) {
  if (!canvasRect) return null

  const scaleX = canvasRect.width  / TABLE.width
  const scaleY = canvasRect.height / TABLE.height

  return ReactDOM.createPortal(
    <>
      {showBanner && (
        <div style={{
          position:   'fixed',
          top:        canvasRect.top + 12,
          left:       '50%',
          transform:  'translateX(-50%)',
          background: 'rgba(0,0,0,0.75)',
          color:      'white',
          padding:    '8px 16px',
          borderRadius: 8,
          fontSize:   13,
          fontFamily: 'monospace',
          pointerEvents: 'none',
          zIndex:     201,
          whiteSpace: 'nowrap',
        }}>
          🎱 Call your pocket for the 8-ball
        </div>
      )}

      {/* Clickable pocket targets */}
      {POCKET.positions.map(([px, py], i) => {
        const cssX = canvasRect.left + px * scaleX
        const cssY = canvasRect.top  + py * scaleY
        return (
          <div
            key={i}
            onClick={() => onCall(i)}
            style={{
              position:     'fixed',
              left:         cssX - 22,
              top:          cssY - 22,
              width:        44,
              height:       44,
              borderRadius: '50%',
              background:   'rgba(255,30,30,0.55)',
              border:       '2px solid #ff4444',
              cursor:       'pointer',
              zIndex:       200,
              display:      'flex',
              alignItems:   'center',
              justifyContent: 'center',
              color:        '#fff',
              fontSize:     9,
              fontFamily:   'monospace',
              fontWeight:   'bold',
              boxShadow:    '0 0 10px rgba(255,0,0,0.6)',
              transition:   'background 0.15s',
              pointerEvents: 'auto',
            }}
            onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,80,80,0.85)'}
            onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,30,30,0.55)'}
          >
            {POCKET_LABELS[i]}
          </div>
        )
      })}
    </>,
    document.body
  )
}