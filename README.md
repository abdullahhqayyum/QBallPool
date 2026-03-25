# 8-Ball Pool

Browser-based 8-ball pool game — local, vs AI, or online multiplayer.

## Stack
- **Frontend**: React + Phaser 3 + Matter.js
- **Backend**: Node.js + Express + Socket.IO

## Setup

### Quick start (both dev servers)

From the repo root you can install everything and run both front- and back-end concurrently:

```bash
# install root deps, then install client + server
npm install
npm run install:all

# start both dev servers (runs client + server)
npm run dev
```

### Install only (per-folder)

```bash
# Frontend
cd client && npm install

# Backend
cd server && npm install
```

### Run development servers (individual)

```bash
# Frontend only — Vite (http://localhost:5173)
cd client && npm run dev

# Backend only — Node + nodemon (http://localhost:3001)
cd server && npm run dev
```

### Environment (optional)

Create `client/.env`:
```
VITE_SERVER_URL=http://localhost:3001
```

Create `server/.env`:
```
SUPABASE_URL=your_supabase_project_url
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

### Run tests

Unit tests for the client use Vitest and live next to their modules (`*.test.js`). Run them from the client folder or from the repo root:

```bash
# From client
cd client && npm run test

# From repo root
npm run test:client
```

There are no automated server tests in this repo by default; server runtime can be exercised with the dev server.

### 4. DB migration (required for online type restore)

Run this SQL in Supabase SQL Editor (or execute file `server/sql/001_add_player_types_to_games.sql`):

```sql
alter table games
  add column if not exists player1_type text,
  add column if not exists player2_type text;
```

## Project Structure

```
.
├─ client/
│  ├─ package.json                # frontend deps & scripts
│  ├─ vite.config.js              # Vite config
│  ├─ index.html
│  ├─ .env                        # optional: VITE_SERVER_URL
│  └─ src/
│     ├─ main.jsx                 # app bootstrap
│     ├─ App.jsx                  # root React component
│     ├─ components/              # React UI
│     │  ├─ Auth.jsx
│     │  ├─ GameCanvas.jsx        # mounts Phaser canvas
│     │  ├─ GameList.jsx
│     │  ├─ HUD.jsx               # in-game HUD + controls
│     │  ├─ Lobby.jsx
│     │  ├─ MatchResult.jsx
│     │  ├─ PocketCallModal.jsx
│     ├─ game/                    # Phaser + physics + game logic
│     │  ├─ balls.js              # ball objects, helpers, tests
│     │  ├─ balls.test.js
│     │  ├─ constants.js
│     │  ├─ cue.js                # aiming / shooting helpers + tests
│     │  ├─ cue.test.js
│     │  ├─ engine.js             # Phaser scene, update loop
│     │  ├─ physics.js            # rail/cushion/pocket logic + tests
│     │  └─ physics.test.js
│     ├─ lib/
│     │  └─ supabase.js           # supabase client wrapper
│     ├─ socket/
│     │  └─ client.js             # socket message helpers
│     └─ store/
│        └─ gameStore.js          # React state (game lobby, user)

├─ server/
│  ├─ package.json
│  ├─ .env                        # SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
│  ├─ sql/
│  │  └─ 001_add_player_types_to_games.sql
│  └─ src/
│     ├─ index.js                 # express + socket server entry
│     ├─ db/
│     │  ├─ games.js              # DB helpers for games table
│     │  └─ supabase.js           # server-side supabase client
│     ├─ game/
│     │  └─ validator.js          # server-side shot validation logic
│     ├─ rooms/
│     │  ├─ GameRoom.js           # per-room game state + lifecycle
│     │  └─ RoomManager.js        # manages active rooms
│     └─ socket/
│        └─ handlers.js           # socket.io event handlers

├─ README.md
└─ package.json

``` 

Notes:
- Tests: unit tests for game physics live alongside their modules (`*.test.js`).
- Important runtime files: `client/src/game/engine.js` (scene loop), `client/src/game/physics.js` (rail/cushion/pocket logic), `server/src/rooms/GameRoom.js` (authoritative game state for online games).

If you want, I can also add a brief diagram or separate CONTRIBUTING/testing sections showing how to run the frontend, server, and unit tests locally.

## Socket Events

| Direction | Event | Payload |
|-----------|-------|---------|
| client → server | `join_room` | `{ roomId, playerName }` |
| client → server | `ready` | — |
| client → server | `shoot` | `{ angle, power }` |
| server → client | `room_joined` | `{ roomId, playerId }` |
| server → client | `game_start` | `{ firstTurn }` |
| server → client | `opponent_shot` | `{ angle, power }` |
| server → client | `turn_change` | `{ currentTurn }` |
| server → client | `opponent_left` | — |
| server → client | `game_over` | `{ winner }` |

## TODOs (next steps)
- [ ] Draw table + pockets in Phaser scene
- [ ] Rack balls in triangle formation
- [ ] Cue power charge bar (hold mouse)
- [ ] Pocket collision detection
- [ ] 8-ball win/loss rules
- [ ] AI opponent (basic angle calculation)
- [ ] Room ID sharing UI
