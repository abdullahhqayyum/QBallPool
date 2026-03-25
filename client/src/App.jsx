import React, { useState, useEffect } from 'react'
import supabase from './lib/supabase'
import Auth from './components/Auth'
import GameList from './components/GameList'
import Lobby from './components/Lobby'
import GameCanvas from './components/GameCanvas'
import MatchResult from './components/MatchResult'

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