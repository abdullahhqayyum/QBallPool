import React, { useState, useEffect } from 'react'
import supabase from './lib/supabase'
import Auth from './components/Auth'
import GameList from './components/GameList'
import Lobby from './components/Lobby'
import GameCanvas from './components/GameCanvas'
import MatchResult from './components/MatchResult'

// Inject mobile-friendly global styles once
if (typeof document !== 'undefined') {
  // Ensure viewport meta is correct
  let meta = document.querySelector('meta[name="viewport"]')
  if (!meta) {
    meta = document.createElement('meta')
    meta.name = 'viewport'
    document.head.appendChild(meta)
  }
  meta.content = 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover'

  // Prevent body scroll / bounce on iOS
  const style = document.createElement('style')
  style.textContent = `
    *, *::before, *::after { box-sizing: border-box; }
    html, body {
      margin: 0; padding: 0;
      width: 100%; height: 100%;
      background: #0a0a0a;
      overflow: hidden;
      overscroll-behavior: none;
      -webkit-tap-highlight-color: transparent;
      touch-action: manipulation;
    }
    #root { width: 100%; height: 100%; }
    canvas { display: block !important; }
  `
  document.head.appendChild(style)
}

// screens: 'auth' | 'gamelist' | 'lobby' | 'game' | 'result'
export default function App() {
  const [screen, setScreen]       = useState('auth')
  const [user, setUser]           = useState(null)
  const [gameState, setGameState] = useState(null)

  // Check if already logged in on load
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        setUser(session.user)
        setScreen('gamelist')
      }
    })
  }, [])

  function handleAuth(user) {
    setUser(user)
    setScreen('gamelist')
  }

  function handleGuest(user) {
    setUser(user)
    setScreen('lobby')
  }

  function handleJoinGame(game) {
    setGameState({ mode: 'online', game, user })
    setScreen('game')
  }

  function handleNewGame() {
    setScreen('lobby')
  }

  async function handleLogout() {
    await supabase.auth.signOut()
    setUser(null)
    setScreen('auth')
  }

  function handleGameOver(outcome) {
    if (outcome === 'home') setScreen('gamelist')
    else setScreen('lobby')
  }

  return (
    <div>
      {screen === 'auth'     && <Auth onAuth={handleAuth} onGuest={handleGuest} />}
      {screen === 'gamelist' && (
        <GameList
          user={user}
          onJoinGame={handleJoinGame}
          onNewGame={handleNewGame}
        />
      )}
      {screen === 'lobby'    && (
        <Lobby
          user={user}
          onStart={(state) => {
            const resolvedState = state?.user ? state : { ...state, user }
            setGameState(resolvedState)
            setScreen('game')
          }}
          onBack={() => setScreen('gamelist')}
        />
      )}
      {screen === 'game'     && (
        <>
          <GameCanvas gameState={gameState} onGameOver={handleGameOver} />
        </>
      )}
      {screen === 'result'   && (
        <MatchResult
          gameState={gameState}
          onRematch={() => setScreen('lobby')}
          onHome={() => setScreen('gamelist')}
        />
      )}
    </div>
  )
}