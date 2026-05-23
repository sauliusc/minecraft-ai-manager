import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import type { ApiClient } from "../api-client.js";

export const challengeTools: Tool[] = [
  {
    name: "list_challenges",
    description: "List challenges with optional filters.",
    inputSchema: {
      type: "object",
      properties: {
        page: { type: "number" },
        limit: { type: "number" },
        type: { type: "string", description: "Challenge type filter" },
        status: { type: "string", description: "Status filter (ACTIVE, INACTIVE, etc.)" },
        difficulty: { type: "string", description: "Difficulty filter" },
      },
      required: [],
    },
  },
  {
    name: "get_challenge",
    description: "Get details for a specific challenge.",
    inputSchema: {
      type: "object",
      properties: {
        challengeId: { type: "string", description: "Challenge ID" },
      },
      required: ["challengeId"],
    },
  },
  {
    name: "create_challenge",
    description: "Create a new challenge.",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string", description: "Challenge title" },
        description: { type: "string", description: "Challenge description" },
        type: { type: "string", description: "Challenge type (e.g. DAILY, WEEKLY, SPECIAL)" },
        difficulty: { type: "string", description: "Difficulty level" },
        goal: { type: "number", description: "Target count to complete" },
        rewardId: { type: "string", description: "Reward ID granted on completion" },
        expiresAt: { type: "string", description: "Expiry date ISO string (optional)" },
      },
      required: ["title", "description", "type", "difficulty", "goal"],
    },
  },
  {
    name: "update_challenge",
    description: "Update an existing challenge.",
    inputSchema: {
      type: "object",
      properties: {
        challengeId: { type: "string", description: "Challenge ID to update" },
        fields: {
          type: "object",
          description: "Fields to update",
          additionalProperties: true,
        },
      },
      required: ["challengeId", "fields"],
    },
  },
  {
    name: "delete_challenge",
    description: "Delete a challenge.",
    inputSchema: {
      type: "object",
      properties: {
        challengeId: { type: "string", description: "Challenge ID to delete" },
      },
      required: ["challengeId"],
    },
  },
];

export async function handleChallenges(
  client: ApiClient,
  name: string,
  args: Record<string, unknown>
): Promise<unknown> {
  switch (name) {
    case "list_challenges": {
      const params = new URLSearchParams();
      if (args.page) params.set("page", String(args.page));
      if (args.limit) params.set("limit", String(args.limit));
      if (args.type) params.set("type", String(args.type));
      if (args.status) params.set("status", String(args.status));
      if (args.difficulty) params.set("difficulty", String(args.difficulty));
      return client.get(`/api/challenges?${params}`);
    }

    case "get_challenge":
      return client.get(`/api/challenges/${args.challengeId}`);

    case "create_challenge":
      return client.post("/api/challenges", args);

    case "update_challenge":
      return client.patch(`/api/challenges/${args.challengeId}`, args.fields);

    case "delete_challenge":
      return client.del(`/api/challenges/${args.challengeId}`);

    default:
      throw new Error(`Unknown challenge tool: ${name}`);
  }
}
