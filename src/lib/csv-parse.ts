import Papa from "papaparse";

export type DatasetType = "keyword" | "ad_group" | "market" | "unknown";

export type CampaignRow = Record<string, string | number | null | undefined> & {
  _raw?: Record<string, string>;
  _derived?: Record<string, string | undefined>;
  _problems?: string[];
};

export const DATASET_LABELS: Record<DatasetType, string> = {
  keyword: "Keyword performance",
  ad_group: "Ad-group profitability",
  market: "Market campaign",
  unknown: "Unknown",
};

// Map normalized snake_case header -> canonical field name.
// Keys here are the result of `baseNormalize` applied to the raw header.
const COLUMN_ALIASES: Record<string, string> = {
  // Keyword performance
  ad_id: "ad_id",
  campaign_name: "campaign",
  ad_date: "date",
  sale_amount: "sale_amount", // overridden below per dataset; keyword treats as conversion_value
  conversion_rate: "source_conversion_rate",
  // Ad-group profitability
  ad_group: "ad_group",
  ad_group_name: "ad_group",
  adgroup: "ad_group",
  conv_rate: "source_conversion_rate",
  "p_l": "profit_loss",
  "p&l": "profit_loss",
  profit_loss: "profit_loss",
  // Market campaign
  ad_spend: "spend",
  cost: "spend",
  cpa: "source_cpa",
  ctr: "source_ctr",
  cpc: "source_cpc",
  roas: "source_roas",
  // common
  location: "location",
  country: "country",
  device: "device",
  keyword: "keyword",
  campaign: "campaign",
  campaign_type: "campaign_type",
  platform: "platform",
  industry: "industry",
  date: "date",
  month: "month",
  impressions: "impressions",
  clicks: "clicks",
  leads: "leads",
  conversions: "conversions",
  revenue: "revenue",
  conversion_value: "conversion_value",
};

const NUMERIC_KEYS = new Set([
  "impressions",
  "clicks",
  "spend",
  "leads",
  "conversions",
  "conversion_value",
  "sale_amount",
  "revenue",
  "profit_loss",
  "source_cpa",
  "source_roas",
  "source_ctr",
  "source_cpc",
  "source_conversion_rate",
]);

const PERCENT_KEYS = new Set(["source_ctr", "source_conversion_rate"]);

function baseNormalize(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/&/g, "_")
    .replace(/[\s\-/]+/g, "_")
    .replace(/[^a-z0-9_]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
}

export function normalizeHeader(raw: string, datasetHint?: DatasetType): string {
  const base = baseNormalize(raw);
  let mapped = COLUMN_ALIASES[base] ?? base;
  // Dataset-specific overrides:
  // In KEYWORD dataset, Sale_Amount means conversion_value.
  // In AD-GROUP dataset, Sale Amount is a separate `sale_amount` field next to Revenue.
  if (mapped === "sale_amount" && datasetHint === "keyword") {
    mapped = "conversion_value";
  }
  return mapped;
}

function parseNumber(raw: string, key: string): { value: number | null; problem?: string } {
  if (raw == null) return { value: null };
  const s = raw.trim();
  if (s === "" || s === "-" || s.toLowerCase() === "n/a" || s.toLowerCase() === "null") {
    return { value: null };
  }
  const hasPercent = /%/.test(s);
  const cleaned = s.replace(/[$€£¥,\s]/g, "").replace(/%/g, "");
  // Allow leading parentheses for negatives e.g. "(1,234.56)"
  let normalized = cleaned;
  let neg = false;
  if (/^\(.*\)$/.test(normalized)) {
    neg = true;
    normalized = normalized.slice(1, -1);
  }
  const n = Number(normalized);
  if (!Number.isFinite(n)) return { value: null, problem: `invalid number in ${key}` };
  let out = neg ? -n : n;
  if (hasPercent || PERCENT_KEYS.has(key)) {
    // Always store percent fields as a fraction (e.g. 2.5% -> 0.025; "0.025" stays 0.025)
    if (hasPercent || out > 1) out = out / 100;
  }
  return { value: out };
}

function parseDate(raw: string): { iso: string | null; valid: boolean } {
  const s = (raw ?? "").trim();
  if (!s) return { iso: null, valid: false };
  // Try native parser first
  const d1 = new Date(s);
  if (!isNaN(d1.getTime())) return { iso: d1.toISOString().slice(0, 10), valid: true };
  // Try DD/MM/YYYY or MM/DD/YYYY
  const m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
  if (m) {
    let [_, a, b, y] = m;
    const yr = y.length === 2 ? `20${y}` : y;
    // Heuristic: if a > 12, it's day-first
    const day = Number(a) > 12 ? a : b;
    const mon = Number(a) > 12 ? b : a;
    const iso = `${yr}-${mon.padStart(2, "0")}-${day.padStart(2, "0")}`;
    const d = new Date(iso);
    if (!isNaN(d.getTime())) return { iso, valid: true };
  }
  // YYYYMMDD
  const m2 = s.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (m2) {
    const iso = `${m2[1]}-${m2[2]}-${m2[3]}`;
    const d = new Date(iso);
    if (!isNaN(d.getTime())) return { iso, valid: true };
  }
  return { iso: null, valid: false };
}

