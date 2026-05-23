import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import type { ApiClient } from "../api-client.js";

export const analyticsTools: Tool[] = [
  {
    name: "get_retention_stats",
    description: "Get DAU/WAU/MAU player retention stats and the engagement funnel.",
    inputSchema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "get_challenge_analytics",
    description: "Get per-challenge completion rates and engagement stats.",
    inputSchema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "get_economy_analytics",
    description: "Get top reward grant recipients and most popular rewards.",
    inputSchema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "get_churn_risk",
    description:
      "Get a list of players at risk of churning (inactive players who may not return).",
    inputSchema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "get_engagement_heatmap",
    description: "Get a 24×7 engagement heatmap showing when players are most active.",
    inputSchema: { type: "object", properties: {}, required: [] },
  },
];

export async function handleAnalytics(
  client: ApiClient,
  name: string,
  _args: Record<string, unknown>
): Promise<unknown> {
  switch (name) {
    case "get_retention_stats":
      return client.get("/api/analytics/retention");

    case "get_challenge_analytics":
      return client.get("/api/analytics/challenges");

    case "get_economy_analytics":
      return client.get("/api/analytics/economy");

    case "get_churn_risk":
      return client.get("/api/analytics/churn-risk");

    case "get_engagement_heatmap":
      return client.get("/api/analytics/heatmap");

    default:
      throw new Error(`Unknown analytics tool: ${name}`);
  }
}
