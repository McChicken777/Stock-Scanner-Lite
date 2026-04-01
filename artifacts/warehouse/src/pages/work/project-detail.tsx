import { useState } from "react";
import { useRoute, Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/auth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowLeft, Play, Square, Clock, CheckCircle2, Circle, AlertCircle,
  ChevronDown, ChevronUp, RotateCcw
} from "lucide-react";
import { format, differenceInDays, isPast } from "date-fns";
import { cn } from "@/lib/utils";

interface Procedure {
  id: number;
  name: string;
  status: "not_started" | "in_progress" | "completed";
  sortOrder: number;
  totalTimeSeconds: number;
}

interface ProjectItem {
  id: number;
  name: string;
  sortOrder: number;
  progress: number;
  procedures: Procedure[];
}

interface Project {
  id: number;
  name: string;
  deadline: string;
  priority: "low" | "medium" | "high";
  status: "in_progress" | "completed";
  progress: number;
  totalProcedures: number;
  completedProcedures: number;
  items: ProjectItem[];
}

interface ActiveTimer {
  log: { id: number; procedureId: number; startTime: string };
  procedure: Procedure;
}

async function fetchProject(id: number): Promise<Project> {
  const res = await fetch(`/api/work/projects/${id}`, { credentials: "include" });
  if (!res.ok) throw new Error("Failed to load project");
  return res.json();
}

async function fetchActiveTimer(): Promise<ActiveTimer | null> {
  const res = await fetch("/api/work/active-timer", { credentials: "include" });
  if (!res.ok) return null;
  return res.json();
}