function normalizeDevice(raw: string): string {
  const s = raw.trim().toLowerCase();
  if (!s) return "";
  if (s.startsWith("mob")) return "Mobile";
  if (s.startsWith("desk") || s.startsWith("pc") || s === "computer" || s.startsWith("comp")) return "Desktop";
  if (s.startsWith("tab")) return "Tablet";
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function deriveFromAdGroupName(name: string): {
  device?: string;
  keyword_theme?: string;
} {
  const derived: { device?: string; keyword_theme?: string } = {};
  if (/mob/i.test(name)) derived.device = "Mobile";
  else if (/desk/i.test(name)) derived.device = "Desktop";
  const m = name.match(/\[([^\]]+)\]/);
  if (m) derived.keyword_theme = m[1].trim();
  return derived;
}

export type ParsedCsv = {
  columns: string[];
  rawHeaders: string[];
  rows: CampaignRow[];
  detectedType: DatasetType;
  stats: {
    totalRows: number;
    usableRows: number;
    problematicRows: number;
    invalidDates: number;
    missingByColumn: Record<string, number>;
  };
};

export function parseCampaignCsv(text: string): ParsedCsv {
  const res = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
  });
  const rawHeaders = (res.meta.fields ?? []).map((h) => h.trim());

  // First pass: tentative normalization (no dataset hint) to detect type
  const tentative = rawHeaders.map((h) => normalizeHeader(h));
  const detectedType = detectDatasetType(tentative);
  // Second pass: re-normalize with hint (affects sale_amount mapping)
  const columns = rawHeaders.map((h) => normalizeHeader(h, detectedType));

  const missingByColumn: Record<string, number> = {};
  columns.forEach((c) => (missingByColumn[c] = 0));
  let invalidDates = 0;
  let problematicRows = 0;

  const rows: CampaignRow[] = (res.data || []).map((r) => {
    const out: CampaignRow = {};
    const rawMap: Record<string, string> = {};
    const problems: string[] = [];

    rawHeaders.forEach((raw, i) => {
      const key = columns[i];
      const rawVal = (r[raw] ?? "").toString();
      rawMap[key] = rawVal;
      const trimmed = rawVal.trim();

      if (trimmed === "") {
        out[key] = null;
        missingByColumn[key] = (missingByColumn[key] ?? 0) + 1;
        return;
      }

      if (key === "date") {
        const { iso, valid } = parseDate(trimmed);
        if (!valid) {
          invalidDates += 1;
          problems.push("invalid_date");
          out[key] = null;
        } else {
          out[key] = iso;
        }
        return;
      }

      if (key === "device") {
        out[key] = normalizeDevice(trimmed);
        return;
      }

      if (NUMERIC_KEYS.has(key)) {
        const { value, problem } = parseNumber(trimmed, key);
        if (value === null) {
          missingByColumn[key] = (missingByColumn[key] ?? 0) + 1;
          if (problem) problems.push(problem);
          out[key] = null;
        } else {
          out[key] = value;
        }
        return;
      }

      out[key] = trimmed;
    });

    // Derive optional fields from ad_group name
    if (detectedType === "ad_group" && typeof out.ad_group === "string" && out.ad_group) {
      const derived = deriveFromAdGroupName(out.ad_group);
      if (derived.device && !out.device) out.device = derived.device;
      out._derived = derived;
    }

    out._raw = rawMap;
    if (problems.length) out._problems = problems;
    if (problems.length) problematicRows += 1;
    return out;
  });

  return {
    columns,
    rawHeaders,
    rows,
    detectedType,
    stats: {
      totalRows: rows.length,
      usableRows: rows.length - problematicRows,
      problematicRows,
      invalidDates,
      missingByColumn,
    },
  };
}

export function detectDatasetType(columns: string[]): DatasetType {
  const h = new Set(columns);
  const score = { market: 0, ad_group: 0, keyword: 0 };
  ["platform", "campaign_type", "industry", "source_cpa", "source_roas"].forEach((k) => h.has(k) && score.market++);
  ["month", "ad_group", "profit_loss", "revenue", "sale_amount"].forEach((k) => h.has(k) && score.ad_group++);
  ["keyword", "ad_id", "date", "device", "location"].forEach((k) => h.has(k) && score.keyword++);
  if (h.has("platform") || h.has("campaign_type") || h.has("source_roas")) score.market += 2;
  if (h.has("ad_group") && (h.has("revenue") || h.has("profit_loss") || h.has("month"))) score.ad_group += 2;
  if (h.has("keyword") || h.has("ad_id")) score.keyword += 2;

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
    else if (typeof v === "number") set.add(String(v));
  }
  return Array.from(set).sort();
}
