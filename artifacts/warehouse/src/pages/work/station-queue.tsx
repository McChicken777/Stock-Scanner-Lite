import { useState, useEffect } from "react";
import { useParams, Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format, differenceInDays, isPast } from "date-fns";
import {
  ChevronLeft, ChevronDown, ChevronUp, Monitor, CheckCircle2,
  Clock, Loader2, Inbox, Play, User, Timer,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useAuth, type AuthUser } from "@/contexts/auth";

interface Workstation { id: number; name: string; priority: number; isActive: boolean; }
interface StationType  { id: number; name: string; color: string; }

interface QueueStep {
  stepId: number; stepName: string; sortOrder: number;
  status: "not_started" | "in_progress";
  durationEstimate: number | null; batchMode: string;
  workstationId: number | null;
  claimedByUsername: string | null;
  startTime: string | null;
  itemId: number; itemName: string;
  projectId: number; projectName: string;
  projectDeadline: string; projectPriority: string;
}

interface QueueItem  { itemId: number; itemName: string; steps: QueueStep[]; }
interface QueueProject {
  projectId: number; projectName: string;
  projectDeadline: string; projectPriority: string;
  items: QueueItem[];
}

interface QueueData {
  type: StationType;
  workstations: Workstation[];
  projects: QueueProject[];
}

async function apiFetch(url: string, opts?: RequestInit) {
  const res = await fetch(url, { credentials: "include", ...opts });
  if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || "Failed"); }
  if (res.status === 204) return null;
  return res.json();
}

function urgencyColor(deadline: string) {
  if (isPast(new Date(deadline))) return "text-red-600";
  const days = differenceInDays(new Date(deadline), new Date());
  if (days < 2) return "text-red-600";
  if (days < 5) return "text-orange-600";
  return "text-green-600";
}

function useNow(active: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [active]);
  return now;
}

