import { useState, useEffect } from "react";
import { Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/auth";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { Clock, LogIn, LogOut, Heart, Plane, FileText, BarChart3, CalendarPlus, X, CheckCircle2, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

type AttendanceType = "work" | "sick" | "vacation";
interface TodayLog {
  id: number;
  type: AttendanceType;
  clockIn: string | null;
  clockOut: string | null;
  workSeconds: number;
  overtimeSeconds: number;
  note: string | null;
}

interface LeaveRequest {
  id: number;
  type: "sick" | "vacation";
  startDate: string;
  endDate: string;
  status: "pending" | "approved" | "rejected";
  managerNote: string | null;
  createdAt: string;
}

async function api(url: string, opts?: RequestInit) {
  const res = await fetch(url, { credentials: "include", ...opts });
  if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || "Failed"); }
  if (res.status === 204) return null;
  return res.json();
}

function fmtHMS(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function fmtTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function fmtDate(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
}

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function tomorrowStr(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// ─── Leave Request Form ────────────────────────────────────────────────────────

function LeaveRequestForm({ onDone }: { onDone: () => void }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const tomorrow = tomorrowStr();
  const [type, setType] = useState<"sick" | "vacation">("vacation");
  const [startDate, setStartDate] = useState(tomorrow);
  const [endDate, setEndDate] = useState(tomorrow);

  const submit = useMutation({
    mutationFn: () => api("/api/leave", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, startDate, endDate }),
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/leave/mine"] });
      toast({ title: type === "sick" ? "Sick leave recorded" : "Vacation request submitted for approval" });
      onDone();
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const isValid = startDate && endDate && endDate >= startDate;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2">
        {(["sick", "vacation"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setType(t)}
            className={cn(
              "flex flex-col items-center gap-1.5 py-3 rounded-xl border-2 text-sm font-bold transition-all",
              type === t
                ? t === "sick"
                  ? "border-rose-400 bg-rose-50 text-rose-700"
                  : "border-sky-400 bg-sky-50 text-sky-700"
                : "border-border text-muted-foreground hover:border-muted-foreground/50"
            )}
          >
            {t === "sick" ? <Heart className="h-5 w-5" /> : <Plane className="h-5 w-5" />}
            {t === "sick" ? "Sick" : "Vacation"}
          </button>
        ))}
      </div>
      {type === "sick" && (
        <p className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
          Sick leave is approved immediately and attendance is recorded for the selected days.
        </p>
      )}
      {type === "vacation" && (
        <p className="text-xs text-sky-700 bg-sky-50 border border-sky-200 rounded-lg px-3 py-2">
          Vacation requests need manager approval. Once approved, days are recorded as vacation.
        </p>
      )}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground block mb-1">From</label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => { setStartDate(e.target.value); if (e.target.value > endDate) setEndDate(e.target.value); }}
            className="w-full h-10 px-3 rounded-lg border-2 border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>
        <div>
          <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground block mb-1">To</label>
          <input
            type="date"
            value={endDate}
            min={startDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="w-full h-10 px-3 rounded-lg border-2 border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>
      </div>
      <div className="flex gap-2">
        <Button variant="outline" className="flex-1 h-10" onClick={onDone}>Cancel</Button>
        <Button
          className={cn("flex-1 h-10 font-bold", type === "sick" ? "bg-rose-600 hover:bg-rose-700" : "bg-sky-600 hover:bg-sky-700")}
          disabled={!isValid || submit.isPending}
          onClick={() => submit.mutate()}
        >
          {submit.isPending ? "Submitting…" : type === "sick" ? "Record Sick Leave" : "Request Vacation"}
        </Button>
      </div>
    </div>
  );
}

// ─── Leave Request List ────────────────────────────────────────────────────────

function LeaveRequestList() {
  const { data: requests = [], isLoading } = useQuery<LeaveRequest[]>({
    queryKey: ["/api/leave/mine"],
    queryFn: () => api("/api/leave/mine"),
  });

  if (isLoading) return <Skeleton className="h-20 w-full rounded-xl" />;
  if (requests.length === 0) return (
    <p className="text-xs text-muted-foreground text-center py-3">No leave requests yet.</p>
  );

  return (
    <div className="space-y-2 max-h-64 overflow-y-auto">
      {requests.map((r) => (
        <div key={r.id} className={cn(
          "flex items-center gap-3 p-3 rounded-lg border text-sm",
          r.status === "approved" ? "border-green-200 bg-green-50" :
          r.status === "rejected" ? "border-red-200 bg-red-50" :
          "border-amber-200 bg-amber-50"
        )}>
          {r.type === "sick"
            ? <Heart className="h-4 w-4 text-rose-600 flex-shrink-0" />
            : <Plane className="h-4 w-4 text-sky-600 flex-shrink-0" />}
          <div className="flex-1 min-w-0">
            <p className="font-semibold capitalize text-xs">
              {r.type} · {fmtDate(r.startDate)}{r.startDate !== r.endDate ? ` – ${fmtDate(r.endDate)}` : ""}
            </p>
            {r.managerNote && <p className="text-xs text-muted-foreground truncate">"{r.managerNote}"</p>}
          </div>
          <span className={cn(
            "text-[10px] font-bold uppercase px-1.5 py-0.5 rounded flex-shrink-0",
            r.status === "approved" ? "text-green-700 bg-green-100" :
            r.status === "rejected" ? "text-red-700 bg-red-100" :
            "text-amber-700 bg-amber-100"
          )}>
            {r.status}
          </span>
        </div>
      ))}
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function AttendancePage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [note, setNote] = useState("");
  const [now, setNow] = useState(Date.now());
  const [showLeaveForm, setShowLeaveForm] = useState(false);

  const { data: today, isLoading } = useQuery<TodayLog | null>({
    queryKey: ["/api/attendance/today"],
    queryFn: () => api("/api/attendance/today"),
    refetchInterval: 30000,
  });

  // Live ticking timer
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const clockIn = useMutation({
    mutationFn: () => api("/api/attendance/clock-in", { method: "POST" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/attendance/today"] }); toast({ title: "Clocked in" }); },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const clockOut = useMutation({
    mutationFn: () => api("/api/attendance/clock-out", { method: "POST" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/attendance/today"] }); toast({ title: "Clocked out" }); },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const absence = useMutation({
    mutationFn: (type: "sick" | "vacation") => api("/api/attendance/absence", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, note: note.trim() || undefined }),
    }),
    onSuccess: (_d, type) => {
      qc.invalidateQueries({ queryKey: ["/api/attendance/today"] });
      setNote("");
      toast({ title: type === "sick" ? "Marked as sick today" : "Vacation day recorded" });
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const isClockedIn = today?.type === "work" && !!today?.clockIn && !today?.clockOut;
  const liveSeconds = (() => {
    if (!today) return 0;
    let base = today.workSeconds;
    if (isClockedIn && today.clockIn) {
      base += Math.max(0, Math.floor((now - new Date(today.clockIn).getTime()) / 1000));
    }
    return base;
  })();

  const monthParam = (() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  })();

  return (
    <div className="p-4 space-y-5 pb-24">
      <div className="pt-2 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black">Attendance</h1>
          <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">
            Today · {new Date().toLocaleDateString([], { weekday: "long", month: "short", day: "numeric" })}
          </p>
        </div>
        <Link href={`/attendance/report?month=${monthParam}`}>
          <Button variant="outline" size="sm" className="gap-1.5"><BarChart3 className="h-4 w-4" /> My report</Button>
        </Link>
      </div>

      {isLoading ? (
        <Skeleton className="h-40 w-full rounded-2xl" />
      ) : today?.type === "sick" ? (
        <div className="rounded-2xl border-2 border-rose-200 bg-rose-50 p-5 text-center space-y-2">
          <Heart className="h-8 w-8 text-rose-500 mx-auto" />
          <p className="font-black text-lg">Sick day</p>
          {today.note && <p className="text-sm text-rose-700">"{today.note}"</p>}
          <p className="text-xs text-muted-foreground">Get well soon.</p>
        </div>
      ) : today?.type === "vacation" ? (
        <div className="rounded-2xl border-2 border-sky-200 bg-sky-50 p-5 text-center space-y-2">
          <Plane className="h-8 w-8 text-sky-500 mx-auto" />
          <p className="font-black text-lg">Vacation day</p>
          {today.note && <p className="text-sm text-sky-700">"{today.note}"</p>}
        </div>
      ) : (
        <div className={`rounded-2xl border-2 p-5 space-y-4 ${isClockedIn ? "border-green-300 bg-green-50" : "border-border bg-card"}`}>
          <div className="text-center">
            <div className={`text-5xl font-black tabular-nums ${isClockedIn ? "text-green-700" : "text-muted-foreground"}`}>
              {fmtHMS(liveSeconds)}
            </div>
            <p className="text-xs uppercase tracking-wider text-muted-foreground mt-1 font-bold">
              {isClockedIn ? "Working" : today?.clockOut ? "Clocked out" : "Not started"}
            </p>
          </div>

          {today && (
            <div className="grid grid-cols-2 gap-3 text-center text-xs">
              <div className="rounded-lg border bg-background p-2">
                <p className="text-muted-foreground uppercase tracking-wider">Clock in</p>
                <p className="font-bold text-base mt-0.5">{fmtTime(today.clockIn)}</p>
              </div>
              <div className="rounded-lg border bg-background p-2">
                <p className="text-muted-foreground uppercase tracking-wider">Clock out</p>
                <p className="font-bold text-base mt-0.5">{fmtTime(today.clockOut)}</p>
              </div>
            </div>
          )}

          {isClockedIn ? (
            <Button size="lg" onClick={() => clockOut.mutate()} disabled={clockOut.isPending}
              className="w-full h-14 text-base font-black bg-rose-600 hover:bg-rose-700">
              <LogOut className="h-5 w-5 mr-2" /> Clock Out
            </Button>
          ) : (
            <Button size="lg" onClick={() => clockIn.mutate()} disabled={clockIn.isPending}
              className="w-full h-14 text-base font-black bg-green-600 hover:bg-green-700">
              <LogIn className="h-5 w-5 mr-2" /> {today?.clockOut ? "Resume Clock-In" : "Clock In"}
            </Button>
          )}
        </div>
      )}

      {/* Absence section — only show if not already declared an absence */}
      {(!today || today.type === "work") && !isClockedIn && (
        <div className="rounded-2xl border-2 border-border bg-card p-4 space-y-3">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-muted-foreground" />
            <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Declare absence today</p>
          </div>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Optional note (e.g. flu, family event)…"
            rows={2}
            className="w-full px-3 py-2 rounded-lg border-2 border-input bg-background text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" className="h-12 border-rose-200 text-rose-700 hover:bg-rose-50 font-bold"
              disabled={absence.isPending || !!today?.workSeconds}
              onClick={() => absence.mutate("sick")}>
              <Heart className="h-4 w-4 mr-1.5" /> Sick Today
            </Button>
            <Button variant="outline" className="h-12 border-sky-200 text-sky-700 hover:bg-sky-50 font-bold"
              disabled={absence.isPending || !!today?.workSeconds}
              onClick={() => absence.mutate("vacation")}>
              <Plane className="h-4 w-4 mr-1.5" /> Vacation Today
            </Button>
          </div>
          {today?.workSeconds ? (
            <p className="text-xs text-muted-foreground text-center">You already worked today; absence cannot be declared.</p>
          ) : null}
        </div>
      )}

      {/* Future leave requests */}
      <div className="rounded-2xl border-2 border-border bg-card p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CalendarPlus className="h-4 w-4 text-muted-foreground" />
            <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Leave Requests</p>
          </div>
          {!showLeaveForm && (
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setShowLeaveForm(true)}>
              + Request
            </Button>
          )}
        </div>

        {showLeaveForm ? (
          <LeaveRequestForm onDone={() => setShowLeaveForm(false)} />
        ) : (
          <LeaveRequestList />
        )}
      </div>

      {(user?.role === "admin" || user?.isSupervisor) && (
        <div className="rounded-2xl border-2 border-blue-200 bg-blue-50 p-4 space-y-3">
          <p className="text-xs font-bold uppercase tracking-wider text-blue-700">Manager tools</p>
          <div className="grid grid-cols-2 gap-2">
            <Link href="/attendance/live">
              <Button variant="outline" className="w-full h-11 border-blue-300 text-blue-700 font-bold">
                <Clock className="h-4 w-4 mr-1.5" /> Who's In
              </Button>
            </Link>
            {user?.role === "admin" && (
              <Link href={`/attendance/report?month=${monthParam}&userId=all`}>
                <Button variant="outline" className="w-full h-11 border-blue-300 text-blue-700 font-bold">
                  <BarChart3 className="h-4 w-4 mr-1.5" /> Reports
                </Button>
              </Link>
            )}
          </div>

          {/* Pending leave approvals */}
          <LeaveApprovalPanel />
        </div>
      )}
    </div>
  );
}

// ─── Manager: Pending Leave Approvals ─────────────────────────────────────────

interface PendingLeave {
  id: number;
  userId: number;
  username: string;
  type: "sick" | "vacation";
  startDate: string;
  endDate: string;
  status: "pending" | "approved" | "rejected";
  createdAt: string;
}

function LeaveApprovalPanel() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [notes, setNotes] = React.useState<Record<number, string>>({});

  const { data: pending = [], isLoading } = useQuery<PendingLeave[]>({
    queryKey: ["/api/leave/pending"],
    queryFn: () => api("/api/leave/pending"),
  });

  const resolve = useMutation({
    mutationFn: ({ id, status, managerNote }: { id: number; status: "approved" | "rejected"; managerNote?: string }) =>
      api(`/api/leave/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, ...(managerNote ? { managerNote } : {}) }),
      }),
    onSuccess: (_d, { id, status }) => {
      qc.invalidateQueries({ queryKey: ["/api/leave/pending"] });
      setNotes((prev) => { const n = { ...prev }; delete n[id]; return n; });
      toast({ title: status === "approved" ? "Leave approved — attendance updated" : "Leave request rejected" });
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  if (isLoading || pending.length === 0) return null;

  return (
    <div className="space-y-2 pt-1 border-t border-blue-200">
      <p className="text-xs font-bold uppercase tracking-wider text-blue-800 pt-1">
        Pending approvals ({pending.length})
      </p>
      {pending.map((r) => (
        <div key={r.id} className="bg-white rounded-lg border border-blue-200 p-3 space-y-2">
          <div className="flex items-center gap-2">
            {r.type === "sick" ? <Heart className="h-3.5 w-3.5 text-rose-500" /> : <Plane className="h-3.5 w-3.5 text-sky-500" />}
            <span className="font-bold text-sm">{r.username}</span>
            <span className="text-xs text-muted-foreground capitalize">— {r.type}</span>
          </div>
          <p className="text-xs text-muted-foreground">
            {fmtDate(r.startDate)}{r.startDate !== r.endDate ? ` → ${fmtDate(r.endDate)}` : ""}
          </p>
          <textarea
            value={notes[r.id] ?? ""}
            onChange={(e) => setNotes((prev) => ({ ...prev, [r.id]: e.target.value }))}
            placeholder="Optional note to worker…"
            rows={2}
            className="w-full px-2 py-1.5 rounded border border-input bg-background text-xs resize-none focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
          <div className="flex gap-2">
            <Button size="sm" variant="outline"
              className="flex-1 h-8 border-red-200 text-red-600 hover:bg-red-50 font-bold text-xs"
              disabled={resolve.isPending}
              onClick={() => resolve.mutate({ id: r.id, status: "rejected", managerNote: notes[r.id] })}>
              <XCircle className="h-3.5 w-3.5 mr-1" /> Reject
            </Button>
            <Button size="sm"
              className="flex-1 h-8 bg-green-600 hover:bg-green-700 font-bold text-xs"
              disabled={resolve.isPending}
              onClick={() => resolve.mutate({ id: r.id, status: "approved", managerNote: notes[r.id] })}>
              <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Approve
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}
