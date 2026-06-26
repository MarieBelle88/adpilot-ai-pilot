import json
import time
from pathlib import Path
from typing import Any, Dict, List, Optional

import requests as http_requests
from bs4 import BeautifulSoup
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

app = FastAPI(title="AdPilot AI Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

BASE_DIR = Path(__file__).parent


def scrape_website(url: str) -> str:
    """Fetch a URL and return cleaned text content (title, headings, body)."""
    try:
        headers = {"User-Agent": "Mozilla/5.0 (compatible; AdPilotBot/1.0; +https://adpilot.ai)"}
        resp = http_requests.get(url, headers=headers, timeout=8)
        resp.raise_for_status()
        soup = BeautifulSoup(resp.text, "html.parser")
        for tag in soup(["script", "style", "nav", "footer", "head"]):
            tag.decompose()
        title = soup.title.string.strip() if soup.title else ""
        meta = soup.find("meta", attrs={"name": "description"})
        meta_desc = meta.get("content", "").strip() if meta else ""
        headings = [h.get_text(strip=True) for h in soup.find_all(["h1", "h2", "h3"])[:12]]
        lines = [l.strip() for l in soup.get_text(separator="\n").splitlines() if l.strip()]
        body = "\n".join(lines)[:2500]
        parts = [f"URL: {url}"]
        if title:
            parts.append(f"TITLE: {title}")
        if meta_desc:
            parts.append(f"META DESCRIPTION: {meta_desc}")
        if headings:
            parts.append("HEADINGS: " + " | ".join(headings))
        parts.append(f"\nBODY:\n{body}")
        return "\n".join(parts)
    except Exception as exc:
        return f"[Could not scrape {url}: {exc}]"


class AnalyzeRequest(BaseModel):
    config: Dict[str, Any]
    filters: Dict[str, Any]
    rules: Dict[str, Any]
    actionMode: str
    campaignsData: Dict[str, Any]


def analyze_ads_data(data: dict, config: dict, rules: dict) -> dict:
    """Rule-based analysis — no API key required."""
    keywords = data.get("keywords", [])
    campaigns = data.get("campaigns", [])
    search_terms = data.get("searchTerms", [])
    ads = data.get("ads", [])
    landing_pages = data.get("landingPages", [])
    account = data.get("account", {})

    zero_conv_threshold = rules.get("zeroConvSpend", 400)
    high_cpa_pct = rules.get("highCpaPct", 150) / 100
    target_kpi = config.get("targetKpi", 120) or 120

    total_spend = sum(k.get("spend", 0) for k in keywords)
    total_clicks = sum(k.get("clicks", 0) for k in keywords)
    total_impressions = sum(k.get("impressions", 0) for k in keywords)
    total_conversions = sum(k.get("conversions", 0) for k in keywords)
    cpa = total_spend / total_conversions if total_conversions else 0
    ctr = (total_clicks / total_impressions * 100) if total_impressions else 0

    # Estimate revenue at 3× CPA for ROAS
    roas = round((total_conversions * target_kpi * 3) / total_spend, 2) if total_spend else 0

    wasted_spend = sum(
        k.get("spend", 0)
        for k in keywords
        if k.get("conversions", 0) == 0 and k.get("spend", 0) >= zero_conv_threshold
    )

    recommendations = []
    rec_id = 1

    # ── RISKS: zero-conversion keywords ────────────────────────────────────────
    for kw in keywords:
        spend = kw.get("spend", 0)
        convs = kw.get("conversions", 0)
        if convs == 0 and spend >= zero_conv_threshold:
            weekly = round(spend / 4, 2)
            recommendations.append({
                "id": f"r{rec_id}",
                "tab": "risks",
                "action": f"Pause keyword '{kw['text']}'",
                "target": f"{kw['text']} · Match: {kw.get('matchType', 'BROAD')}",
                "targetType": "keyword",
                "evidence": f"€{spend:.0f} spend, {kw.get('clicks', 0)} clicks, 0 conversions in 30 days",
                "rule": "Zero-conversion spend threshold",
                "impact": f"Save ~€{weekly:.0f}/week",
                "confidence": 0.95,
            })
            rec_id += 1

    # ── RISKS: high-CPA keywords ────────────────────────────────────────────────
    for kw in keywords:
        convs = kw.get("conversions", 0)
        spend = kw.get("spend", 0)
        if convs > 0 and spend > 0:
            kw_cpa = spend / convs
            if kw_cpa > target_kpi * high_cpa_pct and spend > 100:
                recommendations.append({
                    "id": f"r{rec_id}",
                    "tab": "risks",
                    "action": f"Reduce bid on '{kw['text']}' — CPA {kw_cpa:.0f}% above target",
                    "target": f"{kw['text']} · Campaign: {_campaign_name(campaigns, kw.get('campaignId'))}",
                    "targetType": "keyword",
                    "evidence": f"CPA €{kw_cpa:.0f} vs target €{target_kpi} — {kw_cpa/target_kpi*100:.0f}% of target",
                    "rule": "High CPA threshold",
                    "impact": f"Reduce CPA by ~€{kw_cpa - target_kpi:.0f}",
                    "confidence": 0.82,
                })
                rec_id += 1

    # ── RISKS: irrelevant search terms ──────────────────────────────────────────
    job_terms = [st for st in search_terms if "job" in st.get("term", "").lower() or "apprentice" in st.get("term", "").lower()]
    if job_terms:
        total_job_spend = sum(st.get("spend", 0) for st in job_terms)
        total_job_clicks = sum(st.get("clicks", 0) for st in job_terms)
        recommendations.append({
            "id": f"r{rec_id}",
            "tab": "risks",
            "action": "Add negative keyword: 'jobs', 'apprenticeship', 'career'",
            "target": f"Search terms: {', '.join(st['term'] for st in job_terms[:2])}",
            "targetType": "search_term",
            "evidence": f"{total_job_clicks} clicks, €{total_job_spend:.0f} spend, 0 conversions — job-seekers, not customers",
            "rule": "Irrelevant search term",
            "impact": f"Save ~€{total_job_spend/4:.0f}/week",
            "confidence": 0.92,
        })
        rec_id += 1

    # ── OPPORTUNITIES: high-performing keywords under-bid ───────────────────────
    for kw in keywords:
        convs = kw.get("conversions", 0)
        spend = kw.get("spend", 0)
        impressions = kw.get("impressions", 0)
        if convs >= 4 and spend > 0:
            kw_cpa = spend / convs
            if kw_cpa < target_kpi * 0.7 and impressions > 5000:
                extra_conv = round(convs * 0.2)
                recommendations.append({
                    "id": f"r{rec_id}",
                    "tab": "opportunities",
                    "action": f"Increase bid +20% on '{kw['text']}' — CPA well below target",
                    "target": f"{kw['text']} · Campaign: {_campaign_name(campaigns, kw.get('campaignId'))}",
                    "targetType": "keyword",
                    "evidence": f"{convs} conv, CPA €{kw_cpa:.0f} ({100-round(kw_cpa/target_kpi*100)}% below target €{target_kpi}), QS {kw.get('qualityScore', '?')}",
                    "rule": "High-converter under-bid",
                    "impact": f"+ ~{extra_conv} conv/mo at current CPA",
                    "confidence": 0.88,
                })
                rec_id += 1

    # ── OPPORTUNITIES: budget-limited top campaign ───────────────────────────────
    top_camp = max(campaigns, key=lambda c: c.get("conversions", 0), default=None)
    bottom_camp = min(
        [c for c in campaigns if c.get("conversions", 0) <= 2 and c.get("spend", 0) > 200],
        key=lambda c: c.get("roas", 99),
        default=None,
    )
    if top_camp and bottom_camp and top_camp["id"] != bottom_camp["id"]:
        shift = round(bottom_camp.get("dailyBudget", 30) * 0.3)
        extra = round(top_camp.get("conversions", 0) * 0.15)
        recommendations.append({
            "id": f"r{rec_id}",
            "tab": "opportunities",
            "action": f"Reallocate €{shift}/day from '{bottom_camp['name']}' to '{top_camp['name']}'",
            "target": f"Campaign: {bottom_camp['name']}",
            "targetType": "campaign",
            "evidence": f"{bottom_camp['name']} ROAS {bottom_camp.get('roas', '?')}× vs {top_camp['name']} ROAS {top_camp.get('roas', '?')}×",
            "rule": "Budget reallocation",
            "impact": f"+ ~{extra} conv/mo",
            "confidence": 0.79,
        })
        rec_id += 1

    # ── AD COPY: low-CTR RSA ────────────────────────────────────────────────────
    for ad in ads:
        ctr_val = ad.get("ctr", 0)
        convs = ad.get("conversions", 0)
        clicks = ad.get("clicks", 0)
        if clicks > 500 and convs > 0:
            conv_rate = convs / clicks * 100
            if ctr_val < 3.5:
                recommendations.append({
                    "id": f"r{rec_id}",
                    "tab": "ad_copy",
                    "action": f"Test new RSA headlines in '{_campaign_name(campaigns, ad.get('campaignId'))}'",
                    "target": f"Ad: {ad['headlines'][0]} · Campaign: {_campaign_name(campaigns, ad.get('campaignId'))}",
                    "targetType": "ad",
                    "evidence": f"CTR {ctr_val:.1f}% — below 3.5% benchmark. Conv rate {conv_rate:.1f}%. {clicks} clicks.",
                    "rule": "Ad fatigue / low CTR",
                    "impact": "+ ~0.5pp CTR (modelled)",
                    "confidence": 0.74,
                })
                rec_id += 1

    # ── LANDING PAGES: mismatch (homepage → /emergency exists with better CVR) ──
    homepage = next((lp for lp in landing_pages if lp.get("url", "").endswith("/")), None)
    emergency_page = next((lp for lp in landing_pages if "emergency" in lp.get("url", "")), None)
    if homepage and emergency_page:
        mobile_diff = emergency_page.get("mobileConvRate", 0) - homepage.get("mobileConvRate", 0)
        if mobile_diff > 1:
            top_camp_name = top_camp["name"] if top_camp else "emergency campaigns"
            extra_conv = round(total_conversions * mobile_diff / 100 * 30)
            recommendations.append({
                "id": f"r{rec_id}",
                "tab": "landing_pages",
                "action": f"Route '{top_camp_name}' traffic to /emergency instead of homepage",
                "target": f"Landing page: / (homepage)",
                "targetType": "landing_page",
                "evidence": (
                    f"/emergency mobile CVR {emergency_page['mobileConvRate']}% vs homepage {homepage['mobileConvRate']}% "
                    f"— {mobile_diff:.1f}pp gap. Bounce: homepage {homepage.get('bounceRate')}% vs /emergency {emergency_page.get('bounceRate')}%"
                ),
                "rule": "Landing page mismatch",
                "impact": f"+ ~{extra_conv} conv/mo",
                "confidence": 0.91,
            })
            rec_id += 1

    # ── LANDING PAGES: slow mobile LCP ─────────────────────────────────────────
    for lp in landing_pages:
        mobile_lcp = lp.get("mobileLCP", 0)
        if mobile_lcp > 3.0:
            recommendations.append({
                "id": f"r{rec_id}",
                "tab": "landing_pages",
                "action": f"Fix mobile LCP on {lp['url'].replace('https://berlin-plumbing.example.com', '')} ({mobile_lcp}s → target <2.5s)",
                "target": f"Landing page: {lp['url'].replace('https://berlin-plumbing.example.com', '') or '/'}",
                "targetType": "landing_page",
                "evidence": f"Mobile LCP {mobile_lcp}s fails Core Web Vitals (threshold 2.5s). Mobile CVR {lp.get('mobileConvRate')}% vs desktop {lp.get('desktopConvRate')}%.",
                "rule": "Page speed",
                "impact": "+ ~0.8pp mobile CVR (Google benchmark)",
                "confidence": 0.77,
            })
            rec_id += 1

    return {
        "summary": {
            "spend": round(total_spend, 2),
            "conversions": total_conversions,
            "cpa": round(cpa, 2),
            "roas": roas,
            "impressions": total_impressions,
            "clicks": total_clicks,
            "ctr": round(ctr, 2),
            "wastedSpend": round(wasted_spend, 2),
            "trackingHealthy": True,
            "trackingNote": "",
        },
        "recommendations": recommendations,
    }


def _campaign_name(campaigns: list, campaign_id: Optional[str]) -> str:
    for c in campaigns:
        if c.get("id") == campaign_id:
            return c.get("name", campaign_id)
    return campaign_id or "Unknown"


class NewAnalyzeRequest(BaseModel):
    businessGoal: Dict[str, Any] = {}
    globalRules: Dict[str, Any] = {}
    actionMode: str = "approval"
    datasets: List[Dict[str, Any]] = []


def recs_to_backend_format(recs: list) -> list:
    """Convert internal rec dicts to the BackendRecommendation shape the frontend expects."""
    out = []
    for r in recs:
        out.append({
            "id": r.get("id"),
            "title": r.get("action"),
            "datasetType": r.get("targetType", "keyword"),
            "category": "risk" if r.get("tab") == "risks" else "opportunity",
            "target": r.get("target"),
            "campaign": "",
            "reason": r.get("evidence"),
            "ruleTriggered": r.get("rule"),
            "expectedImpact": r.get("impact"),
            "confidence": r.get("confidence"),
            "evidence": r.get("evidence"),
            "status": "pending",
        })
    return out


@app.post("/analyze")
async def analyze_new(request: NewAnalyzeRequest):
    """New-style endpoint matching the frontend's api.ts AnalyzeRequest shape."""
    goal = request.businessGoal
    rules = request.globalRules
    website_url = str(goal.get("websiteUrl") or "").strip()

    # Collect all CSV rows from enabled datasets
    all_rows = [
        row
        for ds in request.datasets
        if ds.get("enabled", True) and ds.get("rows")
        for row in ds["rows"]
    ]

    has_csv = bool(all_rows)

    if has_csv:
        ads_data = build_ads_data_from_csv(all_rows)
        website_context = ""          # user supplied their own data — skip scraping
    else:
        ads_path = BASE_DIR / "mock_google_ads.json"
        with open(ads_path) as f:
            ads_data = json.load(f)
        # Scrape the website URL when no CSV is provided
        if website_url and website_url.startswith("http"):
            website_context = scrape_website(website_url)
        else:
            website_context = ""

    config = {
        "targetKpi": goal.get("targetKpi", 120),
        "objective": goal.get("objective", "leads"),
        "primaryKpi": goal.get("primaryKpi", "CPA"),
        "websiteContext": website_context,
    }
    rule_cfg = {
        "zeroConvSpend": rules.get("zeroConvSpend", 400),
        "highCpaPct": rules.get("highCpaPct", 150),
        "maxBidChange": rules.get("maxBidChange", 25),
        "maxBudgetChange": rules.get("maxBudgetChange", 20),
    }

    time.sleep(0.5)
    result = analyze_ads_data(ads_data, config, rule_cfg)

    total_rows = sum(len(ds.get("rows") or []) for ds in request.datasets)
    data_source = f"{total_rows} CSV rows" if has_csv else (
        f"scraped {website_url}" if website_context and not website_context.startswith("[Could not") else "demo data"
    )

    return {
        "summary": {
            **result["summary"],
            "analyzedRows": total_rows or len(ads_data.get("keywords", [])),
            "enabledDatasets": len(request.datasets) or 1,
        },
        "executiveSummary": (
            f"Data source: {data_source}. "
            f"Found {len(result['recommendations'])} recommendation(s). "
            f"Estimated wasted spend: €{result['summary']['wastedSpend']:.0f}."
        ),
        "recommendations": recs_to_backend_format(result["recommendations"]),
    }


@app.get("/")
def root():
    return {"status": "ok", "service": "AdPilot AI Backend"}


@app.get("/health")
def health():
    return {"status": "healthy"}


def build_ads_data_from_csv(rows: list) -> dict:
    """Aggregate flat CSV rows into the same shape as mock_google_ads.json."""
    from collections import defaultdict

    campaigns: dict = {}
    keywords: dict = {}

    for row in rows:
        camp_name = str(row.get("campaign") or "Unknown Campaign")
        kw_text = str(row.get("keyword") or row.get("ad_group") or "unknown")

        # Aggregate campaign totals
        if camp_name not in campaigns:
            campaigns[camp_name] = {
                "id": f"camp_{len(campaigns)+1:02d}",
                "name": camp_name,
                "status": "ENABLED",
                "dailyBudget": 50.0,
                "spend": 0.0, "impressions": 0, "clicks": 0,
                "conversions": 0, "type": "SEARCH",
            }
        c = campaigns[camp_name]
        c["spend"] += float(row.get("spend") or row.get("cost") or 0)
        c["impressions"] += int(row.get("impressions") or 0)
        c["clicks"] += int(row.get("clicks") or 0)
        c["conversions"] += int(row.get("conversions") or row.get("leads") or 0)

        # Aggregate keyword totals (keyed by campaign+keyword)
        kw_key = f"{camp_name}::{kw_text}"
        if kw_key not in keywords:
            keywords[kw_key] = {
                "id": f"kw_{len(keywords)+1:03d}",
                "campaignId": campaigns[camp_name]["id"],
                "text": kw_text,
                "matchType": str(row.get("match_type") or "BROAD"),
                "clicks": 0, "impressions": 0, "spend": 0.0,
                "conversions": 0, "qualityScore": 6, "status": "ENABLED",
                "bidAmount": 0.50,
            }
        k = keywords[kw_key]
        k["spend"] += float(row.get("spend") or row.get("cost") or 0)
        k["impressions"] += int(row.get("impressions") or 0)
        k["clicks"] += int(row.get("clicks") or 0)
        k["conversions"] += int(row.get("conversions") or row.get("leads") or 0)

    # Compute derived metrics
    camp_list = list(campaigns.values())
    for c in camp_list:
        c["cpa"] = round(c["spend"] / c["conversions"], 2) if c["conversions"] else None
        c["roas"] = round((c["conversions"] * 150) / c["spend"], 2) if c["spend"] else 0

    kw_list = list(keywords.values())
    for k in kw_list:
        k["cpa"] = round(k["spend"] / k["conversions"], 2) if k["conversions"] else None
        k["avgCpc"] = round(k["spend"] / k["clicks"], 2) if k["clicks"] else 0

    return {
        "account": {"name": "Uploaded Account", "currency": "USD", "dateRange": "CSV data"},
        "campaigns": camp_list,
        "keywords": kw_list,
        "searchTerms": [],
        "ads": [],
        "landingPages": [],
    }


@app.post("/api/analyze")
async def analyze(request: AnalyzeRequest):
    csv_data = request.campaignsData
    if csv_data.get("source") == "upload" and csv_data.get("rows"):
        ads_data = build_ads_data_from_csv(csv_data["rows"])
    else:
        ads_path = BASE_DIR / "mock_google_ads.json"
        with open(ads_path) as f:
            ads_data = json.load(f)

    time.sleep(0.8)
    result = analyze_ads_data(ads_data, request.config, request.rules)
    return result


@app.post("/api/action/pause-keyword")
def pause_keyword(keyword_id: str):
    ads_path = BASE_DIR / "mock_google_ads.json"

    with open(ads_path, "r") as f:
        data = json.load(f)

    keyword_found = False
    for kw in data.get("keywords", []):
        if kw["id"] == keyword_id:
            kw["status"] = "PAUSED"
            keyword_found = True
            break

    if not keyword_found:
        raise HTTPException(status_code=404, detail=f"Keyword {keyword_id} not found")

    with open(ads_path, "w") as f:
        json.dump(data, f, indent=2)

    return {"status": "success", "message": f"Keyword {keyword_id} has been paused."}
