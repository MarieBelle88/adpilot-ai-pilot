// Resolve the backend URL at runtime:
// 1. Env override (VITE_ANALYZE_URL) — set in .env for local dev
// 2. Auto-detect Daytona proxy — swap the frontend port prefix for 8000
// 3. Fallback to localhost
function resolveAnalyzeUrl(): string {
  const envUrl = import.meta.env.VITE_ANALYZE_URL as string | undefined;
  if (envUrl) return envUrl;

  if (typeof window !== "undefined") {
    const host = window.location.hostname;
    // Daytona proxy hostnames look like: 3000-workspaceid.daytonaproxy01.eu
    const daytonaMatch = host.match(/^\d+(-[a-z0-9]+\.daytonaproxy\d+\..+)$/);
    if (daytonaMatch) return `https://8000${daytonaMatch[1]}/analyze`;
  }

  return "http://localhost:8000/analyze";
}

export const ANALYZE_URL = resolveAnalyzeUrl();

export type AnalyzeDataset = {
  filename: string;
  datasetType: string;
  enabled: boolean;
  filters: unknown;
  rows: unknown[];
};

export type AnalyzeRequest = {
  businessGoal: unknown;
  globalRules: unknown;
  actionMode: string;
  datasets: AnalyzeDataset[];
};

export type BackendSummary = {
  spend?: number;
  clicks?: number;
  conversions?: number;
  revenue?: number;
  cpa?: number;
  roas?: number;
  wastedSpend?: number;
  analyzedRows?: number;
  enabledDatasets?: number;
};

export type BackendRecommendation = {
  id?: string;
  title?: string;
  datasetType?: string;
  category?: string;
  target?: string;
  campaign?: string;
  reason?: string;
  ruleTriggered?: string;
  expectedImpact?: string;
  confidence?: number;
  evidence?: string;
  status?: string;
};

export type WebsiteContext = {
  fetchStatus?: string;
  title?: string;
  businessSummary?: string;
  topics?: unknown[];
  headings?: unknown[];
  hasClearCta?: boolean;
  warning?: string;
};

export type WebsiteRecommendation = {
  id?: string;
  title?: string;
  reason?: string;
  evidence?: string;
  expectedImpact?: string;
  confidence?: number;
  [key: string]: unknown;
};

export type AnalyzeResponse = {
  summary?: BackendSummary;
  executiveSummary?:
    | string
    | { headline?: string; findings?: unknown[]; limitations?: unknown[] };
  recommendations?: BackendRecommendation[];
  websiteContext?: WebsiteContext;
  websiteRecommendations?: WebsiteRecommendation[];
};

export async function analyzeAccountApi(
  payload: AnalyzeRequest,
): Promise<AnalyzeResponse> {
  const res = await fetch(ANALYZE_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Daytona-Skip-Preview-Warning": "true",
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `Analyze request failed: ${res.status} ${res.statusText}${text ? ` — ${text.slice(0, 300)}` : ""}`,
    );
  }
  return (await res.json()) as AnalyzeResponse;
}
