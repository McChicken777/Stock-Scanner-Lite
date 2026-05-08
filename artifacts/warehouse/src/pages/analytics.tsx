import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/auth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  BarChart2, Brain, RefreshCw, X, TrendingUp, Clock, Target, Lock,
  AlertTriangle, Lightbulb, Zap, Calendar,
} from "lucide-react";
import {
  ResponsiveContainer, LineChart, Line, BarChart, Bar,
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from "recharts";

interface AnalyticsInsight {
  id: string;
  category: "efficiency" | "bottleneck" | "deadline" | "worker";
  headline: string;
  explanation: string;
  metric: string;
}

interface BottleneckRow { name: string; avgMinutes: number; count: number }
interface EfficiencyMonthRow { month: string; [key: string]: number | string }
interface DeadlineRow { month: string; total: number; completed: number; rate: number }

interface ChartsData {
  efficiencyByMonth: EfficiencyMonthRow[];
  topProcedures: string[];
  bottlenecks: BottleneckRow[];
  deadlineAccuracy: DeadlineRow[];
}

const LINE_COLORS = ["#f97316", "#3b82f6", "#10b981", "#8b5cf6", "#ec4899"];

const CATEGORY_META: Record<string, { icon: React.ReactNode; color: string; bg: string }> = {
  efficiency: { icon: <Clock className="h-4 w-4" />, color: "text-blue-700", bg: "bg-blue-50 border-blue-200" },
  bottleneck: { icon: <AlertTriangle className="h-4 w-4" />, color: "text-orange-700", bg: "bg-orange-50 border-orange-200" },
  deadline: { icon: <Target className="h-4 w-4" />, color: "text-rose-700", bg: "bg-rose-50 border-rose-200" },
  worker: { icon: <Zap className="h-4 w-4" />, color: "text-emerald-700", bg: "bg-emerald-50 border-emerald-200" },
};

async function apiFetch(url: string, opts?: RequestInit) {
  const res = await fetch(url, { credentials: "include", ...opts });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const err = new Error(body.error ?? `HTTP ${res.status}`) as Error & { status: number; planRequired?: string };
    err.status = res.status;
    err.planRequired = body.planRequired;
    throw err;
  }
  return res.json();
}

function InsightCard({ insight, onDismiss }: { insight: AnalyticsInsight; onDismiss: (id: string) => void }) {
  const meta = CATEGORY_META[insight.category] ?? CATEGORY_META.efficiency;
  return (
    <div className={`border-2 rounded-xl p-4 space-y-2 ${meta.bg} relative`}>
      <button
        onClick={() => onDismiss(insight.id)}
        className="absolute top-3 right-3 text-muted-foreground hover:text-foreground transition-colors"
        aria-label="Dismiss"
      >
        <X className="h-4 w-4" />
      </button>
      <div className={`flex items-center gap-2 ${meta.color}`}>
        {meta.icon}
        <span className="text-[10px] font-bold uppercase tracking-wider">{insight.category}</span>
      </div>
      <p className="font-bold text-sm leading-tight pr-6">{insight.headline}</p>
      <p className="text-xs text-muted-foreground leading-relaxed">{insight.explanation}</p>
      <div className={`inline-flex items-center gap-1 text-xs font-bold px-2 py-1 rounded-full border ${meta.bg} ${meta.color}`}>
        <BarChart2 className="h-3 w-3" />
        {insight.metric}
      </div>
    </div>
  );
}

function PaywallState() {
  return (
    <div className="p-4 pb-24 space-y-6">
      <div className="px-1 pt-2">
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <BarChart2 className="h-6 w-6 text-primary" />
          AI Analytics
        </h1>
      </div>
      <div className="rounded-2xl border-2 border-dashed border-primary/30 bg-primary/5 p-8 text-center space-y-4">
        <div className="mx-auto h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center">
          <Lock className="h-8 w-8 text-primary" />
        </div>
        <div className="space-y-2">
          <p className="font-black text-lg">Pro feature</p>
          <p className="text-sm text-muted-foreground max-w-xs mx-auto">
            AI Analytics surfaces patterns in your production data — bottlenecks, quote accuracy, deadline trends — as plain-language insight cards.
          </p>
        </div>
        <div className="grid grid-cols-1 gap-2 text-xs text-left max-w-xs mx-auto">
          {[
            "AI-generated insight cards updated weekly",
            "Efficiency over time per procedure type",
            "Bottleneck analysis to find your slowest steps",
            "Deadline hit-rate trend over 6 months",
          ].map((f) => (
            <div key={f} className="flex items-start gap-2">
              <Lightbulb className="h-3.5 w-3.5 text-primary flex-shrink-0 mt-0.5" />
              <span className="text-muted-foreground">{f}</span>
            </div>
          ))}
        </div>
        <Button asChild variant="default" className="mt-2">
          <a href="/admin/company">Upgrade to Pro</a>
        </Button>
      </div>
    </div>
  );
}

