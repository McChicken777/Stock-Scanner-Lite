import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/auth";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Play, CheckCircle2, Circle } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

interface Task {
  id: number;
  projectId: number;
  itemId: number;
  procedureId: number;
  status: "not_started" | "in_progress" | "completed";
  companyId: number;
  createdAt: string;
  procedureName: string;
  itemName: string;
  roleName: string;
}

async function fetchTasks(): Promise<Task[]> {
  const res = await fetch("/api/tasks/tasks", { credentials: "include" });
  if (!res.ok) throw new Error("Failed");
  return res.json();
}

export default function TasksDashboardPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: tasks = [], isLoading } = useQuery({
    queryKey: ["/api/tasks/tasks"],
    queryFn: fetchTasks,
    refetchInterval: 10000,
  });

  const startMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/tasks/tasks/${id}/start`, {
        method: "PUT", credentials: "include",
        headers: { "Content-Type": "application/json" },
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Failed");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks/tasks"] });
      toast({ title: "Task started" });
    },
    onError: (err) => toast({
      title: err instanceof Error ? err.message : "Failed",
      variant: "destructive",
    }),
  });

  const completeMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/tasks/tasks/${id}/complete`, {
        method: "PUT", credentials: "include",
        headers: { "Content-Type": "application/json" },
      });
      if (!res.ok) throw new Error("Failed");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks/tasks"] });
      toast({ title: "Task completed" });
    },
    onError: () => toast({ title: "Failed", variant: "destructive" }),
  });

  const notStarted = tasks.filter((t) => t.status === "not_started");
  const inProgress = tasks.filter((t) => t.status === "in_progress");
  const completed = tasks.filter((t) => t.status === "completed");

  return (
    <div className="p-4 space-y-4 pb-24">
      <div>
        <h1 className="text-2xl font-bold">My Tasks</h1>
        <p className="text-xs text-muted-foreground">Production tasks for your roles</p>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-24 w-full rounded-xl" />)}
        </div>
      ) : (
        <div className="space-y-4">
          {inProgress.length > 0 && (
            <div className="space-y-2">
              <h2 className="text-sm font-bold uppercase text-orange-600">In Progress</h2>
              {inProgress.map((task) => (
                <div key={task.id} className="bg-orange-50 border-2 border-orange-200 rounded-lg p-3 space-y-2">
                  <p className="font-bold">{task.procedureName}</p>
                  <p className="text-sm text-muted-foreground">{task.itemName}</p>
                  <Button
                    size="sm"
                    onClick={() => completeMutation.mutate(task.id)}
                    disabled={completeMutation.isPending}
                    className="w-full bg-green-600 hover:bg-green-700 font-bold"
                  >
                    <CheckCircle2 className="h-4 w-4 mr-1" /> Mark Complete
                  </Button>
                </div>
              ))}
            </div>
          )}

          {notStarted.length > 0 && (
            <div className="space-y-2">
              <h2 className="text-sm font-bold uppercase text-muted-foreground">Ready to Start</h2>
              {notStarted.map((task) => (
                <div key={task.id} className="bg-card border-2 border-border rounded-lg p-3 space-y-2">
                  <p className="font-bold">{task.procedureName}</p>
                  <p className="text-sm text-muted-foreground">{task.itemName}</p>
                  <Button
                    size="sm"
                    onClick={() => startMutation.mutate(task.id)}
                    disabled={startMutation.isPending}
                    className="w-full bg-green-600 hover:bg-green-700 font-bold"
                  >
                    <Play className="h-4 w-4 mr-1" /> Start Task
                  </Button>
                </div>
              ))}
            </div>
          )}

          {completed.length > 0 && (
            <div className="space-y-2">
              <h2 className="text-sm font-bold uppercase text-green-600">Completed</h2>
              {completed.map((task) => (
                <div key={task.id} className="bg-green-50/50 border-2 border-green-200/50 rounded-lg p-3">
                  <p className="font-bold text-green-700">{task.procedureName}</p>
                  <p className="text-sm text-muted-foreground">{task.itemName}</p>
                </div>
              ))}
            </div>
          )}

          {tasks.length === 0 && (
            <div className="text-center py-12 text-muted-foreground">
              <p>No tasks assigned to your roles</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
