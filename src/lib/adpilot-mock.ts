export type Recommendation = {
  id: string;
  tab: "opportunities" | "risks" | "ad_copy" | "landing_pages";
  action: string;
  target: string;
  targetType: "campaign" | "keyword" | "search_term" | "ad" | "landing_page";
  evidence: string;
  rule: string;
  impact: string;
  confidence: number;
};

export const mockSummary = {
  spend: 18420.55,
  conversions: 142,
  cpa: 129.72,
  roas: 2.84,
  impressions: 1_284_530,
  clicks: 34_210,
  ctr: 2.66,
  wastedSpend: 3240.12,
  trackingHealthy: false,
  trackingNote: "12% of conversions missing gclid — verify tag on /thank-you.",
};

export const mockRecommendations: Recommendation[] = [
  {
    id: "r1",
    tab: "opportunities",
    action: "Increase bid +18% on keyword [enterprise crm software]",
    target: "[enterprise crm software] · Campaign: Brand-Search-US",
    targetType: "keyword",
    evidence: "32 conv, CPA $48 (52% below target), impression share lost to rank 41%",
    rule: "High-converter under-bid",
    impact: "+ ~18 conv/mo at target CPA",
    confidence: 0.92,
  },
  {
    id: "r2",
    tab: "risks",
    action: "Pause keyword 'free crm download'",
    target: "free crm download · Campaign: Generic-Search-US",
    targetType: "keyword",
    evidence: "$612 spend, 0 conversions in 30 days, 1,840 clicks",
    rule: "Zero-conversion spend threshold ($400)",
    impact: "Save ~$612/mo",
    confidence: 0.96,
  },
  {
    id: "r3",
    tab: "risks",
    action: "Add negative: 'jobs'",
    target: 'Search term: "crm software jobs" · Campaign: Generic-Search-US',
    targetType: "search_term",
    evidence: "118 clicks, $214 spend, 0 conversions",
    rule: "Irrelevant search term",
    impact: "Save ~$210/mo",
    confidence: 0.88,
  },
  {
    id: "r4",
    tab: "opportunities",
    action: "Reallocate $40/day from Display-Retarget to Brand-Search-US",
    target: "Campaign: Display-Retarget",
    targetType: "campaign",
    evidence: "Display CPA $312 vs target $120; Brand limited by budget 6/7 days",
    rule: "Budget reallocation",
    impact: "+ ~9 conv/mo",
    confidence: 0.81,
  },
  {
    id: "r5",
    tab: "ad_copy",
    action: "Test new RSA headline: 'Close Deals 2× Faster — Free 14-Day Trial'",
    target: "Ad group: Enterprise-CRM",
    targetType: "ad",
    evidence: "Top performing headline CTR plateaued at 3.1% for 21 days",
    rule: "Ad fatigue",
    impact: "+ ~0.4pp CTR (modeled)",
    confidence: 0.74,
  },
  {
    id: "r6",
    tab: "ad_copy",
    action: "Add sitelink: 'Pricing' and 'Customer Stories'",
    target: "Campaign: Brand-Search-US",
    targetType: "ad",
    evidence: "Missing assets — sitelink CTR uplift benchmark +12%",
    rule: "Missing assets",
    impact: "+ ~6% CTR",
    confidence: 0.83,
  },
  {
    id: "r7",
    tab: "landing_pages",
    action: "Route 'demo request' keywords to /demo instead of /",
    target: "Landing page: / (home)",
    targetType: "landing_page",
    evidence: "Bounce 71% on home from paid; /demo bounce 38%, conv 4.2%",
    rule: "Landing page mismatch",
    impact: "+ ~12 conv/mo",
    confidence: 0.86,
  },
  {
    id: "r8",
    tab: "landing_pages",
    action: "Fix mobile LCP on /pricing (4.8s → target <2.5s)",
    target: "Landing page: /pricing",
    targetType: "landing_page",
    evidence: "Mobile conv rate 0.8% vs desktop 3.1%; LCP 4.8s",
    rule: "Page speed",
    impact: "+ ~7 conv/mo",
    confidence: 0.7,
  },
];

export const mockCampaigns = [
  "Brand-Search-US",
  "Generic-Search-US",
  "Display-Retarget",
  "Performance-Max-Global",
  "YouTube-Awareness",
];

export const mockCountries = ["United States", "United Kingdom", "Canada", "Germany", "Australia"];