function EmptySnapshotState({ onGenerate, loading }: { onGenerate: () => void; loading: boolean }) {
  return (
    <div className="rounded-2xl border-2 border-dashed border-border bg-muted/30 p-8 text-center space-y-4">
      <div className="mx-auto h-14 w-14 rounded-full bg-muted flex items-center justify-center">
        <Brain className="h-7 w-7 text-muted-foreground" />
      </div>
      <div className="space-y-1">
        <p className="font-bold">No analytics yet</p>
        <p className="text-sm text-muted-foreground">Generate your first AI analytics report. This analyses your production history and generates insight cards.</p>
      </div>
      <Button onClick={onGenerate} disabled={loading} className="gap-2">
        {loading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Brain className="h-4 w-4" />}
        {loading ? "Generating…" : "Generate First Report"}
      </Button>
    </div>
  );
}

export default function AnalyticsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const isAdmin = user?.role === "admin";

  const [dismissed, setDismissed] = useState<Set<string>>(
    () => new Set(JSON.parse(localStorage.getItem("analytics_dismissed") ?? "[]")),
  );

  const dismiss = (id: string) => {
    const next = new Set([...dismissed, id]);
    setDismissed(next);
    localStorage.setItem("analytics_dismissed", JSON.stringify([...next]));
  };

  const {
    data: insightsData,
    isLoading: insightsLoading,
    error: insightsError,
  } = useQuery<{ insights: AnalyticsInsight[]; snapshotAt: string | null; triggeredBy: string | null }, Error & { status?: number; planRequired?: string }>({
    queryKey: ["/api/analytics/insights"],
    queryFn: () => apiFetch("/api/analytics/insights"),
    enabled: isAdmin,
    retry: false,
  });

  const { data: chartsData, isLoading: chartsLoading } = useQuery<{ charts: ChartsData | null; snapshotAt: string | null }>({
    queryKey: ["/api/analytics/charts"],
    queryFn: () => apiFetch("/api/analytics/charts"),
    enabled: isAdmin && !!insightsData?.snapshotAt,
  });

  const refreshMutation = useMutation({
    mutationFn: () => apiFetch("/api/analytics/refresh", { method: "POST" }),
    onSuccess: (data: { insightCount: number }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/analytics/insights"] });
      queryClient.invalidateQueries({ queryKey: ["/api/analytics/charts"] });
      toast({ title: `Analytics updated — ${data.insightCount} insight${data.insightCount !== 1 ? "s" : ""} generated` });
      setDismissed(new Set());
      localStorage.removeItem("analytics_dismissed");
    },
    onError: (err: Error) => {
      toast({ title: err.message || "Failed to refresh analytics", variant: "destructive" });
    },
  });

  if (!isAdmin) {
    return (
      <div className="p-4 flex items-center justify-center h-64 text-center">
        <p className="text-muted-foreground text-sm">Admin access required.</p>
      </div>
    );
  }

  // Plan gate — 403 with planRequired
  if ((insightsError as (Error & { status?: number; planRequired?: string }) | null)?.planRequired === "pro") {
    return <PaywallState />;
  }

  if (insightsLoading) {
    return (
      <div className="p-4 space-y-4 pb-24">
        <Skeleton className="h-9 w-48" />
        <Skeleton className="h-24 rounded-xl" />
        <Skeleton className="h-24 rounded-xl" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  const insights = insightsData?.insights ?? [];
  const visibleInsights = insights.filter((i) => !dismissed.has(i.id));
  const charts = chartsData?.charts ?? null;
  const snapshotAt = insightsData?.snapshotAt;
  const hasData = insights.length > 0 || charts !== null;

  return (
    <div className="p-4 space-y-6 pb-24">
      <div className="px-1 pt-2 flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <BarChart2 className="h-6 w-6 text-primary" />
            AI Analytics
          </h1>
          {snapshotAt && (
            <p className="text-xs text-muted-foreground mt-0.5">
              Last updated {new Date(snapshotAt).toLocaleDateString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
              {insightsData?.triggeredBy === "manual" ? " (manual)" : " (weekly)"}
            </p>
          )}
        </div>
        <Button
          variant="outline"
          size="sm"
          className="gap-2 flex-shrink-0"
          disabled={refreshMutation.isPending}
          onClick={() => refreshMutation.mutate()}
        >
          <RefreshCw className={`h-3.5 w-3.5 ${refreshMutation.isPending ? "animate-spin" : ""}`} />
          {refreshMutation.isPending ? "Generating…" : "Refresh"}
        </Button>
      </div>

      {!hasData ? (
        <EmptySnapshotState
          onGenerate={() => refreshMutation.mutate()}
          loading={refreshMutation.isPending}
        />
      ) : (
        <>
          {/* Insight cards */}
          {visibleInsights.length > 0 && (
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
                <Brain className="h-3.5 w-3.5" /> AI Insights
              </p>
              <div className="space-y-3">
                {visibleInsights.map((insight) => (
                  <InsightCard key={insight.id} insight={insight} onDismiss={dismiss} />
                ))}
              </div>
              {dismissed.size > 0 && dismissed.size < insights.length && (
                <button
                  onClick={() => { setDismissed(new Set()); localStorage.removeItem("analytics_dismissed"); }}
                  className="text-xs text-muted-foreground hover:text-foreground underline mt-2"
                >
                  Show {dismissed.size} dismissed insight{dismissed.size !== 1 ? "s" : ""}
                </button>
              )}
            </div>
          )}

          {insights.length === 0 && (
            <div className="rounded-xl border-2 border-dashed border-border p-6 text-center text-sm text-muted-foreground">
              No AI insights yet. Generate a report using the Refresh button above.
            </div>
          )}

          {/* Charts */}
          {chartsLoading && (
            <div className="space-y-4">
              <Skeleton className="h-56 rounded-xl" />
              <Skeleton className="h-56 rounded-xl" />
            </div>
          )}

          {charts && (
            <div className="space-y-6">
              {/* Efficiency over time */}
              {charts.efficiencyByMonth.length > 0 && charts.topProcedures.length > 0 && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-bold flex items-center gap-2">
                      <TrendingUp className="h-4 w-4 text-primary" />
                      Efficiency Over Time
                      <span className="text-[10px] font-normal text-muted-foreground ml-1">avg minutes per step type</span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={220}>
                      <LineChart data={charts.efficiencyByMonth} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                        <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                        <YAxis tick={{ fontSize: 10 }} unit="m" />
                        <Tooltip
                          formatter={(v: number) => [`${v}m`, undefined]}
                          contentStyle={{ fontSize: 11, borderRadius: 8 }}
                        />
                        <Legend wrapperStyle={{ fontSize: 10 }} />
                        {charts.topProcedures.map((proc, i) => (
                          <Line
                            key={proc}
                            type="monotone"
                            dataKey={proc}
                            stroke={LINE_COLORS[i % LINE_COLORS.length]}
                            strokeWidth={2}
                            dot={{ r: 3 }}
                            activeDot={{ r: 5 }}
                          />
                        ))}
                      </LineChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              )}

              {/* Bottleneck analysis */}
              {charts.bottlenecks.length > 0 && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-bold flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4 text-orange-500" />
                      Bottleneck Analysis
                      <span className="text-[10px] font-normal text-muted-foreground ml-1">avg time per step (completed)</span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={220}>
                      <BarChart
                        data={charts.bottlenecks.slice(0, 8)}
                        layout="vertical"
                        margin={{ top: 5, right: 30, left: 0, bottom: 5 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                        <XAxis type="number" tick={{ fontSize: 10 }} unit="m" />
                        <YAxis
                          type="category"
                          dataKey="name"
                          tick={{ fontSize: 9 }}
                          width={80}
                        />
                        <Tooltip
                          formatter={(v: number, _name, entry) => [
                            `${v}m avg · ${(entry.payload as BottleneckRow).count} completed`,
                            "Avg time",
                          ]}
                          contentStyle={{ fontSize: 11, borderRadius: 8 }}
                        />
                        <Bar dataKey="avgMinutes" fill="#f97316" radius={[0, 4, 4, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              )}

              {/* Deadline accuracy */}
              {charts.deadlineAccuracy.length > 0 && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-bold flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-blue-500" />
                      Deadline Accuracy
                      <span className="text-[10px] font-normal text-muted-foreground ml-1">% projects completed on time</span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={200}>
                      <AreaChart data={charts.deadlineAccuracy} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                        <defs>
                          <linearGradient id="deadlineGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                            <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                        <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                        <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} unit="%" />
                        <Tooltip
                          formatter={(v: number, _name, entry) => [
                            `${v}% (${(entry.payload as DeadlineRow).completed}/${(entry.payload as DeadlineRow).total})`,
                            "On-time rate",
                          ]}
                          contentStyle={{ fontSize: 11, borderRadius: 8 }}
                        />
                        <Area
                          type="monotone"
                          dataKey="rate"
                          stroke="#3b82f6"
                          strokeWidth={2}
                          fill="url(#deadlineGrad)"
                          dot={{ r: 4 }}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              )}

              {/* No chart data yet */}
              {charts.bottlenecks.length === 0 && charts.deadlineAccuracy.length === 0 && charts.efficiencyByMonth.length === 0 && (
                <div className="rounded-xl border-2 border-dashed border-border p-6 text-center">
                  <Clock className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">Not enough production history yet for charts. Keep logging work — charts will appear as data accumulates.</p>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
