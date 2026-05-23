import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import type { ApiClient } from "../api-client.js";

export const clanTools: Tool[] = [
  {
    name: "list_clans",
    description: "List all clans with pagination.",
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
    name: "get_clan",
    description: "Get details for a specific clan including members, level, and home.",
    inputSchema: {
      type: "object",
      properties: {
        clanId: { type: "string", description: "Clan ID" },
      },
      required: ["clanId"],
    },
  },
  {
    name: "get_clan_wars",
    description: "Get war history for a clan.",
    inputSchema: {
      type: "object",
      properties: {
        clanId: { type: "string", description: "Clan ID" },
      },
      required: ["clanId"],
    },
  },
  {
    name: "get_player_clan",
    description: "Get the clan that a specific player belongs to.",
    inputSchema: {
      type: "object",
      properties: {
        playerId: { type: "string", description: "Player ID" },
      },
      required: ["playerId"],
    },
  },
  {
    name: "disband_clan",
    description: "Permanently disband a clan and remove all members.",
    inputSchema: {
      type: "object",
      properties: {
        clanId: { type: "string", description: "Clan ID to disband" },
      },
      required: ["clanId"],
    },
  },
  {
    name: "delete_clan",
    description: "Delete a clan (super admin only).",
    inputSchema: {
      type: "object",
      properties: {
        clanId: { type: "string", description: "Clan ID to delete" },
      },
      required: ["clanId"],
    },
  },
  {
    name: "kick_clan_member",
    description: "Kick a member from a clan.",
    inputSchema: {
      type: "object",
      properties: {
        clanId: { type: "string", description: "Clan ID" },
        username: { type: "string", description: "Username to kick" },
      },
      required: ["clanId", "username"],
    },
  },
  {
    name: "change_clan_member_role",
    description: "Change a clan member's role (MEMBER, OFFICER, LEADER).",
    inputSchema: {
      type: "object",
      properties: {
        clanId: { type: "string", description: "Clan ID" },
        memberId: { type: "string", description: "Member's player ID" },
        role: {
          type: "string",
          enum: ["MEMBER", "OFFICER", "LEADER"],
          description: "New role",
        },
      },
      required: ["clanId", "memberId", "role"],
    },
  },
  {
    name: "add_clan_xp",
    description: "Add XP to a clan.",
    inputSchema: {
      type: "object",
      properties: {
        clanId: { type: "string", description: "Clan ID" },
        amount: { type: "number", description: "XP amount to add" },
      },
      required: ["clanId", "amount"],
    },
  },
  {
    name: "start_clan_war",
    description: "Start a war between two clans.",
    inputSchema: {
      type: "object",
      properties: {
        attackerId: { type: "string", description: "Attacking clan ID" },
        defenderId: { type: "string", description: "Defending clan ID" },
      },
      required: ["attackerId", "defenderId"],
    },
  },
  {
    name: "resolve_clan_war",
    description: "Resolve a clan war with a result.",
    inputSchema: {
      type: "object",
      properties: {
        warId: { type: "string", description: "War ID" },
        result: {
          type: "string",
          enum: ["ATTACKER_WIN", "DEFENDER_WIN", "DRAW"],
          description: "War outcome",
        },
      },
      required: ["warId", "result"],
    },
  },
];

export async function handleClans(
  client: ApiClient,
  name: string,
  args: Record<string, unknown>
): Promise<unknown> {
  switch (name) {
    case "list_clans": {
      const params = new URLSearchParams();
      if (args.page) params.set("page", String(args.page));
      if (args.limit) params.set("limit", String(args.limit));
      return client.get(`/api/clans?${params}`);
    }

    case "get_clan":
      return client.get(`/api/clans/${args.clanId}`);

    case "get_clan_wars":
      return client.get(`/api/clans/${args.clanId}/wars`);

    case "get_player_clan":
      return client.get(`/api/clans/member/${args.playerId}`);

    case "disband_clan":
      return client.post(`/api/clans/${args.clanId}/disband`, {});

    case "delete_clan":
      return client.del(`/api/clans/${args.clanId}`);

    case "kick_clan_member":
      return client.post(`/api/clans/${args.clanId}/kick`, {
        username: args.username,
      });

    case "change_clan_member_role":
      return client.patch(`/api/clans/${args.clanId}/members/${args.memberId}`, {
        role: args.role,
      });

    case "add_clan_xp":
      return client.post(`/api/clans/${args.clanId}/xp`, { amount: args.amount });

    case "start_clan_war":
      return client.post("/api/clans/wars", {
        attackerId: args.attackerId,
        defenderId: args.defenderId,
      });

    case "resolve_clan_war":
      return client.post(`/api/clans/wars/${args.warId}/result`, {
        result: args.result,
      });

    default:
      throw new Error(`Unknown clan tool: ${name}`);
  }
}
