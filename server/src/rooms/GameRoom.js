class GameRoom {
  constructor(roomId) {
    this.id          = roomId
    this.players     = []       // [{ socketId, playerId }]
    this.currentTurn = null     // playerId of the active player
    this.ballState   = null
    this.state       = 'waiting' // 'waiting' | 'playing' | 'finished'
  }

  addPlayer(socket, playerId) {
    if (this.players.length >= 2) return false
    this.players.push({ socketId: socket.id, playerId })
    if (this.players.length === 1) this.currentTurn = playerId
    if (this.isReady()) this.state = 'playing'
    return true
  }

  removePlayer(socketId) {
    this.players = this.players.filter(p => p.socketId !== socketId)
    this.state   = 'waiting'

    const stillHasTurnPlayer = this.players.some(p => p.playerId === this.currentTurn)
    if (!stillHasTurnPlayer) {
      this.currentTurn = this.players[0]?.playerId || null
    }
  }

  switchTurn() {
    const other = this.players.find(p => p.playerId !== this.currentTurn)
    this.currentTurn = other ? other.playerId : null
  }

  finish() {
    this.state = 'finished'
  }

  isReady()  { return this.players.length === 2 }
  isEmpty()  { return this.players.length === 0 }
}

module.exports = GameRoom
