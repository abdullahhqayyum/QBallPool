const GameRoom = require('./GameRoom')

class RoomManager {
  constructor() {
    this.rooms = new Map()
  }

  getOrCreateRoom(roomId) {
    if (!this.rooms.has(roomId)) {
      this.rooms.set(roomId, new GameRoom(roomId))
    }
    return this.rooms.get(roomId)
  }

  getRoom(roomId) {
    return this.rooms.get(roomId) || null
  }

  deleteRoom(roomId) {
    this.rooms.delete(roomId)
  }
}

module.exports = new RoomManager()
