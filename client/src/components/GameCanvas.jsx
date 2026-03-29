import React, { useEffect, useRef, useState } from 'react'
import { useGameStore } from '../store/gameStore'
import { initEngine, destroyEngine } from '../game/engine'
import MatchResult from './MatchResult'
import PocketCallModal from './PocketCallModal'

function getBallColor(n) {
  const colors = {
    1: '#f5c518', 2: '#1a66cc', 3: '#ff3300', 4: '#6600cc',
    5: '#ff6600', 6: '#006600', 7: '#990000',
    9: '#f5c518', 10: '#1a66cc', 11: '#ff3300', 12: '#6600cc',
    13: '#ff6600', 14: '#006600', 15: '#990000',
  }
  return colors[n] || '#888'
}

function useWindowSize() {
  const [size, setSize] = useState({ w: window.innerWidth, h: window.innerHeight })
  useEffect(() => {
    const handler = () => setSize({ w: window.innerWidth, h: window.innerHeight })
    window.addEventListener('resize', handler)
    window.addEventListener('orientationchange', () => setTimeout(handler, 150))
    return () => {
      window.removeEventListener('resize', handler)
      window.removeEventListener('orientationchange', handler)
    }
  }, [])
  return size
}

const TABLE_W = 800
const TABLE_H = 450

function getScale(windowWidth) {
  const maxW = Math.min(windowWidth - 8, TABLE_W)
  return Math.min(1, maxW / TABLE_W)
}

