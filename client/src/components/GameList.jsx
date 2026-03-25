import React, { useEffect, useState } from 'react'
import supabase from '../lib/supabase'

export default function GameList({ user, onJoinGame, onNewGame }) {
  const [games,   setGames]   = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchGames()
  }, [])

  async function fetchGames() {
    setLoading(true)
    const { data, error } = await supabase
      .from('games')
      .select('*, player1:player1_id(username), player2:player2_id(username)')
      .or(`player1_id.eq.${user.id},player2_id.eq.${user.id}`)
      .order('updated_at', { ascending: false })
    if (!error) setGames(data)
    setLoading(false)
  }

  async function handleJoinGame(game) {
    const { data, error } = await supabase
      .from('games')
      .select('*')
      .eq('id', game.id)
      .single()

    if (error) {
      console.error(error)
      return
    }

    const myType = data.player1_id === user.id
      ? data.player1_type
      : data.player2_type

    onJoinGame({
      ...data,
      my_type: myType,
    })
  }

  const active    = games.filter(g => g.status === 'active')
  const completed = games.filter(g => g.status === 'completed')

  function getOpponent(game) {
    return game.player1_id === user.id
      ? game.player2?.username
      : game.player1?.username
  }

  function isMyTurn(game) {
    return game.current_turn === user.id
  }

  return (
    <div style={{ maxWidth: 480, margin: '40px auto', padding: '0 16px', fontFamily: 'monospace' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h2 style={{ margin: 0, color: '#fff' }}>My Games</h2>
        <button
          onClick={onNewGame}
          style={{ padding: '8px 16px', background: '#1a6b2a', border: 'none', color: '#fff', borderRadius: 6, cursor: 'pointer' }}
        >
          + New Game
        </button>
      </div>

      {loading && <p style={{ color: '#666' }}>Loading...</p>}

      {active.length > 0 && (
        <>
          <p style={{ fontSize: 11, color: '#555', marginBottom: 8 }}>ACTIVE</p>
          {active.map(game => (
            <div
              key={game.id}
              onClick={() => handleJoinGame(game)}
              style={{
                display: 'flex', justifyContent: 'space-between',
                alignItems: 'center', padding: '12px 16px',
                marginBottom: 8, border: '1px solid #222',
                borderRadius: 8, cursor: 'pointer', background: '#111',
                transition: 'border-color 0.2s',
              }}
              onMouseEnter={e => e.currentTarget.style.borderColor = '#444'}
              onMouseLeave={e => e.currentTarget.style.borderColor = '#222'}
            >
              <div>
                <p style={{ margin: 0, fontWeight: 500, color: '#fff' }}>
                  vs {getOpponent(game)}
                </p>
                <p style={{ margin: 0, fontSize: 11, color: '#555' }}>
                  {new Date(game.updated_at).toLocaleDateString()}
                </p>
              </div>
              <span style={{
                fontSize: 11, padding: '3px 10px', borderRadius: 20,
                background: isMyTurn(game) ? '#1a6b2a' : '#1a1a1a',
                color: isMyTurn(game) ? '#4ade80' : '#666',
                border: `1px solid ${isMyTurn(game) ? '#2d8a3e' : '#333'}`,
              }}>
                {isMyTurn(game) ? 'Your turn' : 'Their turn'}
              </span>
            </div>
          ))}
        </>
      )}

      {completed.length > 0 && (
        <>
          <p style={{ fontSize: 11, color: '#555', margin: '20px 0 8px' }}>COMPLETED</p>
          {completed.map(game => (
            <div key={game.id} style={{
              display: 'flex', justifyContent: 'space-between',
              alignItems: 'center', padding: '12px 16px',
              marginBottom: 8, border: '1px solid #1a1a1a',
              borderRadius: 8, opacity: 0.5, background: '#0d0d0d',
            }}>
              <div>
                <p style={{ margin: 0, color: '#fff' }}>vs {getOpponent(game)}</p>
                <p style={{ margin: 0, fontSize: 11, color: '#555' }}>
                  {new Date(game.updated_at).toLocaleDateString()}
                </p>
              </div>
              <span style={{ fontSize: 12, color: game.winner_id === user.id ? '#4ade80' : '#ff4444' }}>
                {game.winner_id === user.id ? 'Won' : 'Lost'}
              </span>
            </div>
          ))}
        </>
      )}

      {!loading && games.length === 0 && (
        <p style={{ color: '#444', textAlign: 'center', marginTop: 60 }}>
          No games yet. Start one!
        </p>
      )}
    </div>
  )
}