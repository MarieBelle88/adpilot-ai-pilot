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
  Globe,
  History,
  Layers,
  Lightbulb,
  Loader2,
  PencilLine,
  Play,
  Search,
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
  mockCampaigns,
  mockCountries,
  mockRecommendations,
  mockSummary,
  type Recommendation,
} from "@/lib/adpilot-mock";
import { cn } from "@/lib/utils";
import { parseCampaignCsv, extractUnique, type CampaignRow } from "@/lib/csv-parse";

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

function AdPilotDashboard() {
  // ---------- Config state ----------
  const [dataSource, setDataSource] = useState<"upload" | "demo" | "google">("demo");
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
  const [campaigns, setCampaigns] = useState<string[]>(mockCampaigns);
  const [devices, setDevices] = useState<string[]>(["Desktop", "Mobile", "Tablet"]);
  const [country, setCountry] = useState("United States");
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

  // ---------- CSV upload state ----------
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [uploadedRows, setUploadedRows] = useState<CampaignRow[]>([]);
  const [uploadedFilename, setUploadedFilename] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const csvCampaigns = useMemo(
    () => (uploadedRows.length ? extractUnique(uploadedRows, "campaign") : mockCampaigns),
    [uploadedRows],
  );
  const csvDevices = useMemo(
    () => (uploadedRows.length ? extractUnique(uploadedRows, "device") : ["Desktop", "Mobile", "Tablet"]),
    [uploadedRows],
  );
  const csvCountries = useMemo(
    () => (uploadedRows.length ? extractUnique(uploadedRows, "country") : mockCountries),
    [uploadedRows],
  );

  async function handleCsvFile(file: File) {
    setUploadError(null);
    try {
      const text = await file.text();
      const rows = parseCampaignCsv(text);
      if (!rows.length) throw new Error("No data rows found.");
      setUploadedRows(rows);
      setUploadedFilename(file.name);
      setDataSource("upload");
      setCampaigns(extractUnique(rows, "campaign"));
      const devs = extractUnique(rows, "device");
      if (devs.length) setDevices(devs);
      const countries = extractUnique(rows, "country");
      if (countries.length && !countries.includes(country)) setCountry(countries[0]);
      toast.success("CSV loaded", { description: `${file.name} · ${rows.length} rows` });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to parse CSV";
      setUploadError(msg);
      toast.error("CSV upload failed", { description: msg });
    }
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

  async function handleAnalyze() {
    setAnalyzing(true);
    try {
      const payload = {
        config: {
          dataSource,
          websiteUrl,
          marketingNotes,
          objective,
          primaryKpi,
          targetKpi: Number(targetKpi),
          budgetPeriod,
          budgetAmount: Number(budgetAmount),
          targetCountry,
          conversionType,
        },
        filters: {
          dateRange,
          campaigns,
          devices,
          country,
          matchType,
          minImpressions: Number(minImpressions),
          minClicks: Number(minClicks),
          minSpend: Number(minSpend),
          minConversions: Number(minConversions),
          zeroConvOnly,
          minConfidence: minConfidence[0],
        },
        rules: {
          zeroConvSpend: Number(zeroConvSpend),
          highCpaPct: Number(highCpaPct),
          maxBidChange: Number(maxBidChange),
          maxBudgetChange: Number(maxBudgetChange),
        },
        actionMode,
        campaignsData: uploadedRows.length
          ? { source: "upload", filename: uploadedFilename, rowCount: uploadedRows.length, rows: uploadedRows }
          : { source: dataSource, mock: true },
      };
      const res = await analyzeAccount({ data: payload });
      setSummary(res.summary);
      setRecommendations(res.recommendations);
      toast.success("Analysis complete", { description: `${res.recommendations.length} recommendations.` });
    } catch (e) {
      toast.error("Analysis failed", { description: e instanceof Error ? e.message : "Unknown error" });
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

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Toaster richColors position="top-right" />
      <div className="flex">
        {/* SIDEBAR */}
        <aside className="hidden w-[340px] shrink-0 border-r border-sidebar-border bg-sidebar text-sidebar-foreground lg:block">
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
                <RadioGroup value={dataSource} onValueChange={(v) => setDataSource(v as typeof dataSource)} className="space-y-2">
                  <RadioRow value="upload" id="ds-upload" label={<><Upload className="mr-1 inline h-3.5 w-3.5" /> Upload CSV</>} />
                  <RadioRow value="demo" id="ds-demo" label="Use demo data" />
                  <div className="flex items-center justify-between rounded-md border border-sidebar-border bg-sidebar-accent/40 p-2">
                    <div className="flex items-center gap-2">
                      <RadioGroupItem value="google" id="ds-google" />
                      <Label htmlFor="ds-google" className="text-sm">Connect Google Ads</Label>
                    </div>
                    <Badge variant="outline" className="border-warning/50 text-warning">Experimental</Badge>
                  </div>
                </RadioGroup>
                {dataSource === "upload" && (
                  <div className="space-y-2 rounded-md border border-sidebar-border bg-sidebar-accent/40 p-2">
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".csv,text/csv"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) void handleCsvFile(f);
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
                      {uploadedFilename ? "Replace CSV" : "Choose CSV file"}
                    </Button>
                    {uploadedFilename ? (
                      <div className="text-xs text-sidebar-foreground/70">
                        <div className="truncate font-medium text-sidebar-foreground">{uploadedFilename}</div>
                        <div>{uploadedRows.length.toLocaleString()} rows · {csvCampaigns.length} campaigns · {csvDevices.length} devices · {csvCountries.length} locations</div>
                      </div>
                    ) : (
                      <p className="text-xs text-sidebar-foreground/60">
                        Accepts columns: date, campaign, keyword, country, device, impressions, clicks, cost, conversions, conversion_value.
                      </p>
                    )}
                    {uploadError && <p className="text-xs text-destructive">{uploadError}</p>}
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

              <Section title="Analysis filters" icon={<Filter className="h-4 w-4" />}>
                <FieldLabel>Date range</FieldLabel>
                <Select value={dateRange} onValueChange={setDateRange}>
                  <SelectTrigger className="bg-sidebar-accent/40"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["Last 7 days", "Last 30 days", "Last 90 days", "This quarter"].map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                  </SelectContent>
                </Select>
                <FieldLabel>Campaigns</FieldLabel>
                <MultiCheckList options={csvCampaigns} value={campaigns} onChange={setCampaigns} />
                <FieldLabel>Devices</FieldLabel>
                <MultiCheckList options={csvDevices} value={devices} onChange={setDevices} />
                <FieldLabel>Country</FieldLabel>
                <Select value={country} onValueChange={setCountry}>
                  <SelectTrigger className="bg-sidebar-accent/40"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {csvCountries.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
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
                {dataSource === "demo" ? "Demo account" : dataSource === "upload" ? "CSV upload" : "Google Ads"} · {dateRange} · {country}
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

            {/* SUMMARY CARDS */}
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

            {/* TABS */}
            <Tabs defaultValue="opportunities" className="w-full">
              <TabsList className="flex w-full flex-wrap justify-start gap-1">
                <TabsTrigger value="opportunities"><Lightbulb className="mr-1 h-3.5 w-3.5" />Opportunities</TabsTrigger>
                <TabsTrigger value="risks"><AlertTriangle className="mr-1 h-3.5 w-3.5" />Risks</TabsTrigger>
                <TabsTrigger value="ad_copy"><PencilLine className="mr-1 h-3.5 w-3.5" />New ad copy</TabsTrigger>
                <TabsTrigger value="landing_pages"><FileText className="mr-1 h-3.5 w-3.5" />Landing pages</TabsTrigger>
                <TabsTrigger value="history"><History className="mr-1 h-3.5 w-3.5" />Action history</TabsTrigger>
              </TabsList>

              {(["opportunities", "risks", "ad_copy", "landing_pages"] as const).map((tab) => (
                <TabsContent key={tab} value={tab} className="mt-4 space-y-3">
                  {filtered.filter((r) => r.tab === tab).length === 0 ? (
                    <EmptyState />
                  ) : (
                    filtered.filter((r) => r.tab === tab).map((r) => (
                      <RecCard key={r.id} rec={r} status={status[r.id]} onDecide={decide} />
                    ))
                  )}
                </TabsContent>
              ))}

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
  return (
    <div className="space-y-1 rounded-md border border-sidebar-border bg-sidebar-accent/40 p-2">
      {options.map((opt) => {
        const checked = value.includes(opt);
        return (
          <label key={opt} className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-sm hover:bg-sidebar-accent">
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