export default function GameCanvas({ gameState, onGameOver }) {
  const containerRef = useRef(null)
  const gameRef      = useRef(null)
  const canvasRectRef = useRef(null)

  const [myTurn,   setMyTurn]   = useState(true)
  const [myType,   setMyType]   = useState(null)
  const [pocketed, setPocketed] = useState([])
  const [foul,     setFoul]     = useState(false)
  const [result,   setResult]   = useState(null)

  const [canvasWidth, setCanvasWidth] = useState(window.innerWidth)

  const [needsPocketCall,      setNeedsPocketCall]      = useState(false)
  const [placingCueBall,       setPlacingCueBall]       = useState(false)
  const [calledPocket,         setCalledPocket]         = useState(null)
  const [opponentDisconnected, setOpponentDisconnected] = useState(false)
  const [waitingForOpponent,   setWaitingForOpponent]   = useState(false)

  const { w: windowWidth, h: windowHeight } = useWindowSize()
  const hudWidth = canvasWidth
  const scale    = canvasWidth / TABLE_W

  useEffect(() => {
    if (!containerRef.current) return
    if (gameRef.current) return

    gameRef.current = initEngine(
      'game-container',
      gameState,
      (outcome) => setResult(outcome),
      ({ switched, foul: wasFoul, assignedType, myTurn: nextMyTurn, myType: engineMyType }) => {
        const scene = gameRef.current?.scene?.scenes?.[0]
        if (!scene) return

        const isMine = typeof nextMyTurn === 'boolean'
          ? nextMyTurn
          : !!scene.registry.get('myTurn')

        setMyTurn(isMine)
        setFoul(!!wasFoul)
        if (engineMyType) setMyType(engineMyType)
        else if (assignedType) setMyType(assignedType)

        if (gameState?.mode === 'online' && switched) setWaitingForOpponent(true)

        if (gameState?.mode === 'online' && assignedType) {
          import('../lib/supabase').then(({ default: supabase }) => {
            const isP1 = gameState.user.id === gameState.game.player1_id
            supabase.from('games').update({
              [isP1 ? 'player1_type' : 'player2_type']: assignedType,
              [isP1 ? 'player2_type' : 'player1_type']:
                assignedType === 'solid' ? 'stripe' : 'solid',
            }).eq('id', gameState.game.id)
          })
        }
        // Clear any called-pocket/react state on turn end so HUD resets
        setCalledPocket(null)
        setNeedsPocketCall(false)
      },
      (ball) => {
        setPocketed(prev => [...prev, ball.label])
      }
    )

    if (gameState?.mode === 'online') {
      import('../socket/client').then(({ setScene, setOnTurnDone, joinRoom }) => {
        const scene = gameRef.current?.scene?.scenes?.[0]
        if (!scene) return
        setScene(scene)
        setOnTurnDone((ballState) => {
          const currentScene = gameRef.current?.scene?.scenes?.[0]
          if (!currentScene || !ballState) return
          import('../game/balls').then(({ rehydrateBalls }) => {
            rehydrateBalls(currentScene, ballState)
            currentScene.registry.set('shotFired', false)
            setWaitingForOpponent(false)
            setMyTurn(true)
          })
        })
        setWaitingForOpponent(!scene.registry.get('myTurn'))
        joinRoom(gameState.game.id, gameState.user.id, gameState.game.id)
      })
    }

    const syncInterval = setInterval(() => {
      // Track canvas position for pocket overlay
      const canvas = gameRef.current?.canvas
      if (canvas) {
        canvasRectRef.current = canvas.getBoundingClientRect()
        setCanvasWidth(Math.round(canvasRectRef.current.width))
      }

      const scene = gameRef.current?.scene?.scenes?.[0]
      if (!scene) return

      const rawTurn = scene.registry.get('myTurn')
      if (rawTurn === undefined || rawTurn === null) return

      const shotFired = scene.registry.get('shotFired')
      const balls     = scene.registry.get('balls') || []
      const moving    = balls.some(b =>
        !b.pocketed && (
          Math.abs(b.body?.velocity?.x || 0) > 0.05 ||
          Math.abs(b.body?.velocity?.y || 0) > 0.05
        )
      )

      if (!moving && !shotFired) setMyTurn(!!rawTurn)
      if (gameState?.mode === 'online') setWaitingForOpponent(!rawTurn)

      setFoul(!!scene.registry.get('foul'))
      const type = scene.registry.get('myType')
      if (type) setMyType(type)
      setPlacingCueBall(!!scene.registry.get('placingCueBall'))
      if (scene.registry.get('opponentDisconnected')) setOpponentDisconnected(true)

      const pocketedLabels = (scene.registry.get('balls') || [])
        .filter(b => b?.pocketed).map(b => b.label)
      setPocketed(pocketedLabels)

      const mt       = scene.registry.get('myType')
      const oppType  = mt === 'solid' ? 'stripe' : mt === 'stripe' ? 'solid' : null
      const isMine   = !!scene.registry.get('myTurn')
      const allBalls = scene.registry.get('balls') || []

      // Check if the CURRENT shooter's balls are all done
      const shooterType = isMine ? mt : oppType
      const shooterBalls = shooterType ? allBalls.filter(b => b.type === shooterType) : []
      const allDone      = shooterBalls.length > 0 && shooterBalls.every(b => b.pocketed)
      const eightLeft    = allBalls.some(b => b.type === '8ball' && !b.pocketed)
      const alreadyCalled = scene.registry.get('calledPocket') !== null &&
                            scene.registry.get('calledPocket') !== undefined

      if (allDone && eightLeft && !alreadyCalled) {
        setNeedsPocketCall(true)
      } else if (alreadyCalled || !eightLeft) {
        setNeedsPocketCall(false)
      }
    }, 300)

    return () => {
      clearInterval(syncInterval)
      if (gameState?.mode === 'online') {
        import('../socket/client').then(({ setOnTurnDone }) => setOnTurnDone(null))
      }
      destroyEngine(gameRef.current)
    }
  }, [])

  function handlePocketCall(pocketIndex) {
    const scene = gameRef.current?.scene?.scenes?.[0]
    // Write to registry FIRST so syncInterval sees it immediately on next tick
    if (scene) scene.registry.set('calledPocket', pocketIndex)
    useGameStore.setSelectingPocket(false)
    useGameStore.setCalledPocket(pocketIndex)
    setCalledPocket(pocketIndex)
    setNeedsPocketCall(false)
  }

  if (result) {
    return (
      <MatchResult
        result={result}
        onRematch={() => { setResult(null); onGameOver('rematch') }}
        onHome={() => onGameOver('home')}
      />
    )
  }

  const ballSz = Math.max(12, Math.round(18 * scale))
  const ballGap = Math.max(3, Math.round(5 * scale))

  return (
    <div style={{
      display:            'flex',
      flexDirection:      'column',
      alignItems:         'center',
      background:         '#0a0a0a',
      minHeight:          '100dvh',
      paddingTop:         'env(safe-area-inset-top, 0px)',
      paddingBottom:      'env(safe-area-inset-bottom, 8px)',
      overflowX:          'hidden',
      overflowY:          'auto',       // allow scroll if table still overflows
      overscrollBehavior: 'contain',
    }}>
      {/* Canvas wrapper — no extra borders; all visuals are inside Phaser */}
      <div style={{ position: 'relative', lineHeight: 0, touchAction: 'none' }}>
        <div
          id="game-container"
          ref={containerRef}
          style={{
            display:    'block',
            lineHeight: 0,
            fontSize:   0,
            background: 'transparent',
            border:     'none',
            outline:    'none',
          }}
        />

        {waitingForOpponent && (
          <div style={{
            position:       'absolute', inset: 0,
            background:     'rgba(0,0,0,0.6)',
            display:        'flex', flexDirection: 'column',
            alignItems:     'center', justifyContent: 'center',
            zIndex:         50, pointerEvents: 'none',
          }}>
            <div style={{ fontSize: 14, color: '#fff', fontFamily: 'monospace', textAlign: 'center' }}>
              <div style={{ marginBottom: 8, fontSize: 24 }}>⏳</div>
              Waiting for opponent's turn…
              <div style={{ fontSize: 11, color: '#aaa', marginTop: 6 }}>
                You can close the app — we'll notify you when it's your turn
              </div>
            </div>
          </div>
        )}

        {placingCueBall && (
          <div style={{
            position:       'absolute', top: 0, left: 0,
            width:          '100%', height: '100%',
            border:         '2px dashed rgba(255,255,255,0.4)',
            pointerEvents:  'none',
            display:        'flex', alignItems: 'center', justifyContent: 'center',
            boxSizing:      'border-box',
          }}>
            <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: 11, fontFamily: 'monospace' }}>
              BALL IN HAND — DRAG TO PLACE CUE
            </span>
          </div>
        )}
      </div>

      {opponentDisconnected && (
        <div style={{
          width: hudWidth, marginTop: 4,
          background: '#2a1a00', border: '1px solid #664400',
          borderRadius: 6, padding: '6px 12px',
          color: '#ffaa00', fontSize: 12, fontFamily: 'monospace',
          textAlign: 'center', boxSizing: 'border-box',
        }}>
          Opponent disconnected — game saved. They can rejoin anytime.
        </div>
      )}

      {/* HUD */}
      <div style={{
        width:          hudWidth,
        marginTop:      6,
        background:     '#111',
        borderRadius:   8,
        padding:        `8px ${Math.round(12 * scale)}px`,
        display:        'flex',
        justifyContent: 'space-between',
        alignItems:     'center',
        fontFamily:     'monospace',
        boxSizing:      'border-box',
        gap:            4,
      }}>
        {/* P1 solids */}
        <div style={{ display: 'flex', gap: ballGap, alignItems: 'center', flexShrink: 0 }}>
          <span style={{ fontSize: 10, color: '#555', marginRight: 2 }}>
            {!myType ? 'P1' : myType === 'solid' ? 'P1' : 'P2'}
          </span>
          {[1,2,3,4,5,6,7].map(n => {
            const isAssigned = myType !== null
            const isPocketed = pocketed.includes(`solid-${n}`)
            return (
              <div key={n} style={{
                width: ballSz, height: ballSz, borderRadius: '50%',
                background: isAssigned ? getBallColor(n) : '#222',
                opacity:    isPocketed ? 0.2 : 1,
                border:     isAssigned ? 'none' : '1px solid #333',
                flexShrink: 0,
                transition: 'background 0.3s',
              }} />
            )
          })}
        </div>

        {/* Turn indicator */}
        <div style={{ textAlign: 'center', flexShrink: 0 }}>
          {foul && <div style={{ color: '#ff4444', fontSize: 9, marginBottom: 2 }}>FOUL</div>}
          {placingCueBall && (
            <div style={{ color: '#ffaa00', fontSize: 9, marginBottom: 2 }}>BALL IN HAND</div>
          )}
          <div style={{
            fontSize:   Math.max(10, Math.round(13 * scale)),
            fontWeight: 'bold',
            padding:    `4px ${Math.round(12 * scale)}px`,
            borderRadius: 6,
            minWidth:   Math.round(80 * scale),
            textAlign:  'center',
            background: myTurn ? '#1a6b2a' : '#6b1a1a',
            color:      '#fff',
            whiteSpace: 'nowrap',
          }}>
            {myTurn ? 'P1 TURN' : 'P2 TURN'}
          </div>
          {!myType && (
            <div style={{ fontSize: 8, color: '#444', marginTop: 2 }}>pot a ball to assign</div>
          )}
          {calledPocket !== null && (
            <div style={{ fontSize: 8, color: '#ffdd44', marginTop: 2 }}>
              8-ball → {['TL','TM','TR','BL','BM','BR'][calledPocket]}
            </div>
          )}
        </div>

        {/* P2 stripes */}
        <div style={{ display: 'flex', gap: ballGap, alignItems: 'center', flexShrink: 0 }}>
          {[9,10,11,12,13,14,15].map(n => {
            const isAssigned = myType !== null
            const isPocketed = pocketed.includes(`stripe-${n}`)
            const borderPx   = Math.max(2, Math.round(3 * scale))
            return (
              <div key={n} style={{
                width:      ballSz, height: ballSz, borderRadius: '50%',
                background: isAssigned ? '#fff' : '#222',
                opacity:    isPocketed ? 0.2 : 1,
                border:     isAssigned
                  ? `${borderPx}px solid ${getBallColor(n)}`
                  : '1px solid #333',
                boxSizing:  'border-box',
                flexShrink: 0,
                transition: 'border 0.3s, background 0.3s',
              }} />
            )
          })}
          <span style={{ fontSize: 10, color: '#555', marginLeft: 2 }}>
            {!myType ? 'P2' : myType === 'stripe' ? 'P1' : 'P2'}
          </span>
        </div>
      </div>

      {needsPocketCall && (
        <PocketCallModal
          onCall={handlePocketCall}
          canvasRect={canvasRectRef.current}
        />
      )}
    </div>
  )
}