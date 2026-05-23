import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import type { ApiClient } from "../api-client.js";

export const playerTools: Tool[] = [
  {
    name: "list_players",
    description: "List all registered players with optional filters and pagination.",
    inputSchema: {
      type: "object",
      properties: {
        page: { type: "number", description: "Page number (default 1)" },
        limit: { type: "number", description: "Results per page (default 20)" },
        search: { type: "string", description: "Search by username" },
        tier: { type: "string", description: "Filter by player tier" },
      },
      required: [],
    },
  },
  {
    name: "get_player",
    description:
      "Get full details for a player: stats, tier progress, reward history, economy balance.",
    inputSchema: {
      type: "object",
      properties: {
        username: { type: "string", description: "Player's Minecraft username" },
      },
      required: ["username"],
    },
  },
  {
    name: "update_player",
    description: "Update writable fields on a player record (tier, ban status, custom data, etc.).",
    inputSchema: {
      type: "object",
      properties: {
        username: { type: "string", description: "Player's Minecraft username" },
        fields: {
          type: "object",
          description: "Key-value pairs of fields to update",
          additionalProperties: true,
        },
      },
      required: ["username", "fields"],
    },
  },
];

export async function handlePlayers(
  client: ApiClient,
  name: string,
  args: Record<string, unknown>
): Promise<unknown> {
  switch (name) {
    case "list_players": {
      const params = new URLSearchParams();
      if (args.page) params.set("page", String(args.page));
      if (args.limit) params.set("limit", String(args.limit));
      if (args.search) params.set("search", String(args.search));
      if (args.tier) params.set("tier", String(args.tier));
      return client.get(`/api/players?${params}`);
    }

    case "get_player":
      return client.get(`/api/players/${encodeURIComponent(args.username as string)}`);

    case "update_player":
      return client.patch(
        `/api/players/${encodeURIComponent(args.username as string)}`,
        args.fields
      );

    default:
      throw new Error(`Unknown player tool: ${name}`);
  }
}
