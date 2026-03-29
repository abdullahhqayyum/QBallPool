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

### Run both dev servers in VS Code (integrated PowerShell)

If you prefer two integrated PowerShell terminals inside VS Code (recommended for debugging), open the integrated terminal (View → Terminal or Ctrl+`) and create two terminals. In the first terminal type:

```powershell
cd C:\Anviro\8ball\client
npm run dev
```

In the second terminal type:

```powershell
cd C:\Anviro\8ball\server
npm run dev
```

Alternative options:

- Run the VS Code compound task (opens two integrated terminals) via Command Palette: `Tasks: Run Task` → select `Dev: Both`.
- Or run the Windows helper (opens two external PowerShell windows) from the repo root:

```powershell
npm run dev:windows
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

## Full folder structure

This project tree lists every file and folder present in the repository (no files omitted):

```
.
├─ netlify.toml
├─ package.json
├─ README.md
└─ client/
  ├─ package.json
  ├─ index.html
  ├─ vite.config.js
  ├─ .env                  # optional: VITE_SERVER_URL
  ├─ public/
  │  └─ _redirects
  └─ src/
    ├─ main.jsx
    ├─ App.jsx
    ├─ pages/
    │  ├─ AuthPage.jsx
    │  ├─ GameListPage.jsx
    │  └─ LobbyPage.jsx
    ├─ components/
    │  ├─ Auth.jsx
    │  ├─ GameCanvas.jsx
    │  ├─ GameList.jsx
    │  ├─ HUD.jsx
    │  ├─ Lobby.jsx
    │  ├─ MatchResult.jsx
    │  └─ PocketCallModal.jsx
    ├─ game/
    │  ├─ balls.js
    │  ├─ balls.test.js
    │  ├─ constants.js
    │  ├─ cue.js
    │  ├─ cue.test.js
    │  ├─ DiagScene.js
    │  ├─ engine.js
    │  ├─ physics.js
    │  └─ physics.test.js
    ├─ lib/
    │  └─ supabase.js
    ├─ socket/
    │  └─ client.js
    └─ store/
      └─ gameStore.js

└─ server/
  ├─ package.json
  ├─ .env                  # SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (optional)
  ├─ sql/
  │  └─ 001_add_player_types_to_games.sql
  └─ src/
    ├─ index.js
    ├─ db/
    │  ├─ games.js
    │  └─ supabase.js
    ├─ game/
    │  └─ validator.js
    ├─ rooms/
    │  ├─ GameRoom.js
    │  └─ RoomManager.js
    └─ socket/
      └─ handlers.js

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
