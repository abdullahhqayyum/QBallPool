import React, { useEffect, useRef, useState } from 'react'
import { initEngine, destroyEngine } from '../game/engine'
import MatchResult from './MatchResult'
import PocketCallModal from './PocketCallModal'

const TABLE_WIDTH = 800

function getBallColor(n) {
  const colors = {
    1: '#f5c518', 2: '#1a66cc', 3: '#ff3300', 4: '#6600cc',
    5: '#ff6600', 6: '#006600', 7: '#990000',
    9: '#f5c518', 10: '#1a66cc', 11: '#ff3300', 12: '#6600cc',
    13: '#ff6600', 14: '#006600', 15: '#990000',
  }
  return colors[n] || '#888'
}

export default function GameCanvas({ gameState, onGameOver }) {
  const containerRef = useRef(null)
  const gameRef      = useRef(null)

  const [myTurn,   setMyTurn]   = useState(true)
  const [myType,   setMyType]   = useState(null)
  const [pocketed, setPocketed] = useState([])
  const [foul,     setFoul]     = useState(false)
  const [result,   setResult]   = useState(null)
  
  const [needsPocketCall,  setNeedsPocketCall]  = useState(false)
  const [placingCueBall,   setPlacingCueBall]   = useState(false)
  const [calledPocket,     setCalledPocket]     = useState(null)
  const [opponentDisconnected, setOpponentDisconnected] = useState(false)
  const [waitingForOpponent, setWaitingForOpponent] = useState(false)

  useEffect(() => {
    if (!containerRef.current) return
    if (gameRef.current) return

    gameRef.current = initEngine(
      'game-container',
      gameState,
      (outcome) => setResult(outcome),
      ({ switched, foul: wasFoul, assignedType, needsTypeChoice: ntc, myTurn: nextMyTurn, myType: engineMyType, oppType: engineOppType }) => {
        const scene = gameRef.current?.scene?.scenes?.[0]
        if (!scene) return

        const isMine = typeof nextMyTurn === 'boolean'
          ? nextMyTurn
          : !!scene.registry.get('myTurn')

        setMyTurn(isMine)
        setFoul(!!wasFoul)
        // Prefer engine-provided P1 type when available (engineMyType = P1's type)
        if (engineMyType) setMyType(engineMyType)
        else if (assignedType) setMyType(assignedType)

        if (gameState?.mode === 'online' && switched) {
          setWaitingForOpponent(true)
        }

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

        joinRoom(
          gameState.game.id,
          gameState.user.id,
          gameState.game.id,
        )
      })
    }

    const syncInterval = setInterval(() => {
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

      if (!moving && !shotFired) {
        setMyTurn(!!rawTurn)
      }

      if (gameState?.mode === 'online') {
        setWaitingForOpponent(!rawTurn)
      }

      setFoul(!!scene.registry.get('foul'))
      const type = scene.registry.get('myType')
      if (type) setMyType(type)
      setPlacingCueBall(!!scene.registry.get('placingCueBall'))

      const disconnected = scene.registry.get('opponentDisconnected')
      if (disconnected) {
        setOpponentDisconnected(true)
      }

      const allBalls = scene.registry.get('balls') || []
      const pocketedLabels = allBalls.filter(b => b?.pocketed).map(b => b.label)
      setPocketed(pocketedLabels)

      // Show pocket call modal when only 8-ball left and it's your turn
      const mt       = scene.registry.get('myType')
      const isMine   = scene.registry.get('myTurn')
      const myBalls  = balls.filter(b => b.type === mt)
      const allDone  = mt && myBalls.every(b => b.pocketed)
      const eightLeft = balls.find(b => b.type === '8ball' && !b.pocketed)
      if (allDone && eightLeft && isMine && !calledPocket) {
        setNeedsPocketCall(true)
      }
    }, 300)

    return () => {
      clearInterval(syncInterval)
      if (gameState?.mode === 'online') {
        import('../socket/client').then(({ setOnTurnDone }) => {
          setOnTurnDone(null)
        })
      }
      destroyEngine(gameRef.current)
    }
  }, [])



  function handlePocketCall(pocketIndex) {
    setNeedsPocketCall(false)
    setCalledPocket(pocketIndex)
    const scene = gameRef.current?.scene?.scenes?.[0]
    if (scene) scene.registry.set('calledPocket', pocketIndex)
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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', background: '#0a0a0a', minHeight: '100vh', justifyContent: 'center' }}>

      <div style={{ position: 'relative' }}>
        <div id="game-container" ref={containerRef} style={{ border: '3px solid #3a2010', borderRadius: 8, display: 'block' }} />

        {waitingForOpponent && (
          <div style={{
            position: 'absolute',
            inset: 0,
            background: 'rgba(0,0,0,0.6)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: 8,
            zIndex: 50,
            pointerEvents: 'none',
          }}>
            <div style={{
              fontSize: 14,
              color: '#fff',
              fontFamily: 'monospace',
              textAlign: 'center',
            }}>
              <div style={{ marginBottom: 8, fontSize: 24 }}>⏳</div>
              Waiting for opponent's turn...
              <div style={{ fontSize: 11, color: '#666', marginTop: 6 }}>
                You can close the app — we'll notify you when it's your turn
              </div>
            </div>
          </div>
        )}

        {/* Ball-in-hand indicator — show when placing cue ball */}
        {placingCueBall && (
          <div style={{
            position: 'absolute', top: 0, left: 0,
            width: '100%', height: '100%',
            border: '2px dashed rgba(255,255,255,0.4)',
            borderRadius: 8,
            pointerEvents: 'none',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: 11, fontFamily: 'monospace' }}>
              BALL IN HAND — PLACE CUE ANYWHERE
            </span>
          </div>
        )}
      </div>

      {opponentDisconnected && (
        <div style={{
          width: 800, marginTop: 6,
          background: '#2a1a00', border: '1px solid #664400',
          borderRadius: 6, padding: '8px 14px',
          color: '#ffaa00', fontSize: 12, fontFamily: 'monospace',
          textAlign: 'center',
        }}>
          Opponent disconnected — game saved. They can rejoin anytime.
        </div>
      )}

      {/* HUD */}
      <div style={{
        width: TABLE_WIDTH, marginTop: 8, background: '#111',
        borderRadius: 8, padding: '10px 16px',
        display: 'flex', justifyContent: 'space-between',
        alignItems: 'center', fontFamily: 'monospace', boxSizing: 'border-box',
      }}>
        {/* P1 solids — left side */}
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <span style={{ fontSize: 11, color: '#555', marginRight: 4 }}>
            {!myType ? 'P1' : myType === 'solid' ? 'P1' : 'P2'}
          </span>
          {[1,2,3,4,5,6,7].map(n => {
            const isAssigned = myType !== null
            const isPocketed = pocketed.includes(`solid-${n}`)
            return (
              <div key={n} style={{
                width: 18, height: 18, borderRadius: '50%',
                background: isAssigned ? getBallColor(n) : '#222',
                opacity: isPocketed ? 0.25 : 1,
                border: isAssigned ? 'none' : '1px solid #333',
                transition: 'background 0.3s',
              }} />
            )
          })}
        </div>

        {/* Turn indicator */}
        <div style={{ textAlign: 'center' }}>
          {foul && <div style={{ color: '#ff4444', fontSize: 10, marginBottom: 3 }}>FOUL</div>}
          {placingCueBall && (
            <div style={{ color: '#ffaa00', fontSize: 10, marginBottom: 3 }}>BALL IN HAND — PLACE CUE ANYWHERE</div>
          )}
          <div style={{
            fontSize: 13, fontWeight: 'bold', padding: '5px 18px',
            borderRadius: 6, minWidth: 100, textAlign: 'center',
            background: myTurn ? '#1a6b2a' : '#6b1a1a', color: '#fff',
          }}>
            {myTurn ? 'P1 TURN' : 'P2 TURN'}
          </div>
          {!myType && (
            <div style={{ fontSize: 9, color: '#444', marginTop: 3 }}>pot a ball to assign</div>
          )}
          {calledPocket !== null && (
            <div style={{ fontSize: 9, color: '#ffdd44', marginTop: 3 }}>
              8-ball → {['TL','TM','TR','BL','BM','BR'][calledPocket]}
            </div>
          )}
        </div>

        {/* P2 stripes — right side */}
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          {[9,10,11,12,13,14,15].map(n => {
            const isAssigned = myType !== null
            const isPocketed = pocketed.includes(`stripe-${n}`)
            return (
              <div key={n} style={{
                width: 18, height: 18, borderRadius: '50%',
                background: isAssigned ? '#fff' : '#222',
                opacity: isPocketed ? 0.25 : 1,
                border: isAssigned
                  ? `3px solid ${getBallColor(n)}`
                  : '1px solid #333',
                boxSizing: 'border-box',
                transition: 'border 0.3s, background 0.3s',
              }} />
            )
          })}
          <span style={{ fontSize: 11, color: '#555', marginLeft: 4 }}>
            {!myType ? 'P2' : myType === 'stripe' ? 'P1' : 'P2'}
          </span>
        </div>
      </div>

      {/* Modals */}
      
      {needsPocketCall  && <PocketCallModal onCall={handlePocketCall} />}
    </div>
  )
}