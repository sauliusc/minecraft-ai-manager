import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import type { ApiClient } from "../api-client.js";

export const broadcastTools: Tool[] = [
  {
    name: "list_broadcasts",
    description: "List scheduled server broadcasts.",
    inputSchema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "create_broadcast",
    description: "Schedule a broadcast message to be sent to all online players.",
    inputSchema: {
      type: "object",
      properties: {
        message: { type: "string", description: "Message to broadcast" },
        scheduledAt: {
          type: "string",
          description: "ISO datetime to send (omit to send immediately)",
        },
        repeat: {
          type: "boolean",
          description: "Whether to repeat this broadcast on an interval",
        },
        intervalMinutes: {
          type: "number",
          description: "Repeat interval in minutes (if repeat is true)",
        },
      },
      required: ["message"],
    },
  },
  {
    name: "cancel_broadcast",
    description: "Cancel a scheduled broadcast.",
    inputSchema: {
      type: "object",
      properties: {
        broadcastId: { type: "string", description: "Broadcast ID to cancel" },
      },
      required: ["broadcastId"],
    },
  },
  {
    name: "update_broadcast",
    description: "Update a scheduled broadcast.",
    inputSchema: {
      type: "object",
      properties: {
        broadcastId: { type: "string", description: "Broadcast ID to update" },
        fields: {
          type: "object",
          description: "Fields to update",
          additionalProperties: true,
        },
      },
      required: ["broadcastId", "fields"],
    },
  },
];

export async function handleBroadcast(
  client: ApiClient,
  name: string,
  args: Record<string, unknown>
): Promise<unknown> {
  switch (name) {
    case "list_broadcasts":
      return client.get("/api/broadcast/scheduled");

    case "create_broadcast":
      return client.post("/api/broadcast", args);

    case "cancel_broadcast":
      return client.del(`/api/broadcast/scheduled/${args.broadcastId}`);

    case "update_broadcast":
      return client.patch(`/api/broadcast/scheduled/${args.broadcastId}`, args.fields);

    default:
      throw new Error(`Unknown broadcast tool: ${name}`);
  }
}
