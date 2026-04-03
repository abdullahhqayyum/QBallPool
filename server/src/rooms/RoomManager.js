const GameRoom = require('./GameRoom')

// Generates a readable 6-char uppercase code, e.g. "X4K9PQ"
function generateCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // no O/0/1/I for readability
  let code = ''
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)]
  }
  return code
}

class RoomManager {
  constructor() {
    this.rooms = new Map()
  }

  // Host calls this — uses client-provided code (already shown to user)
  createRoom(code) {
    this.rooms.set(code, new GameRoom(code))
    return { code, room: this.rooms.get(code) }
  }

  // Guest calls this — returns error if code doesn't exist or room is full
  joinRoom(code) {
    const room = this.rooms.get(code.toUpperCase())
    if (!room) return { error: 'Room not found. Check the code and try again.' }
    if (room.players.length >= 2) return { error: 'Room is already full.' }
    return { room }
  }

  // Still used internally for reconnect / turn / game-over lookups
  getRoom(roomId) {
    return this.rooms.get(roomId) || null
  }

  deleteRoom(roomId) {
    this.rooms.delete(roomId)
  }
}

// FIX: was exported twice — second line overwrote the first with a fresh instance,
// meaning every require() after the first got an empty RoomManager with no rooms.
module.exports = new RoomManager()