function formatSeconds(s: number) {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${sec}s`;
  return `${sec}s`;
}

const PRIORITY_COLORS: Record<string, string> = {
  urgent: "bg-red-100 text-red-700 border-red-200",
  high:   "bg-orange-100 text-orange-700 border-orange-200",
  normal: "bg-blue-100 text-blue-700 border-blue-200",
  low:    "bg-gray-100 text-gray-600 border-gray-200",
};

function StepRow({
  step, user, activeWorkstations, completing, starting, onStart, onComplete, onAssign,
}: {
  step: QueueStep;
  user: AuthUser | null;
  activeWorkstations: Workstation[];
  completing: Set<number>;
  starting: Set<number>;
  onStart: (id: number) => void;
  onComplete: (id: number) => void;
  onAssign: (workstationId: number | null) => void;
}) {
  const isInProgress = step.status === "in_progress";
  const claimedByMe = isInProgress && step.claimedByUsername === user?.username;
  const claimedByOther = isInProgress && !claimedByMe && step.claimedByUsername;
  const isAdmin = user?.role === "admin";
  const isCompleting = completing.has(step.stepId);
  const isStarting = starting.has(step.stepId);

  const now = useNow(isInProgress && !!step.startTime);
  const elapsedSeconds = isInProgress && step.startTime
    ? Math.max(0, Math.floor((now - new Date(step.startTime).getTime()) / 1000))
    : 0;

  if (claimedByMe) {
    return (
      <div className="px-4 py-3 bg-green-50 border-l-4 border-green-500 space-y-2.5">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-bold leading-tight">{step.stepName}</p>
            <div className="flex items-center gap-2 mt-0.5">
              {step.startTime && (
                <span className="flex items-center gap-1 text-[11px] font-bold text-green-700 animate-pulse">
                  <Timer className="h-3 w-3" /> {formatSeconds(elapsedSeconds)}
                </span>
              )}
              <span className="flex items-center gap-1 text-[11px] font-bold text-green-700 bg-green-100 rounded-full px-2 py-0.5">
                <User className="h-3 w-3" /> You
              </span>
            </div>
          </div>
          {activeWorkstations.length > 0 && (
            <select
              value={step.workstationId ?? ""}
              onChange={(e) => onAssign(e.target.value ? Number(e.target.value) : null)}
              className="text-xs rounded-lg border border-border bg-background px-2 py-1.5 max-w-[100px] flex-shrink-0"
            >
              <option value="">— machine</option>
              {activeWorkstations.map((ws) => (
                <option key={ws.id} value={ws.id}>{ws.name}</option>
              ))}
            </select>
          )}
        </div>
        <Button
          className="w-full h-12 font-bold text-base gap-2 bg-green-600 hover:bg-green-700"
          disabled={isCompleting}
          onClick={() => onComplete(step.stepId)}
        >
          {isCompleting ? <Loader2 className="h-5 w-5 animate-spin" /> : <><CheckCircle2 className="h-5 w-5" /> Done</>}
        </Button>
      </div>
    );
  }

  return (
    <div className={`flex items-center gap-3 px-4 py-3 ${isInProgress ? "bg-blue-50/60 border-l-4 border-blue-400" : ""}`}>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold">{step.stepName}</p>
        <div className="flex items-center gap-2 flex-wrap mt-0.5">
          {step.durationEstimate && !isInProgress && (
            <span className="text-xs text-muted-foreground">~{step.durationEstimate} min</span>
          )}
          {isInProgress && step.startTime && (
            <span className="flex items-center gap-1 text-[11px] font-bold text-blue-700 animate-pulse">
              <Timer className="h-3 w-3" /> {formatSeconds(elapsedSeconds)}
            </span>
          )}
          {claimedByOther && (
            <span className="flex items-center gap-1 text-[11px] font-semibold text-muted-foreground bg-muted rounded-full px-2 py-0.5">
              <User className="h-3 w-3" /> {step.claimedByUsername}
            </span>
          )}
        </div>
      </div>

      {activeWorkstations.length > 0 && (
        <select
          value={step.workstationId ?? ""}
          onChange={(e) => onAssign(e.target.value ? Number(e.target.value) : null)}
          className="text-xs rounded-lg border border-border bg-background px-2 py-1.5 max-w-[110px] flex-shrink-0"
        >
          <option value="">— machine</option>
          {activeWorkstations.map((ws) => (
            <option key={ws.id} value={ws.id}>{ws.name}</option>
          ))}
        </select>
      )}

      {!isInProgress && (
        <Button
          size="sm"
          variant="outline"
          className="h-9 px-3 font-bold flex-shrink-0 gap-1.5 border-2 border-blue-300 text-blue-700 hover:bg-blue-50"
          disabled={isStarting}
          onClick={() => onStart(step.stepId)}
        >
          {isStarting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <><Play className="h-3.5 w-3.5" /> Start</>}
        </Button>
      )}

      {/* Done button for admin or other workers' in-progress steps */}
      {isInProgress && (
        <Button
          size="sm"
          className="h-9 px-3 font-bold flex-shrink-0 gap-1.5"
          disabled={isCompleting}
          onClick={() => onComplete(step.stepId)}
        >
          {isCompleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <><CheckCircle2 className="h-3.5 w-3.5" /> Done</>}
        </Button>
      )}
    </div>
  );
}

export default function StationQueuePage() {
  const { typeId } = useParams<{ typeId: string }>();
  const { toast } = useToast();
  const qc = useQueryClient();
  const { user } = useAuth();

  const [machineFilter, setMachineFilter] = useState<number | "all">("all");
  const [expandedProjects, setExpandedProjects] = useState<Set<number>>(new Set());
  const [completing, setCompleting] = useState<Set<number>>(new Set());
  const [starting, setStarting] = useState<Set<number>>(new Set());

  const key = [`/api/stations/queue/${typeId}`];
  const { data, isLoading } = useQuery<QueueData>({
    queryKey: key,
    queryFn: () => apiFetch(`/api/stations/queue/${typeId}`),
    refetchInterval: 20000,
    enabled: !!typeId,
  });

  const toggleProject = (id: number) =>
    setExpandedProjects((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const assignMutation = useMutation({
    mutationFn: ({ stepId, workstationId }: { stepId: number; workstationId: number | null }) =>
      apiFetch(`/api/stations/queue/assign/${stepId}`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workstationId }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  async function startStep(stepId: number) {
    setStarting((prev) => new Set(prev).add(stepId));
    try {
      await apiFetch(`/api/work/steps/${stepId}/start`, { method: "POST" });
      qc.invalidateQueries({ queryKey: key });
      qc.invalidateQueries({ queryKey: ["/api/work/active-timer"] });
      toast({ title: "Step started — good luck! 💪" });
    } catch (e) {
      toast({ title: (e as Error).message, variant: "destructive" });
    } finally {
      setStarting((prev) => { const n = new Set(prev); n.delete(stepId); return n; });
    }
  }

  async function completeStep(stepId: number) {
    setCompleting((prev) => new Set(prev).add(stepId));
    try {
      await apiFetch(`/api/work/steps/${stepId}/complete`, { method: "POST" });
      qc.invalidateQueries({ queryKey: key });
      qc.invalidateQueries({ queryKey: ["/api/work/projects"] });
      toast({ title: "Step completed ✓" });
    } catch (e) {
      toast({ title: (e as Error).message, variant: "destructive" });
    } finally {
      setCompleting((prev) => { const n = new Set(prev); n.delete(stepId); return n; });
    }
  }

  if (isLoading) return (
    <div className="p-4 space-y-4 pb-24">
      <Skeleton className="h-10 w-48" />
      {[1, 2].map((i) => <Skeleton key={i} className="h-32 w-full rounded-xl" />)}
    </div>
  );

  if (!data) return (
    <div className="p-4 pt-6 text-center">
      <p className="font-semibold text-muted-foreground">Station not found</p>
      <Link href="/work/queues"><p className="text-primary underline text-sm mt-2">← Back to Queues</p></Link>
    </div>
  );

  const { type, workstations, projects } = data;
  const activeWorkstations = workstations.filter((w) => w.isActive);

  // Filter steps by selected machine
  const filteredProjects = projects.map((proj) => ({
    ...proj,
    items: proj.items.map((item) => ({
      ...item,
      steps: item.steps.filter((s) =>
        machineFilter === "all" ? true : s.workstationId === machineFilter
      ),
    })).filter((item) => item.steps.length > 0),
  })).filter((proj) => proj.items.length > 0);

  const totalSteps = filteredProjects.reduce((sum, p) =>
    sum + p.items.reduce((s, i) => s + i.steps.length, 0), 0);

  return (
    <div className="p-4 space-y-4 pb-24">
      {/* Header */}
      <div className="flex items-center gap-3 pt-2">
        <Link href="/work/queues">
          <button className="text-muted-foreground hover:text-foreground">
            <ChevronLeft className="h-5 w-5" />
          </button>
        </Link>
        <div className="flex items-center gap-2 flex-1">
          <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: type.color }} />
          <h1 className="text-2xl font-black">{type.name}</h1>
        </div>
        <span className="text-xs font-bold bg-primary text-primary-foreground rounded-full px-2.5 py-1">
          {totalSteps} pending
        </span>
      </div>

      {/* Machine filter tabs */}
      {activeWorkstations.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
          <button
            onClick={() => setMachineFilter("all")}
            className={`flex-shrink-0 text-xs font-semibold px-3 py-1.5 rounded-full border-2 transition-colors ${machineFilter === "all" ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground hover:border-primary/40"}`}
          >
            All
          </button>
          {activeWorkstations.map((ws) => (
            <button
              key={ws.id}
              onClick={() => setMachineFilter(ws.id)}
              className={`flex-shrink-0 flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full border-2 transition-colors ${machineFilter === ws.id ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground hover:border-primary/40"}`}
            >
              <Monitor className="h-3 w-3" /> {ws.name}
            </button>
          ))}
        </div>
      )}

      {/* Queue */}
      {filteredProjects.length === 0 ? (
        <div className="text-center py-16 px-4 bg-muted/30 rounded-xl border border-dashed">
          <Inbox className="h-10 w-10 mx-auto mb-3 text-muted-foreground" />
          <p className="font-semibold">
            {machineFilter === "all" ? "Nothing pending at this station" : "Nothing assigned to this machine"}
          </p>
          <p className="text-sm text-muted-foreground mt-1">Steps tagged to this station will appear here when projects are active.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredProjects.map((proj) => {
            const isOpen = expandedProjects.has(proj.projectId);
            const stepCount = proj.items.reduce((s, i) => s + i.steps.length, 0);
            const uc = urgencyColor(proj.projectDeadline);

            return (
              <div key={proj.projectId} className="rounded-xl border-2 border-border bg-card overflow-hidden">
                {/* Project header */}
                <button
                  onClick={() => toggleProject(proj.projectId)}
                  className="w-full flex items-center gap-3 p-3 text-left"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-sm truncate">{proj.projectName}</span>
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${PRIORITY_COLORS[proj.projectPriority] ?? PRIORITY_COLORS.normal}`}>
                        {proj.projectPriority.toUpperCase()}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 mt-0.5">
                      <Clock className="h-3 w-3 text-muted-foreground" />
                      <span className={`text-xs font-semibold ${uc}`}>
                        {isPast(new Date(proj.projectDeadline))
                          ? "Overdue"
                          : `${differenceInDays(new Date(proj.projectDeadline), new Date())}d left`}
                        {" · "}{format(new Date(proj.projectDeadline), "dd MMM")}
                      </span>
                      <span className="text-xs text-muted-foreground ml-1">· {stepCount} step{stepCount !== 1 ? "s" : ""}</span>
                    </div>
                  </div>
                  {isOpen ? <ChevronUp className="h-4 w-4 text-muted-foreground flex-shrink-0" /> : <ChevronDown className="h-4 w-4 text-muted-foreground flex-shrink-0" />}
                </button>

                {/* Steps */}
                {isOpen && (
                  <div className="border-t border-border divide-y divide-border">
                    {proj.items.map((item) => (
                      <div key={item.itemId}>
                        <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground px-4 py-1.5 bg-muted/30">
                          {item.itemName}
                        </p>
                        {item.steps.map((step) => (
                          <StepRow
                            key={step.stepId}
                            step={step}
                            user={user}
                            activeWorkstations={activeWorkstations}
                            completing={completing}
                            starting={starting}
                            onStart={startStep}
                            onComplete={completeStep}
                            onAssign={(workstationId) => assignMutation.mutate({ stepId: step.stepId, workstationId })}
                          />
                        ))}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