async function startProcedure(procedureId: number) {
  const res = await fetch(`/api/work/procedures/${procedureId}/start`, {
    method: "POST", credentials: "include",
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to start");
  return data;
}

async function stopProcedure(procedureId: number) {
  const res = await fetch(`/api/work/procedures/${procedureId}/stop`, {
    method: "POST", credentials: "include",
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to stop");
  return data;
}

async function resetProcedure(procedureId: number) {
  const res = await fetch(`/api/work/procedures/${procedureId}/reset`, {
    method: "POST", credentials: "include",
  });
  if (!res.ok) throw new Error("Failed to reset");
  return res.json();
}

async function markProjectComplete(id: number) {
  const res = await fetch(`/api/work/projects/${id}`, {
    method: "PUT",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status: "completed" }),
  });
  if (!res.ok) throw new Error("Failed to update");
  return res.json();
}

function formatSeconds(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

const priorityColors: Record<string, string> = {
  high: "bg-red-100 text-red-700 border-red-200",
  medium: "bg-orange-100 text-orange-700 border-orange-200",
  low: "bg-blue-100 text-blue-700 border-blue-200",
};

function ProcedureRow({
  proc,
  isAdmin,
  activeTimerProcedureId,
  hasAnyActiveTimer,
  projectId,
}: {
  proc: Procedure;
  isAdmin: boolean;
  activeTimerProcedureId: number | null;
  hasAnyActiveTimer: boolean;
  projectId: number;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const isActive = activeTimerProcedureId === proc.id;

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: [`/api/work/projects/${projectId}`] });
    queryClient.invalidateQueries({ queryKey: ["/api/work/active-timer"] });
  };

  const startMutation = useMutation({
    mutationFn: () => startProcedure(proc.id),
    onSuccess: invalidate,
    onError: (err) => toast({ title: err instanceof Error ? err.message : "Error", variant: "destructive" }),
  });

  const stopMutation = useMutation({
    mutationFn: () => stopProcedure(proc.id),
    onSuccess: invalidate,
    onError: (err) => toast({ title: err instanceof Error ? err.message : "Error", variant: "destructive" }),
  });

  const resetMutation = useMutation({
    mutationFn: () => resetProcedure(proc.id),
    onSuccess: invalidate,
    onError: (err) => toast({ title: err instanceof Error ? err.message : "Error", variant: "destructive" }),
  });

  const statusIcon = {
    not_started: <Circle className="h-4 w-4 text-muted-foreground" />,
    in_progress: <AlertCircle className="h-4 w-4 text-orange-500" />,
    completed: <CheckCircle2 className="h-4 w-4 text-green-500" />,
  }[proc.status];

  return (
    <div className={cn(
      "flex items-center gap-3 p-3 rounded-lg border",
      isActive ? "bg-orange-50 border-orange-300" : proc.status === "completed" ? "bg-green-50/50 border-green-200/50" : "bg-background border-border"
    )}>
      {statusIcon}
      <div className="flex-1 min-w-0">
        <p className={cn("font-medium text-sm", proc.status === "completed" && "line-through text-muted-foreground")}>{proc.name}</p>
        {proc.totalTimeSeconds > 0 && (
          <p className="text-xs text-muted-foreground">
            <Clock className="inline h-3 w-3 mr-0.5" />{formatSeconds(proc.totalTimeSeconds)}
          </p>
        )}
        {isActive && <p className="text-xs text-orange-600 font-semibold animate-pulse">Running…</p>}
      </div>

      <div className="flex items-center gap-1.5">
        {isActive ? (
          <Button
            size="sm"
            onClick={() => stopMutation.mutate()}
            disabled={stopMutation.isPending}
            className="h-9 px-3 bg-red-600 hover:bg-red-700 font-bold gap-1"
          >
            <Square className="h-3.5 w-3.5" /> Stop
          </Button>
        ) : proc.status !== "completed" ? (
          <Button
            size="sm"
            onClick={() => startMutation.mutate()}
            disabled={hasAnyActiveTimer || startMutation.isPending}
            className="h-9 px-3 bg-green-600 hover:bg-green-700 font-bold gap-1"
          >
            <Play className="h-3.5 w-3.5" /> Start
          </Button>
        ) : isAdmin ? (
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8 text-muted-foreground"
            onClick={() => resetMutation.mutate()}
            title="Reset procedure"
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function ItemCard({
  item,
  isAdmin,
  activeTimerProcedureId,
  projectId,
}: {
  item: ProjectItem;
  isAdmin: boolean;
  activeTimerProcedureId: number | null;
  projectId: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const hasActiveTimer = activeTimerProcedureId !== null;

  return (
    <div className="bg-card border-2 border-border rounded-xl overflow-hidden">
      <button
        className="w-full p-4 flex items-center gap-3 text-left"
        onClick={() => setExpanded((e) => !e)}
      >
        <div className="flex-1 min-w-0">
          <p className="font-bold text-base">{item.name}</p>
          <div className="mt-2 space-y-1">
            <div className="h-2 bg-muted rounded-full overflow-hidden">
              <div
                className={cn("h-full rounded-full transition-all", item.progress === 100 ? "bg-green-500" : "bg-primary")}
                style={{ width: `${item.progress}%` }}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              {item.procedures.filter((p) => p.status === "completed").length} / {item.procedures.length} done
            </p>
          </div>
        </div>
        <div className="flex-shrink-0">
          {expanded ? <ChevronUp className="h-5 w-5 text-muted-foreground" /> : <ChevronDown className="h-5 w-5 text-muted-foreground" />}
        </div>
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-2 border-t border-border pt-3">
          {item.procedures.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">No procedures</p>
          ) : (
            item.procedures.map((proc) => (
              <ProcedureRow
                key={proc.id}
                proc={proc}
                isAdmin={isAdmin}
                activeTimerProcedureId={activeTimerProcedureId}
                hasAnyActiveTimer={hasActiveTimer}
                projectId={projectId}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}

export default function WorkProjectDetailPage() {
  const [, params] = useRoute("/work/projects/:id");
  const projectId = Number(params?.id);
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: project, isLoading } = useQuery({
    queryKey: [`/api/work/projects/${projectId}`],
    queryFn: () => fetchProject(projectId),
    refetchInterval: 10000,
    enabled: !!projectId,
  });

  const { data: activeTimer } = useQuery({
    queryKey: ["/api/work/active-timer"],
    queryFn: fetchActiveTimer,
    refetchInterval: 5000,
  });

  const completeMutation = useMutation({
    mutationFn: () => markProjectComplete(projectId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/work/projects/${projectId}`] });
      queryClient.invalidateQueries({ queryKey: ["/api/work/projects"] });
      toast({ title: "Project marked as complete!" });
    },
    onError: () => toast({ title: "Failed to update", variant: "destructive" }),
  });

  const activeTimerProcedureId = activeTimer?.log?.procedureId ?? null;

  if (isLoading) {
    return (
      <div className="p-4 space-y-4">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (!project) {
    return <div className="p-6 text-center text-muted-foreground">Project not found.</div>;
  }

  const daysLeft = differenceInDays(new Date(project.deadline), new Date());
  const isOverdue = isPast(new Date(project.deadline)) && project.status !== "completed";

  return (
    <div className="flex flex-col min-h-full pb-24">
      <div className="bg-secondary text-secondary-foreground p-4 sticky top-0 z-20 shadow-sm flex items-center gap-3">
        <Link href="/work/projects" className="p-2 -ml-2 rounded-full hover:bg-secondary-foreground/10 transition-colors">
          <ArrowLeft className="h-6 w-6" />
        </Link>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold truncate">{project.name}</h1>
        </div>
        <Badge className={priorityColors[project.priority] + " text-xs font-bold uppercase"}>
          {project.priority}
        </Badge>
      </div>

      <div className="p-4 space-y-4">
        {/* Project overview card */}
        <div className={cn(
          "rounded-xl border-2 p-4 space-y-3",
          isOverdue ? "bg-red-50 border-red-300" : project.status === "completed" ? "bg-green-50 border-green-300" : "bg-card border-border"
        )}>
          <div className="flex justify-between items-start">
            <div>
              <p className="text-3xl font-black">{project.progress}%</p>
              <p className="text-xs text-muted-foreground uppercase tracking-wider">complete</p>
            </div>
            <div className="text-right">
              <p className="font-bold text-sm">{format(new Date(project.deadline), "dd MMM yyyy")}</p>
              <p className={cn("text-xs font-semibold", isOverdue ? "text-red-600" : daysLeft < 5 ? "text-orange-600" : "text-green-600")}>
                {project.status === "completed" ? "Completed ✓" : isOverdue ? "Overdue!" : `${daysLeft} days left`}
              </p>
            </div>
          </div>
          <div className="h-3 bg-black/10 rounded-full overflow-hidden">
            <div
              className={cn("h-full rounded-full transition-all", project.progress === 100 ? "bg-green-500" : "bg-primary")}
              style={{ width: `${project.progress}%` }}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            {project.completedProcedures} / {project.totalProcedures} procedures completed · {project.items.length} items
          </p>
        </div>

        {activeTimer && activeTimerProcedureId && (
          <div className="bg-orange-50 border-2 border-orange-300 rounded-xl p-3 flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-orange-600 flex-shrink-0" />
            <p className="text-sm text-orange-700 font-medium">
              Task running: <strong>{activeTimer.procedure?.name}</strong>
            </p>
          </div>
        )}

        {/* Items */}
        <div className="space-y-2">
          <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Items</p>
          {project.items.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm">No items in this project.</div>
          ) : (
            project.items.map((item) => (
              <ItemCard
                key={item.id}
                item={item}
                isAdmin={isAdmin}
                activeTimerProcedureId={activeTimerProcedureId}
                projectId={projectId}
              />
            ))
          )}
        </div>

        {isAdmin && project.status === "in_progress" && project.progress === 100 && (
          <Button
            className="w-full h-14 bg-green-600 hover:bg-green-700 font-bold text-base gap-2"
            onClick={() => completeMutation.mutate()}
            disabled={completeMutation.isPending}
          >
            <CheckCircle2 className="h-5 w-5" /> Mark Project Complete
          </Button>
        )}
      </div>
    </div>
  );
}
