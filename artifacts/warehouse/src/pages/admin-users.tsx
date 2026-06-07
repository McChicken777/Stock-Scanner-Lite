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
import { UserPlus, Trash2, ShieldCheck, HardHat, Loader2, Plus, X, Eye, Pencil, Check, Clock } from "lucide-react";

interface UserEntry {
  id: number;
  username: string;
  role: "admin" | "worker";
  isSupervisor: boolean;
  shiftId: number | null;
  createdAt: string;
}

interface CompanyShift {
  id: number;
  name: string;
  startTime: string;
  endTime: string;
}

interface Role {
  id: number;
  name: string;
}

interface UserRoleAssignment {
  roleId: number;
  priority: "primary" | "secondary" | "substitution";
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

async function toggleSupervisor(userId: number, isSupervisor: boolean) {
  const res = await fetch(`/api/auth/users/${userId}/supervisor`, {
    method: "PATCH",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ isSupervisor }),
  });
  if (!res.ok) {
    const d = await res.json().catch(() => ({}));
    throw new Error(d.error || "Failed to update supervisor flag");
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

async function fetchUserRoles(userId: number) {
  const res = await fetch(`/api/tasks/roles/for-user/${userId}`, { credentials: "include" });
  if (!res.ok) throw new Error("Failed to load roles");
  return res.json();
}

async function assignUserRole(userId: number, roleId: number, priority: "primary" | "secondary" | "substitution") {
  const res = await fetch("/api/tasks/roles/assign", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId, roleId, priority }),
  });
  if (!res.ok) throw new Error("Failed to assign role");
  return res.json();
}

async function assignUserShift(userId: number, shiftId: number | null) {
  const res = await fetch(`/api/auth/users/${userId}/shift`, {
    method: "PATCH",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ shiftId }),
  });
  if (!res.ok) throw new Error("Failed to update shift");
  return res.json();
}

async function unassignUserRole(userId: number, roleId: number) {
  const res = await fetch("/api/tasks/roles/unassign", {
    method: "DELETE",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId, roleId }),
  });
  if (!res.ok) throw new Error("Failed to unassign role");
}

