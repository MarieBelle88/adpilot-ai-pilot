import { createServerFn } from "@tanstack/react-start";
import { mockRecommendations, mockSummary } from "./adpilot-mock";

export const analyzeAccount = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => JSON.parse(JSON.stringify(data)) as unknown)
  .handler(async ({ data }) => {
    const configEcho = data as Record<string, unknown>;
    // Echo + return mock analysis. Real impl would call AI provider here.
    await new Promise((r) => setTimeout(r, 600));
    return {
      receivedAt: new Date().toISOString(),
      configEcho: data,
      summary: mockSummary,
      recommendations: mockRecommendations,
    };
  });
