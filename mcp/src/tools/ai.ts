import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import type { ApiClient } from "../api-client.js";

export const aiTools: Tool[] = [
  {
    name: "ai_generate_challenges",
    description:
      "Ask the AI to generate new challenge drafts based on current server activity. " +
      "Drafts must be approved before they go live.",
    inputSchema: {
      type: "object",
      properties: {
        count: {
          type: "number",
          description: "Number of challenges to generate (default 3)",
        },
        context: {
          type: "string",
          description: "Optional context to guide generation (e.g. 'PvP-focused', 'weekend event')",
        },
      },
      required: [],
    },
  },
  {
    name: "ai_list_challenge_drafts",
    description: "List AI-generated challenge drafts awaiting approval or rejection.",
    inputSchema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "ai_approve_challenge_draft",
    description: "Approve an AI-generated challenge draft so it becomes active.",
    inputSchema: {
      type: "object",
      properties: {
        draftId: { type: "string", description: "Draft ID to approve" },
      },
      required: ["draftId"],
    },
  },
  {
    name: "ai_reject_challenge_draft",
    description: "Reject and delete an AI-generated challenge draft.",
    inputSchema: {
      type: "object",
      properties: {
        draftId: { type: "string", description: "Draft ID to reject" },
      },
      required: ["draftId"],
    },
  },
  {
    name: "ai_scan_engagement",
    description:
      "Run an AI engagement scan to identify at-risk players, top performers, and " +
      "recommended actions to improve retention.",
    inputSchema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "ai_get_latest_engagement",
    description: "Get the results of the most recent AI engagement scan.",
    inputSchema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "ai_suggest_rewards",
    description: "Ask the AI to suggest rewards for a specific player or context.",
    inputSchema: {
      type: "object",
      properties: {
        playerId: { type: "string", description: "Player ID to personalise suggestions for" },
        context: { type: "string", description: "Optional context (e.g. 'milestone reward')" },
      },
      required: [],
    },
  },
  {
    name: "ai_scan_moderation",
    description: "Run an AI scan over recent chat logs to flag potential rule violations.",
    inputSchema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "ai_get_latest_moderation_scan",
    description: "Get the results of the most recent AI moderation scan.",
    inputSchema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "ai_get_config",
    description: "Get the current AI configuration (model, provider, enabled features).",
    inputSchema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "ai_update_config",
    description: "Update AI configuration settings.",
    inputSchema: {
      type: "object",
      properties: {
        fields: {
          type: "object",
          description: "Config fields to update",
          additionalProperties: true,
        },
      },
      required: ["fields"],
    },
  },
  {
    name: "ai_generate_week_theme",
    description:
      "Generate an entire week's coordinated Minecraft server content as a DRAFT based on a theme name and start date. " +
      "Creates 1 GameEvent, 7 daily challenges, 1 weekly challenge, 1 NPC, and 4 rewards.",
    inputSchema: {
      type: "object",
      properties: {
        theme: {
          type: "string",
          description: "The theme name (e.g. 'Halloween', 'Winter Wonderland', 'Dragon Invasion')",
        },
        startDate: {
          type: "string",
          description: "Start date in YYYY-MM-DD format (the Monday of the theme week)",
        },
      },
      required: ["theme", "startDate"],
    },
  },
  {
    name: "ai_list_week_themes",
    description: "List all AI-generated week themes (paginated).",
    inputSchema: {
      type: "object",
      properties: {
        page: { type: "number", description: "Page number (default 1)" },
        limit: { type: "number", description: "Items per page (default 20, max 50)" },
      },
      required: [],
    },
  },
  {
    name: "ai_get_current_week_theme",
    description: "Get the currently active week theme, if any.",
    inputSchema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "ai_get_week_theme",
    description: "Get a specific week theme by ID.",
    inputSchema: {
      type: "object",
      properties: {
        themeId: { type: "string", description: "Week theme ID" },
      },
      required: ["themeId"],
    },
  },
  {
    name: "ai_activate_week_theme",
    description:
      "Activate a DRAFT week theme. This atomically creates the GameEvent, all challenges, the NPC, " +
      "and all rewards, then sends the RCON announcement.",
    inputSchema: {
      type: "object",
      properties: {
        themeId: { type: "string", description: "Week theme ID to activate" },
      },
      required: ["themeId"],
    },
  },
  {
    name: "ai_cancel_week_theme",
    description: "Cancel a week theme (sets status to CANCELLED). Does not delete created content.",
    inputSchema: {
      type: "object",
      properties: {
        themeId: { type: "string", description: "Week theme ID to cancel" },
      },
      required: ["themeId"],
    },
  },
];

export async function handleAi(
  client: ApiClient,
  name: string,
  args: Record<string, unknown>
): Promise<unknown> {
  switch (name) {
    case "ai_generate_challenges":
      return client.post("/api/ai/challenges/generate", {
        count: args.count ?? 3,
        context: args.context,
      });

    case "ai_list_challenge_drafts":
      return client.get("/api/ai/challenges/drafts");

    case "ai_approve_challenge_draft":
      return client.post(`/api/ai/challenges/drafts/${args.draftId}/approve`, {});

    case "ai_reject_challenge_draft":
      return client.del(`/api/ai/challenges/drafts/${args.draftId}`);

    case "ai_scan_engagement":
      return client.post("/api/ai/engagement/scan", {});

    case "ai_get_latest_engagement":
      return client.get("/api/ai/engagement/latest");

    case "ai_suggest_rewards":
      return client.post("/api/ai/rewards/suggest", {
        playerId: args.playerId,
        context: args.context,
      });

    case "ai_scan_moderation":
      return client.post("/api/ai/moderation/scan", {});

    case "ai_get_latest_moderation_scan":
      return client.get("/api/ai/moderation/latest");

    case "ai_get_config":
      return client.get("/api/ai/config");

    case "ai_update_config":
      return client.patch("/api/ai/config", args.fields);

    case "ai_generate_week_theme":
      return client.post("/api/ai/week-theme/generate", {
        theme: args.theme,
        startDate: args.startDate,
      });

    case "ai_list_week_themes": {
      const params = new URLSearchParams();
      if (args.page) params.set("page", String(args.page));
      if (args.limit) params.set("limit", String(args.limit));
      const qs = params.toString();
      return client.get(`/api/ai/week-theme${qs ? `?${qs}` : ""}`);
    }

    case "ai_get_current_week_theme":
      return client.get("/api/ai/week-theme/current");

    case "ai_get_week_theme":
      return client.get(`/api/ai/week-theme/${args.themeId}`);

    case "ai_activate_week_theme":
      return client.post(`/api/ai/week-theme/${args.themeId}/activate`, {});

    case "ai_cancel_week_theme":
      return client.del(`/api/ai/week-theme/${args.themeId}`);

    default:
      throw new Error(`Unknown AI tool: ${name}`);
  }
}
