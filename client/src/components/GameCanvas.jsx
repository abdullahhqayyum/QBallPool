import React, { useEffect, useRef, useState } from 'react'
import { useGameStore } from '../store/gameStore'
import { initEngine, destroyEngine, snapshotForCheat, useCheat } from '../game/engine'
import MatchResult from './MatchResult'
import PocketCallModal from './PocketCallModal'
import { setSpin, getSpin } from '../game/cue'

function Confetti({ active }) {
  const canvasRef = useRef(null)
  const animRef   = useRef(null)

  useEffect(() => {
    if (!active) return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx    = canvas.getContext('2d')
    canvas.width  = canvas.offsetWidth
    canvas.height = canvas.offsetHeight

    const pieces = Array.from({ length: 80 }, () => ({
      x:    Math.random() * canvas.width,
      y:    Math.random() * canvas.height * 0.4,
      vx:   (Math.random() - 0.5) * 4,
      vy:   Math.random() * 3 + 1,
      rot:  Math.random() * Math.PI * 2,
      vrot: (Math.random() - 0.5) * 0.2,
      w:    6 + Math.random() * 6,
      h:    3 + Math.random() * 4,
      color: ['#ff5500','#ffdd00','#00cc66','#3399ff','#ff44aa','#ffffff'][Math.floor(Math.random() * 6)],
      life: 1,
    }))

    const tick = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      let alive = false
      for (const p of pieces) {
        p.x   += p.vx
        p.y   += p.vy
        p.vy  += 0.07
        p.rot += p.vrot
        p.life -= 0.012
        if (p.life <= 0) continue
        alive = true
        ctx.save()
        ctx.globalAlpha = p.life
        ctx.translate(p.x, p.y)
        ctx.rotate(p.rot)
        ctx.fillStyle = p.color
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h)
        ctx.restore()
      }
      if (alive) animRef.current = requestAnimationFrame(tick)
    }

    animRef.current = requestAnimationFrame(tick)

    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current)
      ctx.clearRect(0, 0, canvas.width, canvas.height)
    }
  }, [active])

  if (!active) return null
  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        zIndex: 30,
      }}
    />
  )
}

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
const HUD_RESERVE = 96

function getScale(windowWidth) {
  const maxW = Math.min(windowWidth - 8, TABLE_W)
  return Math.min(1, maxW / TABLE_W)
}

function SpinPicker({ spin, onChange, size = 48 }) {
  const radius  = size / 2
  const dotR    = Math.max(4, Math.round(size * 0.12))
  const isDragging = useRef(false)

  const dotX = radius + spin.x * (radius - dotR - 2)
  const dotY = radius + spin.y * (radius - dotR - 2)

  function applyFromEvent(e, el) {
    const rect = el.getBoundingClientRect()
    const cx   = rect.left + radius
    const cy   = rect.top  + radius
    const rawX = ((e.clientX ?? e.touches?.[0]?.clientX) - cx) / (radius - dotR - 2)
    const rawY = ((e.clientY ?? e.touches?.[0]?.clientY) - cy) / (radius - dotR - 2)
    const mag  = Math.hypot(rawX, rawY)
    const x    = mag > 1 ? rawX / mag : rawX
    const y    = mag > 1 ? rawY / mag : rawY
    onChange({ x: +x.toFixed(2), y: +y.toFixed(2) })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
      <div style={{ fontSize: 8, color: '#555', fontFamily: 'monospace' }}>SPIN</div>
      <svg
        width={size} height={size}
        style={{ cursor: 'crosshair', touchAction: 'none' }}
        onMouseDown={e  => { isDragging.current = true;  applyFromEvent(e, e.currentTarget) }}
        onMouseMove={e  => { if (isDragging.current) applyFromEvent(e, e.currentTarget) }}
        onMouseUp={() =>    { isDragging.current = false }}
        onMouseLeave={() => { isDragging.current = false }}
        onTouchStart={e => { isDragging.current = true;  applyFromEvent(e, e.currentTarget) }}
        onTouchMove={e  => { isDragging.current = true;  applyFromEvent(e, e.currentTarget) }}
        onTouchEnd={() =>   { isDragging.current = false }}
      >
        <circle cx={radius} cy={radius} r={radius - 1} fill="#1a1a1a" stroke="#333" strokeWidth={1} />
        <line x1={radius} y1={2}      x2={radius}      y2={size - 2} stroke="#2a2a2a" strokeWidth={1} />
        <line x1={2}      y1={radius} x2={size - 2}    y2={radius}   stroke="#2a2a2a" strokeWidth={1} />
        <circle cx={dotX} cy={dotY} r={dotR} fill={Math.hypot(spin.x, spin.y) > 0.1 ? '#ffdd44' : '#444'} />
      </svg>
      <div
        style={{ fontSize: 8, color: '#444', fontFamily: 'monospace', cursor: 'pointer' }}
        onClick={() => onChange({ x: 0, y: 0 })}
      >
        {Math.hypot(spin.x, spin.y) > 0.1
          ? `${spin.x > 0 ? 'R' : spin.x < 0 ? 'L' : ''}${spin.y > 0 ? '+top' : spin.y < 0 ? '+back' : ''}`
          : 'none'}
      </div>
    </div>
  )
}

