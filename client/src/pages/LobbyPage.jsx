import React from 'react'
import Lobby from '../components/Lobby'
import GameList from '../components/GameList'
import { resumeGame } from '../socket/client'

export default function LobbyPage({ user, onStart, onLogin, onLogout, onJoinGame }) {
  function handleJoinGame(game) {
    if (!user) return
    console.log('[handleJoinGame] game.id:', game.id, 'ball_state:', !!game.ball_state)
    resumeGame(game.id, user.id)
    if (onJoinGame) onJoinGame(game)
  }

  return (
    <>
      <Lobby
        user={user}
        onStart={onStart}
        onLogin={onLogin}
        onLogout={onLogout}
      />
      {!user?.isGuest && (
        <div style={{ maxWidth: 480, margin: '0 auto', padding: '0 24px 80px' }}>
          <GameList
            user={user}
            onJoinGame={handleJoinGame}
            onNewGame={() => {/* already handled by Lobby's Play Now */}}
          />
        </div>
      )}
    </>
  )
}