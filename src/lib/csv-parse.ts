export type DatasetType = "keyword" | "ad_group" | "market" | "unknown";

export type CampaignRow = {
  [key: string]: string | number | undefined;
};

const COLUMN_ALIASES: Record<string, string> = {
  ad_date: "date",
  date: "date",
  month: "month",
  campaign_name: "campaign",
  campaign: "campaign",
  keyword: "keyword",
  ad_group: "ad_group",
  "ad group": "ad_group",
  adgroup: "ad_group",
  location: "country",
  country: "country",
  device: "device",
  platform: "platform",
  campaign_type: "campaign_type",
  industry: "industry",
  impressions: "impressions",
  clicks: "clicks",
  cost: "cost",
  spend: "cost",
  ad_spend: "cost",
  leads: "leads",
  conversions: "conversions",
  sale_amount: "conversion_value",
  conversion_value: "conversion_value",
  revenue: "conversion_value",
  profit: "profit",
  loss: "profit",
  "profit/loss": "profit",
  profit_loss: "profit",
  cpa: "cpa",
  roas: "roas",
};

const NUMERIC_KEYS = new Set([
  "impressions",
  "clicks",
  "cost",
  "leads",
  "conversions",
  "conversion_value",
  "profit",
  "cpa",
  "roas",
]);

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQ) {
      if (c === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (c === '"') {
        inQ = false;
      } else {
        cur += c;
      }
    } else if (c === '"') {
      inQ = true;
    } else if (c === ",") {
      out.push(cur);
      cur = "";
    } else {
      cur += c;
    }
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

export type ParsedCsv = {
  headers: string[]; // normalized header names
  rawHeaders: string[]; // original headers
  rows: CampaignRow[];
  detectedType: DatasetType;
};

export function parseCampaignCsv(text: string): ParsedCsv {
  const lines = text.replace(/\r/g, "").split("\n").filter((l) => l.trim().length > 0);
  if (lines.length < 2) return { headers: [], rawHeaders: [], rows: [], detectedType: "unknown" };
  const rawHeaders = splitCsvLine(lines[0]);
  const headerKeys = rawHeaders.map((h) => h.toLowerCase().replace(/\s+/g, "_"));
  const mapped = headerKeys.map((h) => COLUMN_ALIASES[h] ?? COLUMN_ALIASES[h.replace(/_/g, " ")] ?? h);
  const rows: CampaignRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = splitCsvLine(lines[i]);
    const row: CampaignRow = {};
    mapped.forEach((key, idx) => {
      const raw = cells[idx] ?? "";
      if (NUMERIC_KEYS.has(key)) {
        const num = Number(raw.replace(/[$,%\s]/g, ""));
        row[key] = Number.isFinite(num) ? num : 0;
      } else {
        row[key] = raw;
      }
    });
    rows.push(row);
  }
  return {
    headers: mapped,
    rawHeaders,
    rows,
    detectedType: detectDatasetType(mapped),
  };
}

export function detectDatasetType(headers: string[]): DatasetType {
  const h = new Set(headers);
  if (h.has("platform") || h.has("industry") || h.has("roas") || h.has("campaign_type")) {
    return "market";
  }
  if (h.has("ad_group")) return "ad_group";
  if (h.has("keyword")) return "keyword";
  return "unknown";
}

export function extractUnique(rows: CampaignRow[], key: string): string[] {
  const set = new Set<string>();
  for (const r of rows) {
    const v = r[key];
    if (typeof v === "string" && v.length > 0) set.add(v);
  }
  return Array.from(set).sort();
}

export const DATASET_LABELS: Record<DatasetType, string> = {
  keyword: "Keyword performance",
  ad_group: "Ad-group profitability",
  market: "Market campaign",
  unknown: "Unknown",
};
