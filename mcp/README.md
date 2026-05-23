# CraftControl MCP Server

Exposes your entire CraftControl platform as MCP tools — giving Claude full control over both raw Minecraft and your custom game logic.

## Two transport modes

| Mode | When | Use case |
|------|------|---------|
| **SSE / HTTP** | `PORT` env var is set | Docker Compose (recommended) |
| **stdio** | No `PORT` | Local Claude Desktop / Claude Code subprocess |

---

## Docker Compose (recommended — zero manual steps)

The MCP server is part of the standard Docker Compose setup. It builds and starts automatically with everything else when you run `deploy.sh`.

Add these to your `.env` (alongside the existing variables):

```bash
# Required — same admin account used to log into the web panel
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=your-admin-password

# Optional — bearer token Claude must send; leave blank to disable auth
MCP_AUTH_TOKEN=some-random-secret

# Optional — host port (default 3100)
MCP_PORT=3100
```

Then connect Claude to it. In Claude Desktop (`~/Library/Application Support/Claude/claude_desktop_config.json`) or Claude Code (`.claude/settings.json`):

```json
{
  "mcpServers": {
    "craftcontrol": {
      "transport": "sse",
      "url": "http://YOUR_SERVER_IP:3100/sse",
      "headers": {
        "Authorization": "Bearer some-random-secret"
      }
    }
  }
}
```

If `MCP_AUTH_TOKEN` is empty, omit the `headers` block.

---

## Local subprocess mode (stdio)

Useful for development or when Claude is running on the same machine.

```bash
cd mcp
npm install
npm run build

# Then in Claude config:
```

```json
{
  "mcpServers": {
    "craftcontrol": {
      "command": "node",
      "args": ["/path/to/mcp/dist/index.js"],
      "env": {
        "CRAFTCONTROL_URL": "http://localhost:3000",
        "CRAFTCONTROL_EMAIL": "admin@example.com",
        "CRAFTCONTROL_PASSWORD": "your-password"
      }
    }
  }
}
```

Or with `tsx` for dev (no build step):

```bash
CRAFTCONTROL_URL=http://localhost:3000 \
CRAFTCONTROL_EMAIL=admin@example.com \
CRAFTCONTROL_PASSWORD=password \
npx tsx src/index.ts
```

---

## Tools (52 total)

| Domain | Tools |
|--------|-------|
| **Minecraft** | `minecraft_status`, `minecraft_logs`, `minecraft_command` *(raw RCON)*, `minecraft_power` |
| **Players** | `list_players`, `get_player`, `update_player` |
| **Clans** | `list_clans`, `get_clan`, `get_clan_wars`, `get_player_clan`, `disband_clan`, `delete_clan`, `kick_clan_member`, `change_clan_member_role`, `add_clan_xp`, `start_clan_war`, `resolve_clan_war` |
| **Economy** | `get_balance`, `get_top_balances`, `transfer_coins`, `adjust_currency`, `list_market`, `grant_reward` |
| **Challenges** | `list_challenges`, `get_challenge`, `create_challenge`, `update_challenge`, `delete_challenge` |
| **Events** | `list_events`, `get_event`, `create_event`, `update_event`, `complete_event`, `delete_event` |
| **AI** | `ai_generate_challenges`, `ai_list_challenge_drafts`, `ai_approve_challenge_draft`, `ai_reject_challenge_draft`, `ai_scan_engagement`, `ai_get_latest_engagement`, `ai_suggest_rewards`, `ai_scan_moderation`, `ai_get_latest_moderation_scan`, `ai_get_config`, `ai_update_config` |
| **Moderation** | `list_reports`, `resolve_report`, `admin_moderation_action`, `list_chat_logs`, `get_audit_log` |
| **Broadcast** | `list_broadcasts`, `create_broadcast`, `cancel_broadcast`, `update_broadcast` |
| **Analytics** | `get_retention_stats`, `get_challenge_analytics`, `get_economy_analytics`, `get_churn_risk`, `get_engagement_heatmap` |

## Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `CRAFTCONTROL_URL` | ✅ | Base URL of your CraftControl API |
| `CRAFTCONTROL_EMAIL` | ✅ | Admin account email |
| `CRAFTCONTROL_PASSWORD` | ✅ | Admin account password |
| `PORT` | — | If set, runs in SSE/HTTP mode on this port (Docker) |
| `MCP_AUTH_TOKEN` | — | Bearer token required on `/sse` requests (optional but recommended) |
