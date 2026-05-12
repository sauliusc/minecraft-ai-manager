# ⚔️ CraftControl — Teen Engagement Platform
## Product Design & Feature Documentation

**Audience:** Players aged 12–16 (core focus: 14-year-olds)
**Document Type:** Product Owner Feature Specification
**Version:** 2.0.0
**Status:** Design Phase

---

> **Design Philosophy:** 14-year-olds want to feel *powerful*, *recognized*, and *part of something*. Every feature in this platform is designed around three psychological hooks:
> 1. **Status** — players want others to see how good they are
> 2. **Belonging** — players want a crew, a clan, an identity
> 3. **Surprise** — unpredictable rewards are more exciting than predictable ones

---

## Table of Contents

1. [Part 1 — Web Admin Panel](#part-1--web-admin-panel)
2. [Part 2 — Minecraft Plugin System](#part-2--minecraft-plugin-system)
3. [Part 3 — In-Game Minecraft Features](#part-3--in-game-minecraft-features)
4. [Part 4 — Engagement Systems (Cross-Platform)](#part-4--engagement-systems-cross-platform)
5. [Part 5 — Economy & Progression Design](#part-5--economy--progression-design)
6. [Part 6 — Social & Community Features](#part-6--social--community-features)
7. [Part 7 — Safety & Moderation for Teen Players](#part-7--safety--moderation-for-teen-players)

---

# Part 1 — Web Admin Panel

The Web Admin Panel is the nerve center for server administrators. It gives full control over every player-facing system without requiring direct access to the Minecraft server console.

---

## 1.1 Dashboard Home

**Purpose:** Instant situational awareness at a glance.

**Features:**
- **Live Server Stats:** Current player count, TPS (ticks per second), RAM usage, uptime — all refreshed every 5 seconds without page reload.
- **Today's Activity Feed:** Real-time log of notable events: first joins, challenge completions, clan wars started, boss event outcomes.
- **Engagement Score Widget:** A daily composite score (0–100) calculated from active players / registered players ratio, challenge completion rate, and reward claim rate. Helps admins see if engagement is dropping before players actually leave.
- **Hype Meter:** Visual indicator showing how excited the playerbase is, calculated from recent chat activity, events completed in the last hour, and concurrent player peaks. When the Hype Meter is low, the admin gets a prompt: *"Players seem quiet — launch a Surprise Event?"*
- **Pending Admin Actions:** Notifications for unreviewed reports, pending reward approvals, upcoming scheduled events.

---

## 1.2 Player Management

**Purpose:** Know your players individually, not just as usernames.

**Features:**

### Player Profile View
Each player has a rich profile page showing:
- Username, UUID, join date, total playtime.
- **Engagement Tier** label (New, Regular, Veteran, Legend) calculated automatically based on playtime + activity.
- Full history: challenges attempted/completed, rewards received, clans joined, punishments, chat highlights.
- **Custom Admin Notes:** Internal sticky notes visible only to admins, e.g. *"This player won the Halloween event — give them something special next season."*

### Player Search & Filters
- Search by username, UUID, or IP.
- Filter by engagement tier, clan membership, online status, last seen date.
- Sort by playtime, XP, rank, challenge completion rate.

### Manual Actions from Profile
- **Grant Reward:** Choose any reward template and deliver it immediately or schedule it for the player's next login.
- **Send Private Message:** Push a custom in-game message directly to the player's screen (title, subtitle, actionbar, or chat).
- **Assign Special Challenge:** Give a player a one-off custom challenge not in the public pool.
- **Award Title/Badge:** Manually grant cosmetic titles like `[Dragon Slayer]` or `[Event Winner]`.
- **Reset/Adjust Progress:** Edit any challenge progress counter for a player (used for fixing glitches or compensating for bugs).

---

## 1.3 Challenge Studio

**Purpose:** Create, schedule, and manage the full library of player challenges.

**Challenge Types Available:**
| Type | Description |
|---|---|
| `Combat` | Kill specific mobs or PvP targets |
| `Builder` | Place specific blocks or build structures |
| `Explorer` | Discover biomes or reach coordinates |
| `Collector` | Gather specific items |
| `Crafter` | Craft specific items |
| `Streak` | Log in X days in a row |
| `Social` | Recruit a friend, start a clan, trade with players |
| `Mystery` | Hidden objective revealed only after partial progress |
| `Timed` | Complete objective within a time window |
| `Collaborative` | Entire server works together toward one global goal |
| `Custom / Freeform` | Admin writes the description; completion marked manually |

**Challenge Builder UI:**
- Form-based editor: title, description, type, target values, start/end dates.
- **Audience Selector:** Assign to All Players / Specific Tier / Specific Clan / Hand-picked UUIDs.
- **Difficulty Rating:** 1–5 stars (displayed in-game to players so they know what they're signing up for).
- **Repeat Settings:** One-time / Daily / Weekly / Seasonal.
- **Linked Reward:** Attach a reward template directly so completion auto-delivers.
- **Preview Panel:** See exactly what the challenge will look like to a player in-game before publishing.

**Challenge Schedule Calendar:**
- Monthly calendar view of all active and upcoming challenges.
- Drag-and-drop rescheduling.
- Color-coded by type (combat = red, social = blue, builder = green, etc.).
- Conflict detection: warns if too many hard challenges overlap, preventing player burnout.

---

## 1.4 Reward Forge

**Purpose:** Build and manage every reward in the game.

**Reward Types:**
| Type | What It Does |
|---|---|
| `Item Bundle` | Delivers physical in-game items to inventory |
| `XP Blast` | Grants server XP (used for rank progression) |
| `Currency` | Adds coins/tokens to player wallet |
| `Cosmetic` | Unlocks particle effects, titles, or pets |
| `Mystery Box` | Delivers a random reward from a weighted pool |
| `VIP Access` | Grants temporary access to VIP-only areas or commands |
| `Server Shoutout` | Broadcasts a congratulations message to all online players |
| `Custom Command` | Runs any console command (e.g., give a specific NBT item) |

**Reward Template Editor:**
- Name, icon (choose from Minecraft material list), description.
- For Mystery Boxes: add multiple possible rewards with percentage weights that must sum to 100%.
- **Rarity Tag:** Common / Rare / Epic / Legendary — displayed with colored borders in-game.
- **Delivery Settings:** Immediate / On Next Login / Scheduled Date.
- **Expiry:** Rewards can expire if unclaimed within N days (prevents reward hoarding exploits).

---

## 1.5 Event Command Center

**Purpose:** Run limited-time events that spike server excitement.

**Event Types (detailed in Part 4):**
- Boss Raid Event
- Treasure Hunt
- Build Battle
- Clan War
- Double XP Weekend
- Mystery Drop Hour
- Server-wide Story Event

**Event Control Panel:**
- Launch, pause, or end any event with one click.
- Set start/end time with automatic in-game countdown announcements.
- Set eligibility (all players / minimum playtime / specific clan).
- Configure prizes for 1st, 2nd, 3rd place and participation.
- **Live Leaderboard View:** Watch event standings update in real time on the admin panel.

---

## 1.6 Broadcast & Communication Center

**Purpose:** Talk to your playerbase at the right time in the right way.

**Features:**

### Broadcast Builder
- Write a message once, choose delivery channels: in-game chat, title screen, actionbar, Discord webhook, or all of them simultaneously.
- Supports MiniMessage formatting with a live preview.
- **Emoji & Icon Picker:** Inserts Minecraft-compatible symbols (❤️ ⚔️ 🌟) into broadcasts.
- Schedule broadcasts in advance (e.g., schedule a hype announcement 10 minutes before an event starts).

### Automated Message Triggers
- **Daily Login Message:** Custom message shown to every player when they log in, changed per day.
- **Milestone Announcements:** Auto-broadcast when server reaches X players, or a player reaches a major rank.
- **Low Activity Alert Messages:** If player count drops below threshold, auto-fire a "Come back!" Discord post or push notification.

### Player Segmented Messaging
- Send targeted messages to specific groups: new players, clan leaders, players who haven't logged in for 3 days, etc.

---

## 1.7 Economy & Shop Manager

**Purpose:** Control the server's currency and what players can buy with it.

**Features:**
- Set earn rates for all currency sources (challenge reward, mob kill, voting, daily login).
- Set prices for all shop items.
- View economy health metrics: average player balance, inflation rate, daily transactions.
- **Balance Intervention:** Manually give or deduct currency from any player with an audit log reason.
- **Sale Events:** Set a temporary discount percentage on shop categories (e.g., 50% off cosmetics this weekend).

---

## 1.8 Analytics & Insights

**Purpose:** Make decisions with data, not guesses.

**Dashboards:**

### Player Retention Dashboard
- Daily, weekly, monthly active users.
- New player funnel: joined → first challenge → first reward → clan join → day 7 return rate.
- Churn prediction: flags players whose login frequency is dropping.

### Engagement Heatmap
- Hour-by-hour breakdown of when your players are online (identifies peak hours for scheduling events).

### Challenge Performance Dashboard
- For each challenge: attempt rate, completion rate, average time to complete, abandonment point.
- Identifies challenges that are too hard (low completion rate) or too easy (instant completion).

### Economy Dashboard
- Currency flow: how much is being earned vs. spent per day.
- Top earners, top spenders.
- Most popular shop items.

---

## 1.9 Moderation Panel

**Purpose:** Keep the server safe and fun for a teenage audience.

**Features:**
- Player report queue with in-game screenshot evidence (auto-captured by plugin on report).
- Chat log viewer with word-search and player filter.
- Mute, kick, ban with duration and reason, logged permanently.
- **Teen-Safe Blocklist:** Auto-moderation word filter configured specifically for teen communities (slurs, excessive profanity, grooming red flags), configurable by admin.
- **Escalation Flags:** Automatically escalates to Super Admin if the same player is reported 3+ times in 24 hours.

---

# Part 2 — Minecraft Plugin System

All plugins are written in Java for Paper 1.21.x. They communicate with the web backend through the BridgePlugin and share a common event bus.

---

## 2.1 GreeterPlugin — First Impressions Engine

**Goal:** Make every new player feel individually welcomed within the first 60 seconds of joining.

### First-Join Sequence (step by step)
1. Detect UUID is new (never seen before in DB).
2. Play a **custom join sound** (configurable, default: fireworks + bell).
3. Display a **full-screen title sequence**: `"WELCOME TO THE SERVER"` (configurable text) with the player's name in gold.
4. Teleport player to a **Welcome Zone** — a specially designed area separate from spawn, just for new arrivals.
5. Trigger an **NPC Guide** (see Part 3) that walks them through the first 3 minutes.
6. Open an **animated Book UI** — an in-game book that introduces the server: rules, key features, how challenges work, how to join a clan.
7. Give **Starter Kit** (configurable items).
8. After they close the book, play a **firework display** above the Welcome Zone.
9. Send a **server-wide announcement** (toggleable): *"🎉 [PlayerName] just joined for the first time! Welcome them!"*
10. POST player record to web API and start their engagement tracking.

### Returning Player Sequence
- Players returning after 7+ days get a smaller welcome-back sequence (custom title, a small "we missed you" gift).
- Players logging in for their daily streak get a streak reminder in actionbar.

### Configurable Behavior
- All messages, sounds, items, and coordinates are configurable in `config.yml`.
- The admin can A/B test two different welcome messages by assigning them randomly (50/50) and seeing which leads to better day-7 retention in the analytics panel.

---

## 2.2 QuestPlugin — Challenge & Mission Engine

**Goal:** Give players a constant sense of purpose and direction.

### Quest Categories

#### Daily Quests
- 3 new quests every day at midnight (server time).
- Mix of easy (5 min), medium (30 min), hard (2 hours).
- Completing all 3 gives a **Daily Completion Bonus** on top of individual rewards.

#### Weekly Quests
- 1 big "Story Quest" released every Monday.
- Multi-stage: the quest has 3–5 steps that must be completed in order.
- Tells a piece of server lore (e.g., "A dragon has stolen the mayor's treasure — find the three clues").
- Completing gives a **Weekly Badge** (permanent cosmetic title).

#### Side Quests
- Permanent pool of 50+ side quests that never expire.
- Players pick them up from NPCs around the world (see Part 3).
- Range from trivial (mine 10 wood) to epic (defeat the End Dragon without armor).

#### Clan Quests
- Quests only available to clans (see Section 6.1).
- Require multiple clan members to contribute (e.g., "Clan must collectively mine 10,000 blocks this week").
- Reward goes to all active clan members.

#### Mystery Quests
- The objective is initially hidden: *"Something happened in the Dark Forest. Investigate."*
- Players discover what they need to do by exploring or talking to NPCs.
- These are the most talked-about quests and drive in-game social discussion.

### Quest UI
- `/quests` opens a custom inventory GUI: slots organized by category, each slot is an item with color-coded border (Common = white, Rare = blue, Epic = purple, Legendary = gold), lore text shows description and progress.
- Quest progress displayed in actionbar during relevant activity.
- Notification (title + sound) on completion.

### Quest Tracking (Technical)
- All game events (block break, mob kill, craft, move, trade, etc.) are monitored by a lightweight event router.
- Progress is buffered locally for 30 seconds, then batch-synced to the API (avoids hammering the DB on every block break).

---

## 2.3 RewardPlugin — Delivery Engine

**Goal:** Make reward delivery feel *exciting*, not transactional.

### Delivery Theatrics
When a reward is granted, the delivery is never silent:
- **Sound effect** plays (varies by rarity: coin clink for Common, magical harp for Legendary).
- **Particle effect** bursts from the player's position.
- **Chat message** in the player's personal chat with a stylized reward card.
- **For Legendary rewards:** Full title screen animation + server-wide broadcast.

### Offline Reward Queue
- Rewards earned while offline are held in a queue.
- On next login, a "You have X unclaimed rewards!" notification appears.
- `/rewards` command opens a UI to claim them one by one (each claim shows the theatrics).

### Reward Types (with implementation detail)

#### Mystery Box
- Reward contains a weighted loot table.
- When claimed, plays a **spin animation** using a chest GUI: items cycle rapidly through slots before landing on the prize (3-second animation, creates the "slot machine" feeling).
- The weighted rarity is shown: "15% chance of Epic, 2% chance of Legendary."

#### Cosmetic Unlocks
- Granted cosmetics are registered in the player's cosmetics profile.
- Player opens `/cosmetics` to equip/unequip them.
- Stored per-player in DB, persists across sessions.

---

## 2.4 ClanPlugin — Social Backbone

**Goal:** Make players want to recruit their friends.

### Features
- `/clan create <name>` — creates a clan (costs currency as anti-spam).
- Clan has a tag displayed before username in chat: `[VOID] PlayerName`.
- Clan home (`/clan home`) — a shared teleport point.
- Clan chest — a shared storage visible to all members.
- Clan chat — private channel for members only.
- Clan XP — accumulated through clan quests, levels up the clan (higher-level clans unlock perks).
- Clan war — challenge another clan to a competitive event (see Part 4.4).
- Clan of the Week — featured on the web leaderboard and in-game spawn billboard.

---

## 2.5 StreakPlugin — Daily Habit Builder

**Goal:** Make logging in every day feel rewarding, not obligatory.

### How It Works
- Each day a player logs in, their streak counter increments.
- Missing a day resets the streak to 0 (with a 24-hour grace window configurable in admin panel).
- Streak milestones unlock escalating rewards:

| Streak Day | Reward |
|---|---|
| Day 1 | 50 Coins + "Welcome Back" title |
| Day 3 | 150 Coins + a Common Mystery Box |
| Day 7 | 500 Coins + a Rare cosmetic |
| Day 14 | 1,500 Coins + an Epic Mystery Box |
| Day 30 | Custom "Devoted" title + Legendary reward + server shoutout |
| Day 60 | Permanent "Veteran" badge + exclusive in-game item |

### Streak Protection
- Players can earn "Streak Shield" items from events that protect their streak for 1 missed day.
- Shields can't be bought — only earned — to preserve the value of high streaks.

---

## 2.6 CosmeticsPlugin — Identity Engine

**Goal:** Let players express who they are. Status symbols drive engagement.

### Cosmetic Categories

#### Titles
- Short prefix or suffix shown in chat and on the scoreboard.
- Examples: `[Blaze Master]`, `[Dragon Tamer]`, `[Event King]`, `🌟 Legend`.
- Earned through challenges, events, streaks, or admin grants.

#### Chat Colors
- Players can unlock colored usernames in chat.
- Rare colors (gradient names, rainbow cycling) are Legendary-tier cosmetics.

#### Particle Effects
- Active around the player at all times.
- Examples: floating fire embers, snowflakes, golden sparkles, lightning crackling at feet.
- Configurable intensity to prevent performance issues (auto-reduced in areas with 10+ players).

#### Pets
- Small mobs that follow the player (baby zombie, cat, parrot, phantom, etc.).
- Each pet has a custom name assigned by the player.
- Rare pets (custom-textured via resource pack): baby dragon, glowing fox, mini wither.
- Pets can "level up" when the player completes challenges (visual changes per level).

#### Trails
- Leave colored particles behind as you walk.
- Examples: flame trail, flower trail, lightning trail, rainbow trail.

#### Kill Effects (PvP servers only)
- Custom particle burst when player eliminates another player.
- Examples: explosion of coins, firework burst, lightning strike.

---

## 2.7 EconomyPlugin — Coin & Token System

**Goal:** Give players something to work toward spending.

### Two-Currency System

#### Coins (soft currency)
- Earned easily through: quests, daily login, mob kills, player-to-player trading.
- Spent in the basic shop: common items, basic cosmetics, clan creation.

#### Crystals (premium currency, earned in-game only — no real money)
- Rare, earned through: weekly quest completion, event prizes, streak milestones, server voting.
- Spent in the premium shop: Legendary cosmetics, exclusive pets, VIP perks.
- Cannot be traded between players (anti-economy abuse).

### Player Shop
- Players can list items for sale using `/market`.
- Other players browse and buy with Coins.
- Admin can see all market listings in the web panel and remove exploitative listings.

---

# Part 3 — In-Game Minecraft Features

These are the actual Minecraft world features that players interact with directly.

---

## 3.1 Welcome Zone — The Island of Beginnings

**What it is:** A beautiful, purpose-built island area where new players spawn for their first 10 minutes.

**Design goals:**
- Visually stunning — immediately tells the player "this is a special server."
- Not overwhelming — only shows new players what they need in their first session.
- Naturally funnels toward key choices: pick your first quest, find a clan recruiter NPC, head to the main world.

**Key Areas in the Welcome Zone:**

### The Landing Pad
- Where players teleport to on first join.
- Surrounded by animated particles (pink/gold sparkles falling from sky).
- Giant glowing sign: "YOU MADE IT."
- Arrow on the ground pointing forward.

### The Lore Gate
- A dramatic entrance arch built from custom blocks.
- Two NPC guards on either side (see 3.2).
- Stepping through triggers a brief lore narration (displayed as subtitle text over 10 seconds).

### The Notice Board
- Physical Minecraft structure (boards with item frames).
- Shows the 3 current daily quests using item frames with written books.
- Updates automatically via the plugin every midnight.

### Starter Village
- Small village with NPCs representing each game system.
- Quest Master NPC → open quest UI.
- Clan Recruiter NPC → explain clans, let player create or join one.
- Shop Keeper NPC → show the in-game shop.
- Arena Guide NPC → explain events and competitions.
- Cosmetics Vendor NPC → show cosmetics they can earn.

---

## 3.2 NPC Guide System

**What it is:** Custom NPCs (using Citizens2 or custom implementation) that drive narrative and tutorialization.

### Guide NPCs
Each guide NPC is configured in the admin panel with:
- Skin (Steve skin or custom URL).
- Name + title (displayed above their head with color).
- Dialogue lines (scrolled through with a right-click conversation UI).
- Optional quest assignment (talking to NPC gives a quest).
- Optional shop (talking to NPC opens a shop GUI).

### Dynamic Dialogue
- NPCs recognize returning players: *"Oh, [Name]! You're back! Have you tried the new weekly quest yet?"*
- NPCs react to server events: *"Can you feel that? Something is stirring in the Dark Mountains…"* (during an active boss event).
- Dialogue lines are editable from the web admin panel without restarting the server.

### Quest Giver NPCs
- Scattered around the world in logical locations (e.g., a Mining Foreman NPC near a mine gives mining quests, a Farmer NPC gives farming quests).
- Players right-click to open a quest board UI showing available quests from that NPC.
- NPCs have relationship meters — the more quests you complete for them, the more exclusive quests they unlock.

---

## 3.3 Holographic Displays

**What it is:** Floating text in the world (using DecentHolograms or custom implementation).

**Uses:**
- **Leaderboard Pillars:** Physical structures in the hub with floating top-10 lists (most XP, best streak, most challenges completed). Updates live.
- **Challenge Boards:** Floating display above the Notice Board showing current challenges and completion percentages.
- **Event Countdown:** Floating countdown timer near the Arena entrance.
- **Clan Territory Markers:** At the border of clan-claimed land, show the clan name and level.
- **Reward Pedestals:** Floating preview of the week's featured reward, spinning above a decorative pedestal.

---

## 3.4 Boss Event Arenas

**What it is:** Special physical arenas in the Minecraft world used for server boss events (see Part 4.1).

**Arena Features:**
- Custom-built circular or rectangular arena with tiered spectator seating.
- Pressure plates at the entrance gate (detects players entering/leaving).
- Decorative lava falls, banners, and torch lighting for atmosphere.
- A **Boss Pedestal** in the center — custom block structure where the boss spawns.
- Scoreboard on the side wall (holographic) showing damage dealt by each participant.
- When the boss dies: fireworks launch from 8 configured positions around the arena, particle explosions, custom sound.

---

## 3.5 Scoreboard Sidebar

**What it is:** Persistent sidebar on the right side of every player's screen (standard Bukkit scoreboard).

**Displayed Information (changes based on context):**
```
━━━ ✦ SERVER NAME ✦ ━━━
👤 PlayerName
⭐ Rank: Veteran
💰 Coins: 1,420
🔮 Crystals: 32
━━━━━━━━━━━━━━
📋 Daily Quests: 2/3 done
🔥 Streak: 14 days
━━━━━━━━━━━━━━
🏰 Clan: [VOID] Lv.5
━━━━━━━━━━━━━━
🌍 play.yourserver.net
```

- Updates every 2 seconds (not every tick — performance-safe).
- Switches to event scoreboard during active events (shows event-specific info like boss HP or event score).
- Colors and layout configurable from admin panel.

---

## 3.6 Custom Item System

**What it is:** Special named and lore-tagged items with unique behaviors triggered by plugin.

**Examples:**

### Mystery Compass
- Reward item used in Treasure Hunt events.
- When held, actionbar shows direction and rough distance to nearest treasure.
- Pulses with particles when player is within 10 blocks of treasure.

### Clan Banner
- Placeable decorative item with clan name and color.
- Admins create a new clan banner automatically when a clan is created.
- Can only be placed in clan territory.

### Quest Tokens
- Physical items dropped by specific mobs or found in specific chests.
- Collected and turned in to NPCs to advance quests.
- Have unique textures via resource pack (requires resource pack delivery on login).

### Power-Up Items
- Time-limited items earned from events and mystery boxes.
- Examples: **Speed Crystal** (3 minutes of Speed III), **Miner's Luck** (30 minutes of Fortune III on held pickaxe), **Shield of Glory** (absorb one death without penalty).

---

## 3.7 Resource Pack Integration

**What it is:** Auto-delivered resource pack that enhances visual identity.

**Includes:**
- Custom textures for Quest Token items (so they look unique, not like default Minecraft items).
- Custom sounds: welcome chime, reward fanfare, quest complete jingle, mystery box spin sound.
- Custom UI textures for inventory GUIs (makes plugin menus look designed, not default grey).
- Custom font that appears in titles and specific chat messages.

**Technical:** Pack is hosted on a CDN (or GitHub Releases). Server auto-prompts players to accept on first join. Players who decline still play normally — pack features degrade gracefully.

---

# Part 4 — Engagement Systems (Cross-Platform)

These systems span both the plugin side and the web admin side to create server-wide moments that all players experience together.

---

## 4.1 Boss Raid Events

**What it is:** A timed server-wide event where all players fight a custom boss together.

**Flow:**
1. Admin schedules event in web panel (sets day, time, duration, boss name, loot table).
2. 30 minutes before: in-game announcement starts; holographic countdown appears at arena entrance.
3. 10 minutes before: loud horn sound plays server-wide; actionbar shows "THE RAID BEGINS IN 10 MINUTES."
4. Event starts: a custom-named, custom-attribute boss spawns on the arena pedestal. Boss has configurable HP scaling (multiplied by number of participants so it's always a fair fight).
5. Boss has phases: at 75%, 50%, and 25% HP, it changes behavior (speed boost, new attack pattern, spawns minions).
6. Players deal damage; a holographic damage leaderboard above the arena updates live.
7. Boss is defeated: explosion sequence, server-wide fireworks, reward delivery.
8. Loot distributed: Top 3 damage dealers get tiered prizes. All participants get a participation reward.
9. Web panel shows post-event report: participants, top damage dealers, time to kill.

---

## 4.2 Treasure Hunt Events

**What it is:** Hidden chests containing loot are placed around the world and players race to find them.

**Flow:**
1. Admin uses web panel to place N chests at specific world coordinates (or uses random scatter in a configured region).
2. Treasure Hunt starts: players receive a **Mystery Compass** item (see 3.6).
3. Compass guides players toward the nearest remaining treasure.
4. Each chest found gives loot and removes that chest from the world.
5. Event ends when all chests are found or time runs out.
6. Leaderboard: most treasures found wins a top prize.

**Design detail for 14-year-olds:** The moment of finding a chest is designed for maximum excitement — particles, sound, title on screen, chat broadcast to server: *"⚡ [PlayerName] found a treasure! 4 remain!"* This drives FOMO and makes active finders feel celebrated.

---

## 4.3 Build Battle Events

**What it is:** Competitive building with a random theme, judged by admin or by player vote.

**Flow:**
1. Admin launches Build Battle from web panel: sets theme (e.g., "A volcano," "A spaceship," "Your hometown"), duration (15–60 min), plot size.
2. Players who opt in are teleported to pre-built build plots (flat platforms separated by walls).
3. Everyone gets the same materials (configurable in web panel).
4. Timer appears on scoreboard. Players build.
5. Time up: building phase ends, blocks auto-freeze (plugin denies further block placement).
6. **Voting phase:** Players are teleported to each build one at a time and vote using a GUI (give it 1–5 stars).
7. Results calculated, announced server-wide, top 3 receive prizes.
8. Screenshots (via map item renders) stored in web panel for admin to browse.

---

## 4.4 Clan Wars

**What it is:** Two clans challenge each other to a structured competition.

**Types of Clan War:**
- **Territory Control:** Both clans compete to hold a neutral zone for the longest cumulative time over 24 hours.
- **Resource Race:** First clan to collectively gather X of a specific resource wins.
- **Kill Count:** PvP event in a designated arena, most clan kills after 30 minutes wins.

**Challenge Mechanic:**
- Clan Leader uses `/clan war challenge <ClanName>` — the other clan leader gets a GUI prompt to accept or decline.
- Both clans see a countdown until the war begins.
- War results (win/loss record) displayed on clan profiles in the web panel.
- Winning clan gets Clan XP, a "War Victory" banner cosmetic, and bragging rights on the spawn leaderboard.

---

## 4.5 Double XP & Drop Rate Weekends

**What it is:** Scheduled multiplier events that boost all rewards for a window of time.

**Admin configuration:**
- Choose what is multiplied: XP, Coins, item drop rate, or all three.
- Set multiplier (1.5x, 2x, 3x).
- Set duration.
- Automated announcements build hype in the 24 hours before.

**Design note:** These events are the server's equivalent of a sale — they reliably spike player logins. Schedule them for Friday nights to capture the teen after-school peak.

---

## 4.6 Server-Wide Story Events

**What it is:** Seasonal multi-week narrative events where the entire server participates in an unfolding story.

**Example — "The Dragon King Returns" (2-week event):**
- **Week 1:** Strange signs appear in the world (custom blocks placed by admin, cryptic NPCs added). Daily clue quests drop lore fragments.
- **Week 2:** Lore fragments collected by all players collectively unlock the Boss Raid finale. Players who contributed the most lore fragments get featured in a "Heroes" holographic list at spawn.

**Admin tools for Story Events:**
- Story Event editor in web panel: define chapters (each is a timed trigger + world change + announcement).
- World changes triggered via web panel: add/remove custom structures, spawn/despawn NPCs, change hologram text.
- "Chapter Progress" tracking: percentage of players who have completed each chapter (helps admin decide if a chapter needs to be easier).

---

## 4.7 Voting Rewards System

**What it is:** Players vote for the server on Minecraft server listing sites (like Planet Minecraft), and receive in-game rewards.

**Flow:**
- Player uses `/vote` to get a list of voting links.
- After voting on a site, the plugin receives a webhook and immediately notifies the player in-game: *"Thanks for voting! You earned: 100 Coins + 1 Rare Mystery Box."*
- **Vote Streak:** Voting every day gives escalating bonuses (mirrors the login streak system).
- **Server-wide vote milestone:** When the server hits 100 votes in a week, everyone online gets a small bonus, and a banner is placed at spawn: "We reached 100 votes this week!"

---

# Part 5 — Economy & Progression Design

---

## 5.1 XP & Rank Progression System

**Goal:** Give players a visible status ladder that takes months to climb.

### Rank Tiers

| Rank | XP Required | Perks Unlocked |
|---|---|---|
| 🪨 Newcomer | 0 | Basic commands |
| ⚔️ Adventurer | 1,000 | Access to Side Quests, colored name |
| 🛡️ Knight | 5,000 | Create a clan, access to weekly quests |
| 🔥 Champion | 15,000 | Access to Clan Wars, exclusive cosmetic slot |
| 🌟 Veteran | 35,000 | VIP area access, 10% Coin earn bonus |
| 👑 Legend | 75,000 | Custom title of choice, permanent particle |
| ⚡ Mythic | 150,000 | Reserved for top ~10 players, displayed on global leaderboard billboard at spawn |

### XP Sources
- Completing daily quests: 50–300 XP.
- Completing weekly quests: 500–1,500 XP.
- Participating in events: 100–1,000 XP (more for placing higher).
- Login streak milestones: 250–2,000 XP.
- Helping new players (detected by plugin when a Newcomer-tier player is in proximity and types "thank you" to another player): 25 XP bonus.

---

## 5.2 Prestige System (Post-Legend)

For players who reach Legend and want more:
- **Prestige** resets their XP to 0 but grants a Roman numeral badge (Prestige I, II, III…).
- Prestige players re-climb the ranks but keep all cosmetics, clan membership, and Crystals.
- Prestige players have a special glow color on their name (configurable per prestige level).
- Maximum prestige: V. Prestige V players are permanent legends of the server.

---

# Part 6 — Social & Community Features

---

## 6.1 Friend System

- `/friend add <name>` — sends a friend request.
- Friends list shows online/offline status.
- Teleport to a friend's location (configurable cooldown and permission).
- Friend Activity Feed in-game: small actionbar message when a friend logs in or completes a challenge.
- Friends get a small Coin bonus when they are both online at the same time (encourages recruiting friends).

---

## 6.2 Player Shoutout System

- Players can spend Coins to send a server-wide shoutout.
- Shoutouts are moderated: flagged for admin approval if they contain any blocked words.
- Premium shoutouts (more Coins): appear in a stylized box format in chat instead of plain text, with a custom emoji border.
- Used for: celebrating achievements, recruiting clan members, announcing player-run events.

---

## 6.3 Player Profile Cards

- `/profile <name>` — shows a custom inventory GUI with another player's public profile.
- Shows: rank, clan, active title, current streak, total challenges completed, favorite quest type (calculated from history), pet.
- Players can leave a **Thumbs Up** on another player's profile (costs nothing, limited to 3 per day to each person).
- Players with the most Thumbs Up in a week get featured on the server's web leaderboard.

---

## 6.4 Mentorship System

- Veteran+ players can opt in as Mentors.
- When a Newcomer joins, if a Mentor is online, they're optionally matched (Mentor gets a notification: *"A new player just joined — want to be their guide? /mentor accept"*).
- Mentor walks with them, gets XP for each quest the mentee completes in their first 3 days.
- Mentee gets a "Has a Mentor" badge visible in their profile.
- This leverages teens' desire to be seen as knowledgeable and helpful.

---

# Part 7 — Safety & Moderation for Teen Players

All features are designed for a teenage audience, which means safety is a first-class concern — not an afterthought.

---

## 7.1 Chat Safety

- Profanity filter with configurable word lists, configurable escalation (warn → mute → tempban).
- Personal information detection: regex patterns flag messages that look like phone numbers, addresses, or social media handles (e.g., "add me on [platform]") and hold for admin review.
- Players under a configurable age threshold (if age is collected) see stricter filters.

## 7.2 Reporting System

- `/report <player> <reason>` — submits a report that appears in the web admin panel.
- Plugin auto-captures the last 50 chat lines at time of report as evidence.
- Reporter gets a confirmation and a case number: *"Report #142 submitted. Our team will review it."*
- Reporter receives a notification when their report is resolved: *"Report #142 has been reviewed. Action was taken."*

## 7.3 Block on Contact

- Players can `/block <name>` to stop receiving chat messages, PMs, or clan invites from a specific player.
- Block list stored server-side (persists across sessions, applies to all channels).

## 7.4 Safe Chat Mode

- Players can enable `/safechat` — filters all incoming chat from players not on their friends list.
- Designed for players who feel overwhelmed or targeted.

## 7.5 Admin Audit Trail

- Every admin action (ban, mute, reward grant, manual XP adjustment) is permanently logged in the web panel with timestamp, admin account, and reason.
- Audit log is immutable — no admin can delete entries.
- This protects the server from abuse-of-power accusations.

---

*This document is the full product specification for the CraftControl teen engagement platform. Each feature listed here represents a discrete deliverable for the development team. Priority order for implementation is: Part 2 plugins → Part 3 world features → Part 1 admin panel → Part 4 events → Parts 5, 6, and 7 in parallel.*

*Features should be playtested with actual 14-year-old players at the Champion rank stage of development, before full launch.*
