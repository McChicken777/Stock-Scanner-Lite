import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2, Loader2, Package } from "lucide-react";
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
  productId: number;
}

async function fetchTemplates(): Promise<Template[]> {
  const res = await fetch("/api/work/templates", { credentials: "include" });
  if (!res.ok) throw new Error("Failed");
  return res.json();
}

export default function WorkTemplatesPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [newTemplateName, setNewTemplateName] = useState("");
  const [createOpen, setCreateOpen] = useState(false);

  const { data: templates = [], isLoading } = useQuery({
    queryKey: ["/api/work/templates"],
    queryFn: fetchTemplates,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["/api/work/templates"] });

  const createTemplate = useMutation({
    mutationFn: async (name: string) => {
      const res = await fetch("/api/work/templates", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onSuccess: () => {
      invalidate();
      setCreateOpen(false);
      setNewTemplateName("");
      toast({ title: "Item template created (final product auto-created)" });
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

  if (user?.role !== "admin") {
    return <div className="p-6 text-center text-muted-foreground mt-20"><p>Admin only</p></div>;
  }

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
                  placeholder="e.g. Standard Assembly, Widget A"
                  className="h-12 border-2"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                A final product item will be created automatically. You can then add components and procedures to it in the Products section.
              </p>
              <Button
                className="w-full h-12 font-bold"
                disabled={!newTemplateName.trim() || createTemplate.isPending}
                onClick={() => createTemplate.mutate(newTemplateName.trim())}
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
          {[1, 2].map((i) => <div key={i} className="h-20 bg-muted/40 rounded-xl animate-pulse" />)}
        </div>
      ) : templates.length === 0 ? (
        <div className="text-center py-16 px-4 bg-muted/30 rounded-xl border border-dashed">
          <Package className="h-10 w-10 mx-auto mb-3 text-muted-foreground" />
          <p className="font-semibold">No templates yet</p>
          <p className="text-sm text-muted-foreground mt-1">Create templates to use when creating work orders.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {templates.map((template) => (
            <div key={template.id} className="bg-card border-2 border-border rounded-xl p-4 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-lg">{template.name}</h3>
                <p className="text-xs text-muted-foreground mt-1">Product ID: {template.productId}</p>
              </div>
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
          ))}
        </div>
      )}
    </div>
  );
}
