#!/usr/bin/env python3
"""
CraftControl Discord bridge — lets an allowlisted human drive Claude Code on CT102
from a Discord channel.

Deliberately dependency-free: Python's standard library only, talking to Discord's
REST API and polling for new messages. There is no gateway websocket to keep alive
and nothing to `pip install`, which matters because this runs as a bare systemd
service on the host rather than inside the compose stack.

It runs on the HOST, not in a container, for two reasons:
  1. `claude` and its OAuth credentials live in /root on the host.
  2. Asking the bot to run `make deploy` from inside deploymentV2 would restart the
     bot's own container mid-command. A host service is immune to that.

SECURITY: every forwarded message runs Claude Code as root in the repo working
tree, where it can edit files, run docker and deploy the stack. The user allowlist
is the only thing standing between a Discord message and that power — keep
DISCORD_ALLOWED_USER_IDS tight and the channel private.

Note on the permission mode: `bypassPermissions` is refused outright by Claude Code
when running as root ("cannot be used with root/sudo privileges"), so this uses
`acceptEdits`. Measured on CT102, that still auto-approves Bash and any file edit
inside CLAUDE_WORKDIR, while refusing writes outside it — which is both what makes
the bot useful and a tighter blast radius than a full bypass would have been.
"""

import json
import logging
import os
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.parse
import urllib.request

API = "https://discord.com/api/v10"
USER_AGENT = "CraftControlBot (https://github.com/sauliusc/minecraft-ai-manager, 1.0)"
MAX_DISCORD_CHARS = 1900  # real limit is 2000; leave room for fences and footers


# ──────────────────────────────────────────────────────────────────────────────
# Config
# ──────────────────────────────────────────────────────────────────────────────

def _env_ids(name):
    return [x.strip() for x in os.environ.get(name, "").split(",") if x.strip()]


class Config:
    def __init__(self):
        self.token = os.environ.get("DISCORD_BOT_TOKEN", "").strip()
        self.allowed_users = set(_env_ids("DISCORD_ALLOWED_USER_IDS"))
        self.channels = _env_ids("DISCORD_CHANNEL_IDS")
        # "allowlist" (default): only DISCORD_ALLOWED_USER_IDS may command the bot.
        # "channel": anyone who can post in a watched channel may — Discord's own
        # channel permissions become the access control. That is a real gate, but
        # it moves authorization outside this repo: whoever can add a member or a
        # role to the channel can grant root-level access without a code change.
        self.auth_mode = os.environ.get("DISCORD_AUTH_MODE", "allowlist").strip().lower()
        self.workdir = os.environ.get("CLAUDE_WORKDIR", "/opt/craftcontrol")
        self.model = os.environ.get("CLAUDE_MODEL", "").strip()
        self.timeout = int(os.environ.get("CLAUDE_TIMEOUT_SECONDS", "1800"))
        self.poll = float(os.environ.get("POLL_INTERVAL_SECONDS", "3"))
        self.state_file = os.environ.get(
            "STATE_FILE", "/var/lib/craftcontrol-discord/state.json")
        self.claude_bin = os.environ.get("CLAUDE_BIN", "/root/.local/bin/claude")

    def problems(self):
        out = []
        if not self.token:
            out.append("DISCORD_BOT_TOKEN is not set")
        if self.auth_mode not in ("allowlist", "channel"):
            out.append(f"DISCORD_AUTH_MODE must be 'allowlist' or 'channel', "
                       f"got '{self.auth_mode}'")
        # In allowlist mode an empty list would silently mean "nobody", and a
        # truncated env file must never quietly widen access, so fail closed.
        # Opening it up to every channel member has to be typed out explicitly as
        # DISCORD_AUTH_MODE=channel.
        if self.auth_mode == "allowlist" and not self.allowed_users:
            out.append("DISCORD_ALLOWED_USER_IDS is empty — refusing to start "
                       "(set DISCORD_AUTH_MODE=channel to trust every channel member)")
        if not self.channels:
            out.append("DISCORD_CHANNEL_IDS is empty — set the channel(s) to watch")
        if not os.path.isdir(self.workdir):
            out.append(f"CLAUDE_WORKDIR does not exist: {self.workdir}")
        if not os.path.isfile(self.claude_bin):
            out.append(f"claude binary not found: {self.claude_bin}")
        return out


