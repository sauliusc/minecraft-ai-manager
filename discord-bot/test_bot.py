#!/usr/bin/env python3
"""Offline checks for the Discord bridge — no token and no network required.

Run: python3 discord-bot/test_bot.py
"""

import os
import sys
import tempfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import craftcontrol_bot as bot  # noqa: E402

failures = []


def check(name, cond, detail=""):
    if cond:
        print(f"  ok   {name}")
    else:
        print(f"  FAIL {name} {detail}")
        failures.append(name)


print("chunk()")
check("short text stays one message", bot.chunk("labas") == ["labas"])
check("empty text never returns an empty list", bot.chunk("") == ["(tuščias atsakymas)"])

long_lines = "\n".join(f"line {i}" for i in range(500))
parts = bot.chunk(long_lines)
check("splits long text", len(parts) > 1)
check("every chunk fits Discord's limit",
      all(len(p) <= bot.MAX_DISCORD_CHARS for p in parts),
      f"max={max(len(p) for p in parts)}")
check("splitting loses no content",
      "".join(p.replace("\n", "") for p in parts) == long_lines.replace("\n", ""))

monster = "x" * 5000
mparts = bot.chunk(monster)
check("single oversized line is cut up",
      all(len(p) <= bot.MAX_DISCORD_CHARS for p in mparts) and len(mparts) >= 3)
check("oversized line keeps every character",
      "".join(mparts) == monster, f"{sum(len(p) for p in mparts)} vs {len(monster)}")

print("Config.problems()")
saved = dict(os.environ)
try:
    for key in ("DISCORD_BOT_TOKEN", "DISCORD_ALLOWED_USER_IDS", "DISCORD_CHANNEL_IDS"):
        os.environ.pop(key, None)
    probs = bot.Config().problems()
    check("empty config is rejected", len(probs) >= 3)
    check("empty allowlist is called out",
          any("ALLOWED_USER_IDS" in p for p in probs))

    # The dangerous case: token and channel set, allowlist forgotten. Must fail.
    os.environ["DISCORD_BOT_TOKEN"] = "x"
    os.environ["DISCORD_CHANNEL_IDS"] = "123"
    os.environ["DISCORD_ALLOWED_USER_IDS"] = ""
    probs = bot.Config().problems()
    check("fails closed when only the allowlist is missing",
          any("ALLOWED_USER_IDS" in p for p in probs))

    os.environ["DISCORD_ALLOWED_USER_IDS"] = " 111 , 222 ,, "
    cfg = bot.Config()
    check("allowlist is parsed and trimmed", cfg.allowed_users == {"111", "222"},
          str(cfg.allowed_users))

    # channel mode: empty allowlist is legitimate, but only when asked for
    os.environ["DISCORD_ALLOWED_USER_IDS"] = ""
    os.environ["DISCORD_AUTH_MODE"] = "channel"
    check("channel mode accepts an empty allowlist", bot.Config().problems() == [])

    os.environ["DISCORD_AUTH_MODE"] = "everyone"
    check("unknown auth mode is rejected",
          any("DISCORD_AUTH_MODE" in p for p in bot.Config().problems()))
    os.environ.pop("DISCORD_AUTH_MODE")
finally:
    os.environ.clear()
    os.environ.update(saved)

print("Bot.authorized()")


class _FakeCfg:
    def __init__(self, users, mode):
        self.allowed_users = set(users)
        self.auth_mode = mode


def _authorized(users, mode, who):
    b = bot.Bot.__new__(bot.Bot)          # skip __init__: no token, no state file
    b.cfg = _FakeCfg(users, mode)
    return bot.Bot.authorized(b, who)


check("allowlist mode lets a listed user through", _authorized(["111"], "allowlist", "111"))
check("allowlist mode blocks an unlisted user",
      not _authorized(["111"], "allowlist", "999"))
check("channel mode lets any member through", _authorized([], "channel", "999"))
check("channel mode still honours an allowlist when one is set",
      not _authorized(["111"], "channel", "999"),
      "an explicit allowlist must narrow a shared channel")
check("empty allowlist in allowlist mode authorizes nobody",
      not _authorized([], "allowlist", "999"))

print("State")
with tempfile.TemporaryDirectory() as d:
    path = os.path.join(d, "sub", "state.json")
    st = bot.State(path)
    st.set("sessions", "chan1", "abc")
    check("value round-trips", st.get("sessions", "chan1") == "abc")
    check("reload from disk keeps it", bot.State(path).get("sessions", "chan1") == "abc")
    st.drop("sessions", "chan1")
    check("drop removes it", bot.State(path).get("sessions", "chan1") is None)
    check("missing key returns None", st.get("sessions", "nope") is None)

print("footer()")
check("hides footer on error", bot.footer({"error": True}) is None)
check("shows turns and cost",
      "3 žingsn." in (bot.footer({"turns": 3, "cost": 0.5, "elapsed": 10}) or ""))

print()
if failures:
    print(f"FAILED: {len(failures)} -> {', '.join(failures)}")
    sys.exit(1)
print("All checks passed.")
