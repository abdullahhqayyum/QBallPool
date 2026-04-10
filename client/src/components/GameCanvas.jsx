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
    5: '#ff6600', 6: '#00aa44', 7: '#990000',
    9: '#f5c518', 10: '#1a66cc', 11: '#ff3300', 12: '#6600cc',
    13: '#ff6600', 14: '#00aa44', 15: '#990000',
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
  const isPortrait = size.h > size.w
  return { ...size, isPortrait }
}

const TABLE_W = 800
const TABLE_H = 400
const HUD_RESERVE = 96
const MOBILE_HUD_H = 58

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
  const [showTutorial,    setShowTutorial]    = useState(true)
  const [showCheatTip,    setShowCheatTip]    = useState(true)
  const [showSpinTip,     setShowSpinTip]     = useState(true)
  const [pocketCallVisible, setPocketCallVisible] = useState(false)
  useEffect(() => {
    if (showTutorial && gameState?.mode === 'online') {
      // In online mode, dismiss tutorial as soon as we know whose turn it is.
      setShowTutorial(false)
    }
  }, [waitingForOpponent])

  const { w: windowWidth, h: windowHeight, isPortrait } = useWindowSize()
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
      (outcome) => {
        // In offline 2P, `outcome` is always from Player 1's perspective.
        // Translate to an absolute winner so the shared screen shows who won.
        if (gameState?.mode === 'offline') {
          setResult({ winner: outcome === 'win' ? 'P1' : 'P2' })
        } else {
          // online/ai: keep the original local-perspective string
          setResult(outcome)
        }
      },
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

    // TO:
    if (gameState?.mode === 'online') {
      const initOnline = () => {
        import('../socket/client').then(({ setScene, setOnTurnDone, joinRoom }) => {
          const scene = gameRef.current?.scene?.scenes?.[0]
          if (!scene) {
            // Scene not ready yet — retry in 100ms
            setTimeout(initOnline, 100)
            return
          }
          setScene(scene)

          const userId    = gameState.user.id
          const p1        = gameState.game.player1_id
          const p2        = gameState.game.player2_id
          const myTurnNow = gameState.game.current_turn === userId
          scene.registry.set('opponentId', userId === p1 ? p2 : p1)
          scene.registry.set('myTurn',     myTurnNow)

          import('../socket/client').then(({ setOnGameOver }) => {
            setOnGameOver((result) => {
              setWaitingForOpponent(false)
              setResult(result)
            })
          })

          setOnTurnDone((ballState, isMyTurn, ballInHand) => {
            console.log('[turn_done] isMyTurn:', isMyTurn, 'ballInHand:', ballInHand, 'ballState cue:', ballState?.find?.(b => b.label === 'cue'))
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
              if (ballInHand) {
                import('../game/engine').then(({ respawnCueBall }) => {
                  if (isMyTurn) {
                    respawnCueBall(currentScene, null, false)
                  } else {
                    // Just make cue ball visible at its position for the waiting player
                    const balls   = currentScene.registry.get('balls') || []
                    const cueBall = balls.find(b => b.label === 'cue')
                    if (cueBall) {
                      cueBall.pocketed = false
                      cueBall.vx = 0
                      cueBall.vy = 0
                      if (cueBall.gfx) {
                        cueBall.gfx.setPosition(cueBall.x, cueBall.y)
                        cueBall.gfx.setVisible(true)
                        cueBall.gfx.setAlpha(1)
                      }
                    }
                  }
                })
              }

              setWaitingForOpponent(!isMyTurn)
              setMyTurn(isMyTurn)
              setPlacingCueBall(!!(isMyTurn && ballInHand))
            })
          })

          setWaitingForOpponent(!myTurnNow)
          joinRoom(gameState.game.id, gameState.user.id, gameState.game.id)
        })
      }
      initOnline()
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
          Math.abs(b.vx || 0) > 0.05 ||
          Math.abs(b.vy || 0) > 0.05
        )
      )

      if (!moving && !shotFired) setMyTurn(!!rawTurn)
      if (gameState?.mode === 'online' && !result) setWaitingForOpponent(!rawTurn)

      // Pick up game-over result pushed by the socket handler (opponent's perspective)
      if (!result) {
        const registryResult = scene.registry.get('gameResult')
        if (registryResult === 'win' || registryResult === 'loss') {
          setWaitingForOpponent(false)
          setResult(registryResult)
        }
      }
      setFoul(!!scene.registry.get('foul'))
      const type = scene.registry.get('myType')
      if (type) setMyType(type)
      setPlacingCueBall(!!scene.registry.get('placingCueBall'))
      const isMyActiveMode = gameState?.mode === 'offline' || !!scene.registry.get('myTurn')
      setCheatAvailable(!!scene.registry.get('cheatAvailable') && !scene.registry.get('cheatUsed') && isMyActiveMode)
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
        setPocketCallVisible(true)
        // Banner auto-hides after 4s — pocket targets stay active
        setTimeout(() => setPocketCallVisible(false), 4000)
      } else if (alreadyCalled || !eightLeft) {
        setNeedsPocketCall(false)
        setPocketCallVisible(false)
      }
    }, 300)

    return () => {
      clearInterval(syncInterval)
      if (gameState?.mode === 'online') {
        import('../socket/client').then(({ setOnTurnDone, setOnGameOver }) => {
          setOnTurnDone(null)
          setOnGameOver(null)
        })
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

  const canvasMaxH = isPortrait ? windowHeight : Math.max(180, windowHeight - hudHeight)

  return (
      <div style={{
        display:            'flex',
        flexDirection:      'column',
        alignItems:         'center',
        background:         '#0a0a0a',
        minHeight:          '100vh',
        height:             isPortrait ? '100vh' : 'auto',
        width:              '100vw',
        overflow:           'hidden',
        overflowX:          'hidden',
        overflowY:          isPortrait ? 'hidden' : 'hidden',
        overscrollBehavior: 'contain',
        justifyContent:     isPortrait ? 'center' : 'flex-start',
        position:           isPortrait ? 'fixed' : 'relative',
        inset:              isPortrait ? 0 : 'auto',
      }}>
      <style>{`
        @keyframes cheatPulse {
          0%, 100% { box-shadow: 0 0 6px #ff550055; }
          50%       { box-shadow: 0 0 14px #ff5500cc; border-color: #ff8844; }
        }
      `}</style>
      {/* Canvas wrapper — no extra borders; all visuals are inside Phaser */}
        <div style={{
          position:   'relative',
          lineHeight:  0,
          touchAction: 'none',
          overflow:    'visible',
          ...(isPortrait ? (() => {
            const padding  = 8
            const scaleByW = (windowWidth - padding * 2) / TABLE_H
            const scaleByH = (windowHeight - MOBILE_HUD_H - padding * 2) / TABLE_W
            const s        = Math.min(scaleByW, scaleByH)
            return {
              position:        'fixed',
              top:             `${(windowHeight - MOBILE_HUD_H) / 2}px`,
              left:            '50%',
              transform:       `translate(-50%, -50%) rotate(90deg) scale(${s})`,
              transformOrigin: 'center center',
              width:           `${TABLE_W}px`,
              height:          `${TABLE_H}px`,
              zIndex:          1,
            }
          })() : {
            position:  'relative',
            width:     '100%',
            maxHeight: canvasMaxH,
          }),
        }}>
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

        {showTutorial && (
          <div
            onClick={() => setShowTutorial(false)}
            style={{
              position:   'absolute', inset: 0,
              background: 'rgba(0,0,0,0.65)',
              display:    'flex', alignItems: 'center', justifyContent: 'center',
              zIndex:     40, cursor: 'pointer',
            }}
          >
            <div style={{
              background:   '#1a1a1a',
              border:       '1.5px solid #333',
              borderRadius: 16,
              padding:      '20px 28px',
              textAlign:    'center',
              color:        '#fff',
              fontFamily:   'monospace',
              maxWidth:     260,
              pointerEvents:'none',
            }}>
              <div style={{ fontSize: 26, marginBottom: 10 }}>🎱</div>
              <div style={{ fontSize: 14, fontWeight: 'bold', color: '#c1ff72', marginBottom: 10 }}>
                How to shoot
              </div>
              <div style={{ fontSize: 12, color: '#ccc', lineHeight: 1.8, marginBottom: 16 }}>
                <div>👆 Tap anywhere to aim</div>
                <div>📏 Stay back from the cue ball</div>
                <div>⬇️ Drag away to set power</div>
                <div>🔼 Release to shoot</div>
              </div>
              <div style={{
                background: '#c1ff72', color: '#111',
                borderRadius: 8, padding: '8px 20px',
                fontSize: 12, fontWeight: 'bold',
              }}>
                Tap anywhere to start {'->'}
              </div>
            </div>
          </div>
        )}

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
      {isPortrait ? (
        /* -- Mobile mini-HUD (portrait) -- */
        <div style={{
          position:   'fixed',
          bottom:     0,
          left:       0,
          right:      0,
          zIndex:     10,
          background: '#111',
          padding:    '6px 12px',
          display:    'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          fontFamily: 'monospace',
          boxSizing:  'border-box',
          gap:        8,
        }}>
          {/* Turn indicator */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 2 }}>
            {foul && (
              <div style={{
                color:        '#fff',
                background:   '#cc0000',
                fontSize:     9,
                fontWeight:   'bold',
                padding:      '1px 6px',
                borderRadius: 3,
                letterSpacing: 1,
              }}>⚠ FOUL</div>
            )}            
            {placingCueBall && <div style={{ color: '#ffaa00', fontSize: 8 }}>BALL IN HAND</div>}
            <div style={{
              fontSize:     11,
              fontWeight:   'bold',
              padding:      '4px 10px',
              borderRadius: 6,
              background:   myTurn ? '#1a6b2a' : '#6b1a1a',
              color:        '#fff',
              whiteSpace:   'nowrap',
            }}>
              {gameState?.mode === 'ai'
                ? (myTurn ? 'YOUR TURN' : 'CPU...')
                : gameState?.mode === 'online'
                  ? (myTurn ? 'YOUR TURN' : 'THEIR TURN')
                  : (myTurn ? 'P1 TURN' : 'P2 TURN')}
            </div>
            {calledPocket !== null && (
              <div style={{ fontSize: 8, color: '#ffdd44' }}>
                8-ball → {['TL','TM','TR','BL','BM','BR'][calledPocket]}
              </div>
            )}
          </div>

          {/* Spin + Cheat */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>

            {/* Spin picker + tooltip */}
            <div style={{ position: 'relative' }}>
              {showSpinTip && (
                <div style={{
                  position:     'absolute',
                  bottom:       '110%',
                  right:        0,
                  background:   '#1e1e1e',
                  border:       '1px solid #444',
                  borderRadius: 6,
                  padding:      '6px 10px',
                  width:        140,
                  fontSize:     10,
                  color:        '#ccc',
                  fontFamily:   'monospace',
                  lineHeight:   1.5,
                  zIndex:       50,
                  whiteSpace:   'normal',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                    <span style={{ color: '#ffdd44', fontWeight: 'bold' }}>◎ SPIN</span>
                    <span
                      onClick={() => setShowSpinTip(false)}
                      style={{ cursor: 'pointer', color: '#666', fontSize: 11 }}
                    >✕</span>
                  </div>
                  Drag the dot to add spin. Top/bottom = topspin/backspin. Left/right = sidespin.
                  <div style={{
                    position:   'absolute',
                    bottom:     -6,
                    right:      18,
                    width:      0, height: 0,
                    borderLeft:  '5px solid transparent',
                    borderRight: '5px solid transparent',
                    borderTop:   '6px solid #444',
                  }} />
                </div>
              )}
              <SpinPicker size={40} spin={spin} onChange={handleSpinChange} />
            </div>

            {/* Cheat button + tooltip */}
            <div style={{ position: 'relative' }}>
              {showCheatTip && !cheatUsed && (
                <div style={{
                  position:     'absolute',
                  bottom:       '110%',
                  right:        0,
                  background:   '#1e1e1e',
                  border:       '1px solid #444',
                  borderRadius: 6,
                  padding:      '6px 10px',
                  width:        140,
                  fontSize:     10,
                  color:        '#ccc',
                  fontFamily:   'monospace',
                  lineHeight:   1.5,
                  zIndex:       50,
                  whiteSpace:   'normal',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                    <span style={{ color: '#ff8844', fontWeight: 'bold' }}>⏪ CHEAT</span>
                    <span
                      onClick={() => setShowCheatTip(false)}
                      style={{ cursor: 'pointer', color: '#666', fontSize: 11 }}
                    >✕</span>
                  </div>
                  While balls are rolling, press this to rewind the shot. One use per game.
                  <div style={{
                    position:   'absolute',
                    bottom:     -6,
                    right:      18,
                    width:      0, height: 0,
                    borderLeft:  '5px solid transparent',
                    borderRight: '5px solid transparent',
                    borderTop:   '6px solid #444',
                  }} />
                </div>
              )}
              <button
                onClick={handleCheat}
                style={{
                  cursor:       cheatAvailable && !cheatUsed ? 'pointer' : 'default',
                  background:   cheatUsed      ? '#111'
                              : cheatAvailable ? '#7a1f00'
                              : '#1c1c1c',
                  border:       cheatAvailable && !cheatUsed ? '1px solid #ff5500' : '1px solid #333',
                  borderRadius: 6,
                  padding:      '4px 8px',
                  color:        cheatUsed      ? '#333'
                              : cheatAvailable ? '#fff'
                              : '#3a3a3a',
                  fontSize:     11,
                  fontFamily:   'monospace',
                  fontWeight:   'bold',
                  display:      'flex',
                  alignItems:   'center',
                  gap:          3,
                  boxShadow:    cheatAvailable && !cheatUsed ? '0 0 10px #ff550066' : 'none',
                  transition:   'all 0.2s',
                  animation:    cheatAvailable && !cheatUsed ? 'cheatPulse 1s ease-in-out infinite' : 'none',
                }}
              >
                <span style={{ fontSize: 13, lineHeight: 1 }}>{cheatUsed ? '🚫' : '⏪'}</span>
                <span style={{ fontSize: 8, letterSpacing: 0.5, lineHeight: 1 }}>{cheatUsed ? 'USED' : 'CHEAT'}</span>
              </button>
            </div>
          </div>
        </div>
      ) : (
        /* -- Desktop full HUD (landscape) -- */
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
            <span style={{
              fontSize: 10,
              color: myType === 'solid' ? '#f5c518' : '#888',
              marginRight: 4,
              fontWeight: myType === 'solid' ? 'bold' : 'normal',
              letterSpacing: 1,
            }}>
              {gameState?.mode === 'ai'
                ? (myType === 'solid' ? '🟡 YOU' : myType === 'stripe' ? 'CPU' : 'P1')
                : (!myType ? 'P1' : myType === 'solid' ? '● YOU' : '● OPP')}
            </span>
              {[1,2,3,4,5,6,7].map(n => {
                const isAssigned = myType !== null
                const isPocketed = pocketed.includes(`solid-${n}`)
                const isMine     = myType === 'solid'
                return (
                  <div key={n} style={{
                    width:      ballSz,
                    height:     ballSz,
                    borderRadius: '50%',
                    background: isAssigned ? getBallColor(n) : '#2a2a2a',
                    opacity:    isPocketed ? 0.15 : 1,
                    border:     isPocketed
                      ? '1px solid #222'
                      : isMine
                        ? `2px solid rgba(255,255,255,0.35)`
                        : isAssigned ? '1px solid #444' : '1px solid #333',
                    flexShrink: 0,
                    transition: 'all 0.3s',
                    boxShadow:  isMine && !isPocketed ? '0 0 4px rgba(255,220,80,0.4)' : 'none',
                  }} />
                )
              })}
          </div>

          {/* Turn indicator + cheat */}
          <div style={{ textAlign: 'center', flexShrink: 0 }}>
            {foul && (
              <div style={{
                color:        '#fff',
                background:   '#cc0000',
                fontSize:     10,
                fontWeight:   'bold',
                padding:      '2px 8px',
                borderRadius: 4,
                marginBottom: 4,
                letterSpacing: 1,
                animation:    'cheatPulse 0.8s ease-in-out infinite',
              }}>⚠ FOUL — BALL IN HAND</div>
            )}
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
                  : gameState?.mode === 'online'
                    ? (myTurn ? 'YOUR TURN' : 'THEIR TURN')
                    : (myTurn ? 'P1 TURN' : 'P2 TURN')}
              </div>

              {/* Cheat button + tooltip */}
              <div style={{ position: 'relative' }}>
                {showCheatTip && !cheatUsed && (
                  <div style={{
                    position:     'absolute',
                    bottom:       '110%',
                    left:         '50%',
                    transform:    'translateX(-50%)',
                    background:   '#1e1e1e',
                    border:       '1px solid #444',
                    borderRadius: 6,
                    padding:      '6px 10px',
                    width:        140,
                    fontSize:     10,
                    color:        '#ccc',
                    fontFamily:   'monospace',
                    lineHeight:   1.5,
                    zIndex:       50,
                    pointerEvents: 'auto',
                    whiteSpace:   'normal',
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                      <span style={{ color: '#ff8844', fontWeight: 'bold' }}>⏪ CHEAT</span>
                      <span
                        onClick={() => setShowCheatTip(false)}
                        style={{ cursor: 'pointer', color: '#666', fontSize: 11, lineHeight: 1 }}
                      >✕</span>
                    </div>
                    While balls are rolling, press this to rewind the shot. One use per game.
                    {/* Little arrow pointing down */}
                    <div style={{
                      position:   'absolute',
                      bottom:     -6,
                      left:       '50%',
                      transform:  'translateX(-50%)',
                      width:      0, height: 0,
                      borderLeft:  '5px solid transparent',
                      borderRight: '5px solid transparent',
                      borderTop:   '6px solid #444',
                    }} />
                  </div>
                )}
                <button
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
              </div>

              {/* Spin picker + tooltip */}
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center', height: 36 }}>
                {showSpinTip && (
                  <div style={{
                    position:     'absolute',
                    bottom:       '110%',
                    left:         '50%',
                    transform:    'translateX(-50%)',
                    background:   '#1e1e1e',
                    border:       '1px solid #444',
                    borderRadius: 6,
                    padding:      '6px 10px',
                    width:        148,
                    fontSize:     10,
                    color:        '#ccc',
                    fontFamily:   'monospace',
                    lineHeight:   1.5,
                    zIndex:       50,
                    pointerEvents: 'auto',
                    whiteSpace:   'normal',
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                      <span style={{ color: '#ffdd44', fontWeight: 'bold' }}>◎ SPIN</span>
                      <span
                        onClick={() => setShowSpinTip(false)}
                        style={{ cursor: 'pointer', color: '#666', fontSize: 11, lineHeight: 1 }}
                      >✕</span>
                    </div>
                    Drag the dot to add spin. Center = no spin. Top/bottom = topspin/backspin. Left/right = sidespin.
                    <div style={{
                      position:   'absolute',
                      bottom:     -6,
                      left:       '50%',
                      transform:  'translateX(-50%)',
                      width:      0, height: 0,
                      borderLeft:  '5px solid transparent',
                      borderRight: '5px solid transparent',
                      borderTop:   '6px solid #444',
                    }} />
                  </div>
                )}
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
              const isMine     = myType === 'stripe'
              return (
                <div key={n} style={{
                  width:      ballSz,
                  height:     ballSz,
                  borderRadius: '50%',
                  background: isAssigned ? '#fff' : '#2a2a2a',
                  opacity:    isPocketed ? 0.15 : 1,
                  border:     isPocketed
                    ? '1px solid #222'
                    : isAssigned
                      ? `${borderPx}px solid ${getBallColor(n)}`
                      : '1px solid #333',
                  boxSizing:  'border-box',
                  flexShrink: 0,
                  transition: 'all 0.3s',
                  boxShadow:  isMine && !isPocketed ? `0 0 4px ${getBallColor(n)}66` : 'none',
                }} />
              )
            })}
            <span style={{
              fontSize: 10,
              color: myType === 'stripe' ? '#1a66cc' : '#888',
              marginLeft: 4,
              fontWeight: myType === 'stripe' ? 'bold' : 'normal',
              letterSpacing: 1,
            }}>
              {gameState?.mode === 'ai'
                ? (myType === 'stripe' ? '🔵 YOU' : myType === 'solid' ? 'CPU' : 'P2')
                : (!myType ? 'P2' : myType === 'stripe' ? '● YOU' : '● OPP')}
            </span>
          </div>
        </div>
      )}

      {needsPocketCall && (
        <PocketCallModal
          onCall={handlePocketCall}
          canvasRect={canvasRectRef.current}
          showBanner={pocketCallVisible}
        />
      )}
    </div>
  )
}