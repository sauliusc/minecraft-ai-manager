# CraftControl MCP Server

Exposes your entire CraftControl platform as MCP tools — giving Claude full control over both raw Minecraft and your custom game logic.

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

## Setup

### 1. Build

```bash
cd mcp
npm install
npm run build
```

### 2. Configure in Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "craftcontrol": {
      "command": "node",
      "args": ["/path/to/minecraft-ai-manager/mcp/dist/index.js"],
      "env": {
        "CRAFTCONTROL_URL": "http://your-server:3000",
        "CRAFTCONTROL_EMAIL": "admin@example.com",
        "CRAFTCONTROL_PASSWORD": "your-admin-password"
      }
    }
  }
}
```

### 3. Configure in Claude Code (CLI)

Add to your project's `.claude/settings.json` or global `~/.claude/settings.json`:

```json
{
  "mcpServers": {
    "craftcontrol": {
      "command": "node",
      "args": ["./mcp/dist/index.js"],
      "env": {
        "CRAFTCONTROL_URL": "http://your-server:3000",
        "CRAFTCONTROL_EMAIL": "admin@example.com",
        "CRAFTCONTROL_PASSWORD": "your-admin-password"
      }
    }
  }
}
```

### 4. Dev mode (no build needed)

```bash
CRAFTCONTROL_URL=http://localhost:3000 \
CRAFTCONTROL_EMAIL=admin@example.com \
CRAFTCONTROL_PASSWORD=password \
npx tsx src/index.ts
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `CRAFTCONTROL_URL` | ✅ | Base URL of your CraftControl API (e.g. `http://192.168.1.10:3000`) |
| `CRAFTCONTROL_EMAIL` | ✅ | Admin account email |
| `CRAFTCONTROL_PASSWORD` | ✅ | Admin account password |

The server logs in on first use and auto-refreshes the JWT when it expires.
