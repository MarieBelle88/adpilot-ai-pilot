// Live backend API client
const BACKEND_BASE =
  (import.meta.env.VITE_BACKEND_URL as string) || "https://3000-hlubhs2z5gbz7r2s.daytonaproxy01.eu";

export const ANALYZE_URL = `${BACKEND_BASE.replace(/\/$/, "")}/analyze`;

export type AnalyzeDataset = {
  filename: string;
  datasetType: string;
  enabled: boolean;
  filters: unknown;
  rows: unknown[];
};

export type AnalyzeRequest = {
  websiteUrl: string;
  marketingNotes: string;
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
  cpa?: number | null;
  roas?: number | null;
  wastedSpend?: number;
  analyzedRows?: number;
  enabledDatasets?: number;
  dataQualityWarnings?: string[];
};

export type BackendEvidence = {
  spend: number;
  clicks: number;
  conversions: number;
  cpa: number | null;
  roas: number | null;
  profit: number;
};

export type BackendRecommendation = {
  id?: string;
  title?: string;
  datasetType?: string;
  category?: string;
  actionType?: string;
  target?: string;
  campaign?: string;
  reason?: string;
  ruleTriggered?: string;
  expectedImpact?: string;
  confidence?: number;
  evidence?: BackendEvidence;
  status?: string;
  websiteRelevance?: number;
};

export type WebsiteContext = {
  url?: string;
  finalUrl?: string;
  fetchStatus?: string;
  title?: string;
  metaDescription?: string;
  businessSummary?: string;
  topics?: string[];
  headings?: string[];
  hasClearCta?: boolean;
  warning?: string;
};

export type WebsiteRecommendation = {
  type?: string;
  title?: string;
  reason?: string;
  [key: string]: unknown;
};

export type AnalyzeResponse = {
  analysisId?: string;
  generatedAt?: string;
  summary?: BackendSummary;
  executiveSummary?: string | { headline?: string; findings?: string[]; limitations?: string[] };
  recommendations?: BackendRecommendation[];
  websiteContext?: WebsiteContext;
  websiteRecommendations?: WebsiteRecommendation[];
  datasetResults?: Array<Record<string, unknown>>;
};

export async function analyzeAccountApi(payload: AnalyzeRequest): Promise<AnalyzeResponse> {
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
