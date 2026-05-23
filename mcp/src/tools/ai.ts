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

    default:
      throw new Error(`Unknown AI tool: ${name}`);
  }
}
