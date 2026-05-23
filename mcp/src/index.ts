#!/usr/bin/env node
/**
 * CraftControl MCP Server
 *
 * Exposes the full CraftControl platform as MCP tools so Claude can:
 *   • Execute any Minecraft command via RCON
 *   • Manage players, clans, economy, challenges, events
 *   • Trigger AI scans and approve generated content
 *   • View analytics and moderate the server
 *
 * Configuration (env vars):
 *   CRAFTCONTROL_URL       — Base URL of the CraftControl API  (required)
 *   CRAFTCONTROL_EMAIL     — Admin account email               (required)
 *   CRAFTCONTROL_PASSWORD  — Admin account password            (required)
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

import { ApiClient } from "./api-client.js";

import { minecraftTools, handleMinecraft } from "./tools/minecraft.js";
import { playerTools, handlePlayers } from "./tools/players.js";
import { clanTools, handleClans } from "./tools/clans.js";
import { economyTools, handleEconomy } from "./tools/economy.js";
import { challengeTools, handleChallenges } from "./tools/challenges.js";
import { eventTools, handleEvents } from "./tools/events.js";
import { aiTools, handleAi } from "./tools/ai.js";
import { moderationTools, handleModeration } from "./tools/moderation.js";
import { broadcastTools, handleBroadcast } from "./tools/broadcast.js";
import { analyticsTools, handleAnalytics } from "./tools/analytics.js";

// ── Config ────────────────────────────────────────────────────────────────────

const baseUrl = process.env.CRAFTCONTROL_URL;
const email = process.env.CRAFTCONTROL_EMAIL;
const password = process.env.CRAFTCONTROL_PASSWORD;

if (!baseUrl || !email || !password) {
  console.error(
    "Missing required env vars: CRAFTCONTROL_URL, CRAFTCONTROL_EMAIL, CRAFTCONTROL_PASSWORD"
  );
  process.exit(1);
}

// ── Tool registry ─────────────────────────────────────────────────────────────

const allTools = [
  ...minecraftTools,
  ...playerTools,
  ...clanTools,
  ...economyTools,
  ...challengeTools,
  ...eventTools,
  ...aiTools,
  ...moderationTools,
  ...broadcastTools,
  ...analyticsTools,
];

// Map tool name → handler domain
const domainHandlers: Record<
  string,
  (client: ApiClient, name: string, args: Record<string, unknown>) => Promise<unknown>
> = {};

for (const tool of minecraftTools) domainHandlers[tool.name] = handleMinecraft;
for (const tool of playerTools) domainHandlers[tool.name] = handlePlayers;
for (const tool of clanTools) domainHandlers[tool.name] = handleClans;
for (const tool of economyTools) domainHandlers[tool.name] = handleEconomy;
for (const tool of challengeTools) domainHandlers[tool.name] = handleChallenges;
for (const tool of eventTools) domainHandlers[tool.name] = handleEvents;
for (const tool of aiTools) domainHandlers[tool.name] = handleAi;
for (const tool of moderationTools) domainHandlers[tool.name] = handleModeration;
for (const tool of broadcastTools) domainHandlers[tool.name] = handleBroadcast;
for (const tool of analyticsTools) domainHandlers[tool.name] = handleAnalytics;

// ── Server ────────────────────────────────────────────────────────────────────

const client = new ApiClient(baseUrl, email, password);

const server = new Server(
  { name: "craftcontrol-mcp", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: allTools }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args = {} } = request.params;

  const handler = domainHandlers[name];
  if (!handler) {
    return {
      content: [{ type: "text", text: `Unknown tool: ${name}` }],
      isError: true,
    };
  }

  try {
    const result = await handler(client, name, args as Record<string, unknown>);
    return {
      content: [
        {
          type: "text",
          text: typeof result === "string" ? result : JSON.stringify(result, null, 2),
        },
      ],
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      content: [{ type: "text", text: `Error: ${message}` }],
      isError: true,
    };
  }
});

// ── Start ─────────────────────────────────────────────────────────────────────

const transport = new StdioServerTransport();
await server.connect(transport);
console.error(`CraftControl MCP server running (${allTools.length} tools)`);
