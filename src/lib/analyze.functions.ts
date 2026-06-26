import { createServerFn } from "@tanstack/react-start";
import { mockRecommendations, mockSummary } from "./adpilot-mock";

export const analyzeAccount = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => data as Record<string, unknown>)
  .handler(async ({ data }) => {
    // Echo + return mock analysis. Real impl would call AI provider here.
    await new Promise((r) => setTimeout(r, 600));
    return {
      receivedAt: new Date().toISOString(),
      configEcho: data,
      summary: mockSummary,
      recommendations: mockRecommendations,
    };
  });
