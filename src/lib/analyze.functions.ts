const BACKEND_URL = (import.meta.env.VITE_BACKEND_URL as string) || "http://localhost:8000";

export async function analyzeAccount({ data }: { data: unknown }) {
  const response = await fetch(`${BACKEND_URL}/api/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => response.statusText);
    throw new Error(`Backend error ${response.status}: ${detail}`);
  }

  return response.json() as Promise<{
    summary: {
      spend: number;
      conversions: number;
      cpa: number;
      roas: number;
      impressions: number;
      clicks: number;
      ctr: number;
      wastedSpend: number;
      trackingHealthy: boolean;
      trackingNote: string;
    };
    recommendations: Array<{
      id: string;
      tab: "opportunities" | "risks" | "ad_copy" | "landing_pages";
      action: string;
      target: string;
      targetType: "campaign" | "keyword" | "search_term" | "ad" | "landing_page";
      evidence: string;
      rule: string;
      impact: string;
      confidence: number;
    }>;
  }>;
}
