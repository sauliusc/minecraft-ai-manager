# Minecraft AI Manager (CraftControl)

A self-hosted Minecraft server management panel with AI-powered features — challenge generation, engagement analytics, reward recommendations, and chat moderation — all in one Docker Compose stack.

## Quick Start

**Requirements:** Docker ([install guide](https://docs.docker.com/engine/install/))

```bash
git clone https://github.com/sauliusc/minecraft-ai-manager.git
cd minecraft-ai-manager
docker compose up -d
```

The panel will be available at **http://\<your-server-ip\>**

Default login: `admin@example.com` / `changeme123`  
**Change your password immediately after first login.**

---

### Copy the BRIDGE_SECRET to your Minecraft server

```bash
grep BRIDGE_SECRET .env
```

Add the value to your Minecraft server's environment variables:
```
BRIDGE_SECRET=<value from above>
```

### Regenerate secrets for production

Edit `.env` and replace the pre-generated values:

```bash
openssl rand -hex 32   # generates a new 64-character secret
```

Restart after editing:

```bash
docker compose up -d
```

---

## Proxmox one-click deployment

To deploy into a fresh LXC container from the Proxmox host root shell:

```bash
bash proxmox/deploy.sh
```

See [`proxmox/README.md`](proxmox/README.md) for options (custom CTID, RAM, disk size, etc.).

---

## Features

- **Players** — search, profiles, join history, streaks
- **Challenges** — create/schedule, calendar view, progress tracking
- **Rewards** — grant coins, crystals, cosmetics, mystery boxes
- **Events** — timed server events with XP bonuses
- **Clans** — clan management, war system
- **Moderation** — chat log review and flagging
- **Analytics** — engagement heatmaps, completion rates
- **Broadcast** — server-wide announcements via plugin bridge
- **Minecraft Server** — start/stop/restart control, live console, status
- **AI Features** — Claude-powered challenge generation, churn detection, reward suggestions, chat moderation scan

## Architecture

| Service | Image |
|---------|-------|
| API | `ghcr.io/sauliusc/minecraft-ai-manager/api:latest` |
| Web | `ghcr.io/sauliusc/minecraft-ai-manager/web:latest` |
| Minecraft | `ghcr.io/sauliusc/minecraft-ai-manager/minecraft:latest` |
| Database | `postgres:16-alpine` |
| Cache | `redis:7-alpine` |

See [`deploymentV2/README.md`](deploymentV2/README.md) for advanced options — rollback, backup, CI/CD, SSH deploy.
