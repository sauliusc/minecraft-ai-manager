# AI Integration Specification
## Minecraft AI Manager — Engagement & Automation Layer

**Version**: 1.0  
**Status**: Partially implemented — see feature status below  
**Scope**: Backend AI services, no changes to existing Minecraft plugins required (bridge API is the integration point)

---

## 1. Overview

This document specifies five AI-powered features layered on top of the existing system. Each feature targets a distinct engagement problem visible in the current analytics data:

| Problem | Symptom | AI Feature | Status |
|---------|---------|------------|--------|
| Challenge repetition / staleness | >95% completion rate on easy challenges, low daily return rate | **Dynamic Challenge Generator** | ✅ Implemented |
| Players feel unheard by NPCs | Flat dialogue, no memory of interactions | **Contextual NPC Dialogue** | 🔲 Planned |
| Slow churn response | 2-week detection window is too late | **Predictive Engagement Alerts** | ✅ Implemented |
| Toxic chat uncaught by keyword filters | Escalated reports grow faster than moderation can process | **AI Chat Moderation** | ✅ Implemented |
| Rewards feel generic | High-tier players claim common rewards, churn anyway | **Personalised Reward Recommendations** | ✅ Implemented |

All five features call the Claude API (claude-sonnet-4-6 for generation, claude-haiku-4-5 for real-time inference) through a new `server/src/services/ai/` module. No Minecraft plugin changes are needed; all AI decisions surface through the existing bridge REST API.

---

## 2. Feature Specifications

---

### 2.1 Dynamic Challenge Generator

#### Purpose
Automatically generate fresh, contextually appropriate challenges on a schedule, replacing or supplementing the manual admin workflow.

#### How it works

A scheduled job (configurable cron, default: daily at 06:00 UTC) queries the analytics API for:
- Current challenge completion rates across all active challenges
- The 24×7 engagement heatmap to identify peak play hours
- Player tier distribution (New / Regular / Veteran / Legend)

It then calls the Claude API with a structured prompt containing:
- The Prisma `Challenge` schema (types, difficulty range, category, config shape)
- The analytics snapshot
- The last 30 days of challenge titles (to avoid duplication)
- Any admin-defined constraints (theme of the week, banned types)

Claude returns 3–5 JSON challenge objects ready to `POST /api/challenges`. A confidence score is included in the AI response; challenges below a configurable threshold (default: 0.7) are written to a `pending_ai_challenges` queue for admin review instead of going live automatically.

#### Auto-calibration

After each challenge expires, the job reads its final completion rate and feeds it back as a reinforcement signal in the next generation prompt. This creates a feedback loop where the model learns the difficulty sweet spot for this server's specific player base over time.

#### Configuration (stored in `ai_config` table)

| Key | Default | Description |
|-----|---------|-------------|
| `challenge_gen_cron` | `0 6 * * *` | Generation schedule |
| `challenge_gen_count` | `3` | Challenges to generate per run |
| `challenge_auto_publish_threshold` | `0.7` | Confidence threshold for auto-publish |
| `challenge_theme_hint` | `null` | Optional free-text theme hint for admins |

#### Admin UI additions
- "AI Challenges" tab in the Challenges page showing the pending queue
- Approve / Reject / Edit buttons per pending challenge
- "Generate Now" manual trigger button

---

### 2.2 Contextual NPC Dialogue

#### Purpose
Make NPCs feel alive by giving them memory of the player's history and the ability to respond dynamically to server context (active events, player milestones, time of day).

#### How it works

When a player right-clicks an NPC, the `NpcPlugin` calls `GET /bridge/npc/:npcId/dialogue/:playerUuid`. Currently this returns static `dialogueLines`. Under the new system:

1. The API fetches:
   - Player profile (tier, streak, recent challenges completed, coins, clan)
   - NPC definition (type, quest list, relationship score with this player)
   - Active server event (if any)
   - Time of day (server time)

2. This context is passed to Claude (claude-haiku-4-5 for latency) with the NPC's persona prompt (derived from the NPC `type` field) and a request to produce 2–4 dialogue lines in the NPC's voice.

3. The response is cached in Redis with a TTL of 5 minutes (same player + same NPC). If the API call exceeds 800 ms, the system falls back to the static `dialogueLines`.

#### NPC persona prompts (stored per NPC in `npc_definitions.ai_persona`)

A new optional `ai_persona` text field on `NpcDefinition` lets admins write a character brief:

> *"Grumpy elder blacksmith who respects players who have completed combat challenges. Teases players with low streak counts. Always refers to the server's current event as 'the chaos out there'."*

If `ai_persona` is null, the NPC type (`GUIDE`, `QUEST_GIVER`, `MERCHANT`) provides a default persona.

#### Example output

Player: Veteran tier, 14-day streak, active Boss Raid event  
NPC type: QUEST_GIVER  

