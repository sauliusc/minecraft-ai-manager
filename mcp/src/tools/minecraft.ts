import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import type { ApiClient } from "../api-client.js";

export const minecraftTools: Tool[] = [
  {
    name: "minecraft_status",
    description:
      "Get Minecraft server container status plus live RCON data: online players, TPS, uptime.",
    inputSchema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "minecraft_logs",
    description: "Fetch recent Minecraft server logs from Docker.",
    inputSchema: {
      type: "object",
      properties: {
        tail: {
          type: "number",
          description: "Number of log lines to return (default 100)",
        },
      },
      required: [],
    },
  },
  {
    name: "minecraft_command",
    description:
      "Execute any command on the Minecraft server via RCON. This is raw server control — " +
      "use it for /give, /tp, /ban, /op, /whitelist, /execute, custom plugin commands, etc.",
    inputSchema: {
      type: "object",
      properties: {
        command: {
          type: "string",
          description:
            'The command to run (with or without leading /). E.g. "list", "give Steve diamond 64"',
        },
      },
      required: ["command"],
    },
  },
  {
    name: "minecraft_power",
    description: "Start, stop, or restart the Minecraft server container.",
    inputSchema: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: ["start", "stop", "restart"],
          description: "Power action to perform",
        },
      },
      required: ["action"],
    },
  },
];

export async function handleMinecraft(
  client: ApiClient,
  name: string,
  args: Record<string, unknown>
): Promise<unknown> {
  switch (name) {
    case "minecraft_status":
      return client.get("/api/minecraft/status");

    case "minecraft_logs": {
      const tail = (args.tail as number | undefined) ?? 100;
      return client.get(`/api/minecraft/logs?tail=${tail}`);
    }

    case "minecraft_command":
      return client.post("/api/minecraft/command", { command: args.command });

    case "minecraft_power":
      return client.post("/api/minecraft/power", { action: args.action });

    default:
      throw new Error(`Unknown minecraft tool: ${name}`);
  }
}
