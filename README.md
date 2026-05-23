# CraftControl — Minecraft AI Manager

A self-hosted Minecraft server management panel with AI-powered features: challenge generation, engagement analytics, reward recommendations, and chat moderation — all in one Docker Compose stack.

## Quick start

**Requirements:** Docker ([install guide](https://docs.docker.com/engine/install/))

```bash
git clone https://github.com/sauliusc/minecraft-ai-manager.git
cd minecraft-ai-manager/deploymentV2
make setup    # interactive wizard → generates .env and prints your Claude config
make deploy   # build images, run migrations, start everything
```

The panel will be available at **http://\<your-server-ip\>** — log in with the admin credentials you set during `make setup`.

---

## What gets deployed

| Container | What it runs | Port |
|-----------|--------------|------|
| `db` | PostgreSQL 16 | internal |
| `redis` | Redis 7 | internal |
| `api` | Node.js API + Prisma | internal |
| `web` | Nginx + React SPA | **80** |
| `mcp` | Claude MCP server (52 tools) | **3100** |
| `minecraft` | Paper Minecraft server | **25565** |

The Minecraft server is part of the Docker Compose stack. The `BRIDGE_SECRET` and RCON credentials are injected automatically from `.env` — no manual configuration of the game server is required.

---

## Proxmox one-click deployment

To deploy into a fresh LXC container from the Proxmox host root shell:

```bash
bash proxmox/deploy.sh
```

See [`proxmox/README.md`](proxmox/README.md) for options (custom CTID, RAM, disk size, etc.).

---

## MCP server (Claude AI tools)

After `make setup` the wizard prints a ready-to-paste config snippet. Add it to Claude Desktop or Claude Code to give Claude 52 tools for controlling the server:

```json
{
  "mcpServers": {
    "craftcontrol": {
      "transport": "sse",
      "url": "http://<your-server-ip>:3100/sse",
      "headers": { "Authorization": "Bearer <MCP_AUTH_TOKEN>" }
    }
  }
}
```

See [`mcp/README.md`](mcp/README.md) for the full tool list and local (stdio) mode.

---

## Features

- **Players** — profiles, join history, streaks, tier progression
- **Challenges** — create/schedule, calendar view, AI-generated drafts
- **Rewards** — coins, crystals, cosmetics, mystery boxes
- **Events** — timed server events with leaderboards
- **Clans** — clan management, roles, war system, clan homes
- **Economy** — player-to-player market, admin adjustments
- **Moderation** — chat logs, reports, audit trail, AI moderation scan
- **Analytics** — engagement heatmaps, churn risk, retention stats
- **Broadcast** — scheduled server-wide announcements
- **Minecraft Server** — start/stop/restart, live RCON console
- **AI Features** — Claude-powered challenge generation, engagement scan, reward suggestions, chat moderation scan
- **MCP Server** — Claude controls everything directly via 52 typed tools

---

## Further reading

| Doc | What it covers |
|-----|----------------|
| [`deploymentV2/README.md`](deploymentV2/README.md) | Full deployment guide — rollback, backup, CI/CD |
| [`mcp/README.md`](mcp/README.md) | MCP server setup and tool reference |
| [`DEPLOYMENT.md`](DEPLOYMENT.md) | Proxmox two-VM production topology |
| [`TECHNICAL_DOCS.md`](TECHNICAL_DOCS.md) | Architecture, API reference, developer guide |
| [`proxmox/README.md`](proxmox/README.md) | Proxmox LXC one-click deployment |