> *"Back again? Fourteen days straight — you've earned some respect. The raid's still raging out there, so I'll keep this short. Your next quest awaits; the reward's worth the risk."*

#### Guardrails
- Max response tokens: 120 (keeps dialogue snappy)
- Content filter: Claude's built-in safety + a simple profanity check before delivery
- Fallback: static lines if latency > 800 ms or API error

---

### 2.3 Predictive Engagement Alerts

#### Purpose
Identify players at risk of churning 3–5 days *before* they become inactive (not 14 days after), enabling timely re-engagement.

#### How it works

A daily job scores every player who has been active in the last 30 days using a prompt that receives:
- Login frequency over the last 14 days (compared to their personal baseline)
- Challenge completion trend (accelerating, stable, declining)
- Streak status (current vs. longest)
- Last reward claimed (type, rarity, days ago)
- Clan activity (recent war participation)

Claude returns a risk score (0.0–1.0) and a short reasoning string for each player.

Players crossing configurable thresholds trigger automated re-engagement actions through the existing broadcast system:

| Risk Score | Action |
|------------|--------|
| 0.6–0.79 | Personalised in-game action bar message at next login ("Your streak is safe until midnight — one more challenge?") |
| 0.8–0.89 | Action bar + a mystery box reward granted automatically |
| ≥ 0.90 | Action bar + mystery box + Discord DM (if Discord ID linked) |

All actions are logged to a new `ai_interventions` table for A/B analysis.

#### Admin UI additions
- "At-Risk Players" widget on the Analytics dashboard
- Heat ring around player avatars on the Players page (yellow = medium risk, red = high)
- Intervention history per player on the player detail page

---

### 2.4 AI Chat Moderation

#### Purpose
Reduce moderator workload by pre-triaging flagged chat messages before they reach the report queue, and auto-escalating severe violations.

#### How it works

The existing `ModerationPlugin` already flags messages and calls `POST /api/bridge/chatlog`. This endpoint is extended with a new async step:

1. After logging, the message is pushed to a Redis queue.
2. A worker picks it up and calls Claude (claude-haiku-4-5) with:
   - The raw message text
   - Last 5 messages from that player (for context)
   - A classification request: `["CLEAN", "MILD_TOXICITY", "HATE_SPEECH", "PERSONAL_THREAT", "SPAM"]`
3. Claude returns a category and a 1-sentence justification.
4. The `ChatLog` record is updated with `ai_category` and `ai_justification` fields.

Actions by category:

| Category | Action |
|----------|--------|
| `CLEAN` | No action |
| `MILD_TOXICITY` | Flag for moderator review (existing flow) |
| `HATE_SPEECH` | Auto-create `ModerationReport` with AI justification as reason |
| `PERSONAL_THREAT` | Auto-create report + immediately notify online `SUPER_ADMIN` via action bar |
| `SPAM` | Auto-mute for 10 minutes + notify moderator |

#### Why this is safe
- AI creates reports, not punishments. A human still reviews `HATE_SPEECH` before banning.
- Exception: `SPAM` auto-mutes are short (10 min) and logged transparently.
- All AI decisions are stored with their justification strings — fully auditable.
- Moderators can see the AI category on every chat log entry and override it.

---

### 2.5 Personalised Reward Recommendations

#### Purpose
Ensure that high-value players always receive rewards they actually want, increasing perceived value of gameplay achievements.

#### How it works

When an admin opens the "Grant Reward" modal on a player's profile, a new "AI Suggest" button calls `GET /api/ai/reward-suggestions/:playerUuid`.

