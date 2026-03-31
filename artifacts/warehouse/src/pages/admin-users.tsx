import { useState } from "react";
import { useAuth } from "@/contexts/auth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { UserPlus, Trash2, ShieldCheck, HardHat, Loader2 } from "lucide-react";

interface UserEntry {
  id: number;
  username: string;
  role: "admin" | "worker";
  createdAt: string;
}

async function fetchUsers(): Promise<UserEntry[]> {
  const res = await fetch("/api/auth/users", { credentials: "include" });
  if (!res.ok) throw new Error("Failed to load users");
  return res.json();
}

async function createUser(data: { username: string; password: string; role: "admin" | "worker" }) {
  const res = await fetch("/api/auth/users", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const d = await res.json().catch(() => ({}));
    throw new Error(d.error || "Failed to create user");
  }
  return res.json();
}

async function deleteUser(userId: number) {
  const res = await fetch(`/api/auth/users/${userId}`, {
    method: "DELETE",
    credentials: "include",
  });
  if (!res.ok) {
    const d = await res.json().catch(() => ({}));
    throw new Error(d.error || "Failed to delete user");
  }
}

export default function AdminUsersPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newRole, setNewRole] = useState<"admin" | "worker">("worker");

  const { data: users = [], isLoading } = useQuery({
    queryKey: ["/api/auth/users"],
    queryFn: fetchUsers,
  });

  const createMutation = useMutation({
    mutationFn: createUser,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/users"] });
      setOpen(false);
      setNewUsername("");
      setNewPassword("");
      setNewRole("worker");
      toast({ title: "User created successfully" });
    },
    onError: (err) => {
      toast({ title: err instanceof Error ? err.message : "Failed to create user", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteUser,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/users"] });
      toast({ title: "User deleted" });
    },
    onError: (err) => {
      toast({ title: err instanceof Error ? err.message : "Failed to delete user", variant: "destructive" });
    },
  });

  if (user?.role !== "admin") {
    return (
      <div className="p-6 text-center text-muted-foreground">
        Access restricted to admins.
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between pt-2">
        <div>
          <h1 className="text-2xl font-black">Users</h1>
          <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">
            Manage access
          </p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="font-bold gap-2">
              <UserPlus className="h-4 w-4" /> Add User
            </Button>
          </DialogTrigger>
          <DialogContent className="w-[90vw] max-w-sm rounded-xl">
            <DialogHeader>
              <DialogTitle>New User</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Username</Label>
                <Input
                  value={newUsername}
                  onChange={(e) => setNewUsername(e.target.value)}
                  placeholder="e.g. john"
                  className="h-12 border-2"
                  autoCapitalize="none"
                />
              </div>
              <div className="space-y-2">
                <Label>Password</Label>
                <Input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="At least 4 characters"
                  className="h-12 border-2"
                />
              </div>
              <div className="space-y-2">
                <Label>Role</Label>
                <Select value={newRole} onValueChange={(v) => setNewRole(v as "admin" | "worker")}>
                  <SelectTrigger className="h-12 border-2">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="worker">Worker</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button
                className="w-full h-12 font-bold"
                disabled={!newUsername || !newPassword || createMutation.isPending}
                onClick={() => createMutation.mutate({ username: newUsername, password: newPassword, role: newRole })}
              >
                {createMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Create User
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2].map((i) => (
            <div key={i} className="h-20 bg-muted/40 rounded-lg animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          {users.map((u) => (
            <div
              key={u.id}
              className="bg-card border-2 border-border rounded-lg p-4 flex items-center justify-between"
            >
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center">
                  {u.role === "admin" ? (
                    <ShieldCheck className="h-5 w-5 text-primary" />
                  ) : (
                    <HardHat className="h-5 w-5 text-muted-foreground" />
                  )}
                </div>
                <div>
                  <p className="font-bold">
                    {u.username}
                    {u.id === user?.id && (
                      <span className="ml-2 text-xs text-muted-foreground font-normal">(you)</span>
                    )}
                  </p>
                  <Badge
                    variant={u.role === "admin" ? "default" : "secondary"}
                    className="text-[10px] font-bold uppercase tracking-wider mt-0.5"
                  >
                    {u.role}
                  </Badge>
                </div>
              </div>
              {u.id !== user?.id && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-destructive hover:text-destructive hover:bg-destructive/10"
                  onClick={() => {
                    if (confirm(`Delete user "${u.username}"?`)) {
                      deleteMutation.mutate(u.id);
                    }
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
