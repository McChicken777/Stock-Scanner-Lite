import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/auth";
import { useLang } from "@/contexts/lang";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  Building2, Plus, ChevronDown, ChevronUp, Users, Loader2,
  Pencil, Check, X, KeyRound, Trash2, UserPlus, Crown, FileDown,
  Tablet, QrCode, Wifi, WifiOff, CreditCard, Hash, RefreshCw,
} from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { QRCodeSVG } from "qrcode.react";

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
  const { t } = useLang();
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
            <Building2 className="h-5 w-5 text-primary" /> {t("ownerNewCompany")}
          </h2>
          <button onClick={onClose}><X className="h-5 w-5" /></button>
        </div>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{t("ownerCompanyNameLabel")}</Label>
            <Input value={form.companyName} onChange={set("companyName")} placeholder="e.g. Acme Manufacturing" className="h-11 border-2" />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{t("ownerPlan")}</Label>
            <div className="grid grid-cols-3 gap-2">
              {([
                { value: "lite" as const, label: "Lite", descKey: "ownerPlanLite" as const },
                { value: "standard" as const, label: "Standard", descKey: "ownerPlanStandard" as const },
                { value: "pro" as const, label: "Pro", descKey: "ownerPlanPro" as const },
              ]).map((p) => (
                <button key={p.value} onClick={() => setForm((prev) => ({ ...prev, plan: p.value }))}
                  className={cn("h-14 rounded-lg border-2 font-bold text-sm transition-all flex flex-col items-center justify-center gap-0.5",
                    form.plan === p.value ? "border-primary bg-primary/5 text-primary" : "border-border text-muted-foreground"
                  )}>
                  <span className="uppercase">{p.label}</span>
                  <span className="text-[10px] font-normal opacity-70">{t(p.descKey)}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="border-t border-border pt-4 space-y-3">
            <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{t("ownerFirstAdmin")}</p>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">{t("ownerUsername")}</Label>
              <Input value={form.adminUsername} onChange={set("adminUsername")} placeholder="admin" className="h-11 border-2" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">{t("ownerPasswordMin6")}</Label>
              <Input type="password" value={form.adminPassword} onChange={set("adminPassword")} placeholder="••••••••" className="h-11 border-2" />
            </div>
          </div>
        </div>

        <Button className="w-full h-12 font-bold gap-2" disabled={!canSubmit || createMutation.isPending} onClick={() => createMutation.mutate()}>
          {createMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          {t("ownerCreateCompany")}
        </Button>
      </div>
    </div>
  );
}

// ── Kiosk QR Modal ───────────────────────────────────────────────────────────

function KioskQrModal({ token, workstationName, stationTypeName, onClose }: {
  token: string; workstationName: string; stationTypeName: string; onClose: () => void;
}) {
  const kioskUrl = `${window.location.origin}/kiosk?token=${token}`;
  const [copied, setCopied] = useState(false);

  const copy = () => {
    navigator.clipboard.writeText(kioskUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-card rounded-2xl w-full max-w-sm p-6 space-y-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-bold text-lg">{workstationName}</h3>
            <p className="text-xs text-muted-foreground">{stationTypeName} · Kiosk QR Code</p>
          </div>
          <button onClick={onClose}><X className="h-5 w-5 text-muted-foreground" /></button>
        </div>

        <div className="flex justify-center p-4 bg-white rounded-xl">
          <QRCodeSVG value={kioskUrl} size={180} />
        </div>

        <div className="space-y-3 text-sm">
          <div className="bg-muted/50 rounded-lg p-3 font-mono text-xs break-all text-muted-foreground">
            {kioskUrl}
          </div>
          <button
            onClick={copy}
            className="w-full h-10 rounded-lg border border-border font-semibold text-sm hover:bg-muted transition-colors flex items-center justify-center gap-2"
          >
            {copied ? <Check className="h-4 w-4 text-green-500" /> : <RefreshCw className="h-4 w-4" />}
            {copied ? "Copied!" : "Copy link"}
          </button>
        </div>

        <div className="border border-blue-200 bg-blue-50 rounded-lg p-3 space-y-1.5 text-xs text-blue-700">
          <p className="font-bold">Setup instructions:</p>
          <ol className="list-decimal list-inside space-y-1 text-blue-600">
            <li>Open this URL on the tablet (or scan the QR)</li>
            <li>The tablet locks to <strong>{workstationName}</strong> automatically</li>
            <li>For security, lock the browser to full-screen / kiosk mode in the OS settings</li>
          </ol>
        </div>
      </div>
    </div>
  );
}

// ── Kiosk Setup Section ───────────────────────────────────────────────────────

interface KioskRow {
  id: number; token: string; label: string | null; lastSeenAt: string | null;
  workstationId: number; workstationName: string; stationTypeName: string; stationTypeColor: string;
}
interface WorkstationRow {
  id: number; name: string; isActive: boolean;
  stationTypeId: number; stationTypeName: string; stationTypeColor: string;
}
interface WorkerKioskRow {
  id: number; username: string; hasPin: boolean;
  nfcCard: { id: number; cardUid: string } | null;
}

function KioskSetupSection({ companyId }: { companyId: number }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [qrKiosk, setQrKiosk] = useState<KioskRow | null>(null);
  const [showWorkers, setShowWorkers] = useState(false);
  const [pinInput, setPinInput] = useState<Record<number, string>>({});
  const [nfcInput, setNfcInput] = useState<Record<number, string>>({});

  const { data: kiosks = [], isLoading: kiosksLoading } = useQuery<KioskRow[]>({
    queryKey: [`/api/owner/companies/${companyId}/kiosks`],
    queryFn: () => fetch(`/api/owner/companies/${companyId}/kiosks`, { credentials: "include" }).then((r) => r.json()),
  });

  const { data: workstations = [] } = useQuery<WorkstationRow[]>({
    queryKey: [`/api/owner/companies/${companyId}/workstations`],
    queryFn: () => fetch(`/api/owner/companies/${companyId}/workstations`, { credentials: "include" }).then((r) => r.json()),
  });

  const { data: workers = [] } = useQuery<WorkerKioskRow[]>({
    queryKey: [`/api/owner/companies/${companyId}/workers-kiosk`],
    queryFn: () => fetch(`/api/owner/companies/${companyId}/workers-kiosk`, { credentials: "include" }).then((r) => r.json()),
    enabled: showWorkers,
  });

  const pairedWsIds = new Set(kiosks.map((k) => k.workstationId));

  const pairMutation = useMutation({
    mutationFn: async (workstationId: number) => {
      const r = await fetch(`/api/owner/companies/${companyId}/kiosks`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workstationId }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Failed");
      return d;
    },
    onSuccess: (newKiosk) => {
      queryClient.invalidateQueries({ queryKey: [`/api/owner/companies/${companyId}/kiosks`] });
      setQrKiosk(newKiosk);
      toast({ title: "Kiosk paired!" });
    },
    onError: (err) => toast({ title: err instanceof Error ? err.message : "Error", variant: "destructive" }),
  });

  const revokeMutation = useMutation({
    mutationFn: async (kioskId: number) => {
      await fetch(`/api/owner/kiosks/${kioskId}`, { method: "DELETE", credentials: "include" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/owner/companies/${companyId}/kiosks`] });
      toast({ title: "Kiosk revoked" });
    },
  });

  const setPinMutation = useMutation({
    mutationFn: async ({ userId, pin }: { userId: number; pin: string }) => {
      const r = await fetch(`/api/owner/workers/${userId}/kiosk-pin`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Failed");
      return d;
    },
    onSuccess: (_, { userId }) => {
      queryClient.invalidateQueries({ queryKey: [`/api/owner/companies/${companyId}/workers-kiosk`] });
      setPinInput((p) => { const n = { ...p }; delete n[userId]; return n; });
      toast({ title: "PIN set!" });
    },
    onError: (err) => toast({ title: err instanceof Error ? err.message : "Error", variant: "destructive" }),
  });

  const assignNfcMutation = useMutation({
    mutationFn: async ({ userId, cardUid }: { userId: number; cardUid: string }) => {
      const r = await fetch(`/api/owner/workers/${userId}/nfc-card`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cardUid }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Failed");
      return d;
    },
    onSuccess: (_, { userId }) => {
      queryClient.invalidateQueries({ queryKey: [`/api/owner/companies/${companyId}/workers-kiosk`] });
      setNfcInput((p) => { const n = { ...p }; delete n[userId]; return n; });
      toast({ title: "NFC card assigned!" });
    },
    onError: (err) => toast({ title: err instanceof Error ? err.message : "Error", variant: "destructive" }),
  });

  const removeNfcMutation = useMutation({
    mutationFn: async (userId: number) => {
      await fetch(`/api/owner/workers/${userId}/nfc-card`, { method: "DELETE", credentials: "include" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/owner/companies/${companyId}/workers-kiosk`] });
      toast({ title: "NFC card removed" });
    },
  });

  return (
    <div className="space-y-3 border-t border-border pt-4">
      <div className="flex items-center gap-2">
        <Tablet className="h-4 w-4 text-muted-foreground" />
        <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Kiosk Setup</p>
      </div>
      <p className="text-xs text-muted-foreground">
        Pair a dedicated tablet to each workstation. Workers tap their card or enter a PIN to identify themselves.
      </p>

      {/* Workstation list */}
      {workstations.length === 0 ? (
        <p className="text-xs text-muted-foreground italic py-1">
          No workstations configured yet — add them in the client's Production Flow page first.
        </p>
      ) : (
      <div className="space-y-2">
        {workstations.map((ws) => {
          const kiosk = kiosks.find((k) => k.workstationId === ws.id);
          const isPaired = !!kiosk;
          const isRecent = kiosk?.lastSeenAt
            ? (Date.now() - new Date(kiosk.lastSeenAt).getTime()) < 5 * 60 * 1000
            : false;

          return (
            <div key={ws.id} className="flex items-center justify-between gap-2 px-3 py-2.5 rounded-lg bg-muted/40 border border-border">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="h-2 w-2 rounded-full flex-shrink-0" style={{ backgroundColor: ws.stationTypeColor }} />
                <div className="min-w-0">
                  <p className="font-semibold text-sm truncate">{ws.name}</p>
                  <p className="text-xs text-muted-foreground">{ws.stationTypeName}</p>
                </div>
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                {isPaired ? (
                  <>
                    <span className={cn("flex items-center gap-1 text-xs font-medium", isRecent ? "text-green-600" : "text-muted-foreground")}>
                      {isRecent ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
                      {isRecent ? "Online" : "Paired"}
                    </span>
                    <Button variant="outline" size="sm" className="h-7 px-2 text-xs gap-1" onClick={() => setQrKiosk(kiosk)}>
                      <QrCode className="h-3 w-3" /> QR
                    </Button>
                    <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-destructive hover:text-destructive"
                      onClick={() => revokeMutation.mutate(kiosk.id)}>
                      Revoke
                    </Button>
                  </>
                ) : (
                  <Button size="sm" className="h-7 px-3 text-xs gap-1" onClick={() => pairMutation.mutate(ws.id)}
                    disabled={pairMutation.isPending}>
                    {pairMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
                    Pair tablet
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>
      )}

      {/* Workers PIN + NFC */}
      <button
        onClick={() => setShowWorkers((v) => !v)}
        className="flex items-center gap-2 text-xs font-semibold text-primary hover:underline"
      >
        <Users className="h-3.5 w-3.5" />
        {showWorkers ? "Hide" : "Manage"} worker cards &amp; PINs
        {showWorkers ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
      </button>

      {showWorkers && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            Set a 4-digit PIN so workers can identify themselves at any kiosk tablet.
            For NFC, enter the card UID (read it with a phone NFC app, or use Android Chrome on the kiosk tablet).
          </p>
          {workers.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-2">No workers yet</p>
          )}
          {workers.map((w) => (
            <div key={w.id} className="bg-background border border-border rounded-lg p-3 space-y-2">
              <div className="flex items-center justify-between">
                <p className="font-semibold text-sm">{w.username}</p>
                <div className="flex items-center gap-1.5">
                  <Badge variant={w.hasPin ? "default" : "outline"} className="text-xs h-5">
                    <Hash className="h-2.5 w-2.5 mr-1" />{w.hasPin ? "PIN set" : "No PIN"}
                  </Badge>
                  <Badge variant={w.nfcCard ? "default" : "outline"} className="text-xs h-5">
                    <CreditCard className="h-2.5 w-2.5 mr-1" />{w.nfcCard ? "Card" : "No card"}
                  </Badge>
                </div>
              </div>

              {/* PIN input */}
              <div className="flex gap-2">
                <Input
                  type="password"
                  placeholder="4-digit PIN"
                  maxLength={4}
                  value={pinInput[w.id] ?? ""}
                  onChange={(e) => setPinInput((p) => ({ ...p, [w.id]: e.target.value.replace(/\D/g, "").slice(0, 4) }))}
                  className="h-8 text-sm flex-1"
                />
                <Button size="sm" className="h-8 px-3"
                  disabled={!pinInput[w.id] || pinInput[w.id].length !== 4 || setPinMutation.isPending}
                  onClick={() => setPinMutation.mutate({ userId: w.id, pin: pinInput[w.id] })}>
                  Set PIN
                </Button>
              </div>

              {/* NFC input */}
              <div className="flex gap-2">
                <Input
                  placeholder="NFC card UID (e.g. 04:A3:B2:11)"
                  value={nfcInput[w.id] ?? ""}
                  onChange={(e) => setNfcInput((p) => ({ ...p, [w.id]: e.target.value }))}
                  className="h-8 text-sm flex-1 font-mono"
                />
                <Button size="sm" variant="outline" className="h-8 px-3"
                  disabled={!nfcInput[w.id]?.trim() || assignNfcMutation.isPending}
                  onClick={() => assignNfcMutation.mutate({ userId: w.id, cardUid: nfcInput[w.id].trim() })}>
                  <CreditCard className="h-3 w-3 mr-1" /> Assign
                </Button>
                {w.nfcCard && (
                  <Button size="sm" variant="ghost" className="h-8 px-2 text-destructive hover:text-destructive"
                    onClick={() => removeNfcMutation.mutate(w.id)}>
                    <X className="h-3 w-3" />
                  </Button>
                )}
              </div>
              {w.nfcCard && (
                <p className="text-xs text-muted-foreground font-mono">Current: {w.nfcCard.cardUid}</p>
              )}
            </div>
          ))}
        </div>
      )}

      {qrKiosk && (
        <KioskQrModal
          token={qrKiosk.token}
          workstationName={qrKiosk.workstationName}
          stationTypeName={qrKiosk.stationTypeName}
          onClose={() => setQrKiosk(null)}
        />
      )}
    </div>
  );
}

// ── Company Row ──────────────────────────────────────────────────────────────

function CompanyRow({ company }: { company: Company }) {
  const { toast } = useToast();
  const { t } = useLang();
  const { refreshUser } = useAuth();
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
      refreshUser();
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
            <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{t("ownerCompanyNameLabel")}</p>
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
            <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{t("ownerPlan")}</p>
            <div className="grid grid-cols-3 gap-2">
              {([
                { value: "lite" as const, label: "Lite", descKey: "ownerPlanLite" as const },
                { value: "standard" as const, label: "Standard", descKey: "ownerPlanStandard" as const },
                { value: "pro" as const, label: "Pro", descKey: "ownerPlanPro" as const },
              ]).map((p) => (
                <button key={p.value} onClick={() => updateMutation.mutate({ plan: p.value })}
                  className={cn("h-14 rounded-lg border-2 font-bold text-sm transition-all flex flex-col items-center justify-center gap-0.5",
                    company.plan === p.value ? "border-primary bg-primary/5 text-primary" : "border-border text-muted-foreground hover:border-muted-foreground/50"
                  )}>
                  <span className="uppercase">{p.label}</span>
                  <span className="text-[10px] font-normal opacity-70">{t(p.descKey)}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Users */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{t("ownerUsers")}</p>
              <Button variant="outline" size="sm" className="h-8 gap-1.5" onClick={() => setShowAddUser((v) => !v)}>
                <UserPlus className="h-3.5 w-3.5" /> {t("ownerAddUser")}
              </Button>
            </div>

            {showAddUser && (
              <div className="bg-muted/30 rounded-lg p-3 space-y-2 border border-border">
                <Input placeholder={t("ownerUsername")} value={newUser.username} onChange={(e) => setNewUser((p) => ({ ...p, username: e.target.value }))} className="h-9 border-2" />
                <Input type="password" placeholder={t("ownerPasswordMin6")} value={newUser.password} onChange={(e) => setNewUser((p) => ({ ...p, password: e.target.value }))} className="h-9 border-2" />
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
                  {t("add")}
                </Button>
              </div>
            )}

            {usersLoading ? (
              <div className="flex justify-center py-4"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
            ) : users.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-3">{t("ownerNoUsers")}</p>
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
                        <Button variant="ghost" size="icon" className="h-8 w-8" title={t("ownerResetPassword")}
                          onClick={() => { setResetingUserId(resetingUserId === u.id ? null : u.id); setNewPassword(""); }}>
                          <KeyRound className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                    {resetingUserId === u.id && (
                      <div className="mt-2 flex gap-2">
                        <Input type="password" placeholder={t("ownerNewPasswordMin6")} value={newPassword}
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

          {/* Kiosk Setup */}
          <KioskSetupSection companyId={company.id} />

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
              <Trash2 className="h-3.5 w-3.5" /> {t("ownerDeleteCompany")}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Owner Panel Page ─────────────────────────────────────────────────────────

export default function OwnerPanelPage() {
  const { user, refreshUser } = useAuth();
  const { t } = useLang();
  const [showCreate, setShowCreate] = useState(false);

  const { data: companies = [], isLoading } = useQuery({
    queryKey: ["/api/owner/companies"],
    queryFn: fetchCompanies,
    enabled: user?.role === "owner",
  });

  if (user?.role !== "owner") {
    return <div className="flex items-center justify-center h-full py-20 text-muted-foreground">{t("accessDenied")}</div>;
  }

  return (
    <div className="flex flex-col min-h-full">
      {/* Header */}
      <div className="bg-secondary text-secondary-foreground p-4 sticky top-0 z-20 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Crown className="h-6 w-6 text-yellow-500" />
            <div>
              <h1 className="text-xl font-bold">{t("ownerPanel")}</h1>
              <p className="text-xs text-secondary-foreground/60">{t("ownerPanelDesc")}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <a href="/onboarding-guide.html" download="Stock-Scanner-Lite-Setup-Guide.html" target="_blank">
              <Button size="sm" variant="outline" className="gap-1.5">
                <FileDown className="h-4 w-4" /> {t("ownerSetupGuide")}
              </Button>
            </a>
            <Button size="sm" className="gap-1.5" onClick={() => setShowCreate(true)}>
              <Plus className="h-4 w-4" /> {t("ownerNewCompany")}
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
            <p className="font-semibold">{t("ownerNoCompanies")}</p>
            <p className="text-sm mt-1">{t("ownerNoCompaniesDesc")}</p>
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