The endpoint builds a player context snapshot:
- Completed challenge types (KILL_MOB / CRAFT_ITEM / etc.) — reveals playstyle
- Reward history (what they've received, when, whether they claimed it quickly)
- Cosmetics equipped — reveals aesthetic preferences
- Clan membership — suggests clan-useful rewards
- Economy balance — avoid giving currency to already-wealthy players

Claude returns an ordered list of 3 recommended rewards from the existing reward catalogue with a short reason per recommendation.

This same logic runs automatically when the predictive engagement system decides to grant a mystery box (Feature 2.3) — instead of a random loot roll, the AI picks the loot table entry most likely to retain that specific player.

#### No new reward types required
All recommendations select from existing `Reward` records. The AI layer is purely a selection engine, not a content creator.

---

## 3. Technical Architecture

### 3.1 New server-side modules

```
server/src/services/ai/
  client.ts          — Anthropic SDK wrapper (prompt caching, retry, rate limit)
  challenges.ts      — Dynamic challenge generation logic
  dialogue.ts        — NPC dialogue generation logic
  engagement.ts      — Churn prediction + re-engagement orchestration
  moderation.ts      — Chat classification worker
  rewards.ts         — Reward recommendation logic
  prompts/           — Prompt templates (version-controlled)
    challenge-gen.txt
    npc-dialogue.txt
    churn-predict.txt
    chat-classify.txt
    reward-suggest.txt
```

### 3.2 New database fields / tables

```sql
-- New table
CREATE TABLE ai_config (key TEXT PRIMARY KEY, value TEXT, updated_at TIMESTAMPTZ);

-- New table  
CREATE TABLE ai_interventions (
  id          SERIAL PRIMARY KEY,
  player_uuid TEXT NOT NULL,
  type        TEXT NOT NULL,         -- 'churn_alert' | 'reward_grant' | 'dm'
  risk_score  FLOAT,
  payload     JSONB,
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- New table
CREATE TABLE pending_ai_challenges (
  id           SERIAL PRIMARY KEY,
  payload      JSONB NOT NULL,       -- full Challenge object
  confidence   FLOAT NOT NULL,
  status       TEXT DEFAULT 'pending', -- 'pending' | 'approved' | 'rejected'
  reviewed_by  TEXT,
  created_at   TIMESTAMPTZ DEFAULT now()
);

-- Extended fields
ALTER TABLE npc_definitions    ADD COLUMN ai_persona TEXT;
ALTER TABLE chat_logs          ADD COLUMN ai_category TEXT, ADD COLUMN ai_justification TEXT;
```

### 3.3 New API endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/ai/challenge-suggestions` | JWT | List pending AI challenges |
| `POST` | `/api/ai/challenge-suggestions/:id/approve` | JWT | Approve pending challenge |
| `DELETE` | `/api/ai/challenge-suggestions/:id` | JWT | Reject pending challenge |
| `POST` | `/api/ai/challenges/generate` | JWT | Manual trigger |
| `GET` | `/api/ai/reward-suggestions/:playerUuid` | JWT | Personalised reward list |
| `GET` | `/api/ai/at-risk-players` | JWT | Current churn risk scores |
| `GET` | `/api/bridge/npc/:npcId/dialogue/:playerUuid` | Service token | Extended (AI-powered) |

### 3.4 Model selection rationale

| Use case | Model | Reason |
|----------|-------|--------|
| Challenge generation | claude-sonnet-4-6 | Complex JSON, needs reasoning |
| NPC dialogue | claude-haiku-4-5 | Real-time, <800ms budget |
| Churn prediction | claude-sonnet-4-6 | Nuanced trend analysis |
| Chat moderation | claude-haiku-4-5 | High volume, real-time triage |
| Reward suggestion | claude-haiku-4-5 | Simple selection from known catalogue |

### 3.5 Prompt caching

The `client.ts` wrapper uses Anthropic's prompt caching for all features. The stable portion of each prompt (schema definitions, persona guidelines, the reward catalogue) is marked as a cache block. Only the per-request player/event context is uncached. Expected cache hit rate: 80–90%, reducing token costs proportionally.

### 3.6 Cost estimate (rough)

Assuming 500 active players, 1 000 chat messages/day, daily challenge gen:

| Feature | Calls/day | Est. tokens/call | Monthly cost |
|---------|-----------|-----------------|--------------|
| Challenge gen | 1 | 4 000 | ~$0.10 |
| NPC dialogue | ~200 | 800 | ~$1.50 |
| Churn prediction | 1 batch (500 players) | 500 avg | ~$3.00 |
| Chat moderation | 1 000 | 300 | ~$2.00 |
| Reward suggest | ~20 | 1 200 | ~$0.20 |
| **Total** | | | **~$7/month** |

Costs scale linearly with player count. The prompt caching discount is not included above; actual costs will be lower.

---

## 4. Implementation Status

| Phase | Feature | Status |
|-------|---------|--------|
| 1 | AI Chat Moderation | ✅ Live — `POST /api/ai/moderation/scan`, results at `GET /api/ai/moderation/latest` |
| 2 | Dynamic Challenge Generator | ✅ Live — `POST /api/ai/challenges/generate`, draft queue with approve/reject |
| 3 | Predictive Engagement Alerts | ✅ Live — `POST /api/ai/engagement/scan`, results at `GET /api/ai/engagement/latest` |
| 4 | Personalised Reward Recommendations | ✅ Live — `POST /api/ai/rewards/suggest` |
| 5 | Contextual NPC Dialogue | 🔲 Planned — high latency constraints, deprioritised |

---

## 5. Open Questions for Admin Review

1. **Auto-publish threshold**: Should AI challenges go live automatically (at confidence ≥ 0.7) or always require human approval for the first month?
2. **NPC response language**: Should dialogue be English-only or attempt to match the server's configured locale?
3. **Discord integration** (Feature 2.3 high-risk DMs): Is a Discord bot token already available or does that need a new setup step?
4. **Data retention**: How long should `ai_interventions` and `ai_category` columns be kept? (GDPR consideration if EU players are present)
5. **ADMIN_EMAIL access to AI config**: Should MODERATOR role have read-only access to AI moderation decisions, or is that SUPER_ADMIN only?
