import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { useAuth } from "@/contexts/auth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, AlertTriangle, Clock, CheckCircle2, ChevronRight, Trash2 } from "lucide-react";
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
  priority: "low" | "medium" | "high";
  status: "in_progress" | "completed";
  itemCount: number;
  totalProcedures: number;
  completedProcedures: number;
  progress: number;
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
  if (status === "completed") return { label: "Completed", color: "text-green-600", bg: "bg-green-500/10 border-green-500/20" };
  const days = differenceInDays(new Date(deadline), new Date());
  if (isPast(new Date(deadline))) return { label: "Overdue!", color: "text-red-600", bg: "bg-red-500/10 border-red-500/30" };
  if (days < 2) return { label: `${days}d left`, color: "text-red-600", bg: "bg-red-500/10 border-red-500/30" };
  if (days < 5) return { label: `${days}d left`, color: "text-orange-600", bg: "bg-orange-500/10 border-orange-500/30" };
  return { label: `${days}d left`, color: "text-green-600", bg: "bg-green-500/10 border-green-500/20" };
}

const priorityColors: Record<string, string> = {
  high: "bg-red-100 text-red-700 border-red-200",
  medium: "bg-orange-100 text-orange-700 border-orange-200",
  low: "bg-blue-100 text-blue-700 border-blue-200",
};

export default function WorkProjectsPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: projects, isLoading } = useQuery({
    queryKey: ["/api/work/projects"],
    queryFn: fetchProjects,
    refetchInterval: 15000,
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
        {isAdmin && (
          <Link href="/work/projects/new">
            <Button size="sm" className="font-bold gap-1">
              <Plus className="h-4 w-4" /> New
            </Button>
          </Link>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-32 w-full rounded-xl" />)}
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
                            <h3 className="font-bold text-lg leading-tight truncate">{project.name}</h3>
                            <div className="flex items-center gap-2 mt-1 flex-wrap">
                              <Badge className={`text-[10px] font-bold uppercase ${priorityColors[project.priority]}`}>
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
                        <div className="space-y-1">
                          <div className="h-2.5 bg-black/10 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-primary rounded-full transition-all"
                              style={{ width: `${project.progress}%` }}
                            />
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {project.completedProcedures} / {project.totalProcedures} procedures · {project.itemCount} items
                          </p>
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
