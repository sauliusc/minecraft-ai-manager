#!/usr/bin/env node
/**
 * CraftControl MCP Server
 *
 * Two transport modes:
 *   • stdio  — default; use in Claude Desktop / Claude Code config as a local subprocess
 *   • SSE    — when PORT is set; runs as an HTTP service (Docker Compose mode)
 *              Claude connects to http://host:PORT/sse
 *
 * Configuration (env vars):
 *   CRAFTCONTROL_URL       — Base URL of the CraftControl API  (required)
 *   CRAFTCONTROL_EMAIL     — Admin account email               (required)
 *   CRAFTCONTROL_PASSWORD  — Admin account password            (required)
 *   PORT                   — If set, start in SSE/HTTP mode on this port
 *   MCP_AUTH_TOKEN         — If set, require this bearer token on /sse requests
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import express from "express";
import type { Request, Response } from "express";

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
const port = process.env.PORT ? parseInt(process.env.PORT, 10) : null;
const authToken = process.env.MCP_AUTH_TOKEN || null;

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

// ── MCP server factory ────────────────────────────────────────────────────────

function createMcpServer(client: ApiClient): Server {
  const server = new Server(
    { name: "craftcontrol-mcp", version: "1.0.0" },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: allTools }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args = {} } = request.params;
    const handler = domainHandlers[name];
    if (!handler) {
      return { content: [{ type: "text", text: `Unknown tool: ${name}` }], isError: true };
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
      return { content: [{ type: "text", text: `Error: ${message}` }], isError: true };
    }
  });

  return server;
}

// ── Start ─────────────────────────────────────────────────────────────────────

const client = new ApiClient(baseUrl, email, password);

if (port) {
  // ── SSE / HTTP mode (Docker) ───────────────────────────────────────────────
  const app = express();
  app.use(express.json());

  // Active SSE sessions: sessionId → transport
  const sessions = new Map<string, SSEServerTransport>();

  // Optional bearer-token auth guard
  const authGuard = (req: Request, res: Response, next: () => void) => {
    if (!authToken) return next();
    const header = req.headers.authorization ?? "";
    if (header === `Bearer ${authToken}`) return next();
    res.status(401).json({ error: "Unauthorized" });
  };

  app.get("/sse", authGuard, async (_req: Request, res: Response) => {
    const transport = new SSEServerTransport("/messages", res);
    sessions.set(transport.sessionId, transport);
    res.on("close", () => sessions.delete(transport.sessionId));

    const server = createMcpServer(client);
    await server.connect(transport);
  });

  app.post("/messages", async (req: Request, res: Response) => {
    const sessionId = req.query.sessionId as string;
    const transport = sessions.get(sessionId);
    if (!transport) {
      res.status(404).json({ error: "Session not found" });
      return;
    }
    await transport.handlePostMessage(req, res);
  });

  app.get("/health", (_req: Request, res: Response) => {
    res.json({ status: "ok", tools: allTools.length });
  });

  app.listen(port, () => {
    console.error(
      `CraftControl MCP server (SSE mode) listening on :${port} — ${allTools.length} tools`
    );
    if (authToken) console.error("Auth: bearer token required");
  });
} else {
  // ── stdio mode (local / Claude CLI) ───────────────────────────────────────
  const server = createMcpServer(client);
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`CraftControl MCP server (stdio mode) — ${allTools.length} tools`);
}
