import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2, ArrowLeft, Pencil, Check, X } from "lucide-react";
import { Link } from "wouter";

interface Role {
  id: number;
  name: string;
  companyId: number;
}

async function fetchRoles(): Promise<Role[]> {
  const res = await fetch("/api/tasks/roles", { credentials: "include" });
  if (!res.ok) throw new Error("Failed");
  return res.json();
}

export default function AdminRolesPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");

  const { data: roles = [], isLoading } = useQuery({
    queryKey: ["/api/tasks/roles"],
    queryFn: fetchRoles,
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/tasks/roles", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName }),
      });
      if (!res.ok) throw new Error("Failed");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks/roles"] });
      setNewName("");
      toast({ title: "Role created" });
    },
    onError: () => toast({ title: "Failed to create role", variant: "destructive" }),
  });

  const renameMutation = useMutation({
    mutationFn: async ({ id, name }: { id: number; name: string }) => {
      const res = await fetch(`/api/tasks/roles/${id}`, {
        method: "PUT", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) throw new Error("Failed");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks/roles"] });
      setEditingId(null);
      toast({ title: "Role renamed" });
    },
    onError: () => toast({ title: "Failed to rename role", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/tasks/roles/${id}`, {
        method: "DELETE", credentials: "include",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Failed");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks/roles"] });
      toast({ title: "Role deleted" });
    },
    onError: (err: Error) => toast({ title: err.message, variant: "destructive" }),
  });

  function startEdit(role: Role) {
    setEditingId(role.id);
    setEditName(role.name);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditName("");
  }

  if (user?.role !== "admin") {
    return <div className="p-6 text-center text-muted-foreground">Admin only</div>;
  }

  return (
    <div className="p-4 space-y-4 pb-24">
      <Link href="/admin/company" className="flex items-center gap-2 text-primary hover:opacity-70">
        <ArrowLeft className="h-4 w-4" /> Back to Admin
      </Link>

      <div>
        <h1 className="text-2xl font-bold">Production Roles</h1>
        <p className="text-xs text-muted-foreground">Roles like Welding, CNC, Sandblasting — assign them to workers and template steps</p>
      </div>

      {isLoading ? (
        <div className="text-muted-foreground">Loading...</div>
      ) : roles.length === 0 ? (
        <div className="text-center py-10 text-muted-foreground text-sm">No roles yet — add one below</div>
      ) : (
        <div className="space-y-2">
          {roles.map((role) =>
            editingId === role.id ? (
              <div key={role.id} className="flex items-center gap-2 bg-card p-3 rounded-lg border border-primary/40">
                <Input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="h-9 flex-1"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && editName.trim()) renameMutation.mutate({ id: role.id, name: editName.trim() });
                    if (e.key === "Escape") cancelEdit();
                  }}
                />
                <Button size="icon" variant="ghost" className="h-9 w-9 text-green-600 hover:text-green-700"
                  onClick={() => editName.trim() && renameMutation.mutate({ id: role.id, name: editName.trim() })}
                  disabled={!editName.trim() || renameMutation.isPending}>
                  <Check className="h-4 w-4" />
                </Button>
                <Button size="icon" variant="ghost" className="h-9 w-9 text-muted-foreground"
                  onClick={cancelEdit}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <div key={role.id} className="flex items-center justify-between bg-card p-3 rounded-lg border">
                <span className="font-medium">{role.name}</span>
                <div className="flex items-center gap-1">
                  <Button size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground hover:text-foreground"
                    onClick={() => startEdit(role)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground hover:text-destructive"
                    onClick={() => deleteMutation.mutate(role.id)}
                    disabled={deleteMutation.isPending}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            )
          )}
        </div>
      )}

      <div className="flex gap-2 pt-4">
        <Input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="e.g. Welding, CNC..."
          className="h-12"
          onKeyDown={(e) => {
            if (e.key === "Enter" && newName.trim()) createMutation.mutate();
          }}
        />
        <Button
          size="sm"
          onClick={() => createMutation.mutate()}
          disabled={!newName.trim() || createMutation.isPending}
          className="font-bold gap-1"
        >
          <Plus className="h-4 w-4" /> Add
        </Button>
      </div>
    </div>
  );
}
