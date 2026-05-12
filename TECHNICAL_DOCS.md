# 🧱 MineCraft Server & Web Management Platform — Technical Documentation

**Project Codename:** `CraftControl`
**Version:** 1.0.0
**Status:** Pre-development
**Owner:** sauliusc
**Last Updated:** 2026-05-12

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [System Architecture](#2-system-architecture)
3. [Minecraft Server & Plugin System](#3-minecraft-server--plugin-system)
   - 3.1 [Server Stack](#31-server-stack)
   - 3.2 [Plugin: Player Greeter](#32-plugin-player-greeter)
   - 3.3 [Plugin: Challenge Engine](#33-plugin-challenge-engine)
   - 3.4 [Plugin: Reward System](#34-plugin-reward-system)
   - 3.5 [Plugin: REST Bridge](#35-plugin-rest-bridge)
4. [Web Management Platform](#4-web-management-platform)
   - 4.1 [Backend API](#41-backend-api)
   - 4.2 [Frontend Dashboard](#42-frontend-dashboard)
   - 4.3 [Authentication & Authorization](#43-authentication--authorization)
5. [Data Layer](#5-data-layer)
6. [Infrastructure & Deployment](#6-infrastructure--deployment)
7. [API Reference](#7-api-reference)
8. [Developer Guide](#8-developer-guide)
9. [Testing Strategy](#9-testing-strategy)
10. [Roadmap & Milestones](#10-roadmap--milestones)
11. [Glossary](#11-glossary)

---

## 1. Project Overview

### 1.1 Purpose

CraftControl is a two-component system:

1. **A Minecraft Java server** with custom Java plugins that automate player onboarding, serve dynamically generated challenges, and distribute in-game rewards.
2. **A web management dashboard** that lets server administrators configure, monitor, and control all of the above — in real time — from a browser.

### 1.2 Core Features

| Feature | Delivery Layer | Description |
|---|---|---|
| New player greeting | Minecraft plugin | Personalized welcome message + starter kit on first join |
| Creative challenges | Plugin + Web API | AI-assisted, configurable challenge feed per player |
| Reward distribution | Minecraft plugin | Item/currency/XP grants triggered from web or in-game events |
| Web dashboard | React SPA | Admin UI for all of the above |
| REST bridge | Plugin → API | Bidirectional HTTP between the Minecraft server and the web backend |

### 1.3 Out of Scope (v1.0)

- Bedrock Edition support
- Marketplace / economy storefronts
- Cross-server networks (BungeeCord/Velocity)
- Mobile app

---

## 2. System Architecture

### 2.1 High-Level Diagram

```
┌──────────────────────────────────────────────────────────────┐
│                        INTERNET                              │
└───────────┬──────────────────────────────┬───────────────────┘
            │  HTTPS (players/browsers)    │  HTTPS (admin)
            ▼                              ▼
┌───────────────────────┐      ┌─────────────────────────┐
│  Minecraft Java Server│      │   Web Management App    │
│  (Paper 1.21.x)       │◄────►│   (React + Node.js API) │
│                       │ REST │                         │
│  ├─ GreeterPlugin     │      │  ├─ Dashboard UI        │
│  ├─ ChallengePlugin   │      │  ├─ REST API (Express)  │
│  ├─ RewardPlugin      │      │  └─ Auth (JWT)          │
│  └─ BridgePlugin      │      └──────────┬──────────────┘
└───────────────────────┘                 │
                                          ▼
                               ┌─────────────────────┐
                               │   PostgreSQL DB      │
                               │   + Redis Cache      │
                               └─────────────────────┘
```

### 2.2 Communication Flow

- **Player joins** → GreeterPlugin fires → checks DB via BridgePlugin → sends welcome if first-time join.
- **Challenge triggered** → ChallengePlugin polls web API every N minutes or on demand → fetches active challenges for a player → displays in-game.
- **Reward granted** → Admin clicks "Grant Reward" in dashboard → REST call hits BridgePlugin endpoint on Minecraft server → RewardPlugin executes the grant in-game.

---

## 3. Minecraft Server & Plugin System

### 3.1 Server Stack

| Component | Technology | Version |
|---|---|---|
| Minecraft server | [Paper](https://papermc.io/) | 1.21.x (latest stable) |
| Plugin language | Java | 21 (LTS) |
| Build tool | Maven | 3.9.x |
| Plugin framework | Bukkit / Paper API | Matching server version |
| HTTP client (bridge) | OkHttp | 4.x |

**Why Paper?** Paper offers significant performance improvements over vanilla/Spigot, an expanded API, async scheduler support, and active maintenance.

---

### 3.2 Plugin: Player Greeter (`GreeterPlugin`)

#### Responsibility
Detect when a player joins for the first time (or returns after a configurable absence) and deliver a personalized welcome experience.

#### Key Events Handled

```java
@EventHandler
public void onPlayerJoin(PlayerJoinEvent event) { ... }

@EventHandler
public void onPlayerQuit(PlayerQuitEvent event) { ... }
```

#### Behavior

1. On `PlayerJoinEvent`, query local cache (Redis via BridgePlugin) for the player's UUID.
2. If **new player**: run `firstJoinSequence()`:
   - Send configurable welcome message (supports MiniMessage formatting).
   - Give starter kit defined in `config.yml`.
   - Broadcast server-wide announcement (toggleable).
   - POST player record to web API (`/api/players`).
3. If **returning player**: send a shorter returning greeting (configurable).
4. Log all events to the web API for analytics.

#### Configuration (`plugins/GreeterPlugin/config.yml`)

```yaml
greeting:
  first_join_message: "<gold>Welcome to the server, <player>!</gold>"
  return_message: "<aqua>Welcome back, <player>! Last seen <last_seen>.</aqua>"
  broadcast_first_join: true
  broadcast_message: "<yellow>🎉 <player> just joined for the first time!"

starter_kit:
  enabled: true
  items:
    - material: STONE_SWORD
      amount: 1
    - material: BREAD
      amount: 16
    - material: TORCH
      amount: 32
```

---

### 3.3 Plugin: Challenge Engine (`ChallengePlugin`)

#### Responsibility
Present active challenges to players in-game, track progress, and mark completions.

#### Challenge Types (v1.0)

| Type | Example | Tracking Method |
|---|---|---|
| `BLOCK_BREAK` | Mine 64 diamonds | `BlockBreakEvent` |
| `KILL_MOB` | Defeat 10 skeletons | `EntityDeathEvent` |
| `CRAFT_ITEM` | Craft a diamond sword | `CraftItemEvent` |
| `TRAVEL` | Walk 1000 blocks | `PlayerMoveEvent` (sampled) |
| `CUSTOM` | Freeform — validated by web admin | Manual completion via dashboard |

#### Architecture

```
ChallengePlugin
├── ChallengeManager       — loads/caches active challenges from API
├── ChallengeTracker       — listens to Bukkit events, increments progress
├── ChallengeNotifier      — sends in-game messages/titles/sounds on progress
├── ChallengeRepository    — local SQLite for offline buffering
└── ChallengeSyncTask      — async BukkitRunnable, syncs with API every 60s
```

#### Challenge Data Model (canonical)

```json
{
  "id": "ch_abc123",
  "title": "Lumberjack",
  "description": "Chop down 100 oak logs.",
  "type": "BLOCK_BREAK",
  "target_material": "OAK_LOG",
  "target_count": 100,
  "reward_id": "rw_xyz789",
  "active_from": "2026-05-10T00:00:00Z",
  "active_until": "2026-05-17T00:00:00Z",
  "assigned_to": "all" // or ["uuid1", "uuid2"]
}
```

#### In-Game UX
- `/challenges` command — opens a paginated Book UI or chat list of active challenges.
- Progress bar shown in action bar while a relevant event occurs.
- Title + sound effect on challenge completion.

---

### 3.4 Plugin: Reward System (`RewardPlugin`)

#### Responsibility
Execute reward grants in-game when triggered by in-game completion or an external web API call.

#### Reward Types

| Type | Implementation |
|---|---|
| `ITEM` | `player.getInventory().addItem(...)` |
| `XP` | `player.giveExp(amount)` |
| `COMMAND` | `Bukkit.dispatchCommand(Bukkit.getConsoleSender(), cmd)` |
| `CURRENCY` | Integrates with Vault API (optional, v1.1) |

#### Reward Data Model

```json
{
  "id": "rw_xyz789",
  "name": "Lumberjack Trophy",
  "type": "ITEM",
  "item": {
    "material": "DIAMOND",
    "amount": 5,
    "display_name": "<gold>Lumberjack's Prize</gold>",
    "lore": ["Earned by chopping 100 oak logs."]
  },
  "xp": 500
}
```

#### Delivery Flow

```
API POST /api/rewards/grant
       │
       ▼
BridgePlugin HTTP endpoint
       │
       ▼
RewardPlugin.grantReward(playerId, rewardId)
       │
  ┌────┴────┐
  │ Online  │  →  grant immediately
  │ Offline │  →  queue in DB, grant on next join
  └─────────┘
```

---

### 3.5 Plugin: REST Bridge (`BridgePlugin`)

#### Responsibility
Act as the HTTP gateway between all other plugins and the web API, in both directions.

#### Outbound (Plugin → API)
- Uses OkHttp with a shared `OkHttpClient` (singleton, connection pooling).
- All calls are async (Bukkit async scheduler).
- Retries with exponential back-off on 5xx or network errors (max 3 retries).

#### Inbound (API → Plugin)
- Embedded lightweight HTTP server ([NanoHTTPD](https://github.com/NanoHttpd/nanohttpd)) listening on a configurable local port (default: `25580`).
- Bound to `localhost` only — **never exposed externally**.
- Shared secret header (`X-Bridge-Secret`) validated on every request.

#### Security
- The web backend calls `http://localhost:25580/bridge/...` — only possible from the same host.
- Bridge secret is a 256-bit random token set in `config.yml` and mirrored in the web backend's environment variables.

---

## 4. Web Management Platform

### 4.1 Backend API

#### Technology Stack

| Component | Technology |
|---|---|
| Runtime | Node.js 22 LTS |
| Framework | Express 5.x |
| ORM | Prisma 5.x |
| Database | PostgreSQL 16 |
| Cache | Redis 7 |
| Auth | JWT (access + refresh tokens) |
| Validation | Zod |
| Testing | Vitest + Supertest |

#### Module Structure

```
/server
├── src/
│   ├── routes/
│   │   ├── auth.ts
│   │   ├── players.ts
│   │   ├── challenges.ts
│   │   ├── rewards.ts
│   │   └── bridge.ts          ← calls the Minecraft bridge
│   ├── middleware/
│   │   ├── auth.middleware.ts
│   │   └── error.middleware.ts
│   ├── services/
│   │   ├── player.service.ts
│   │   ├── challenge.service.ts
│   │   ├── reward.service.ts
│   │   └── minecraft.service.ts  ← wraps bridge calls
│   ├── prisma/
│   │   └── schema.prisma
│   └── index.ts
├── .env.example
└── package.json
```

---

### 4.2 Frontend Dashboard

#### Technology Stack

| Component | Technology |
|---|---|
| Framework | React 19 + TypeScript |
| Build | Vite 6 |
| State | Zustand + React Query |
| UI | shadcn/ui + Tailwind CSS v4 |
| Charts | Recharts |
| Auth | JWT stored in httpOnly cookie |

#### Pages & Features

| Route | Page | Features |
|---|---|---|
| `/` | Dashboard Home | Live player count, recent joins, challenge summary, rewards granted today |
| `/players` | Player List | Searchable table, click → player detail, manual reward grant |
| `/players/:id` | Player Detail | Join history, challenge progress, reward log |
| `/challenges` | Challenge Manager | Create/edit/delete challenges, set schedule, assign to all or specific players |
| `/rewards` | Reward Manager | Define reward templates, link to challenges |
| `/greeting` | Greeting Config | Edit first-join message, return message, starter kit items |
| `/logs` | Event Logs | Stream of in-game events from the server |
| `/settings` | Settings | Bridge URL, secret rotation, admin users |

---

### 4.3 Authentication & Authorization

- Admin accounts stored in `users` table (bcrypt-hashed passwords).
- Login returns `accessToken` (15 min) + `refreshToken` (7 days, httpOnly cookie).
- Role: `SUPER_ADMIN` — full access. Role: `MODERATOR` — read + reward grant only (no challenge/greeting edits).
- All `/api/*` routes require a valid Bearer token.

---

## 5. Data Layer

### 5.1 PostgreSQL Schema (Prisma)

```prisma
model Player {
  id          String    @id         // Minecraft UUID
  username    String
  firstJoinAt DateTime
  lastSeenAt  DateTime
  joinCount   Int       @default(0)
  rewards     PlayerReward[]
  progress    ChallengeProgress[]
}

model Challenge {
  id          String    @id @default(cuid())
  title       String
  description String
  type        ChallengeType
  config      Json                  // type-specific config
  rewardId    String?
  reward      Reward?   @relation(fields: [rewardId], references: [id])
  activeFrom  DateTime
  activeUntil DateTime
  assignedTo  String[]              // ["all"] or list of UUIDs
  progress    ChallengeProgress[]
}

model ChallengeProgress {
  id          String    @id @default(cuid())
  playerId    String
  challengeId String
  current     Int       @default(0)
  completed   Boolean   @default(false)
  completedAt DateTime?
  player      Player    @relation(fields: [playerId], references: [id])
  challenge   Challenge @relation(fields: [challengeId], references: [id])
  @@unique([playerId, challengeId])
}

model Reward {
  id          String    @id @default(cuid())
  name        String
  type        RewardType
  config      Json
  challenges  Challenge[]
  grants      PlayerReward[]
}

model PlayerReward {
  id          String    @id @default(cuid())
  playerId    String
  rewardId    String
  grantedAt   DateTime  @default(now())
  grantedBy   String                // "SYSTEM" or admin userId
  player      Player    @relation(fields: [playerId], references: [id])
  reward      Reward    @relation(fields: [rewardId], references: [id])
}

model User {
  id           String   @id @default(cuid())
  email        String   @unique
  passwordHash String
  role         Role     @default(MODERATOR)
  createdAt    DateTime @default(now())
}

enum ChallengeType { BLOCK_BREAK KILL_MOB CRAFT_ITEM TRAVEL CUSTOM }
enum RewardType    { ITEM XP COMMAND CURRENCY }
enum Role          { SUPER_ADMIN MODERATOR }
```

### 5.2 Redis Usage

| Key Pattern | TTL | Purpose |
|---|---|---|
| `player:uuid:<id>` | 5 min | Cache player lookup (avoid DB hit on every join) |
| `challenges:active` | 60 s | Cache active challenge list served to plugins |
| `bridge:lock:<cmd>` | 5 s | Deduplication lock for reward grants |

---

## 6. Infrastructure & Deployment

### 6.1 Hosting Platform: Proxmox VE + DiscoPanel

The production environment runs on a **Proxmox VE** hypervisor. The Minecraft server is managed through **DiscoPanel**, a self-hosted game-server management panel. The CraftControl web stack runs on a dedicated second VM to keep game-server resources fully isolated from database and API workloads.

> Full step-by-step deployment instructions, resource sizing, network configuration, backup strategy, and CI/CD pipeline details are documented in **[DEPLOYMENT.md](./DEPLOYMENT.md)**.

### 6.2 Two-VM Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     PROXMOX VE HOST                             │
│                                                                 │
│  ┌──────────────────────────────┐  ┌────────────────────────┐  │
│  │  VM 1 — game-vm              │  │  VM 2 — mgmt-vm        │  │
│  │  Ubuntu 24.04 LTS            │  │  Ubuntu 24.04 LTS      │  │
│  │                              │  │                        │  │
│  │  ├─ DiscoPanel               │  │  ├─ Nginx (443)        │  │
│  │  │   (port 3001, mgmt UI)    │  │  ├─ Node.js API (3000) │  │
│  │  └─ Minecraft (Paper 1.21.x) │  │  ├─ React SPA          │  │
│  │      port 25565              │  │  ├─ PostgreSQL 16       │  │
│  │      BridgePlugin: 25580     │  │  └─ Redis 7            │  │
│  │      (localhost only)        │  │                        │  │
│  └──────────┬───────────────────┘  └─────────┬──────────────┘  │
│             │    Proxmox Internal Network     │                 │
│             │    (10.10.10.0/24 VLAN)         │                 │
│             └─────────────────────────────────┘                 │
└─────────────────────────────────────────────────────────────────┘
                          │
                     Public Internet
               Minecraft: 25565  |  HTTPS: 443
```

**Why two VMs instead of one?**

| Concern | Explanation |
|---|---|
| JVM GC isolation | Minecraft's garbage-collection pauses must not starve PostgreSQL I/O or API response times |
| Independent scaling | game-vm RAM can be tuned for JVM heap; mgmt-vm RAM for PostgreSQL shared_buffers |
| Failure domains | A crashing Minecraft process cannot take down the web panel or the database |
| Maintenance windows | Minecraft can be restarted for updates without touching the web stack, and vice versa |
| Security | Database is not reachable from the public internet; only mgmt-vm's internal IP is in BridgePlugin config |

### 6.3 Cross-VM Communication

The BridgePlugin (running on game-vm) calls the web API on mgmt-vm over the Proxmox internal network. The web API calls the BridgePlugin over the same network. Neither port is exposed to the public internet.

```
game-vm (10.10.10.10)          mgmt-vm (10.10.10.20)
───────────────────            ────────────────────
BridgePlugin outbound  ──────► Node.js API :3000
                                      │
Node.js API (bridge     ◄──────  POST /bridge/...
route)                         to 10.10.10.10:25580
```

### 6.4 Environment Variables (Web Backend — mgmt-vm)

```env
DATABASE_URL=postgresql://craftcontrol:pass@localhost:5432/craftcontrol
REDIS_URL=redis://localhost:6379
JWT_SECRET=<256-bit random>
JWT_REFRESH_SECRET=<256-bit random>
MINECRAFT_BRIDGE_URL=http://10.10.10.10:25580
MINECRAFT_BRIDGE_SECRET=<256-bit random>
NODE_ENV=production
PORT=3000
```

### 6.5 Minecraft Server Environment (`plugins/BridgePlugin/config.yml` — game-vm)

```yaml
bridge:
  port: 25580
  bind: "0.0.0.0"          # listens on all interfaces but firewall restricts to mgmt-vm IP
  secret: "<256-bit random — must match MINECRAFT_BRIDGE_SECRET>"
api:
  base_url: "http://10.10.10.20:3000/api"
  service_token: "<separate service token for plugin→API calls>"
```

### 6.6 CI/CD (GitHub Actions)

```
.github/workflows/
├── minecraft-plugin.yml    # Maven build + test on PR
├── api.yml                 # Node.js test + lint on PR
└── deploy.yml              # SSH deploy to both VMs on merge to main
```

**Deploy steps:**
1. **game-vm:** Build JAR → SCP to game-vm → DiscoPanel API restarts the Minecraft server instance.
2. **mgmt-vm:** Build Node.js app → PM2 reload on mgmt-vm.
3. **mgmt-vm:** Build React SPA → rsync to `/var/www/craftcontrol` on mgmt-vm.

### 6.7 DiscoPanel Integration

DiscoPanel manages the Minecraft server process on game-vm. It provides:
- Web UI for starting, stopping, and restarting the Paper server (accessible to admins at `https://panel.<domain>/`).
- File manager for editing `server.properties`, plugin configs, and world files.
- Console log viewer and RCON console access.
- Scheduled task runner (used for automated restarts and backups).
- Resource monitoring (CPU, RAM, disk) per server instance.

The CraftControl web dashboard and DiscoPanel are **separate applications** — DiscoPanel handles server process lifecycle, while CraftControl handles player data, challenges, rewards, and engagement features.

---

## 7. API Reference

### Base URL
`https://<your-domain>/api`

### Authentication
All endpoints (except `/auth/login`) require:
```
Authorization: Bearer <accessToken>
```

---

### Players

| Method | Path | Description |
|---|---|---|
| `GET` | `/players` | List all players (paginated) |
| `GET` | `/players/:id` | Get player detail |
| `POST` | `/players` | Register new player (called by plugin) |
| `PATCH` | `/players/:id` | Update last seen, join count |

---

### Challenges

| Method | Path | Description |
|---|---|---|
| `GET` | `/challenges` | List challenges (filter: active, all) |
| `GET` | `/challenges/active` | Active challenges — used by plugin poll |
| `POST` | `/challenges` | Create challenge |
| `PATCH` | `/challenges/:id` | Update challenge |
| `DELETE` | `/challenges/:id` | Delete challenge |
| `POST` | `/challenges/:id/progress` | Update player progress (from plugin) |
| `POST` | `/challenges/:id/complete` | Mark challenge complete (from plugin) |

---

### Rewards

| Method | Path | Description |
|---|---|---|
| `GET` | `/rewards` | List reward templates |
| `POST` | `/rewards` | Create reward template |
| `PATCH` | `/rewards/:id` | Update reward |
| `DELETE` | `/rewards/:id` | Delete reward |
| `POST` | `/rewards/grant` | Grant reward to player (triggers Minecraft bridge) |

**Grant Reward Request Body:**
```json
{
  "playerId": "<uuid>",
  "rewardId": "<reward_id>",
  "reason": "Manual grant by admin"
}
```

---

### Greeting Config

| Method | Path | Description |
|---|---|---|
| `GET` | `/greeting` | Get current greeting config |
| `PUT` | `/greeting` | Update greeting config |

---

### Auth

| Method | Path | Description |
|---|---|---|
| `POST` | `/auth/login` | Email + password → tokens |
| `POST` | `/auth/refresh` | Refresh access token |
| `POST` | `/auth/logout` | Invalidate refresh token |

---

## 8. Developer Guide

### 8.1 Local Development Setup

#### Prerequisites
- Java 21 (for plugin development)
- Node.js 22+
- Docker + Docker Compose (for local Postgres + Redis)
- A local Minecraft client (for testing)

#### Clone & Bootstrap

```bash
git clone git@github.com:sauliusc/craftcontrol.git
cd craftcontrol
```

#### Start Dependencies

```bash
docker compose up -d   # starts postgres + redis
```

#### Web Backend

```bash
cd server
cp .env.example .env   # fill in values
npm install
npx prisma migrate dev
npm run dev            # starts on :3000 with hot reload
```

#### Frontend

```bash
cd client
npm install
npm run dev            # starts on :5173
```

#### Minecraft Plugin (local test server)

```bash
cd plugins
mvn clean package -DskipTests
# Copy target/CraftControl-1.0.0.jar to your local Paper test server's /plugins/
# Start the Paper server
```

### 8.2 Plugin Development Conventions

- All Bukkit event handlers go in dedicated `*Listener` classes, registered in the plugin's `onEnable()`.
- Never perform blocking I/O on the main server thread — use `Bukkit.getScheduler().runTaskAsynchronously(...)`.
- Each plugin has its own `config.yml`; use `saveDefaultConfig()` + `reloadConfig()`.
- Shared plugin-to-plugin communication goes through `BridgePlugin`'s service API — no direct plugin dependency except on BridgePlugin.

### 8.3 Adding a New Challenge Type

1. Add enum value to `ChallengeType` in Prisma schema + migrate.
2. Add enum value to `ChallengePlugin`'s `ChallengeType` enum in Java.
3. Create a new `*Listener` class in `ChallengePlugin` that listens to the relevant Bukkit event and calls `ChallengeTracker.increment(player, type, material)`.
4. Register the listener in `ChallengePlugin.onEnable()`.
5. Add the new type's config fields to the web dashboard's challenge creation form.

---

## 9. Testing Strategy

### 9.1 Plugin Testing

| Layer | Tool | What's Tested |
|---|---|---|
| Unit | JUnit 5 + Mockito | Business logic (reward calculation, config parsing) |
| Integration | MockBukkit | Event handling, plugin lifecycle |
| Manual | Local Paper server | End-to-end in-game flows |

### 9.2 Web Backend Testing

| Layer | Tool | Coverage Target |
|---|---|---|
| Unit | Vitest | Services, utilities — 80%+ |
| Integration | Supertest + test DB | API routes — all happy + error paths |
| Contract | Manual / Postman | Bridge communication |

### 9.3 Frontend Testing

| Layer | Tool |
|---|---|
| Component | React Testing Library |
| E2E | Playwright |

---

## 10. Roadmap & Milestones

### Phase 1 — Foundation (Weeks 1–3)
- [x] Repository setup, CI skeleton
- [ ] BridgePlugin base (inbound + outbound HTTP)
- [ ] GreeterPlugin (first-join + return greeting)
- [ ] Web API: auth, player endpoints
- [ ] Basic dashboard: login, player list

### Phase 2 — Challenge System (Weeks 4–6)
- [ ] ChallengePlugin (BLOCK_BREAK, KILL_MOB, CRAFT_ITEM types)
- [ ] Web API: challenge CRUD + progress endpoints
- [ ] Dashboard: challenge manager page
- [ ] In-game UX: `/challenges` command, action bar progress, completion title

### Phase 3 — Rewards (Weeks 7–8)
- [ ] RewardPlugin (ITEM, XP, COMMAND types)
- [ ] Web API: reward grant endpoint + bridge call
- [ ] Dashboard: reward manager, manual grant UI
- [ ] Offline reward queuing

### Phase 4 — Polish & Launch (Weeks 9–10)
- [ ] TRAVEL and CUSTOM challenge types
- [ ] Dashboard: event log stream, analytics charts
- [ ] Full E2E test suite
- [ ] Production deployment, Nginx + SSL
- [ ] Documentation finalized

### Phase 5 — v1.1 (Post-launch)
- [ ] Vault / economy integration
- [ ] Challenge leaderboards
- [ ] Discord webhook notifications
- [ ] Multi-server (BungeeCord) support

---

## 11. Glossary

| Term | Definition |
|---|---|
| **Paper** | A high-performance fork of the Spigot Minecraft server software |
| **Plugin** | A Java `.jar` loaded by Paper that extends server behavior |
| **BridgePlugin** | The plugin responsible for HTTP communication between Minecraft and the web API |
| **MiniMessage** | Bukkit's text formatting system using `<tag>` syntax |
| **Vault API** | A Bukkit economy abstraction layer used by many server plugins |
| **OkHttp** | Java HTTP client library used for async outbound requests from plugins |
| **NanoHTTPD** | Lightweight embedded Java HTTP server used by BridgePlugin |
| **Prisma** | TypeScript ORM used by the Node.js backend |
| **JWT** | JSON Web Token — used for stateless authentication |
| **Proxmox VE** | Open-source bare-metal hypervisor used to host the project VMs |
| **DiscoPanel** | Self-hosted game-server management panel that runs and monitors the Minecraft server process on game-vm |
| **game-vm** | VM 1 on Proxmox; hosts DiscoPanel and the Minecraft Paper server |
| **mgmt-vm** | VM 2 on Proxmox; hosts the CraftControl web stack (Node.js API, React SPA, PostgreSQL, Redis, Nginx) |

---

*This document is the single source of truth for the CraftControl project. All architectural decisions should be reflected here before implementation begins.*
