const supabase = require('./supabase')

function isUuid(value) {
  return typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}
async function createGame(player1Id, player2Id, initialBallState, roomCode) {
  const { data, error } = await supabase
    .from('games')
    .insert({
      player1_id:   player1Id  || null,
      player2_id:   player2Id  || null,
      current_turn: player1Id  || null,
      ball_state:   initialBallState,
      status:       'active',
      room_code:    roomCode   || null,
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
// Add to the bottom of games.js, before module.exports

async function getOngoingGames(userId) {
  const { data, error } = await supabase
    .from('games')
    .select('*, player1:player1_id(username), player2:player2_id(username)')
    .or(`player1_id.eq.${userId},player2_id.eq.${userId}`)
    .eq('status', 'active')
    .order('updated_at', { ascending: false })
  if (error) throw error
  return data
}

async function markGameAbandoned(gameId) {
  const { error } = await supabase
    .from('games')
    .update({ status: 'abandoned' })
    .eq('id', gameId)
  if (error) throw error
}

async function upsertUserStats(userId, won) {
  // Fetch current stats first
  const { data: existing } = await supabase
    .from('user_stats')
    .select('*')
    .eq('user_id', userId)
    .single()

  const base = existing || { wins: 0, losses: 0, games_played: 0 }
  const { error } = await supabase
    .from('user_stats')
    .upsert({
      user_id:      userId,
      wins:         base.wins + (won ? 1 : 0),
      losses:       base.losses + (won ? 0 : 1),
      games_played: base.games_played + 1,
      updated_at:   new Date().toISOString(),
    })
  if (error) throw error
}

// Update module.exports:
module.exports = { createGame, saveState, getGame, listGames, endGame, getOngoingGames, markGameAbandoned, upsertUserStats }