import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { useAuth } from "@/contexts/auth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, AlertTriangle, Clock, CheckCircle2, ChevronRight, Trash2, User, Zap, ShieldAlert, Flame, LayoutGrid, List, Radio } from "lucide-react";
import { format, differenceInDays, isPast } from "date-fns";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";

interface Project {
  id: number;
  name: string;
  deadline: string;
  priority: "low" | "normal" | "high" | "urgent";
  status: "in_progress" | "completed";
  itemCount: number;
  totalProcedures: number;
  completedProcedures: number;
  inProgressCount: number;
  blockedCount: number;
  activeWorkers: string[];
  progress: number;
}

interface StationBoard {
  id: number;
  name: string;
  color: string;
  activeSteps: number;
  pendingSteps: number;
  activeWorkers: string[];
  projectNames: string[];
}

async function fetchProjects(): Promise<Project[]> {
  const res = await fetch("/api/work/projects", { credentials: "include" });
  if (!res.ok) throw new Error("Failed to load projects");
  return res.json();
}

async function deleteProject(id: number) {
  const res = await fetch(`/api/work/projects/${id}`, { method: "DELETE", credentials: "include" });
  if (!res.ok) throw new Error("Failed to delete project");
}

function urgencyInfo(deadline: string, status: string) {
  if (status === "completed") return { label: "Completed", color: "text-green-600", bg: "border-green-300", badge: null };
  const days = differenceInDays(new Date(deadline), new Date());
  if (isPast(new Date(deadline))) return { label: "OVERDUE", color: "text-red-600", bg: "border-red-400 bg-red-50/40", badge: "overdue" };
  if (days === 0) return { label: "Due today!", color: "text-red-600", bg: "border-red-300 bg-red-50/20", badge: "today" };
  if (days < 3) return { label: `${days}d left`, color: "text-orange-600", bg: "border-orange-300", badge: "soon" };
  if (days < 7) return { label: `${days}d left`, color: "text-amber-600", bg: "border-amber-200", badge: null };
  return { label: `${days}d left`, color: "text-muted-foreground", bg: "border-border", badge: null };
}

const priorityColors: Record<string, string> = {
  urgent: "bg-red-100 text-red-700 border-red-200",
  high: "bg-orange-100 text-orange-700 border-orange-200",
  normal: "bg-blue-100 text-blue-700 border-blue-200",
  low: "bg-gray-100 text-gray-600 border-gray-200",
};

const priorityOrder: Record<string, number> = { urgent: 0, high: 1, normal: 2, low: 3 };

function sortByUrgency(a: Project, b: Project) {
  const da = differenceInDays(new Date(a.deadline), new Date());
  const db2 = differenceInDays(new Date(b.deadline), new Date());
  if (da !== db2) return da - db2;
  return (priorityOrder[a.priority] ?? 2) - (priorityOrder[b.priority] ?? 2);
}

