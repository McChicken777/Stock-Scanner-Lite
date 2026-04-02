import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2, ArrowLeft, ChevronUp, ChevronDown, Settings } from "lucide-react";
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
        body: JSON.stringify({ name: newName, roleId: Number(newRoleId) }),
      });
      if (!res.ok) throw new Error("Failed");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks/procedures"] });
      setNewName("");
      setNewRoleId("");
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
        <p className="text-xs text-muted-foreground">Define procedures and assign roles</p>
      </div>

      {isLoading ? (
        <div className="text-muted-foreground">Loading...</div>
      ) : (
        <div className="space-y-2">
          {procedures.map((proc) => (
            <div key={proc.id} className="flex items-center justify-between bg-card p-3 rounded-lg border">
              <div className="flex-1">
                <p className="font-medium">{proc.name}</p>
                <p className="text-xs text-muted-foreground">Role: {proc.roleName}</p>
              </div>
              <div className="flex gap-1">
                <Link href={`/admin/procedure-inputs/${proc.id}`}>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-blue-600"
                    title="Manage inputs"
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
        <Button
          onClick={() => createMutation.mutate()}
          disabled={!newName.trim() || !newRoleId || createMutation.isPending}
          className="w-full h-12 font-bold gap-1"
        >
          <Plus className="h-4 w-4" /> Add Procedure
        </Button>
      </div>
    </div>
  );
}
