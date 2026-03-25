const supabase = require('./supabase')

async function createGame(player1Id, player2Id, initialBallState) {
  const { data, error } = await supabase
    .from('games')
    .insert({
      player1_id:   player1Id,
      player2_id:   player2Id,
      current_turn: player1Id,
      ball_state:   initialBallState,
    })
    .select()
    .single()
  if (error) throw error
  return data
}

async function saveState(gameId, ballState, nextTurnPlayerId) {
  const { error } = await supabase
    .from('games')
    .update({ ball_state: ballState, current_turn: nextTurnPlayerId })
    .eq('id', gameId)
  if (error) throw error
}

async function getGame(gameId) {
  const { data, error } = await supabase
    .from('games')
    .select('*')
    .eq('id', gameId)
    .single()
  if (error) throw error
  return data
}

async function listGames(playerId) {
  const { data, error } = await supabase
    .from('games')
    .select('*, player1:player1_id(username), player2:player2_id(username)')
    .or(`player1_id.eq.${playerId},player2_id.eq.${playerId}`)
    .order('updated_at', { ascending: false })
  if (error) throw error
  return data
}

async function endGame(gameId, winnerId) {
  const { error } = await supabase
    .from('games')
    .update({ status: 'completed', winner_id: winnerId })
    .eq('id', gameId)
  if (error) throw error
}

module.exports = { createGame, saveState, getGame, listGames, endGame }