export default function GameCanvas({ gameState, onGameOver }) {
  const containerRef = useRef(null)
  const gameRef      = useRef(null)
  const canvasRectRef = useRef(null)
  const hudRef = useRef(null)

  const [myTurn,   setMyTurn]   = useState(true)
  const [myType,   setMyType]   = useState(null)
  const [pocketed, setPocketed] = useState([])
  const [foul,     setFoul]     = useState(false)
  const [result,   setResult]   = useState(null)

  const [cheatAvailable, setCheatAvailable] = useState(false)
  const [cheatUsed,      setCheatUsed]      = useState(false)
  const [showConfetti,   setShowConfetti]   = useState(false)

  const [spin, setSpin_] = useState({ x: 0, y: 0 })

  const [canvasWidth, setCanvasWidth] = useState(window.innerWidth)

  const [needsPocketCall,      setNeedsPocketCall]      = useState(false)
  const [placingCueBall,       setPlacingCueBall]       = useState(false)
  const [calledPocket,         setCalledPocket]         = useState(null)
  const [opponentDisconnected, setOpponentDisconnected] = useState(false)
  const [waitingForOpponent,   setWaitingForOpponent]   = useState(false)
  const [hudHeight,            setHudHeight]            = useState(HUD_RESERVE)

  const { w: windowWidth, h: windowHeight } = useWindowSize()
  const hudWidth = canvasWidth
  const scale    = canvasWidth / TABLE_W

  useEffect(() => {
    const el = hudRef.current
    if (!el) return

    const updateHudHeight = () => {
      const h = Math.ceil(el.getBoundingClientRect().height)
      // Small safety buffer so the board never touches/overlaps the HUD.
      setHudHeight(Math.max(HUD_RESERVE, h + 8))
    }

    updateHudHeight()

    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(updateHudHeight)
      observer.observe(el)
      return () => observer.disconnect()
    }

    window.addEventListener('resize', updateHudHeight)
    return () => window.removeEventListener('resize', updateHudHeight)
  }, [windowWidth])

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
        // Also reset spin state for the new turn
        try {
          setSpin(0, 0)
        } catch (e) {
          // ignore if module not ready
        }
        setSpin_({ x: 0, y: 0 })
        setCalledPocket(null)
        setNeedsPocketCall(false)
      },
      (ball) => {
        setPocketed(prev => [...prev, ball.label])
      }
    )

    // initialise local spin state from the cue module
    try {
      const s = getSpin()
      if (s) setSpin_(s)
    } catch (e) {}

    if (gameState?.mode === 'online') {
      import('../socket/client').then(({ setScene, setOnTurnDone, joinRoom }) => {
        const scene = gameRef.current?.scene?.scenes?.[0]
        if (!scene) return
        setScene(scene)
        setOnTurnDone((ballState, isMyTurn) => {
          const currentScene = gameRef.current?.scene?.scenes?.[0]
          if (!currentScene || !ballState) return
          import('../game/balls').then(({ rehydrateBalls }) => {
            rehydrateBalls(currentScene, ballState)
            currentScene.registry.set('shotFired',            false)
            currentScene.registry.set('ballsWereMoving',      false)
            currentScene.registry.set('firstCueContactLabel', null)
            currentScene.registry.set('firstContactMade',     false)
            currentScene.registry.set('railHitAfterContact',  false)
            currentScene.registry.set('pocketedThisTurn',     [])
            currentScene.registry.set('foul',                 false)
            currentScene.registry.set('placingCueBall',       false)
            currentScene.registry.set('myTurn',               isMyTurn)

            // If cue ball is pocketed in incoming state, give ball in hand to
            // whoever's turn it now is (only if it's mine)
            if (isMyTurn) {
              const balls   = currentScene.registry.get('balls') || []
              const cueBall = balls.find(b => b.label === 'cue')
              if (cueBall?.pocketed) {
                cueBall.pocketed = false
                cueBall.vx = 0
                cueBall.vy = 0
                if (cueBall.gfx) cueBall.gfx.setVisible(true)
                currentScene.registry.set('placingCueBall', true)
                cueBall._placing = true
              }
            }

            setWaitingForOpponent(!isMyTurn)
            setMyTurn(isMyTurn)
            setPlacingCueBall(isMyTurn && (() => {
              const balls = currentScene.registry.get('balls') || []
              return !!balls.find(b => b.label === 'cue' && b.pocketed)
            })())
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
      setCheatAvailable(!!scene.registry.get('cheatAvailable') && !scene.registry.get('cheatUsed'))
      setCheatUsed(!!scene.registry.get('cheatUsed'))
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

  function handleSpinChange(next) {
    try {
      setSpin(next.x, next.y)
    } catch (e) {}
    setSpin_(next)
  }

  function handleCheat() {
    if (cheatUsed || !cheatAvailable) return
    const scene = gameRef.current?.scene?.scenes?.[0]
    if (!scene) return
    useCheat(scene, () => {
      setShowConfetti(true)
      setTimeout(() => setShowConfetti(false), 2800)
    })
    setCheatAvailable(false)
    setCheatUsed(true)
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

  const canvasMaxH = Math.max(180, windowHeight - hudHeight)

  return (
    <div style={{
      display:            'flex',
      flexDirection:      'column',
      alignItems:         'center',
      background:         '#0a0a0a',
      minHeight:          '100vh',
      paddingTop:         'env(safe-area-inset-top, 0px)',
      paddingBottom:      'env(safe-area-inset-bottom, 8px)',
      overflowX:          'hidden',
      overflowY:          'hidden',
      overscrollBehavior: 'contain',
    }}>
      <style>{`
        @keyframes cheatPulse {
          0%, 100% { box-shadow: 0 0 6px #ff550055; }
          50%       { box-shadow: 0 0 14px #ff5500cc; border-color: #ff8844; }
        }
      `}</style>
      {/* Canvas wrapper — no extra borders; all visuals are inside Phaser */}
      <div style={{ position: 'relative', lineHeight: 0, touchAction: 'none', maxHeight: canvasMaxH, width: '100%', overflow: 'hidden' }}>
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

        <Confetti active={showConfetti} />

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
      <div
        ref={hudRef}
        style={{
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

        {/* Turn indicator + cheat */}
        <div style={{ textAlign: 'center', flexShrink: 0 }}>
          {foul && <div style={{ color: '#ff4444', fontSize: 9, marginBottom: 2 }}>FOUL</div>}
          {placingCueBall && (
            <div style={{ color: '#ffaa00', fontSize: 9, marginBottom: 2 }}>BALL IN HAND</div>
          )}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
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
              {gameState?.mode === 'ai'
                ? (myTurn ? 'YOUR TURN' : 'CPU...')
                : (myTurn ? 'P1 TURN' : 'P2 TURN')}
            </div>

            {/* Cheat button */}
            <button
              title={cheatUsed ? 'Cheat already used' : cheatAvailable ? 'Undo this shot!' : 'Available while ball is rolling'}
              onClick={handleCheat}
              style={{
                cursor:       cheatAvailable && !cheatUsed ? 'pointer' : 'default',
                background:   cheatUsed      ? '#111'
                            : cheatAvailable ? '#7a1f00'
                            : '#1c1c1c',
                border:       cheatAvailable && !cheatUsed
                                ? '1px solid #ff5500'
                                : '1px solid #333',
                borderRadius: 6,
                padding:      '1px 6px',
                color:        cheatUsed      ? '#333'
                            : cheatAvailable ? '#fff'
                            : '#3a3a3a',
                fontSize:     11,
                fontFamily:   'monospace',
                fontWeight:   'bold',
                display:      'flex',
                alignItems:   'center',
                gap:          2,
                boxShadow:    cheatAvailable && !cheatUsed ? '0 0 10px #ff550066' : 'none',
                transition:   'all 0.2s',
                animation:    cheatAvailable && !cheatUsed ? 'cheatPulse 1s ease-in-out infinite' : 'none',
              }}
            >
              <span style={{ fontSize: 11, lineHeight: 1 }}>{cheatUsed ? '🚫' : '⏪'}</span>
              <span style={{ fontSize: 8, letterSpacing: 0.5, lineHeight: 1 }}>{cheatUsed ? 'USED' : 'CHEAT'}</span>
            </button>

            <div style={{ display: 'flex', alignItems: 'center', height: 36 }}>
              <SpinPicker size={36} spin={spin} onChange={handleSpinChange} />
            </div>
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