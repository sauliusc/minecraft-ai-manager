import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import type { ApiClient } from "../api-client.js";

export const eventTools: Tool[] = [
  {
    name: "list_events",
    description: "List server events with optional state/type filters.",
    inputSchema: {
      type: "object",
      properties: {
        page: { type: "number" },
        limit: { type: "number" },
        state: { type: "string", description: "Filter by state (UPCOMING, ACTIVE, COMPLETED)" },
        type: { type: "string", description: "Filter by event type" },
      },
      required: [],
    },
  },
  {
    name: "get_event",
    description: "Get details and leaderboard for a specific event.",
    inputSchema: {
      type: "object",
      properties: {
        eventId: { type: "string", description: "Event ID" },
      },
      required: ["eventId"],
    },
  },
  {
    name: "create_event",
    description: "Create a new server event.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Event name" },
        description: { type: "string", description: "Event description" },
        type: { type: "string", description: "Event type" },
        startAt: { type: "string", description: "Start time ISO string" },
        endAt: { type: "string", description: "End time ISO string" },
        rewardId: { type: "string", description: "Reward for winners (optional)" },
      },
      required: ["name", "type", "startAt"],
    },
  },
  {
    name: "update_event",
    description: "Update an existing event.",
    inputSchema: {
      type: "object",
      properties: {
        eventId: { type: "string", description: "Event ID" },
        fields: {
          type: "object",
          description: "Fields to update",
          additionalProperties: true,
        },
      },
      required: ["eventId", "fields"],
    },
  },
  {
    name: "complete_event",
    description: "Mark an event as completed.",
    inputSchema: {
      type: "object",
      properties: {
        eventId: { type: "string", description: "Event ID to complete" },
      },
      required: ["eventId"],
    },
  },
  {
    name: "delete_event",
    description: "Delete an upcoming event.",
    inputSchema: {
      type: "object",
      properties: {
        eventId: { type: "string", description: "Event ID to delete" },
      },
      required: ["eventId"],
    },
  },
];

export async function handleEvents(
  client: ApiClient,
  name: string,
  args: Record<string, unknown>
): Promise<unknown> {
  switch (name) {
    case "list_events": {
      const params = new URLSearchParams();
      if (args.page) params.set("page", String(args.page));
      if (args.limit) params.set("limit", String(args.limit));
      if (args.state) params.set("state", String(args.state));
      if (args.type) params.set("type", String(args.type));
      return client.get(`/api/events?${params}`);
    }

    case "get_event":
      return client.get(`/api/events/${args.eventId}`);

    case "create_event":
      return client.post("/api/events", args);

    case "update_event":
      return client.patch(`/api/events/${args.eventId}`, args.fields);

    case "complete_event":
      return client.post(`/api/events/${args.eventId}/complete`, {});

    case "delete_event":
      return client.del(`/api/events/${args.eventId}`);

    default:
      throw new Error(`Unknown event tool: ${name}`);
  }
}
