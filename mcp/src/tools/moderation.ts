import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import type { ApiClient } from "../api-client.js";

export const moderationTools: Tool[] = [
  {
    name: "list_reports",
    description: "List player reports with optional filters.",
    inputSchema: {
      type: "object",
      properties: {
        page: { type: "number" },
        limit: { type: "number" },
        status: { type: "string", description: "Filter by status (PENDING, RESOLVED)" },
        reporterId: { type: "string", description: "Filter by reporter player ID" },
      },
      required: [],
    },
  },
  {
    name: "resolve_report",
    description: "Resolve a player report with a decision.",
    inputSchema: {
      type: "object",
      properties: {
        reportId: { type: "string", description: "Report ID to resolve" },
        resolution: { type: "string", description: "Resolution notes" },
      },
      required: ["reportId"],
    },
  },
  {
    name: "admin_moderation_action",
    description:
      "Apply a moderation action to a player: warn, mute, kick, ban, unban, etc.",
    inputSchema: {
      type: "object",
      properties: {
        targetPlayerId: { type: "string", description: "Player ID to action" },
        action: {
          type: "string",
          enum: ["WARN", "MUTE", "KICK", "BAN", "UNBAN", "NOTE"],
          description: "Action type",
        },
        reason: { type: "string", description: "Reason for the action" },
        duration: {
          type: "number",
          description: "Duration in minutes (for MUTE/BAN, omit for permanent)",
        },
      },
      required: ["targetPlayerId", "action", "reason"],
    },
  },
  {
    name: "list_chat_logs",
    description: "Search and browse chat logs.",
    inputSchema: {
      type: "object",
      properties: {
        page: { type: "number" },
        limit: { type: "number" },
        playerId: { type: "string", description: "Filter by player ID" },
        search: { type: "string", description: "Full-text search in messages" },
      },
      required: [],
    },
  },
  {
    name: "get_audit_log",
    description: "Get the moderation audit log.",
    inputSchema: {
      type: "object",
      properties: {
        page: { type: "number" },
        limit: { type: "number" },
        targetId: { type: "string", description: "Filter by target player ID" },
      },
      required: [],
    },
  },
];

export async function handleModeration(
  client: ApiClient,
  name: string,
  args: Record<string, unknown>
): Promise<unknown> {
  switch (name) {
    case "list_reports": {
      const params = new URLSearchParams();
      if (args.page) params.set("page", String(args.page));
      if (args.limit) params.set("limit", String(args.limit));
      if (args.status) params.set("status", String(args.status));
      if (args.reporterId) params.set("reporterId", String(args.reporterId));
      return client.get(`/api/moderation/reports?${params}`);
    }

    case "resolve_report":
      return client.patch(`/api/moderation/reports/${args.reportId}`, {
        resolution: args.resolution,
      });

    case "admin_moderation_action":
      return client.post("/api/moderation/actions/admin", {
        targetPlayerId: args.targetPlayerId,
        action: args.action,
        reason: args.reason,
        duration: args.duration,
      });

    case "list_chat_logs": {
      const params = new URLSearchParams();
      if (args.page) params.set("page", String(args.page));
      if (args.limit) params.set("limit", String(args.limit));
      if (args.playerId) params.set("playerId", String(args.playerId));
      if (args.search) params.set("search", String(args.search));
      return client.get(`/api/moderation/chat-log?${params}`);
    }

    case "get_audit_log": {
      const params = new URLSearchParams();
      if (args.page) params.set("page", String(args.page));
      if (args.limit) params.set("limit", String(args.limit));
      if (args.targetId) params.set("targetId", String(args.targetId));
      return client.get(`/api/moderation/audit-log?${params}`);
    }

    default:
      throw new Error(`Unknown moderation tool: ${name}`);
  }
}
