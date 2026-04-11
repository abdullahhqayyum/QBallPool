import React, { useEffect, useState } from 'react'
import GameList from '../components/GameList'
import socket, { resumeGame } from '../socket/client'
import { useGameStore } from '../store/gameStore'

export default function GameListPage(props) {
  const { user, onJoinGame, onNewGame } = props
  const [ongoingGames, setOngoingGames] = useState([])

  useEffect(() => {
    if (!user) return
    socket.emit('get_ongoing_games', { userId: user.id })
    const handler = ({ games }) => {
      useGameStore.setOngoingGames(games)
      setOngoingGames(games)
    }
    socket.on('ongoing_games', handler)
    return () => socket.off('ongoing_games', handler)
  }, [user])

  function handleJoinGame(game) {
    if (!user) return
    resumeGame(game.id, user.id)
    if (onJoinGame) onJoinGame(game)
  }

  const active = ongoingGames.filter(g => g.status === 'active')
  const completed = ongoingGames.filter(g => g.status === 'completed')
  const invites = ongoingGames.filter(g => g.status === 'waiting')

  const renderOpponent = (g) => {
    if (!user) return 'Unknown'
    const meIsP1 = g.player1_id === user.id
    return meIsP1 ? (g.player2_name || g.player2_id) : (g.player1_name || g.player1_id)
  }

  return (
    <div style={{ padding: 16 }}>
      <h3>Resume a Game</h3>
      {active.length === 0 ? <p>No active games.</p> : (
        <ul>
          {active.map(g => (
            <li key={g.id || g.gameId}>
              {renderOpponent(g)} — {g.current_turn === user?.id ? "Your turn" : "Their turn"}
            </li>
          ))}
        </ul>
      )}

      <h3>Completed Games</h3>
      {completed.length === 0 ? <p>No completed games.</p> : (
        <ul>
          {completed.map(g => (
            <li key={g.id || g.gameId}>
              {renderOpponent(g)} — Winner: {g.winner_name || g.winner_id || 'Unknown'}
            </li>
          ))}
        </ul>
      )}

      <h3>Open Invites</h3>
      {invites.length === 0 ? <p>No open invites.</p> : (
        <ul>
          {invites.map(g => (
            <li key={g.id || g.gameId}>
              {renderOpponent(g)} — Waiting to start
            </li>
          ))}
        </ul>
      )}

      <hr />
      <GameList {...props} onJoinGame={handleJoinGame} onNewGame={onNewGame} />
    </div>
  )
}
