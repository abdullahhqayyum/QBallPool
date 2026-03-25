const express   = require('express')
const http      = require('http')
const cors      = require('cors')
const { Server } = require('socket.io')
const { registerHandlers } = require('./socket/handlers')

const app    = express()
const server = http.createServer(app)

app.use(cors())
app.use(express.json())

// Health check / simple root response so platforms (Render) return 200 on GET /
app.get('/', (req, res) => {
  res.status(200).send('QBallPool server is running')
})

const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] }
})

io.on('connection', (socket) => {
  console.log(`[+] connected: ${socket.id}`)
  registerHandlers(io, socket)
  socket.on('disconnect', () => console.log(`[-] disconnected: ${socket.id}`))
})

const BASE_PORT = Number(process.env.PORT) || 3001
let currentPort = BASE_PORT

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.warn(`Port ${currentPort} is in use, trying ${currentPort + 1}...`)
    currentPort += 1
    server.listen(currentPort)
    return
  }
  throw err
})

server.listen(currentPort, () => console.log(`Server running on :${currentPort}`))