export default function AdminUsersPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [rolesOpen, setRolesOpen] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newRole, setNewRole] = useState<"admin" | "worker">("worker");
  const [newRoleId, setNewRoleId] = useState<string>("");
  const [newRolePriority, setNewRolePriority] = useState<"primary" | "secondary" | "substitution">("primary");

  const { data: users = [], isLoading } = useQuery({
    queryKey: ["/api/auth/users"],
    queryFn: fetchUsers,
  });

  const { data: companyShifts = [] } = useQuery<CompanyShift[]>({
    queryKey: ["/api/settings/shifts"],
    queryFn: async () => {
      const r = await fetch("/api/settings/shifts", { credentials: "include" });
      if (!r.ok) throw new Error("Failed");
      return r.json();
    },
  });

  const shiftMutation = useMutation({
    mutationFn: ({ userId, shiftId }: { userId: number; shiftId: number | null }) =>
      assignUserShift(userId, shiftId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/users"] });
      toast({ title: "Shift updated" });
    },
    onError: () => toast({ title: "Failed to update shift", variant: "destructive" }),
  });

  const { data: userRoles = null, isLoading: rolesLoading } = useQuery({
    queryKey: ["/api/tasks/roles", "for-user", selectedUserId],
    queryFn: () => selectedUserId ? fetchUserRoles(selectedUserId) : null,
    enabled: !!selectedUserId,
  });

  const createMutation = useMutation({
    mutationFn: createUser,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/users"] });
      setCreateOpen(false);
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

  const assignMutation = useMutation({
    mutationFn: ({ userId, roleId, priority }: { userId: number; roleId: number; priority: "primary" | "secondary" | "substitution" }) =>
      assignUserRole(userId, roleId, priority),
    onSuccess: () => {
      if (selectedUserId) {
        queryClient.invalidateQueries({ queryKey: ["/api/tasks/roles", "for-user", selectedUserId] });
      }
      setNewRoleId("");
      toast({ title: "Role assigned" });
    },
    onError: (err) => {
      toast({ title: err instanceof Error ? err.message : "Failed", variant: "destructive" });
    },
  });

  const unassignMutation = useMutation({
    mutationFn: ({ userId, roleId }: { userId: number; roleId: number }) => unassignUserRole(userId, roleId),
    onSuccess: () => {
      if (selectedUserId) {
        queryClient.invalidateQueries({ queryKey: ["/api/tasks/roles", "for-user", selectedUserId] });
      }
      toast({ title: "Role removed" });
    },
    onError: (err) => {
      toast({ title: err instanceof Error ? err.message : "Failed", variant: "destructive" });
    },
  });

  const [newRoleName, setNewRoleName] = useState("");
  const [editingRoleId, setEditingRoleId] = useState<number | null>(null);
  const [editRoleName, setEditRoleName] = useState("");

  const { data: allRoles = [] } = useQuery<Role[]>({
    queryKey: ["/api/tasks/roles"],
    queryFn: async () => {
      const r = await fetch("/api/tasks/roles", { credentials: "include" });
      if (!r.ok) throw new Error("Failed");
      return r.json();
    },
  });

  const createRoleMutation = useMutation({
    mutationFn: async (name: string) => {
      const r = await fetch("/api/tasks/roles", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!r.ok) throw new Error("Failed");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks/roles"] });
      setNewRoleName("");
      toast({ title: "Role created" });
    },
    onError: () => toast({ title: "Failed to create role", variant: "destructive" }),
  });

  const renameRoleMutation = useMutation({
    mutationFn: async ({ id, name }: { id: number; name: string }) => {
      const r = await fetch(`/api/tasks/roles/${id}`, {
        method: "PUT", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!r.ok) throw new Error("Failed");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks/roles"] });
      setEditingRoleId(null);
      toast({ title: "Role renamed" });
    },
    onError: () => toast({ title: "Failed to rename role", variant: "destructive" }),
  });

  const deleteRoleMutation = useMutation({
    mutationFn: async (id: number) => {
      const r = await fetch(`/api/tasks/roles/${id}`, { method: "DELETE", credentials: "include" });
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        throw new Error(body.error ?? "Failed");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks/roles"] });
      toast({ title: "Role deleted" });
    },
    onError: (err: Error) => toast({ title: err.message, variant: "destructive" }),
  });

  const supervisorMutation = useMutation({
    mutationFn: ({ userId, isSupervisor }: { userId: number; isSupervisor: boolean }) =>
      toggleSupervisor(userId, isSupervisor),
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/users"] });
      toast({ title: vars.isSupervisor ? "Supervisor access granted" : "Supervisor access removed" });
    },
    onError: (err) => {
      toast({ title: err instanceof Error ? err.message : "Failed", variant: "destructive" });
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
    <div className="p-4 space-y-4 pb-24">
      <div className="flex items-center justify-between pt-2">
        <div>
          <h1 className="text-2xl font-black">Users</h1>
          <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">
            Manage access & roles
          </p>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
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
              <div className="flex gap-2 items-center">
                {u.role === "worker" && (
                  <button
                    title={u.isSupervisor ? "Remove supervisor access" : "Grant supervisor access"}
                    onClick={() => supervisorMutation.mutate({ userId: u.id, isSupervisor: !u.isSupervisor })}
                    disabled={supervisorMutation.isPending}
                    className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-bold border transition-colors ${
                      u.isSupervisor
                        ? "bg-indigo-100 text-indigo-700 border-indigo-300 hover:bg-indigo-200"
                        : "bg-muted text-muted-foreground border-border hover:bg-muted/80"
                    }`}
                  >
                    <Eye className="h-3.5 w-3.5" />
                    {u.isSupervisor ? "Supervisor" : "Supervisor"}
                  </button>
                )}
                {u.role === "worker" && companyShifts.length > 0 && (
                  <div className="flex items-center gap-1">
                    <Clock className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                    <select
                      value={u.shiftId ?? ""}
                      onChange={(e) => shiftMutation.mutate({ userId: u.id, shiftId: e.target.value ? Number(e.target.value) : null })}
                      disabled={shiftMutation.isPending}
                      title="Assign shift"
                      className="h-7 px-1.5 rounded-md border border-input bg-background text-[11px] font-medium focus:outline-none focus:ring-1 focus:ring-primary/40 max-w-[90px]"
                    >
                      <option value="">No shift</option>
                      {companyShifts.map((s) => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
                  </div>
                )}
                {u.role === "worker" && (
                  <Dialog open={rolesOpen && selectedUserId === u.id} onOpenChange={(open) => {
                    if (!open) setSelectedUserId(null);
                    setRolesOpen(open);
                  }}>
                    <DialogTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-blue-600"
                        onClick={() => setSelectedUserId(u.id)}
                      >
                        Roles
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="w-[90vw] max-w-sm rounded-xl max-h-[80vh] overflow-y-auto">
                      <DialogHeader>
                        <DialogTitle>Assign Roles: {u.username}</DialogTitle>
                      </DialogHeader>
                      {rolesLoading ? (
                        <div className="text-center text-muted-foreground">Loading...</div>
                      ) : (
                        <div className="space-y-4">
                          {userRoles?.assigned?.length > 0 && (
                            <div>
                              <p className="text-sm font-bold mb-2">Current Roles:</p>
                              <div className="space-y-2">
                                {userRoles.assigned.map((ar: UserRoleAssignment) => {
                                  const role = userRoles.available.find((r: Role) => r.id === ar.roleId);
                                  return (
                                    <div
                                      key={ar.roleId}
                                      className="flex items-center justify-between bg-muted/50 p-2 rounded border"
                                    >
                                      <div>
                                        <p className="text-sm font-medium">{role?.name}</p>
                                        <p className="text-xs text-muted-foreground capitalize">{ar.priority}</p>
                                      </div>
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        onClick={() => unassignMutation.mutate({ userId: u.id, roleId: ar.roleId })}
                                        disabled={unassignMutation.isPending}
                                        className="text-destructive"
                                      >
                                        <X className="h-4 w-4" />
                                      </Button>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}

                          <div className="pt-4 border-t space-y-2">
                            <p className="text-sm font-bold">Add Role:</p>
                            <Select value={newRoleId} onValueChange={setNewRoleId}>
                              <SelectTrigger className="h-10">
                                <SelectValue placeholder="Select role" />
                              </SelectTrigger>
                              <SelectContent>
                                {userRoles?.available?.map((r: Role) => (
                                  <SelectItem key={r.id} value={String(r.id)}>
                                    {r.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <Select
                              value={newRolePriority}
                              onValueChange={(v) => setNewRolePriority(v as "primary" | "secondary" | "substitution")}
                            >
                              <SelectTrigger className="h-10">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="primary">Primary</SelectItem>
                                <SelectItem value="secondary">Secondary</SelectItem>
                                <SelectItem value="substitution">Substitution</SelectItem>
                              </SelectContent>
                            </Select>
                            <Button
                              size="sm"
                              className="w-full gap-1"
                              disabled={!newRoleId || assignMutation.isPending}
                              onClick={() => {
                                assignMutation.mutate({
                                  userId: u.id,
                                  roleId: Number(newRoleId),
                                  priority: newRolePriority,
                                });
                              }}
                            >
                              <Plus className="h-4 w-4" /> Add Role
                            </Button>
                          </div>
                        </div>
                      )}
                    </DialogContent>
                  </Dialog>
                )}
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
            </div>
          ))}
        </div>
      )}

      {/* Production Roles */}
      <div className="pt-4 border-t space-y-3">
        <div>
          <p className="text-base font-bold flex items-center gap-2"><HardHat className="h-4 w-4 text-purple-600" /> Production Roles</p>
          <p className="text-xs text-muted-foreground">Roles like Welder, CNC Operator — assign above to workers, attach to steps in Production Flow</p>
        </div>

        <div className="space-y-2">
          {allRoles.map((role) =>
            editingRoleId === role.id ? (
              <div key={role.id} className="flex items-center gap-2 bg-card p-2.5 rounded-lg border border-primary/40">
                <Input
                  value={editRoleName}
                  onChange={(e) => setEditRoleName(e.target.value)}
                  className="h-8 flex-1 text-sm"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && editRoleName.trim()) renameRoleMutation.mutate({ id: role.id, name: editRoleName.trim() });
                    if (e.key === "Escape") setEditingRoleId(null);
                  }}
                />
                <Button size="icon" variant="ghost" className="h-8 w-8 text-green-600"
                  onClick={() => editRoleName.trim() && renameRoleMutation.mutate({ id: role.id, name: editRoleName.trim() })}
                  disabled={!editRoleName.trim() || renameRoleMutation.isPending}>
                  <Check className="h-4 w-4" />
                </Button>
                <Button size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground"
                  onClick={() => setEditingRoleId(null)}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <div key={role.id} className="flex items-center justify-between bg-card p-2.5 rounded-lg border">
                <span className="text-sm font-medium">{role.name}</span>
                <div className="flex items-center gap-1">
                  <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground hover:text-foreground"
                    onClick={() => { setEditingRoleId(role.id); setEditRoleName(role.name); }}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground hover:text-destructive"
                    onClick={() => deleteRoleMutation.mutate(role.id)}
                    disabled={deleteRoleMutation.isPending}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            )
          )}
          {allRoles.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-3">No roles yet</p>
          )}
        </div>

        <div className="flex gap-2">
          <Input
            value={newRoleName}
            onChange={(e) => setNewRoleName(e.target.value)}
            placeholder="e.g. Welder, CNC Operator..."
            className="h-10"
            onKeyDown={(e) => { if (e.key === "Enter" && newRoleName.trim()) createRoleMutation.mutate(newRoleName.trim()); }}
          />
          <Button size="sm" onClick={() => createRoleMutation.mutate(newRoleName.trim())}
            disabled={!newRoleName.trim() || createRoleMutation.isPending} className="gap-1 font-bold">
            <Plus className="h-4 w-4" /> Add
          </Button>
        </div>
      </div>
    </div>
  );
}
