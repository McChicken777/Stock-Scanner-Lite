import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2, ArrowLeft, Settings, Package, Boxes } from "lucide-react";
import { Link } from "wouter";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface Role {
  id: number;
  name: string;
}

interface Procedure {
  id: number;
  name: string;
  roleId: number;
  roleName: string;
  orderIndex: number;
  requiresInbound: boolean;
  requiresComponents: boolean;
}

async function fetchRoles(): Promise<Role[]> {
  const res = await fetch("/api/tasks/roles", { credentials: "include" });
  if (!res.ok) throw new Error("Failed");
  return res.json();
}

async function fetchProcedures(): Promise<Procedure[]> {
  const res = await fetch("/api/tasks/procedures", { credentials: "include" });
  if (!res.ok) throw new Error("Failed");
  return res.json();
}

export default function AdminProceduresPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [newName, setNewName] = useState("");
  const [newRoleId, setNewRoleId] = useState<string>("");
  const [newRequiresComponents, setNewRequiresComponents] = useState(false);

  const { data: roles = [] } = useQuery({
    queryKey: ["/api/tasks/roles"],
    queryFn: fetchRoles,
  });

  const { data: procedures = [], isLoading } = useQuery({
    queryKey: ["/api/tasks/procedures"],
    queryFn: fetchProcedures,
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/tasks/procedures", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newName,
          roleId: Number(newRoleId),
          requiresComponents: newRequiresComponents,
        }),
      });
      if (!res.ok) throw new Error("Failed");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks/procedures"] });
      setNewName("");
      setNewRoleId("");
      setNewRequiresComponents(false);
      toast({ title: "Procedure created" });
    },
    onError: () => toast({ title: "Failed", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await fetch(`/api/tasks/procedures/${id}`, { method: "DELETE", credentials: "include" });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/tasks/procedures"] }),
    onError: () => toast({ title: "Failed to delete", variant: "destructive" }),
  });

  const toggleComponentsMutation = useMutation({
    mutationFn: async ({ id, requiresComponents }: { id: number; requiresComponents: boolean }) => {
      const res = await fetch(`/api/tasks/procedures/${id}`, {
        method: "PUT", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requiresComponents }),
      });
      if (!res.ok) throw new Error("Failed");
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/tasks/procedures"] }),
    onError: () => toast({ title: "Failed to update", variant: "destructive" }),
  });

  if (user?.role !== "admin") {
    return <div className="p-6 text-center text-muted-foreground">Admin only</div>;
  }

  return (
    <div className="p-4 space-y-4">
      <Link href="/admin/company" className="flex items-center gap-2 text-primary hover:opacity-70">
        <ArrowLeft className="h-4 w-4" /> Back to Admin
      </Link>

      <div>
        <h1 className="text-2xl font-bold">Production Procedures</h1>
        <p className="text-xs text-muted-foreground">Define procedures and assign roles. Toggle flags to configure blocking logic.</p>
      </div>

      {isLoading ? (
        <div className="text-muted-foreground">Loading...</div>
      ) : (
        <div className="space-y-2">
          {procedures.map((proc) => (
            <div key={proc.id} className="flex items-center justify-between bg-card p-3 rounded-lg border">
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate">{proc.name}</p>
                <p className="text-xs text-muted-foreground">Role: {proc.roleName}</p>
                <div className="flex gap-2 mt-1">
                  {proc.requiresInbound && (
                    <span className="text-[10px] bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded font-bold uppercase">Inbound</span>
                  )}
                  {proc.requiresComponents && (
                    <span className="text-[10px] bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded font-bold uppercase">Components</span>
                  )}
                </div>
              </div>
              <div className="flex gap-1 flex-shrink-0 ml-2">
                {/* Toggle requires_components */}
                <button
                  title={proc.requiresComponents ? "Components check ON (click to disable)" : "Click to require component stock check"}
                  onClick={() => toggleComponentsMutation.mutate({ id: proc.id, requiresComponents: !proc.requiresComponents })}
                  className={`p-2 rounded-lg border transition-colors ${
                    proc.requiresComponents
                      ? "bg-purple-100 border-purple-300 text-purple-700"
                      : "bg-muted border-border text-muted-foreground/40 hover:text-purple-400"
                  }`}
                >
                  <Boxes className="h-4 w-4" />
                </button>
                <Link href={`/admin/procedure-inputs/${proc.id}`}>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-blue-600"
                    title="Manage component inputs"
                  >
                    <Settings className="h-4 w-4" />
                  </Button>
                </Link>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    if (confirm(`Delete "${proc.name}"?`)) {
                      deleteMutation.mutate(proc.id);
                    }
                  }}
                  className="text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="space-y-2 pt-4 border-t">
        <Input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="Procedure name"
          className="h-12"
        />
        <Select value={newRoleId} onValueChange={setNewRoleId}>
          <SelectTrigger className="h-12">
            <SelectValue placeholder="Select role" />
          </SelectTrigger>
          <SelectContent>
            {roles.map((r) => (
              <SelectItem key={r.id} value={String(r.id)}>
                {r.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Requires components toggle */}
        <button
          type="button"
          onClick={() => setNewRequiresComponents((v) => !v)}
          className={`w-full h-11 flex items-center gap-2 px-3 rounded-lg border-2 text-sm font-medium transition-all ${
            newRequiresComponents
              ? "border-purple-500 bg-purple-50 text-purple-700"
              : "border-border bg-muted/30 text-muted-foreground"
          }`}
        >
          <Boxes className="h-4 w-4" />
          {newRequiresComponents ? "Requires component stock check" : "No component check (click to enable)"}
        </button>

        <Button
          onClick={() => createMutation.mutate()}
          disabled={!newName.trim() || !newRoleId || createMutation.isPending}
          className="w-full h-12 font-bold gap-1"
        >
          <Plus className="h-4 w-4" /> Add Procedure
        </Button>
      </div>

      <div className="text-xs text-muted-foreground bg-muted/30 rounded-lg p-3 space-y-1">
        <p className="font-bold">Flag meanings:</p>
        <p><span className="text-orange-600 font-bold">Inbound</span> — task is BLOCKED until the linked inbound pallet has arrived</p>
        <p><span className="text-purple-600 font-bold">Components</span> — task is BLOCKED until all required component stock is available</p>
      </div>
    </div>
  );
}
