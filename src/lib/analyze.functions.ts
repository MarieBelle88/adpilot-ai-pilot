import { createServerFn } from "@tanstack/react-start";
import { mockRecommendations, mockSummary } from "./adpilot-mock";

export const analyzeAccount = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => JSON.stringify(data))
  .handler(async ({ data }) => {
    // Real impl would call AI provider here. data is a JSON string echoed back.
    await new Promise((r) => setTimeout(r, 600));
    return {
      receivedAt: new Date().toISOString(),
      configEcho: data,
      summary: mockSummary,
      recommendations: mockRecommendations,
    };
  });
