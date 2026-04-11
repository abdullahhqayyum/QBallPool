import React from 'react'
import ReactDOM from 'react-dom'
import { POCKET } from '../game/constants'
import { TABLE } from '../game/constants'

const POCKET_LABELS = ['TL', 'TM', 'TR', 'BL', 'BM', 'BR']

export default function PocketCallModal({ onCall, canvasRect, showBanner = true }) {
  if (!canvasRect) return null

  const isPortrait = window.innerHeight > window.innerWidth

  // In portrait, the canvas is rotated 90deg clockwise via CSS transform.
  // canvasRect reflects the rotated element's bounding box on screen.
  // We need to map game-space (x, y) → screen-space manually.
  function gameToScreen(px, py) {
    if (!isPortrait) {
      const scaleX = canvasRect.width  / TABLE.width
      const scaleY = canvasRect.height / TABLE.height
      return {
        x: canvasRect.left + px * scaleX,
        y: canvasRect.top  + py * scaleY,
      }
    }

    // Portrait: canvas is rotated 90deg clockwise, so:
    // game-x maps to screen-y (top→bottom)
    // game-y maps to screen-x (right→left)
    // The rotated canvas occupies the full viewport minus the HUD at bottom
    const MOBILE_HUD_H = 58
    const availH = window.innerHeight - MOBILE_HUD_H
    const availW = window.innerWidth

    // Scale factors — in portrait the canvas is scaled to fit rotated
    const s = Math.min(availW / TABLE.height, availH / TABLE.width)

    // Canvas center on screen
    const cx = availW / 2
    const cy = availH / 2

    // Canvas rotates 90deg CW: game-x → down screen, game-y → left on screen
    // Map game (px,py) → screen coordinates (flip signs for CW rotation)
    // After rotation: game-x goes down (increases y), game-y goes left (decreases x)
    const screenX = cx - (py - TABLE.height / 2) * s
    const screenY = cy + (px - TABLE.width  / 2) * s

    return { x: screenX, y: screenY }
  }

  return ReactDOM.createPortal(
    <>
      {showBanner && (
        <div style={{
          position:      'fixed',
          top:           isPortrait ? 12 : canvasRect.top + 12,
          left:          '50%',
          transform:     'translateX(-50%)',
          background:    'rgba(0,0,0,0.75)',
          color:         'white',
          padding:       '8px 16px',
          borderRadius:  8,
          fontSize:      13,
          fontFamily:    'monospace',
          pointerEvents: 'none',
          zIndex:        201,
          whiteSpace:    'nowrap',
        }}>
          🎱 Call your pocket for the 8-ball
        </div>
      )}

      {POCKET.positions.map(([px, py], i) => {
        const { x, y } = gameToScreen(px, py)
        return (
          <div
            key={i}
            onClick={() => onCall(i)}
            style={{
              position:       'fixed',
              left:           x - 22,
              top:            y - 22,
              width:          44,
              height:         44,
              borderRadius:   '50%',
              background:     'rgba(255,30,30,0.55)',
              border:         '2px solid #ff4444',
              cursor:         'pointer',
              zIndex:         200,
              display:        'flex',
              alignItems:     'center',
              justifyContent: 'center',
              color:          '#fff',
              fontSize:       9,
              fontFamily:     'monospace',
              fontWeight:     'bold',
              boxShadow:      '0 0 10px rgba(255,0,0,0.6)',
              transition:     'background 0.15s',
              pointerEvents:  'auto',
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