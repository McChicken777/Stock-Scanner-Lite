import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2, ArrowLeft } from "lucide-react";
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

  if (user?.role !== "admin") {
    return <div className="p-6 text-center text-muted-foreground">Admin only</div>;
  }

  return (
    <div className="p-4 space-y-4">
      <Link href="/admin/company" className="flex items-center gap-2 text-primary hover:opacity-70">
        <ArrowLeft className="h-4 w-4" /> Back to Admin
      </Link>

      <div>
        <h1 className="text-2xl font-bold">Production Roles</h1>
        <p className="text-xs text-muted-foreground">Create roles like Welding, CNC, Sandblasting</p>
      </div>

      {isLoading ? (
        <div className="text-muted-foreground">Loading...</div>
      ) : (
        <div className="space-y-2">
          {roles.map((role) => (
            <div key={role.id} className="flex items-center justify-between bg-card p-3 rounded-lg border">
              <span className="font-medium">{role.name}</span>
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-2 pt-4">
        <Input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="e.g. Welding, CNC..."
          className="h-12"
          onKeyDown={(e) => {
            if (e.key === "Enter" && newName.trim()) {
              createMutation.mutate();
            }
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
