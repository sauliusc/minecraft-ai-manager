import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import type { ApiClient } from "../api-client.js";

export const economyTools: Tool[] = [
  {
    name: "get_balance",
    description: "Get a player's coin and crystal balance.",
    inputSchema: {
      type: "object",
      properties: {
        playerId: { type: "string", description: "Player ID" },
      },
      required: ["playerId"],
    },
  },
  {
    name: "get_top_balances",
    description: "Get the top 10 coin and crystal holders on the server.",
    inputSchema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "transfer_coins",
    description: "Transfer coins from one player to another.",
    inputSchema: {
      type: "object",
      properties: {
        fromPlayerId: { type: "string", description: "Sender player ID" },
        toPlayerId: { type: "string", description: "Recipient player ID" },
        amount: { type: "number", description: "Amount of coins to transfer" },
      },
      required: ["fromPlayerId", "toPlayerId", "amount"],
    },
  },
  {
    name: "adjust_currency",
    description:
      "Admin: directly add or remove coins/crystals from a player's balance (no transfer).",
    inputSchema: {
      type: "object",
      properties: {
        playerId: { type: "string", description: "Player ID" },
        currency: {
          type: "string",
          enum: ["coins", "crystals"],
          description: "Currency type",
        },
        amount: {
          type: "number",
          description: "Amount to add (positive) or remove (negative)",
        },
        reason: { type: "string", description: "Reason for adjustment (for audit log)" },
      },
      required: ["playerId", "currency", "amount"],
    },
  },
  {
    name: "list_market",
    description: "List active player-to-player market listings.",
    inputSchema: {
      type: "object",
      properties: {
        page: { type: "number" },
        limit: { type: "number" },
      },
      required: [],
    },
  },
  {
    name: "grant_reward",
    description: "Grant a reward to a player (items, currency, cosmetics, mystery boxes).",
    inputSchema: {
      type: "object",
      properties: {
        rewardId: { type: "string", description: "Reward ID to grant" },
        playerId: { type: "string", description: "Player ID to grant the reward to" },
      },
      required: ["rewardId", "playerId"],
    },
  },
];

export async function handleEconomy(
  client: ApiClient,
  name: string,
  args: Record<string, unknown>
): Promise<unknown> {
  switch (name) {
    case "get_balance":
      return client.get(`/api/economy/balance/${args.playerId}`);

    case "get_top_balances":
      return client.get("/api/economy/balances");

    case "transfer_coins":
      return client.post("/api/economy/transfer", {
        fromPlayerId: args.fromPlayerId,
        toPlayerId: args.toPlayerId,
        amount: args.amount,
      });

    case "adjust_currency":
      return client.post("/api/economy/adjust", {
        playerId: args.playerId,
        currency: args.currency,
        amount: args.amount,
        reason: args.reason,
      });

    case "list_market": {
      const params = new URLSearchParams();
      if (args.page) params.set("page", String(args.page));
      if (args.limit) params.set("limit", String(args.limit));
      return client.get(`/api/economy/market/listings?${params}`);
    }

    case "grant_reward":
      return client.post("/api/rewards/grant", {
        rewardId: args.rewardId,
        playerId: args.playerId,
      });

    default:
      throw new Error(`Unknown economy tool: ${name}`);
  }
}
