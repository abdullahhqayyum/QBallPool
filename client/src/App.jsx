import React, { useState, useEffect } from 'react'
import { Routes, Route, useNavigate, useLocation } from 'react-router-dom'
import LobbyPage from './pages/LobbyPage'
import GameCanvas from './components/GameCanvas'

// ── Global styles ────────────────────────────────────────────────────────────
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
    html { height: 100%; }
    body { min-height: 101vh; }
  `
  document.head.appendChild(style)
}

function makeGuest() {
  return { id: `guest-${Math.random().toString(36).slice(2, 10)}`, email: null, isGuest: true }
}

export default function App() {
  const navigate  = useNavigate()
  const location  = useLocation()
  const [user,      setUser]      = useState(makeGuest)
  const [gameState, setGameState] = useState(null)

  const isGame = location.pathname === '/game'

  useEffect(() => {
    document.body.classList.toggle('screen-game',   isGame)
    document.body.classList.toggle('screen-locked', !isGame)
  }, [isGame])

  useEffect(() => {
    setTimeout(() => {
      window.scrollTo(0, 1)
      setTimeout(() => window.scrollTo(0, 0), 50)
    }, 300)
  }, [])

  useEffect(() => {
    if (isGame) setTimeout(() => window.scrollTo(0, 1), 100)
  }, [isGame])

  useEffect(() => {
    const requestFullscreen = () => {
      const el = document.documentElement
      if (el.requestFullscreen)            el.requestFullscreen()
      else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen()
      else if (el.mozRequestFullScreen)    el.mozRequestFullScreen()
      else if (el.msRequestFullscreen)     el.msRequestFullscreen()
    }
    document.addEventListener('touchstart', requestFullscreen, { once: true })
    document.addEventListener('click',      requestFullscreen, { once: true })
    return () => {
      document.removeEventListener('touchstart', requestFullscreen)
      document.removeEventListener('click',      requestFullscreen)
    }
  }, [])

  function handleStart(state) {
    setGameState(state?.user ? state : { ...state, user })
    navigate('/game')
  }

  function handleGameOver() {
    setUser(makeGuest())
    setGameState(null)
    navigate('/home')
  }

  return (
    <Routes>
      {/* Root redirects to /home */}
      <Route path="/" element={<RedirectToHome />} />

      <Route
        path="/home"
        element={<LobbyPage user={user} onStart={handleStart} />}
      />

      <Route
        path="/game"
        element={
          gameState
            ? <GameCanvas gameState={gameState} onGameOver={handleGameOver} />
            : <RedirectToHome />
        }
      />

      {/* Catch-all */}
      <Route path="*" element={<RedirectToHome />} />
    </Routes>
  )
}

function RedirectToHome() {
  const navigate = useNavigate()
  useEffect(() => { navigate('/home', { replace: true }) }, [])
  return null
}