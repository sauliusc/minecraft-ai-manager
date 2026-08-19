---
description: Full diagnostic sweep of the live CraftControl stack on CT102
allowed-tools: Bash(docker compose:*), Bash(docker stats:*), Bash(docker ps:*), Bash(df:*), Bash(free:*), Bash(grep:*), Bash(tail:*), Bash(uptime:*)
---

Run a complete triage of the live server and report findings. Do **not** change anything —
this command is read-only. Propose fixes at the end; land them through the repo flow in
`CLAUDE.md` (issue → branch → PR → green CI → merge), never by editing `/opt/craftcontrol`
directly (`deploy-v2` runs `git reset --hard origin/main` and will discard local edits).

Shorthand used below:

```bash
DC="docker compose -f /opt/craftcontrol/deploymentV2/docker-compose.yml --env-file /opt/craftcontrol/deploymentV2/.env"
```

## 1. Host health

```bash
df -h /                     # full disk breaks Postgres writes and world saves
free -h                     # 6G host: swap climbing means MEMORY is set too high
uptime                      # load average
docker system df            # stale image layers are the usual disk hog
```

## 2. Container state

```bash
$DC ps                      # every service Up? restart counts climbing?
docker stats --no-stream    # per-container memory against the host total
```

A container in a restart loop is the single most useful signal — check its count first.

## 3. Minecraft server

```bash
$DC logs --no-color --tail 500 minecraft > /tmp/mc.log
grep -E " ERROR\]:" /tmp/mc.log
grep -E " WARN\]:"  /tmp/mc.log
grep -c "Failed to remap plugin jar" /tmp/mc.log
```

Paper logs as `[HH:MM:SS ERROR]:`. Remap failures do **not** appear as `ERROR]:` lines — they
surface as stack traces, so check them separately (this mirrors the `validate` job in
`deploy-v2.yml`).

Confirm all 13 custom plugins initialised:

```bash
for P in BridgePlugin GreeterPlugin ChallengePlugin RewardPlugin StreakPlugin EconomyPlugin \
         ClanPlugin QuestPlugin CosmeticsPlugin EventPlugin VotePlugin ModerationPlugin NpcPlugin; do
  grep -q "\[$P\]" /tmp/mc.log || echo "MISSING: $P"
done
```

Live server state over RCON:

```bash
$DC exec -T minecraft rcon-cli tps
$DC exec -T minecraft rcon-cli list
```

TPS below ~18 means the server is struggling — correlate with `docker stats` memory and GC
pauses in the log before blaming a plugin.

## 4. API, database, bridge

```bash
$DC logs --no-color --tail 100 api
$DC logs --no-color --tail 50 db
$DC exec -T api wget -qO- http://localhost:3000/health || true
```

The Minecraft bridge talks to `http://api:3000`; if plugins log bridge errors, check the API
container before touching plugin code.

## 5. Version sanity

```bash
grep -E 'MINECRAFT_VERSION|IMAGE_TAG' /opt/craftcontrol/deploymentV2/.env
$DC exec -T minecraft ls /data/cache/
```

`.env` on CT102 carries a stale `MINECRAFT_VERSION=1.21.4`; the compose file hardcodes the real
version precisely so that value cannot override it. A `patched_1.21.4-*.jar` in `/data/cache`
means the wrong Paper build booted — see the version-bump section of `CLAUDE.md`.

## Report

Summarise: what is broken, the evidence (quote the log lines), the likely cause, and the
smallest fix. Flag anything that needs a repo change versus a live-server action.