# ──────────────────────────────────────────────────────────────────────────────
# Discord REST
# ──────────────────────────────────────────────────────────────────────────────

class Discord:
    def __init__(self, token):
        self.token = token

    def _request(self, method, path, body=None, _depth=0):
        url = path if path.startswith("http") else API + path
        data = json.dumps(body).encode() if body is not None else None
        req = urllib.request.Request(url, data=data, method=method)
        req.add_header("Authorization", f"Bot {self.token}")
        req.add_header("User-Agent", USER_AGENT)
        if data is not None:
            req.add_header("Content-Type", "application/json")
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                raw = resp.read()
                return json.loads(raw) if raw else None
        except urllib.error.HTTPError as e:
            if e.code == 429 and _depth < 5:
                # Discord tells us exactly how long to wait; respect it rather than
                # hammering and getting the token temporarily blocked.
                try:
                    retry = float(json.loads(e.read()).get("retry_after", 1.0))
                except Exception:
                    retry = 1.0
                time.sleep(retry + 0.25)
                return self._request(method, path, body, _depth + 1)
            detail = ""
            try:
                detail = e.read().decode()[:300]
            except Exception:
                pass
            raise RuntimeError(f"Discord {method} {path} -> HTTP {e.code} {detail}") from e

    def me(self):
        return self._request("GET", "/users/@me")

    def fetch_messages(self, channel_id, after=None):
        path = f"/channels/{channel_id}/messages?limit=50"
        if after:
            path += f"&after={after}"
        # Discord returns newest-first; callers want chronological order.
        return list(reversed(self._request("GET", path) or []))

    def send(self, channel_id, content):
        return self._request("POST", f"/channels/{channel_id}/messages",
                             {"content": content})

    def typing(self, channel_id):
        try:
            self._request("POST", f"/channels/{channel_id}/typing")
        except Exception:
            pass  # cosmetic only — never let it break a run

    def react(self, channel_id, message_id, emoji):
        try:
            enc = urllib.parse.quote(emoji)
            self._request(
                "PUT",
                f"/channels/{channel_id}/messages/{message_id}/reactions/{enc}/@me")
        except Exception:
            pass


# ──────────────────────────────────────────────────────────────────────────────
# Persistent state — session ids and read cursors survive restarts
# ──────────────────────────────────────────────────────────────────────────────

class State:
    def __init__(self, path):
        self.path = path
        self.lock = threading.Lock()
        self.data = {"sessions": {}, "last_seen": {}}
        try:
            with open(path) as f:
                loaded = json.load(f)
            for key in self.data:
                if isinstance(loaded.get(key), dict):
                    self.data[key] = loaded[key]
        except FileNotFoundError:
            pass
        except Exception as e:
            logging.warning("Could not read state file %s: %s", path, e)

    def _save(self):
        os.makedirs(os.path.dirname(self.path), exist_ok=True)
        tmp = self.path + ".tmp"
        with open(tmp, "w") as f:
            json.dump(self.data, f, indent=2)
        os.replace(tmp, self.path)

    def get(self, bucket, key):
        with self.lock:
            return self.data.setdefault(bucket, {}).get(key)

    def set(self, bucket, key, value):
        with self.lock:
            self.data.setdefault(bucket, {})[key] = value
            self._save()

    def drop(self, bucket, key):
        with self.lock:
            self.data.setdefault(bucket, {}).pop(key, None)
            self._save()


# ──────────────────────────────────────────────────────────────────────────────
# Claude Code runner
# ──────────────────────────────────────────────────────────────────────────────

