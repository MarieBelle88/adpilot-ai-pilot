import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Check,
  ChevronDown,
  Database,
  FileText,
  Filter,
  History,
  Layers,
  Lightbulb,
  Loader2,
  PencilLine,
  Play,
  Settings2,
  ShieldAlert,
  Sparkles,
  Target,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { Toaster } from "@/components/ui/sonner";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

import { analyzeAccount } from "@/lib/analyze.functions";
import {
  mockCountries,
  mockRecommendations,
  mockSummary,
  type Recommendation,
} from "@/lib/adpilot-mock";
import { cn } from "@/lib/utils";
import {
  parseCampaignCsv,
  extractUnique,
  type CampaignRow,
  type DatasetType,
  DATASET_LABELS,
} from "@/lib/csv-parse";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "AdPilot AI — Google Ads optimisation dashboard" },
      {
        name: "description",
        content:
          "Analyse your Google Ads account with AI. Spot wasted spend, get bid and budget recommendations, and ship better ad copy.",
      },
      { property: "og:title", content: "AdPilot AI" },
      { property: "og:description", content: "AI-powered Google Ads optimisation dashboard." },
    ],
  }),
  component: AdPilotDashboard,
});

type ActionStatus = "pending" | "approved" | "rejected";

type KeywordFilters = {
  campaigns: string[];
  keywords: string[];
  devices: string[];
  countries: string[];
  minSpend: string;
  minClicks: string;
  minConversions: string;
  dateRange: string;
};
type AdGroupFilters = {
  months: string[];
  adGroups: string[];
  devices: string[];
  minCost: string;
  minRevenue: string;
  negativeProfitOnly: boolean;
};
type MarketFilters = {
  platforms: string[];
  campaignTypes: string[];
  countries: string[];
  industries: string[];
  minCpa: string;
  minRoas: string;
  dateRange: string;
};
type DatasetFilters = KeywordFilters | AdGroupFilters | MarketFilters | Record<string, never>;

type DatasetStats = {
  totalRows: number;
  usableRows: number;
  problematicRows: number;
  invalidDates: number;
  missingByColumn: Record<string, number>;
};

type Dataset = {
  id: string;
  name: string;
  filename: string;
  datasetType: DatasetType;
  enabled: boolean;
  columns: string[];
  rawHeaders: string[];
  rowCount: number;
  rows: CampaignRow[];
  filters: DatasetFilters;
  stats: DatasetStats;
};

function makeFiltersFor(type: DatasetType): DatasetFilters {
  if (type === "keyword")
    return {
      campaigns: [], keywords: [], devices: [], countries: [],
      minSpend: "", minClicks: "", minConversions: "", dateRange: "Last 30 days",
    };
  if (type === "ad_group")
    return {
      months: [], adGroups: [], devices: [],
      minCost: "", minRevenue: "", negativeProfitOnly: false,
    };
  if (type === "market")
    return {
      platforms: [], campaignTypes: [], countries: [], industries: [],
      minCpa: "", minRoas: "", dateRange: "Last 30 days",
    };
  return {};
}

type RecTab = "summary" | "keywords" | "ad_groups" | "markets" | "risks";

function bucketRec(rec: Recommendation): RecTab {
  if (rec.tab === "risks") return "risks";
  if (rec.targetType === "keyword" || rec.targetType === "search_term") return "keywords";
  if (rec.targetType === "ad") return "ad_groups";
  return "markets";
}

