import { useState } from "react";
import { useLocation, Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { ArrowLeft, Loader2, Calendar, FolderPlus } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface Template {
  id: number;
  name: string;
  procedures: { id: number; name: string; sortOrder: number }[];
}

async function fetchTemplates(): Promise<Template[]> {
  const res = await fetch("/api/work/templates", { credentials: "include" });
  if (!res.ok) throw new Error("Failed to load templates");
  return res.json();
}

async function createProject(data: { name: string; deadline: string; priority: string; templateIds: number[] }) {
  const res = await fetch("/api/work/projects", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const d = await res.json().catch(() => ({}));
    throw new Error(d.error || "Failed to create project");
  }
  return res.json();
}

const priorities = [
  { value: "low", label: "Low", color: "border-blue-400 bg-blue-50 text-blue-700" },
  { value: "medium", label: "Medium", color: "border-orange-400 bg-orange-50 text-orange-700" },
  { value: "high", label: "High", color: "border-red-400 bg-red-50 text-red-700" },
];

export default function WorkProjectFormPage() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [name, setName] = useState("");
  const [deadline, setDeadline] = useState("");
  const [priority, setPriority] = useState<"low" | "medium" | "high">("medium");
  const [selectedTemplates, setSelectedTemplates] = useState<number[]>([]);

  const { data: templates = [], isLoading } = useQuery({
    queryKey: ["/api/work/templates"],
    queryFn: fetchTemplates,
  });

  const createMutation = useMutation({
    mutationFn: createProject,
    onSuccess: (project) => {
      queryClient.invalidateQueries({ queryKey: ["/api/work/projects"] });
      toast({ title: "Project created!" });
      setLocation(`/work/projects/${project.id}`);
    },
    onError: (err) => toast({ title: err instanceof Error ? err.message : "Failed", variant: "destructive" }),
  });

  if (user?.role !== "admin") {
    return <div className="p-6 text-center text-muted-foreground mt-20"><p>Admin only</p></div>;
  }

  const handleToggleTemplate = (id: number) => {
    setSelectedTemplates((prev) =>
      prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]
    );
  };

  const canSubmit = name.trim() && deadline && selectedTemplates.length > 0;

  return (
    <div className="flex flex-col min-h-full">
      <div className="bg-secondary text-secondary-foreground p-4 sticky top-0 z-20 shadow-sm flex items-center gap-3">
        <Link href="/work/projects" className="p-2 -ml-2 rounded-full hover:bg-secondary-foreground/10 transition-colors">
          <ArrowLeft className="h-6 w-6" />
        </Link>
        <h1 className="text-xl font-bold">New Work Order</h1>
      </div>

      <div className="p-4 space-y-6 pb-24">
        <div className="space-y-2">
          <Label className="text-sm font-bold">Project Name</Label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Batch #42 Production"
            className="h-12 border-2 text-base"
          />
        </div>

        <div className="space-y-2">
          <Label className="text-sm font-bold flex items-center gap-2">
            <Calendar className="h-4 w-4" /> Deadline
          </Label>
          <Input
            type="date"
            value={deadline}
            onChange={(e) => setDeadline(e.target.value)}
            className="h-12 border-2 text-base"
            min={new Date().toISOString().split("T")[0]}
          />
        </div>

        <div className="space-y-2">
          <Label className="text-sm font-bold">Priority</Label>
          <div className="grid grid-cols-3 gap-2">
            {priorities.map((p) => (
              <button
                key={p.value}
                type="button"
                onClick={() => setPriority(p.value as "low" | "medium" | "high")}
                className={cn(
                  "h-12 rounded-lg border-2 font-bold text-sm transition-all",
                  priority === p.value ? p.color + " border-current" : "bg-muted/30 text-muted-foreground border-border"
                )}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-3">
          <Label className="text-sm font-bold">Select Items to Include</Label>
          {isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => <div key={i} className="h-16 bg-muted/40 rounded-lg animate-pulse" />)}
            </div>
          ) : templates.length === 0 ? (
            <div className="text-center py-8 px-4 bg-muted/30 rounded-xl border border-dashed text-sm text-muted-foreground">
              No item templates created yet.{" "}
              <Link href="/work/templates" className="text-primary font-semibold">Create templates first.</Link>
            </div>
          ) : (
            <div className="space-y-2">
              {templates.map((template) => (
                <label
                  key={template.id}
                  className={cn(
                    "flex items-start gap-3 p-3 rounded-lg border-2 cursor-pointer transition-all",
                    selectedTemplates.includes(template.id)
                      ? "border-primary bg-primary/5"
                      : "border-border bg-card"
                  )}
                >
                  <Checkbox
                    checked={selectedTemplates.includes(template.id)}
                    onCheckedChange={() => handleToggleTemplate(template.id)}
                    className="mt-0.5"
                  />
                  <div className="flex-1">
                    <p className="font-bold">{template.name}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {template.procedures.length} procedure{template.procedures.length !== 1 ? "s" : ""}: {template.procedures.map((p) => p.name).join(", ")}
                    </p>
                  </div>
                </label>
              ))}
            </div>
          )}
        </div>

        <Button
          onClick={() => createMutation.mutate({ name: name.trim(), deadline, priority, templateIds: selectedTemplates })}
          disabled={!canSubmit || createMutation.isPending}
          className="w-full h-14 font-bold text-base"
        >
          {createMutation.isPending ? (
            <><Loader2 className="mr-2 h-5 w-5 animate-spin" /> Creating…</>
          ) : (
            <><FolderPlus className="mr-2 h-5 w-5" /> Create Work Order</>
          )}
        </Button>
      </div>
    </div>
  );
}