class ClaudeRunner:
    """Runs one Claude Code job at a time, resuming a per-channel session."""

    def __init__(self, cfg, state):
        self.cfg = cfg
        self.state = state
        self.lock = threading.Lock()   # one agent at a time, repo-wide
        self.current = None            # the live subprocess, for !stop

    def busy(self):
        return self.lock.locked()

    def stop(self):
        proc = self.current
        if proc and proc.poll() is None:
            proc.terminate()
            return True
        return False

    def run(self, channel_id, prompt):
        """Returns (text, meta_dict). Assumes the caller already holds the lock."""
        session = self.state.get("sessions", channel_id)
        text, meta, retry_fresh = self._invoke(channel_id, prompt, session)
        if retry_fresh:
            # The stored session id is gone (pruned, or written by an older CLI).
            # Losing history is much better than refusing to answer, so start over.
            logging.warning("Session %s unusable, starting a fresh one", session)
            self.state.drop("sessions", channel_id)
            text, meta, _ = self._invoke(channel_id, prompt, None)
        return text, meta

    def _invoke(self, channel_id, prompt, session):
        # acceptEdits, not bypassPermissions: the latter is hard-refused when the
        # CLI runs as root. acceptEdits auto-approves Bash and edits within
        # CLAUDE_WORKDIR and denies writes outside it — see the module docstring.
        cmd = [self.cfg.claude_bin, "-p", prompt,
               "--output-format", "json",
               "--permission-mode",
               os.environ.get("CLAUDE_PERMISSION_MODE", "acceptEdits")]
        if self.cfg.model:
            cmd += ["--model", self.cfg.model]
        if session:
            cmd += ["--resume", session]

        logging.info("claude start (channel=%s, resume=%s, chars=%d)",
                     channel_id, bool(session), len(prompt))
        started = time.time()
        try:
            self.current = subprocess.Popen(
                cmd, cwd=self.cfg.workdir,
                stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
            out, err = self.current.communicate(timeout=self.cfg.timeout)
            code = self.current.returncode
        except subprocess.TimeoutExpired:
            self.current.kill()
            self.current.communicate()
            return (f"⏱️ Nutraukta: viršytas {self.cfg.timeout} s limitas.",
                    {"timeout": True}, False)
        except Exception as e:
            return (f"💥 Nepavyko paleisti claude: {e}", {"error": True}, False)
        finally:
            self.current = None

        elapsed = time.time() - started

        if code != 0 and not out.strip():
            stale = session and ("session" in err.lower() or "resume" in err.lower())
            return (f"💥 claude baigė su kodu {code}:\n{err.strip()[:1200]}",
                    {"error": True}, bool(stale))

        try:
            data = json.loads(out)
        except Exception:
            return (out.strip()[:MAX_DISCORD_CHARS] or f"(tuščias atsakymas, kodas {code})",
                    {"raw": True}, False)

        new_session = data.get("session_id")
        if new_session:
            self.state.set("sessions", channel_id, new_session)

        text = (data.get("result") or "").strip() or "(tuščias atsakymas)"
        meta = {
            "turns": data.get("num_turns"),
            "cost": data.get("total_cost_usd"),
            "elapsed": elapsed,
            "is_error": bool(data.get("is_error")),
            "denials": len(data.get("permission_denials") or []),
        }
        logging.info("claude done (channel=%s, turns=%s, %.1fs, error=%s)",
                     channel_id, meta["turns"], elapsed, meta["is_error"])
        return text, meta, False


# ──────────────────────────────────────────────────────────────────────────────
# Message formatting
# ──────────────────────────────────────────────────────────────────────────────

def chunk(text, limit=MAX_DISCORD_CHARS):
    """Split text for Discord, preferring line boundaries over hard cuts."""
    out, buf = [], ""
    for line in text.split("\n"):
        while len(line) > limit:            # a single monstrous line
            out.append((buf + "\n" + line[:limit]).strip() if buf else line[:limit])
            buf, line = "", line[limit:]
        if len(buf) + len(line) + 1 > limit:
            out.append(buf)
            buf = line
        else:
            buf = f"{buf}\n{line}" if buf else line
    if buf.strip():
        out.append(buf)
    return out or ["(tuščias atsakymas)"]


def footer(meta):
    if not meta or meta.get("raw") or meta.get("error") or meta.get("timeout"):
        return None
    bits = []
    if meta.get("turns"):
        bits.append(f"{meta['turns']} žingsn.")
    if meta.get("elapsed"):
        bits.append(f"{meta['elapsed']:.0f}s")
    if meta.get("cost"):
        bits.append(f"${meta['cost']:.3f}")
    if meta.get("denials"):
        bits.append(f"{meta['denials']} atmesti leidimai")
    return f"-# {' · '.join(bits)}" if bits else None


HELP = """**CraftControl botas — Claude Code ant CT102**

Rašykite bet ką laisvu tekstu ir tai bus perduota Claude su pilnomis teisėmis
repozitorijoje `/opt/craftcontrol`. Pokalbis tęsiasi — kontekstas išsaugomas
šiam kanalui.

**Komandos**
`!help` — ši žinutė
`!new` — pradėti naują pokalbį (išvalo kontekstą)
`!status` — sesijos būsena
`!stop` — nutraukti vykdomą darbą

⚠️ Komandos vykdomos root teisėmis. Leidžiama tik iš allowlist'o."""


# ──────────────────────────────────────────────────────────────────────────────
# Bot
# ──────────────────────────────────────────────────────────────────────────────

class Bot:
    def __init__(self, cfg):
        self.cfg = cfg
        self.state = State(cfg.state_file)
        self.api = Discord(cfg.token)
        self.runner = ClaudeRunner(cfg, self.state)
        self.me_id = None
        self.started = time.time()

    # ── outbound ──────────────────────────────────────────────────────────────
    def reply(self, channel_id, text, meta=None):
        parts = chunk(text)
        for part in parts:
            self.api.send(channel_id, part)
        tail = footer(meta)
        if tail:
            self.api.send(channel_id, tail)

    # ── authorization ─────────────────────────────────────────────────────────
    def authorized(self, author_id):
        """Who may command the bot.

        In channel mode the message already reached us from a watched channel, so
        being able to post there is the credential. An allowlist, if one is also
        configured, still wins — it lets you narrow a shared channel down to a few
        operators without changing the channel's own permissions.
        """
        if self.cfg.allowed_users:
            return author_id in self.cfg.allowed_users
        return self.cfg.auth_mode == "channel"

    # ── inbound ───────────────────────────────────────────────────────────────
    def handle(self, msg):
        channel_id = msg["channel_id"]
        author = msg.get("author") or {}
        author_id = str(author.get("id", ""))
        content = (msg.get("content") or "").strip()

        # Never take orders from other software. In channel mode especially, a
        # webhook or another integration posting into the channel would otherwise
        # be treated as a trusted member.
        if author.get("bot") or author_id == self.me_id or msg.get("webhook_id"):
            return
        # Only real messages and replies; ignore joins, pins, boosts and friends.
        if msg.get("type") not in (0, 19):
            return
        if not content:
            return

        if not self.authorized(author_id):
            logging.warning("DENIED %s (%s) in %s: %.120s",
                            author.get("username"), author_id, channel_id, content)
            self.api.react(channel_id, msg["id"], "⛔")
            return

        logging.info("ACCEPT %s (%s) in %s: %.200s",
                     author.get("username"), author_id, channel_id, content)

        low = content.lower()
        if low in ("!help", "!h"):
            self.reply(channel_id, HELP)
            return
        if low == "!new":
            self.state.drop("sessions", channel_id)
            self.reply(channel_id, "🆕 Kontekstas išvalytas — pradedam iš naujo.")
            return
        if low == "!status":
            session = self.state.get("sessions", channel_id)
            up = time.time() - self.started
            who = (f"allowlist ({len(self.cfg.allowed_users)} vart.)"
                   if self.cfg.allowed_users else "visi šio kanalo nariai")
            self.reply(
                channel_id,
                f"**Būsena**\n"
                f"Sesija: `{session or 'nauja'}`\n"
                f"Užimtas: {'taip' if self.runner.busy() else 'ne'}\n"
                f"Veikia: {up/3600:.1f} h\n"
                f"Katalogas: `{self.cfg.workdir}`\n"
                f"Kam leidžiama: {who}")
            return
        if low == "!stop":
            self.reply(channel_id,
                       "🛑 Nutraukiu." if self.runner.stop() else "Nieko nevykdoma.")
            return

        # Everything else goes to Claude. Reject rather than queue, so the person
        # knows their request is not silently waiting behind a long-running job.
        if not self.runner.lock.acquire(blocking=False):
            self.api.react(channel_id, msg["id"], "⏳")
            self.reply(channel_id,
                       "⏳ Šiuo metu vykdau kitą darbą. Palaukite arba `!stop`.")
            return

        threading.Thread(target=self._work, args=(channel_id, msg, content),
                         daemon=True).start()

    def _work(self, channel_id, msg, content):
        stop_typing = threading.Event()

        def keep_typing():
            while not stop_typing.wait(8):
                self.api.typing(channel_id)

        typer = threading.Thread(target=keep_typing, daemon=True)
        try:
            self.api.react(channel_id, msg["id"], "👀")
            self.api.typing(channel_id)
            typer.start()
            text, meta = self.runner.run(channel_id, content)
            self.reply(channel_id, text, meta)
        except Exception as e:
            logging.exception("Job failed")
            try:
                self.reply(channel_id, f"💥 Klaida: {e}")
            except Exception:
                pass
        finally:
            stop_typing.set()
            self.runner.lock.release()

    # ── main loop ─────────────────────────────────────────────────────────────
    def poll_once(self):
        for channel_id in self.cfg.channels:
            after = self.state.get("last_seen", channel_id)
            try:
                messages = self.api.fetch_messages(channel_id, after)
            except Exception as e:
                logging.warning("Poll failed for channel %s: %s", channel_id, e)
                continue

            if after is None:
                # First run for this channel: adopt the newest id as the cursor so a
                # fresh install does not replay and execute the whole backlog.
                if messages:
                    self.state.set("last_seen", channel_id, messages[-1]["id"])
                else:
                    self.state.set("last_seen", channel_id, "0")
                continue

            for msg in messages:
                self.state.set("last_seen", channel_id, msg["id"])
                try:
                    self.handle(msg)
                except Exception:
                    logging.exception("Failed handling message %s", msg.get("id"))

    def run_forever(self):
        me = self.api.me()
        self.me_id = str(me["id"])
        logging.info("Connected as %s#%s (%s)", me.get("username"),
                     me.get("discriminator"), self.me_id)
        logging.info("Watching channels: %s", ", ".join(self.cfg.channels))
        if self.cfg.allowed_users:
            logging.info("Auth: allowlist — %s", ", ".join(sorted(self.cfg.allowed_users)))
        else:
            logging.warning(
                "Auth: channel membership — EVERY human who can post in the watched "
                "channel(s) can run root-level commands on this host")

        while True:
            try:
                self.poll_once()
            except Exception:
                logging.exception("Poll cycle failed")
            time.sleep(self.cfg.poll)


def main():
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(message)s",
        stream=sys.stdout)

    cfg = Config()
    problems = cfg.problems()
    if problems:
        for p in problems:
            logging.error("Config: %s", p)
        sys.exit(1)

    Bot(cfg).run_forever()


if __name__ == "__main__":
    main()