function AdPilotDashboard() {
  // ---------- Config state ----------
  const [websiteUrl, setWebsiteUrl] = useState("https://acme.example");
  const [marketingNotes, setMarketingNotes] = useState(
    "We sell B2B CRM software, ICP is 50–500 employee SaaS companies in NA.",
  );

  const [objective, setObjective] = useState("leads");
  const [primaryKpi, setPrimaryKpi] = useState("CPA");
  const [targetKpi, setTargetKpi] = useState("120");
  const [budgetPeriod, setBudgetPeriod] = useState<"daily" | "monthly">("daily");
  const [budgetAmount, setBudgetAmount] = useState("600");
  const [targetCountry, setTargetCountry] = useState("United States");
  const [conversionType, setConversionType] = useState("Form submission");

  const [dateRange, setDateRange] = useState("Last 30 days");
  const [matchType, setMatchType] = useState("All");
  const [minImpressions, setMinImpressions] = useState("500");
  const [minClicks, setMinClicks] = useState("50");
  const [minSpend, setMinSpend] = useState("100");
  const [minConversions, setMinConversions] = useState("0");
  const [zeroConvOnly, setZeroConvOnly] = useState(false);
  const [minConfidence, setMinConfidence] = useState([0.6]);

  const [zeroConvSpend, setZeroConvSpend] = useState("400");
  const [highCpaPct, setHighCpaPct] = useState("150");
  const [maxBidChange, setMaxBidChange] = useState("25");
  const [maxBudgetChange, setMaxBudgetChange] = useState("20");

  const [actionMode, setActionMode] = useState<"insights" | "approval" | "automatic">("approval");
  const [useDemoData, setUseDemoData] = useState(true);
  const [googleExperimental, setGoogleExperimental] = useState(false);

  // ---------- Multi-CSV state ----------
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const enabledDatasets = useMemo(() => datasets.filter((d) => d.enabled), [datasets]);

  async function handleCsvFiles(files: FileList) {
    setUploadError(null);
    const next: Dataset[] = [];
    for (const file of Array.from(files)) {
      try {
        const text = await file.text();
        const parsed = parseCampaignCsv(text);
        if (!parsed.rows.length) throw new Error(`${file.name}: no data rows.`);
        next.push({
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          name: file.name.replace(/\.csv$/i, ""),
          filename: file.name,
          datasetType: parsed.detectedType,
          enabled: true,
          columns: parsed.columns,
          rawHeaders: parsed.rawHeaders,
          rowCount: parsed.rows.length,
          rows: parsed.rows,
          filters: makeFiltersFor(parsed.detectedType, parsed.rows),
          stats: parsed.stats,
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Failed to parse CSV";
        setUploadError(msg);
        toast.error("CSV upload failed", { description: msg });
      }
    }
    if (next.length) {
      setDatasets((prev) => [...prev, ...next]);
      setUseDemoData(false);
      toast.success(`${next.length} file${next.length > 1 ? "s" : ""} loaded`);
    }
  }

  function updateDataset(id: string, patch: Partial<Dataset>) {
    setDatasets((ds) =>
      ds.map((d) => {
        if (d.id !== id) return d;
        const merged = { ...d, ...patch };
        if (patch.datasetType && patch.datasetType !== d.datasetType) {
          merged.filters = makeFiltersFor(patch.datasetType);
        }
        return merged;
      }),
    );
  }
  function removeDataset(id: string) {
    setDatasets((ds) => ds.filter((d) => d.id !== id));
  }
  function updateDatasetFilters(id: string, patch: Partial<DatasetFilters>) {
    setDatasets((ds) =>
      ds.map((d) =>
        d.id === id ? { ...d, filters: { ...(d.filters as Record<string, unknown>), ...patch } as DatasetFilters } : d,
      ),
    );
  }

  // ---------- Results state ----------
  const [analyzing, setAnalyzing] = useState(false);
  const [recommendations, setRecommendations] = useState<Recommendation[]>(mockRecommendations);
  const [summary, setSummary] = useState(mockSummary);
  const [status, setStatus] = useState<Record<string, ActionStatus>>({});
  const [history, setHistory] = useState<
    { id: string; action: string; outcome: ActionStatus; at: string }[]
  >([]);

  const filtered = useMemo(
    () => recommendations.filter((r) => r.confidence >= minConfidence[0]),
    [recommendations, minConfidence],
  );

  const goalProgress = useMemo(() => {
    if (primaryKpi === "CPA") {
      const target = Number(targetKpi) || 0;
      if (!target) return 0;
      return Math.min(100, Math.round((target / summary.cpa) * 100));
    }
    return Math.min(100, Math.round((summary.roas / Number(targetKpi || 1)) * 100));
  }, [primaryKpi, targetKpi, summary]);

  function handleAnalyze() {
    setAnalyzing(true);
    try {
      const payload = {
        businessGoal: {
          objective,
          primaryKpi,
          targetKpi: Number(targetKpi),
          budgetPeriod,
          budgetAmount: Number(budgetAmount),
          targetCountry,
          conversionType,
          websiteUrl,
          marketingNotes,
        },
        globalRules: {
          dateRange,
          matchType,
          minImpressions: Number(minImpressions),
          minClicks: Number(minClicks),
          minSpend: Number(minSpend),
          minConversions: Number(minConversions),
          zeroConvOnly,
          minConfidence: minConfidence[0],
          zeroConvSpend: Number(zeroConvSpend),
          highCpaPct: Number(highCpaPct),
          maxBidChange: Number(maxBidChange),
          maxBudgetChange: Number(maxBudgetChange),
        },
        actionMode,
        // Each dataset is sent separately — never combined.
        datasets: enabledDatasets.map((d) => ({
          id: d.id,
          filename: d.filename,
          datasetType: d.datasetType,
          enabled: d.enabled,
          columns: d.columns,
          rowCount: d.rowCount,
          rows: d.rows,
          filters: d.filters,
        })),
      };
      // Backend not connected yet. Log payload for inspection.
      // eslint-disable-next-line no-console
      console.log("[AdPilot] Analyze payload", payload);
      toast.success("Payload logged to console", {
        description: `${payload.datasets.length} dataset${payload.datasets.length === 1 ? "" : "s"} ready for analysis.`,
      });
    } finally {
      setAnalyzing(false);
    }
  }

  function decide(id: string, outcome: ActionStatus) {
    setStatus((s) => ({ ...s, [id]: outcome }));
    const rec = recommendations.find((r) => r.id === id);
    if (rec) {
      setHistory((h) => [{ id, action: rec.action, outcome, at: new Date().toLocaleString() }, ...h]);
      toast(outcome === "approved" ? "Approved" : outcome === "rejected" ? "Rejected" : "Edited", {
        description: rec.action,
      });
    }
  }

  const sourceLabel =
    enabledDatasets.length > 0
      ? `${enabledDatasets.length} CSV${enabledDatasets.length > 1 ? "s" : ""}`
      : useDemoData
        ? "Demo data"
        : googleExperimental
          ? "Google Ads (experimental)"
          : "No data source";

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Toaster richColors position="top-right" />
      <div className="flex">
        {/* SIDEBAR */}
        <aside className="hidden w-[360px] shrink-0 border-r border-sidebar-border bg-sidebar text-sidebar-foreground lg:block">
          <div className="sticky top-0 max-h-screen overflow-y-auto">
            <div className="flex items-center gap-2 px-5 py-5">
              <div className="grid h-9 w-9 place-items-center rounded-lg bg-primary text-primary-foreground">
                <Sparkles className="h-5 w-5" />
              </div>
              <div>
                <div className="text-base font-semibold leading-tight">AdPilot AI</div>
                <div className="text-xs text-sidebar-foreground/60">Google Ads optimiser</div>
              </div>
            </div>
            <Separator className="bg-sidebar-border" />
            <div className="space-y-1 p-3">
              <Section title="Data source" icon={<Database className="h-4 w-4" />} defaultOpen>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,text/csv"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files?.length) void handleCsvFiles(e.target.files);
                    e.target.value = "";
                  }}
                />
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  className="w-full"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload className="mr-1 h-3.5 w-3.5" />
                  Upload CSV files
                </Button>
                {uploadError && <p className="text-xs text-destructive">{uploadError}</p>}

                <div className="flex items-center justify-between rounded-md border border-sidebar-border bg-sidebar-accent/40 p-2">
                  <Label htmlFor="demo" className="text-sm">Use demo data</Label>
                  <Switch id="demo" checked={useDemoData} onCheckedChange={setUseDemoData} />
                </div>
                <div className="flex items-center justify-between rounded-md border border-sidebar-border bg-sidebar-accent/40 p-2">
                  <div className="flex items-center gap-2">
                    <Switch id="google" checked={googleExperimental} onCheckedChange={setGoogleExperimental} />
                    <Label htmlFor="google" className="text-sm">Connect Google Ads</Label>
                  </div>
                  <Badge variant="outline" className="border-warning/50 text-warning">Experimental</Badge>
                </div>

                {datasets.length > 0 && (
                  <div className="space-y-2">
                    {datasets.map((d) => (
                      <DatasetCard
                        key={d.id}
                        dataset={d}
                        onChange={(patch) => updateDataset(d.id, patch)}
                        onRemove={() => removeDataset(d.id)}
                        onFiltersChange={(patch) => updateDatasetFilters(d.id, patch)}
                      />
                    ))}
                  </div>
                )}

                <FieldLabel>Website URL</FieldLabel>
                <Input value={websiteUrl} onChange={(e) => setWebsiteUrl(e.target.value)} placeholder="https://" className="bg-sidebar-accent/40" />
                <FieldLabel>Marketing notes</FieldLabel>
                <Textarea value={marketingNotes} onChange={(e) => setMarketingNotes(e.target.value)} rows={3} className="bg-sidebar-accent/40" />
              </Section>

              <Section title="Business goal" icon={<Target className="h-4 w-4" />} defaultOpen>
                <FieldLabel>Objective</FieldLabel>
                <Select value={objective} onValueChange={setObjective}>
                  <SelectTrigger className="bg-sidebar-accent/40"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["leads", "sales", "traffic", "awareness"].map((o) => <SelectItem key={o} value={o}>{o[0].toUpperCase() + o.slice(1)}</SelectItem>)}
                  </SelectContent>
                </Select>
                <FieldLabel>Primary KPI</FieldLabel>
                <Select value={primaryKpi} onValueChange={setPrimaryKpi}>
                  <SelectTrigger className="bg-sidebar-accent/40"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["CPA", "ROAS", "Conversions", "Revenue"].map((k) => <SelectItem key={k} value={k}>{k}</SelectItem>)}
                  </SelectContent>
                </Select>
                <FieldLabel>Target KPI value</FieldLabel>
                <Input value={targetKpi} onChange={(e) => setTargetKpi(e.target.value)} className="bg-sidebar-accent/40" />
                <FieldLabel>Budget</FieldLabel>
                <div className="flex gap-2">
                  <Select value={budgetPeriod} onValueChange={(v) => setBudgetPeriod(v as typeof budgetPeriod)}>
                    <SelectTrigger className="w-28 bg-sidebar-accent/40"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="daily">Daily</SelectItem>
                      <SelectItem value="monthly">Monthly</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input value={budgetAmount} onChange={(e) => setBudgetAmount(e.target.value)} className="bg-sidebar-accent/40" />
                </div>
                <FieldLabel>Target country</FieldLabel>
                <Select value={targetCountry} onValueChange={setTargetCountry}>
                  <SelectTrigger className="bg-sidebar-accent/40"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {mockCountries.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
                <FieldLabel>Conversion type</FieldLabel>
                <Input value={conversionType} onChange={(e) => setConversionType(e.target.value)} className="bg-sidebar-accent/40" />
              </Section>

              <Section title="Global filters" icon={<Filter className="h-4 w-4" />}>
                <FieldLabel>Date range</FieldLabel>
                <Select value={dateRange} onValueChange={setDateRange}>
                  <SelectTrigger className="bg-sidebar-accent/40"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["Last 7 days", "Last 30 days", "Last 90 days", "This quarter"].map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                  </SelectContent>
                </Select>
                <FieldLabel>Match type</FieldLabel>
                <Select value={matchType} onValueChange={setMatchType}>
                  <SelectTrigger className="bg-sidebar-accent/40"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["All", "Exact", "Phrase", "Broad"].map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                  </SelectContent>
                </Select>
                <div className="grid grid-cols-2 gap-2">
                  <div><FieldLabel>Min impressions</FieldLabel><Input value={minImpressions} onChange={(e) => setMinImpressions(e.target.value)} className="bg-sidebar-accent/40" /></div>
                  <div><FieldLabel>Min clicks</FieldLabel><Input value={minClicks} onChange={(e) => setMinClicks(e.target.value)} className="bg-sidebar-accent/40" /></div>
                  <div><FieldLabel>Min spend</FieldLabel><Input value={minSpend} onChange={(e) => setMinSpend(e.target.value)} className="bg-sidebar-accent/40" /></div>
                  <div><FieldLabel>Min conversions</FieldLabel><Input value={minConversions} onChange={(e) => setMinConversions(e.target.value)} className="bg-sidebar-accent/40" /></div>
                </div>
                <div className="mt-2 flex items-center justify-between rounded-md border border-sidebar-border bg-sidebar-accent/40 p-2">
                  <Label htmlFor="zero" className="text-sm">Zero-conversion items only</Label>
                  <Switch id="zero" checked={zeroConvOnly} onCheckedChange={setZeroConvOnly} />
                </div>
                <FieldLabel>Min confidence: <span className="text-primary">{Math.round(minConfidence[0] * 100)}%</span></FieldLabel>
                <Slider value={minConfidence} onValueChange={setMinConfidence} min={0} max={1} step={0.05} />
              </Section>

              <Section title="Decision rules" icon={<Settings2 className="h-4 w-4" />}>
                <FieldLabel>Zero-conversion spend threshold ($)</FieldLabel>
                <Input value={zeroConvSpend} onChange={(e) => setZeroConvSpend(e.target.value)} className="bg-sidebar-accent/40" />
                <FieldLabel>High CPA threshold (% of target)</FieldLabel>
                <Input value={highCpaPct} onChange={(e) => setHighCpaPct(e.target.value)} className="bg-sidebar-accent/40" />
                <FieldLabel>Maximum bid change (%)</FieldLabel>
                <Input value={maxBidChange} onChange={(e) => setMaxBidChange(e.target.value)} className="bg-sidebar-accent/40" />
                <FieldLabel>Maximum budget change (%)</FieldLabel>
                <Input value={maxBudgetChange} onChange={(e) => setMaxBudgetChange(e.target.value)} className="bg-sidebar-accent/40" />
              </Section>

              <Section title="Action mode" icon={<Activity className="h-4 w-4" />} defaultOpen>
                <RadioGroup value={actionMode} onValueChange={(v) => setActionMode(v as typeof actionMode)} className="space-y-2">
                  <RadioRow value="insights" id="am-i" label="Insights only" />
                  <RadioRow value="approval" id="am-a" label="Approval required" />
                  <div className="flex items-center justify-between rounded-md border border-sidebar-border bg-sidebar-accent/20 p-2 opacity-60">
                    <div className="flex items-center gap-2">
                      <RadioGroupItem value="automatic" id="am-auto" disabled />
                      <Label htmlFor="am-auto" className="text-sm">Automatic</Label>
                    </div>
                    <Badge variant="outline">Coming soon</Badge>
                  </div>
                </RadioGroup>
              </Section>
            </div>
          </div>
        </aside>

        {/* MAIN */}
        <main className="min-w-0 flex-1">
          <header className="sticky top-0 z-10 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-border bg-background/80 px-4 py-4 backdrop-blur sm:px-6 lg:flex lg:flex-wrap lg:justify-between">
            <div className="min-w-0">
              <h1 className="truncate text-xl font-semibold tracking-tight sm:text-2xl">Account analysis</h1>
              <p className="truncate text-sm text-muted-foreground">
                {sourceLabel} · {dateRange}
              </p>
            </div>
            <Button size="lg" onClick={handleAnalyze} disabled={analyzing} className="shrink-0">
              {analyzing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
              {analyzing ? "Analyzing…" : "Analyze account"}
            </Button>
          </header>

          <div className="space-y-6 p-4 sm:p-6">
            {!summary.trackingHealthy && (
              <Alert className="border-warning/40 bg-warning/10 text-foreground">
                <ShieldAlert className="h-4 w-4 text-warning" />
                <AlertTitle>Tracking health warning</AlertTitle>
                <AlertDescription>{summary.trackingNote}</AlertDescription>
              </Alert>
            )}

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
              <Stat label="Spend" value={`$${summary.spend.toLocaleString()}`} />
              <Stat label="Conversions" value={summary.conversions.toString()} />
              <Stat label="CPA" value={`$${summary.cpa.toFixed(2)}`} />
              <Stat label="ROAS" value={`${summary.roas.toFixed(2)}×`} />
              <Stat label="Clicks" value={summary.clicks.toLocaleString()} />
              <Stat label="CTR" value={`${summary.ctr.toFixed(2)}%`} />
            </div>

            <div className="grid gap-4 lg:grid-cols-3">
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Filtered results</CardTitle></CardHeader>
                <CardContent>
                  <div className="text-3xl font-semibold">{filtered.length}</div>
                  <p className="mt-1 text-xs text-muted-foreground">of {recommendations.length} total · ≥ {Math.round(minConfidence[0] * 100)}% confidence</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Estimated wasted spend</CardTitle></CardHeader>
                <CardContent>
                  <div className="text-3xl font-semibold text-destructive">${summary.wastedSpend.toLocaleString()}</div>
                  <p className="mt-1 text-xs text-muted-foreground">Across zero-conversion keywords & irrelevant terms</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Goal progress · {primaryKpi}</CardTitle></CardHeader>
                <CardContent>
                  <div className="mb-2 flex items-baseline justify-between">
                    <span className="text-3xl font-semibold">{goalProgress}%</span>
                    <span className="text-xs text-muted-foreground">target {targetKpi}</span>
                  </div>
                  <Progress value={goalProgress} />
                </CardContent>
              </Card>
            </div>

            <Tabs defaultValue="summary" className="w-full">
              <TabsList className="flex w-full flex-wrap justify-start gap-1">
                <TabsTrigger value="summary"><Sparkles className="mr-1 h-3.5 w-3.5" />Executive summary</TabsTrigger>
                <TabsTrigger value="keywords"><Lightbulb className="mr-1 h-3.5 w-3.5" />Keywords</TabsTrigger>
                <TabsTrigger value="ad_groups"><Layers className="mr-1 h-3.5 w-3.5" />Ad groups</TabsTrigger>
                <TabsTrigger value="markets"><BarChart3 className="mr-1 h-3.5 w-3.5" />Markets</TabsTrigger>
                <TabsTrigger value="risks"><AlertTriangle className="mr-1 h-3.5 w-3.5" />Risks</TabsTrigger>
                <TabsTrigger value="history"><History className="mr-1 h-3.5 w-3.5" />Action history</TabsTrigger>
              </TabsList>

              <TabsContent value="summary" className="mt-4 space-y-3">
                <Card>
                  <CardHeader><CardTitle className="text-base">Top recommendations across all datasets</CardTitle></CardHeader>
                  <CardContent className="space-y-3">
                    {filtered.slice(0, 4).map((r) => (
                      <div key={r.id} className="flex items-start justify-between gap-3 border-b pb-3 last:border-0 last:pb-0">
                        <div className="min-w-0">
                          <div className="text-sm font-medium">{r.action}</div>
                          <div className="truncate text-xs text-muted-foreground">{r.target}</div>
                        </div>
                        <Badge variant="outline" className="shrink-0">{Math.round(r.confidence * 100)}%</Badge>
                      </div>
                    ))}
                    {filtered.length === 0 && <EmptyState />}
                  </CardContent>
                </Card>
              </TabsContent>

              {(["keywords", "ad_groups", "markets", "risks"] as const).map((tab) => {
                const recs = filtered.filter((r) => bucketRec(r) === tab);
                return (
                  <TabsContent key={tab} value={tab} className="mt-4 space-y-3">
                    {recs.length === 0 ? (
                      <EmptyState />
                    ) : (
                      recs.map((r) => (
                        <RecCard key={r.id} rec={r} status={status[r.id]} onDecide={decide} />
                      ))
                    )}
                  </TabsContent>
                );
              })}

              <TabsContent value="history" className="mt-4">
                {history.length === 0 ? (
                  <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">No actions taken yet.</CardContent></Card>
                ) : (
                  <Card>
                    <CardContent className="divide-y p-0">
                      {history.map((h, i) => (
                        <div key={i} className="flex items-center justify-between gap-3 px-4 py-3">
                          <div className="min-w-0">
                            <div className="truncate text-sm font-medium">{h.action}</div>
                            <div className="text-xs text-muted-foreground">{h.at}</div>
                          </div>
                          <Badge variant={h.outcome === "approved" ? "default" : "secondary"} className={cn(h.outcome === "approved" && "bg-success text-success-foreground")}>
                            {h.outcome}
                          </Badge>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                )}
              </TabsContent>
            </Tabs>
          </div>
        </main>
      </div>
    </div>
  );
}

// ---------------- helpers ----------------

function DatasetCard({
  dataset,
  onChange,
  onRemove,
  onFiltersChange,
}: {
  dataset: Dataset;
  onChange: (patch: Partial<Dataset>) => void;
  onRemove: () => void;
  onFiltersChange: (patch: Partial<DatasetFilters>) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className={cn("rounded-md border border-sidebar-border bg-sidebar-accent/40 p-2", !dataset.enabled && "opacity-60")}>
      <div className="flex items-start gap-2">
        <Switch checked={dataset.enabled} onCheckedChange={(v) => onChange({ enabled: v })} />
        <div className="min-w-0 flex-1">
          <Input
            value={dataset.name}
            onChange={(e) => onChange({ name: e.target.value })}
            className="h-7 bg-sidebar text-xs"
          />
          <div className="mt-1 truncate text-[11px] text-sidebar-foreground/60">
            {dataset.filename} · {dataset.rowCount.toLocaleString()} rows
          </div>
          <div className="mt-1">
            <Select
              value={dataset.datasetType}
              onValueChange={(v) => onChange({ datasetType: v as DatasetType })}
            >
              <SelectTrigger className="h-7 bg-sidebar text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.keys(DATASET_LABELS) as DatasetType[]).map((t) => (
                  <SelectItem key={t} value={t}>{DATASET_LABELS[t]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0" onClick={onRemove}>
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger className="mt-2 flex w-full items-center justify-between rounded px-1 py-1 text-[11px] text-sidebar-foreground/70 hover:bg-sidebar-accent">
          <span>Columns, filters &amp; preview</span>
          <ChevronDown className={cn("h-3 w-3 transition-transform", open && "rotate-180")} />
        </CollapsibleTrigger>
        <CollapsibleContent className="space-y-3 pt-2">
          <div>
            <div className="mb-1 text-[11px] uppercase tracking-wide text-sidebar-foreground/60">Detected columns</div>
            <div className="flex flex-wrap gap-1">
              {dataset.columns.map((h) => (
                <Badge key={h} variant="outline" className="text-[10px]">{h}</Badge>
              ))}
            </div>
          </div>
          {dataset.enabled && <DatasetFilterControls dataset={dataset} onFiltersChange={onFiltersChange} />}
          <DatasetPreview dataset={dataset} />
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}

function DatasetFilterControls({
  dataset,
  onFiltersChange,
}: {
  dataset: Dataset;
  onFiltersChange: (patch: Partial<DatasetFilters>) => void;
}) {
  const t = dataset.datasetType;
  if (t === "keyword") {
    const f = dataset.filters as KeywordFilters;
    return (
      <div className="space-y-2">
        <MultiOpt label="Campaign" opts={extractUnique(dataset.rows, "campaign")} value={f.campaigns} onChange={(v) => onFiltersChange({ campaigns: v })} />
        <MultiOpt label="Keyword" opts={extractUnique(dataset.rows, "keyword")} value={f.keywords} onChange={(v) => onFiltersChange({ keywords: v })} />
        <MultiOpt label="Device" opts={extractUnique(dataset.rows, "device")} value={f.devices} onChange={(v) => onFiltersChange({ devices: v })} />
        <MultiOpt label="Location" opts={extractUnique(dataset.rows, "country")} value={f.countries} onChange={(v) => onFiltersChange({ countries: v })} />
        <NumGrid>
          <NumIn label="Min spend" value={f.minSpend} onChange={(v) => onFiltersChange({ minSpend: v })} />
          <NumIn label="Min clicks" value={f.minClicks} onChange={(v) => onFiltersChange({ minClicks: v })} />
          <NumIn label="Min conversions" value={f.minConversions} onChange={(v) => onFiltersChange({ minConversions: v })} />
        </NumGrid>
        <DateRangeSelect value={f.dateRange} onChange={(v) => onFiltersChange({ dateRange: v })} />
      </div>
    );
  }
  if (t === "ad_group") {
    const f = dataset.filters as AdGroupFilters;
    return (
      <div className="space-y-2">
        <MultiOpt label="Month" opts={extractUnique(dataset.rows, "month")} value={f.months} onChange={(v) => onFiltersChange({ months: v })} />
        <MultiOpt label="Ad group" opts={extractUnique(dataset.rows, "ad_group")} value={f.adGroups} onChange={(v) => onFiltersChange({ adGroups: v })} />
        <MultiOpt label="Device" opts={extractUnique(dataset.rows, "device")} value={f.devices} onChange={(v) => onFiltersChange({ devices: v })} />
        <NumGrid>
          <NumIn label="Min cost" value={f.minCost} onChange={(v) => onFiltersChange({ minCost: v })} />
          <NumIn label="Min revenue" value={f.minRevenue} onChange={(v) => onFiltersChange({ minRevenue: v })} />
        </NumGrid>
        <label className="flex cursor-pointer items-center justify-between rounded-md border border-sidebar-border bg-sidebar p-2 text-xs">
          <span>Negative profit only</span>
          <Switch checked={f.negativeProfitOnly} onCheckedChange={(v) => onFiltersChange({ negativeProfitOnly: v })} />
        </label>
      </div>
    );
  }
  if (t === "market") {
    const f = dataset.filters as MarketFilters;
    return (
      <div className="space-y-2">
        <MultiOpt label="Platform" opts={extractUnique(dataset.rows, "platform")} value={f.platforms} onChange={(v) => onFiltersChange({ platforms: v })} />
        <MultiOpt label="Campaign type" opts={extractUnique(dataset.rows, "campaign_type")} value={f.campaignTypes} onChange={(v) => onFiltersChange({ campaignTypes: v })} />
        <MultiOpt label="Country" opts={extractUnique(dataset.rows, "country")} value={f.countries} onChange={(v) => onFiltersChange({ countries: v })} />
        <MultiOpt label="Industry" opts={extractUnique(dataset.rows, "industry")} value={f.industries} onChange={(v) => onFiltersChange({ industries: v })} />
        <NumGrid>
          <NumIn label="Min CPA" value={f.minCpa} onChange={(v) => onFiltersChange({ minCpa: v })} />
          <NumIn label="Min ROAS" value={f.minRoas} onChange={(v) => onFiltersChange({ minRoas: v })} />
        </NumGrid>
        <DateRangeSelect value={f.dateRange} onChange={(v) => onFiltersChange({ dateRange: v })} />
      </div>
    );
  }
  return <p className="text-[11px] text-sidebar-foreground/60">Set a dataset type to enable filters.</p>;
}

function MultiOpt({ label, opts, value, onChange }: { label: string; opts: string[]; value: string[]; onChange: (v: string[]) => void }) {
  if (!opts.length) return null;
  return (
    <div>
      <div className="mb-1 text-[11px] uppercase tracking-wide text-sidebar-foreground/60">{label}</div>
      <MultiCheckList options={opts} value={value} onChange={onChange} />
    </div>
  );
}

function NumGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 gap-2">{children}</div>;
}

function NumIn({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <Label className="mb-1 block text-[11px] text-sidebar-foreground/60">{label}</Label>
      <Input value={value} onChange={(e) => onChange(e.target.value)} className="h-7 bg-sidebar text-xs" />
    </div>
  );
}

function DateRangeSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <Label className="mb-1 block text-[11px] text-sidebar-foreground/60">Date range</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="h-7 bg-sidebar text-xs"><SelectValue /></SelectTrigger>
        <SelectContent>
          {["Last 7 days", "Last 30 days", "Last 90 days", "This quarter", "All time"].map((d) => (
            <SelectItem key={d} value={d}>{d}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function DatasetPreview({ dataset }: { dataset: Dataset }) {
  const preview = dataset.rows.slice(0, 5);
  if (!preview.length) return null;
  return (
    <div>
      <div className="mb-1 text-[11px] uppercase tracking-wide text-sidebar-foreground/60">First 5 rows</div>
      <div className="overflow-x-auto rounded-md border border-sidebar-border bg-sidebar">
        <table className="w-full text-[10px]">
          <thead className="bg-sidebar-accent/60">
            <tr>
              {dataset.columns.map((c) => (
                <th key={c} className="whitespace-nowrap px-2 py-1 text-left font-medium text-sidebar-foreground/70">{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {preview.map((row, i) => (
              <tr key={i} className="border-t border-sidebar-border">
                {dataset.columns.map((c) => (
                  <td key={c} className="whitespace-nowrap px-2 py-1 text-sidebar-foreground/80">
                    {String(row[c] ?? "")}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Section({
  title, icon, defaultOpen, children,
}: { title: string; icon: React.ReactNode; defaultOpen?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(!!defaultOpen);
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="flex w-full items-center justify-between rounded-md px-2 py-2 text-left text-xs font-semibold uppercase tracking-wide text-sidebar-foreground/70 hover:bg-sidebar-accent/40">
        <span className="flex items-center gap-2">{icon}{title}</span>
        <ChevronDown className={cn("h-4 w-4 transition-transform", open && "rotate-180")} />
      </CollapsibleTrigger>
      <CollapsibleContent className="space-y-2 px-2 pb-3 pt-1">{children}</CollapsibleContent>
    </Collapsible>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <Label className="mt-2 block text-xs text-sidebar-foreground/60">{children}</Label>;
}

function RadioRow({ value, id, label }: { value: string; id: string; label: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 rounded-md border border-sidebar-border bg-sidebar-accent/40 p-2">
      <RadioGroupItem value={value} id={id} />
      <Label htmlFor={id} className="text-sm">{label}</Label>
    </div>
  );
}

function MultiCheckList({
  options, value, onChange,
}: { options: string[]; value: string[]; onChange: (v: string[]) => void }) {
  if (!options.length) return null;
  return (
    <div className="space-y-1 rounded-md border border-sidebar-border bg-sidebar p-2">
      {options.map((opt) => {
        const checked = value.includes(opt);
        return (
          <label key={opt} className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-xs hover:bg-sidebar-accent">
            <Checkbox
              checked={checked}
              onCheckedChange={(c) => onChange(c ? [...value, opt] : value.filter((v) => v !== opt))}
            />
            <span className="truncate">{opt}</span>
          </label>
        );
      })}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
        <div className="mt-1 text-xl font-semibold sm:text-2xl">{value}</div>
      </CardContent>
    </Card>
  );
}

function EmptyState() {
  return (
    <Card>
      <CardContent className="flex flex-col items-center justify-center gap-2 py-10 text-center">
        <BarChart3 className="h-8 w-8 text-muted-foreground" />
        <div className="text-sm font-medium">Nothing here yet</div>
        <p className="text-xs text-muted-foreground">Lower the confidence threshold or run a new analysis.</p>
      </CardContent>
    </Card>
  );
}

function RecCard({
  rec, status, onDecide,
}: { rec: Recommendation; status?: ActionStatus; onDecide: (id: string, s: ActionStatus) => void }) {
  return (
    <Card className={cn("transition", status === "approved" && "border-success/50", status === "rejected" && "opacity-60")}>
      <CardContent className="p-4 sm:p-5">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
          <div className="min-w-0">
            <div className="mb-1 flex flex-wrap items-center gap-2">
              <Badge variant="secondary" className="capitalize">{rec.targetType.replace("_", " ")}</Badge>
              <Badge variant="outline" className="border-primary/40 text-primary">{rec.rule}</Badge>
              {status && (
                <Badge className={cn(
                  status === "approved" && "bg-success text-success-foreground",
                  status === "rejected" && "bg-destructive text-destructive-foreground",
                )}>{status}</Badge>
              )}
            </div>
            <div className="text-base font-semibold leading-snug sm:text-lg">{rec.action}</div>
            <div className="mt-1 truncate text-xs text-muted-foreground">{rec.target}</div>
          </div>
          <ConfidenceBadge value={rec.confidence} />
        </div>

        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div>
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Evidence</div>
            <p className="mt-1 text-sm">{rec.evidence}</p>
          </div>
          <div>
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Expected impact</div>
            <p className="mt-1 text-sm font-medium text-success">{rec.impact}</p>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <Button size="sm" onClick={() => onDecide(rec.id, "approved")} disabled={status === "approved"}>
            <Check className="mr-1 h-4 w-4" /> Approve
          </Button>
          <Button size="sm" variant="outline" onClick={() => onDecide(rec.id, "rejected")} disabled={status === "rejected"}>
            <X className="mr-1 h-4 w-4" /> Reject
          </Button>
          <Button size="sm" variant="ghost" onClick={() => onDecide(rec.id, "pending")}>
            <PencilLine className="mr-1 h-4 w-4" /> Edit
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function ConfidenceBadge({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const tone = value >= 0.85 ? "bg-success text-success-foreground" : value >= 0.7 ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground";
  return (
    <div className={cn("shrink-0 rounded-md px-2.5 py-1 text-center", tone)}>
      <div className="text-xs uppercase tracking-wide opacity-80">Conf</div>
      <div className="text-base font-semibold leading-none">{pct}%</div>
    </div>
  );
}
