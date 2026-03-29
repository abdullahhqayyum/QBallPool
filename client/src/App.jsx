import React, { useState, useEffect } from 'react'
import LobbyPage from './pages/LobbyPage'
import GameCanvas from './components/GameCanvas'
import MatchResult from './components/MatchResult'

// Inject mobile-friendly global styles once
if (typeof document !== 'undefined') {
  let meta = document.querySelector('meta[name="viewport"]')
  if (!meta) {
    meta = document.createElement('meta')
    meta.name = 'viewport'
    document.head.appendChild(meta)
  }
  meta.content = 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover'

  const style = document.createElement('style')
  style.textContent = `
    *, *::before, *::after { box-sizing: border-box; }
    html, body {
      margin: 0; padding: 0; width: 100%;
      background: #0a0a0a;
      -webkit-tap-highlight-color: transparent;
      touch-action: manipulation;
    }
    body.screen-game   { overflow: auto;   overscroll-behavior: contain; }
    body.screen-locked { overflow: hidden; overscroll-behavior: none; height: 100%; }
    #root { width: 100%; min-height: 100dvh; }
    canvas { display: block !important; }
  `
  document.head.appendChild(style)
  // Ensure the page is slightly taller than the viewport so we can trigger
  // a small scroll to collapse mobile browser chrome (URL bar).
  style.textContent += `
    html { height: 100%; }
    body { min-height: 101vh; }
  `
}

function makeGuest() {
  return { id: `guest-${Math.random().toString(36).slice(2, 10)}`, email: null, isGuest: true }
}

export default function App() {
  const [screen,    setScreen]    = useState('lobby')
  const [user,      setUser]      = useState(makeGuest)
  const [gameState, setGameState] = useState(null)

  useEffect(() => {
    document.body.classList.toggle('screen-game',   screen === 'game')
    document.body.classList.toggle('screen-locked', screen !== 'game')
  }, [screen])

  // Nudge scroll to collapse mobile browser chrome (URL bar).
  // Works on iOS Safari and Android Chrome; we do a tiny scroll then snap back.
  useEffect(() => {
    setTimeout(() => {
      window.scrollTo(0, 1)
      setTimeout(() => window.scrollTo(0, 0), 50)
    }, 300)
  }, [])

  // When switching to the game screen, nudge scroll again so the chrome
  // collapses reliably when entering full-screen-like view.
  useEffect(() => {
    if (screen === 'game') {
      setTimeout(() => window.scrollTo(0, 1), 100)
    }
  }, [screen])

  function handleGameOver(outcome) {
    setUser(makeGuest())
    setScreen('lobby')
  }

  return (
    <div>
      {screen === 'lobby' && (
        <LobbyPage
          user={user}
          onStart={(state) => {
            setGameState(state?.user ? state : { ...state, user })
            setScreen('game')
          }}
        />
      )}
      {screen === 'game' && (
        <GameCanvas gameState={gameState} onGameOver={handleGameOver} />
      )}
    </div>
  )
}