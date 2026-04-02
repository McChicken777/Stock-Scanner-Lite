import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2, Edit2, Check, X, Tag, Loader2, GripVertical, PackageCheck } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

interface Template {
  id: number;
  name: string;
  procedures: { id: number; name: string; sortOrder: number; requiresInbound: boolean }[];
}

async function fetchTemplates(): Promise<Template[]> {
  const res = await fetch("/api/work/templates", { credentials: "include" });
  if (!res.ok) throw new Error("Failed");
  return res.json();
}

const defaultProcedures = ["Laser cutting", "Sandblasting", "Bending", "CNC", "Welding", "Painting"];

export default function WorkTemplatesPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [newTemplateName, setNewTemplateName] = useState("");
  const [newProcName, setNewProcName] = useState<Record<number, string>>({});
  const [editingName, setEditingName] = useState<Record<number, string>>({});
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedProcedures, setSelectedProcedures] = useState<string[]>([]);
  const [customProc, setCustomProc] = useState("");

  const { data: templates = [], isLoading } = useQuery({
    queryKey: ["/api/work/templates"],
    queryFn: fetchTemplates,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["/api/work/templates"] });

  const createTemplate = useMutation({
    mutationFn: async ({ name, procedures }: { name: string; procedures: string[] }) => {
      const res = await fetch("/api/work/templates", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) throw new Error("Failed");
      const t = await res.json();
      for (let i = 0; i < procedures.length; i++) {
        await fetch(`/api/work/templates/${t.id}/procedures`, {
          method: "POST", credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: procedures[i], sortOrder: i }),
        });
      }
      return t;
    },
    onSuccess: () => {
      invalidate();
      setCreateOpen(false);
      setNewTemplateName("");
      setSelectedProcedures([]);
      setCustomProc("");
      toast({ title: "Template created" });
    },
    onError: () => toast({ title: "Failed to create template", variant: "destructive" }),
  });

  const deleteTemplate = useMutation({
    mutationFn: async (id: number) => {
      await fetch(`/api/work/templates/${id}`, { method: "DELETE", credentials: "include" });
    },
    onSuccess: () => { invalidate(); toast({ title: "Template deleted" }); },
    onError: () => toast({ title: "Failed to delete", variant: "destructive" }),
  });

  const addProcedure = useMutation({
    mutationFn: async ({ templateId, name }: { templateId: number; name: string }) => {
      const res = await fetch(`/api/work/templates/${templateId}/procedures`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, sortOrder: 99 }),
      });
      if (!res.ok) throw new Error("Failed");
    },
    onSuccess: (_, { templateId }) => {
      invalidate();
      setNewProcName((p) => ({ ...p, [templateId]: "" }));
    },
    onError: () => toast({ title: "Failed to add procedure", variant: "destructive" }),
  });

  const deleteProcedure = useMutation({
    mutationFn: async ({ templateId, procId }: { templateId: number; procId: number }) => {
      await fetch(`/api/work/templates/${templateId}/procedures/${procId}`, { method: "DELETE", credentials: "include" });
    },
    onSuccess: () => invalidate(),
    onError: () => toast({ title: "Failed to delete procedure", variant: "destructive" }),
  });

  const toggleRequiresInbound = useMutation({
    mutationFn: async ({ templateId, procId, requiresInbound }: { templateId: number; procId: number; requiresInbound: boolean }) => {
      const res = await fetch(`/api/work/templates/${templateId}/procedures/${procId}`, {
        method: "PUT", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requiresInbound }),
      });
      if (!res.ok) throw new Error("Failed");
    },
    onSuccess: () => invalidate(),
    onError: () => toast({ title: "Failed to update procedure", variant: "destructive" }),
  });

  if (user?.role !== "admin") {
    return <div className="p-6 text-center text-muted-foreground mt-20"><p>Admin only</p></div>;
  }

  const toggleDefaultProc = (proc: string) => {
    setSelectedProcedures((prev) =>
      prev.includes(proc) ? prev.filter((p) => p !== proc) : [...prev, proc]
    );
  };

  const allSelectedProcedures = [
    ...selectedProcedures,
    ...(customProc.trim() ? [customProc.trim()] : []),
  ];

  return (
    <div className="p-4 space-y-4 pb-24">
      <div className="flex items-center justify-between pt-2">
        <div>
          <h1 className="text-2xl font-black">Item Templates</h1>
          <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Admin Only</p>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="font-bold gap-1">
              <Plus className="h-4 w-4" /> New
            </Button>
          </DialogTrigger>
          <DialogContent className="w-[90vw] max-w-sm rounded-xl">
            <DialogHeader>
              <DialogTitle>New Item Template</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-bold">Template Name</label>
                <Input
                  value={newTemplateName}
                  onChange={(e) => setNewTemplateName(e.target.value)}
                  placeholder="e.g. Mask, Distance Holder"
                  className="h-12 border-2"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-bold">Procedures</label>
                <div className="grid grid-cols-2 gap-2">
                  {defaultProcedures.map((proc) => (
                    <button
                      key={proc}
                      type="button"
                      onClick={() => toggleDefaultProc(proc)}
                      className={`text-sm h-10 rounded-lg border-2 font-medium transition-all ${
                        selectedProcedures.includes(proc)
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border bg-muted/30 text-muted-foreground"
                      }`}
                    >
                      {proc}
                    </button>
                  ))}
                </div>
                <div className="flex gap-2 mt-2">
                  <Input
                    value={customProc}
                    onChange={(e) => setCustomProc(e.target.value)}
                    placeholder="Custom procedure..."
                    className="h-10 border-2 text-sm"
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && customProc.trim()) {
                        setSelectedProcedures((p) => [...p, customProc.trim()]);
                        setCustomProc("");
                      }
                    }}
                  />
                </div>
                {allSelectedProcedures.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {allSelectedProcedures.map((p) => (
                      <span key={p} className="bg-primary/10 text-primary text-xs px-2 py-0.5 rounded-full font-medium">{p}</span>
                    ))}
                  </div>
                )}
              </div>
              <Button
                className="w-full h-12 font-bold"
                disabled={!newTemplateName.trim() || allSelectedProcedures.length === 0 || createTemplate.isPending}
                onClick={() => createTemplate.mutate({ name: newTemplateName.trim(), procedures: allSelectedProcedures })}
              >
                {createTemplate.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Create Template
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2].map((i) => <div key={i} className="h-32 bg-muted/40 rounded-xl animate-pulse" />)}
        </div>
      ) : templates.length === 0 ? (
        <div className="text-center py-16 px-4 bg-muted/30 rounded-xl border border-dashed">
          <Tag className="h-10 w-10 mx-auto mb-3 text-muted-foreground" />
          <p className="font-semibold">No templates yet</p>
          <p className="text-sm text-muted-foreground mt-1">Create templates to use when creating projects.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {templates.map((template) => (
            <div key={template.id} className="bg-card border-2 border-border rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-lg">{template.name}</h3>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                  onClick={() => {
                    if (confirm(`Delete template "${template.name}"?`)) {
                      deleteTemplate.mutate(template.id);
                    }
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>

              <div className="space-y-1.5">
                {template.procedures.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic">No procedures yet</p>
                ) : (
                  template.procedures.map((proc) => (
                    <div key={proc.id} className="flex items-center gap-2 text-sm">
                      <GripVertical className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                      <span className="flex-1">{proc.name}</span>
                      <button
                        title={proc.requiresInbound ? "Requires inbound (click to disable)" : "Click to require inbound parts"}
                        onClick={() => toggleRequiresInbound.mutate({ templateId: template.id, procId: proc.id, requiresInbound: !proc.requiresInbound })}
                        className={`p-1 rounded transition-colors ${proc.requiresInbound ? "text-orange-500 hover:text-orange-600" : "text-muted-foreground/40 hover:text-orange-400"}`}
                      >
                        <PackageCheck className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => deleteProcedure.mutate({ templateId: template.id, procId: proc.id })}
                        className="p-1 text-muted-foreground hover:text-destructive transition-colors"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))
                )}
              </div>

              <div className="flex gap-2 pt-1 border-t border-border">
                <Input
                  value={newProcName[template.id] ?? ""}
                  onChange={(e) => setNewProcName((p) => ({ ...p, [template.id]: e.target.value }))}
                  placeholder="Add procedure..."
                  className="h-9 text-sm border-2"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && newProcName[template.id]?.trim()) {
                      addProcedure.mutate({ templateId: template.id, name: newProcName[template.id].trim() });
                    }
                  }}
                />
                <Button
                  size="sm"
                  variant="outline"
                  className="h-9 px-3"
                  disabled={!newProcName[template.id]?.trim()}
                  onClick={() => addProcedure.mutate({ templateId: template.id, name: newProcName[template.id].trim() })}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
