import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  Building2, Plus, ChevronDown, ChevronUp, Users, Loader2,
  Pencil, Check, X, KeyRound, Trash2, UserPlus, Crown, FileDown,
} from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

interface CompanyUser {
  id: number;
  username: string;
  role: string;
  createdAt: string;
}

interface Company {
  id: number;
  name: string;
  plan: "lite" | "standard" | "pro";
  createdAt: string;
  userCount: number;
}

// ── API helpers ─────────────────────────────────────────────────────────────

async function fetchCompanies(): Promise<Company[]> {
  const res = await fetch("/api/owner/companies", { credentials: "include" });
  if (!res.ok) throw new Error("Failed to load companies");
  return res.json();
}

async function fetchCompanyUsers(companyId: number): Promise<CompanyUser[]> {
  const res = await fetch(`/api/owner/companies/${companyId}/users`, { credentials: "include" });
  if (!res.ok) throw new Error("Failed to load users");
  return res.json();
}

// ── Create Company Modal ─────────────────────────────────────────────────────

function CreateCompanyModal({ onClose }: { onClose: () => void }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    companyName: "", plan: "standard" as "lite" | "standard" | "pro",
    adminUsername: "", adminPassword: "",
  });

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((p) => ({ ...p, [k]: e.target.value }));

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/owner/companies", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Failed");
      return d;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/owner/companies"] });
      toast({ title: "Company created!" });
      onClose();
    },
    onError: (err) => toast({ title: err instanceof Error ? err.message : "Error", variant: "destructive" }),
  });

  const canSubmit = form.companyName.trim() && form.adminUsername.trim() && form.adminPassword.length >= 6;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-card rounded-t-3xl w-full max-w-md p-5 space-y-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold flex items-center gap-2">
            <Building2 className="h-5 w-5 text-primary" /> New Company
          </h2>
          <button onClick={onClose}><X className="h-5 w-5" /></button>
        </div>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Company Name</Label>
            <Input value={form.companyName} onChange={set("companyName")} placeholder="e.g. Acme Manufacturing" className="h-11 border-2" />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Plan</Label>
            <div className="grid grid-cols-3 gap-2">
              {([
                { value: "lite", label: "Lite", desc: "Inventory & quotes" },
                { value: "standard", label: "Standard", desc: "Jobs & attendance" },
                { value: "pro", label: "Pro", desc: "Full production" },
              ] as const).map((p) => (
                <button key={p.value} onClick={() => setForm((prev) => ({ ...prev, plan: p.value }))}
                  className={cn("h-14 rounded-lg border-2 font-bold text-sm transition-all flex flex-col items-center justify-center gap-0.5",
                    form.plan === p.value ? "border-primary bg-primary/5 text-primary" : "border-border text-muted-foreground"
                  )}>
                  <span className="uppercase">{p.label}</span>
                  <span className="text-[10px] font-normal opacity-70">{p.desc}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="border-t border-border pt-4 space-y-3">
            <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">First Admin Account</p>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Username</Label>
              <Input value={form.adminUsername} onChange={set("adminUsername")} placeholder="admin" className="h-11 border-2" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Password (min 6 chars)</Label>
              <Input type="password" value={form.adminPassword} onChange={set("adminPassword")} placeholder="••••••••" className="h-11 border-2" />
            </div>
          </div>
        </div>

        <Button className="w-full h-12 font-bold gap-2" disabled={!canSubmit || createMutation.isPending} onClick={() => createMutation.mutate()}>
          {createMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          Create Company
        </Button>
      </div>
    </div>
  );
}

// ── Company Row ──────────────────────────────────────────────────────────────

function CompanyRow({ company }: { company: Company }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(company.name);
  const [showAddUser, setShowAddUser] = useState(false);
  const [newUser, setNewUser] = useState({ username: "", password: "", role: "admin" as "admin" | "worker" });
  const [resetingUserId, setResetingUserId] = useState<number | null>(null);
  const [newPassword, setNewPassword] = useState("");

  const { data: users = [], isLoading: usersLoading } = useQuery({
    queryKey: [`/api/owner/companies/${company.id}/users`],
    queryFn: () => fetchCompanyUsers(company.id),
    enabled: expanded,
  });

  const updateMutation = useMutation({
    mutationFn: async (updates: { name?: string; plan?: "lite" | "standard" | "pro" }) => {
      const res = await fetch(`/api/owner/companies/${company.id}`, {
        method: "PUT", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Failed");
      return d;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/owner/companies"] });
      setEditingName(false);
      toast({ title: "Updated!" });
    },
    onError: (err) => toast({ title: err instanceof Error ? err.message : "Error", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      await fetch(`/api/owner/companies/${company.id}`, { method: "DELETE", credentials: "include" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/owner/companies"] });
      toast({ title: "Company deleted" });
    },
    onError: () => toast({ title: "Failed to delete", variant: "destructive" }),
  });

  const addUserMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/owner/companies/${company.id}/users`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newUser),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Failed");
      return d;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/owner/companies/${company.id}/users`] });
      queryClient.invalidateQueries({ queryKey: ["/api/owner/companies"] });
      setNewUser({ username: "", password: "", role: "admin" });
      setShowAddUser(false);
      toast({ title: "User added!" });
    },
    onError: (err) => toast({ title: err instanceof Error ? err.message : "Error", variant: "destructive" }),
  });

  const resetPasswordMutation = useMutation({
    mutationFn: async (userId: number) => {
      const res = await fetch(`/api/owner/users/${userId}/password`, {
        method: "PUT", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: newPassword }),
      });
      if (!res.ok) throw new Error("Failed to reset");
      return res.json();
    },
    onSuccess: () => {
      setResetingUserId(null);
      setNewPassword("");
      toast({ title: "Password reset!" });
    },
    onError: (err) => toast({ title: err instanceof Error ? err.message : "Error", variant: "destructive" }),
  });

  return (
    <div className="bg-card border-2 border-border rounded-xl overflow-hidden">
      {/* Header row */}
      <button className="w-full p-4 flex items-center gap-3 text-left" onClick={() => setExpanded((e) => !e)}>
        <Building2 className="h-5 w-5 text-primary flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-bold text-base">{company.name}</p>
            <Badge className={cn("text-xs uppercase font-bold border",
              company.plan === "pro" ? "bg-primary/10 text-primary border-primary/20"
              : company.plan === "standard" ? "bg-blue-100 text-blue-700 border-blue-200"
              : "bg-muted text-muted-foreground border-border")}>
              {company.plan}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            <Users className="inline h-3 w-3 mr-0.5" />{company.userCount} user{company.userCount !== 1 ? "s" : ""}
            {" · "}Created {format(new Date(company.createdAt), "dd MMM yyyy")}
          </p>
        </div>
        {expanded ? <ChevronUp className="h-5 w-5 text-muted-foreground flex-shrink-0" /> : <ChevronDown className="h-5 w-5 text-muted-foreground flex-shrink-0" />}
      </button>

      {expanded && (
        <div className="border-t border-border px-4 pb-4 pt-3 space-y-4">
          {/* Edit name */}
          <div className="space-y-1.5">
            <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Company Name</p>
            {editingName ? (
              <div className="flex gap-2">
                <Input value={nameDraft} onChange={(e) => setNameDraft(e.target.value)} className="h-10 flex-1 border-2" autoFocus />
                <Button size="icon" className="h-10 w-10" onClick={() => updateMutation.mutate({ name: nameDraft })} disabled={updateMutation.isPending}>
                  <Check className="h-4 w-4" />
                </Button>
                <Button size="icon" variant="outline" className="h-10 w-10" onClick={() => setEditingName(false)}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <div className="flex items-center justify-between">
                <p className="font-medium">{company.name}</p>
                <Button variant="ghost" size="sm" onClick={() => { setNameDraft(company.name); setEditingName(true); }}>
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
              </div>
            )}
          </div>

          {/* Plan switcher */}
          <div className="space-y-1.5">
            <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Plan</p>
            <div className="grid grid-cols-3 gap-2">
              {([
                { value: "lite", label: "Lite", desc: "Inventory & quotes" },
                { value: "standard", label: "Standard", desc: "Jobs & attendance" },
                { value: "pro", label: "Pro", desc: "Full production" },
              ] as const).map((p) => (
                <button key={p.value} onClick={() => updateMutation.mutate({ plan: p.value })}
                  className={cn("h-14 rounded-lg border-2 font-bold text-sm transition-all flex flex-col items-center justify-center gap-0.5",
                    company.plan === p.value ? "border-primary bg-primary/5 text-primary" : "border-border text-muted-foreground hover:border-muted-foreground/50"
                  )}>
                  <span className="uppercase">{p.label}</span>
                  <span className="text-[10px] font-normal opacity-70">{p.desc}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Users */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Users</p>
              <Button variant="outline" size="sm" className="h-8 gap-1.5" onClick={() => setShowAddUser((v) => !v)}>
                <UserPlus className="h-3.5 w-3.5" /> Add User
              </Button>
            </div>

            {showAddUser && (
              <div className="bg-muted/30 rounded-lg p-3 space-y-2 border border-border">
                <Input placeholder="Username" value={newUser.username} onChange={(e) => setNewUser((p) => ({ ...p, username: e.target.value }))} className="h-9 border-2" />
                <Input type="password" placeholder="Password (min 6)" value={newUser.password} onChange={(e) => setNewUser((p) => ({ ...p, password: e.target.value }))} className="h-9 border-2" />
                <div className="grid grid-cols-2 gap-2">
                  {(["admin", "worker"] as const).map((r) => (
                    <button key={r} onClick={() => setNewUser((p) => ({ ...p, role: r }))}
                      className={cn("h-9 rounded-lg border-2 font-bold text-xs uppercase transition-all",
                        newUser.role === r ? "border-primary bg-primary/5 text-primary" : "border-border text-muted-foreground"
                      )}>
                      {r}
                    </button>
                  ))}
                </div>
                <Button className="w-full h-9 font-bold gap-1.5" disabled={!newUser.username || newUser.password.length < 6 || addUserMutation.isPending} onClick={() => addUserMutation.mutate()}>
                  {addUserMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                  Add
                </Button>
              </div>
            )}

            {usersLoading ? (
              <div className="flex justify-center py-4"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
            ) : users.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-3">No users</p>
            ) : (
              <div className="space-y-1.5">
                {users.map((u) => (
                  <div key={u.id} className="bg-background border border-border rounded-lg p-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <p className="font-semibold text-sm">{u.username}</p>
                        <Badge variant="outline" className="text-xs capitalize mt-0.5">{u.role}</Badge>
                      </div>
                      <div className="flex gap-1.5">
                        <Button variant="ghost" size="icon" className="h-8 w-8" title="Reset password"
                          onClick={() => { setResetingUserId(resetingUserId === u.id ? null : u.id); setNewPassword(""); }}>
                          <KeyRound className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                    {resetingUserId === u.id && (
                      <div className="mt-2 flex gap-2">
                        <Input type="password" placeholder="New password (min 6)" value={newPassword}
                          onChange={(e) => setNewPassword(e.target.value)} className="h-8 text-sm border-2 flex-1" />
                        <Button size="sm" className="h-8" disabled={newPassword.length < 6 || resetPasswordMutation.isPending}
                          onClick={() => resetPasswordMutation.mutate(u.id)}>
                          {resetPasswordMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                        </Button>
                        <Button size="sm" variant="ghost" className="h-8" onClick={() => setResetingUserId(null)}>
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Danger */}
          <div className="border-t border-red-200 pt-3">
            <Button variant="destructive" size="sm" className="gap-1.5 h-9"
              onClick={() => {
                if (confirm(`Delete "${company.name}" and all its data? This cannot be undone.`)) {
                  deleteMutation.mutate();
                }
              }}
              disabled={deleteMutation.isPending}
            >
              <Trash2 className="h-3.5 w-3.5" /> Delete Company
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Owner Panel Page ─────────────────────────────────────────────────────────

export default function OwnerPanelPage() {
  const { user } = useAuth();
  const [showCreate, setShowCreate] = useState(false);

  const { data: companies = [], isLoading } = useQuery({
    queryKey: ["/api/owner/companies"],
    queryFn: fetchCompanies,
    enabled: user?.role === "owner",
  });

  if (user?.role !== "owner") {
    return <div className="flex items-center justify-center h-full py-20 text-muted-foreground">Access denied.</div>;
  }

  return (
    <div className="flex flex-col min-h-full">
      {/* Header */}
      <div className="bg-secondary text-secondary-foreground p-4 sticky top-0 z-20 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Crown className="h-6 w-6 text-yellow-500" />
            <div>
              <h1 className="text-xl font-bold">Owner Panel</h1>
              <p className="text-xs text-secondary-foreground/60">Manage all companies and accounts</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <a href="/onboarding-guide.html" download="Stock-Scanner-Lite-Setup-Guide.html" target="_blank">
              <Button size="sm" variant="outline" className="gap-1.5">
                <FileDown className="h-4 w-4" /> Setup Guide
              </Button>
            </a>
            <Button size="sm" className="gap-1.5" onClick={() => setShowCreate(true)}>
              <Plus className="h-4 w-4" /> New Company
            </Button>
          </div>
        </div>
      </div>

      <div className="p-4 space-y-3 pb-24">
        {isLoading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : companies.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground border-2 border-dashed rounded-xl">
            <Building2 className="h-12 w-12 mx-auto mb-3 opacity-20" />
            <p className="font-semibold">No companies yet</p>
            <p className="text-sm mt-1">Tap "New Company" to get started</p>
          </div>
        ) : (
          <>
            <p className="text-xs text-muted-foreground font-semibold">{companies.length} company{companies.length !== 1 ? "ies" : ""}</p>
            {companies.map((c) => <CompanyRow key={c.id} company={c} />)}
          </>
        )}
      </div>

      {showCreate && <CreateCompanyModal onClose={() => setShowCreate(false)} />}
    </div>
  );
}
