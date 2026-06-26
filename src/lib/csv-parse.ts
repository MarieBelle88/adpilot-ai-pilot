export type CampaignRow = {
  date?: string;
  campaign?: string;
  keyword?: string;
  country?: string;
  device?: string;
  impressions?: number;
  clicks?: number;
  cost?: number;
  conversions?: number;
  conversion_value?: number;
  [key: string]: string | number | undefined;
};

const COLUMN_ALIASES: Record<string, keyof CampaignRow> = {
  ad_date: "date",
  date: "date",
  campaign_name: "campaign",
  campaign: "campaign",
  keyword: "keyword",
  location: "country",
  country: "country",
  device: "device",
  impressions: "impressions",
  clicks: "clicks",
  cost: "cost",
  spend: "cost",
  conversions: "conversions",
  sale_amount: "conversion_value",
  conversion_value: "conversion_value",
  revenue: "conversion_value",
};

const NUMERIC_KEYS = new Set([
  "impressions",
  "clicks",
  "cost",
  "conversions",
  "conversion_value",
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

export function parseCampaignCsv(text: string): CampaignRow[] {
  const lines = text.replace(/\r/g, "").split("\n").filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];
  const header = splitCsvLine(lines[0]).map((h) =>
    h.toLowerCase().replace(/\s+/g, "_"),
  );
  const mapped = header.map((h) => COLUMN_ALIASES[h] ?? h);
  const rows: CampaignRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = splitCsvLine(lines[i]);
    const row: CampaignRow = {};
    mapped.forEach((key, idx) => {
      const raw = cells[idx] ?? "";
      if (NUMERIC_KEYS.has(key as string)) {
        const num = Number(raw.replace(/[$,\s]/g, ""));
        row[key as string] = Number.isFinite(num) ? num : 0;
      } else {
        row[key as string] = raw;
      }
    });
    rows.push(row);
  }
  return rows;
}

export function extractUnique(rows: CampaignRow[], key: keyof CampaignRow): string[] {
  const set = new Set<string>();
  for (const r of rows) {
    const v = r[key];
    if (typeof v === "string" && v.length > 0) set.add(v);
  }
  return Array.from(set).sort();
}