function StationStrip({ stations }: { stations: StationBoard[] }) {
  if (stations.length === 0) return null;
  return (
    <div className="space-y-1.5">
      <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground px-1 flex items-center gap-1.5">
        <Radio className="h-3 w-3 text-green-500" /> Live Stations
      </p>
      <div className="flex gap-2 overflow-x-auto pb-1 -mx-4 px-4">
        {stations.map((s) => {
          const busy = s.activeSteps > 0;
          return (
            <Link key={s.id} href={`/work/queue/${s.id}`}>
              <div className="flex-shrink-0 w-36 rounded-xl border-2 p-3 space-y-1.5 cursor-pointer hover:border-primary/40 transition-colors"
                style={{ borderColor: busy ? s.color + "88" : undefined, backgroundColor: busy ? s.color + "11" : undefined }}>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold truncate" style={{ color: s.color }}>{s.name}</span>
                  <span className={`w-2 h-2 rounded-full flex-shrink-0 ${busy ? "bg-green-500 animate-pulse" : "bg-gray-300"}`} />
                </div>
                <p className="text-[11px] text-muted-foreground">
                  {busy ? `${s.activeSteps} active` : "Idle"}{s.pendingSteps > 0 ? ` · ${s.pendingSteps} queued` : ""}
                </p>
                {s.activeWorkers.length > 0 && (
                  <p className="text-[10px] font-semibold truncate" style={{ color: s.color }}>
                    {s.activeWorkers.map((w) => w.split(" ")[0]).join(", ")}
                  </p>
                )}
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

function BoardCard({ project }: { project: Project }) {
  const urgency = urgencyInfo(project.deadline, project.status);
  const priorityBorderColors: Record<string, string> = {
    urgent: "border-l-red-500", high: "border-l-orange-400",
    normal: "border-l-blue-400", low: "border-l-gray-300",
  };
  return (
    <Link href={`/work/projects/${project.id}`}>
      <div className={`bg-card border border-border border-l-4 ${priorityBorderColors[project.priority] ?? priorityBorderColors.normal} rounded-xl p-3 space-y-2 active:opacity-80`}>
        <div className="flex items-center justify-between gap-2">
          <p className="font-bold text-sm leading-tight truncate flex-1">{project.name}</p>
          <span className={`text-[10px] font-bold flex-shrink-0 ${urgency.color}`}>{urgency.label}</span>
        </div>
        <div className="h-1.5 bg-black/10 rounded-full overflow-hidden">
          <div className="h-full bg-primary rounded-full" style={{ width: `${project.progress}%` }} />
        </div>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            {project.blockedCount > 0 && (
              <span className="flex items-center gap-0.5 text-[10px] font-bold text-red-600">
                <ShieldAlert className="h-3 w-3" />{project.blockedCount}
              </span>
            )}
            {project.activeWorkers.length > 0 && (
              <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground">
                <User className="h-3 w-3" />{project.activeWorkers.map((w) => w.split(" ")[0]).join(", ")}
              </span>
            )}
          </div>
          <span className="text-[10px] font-black text-muted-foreground">{project.progress}%</span>
        </div>
      </div>
    </Link>
  );
}

export default function WorkProjectsPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [viewMode, setViewMode] = useState<"list" | "board">("list");

  const { data: projects, isLoading } = useQuery({
    queryKey: ["/api/work/projects"],
    queryFn: fetchProjects,
    refetchInterval: 15000,
  });

  const { data: stationBoard = [] } = useQuery<StationBoard[]>({
    queryKey: ["/api/stations/board"],
    queryFn: async () => {
      const r = await fetch("/api/stations/board", { credentials: "include" });
      if (!r.ok) throw new Error("Failed");
      return r.json();
    },
    enabled: viewMode === "board",
    refetchInterval: viewMode === "board" ? 15000 : false,
  });

  const deleteMutation = useMutation({
    mutationFn: deleteProject,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/work/projects"] });
      toast({ title: "Project deleted" });
    },
    onError: () => toast({ title: "Failed to delete project", variant: "destructive" }),
  });

  const inProgress = projects?.filter((p) => p.status === "in_progress") ?? [];
  const completed = projects?.filter((p) => p.status === "completed") ?? [];

  return (
    <div className="p-4 space-y-4 pb-24">
      <div className="flex items-center justify-between pt-2">
        <div>
          <h1 className="text-2xl font-black">Work Orders</h1>
          <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Projects</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setViewMode(viewMode === "list" ? "board" : "list")}
            className={`flex items-center gap-1 text-xs font-semibold border rounded-lg px-2.5 py-1.5 transition-colors ${viewMode === "board" ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:text-foreground"}`}
          >
            {viewMode === "board" ? <List className="h-3.5 w-3.5" /> : <LayoutGrid className="h-3.5 w-3.5" />}
            {viewMode === "board" ? "List" : "Board"}
          </button>
          {isAdmin && (
            <Link href="/work/projects/new">
              <Button size="sm" className="font-bold gap-1">
                <Plus className="h-4 w-4" /> New
              </Button>
            </Link>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-32 w-full rounded-xl" />)}
        </div>
      ) : viewMode === "board" && projects && projects.length > 0 ? (
        <div className="space-y-4">
          <StationStrip stations={stationBoard} />

          {/* Summary chips */}
          {(() => {
            const active = projects.filter((p) => p.status === "in_progress");
            const overdue = active.filter((p) => isPast(new Date(p.deadline)));
            const blocked = active.filter((p) => p.blockedCount > 0);
            return (
              <div className="flex gap-2 flex-wrap">
                <span className="text-xs font-semibold bg-blue-100 text-blue-700 border border-blue-200 rounded-full px-2.5 py-1">{active.length} active</span>
                {overdue.length > 0 && <span className="text-xs font-semibold bg-red-100 text-red-700 border border-red-200 rounded-full px-2.5 py-1">{overdue.length} overdue</span>}
                {blocked.length > 0 && <span className="text-xs font-semibold bg-orange-100 text-orange-700 border border-orange-200 rounded-full px-2.5 py-1">{blocked.length} blocked</span>}
              </div>
            );
          })()}

          {/* Jobs grouped by urgency */}
          {(() => {
            const active = projects.filter((p) => p.status === "in_progress").sort(sortByUrgency);
            const overdue = active.filter((p) => isPast(new Date(p.deadline)));
            const today = active.filter((p) => { const d = differenceInDays(new Date(p.deadline), new Date()); return !isPast(new Date(p.deadline)) && d <= 1; });
            const soon = active.filter((p) => { const d = differenceInDays(new Date(p.deadline), new Date()); return d > 1 && d < 7; });
            const normal = active.filter((p) => differenceInDays(new Date(p.deadline), new Date()) >= 7);
            const done = projects.filter((p) => p.status === "completed");
            return (
              <div className="space-y-4">
                {overdue.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-[10px] font-black uppercase tracking-wider text-red-600 px-1 flex items-center gap-1"><Flame className="h-3 w-3" /> Overdue</p>
                    {overdue.map((p) => <BoardCard key={p.id} project={p} />)}
                  </div>
                )}
                {today.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-[10px] font-black uppercase tracking-wider text-orange-600 px-1 flex items-center gap-1"><AlertTriangle className="h-3 w-3" /> Due Today / Tomorrow</p>
                    {today.map((p) => <BoardCard key={p.id} project={p} />)}
                  </div>
                )}
                {soon.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-amber-600 px-1">Due This Week</p>
                    {soon.map((p) => <BoardCard key={p.id} project={p} />)}
                  </div>
                )}
                {normal.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground px-1">In Progress</p>
                    {normal.map((p) => <BoardCard key={p.id} project={p} />)}
                  </div>
                )}
                {done.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground px-1">Completed</p>
                    {done.map((p) => (
                      <Link key={p.id} href={`/work/projects/${p.id}`}>
                        <div className="bg-card border border-border rounded-xl p-3 opacity-60 flex items-center justify-between">
                          <p className="text-sm font-semibold">{p.name}</p>
                          <CheckCircle2 className="h-4 w-4 text-green-600 flex-shrink-0" />
                        </div>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            );
          })()}
        </div>
      ) : projects?.length === 0 ? (
        <div className="text-center py-16 px-4 bg-muted/30 rounded-xl border border-dashed">
          <Clock className="h-10 w-10 mx-auto mb-3 text-muted-foreground" />
          <p className="font-semibold">No projects yet</p>
          {isAdmin && <p className="text-sm text-muted-foreground mt-1">Create your first work order to get started.</p>}
        </div>
      ) : (
        <div className="space-y-4">
          {inProgress.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground px-1">In Progress</p>
              {inProgress.map((project) => {
                const urgency = urgencyInfo(project.deadline, project.status);
                return (
                  <div key={project.id} className={`bg-card border-2 rounded-xl overflow-hidden ${urgency.bg}`}>
                    <Link href={`/work/projects/${project.id}`}>
                      <div className="p-4 space-y-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <h3 className="font-bold text-lg leading-tight truncate">{project.name}</h3>
                              {urgency.badge === "overdue" && (
                                <span className="flex items-center gap-0.5 text-[10px] font-black bg-red-600 text-white rounded px-1.5 py-0.5 flex-shrink-0 animate-pulse">
                                  <Flame className="h-3 w-3" /> OVERDUE
                                </span>
                              )}
                              {urgency.badge === "today" && (
                                <span className="flex items-center gap-0.5 text-[10px] font-black bg-red-500 text-white rounded px-1.5 py-0.5 flex-shrink-0">
                                  <AlertTriangle className="h-3 w-3" /> TODAY
                                </span>
                              )}
                              {urgency.badge === "soon" && (
                                <span className="text-[10px] font-black bg-orange-100 text-orange-700 border border-orange-300 rounded px-1.5 py-0.5 flex-shrink-0">
                                  DUE SOON
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-2 mt-1 flex-wrap">
                              <Badge className={`text-[10px] font-bold uppercase ${priorityColors[project.priority] ?? priorityColors.normal}`}>
                                {project.priority}
                              </Badge>
                              <span className={`text-xs font-semibold ${urgency.color}`}>
                                {urgency.label}
                              </span>
                              <span className="text-xs text-muted-foreground">
                                {format(new Date(project.deadline), "dd MMM yyyy")}
                              </span>
                            </div>
                          </div>
                          <div className="flex items-center gap-1 flex-shrink-0">
                            <div className="text-right">
                              <p className="text-2xl font-black leading-none">{project.progress}%</p>
                              <p className="text-[10px] text-muted-foreground">done</p>
                            </div>
                            <ChevronRight className="h-5 w-5 text-muted-foreground" />
                          </div>
                        </div>
                        <div className="space-y-2">
                          <div className="h-2.5 bg-black/10 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-primary rounded-full transition-all"
                              style={{ width: `${project.progress}%` }}
                            />
                          </div>
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-xs text-muted-foreground">
                              {project.completedProcedures}/{project.totalProcedures} steps · {project.itemCount} items
                            </p>
                            <div className="flex items-center gap-2">
                              {project.blockedCount > 0 && (
                                <span className="flex items-center gap-0.5 text-[11px] font-bold text-red-600">
                                  <ShieldAlert className="h-3.5 w-3.5" /> {project.blockedCount} blocked
                                </span>
                              )}
                              {project.inProgressCount > 0 && project.blockedCount === 0 && (
                                <span className="flex items-center gap-0.5 text-[11px] font-bold text-blue-600">
                                  <Zap className="h-3.5 w-3.5" /> {project.inProgressCount} active
                                </span>
                              )}
                            </div>
                          </div>
                          {(project.activeWorkers ?? []).length > 0 && (
                            <div className="flex items-center gap-1 flex-wrap">
                              {(project.activeWorkers ?? []).map((w) => (
                                <span key={w} className="flex items-center gap-1 text-[11px] font-semibold bg-green-100 text-green-700 border border-green-200 rounded-full px-2 py-0.5">
                                  <User className="h-3 w-3" /> {w}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </Link>
                    {isAdmin && (
                      <div className="px-4 pb-3 flex justify-end">
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive h-8 text-xs gap-1">
                              <Trash2 className="h-3.5 w-3.5" /> Delete
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent className="w-[90vw] max-w-md rounded-xl">
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete Project?</AlertDialogTitle>
                              <AlertDialogDescription>This cannot be undone. All items and procedures will be deleted.</AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction onClick={() => deleteMutation.mutate(project.id)} className="bg-destructive text-destructive-foreground">Delete</AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {completed.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground px-1">Completed</p>
              {completed.map((project) => (
                <Link key={project.id} href={`/work/projects/${project.id}`}>
                  <div className="bg-card border-2 border-border rounded-xl p-4 opacity-70">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="font-bold">{project.name}</h3>
                        <p className="text-xs text-muted-foreground mt-0.5">{format(new Date(project.deadline), "dd MMM yyyy")}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="h-5 w-5 text-green-600" />
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      </div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
