import Papa from "papaparse";

export type DatasetType = "keyword" | "ad_group" | "market" | "unknown";

export type CampaignRow = Record<string, string | number | undefined>;

export const DATASET_LABELS: Record<DatasetType, string> = {
  keyword: "Keyword performance",
  ad_group: "Ad-group profitability",
  market: "Market campaign",
  unknown: "Unknown",
};

const COLUMN_ALIASES: Record<string, string> = {
  ad_date: "date",
  campaign_name: "campaign",
  ad_group_name: "ad_group",
  adgroup: "ad_group",
  location: "country",
  cost: "spend",
  ad_spend: "spend",
  spend: "spend",
  sale_amount: "conversion_value",
  conversion_value: "conversion_value",
  revenue: "revenue",
  "profit/loss": "profit",
  profit_loss: "profit",
  loss: "profit",
};

const NUMERIC_KEYS = new Set([
  "impressions",
  "clicks",
  "spend",
  "leads",
  "conversions",
  "conversion_value",
  "revenue",
  "profit",
  "cpa",
  "roas",
]);

export function normalizeHeader(raw: string): string {
  const base = raw.trim().toLowerCase().replace(/[\s-]+/g, "_");
  return COLUMN_ALIASES[base] ?? base;
}

export type ParsedCsv = {
  columns: string[];
  rawHeaders: string[];
  rows: CampaignRow[];
  detectedType: DatasetType;
};

export function parseCampaignCsv(text: string): ParsedCsv {
  const res = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
  });
  const rawHeaders = (res.meta.fields ?? []).map((h) => h.trim());
  const columns = rawHeaders.map(normalizeHeader);
  const rows: CampaignRow[] = (res.data || []).map((r) => {
    const out: CampaignRow = {};
    rawHeaders.forEach((raw, i) => {
      const key = columns[i];
      const val = (r[raw] ?? "").toString();
      if (NUMERIC_KEYS.has(key)) {
        const n = Number(val.replace(/[$,%\s]/g, ""));
        out[key] = Number.isFinite(n) ? n : 0;
      } else {
        out[key] = val.trim();
      }
    });
    return out;
  });
  return { columns, rawHeaders, rows, detectedType: detectDatasetType(columns) };
}

export function detectDatasetType(columns: string[]): DatasetType {
  const h = new Set(columns);
  const score = {
    market: 0,
    ad_group: 0,
    keyword: 0,
  };
  ["platform", "campaign_type", "industry", "cpa", "roas"].forEach((k) => h.has(k) && score.market++);
  ["month", "ad_group", "profit", "revenue"].forEach((k) => h.has(k) && score.ad_group++);
  ["keyword", "date", "device", "country"].forEach((k) => h.has(k) && score.keyword++);
  // Strong signals
  if (h.has("platform") || h.has("campaign_type") || h.has("roas")) score.market += 2;
  if (h.has("ad_group") && (h.has("revenue") || h.has("profit") || h.has("month"))) score.ad_group += 2;
  if (h.has("keyword")) score.keyword += 2;

  const max = Math.max(score.market, score.ad_group, score.keyword);
  if (max === 0) return "unknown";
  if (score.market === max) return "market";
  if (score.ad_group === max) return "ad_group";
  return "keyword";
}

export function extractUnique(rows: CampaignRow[], key: string): string[] {
  const set = new Set<string>();
  for (const r of rows) {
    const v = r[key];
    if (typeof v === "string" && v.length > 0) set.add(v);
  }
  return Array.from(set).sort();
}
