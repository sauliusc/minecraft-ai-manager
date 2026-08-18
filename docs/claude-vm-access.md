# Giving Claude access to the server VM (CT102)

**Approach:** Claude Code Remote Control — the CLI runs *on* CT102, you drive it from
[claude.ai/code](https://claude.ai/code) or the Claude mobile app.
**Last Updated:** 2026-08-18
**Status:** Recommended

---

## Why this approach

Cloud Claude Code sessions (the ones started from claude.ai or `claude --cloud`) **cannot reach
CT102 directly**:

| Constraint | Consequence |
|---|---|
| Session egress goes through an HTTP/HTTPS proxy with a domain allowlist | No raw TCP — port 22 is unreachable |
| No `ssh` / `tailscale` / `wg` binary in the session image | Nothing to tunnel with |
| Network access levels are **None / Trusted / Full / Custom** — all domain-based, HTTP(S) only | Even **Full** does not enable SSH |
| Cloud environments have no secrets store; env vars are readable by anyone using the environment | Never put an SSH key or RCON password there |

Remote Control sidesteps all of it. The `claude` process runs on CT102, so it uses **CT102's**
filesystem, Docker socket, and LAN. The connection to claude.ai is outbound-only — no inbound
port, no firewall change, no credential leaves the box.

Alternatives considered: exposing the MCP server (`mcp/`, 52 tools on :3100) through an HTTPS
tunnel gives scoped game-server control but not a shell; a `workflow_dispatch` job on the existing
`[self-hosted, ct102]` runner is audited but slow and non-interactive.

---

## 1. Prerequisites

- Shell access to CT102 (the LXC container running the CraftControl stack at `/opt/craftcontrol`).
- `curl` and `tmux` — neither ships with the base Ubuntu 24.04 container image:
  ```bash
  apt update && apt install -y curl tmux
  ```
- A claude.ai subscription (Pro or Max). API-key auth does **not** work with Remote Control — if
  `ANTHROPIC_API_KEY` is set in the environment, unset it before logging in.

---

## 2. Install the CLI on CT102

CT102 has no Node.js, so use the standalone installer — it bundles its own runtime:

```bash
curl -fsSL https://claude.ai/install.sh | bash
```

It installs to `~/.local/bin`, which is **not** on root's PATH on a fresh Ubuntu container. Without
this, the next command is `claude: command not found`:

```bash
export PATH="$HOME/.local/bin:$PATH"
echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.bashrc
claude --version
```

On a host that already runs Node 18+, `npm install -g @anthropic-ai/claude-code` works too and puts
the binary on the global PATH — but CT102 is not such a host (`npm` is absent; installing it just to
get the CLI is unnecessary).

## 3. One-time login

Remote Control needs an interactive login once. Credentials are stored in `~/.claude` for the
user that runs the command — run this as the **same user** the service will run as (see §5).

```bash
claude
# then inside the session:
/login
```

Follow the browser URL it prints, paste the code back, then `/exit`.

---

## 4. Quick start — tmux

Simplest way to get a session up. Good for hands-on work.

```bash
tmux new -s claude
cd /opt/craftcontrol
claude --remote-control "craftcontrol-ct102"
```

The footer shows a `/rc active` indicator; select it (down arrow, Enter) for the session URL and
a QR code. Detach with `Ctrl-b d` — the session keeps running. Reattach with `tmux attach -t claude`.

The session now appears in the sidebar at claude.ai/code and in the mobile app. Anything you type
there runs on CT102.

---

## 5. Persistent setup — systemd

Survives reboots, and restarts after the ~10-minute give-up window that server mode applies during
a network outage.

### 5.1 Dedicated user (recommended)

Do not run the agent as `root`. Create a user with just the access it needs:

```bash
useradd -m -s /bin/bash claude
usermod -aG docker claude          # docker compose against /opt/craftcontrol
chown -R claude:claude /opt/craftcontrol
su - claude                        # then install the CLI (§2) and run /login (§3) as this user
```

Grant `sudo` only if you actually want Claude able to touch the host outside Docker — it widens
the blast radius considerably.

### 5.2 Unit file

`/etc/systemd/system/claude-remote-control.service`:

```ini
[Unit]
Description=Claude Code Remote Control (CraftControl CT102)
After=network-online.target docker.service
Wants=network-online.target

[Service]
Type=simple
User=claude
WorkingDirectory=/opt/craftcontrol
Environment=HOME=/home/claude
Environment=CLAUDE_REMOTE_CONTROL_SESSION_NAME_PREFIX=ct102
ExecStart=/home/claude/.local/bin/claude remote-control --name "craftcontrol-ct102"
Restart=always
RestartSec=15

[Install]
WantedBy=multi-user.target
```

Set `ExecStart` to the real binary path for the **service user** — systemd does not read
`.bashrc`, so the PATH export from §2 does not apply here. Run `su - claude -c 'which claude'`; the
native installer puts it at `/home/claude/.local/bin/claude`.

```bash
systemctl daemon-reload
systemctl enable --now claude-remote-control
systemctl status claude-remote-control
journalctl -u claude-remote-control -f
```

`claude remote-control` is **server mode**: it serves sessions on demand, so you can open a new
one from the web or the phone without touching the box.

---

## 6. Verify

1. Open [claude.ai/code](https://claude.ai/code) — a session named `craftcontrol-ct102` should be listed.
2. Send it something only CT102 can answer:
   ```
   docker compose -f /opt/craftcontrol/deploymentV2/docker-compose.yml ps
   ```
3. Confirm the container list matches `docker compose ps` run in your own SSH shell.

For push notifications on your phone, run `/config` in the local terminal session and enable
**Push when actions required** (permission prompts) and/or **Push when Claude decides**.

---

## 7. What this unlocks

With a session live on CT102, Claude can do the things the CI-only workflow cannot:

- Read live container logs (`docker compose logs minecraft`) without waiting for a deploy run.
- Inspect `/opt/craftcontrol/deploymentV2/.env` values that override compose defaults — the
  `MINECRAFT_VERSION` trap documented in `CLAUDE.md`.
- Check `/data/plugins/` for stray `original-*.jar` files and stale `patched_*.jar` caches.
- Restart individual services, run RCON commands, check disk and memory pressure.

Code changes still go through the repo's normal flow: issue → branch → PR → green CI → squash-merge.
Do not hand-edit files under `/opt/craftcontrol` — `deploy-v2.yml` runs `git reset --hard origin/main`
on every deploy and will discard them.

---

## 8. Security notes

- **The agent has whatever access its user has.** In the `docker` group that is effectively root on
  the host (a container can mount `/`). Treat it as such.
- **Permission prompts are your control point.** Leave the default permission mode on; every write
  or command asks first, and the prompt is forwarded to whichever device you are on. Avoid
  `--dangerously-skip-permissions` on this box.
- **Anyone with your claude.ai account can reach the session.** Protect the account with 2FA.
- **The process is the session.** Stop the service and remote access stops immediately —
  `systemctl stop claude-remote-control`. There is no lingering inbound path.
- **Sessions can be resumed** for roughly four hours after the server stops
  (`claude remote-control --continue` from the same directory); after that, start a fresh one.

---

## 9. Troubleshooting

| Symptom | Fix |
|---|---|
| `claude: command not found` right after a successful install | The native installer writes to `~/.local/bin`, which is not on root's PATH by default. Run the `export PATH` line from §2. |
| `npm: command not found` | CT102 has no Node.js. Use the standalone installer in §2 instead. |
| `Remote Control requires a claude.ai subscription` | Not signed in with a claude.ai account. `unset ANTHROPIC_API_KEY`, then `claude auth login` and pick the claude.ai option. |
| Session shows offline in the sidebar | The local process died. `systemctl status claude-remote-control`, or reattach the tmux session. |
| `claude remote-control` exits by itself | Extended network outage — server mode gives up after ~10 minutes. `Restart=always` in the unit handles this; otherwise rerun the command. |
| Session disconnected after ~30 minutes | Presence heartbeats failing. Run `/remote-control` in the local session to re-register. |
| `/plugin`, `/resume` do nothing from the phone | Terminal-only commands. Run them from the CT102 shell. |

---

## References

- [Remote Control](https://code.claude.com/docs/en/remote-control)
- [Claude Code on the web](https://code.claude.com/docs/en/claude-code-on-the-web)
- [Cloud environments](https://code.claude.com/docs/en/cloud-environments) — network access levels
