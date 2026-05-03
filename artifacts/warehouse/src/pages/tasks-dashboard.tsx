import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/auth";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Play, CheckCircle2, AlertCircle, Calendar, Flag, Timer, User } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

interface MyStep {
  id: number;
  itemId: number;
  name: string;
  status: "not_started" | "in_progress" | "completed";
  sortOrder: number;
  totalTimeSeconds: number;
  roleId: number | null;
  roleName: string | null;
  batchMode: string;
  durationEstimate: number | null;
  stepStatus: "ready" | "blocked";
  blockedByStep: { id: number; name: string } | null;
  item: { id: number; name: string };
  project: { id: number; name: string; deadline: string; priority: string };
}

async function fetchMySteps(): Promise<MyStep[]> {
  const res = await fetch("/api/work/my-steps", { credentials: "include" });
  if (!res.ok) return [];
  return res.json();
}

const priorityColors: Record<string, string> = {
  urgent: "bg-rose-100 text-rose-700",
  high: "bg-orange-100 text-orange-700",
  normal: "bg-blue-100 text-blue-700",
  low: "bg-gray-100 text-gray-600",
};

const batchLabels: Record<string, string> = {
  free_batch: "Batch",
  type_batch: "Type batch",
  individual: "",
};

function formatDeadline(dateStr: string) {
  const d = new Date(dateStr);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = Math.round((d.getTime() - today.getTime()) / 86400000);
  if (diff < 0) return { label: `${Math.abs(diff)}d overdue`, overdue: true };
  if (diff === 0) return { label: "Due today", overdue: false };
  if (diff === 1) return { label: "Due tomorrow", overdue: false };
  return { label: `Due in ${diff}d`, overdue: false };
}

export default function TasksDashboardPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: steps = [], isLoading } = useQuery({
    queryKey: ["/api/work/my-steps"],
    queryFn: fetchMySteps,
    refetchInterval: 15000,
  });

  const startMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/work/procedures/${id}/start`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Failed");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/work/my-steps"] });
      toast({ title: "Step started — timer running" });
    },
    onError: (err) => toast({
      title: err instanceof Error ? err.message : "Failed",
      variant: "destructive",
    }),
  });

  const stopMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/work/procedures/${id}/stop`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Failed");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/work/my-steps"] });
      toast({ title: "Step completed!" });
    },
    onError: (err) => toast({ title: err instanceof Error ? err.message : "Failed", variant: "destructive" }),
  });

  const inProgress = steps.filter((s) => s.status === "in_progress");
  const ready = steps.filter((s) => s.status === "not_started" && s.stepStatus === "ready");
  const blocked = steps.filter((s) => s.status === "not_started" && s.stepStatus === "blocked");

  const StepCard = ({ step, variant }: { step: MyStep; variant: "ready" | "inProgress" | "blocked" }) => {
    const dl = formatDeadline(step.project.deadline);
    const bg = variant === "inProgress"
      ? "bg-orange-50 border-orange-300"
      : variant === "blocked"
        ? "bg-red-50 border-red-200"
        : dl.overdue
          ? "bg-red-50 border-red-300"
          : "bg-green-50 border-green-200";

    return (
      <div className={`rounded-xl border-2 p-3 space-y-2 ${bg}`}>
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <p className="font-bold text-sm leading-tight">{step.name}</p>
            <p className="text-xs text-muted-foreground truncate mt-0.5">{step.item.name}</p>
            <p className="text-xs text-muted-foreground/80 truncate">{step.project.name}</p>
          </div>
          {step.project.priority === "urgent" && (
            <Flag className="h-4 w-4 text-rose-600 flex-shrink-0 mt-0.5" />
          )}
        </div>

        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <div className={`flex items-center gap-1 ${dl.overdue ? "text-red-700 font-bold" : "text-muted-foreground"}`}>
            <Calendar className="h-3 w-3" />
            <span>{dl.label}</span>
          </div>
          <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold capitalize ${priorityColors[step.project.priority] ?? "bg-gray-100 text-gray-600"}`}>
            {step.project.priority}
          </span>
          {step.roleName && (
            <span className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 text-[10px] font-semibold">
              <User className="h-2.5 w-2.5" /> {step.roleName}
            </span>
          )}
          {batchLabels[step.batchMode] && (
            <span className="px-1.5 py-0.5 rounded-full bg-purple-100 text-purple-700 text-[10px] font-semibold">
              {batchLabels[step.batchMode]}
            </span>
          )}
          {step.durationEstimate && (
            <span className="flex items-center gap-0.5 text-muted-foreground">
              <Timer className="h-3 w-3" /> ~{step.durationEstimate}m
            </span>
          )}
        </div>

        {variant === "blocked" && step.blockedByStep && (
          <p className="text-xs text-red-600 font-medium flex items-center gap-1">
            <AlertCircle className="h-3 w-3 flex-shrink-0" />
            Waiting for: {step.blockedByStep.name}
          </p>
        )}

        {variant === "inProgress" && (
          <Button
            size="sm"
            onClick={() => stopMutation.mutate(step.id)}
            disabled={stopMutation.isPending}
            className="w-full bg-green-600 hover:bg-green-700 font-bold"
          >
            <CheckCircle2 className="h-4 w-4 mr-1.5" /> Mark Complete
          </Button>
        )}

        {variant === "ready" && (
          <Button
            size="sm"
            onClick={() => startMutation.mutate(step.id)}
            disabled={startMutation.isPending}
            className="w-full bg-green-600 hover:bg-green-700 font-bold"
          >
            <Play className="h-4 w-4 mr-1.5" /> Start
          </Button>
        )}
      </div>
    );
  };

  return (
    <div className="p-4 space-y-4 pb-24">
      <div>
        <h1 className="text-2xl font-bold">My Steps</h1>
        <p className="text-xs text-muted-foreground">Your assigned production steps across all active orders</p>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-28 w-full rounded-xl" />)}
        </div>
      ) : steps.length === 0 ? (
        <div className="text-center py-16 px-4 bg-muted/30 rounded-xl border border-dashed">
          <p className="font-semibold text-muted-foreground">No steps assigned to your roles</p>
          <p className="text-sm text-muted-foreground mt-1">Steps appear here when work orders are created with role assignments.</p>
        </div>
      ) : (
        <div className="space-y-5">
          {inProgress.length > 0 && (
            <div className="space-y-2">
              <h2 className="text-sm font-bold uppercase tracking-wider text-orange-600 flex items-center gap-1.5">
                <span className="inline-block w-2 h-2 rounded-full bg-orange-400 animate-pulse" />
                In Progress ({inProgress.length})
              </h2>
              {inProgress.map((s) => <StepCard key={s.id} step={s} variant="inProgress" />)}
            </div>
          )}

          {ready.length > 0 && (
            <div className="space-y-2">
              <h2 className="text-sm font-bold uppercase tracking-wider text-green-700">
                Ready to Start ({ready.length})
              </h2>
              {ready.map((s) => <StepCard key={s.id} step={s} variant="ready" />)}
            </div>
          )}

          {blocked.length > 0 && (
            <div className="space-y-2">
              <h2 className="text-sm font-bold uppercase tracking-wider text-red-600">
                Blocked ({blocked.length})
              </h2>
              {blocked.map((s) => <StepCard key={s.id} step={s} variant="blocked" />)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
