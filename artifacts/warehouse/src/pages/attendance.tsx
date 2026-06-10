import { useState, useEffect } from "react";
import { Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/auth";
import { useLang } from "@/contexts/lang";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Clock, LogIn, LogOut, Heart, Plane, FileText, BarChart3, CalendarPlus, X, CheckCircle2, XCircle, AlertTriangle, ClockArrowUp } from "lucide-react";
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
  const { t } = useLang();
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
        {(["sick", "vacation"] as const).map((ltype) => (
          <button
            key={ltype}
            onClick={() => setType(ltype)}
            className={cn(
              "flex flex-col items-center gap-1.5 py-3 rounded-xl border-2 text-sm font-bold transition-all",
              type === ltype
                ? ltype === "sick"
                  ? "border-rose-400 bg-rose-50 text-rose-700"
                  : "border-sky-400 bg-sky-50 text-sky-700"
                : "border-border text-muted-foreground hover:border-muted-foreground/50"
            )}
          >
            {ltype === "sick" ? <Heart className="h-5 w-5" /> : <Plane className="h-5 w-5" />}
            {ltype === "sick" ? t("attendanceSick") : t("attendanceVacation")}
          </button>
        ))}
      </div>
      {type === "sick" && (
        <p className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
          {t("attendanceSickLeaveNote")}
        </p>
      )}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground block mb-1">{t("fieldFrom")}</label>
          <input
            type="date"
            value={startDate}
            min={tomorrow}
            onChange={(e) => { setStartDate(e.target.value); if (e.target.value > endDate) setEndDate(e.target.value); }}
            className="w-full h-10 px-3 rounded-lg border-2 border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>
        <div>
          <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground block mb-1">{t("fieldTo")}</label>
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
        <Button variant="outline" className="flex-1 h-10" onClick={onDone}>{t("cancel")}</Button>
        <Button
          className={cn("flex-1 h-10 font-bold", type === "sick" ? "bg-rose-600 hover:bg-rose-700" : "bg-sky-600 hover:bg-sky-700")}
          disabled={!isValid || submit.isPending}
          onClick={() => submit.mutate()}
        >
          {submit.isPending ? t("submitting") : type === "sick" ? "Record Sick Leave" : "Request Vacation"}
        </Button>
      </div>
    </div>
  );
}

// ─── Leave Request List ────────────────────────────────────────────────────────

function LeaveRequestList() {
  const { t } = useLang();
  const { data: requests = [], isLoading } = useQuery<LeaveRequest[]>({
    queryKey: ["/api/leave/mine"],
    queryFn: () => api("/api/leave/mine"),
  });

  if (isLoading) return <Skeleton className="h-20 w-full rounded-xl" />;
  if (requests.length === 0) return (
    <p className="text-xs text-muted-foreground text-center py-3">{t("attendanceNoLeaveRequests")}</p>
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

// ─── Backdate Dialog ───────────────────────────────────────────────────────────

interface AttendanceUser { id: number; username: string; role: string; }

function BackdateDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { t } = useLang();

  const { data: users = [] } = useQuery<AttendanceUser[]>({
    queryKey: ["/api/attendance/users"],
    queryFn: () => api("/api/attendance/users"),
    enabled: open,
  });

  const [userId, setUserId] = useState<string>("");
  const [date, setDate] = useState(todayStr());
  const [clockIn, setClockIn] = useState("");
  const [clockOut, setClockOut] = useState("");

  function toUTCTime(dateStr: string, localTime: string): string {
    const d = new Date(`${dateStr}T${localTime}:00`);
    return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
  }

  const submit = useMutation({
    mutationFn: () => api("/api/attendance/backdate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId: Number(userId),
        date,
        clockIn: toUTCTime(date, clockIn),
        ...(clockOut ? { clockOut: toUTCTime(date, clockOut) } : {}),
      }),
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/attendance/today"] });
      qc.invalidateQueries({ queryKey: ["/api/attendance/live"] });
      qc.invalidateQueries({ queryKey: ["/api/attendance/status"] });
      qc.invalidateQueries({ queryKey: ["/api/attendance/report"] });
      toast({ title: clockOut ? "Shift logged" : "Clock-in recorded — shift is now open" });
      onOpenChange(false);
      setUserId(""); setDate(todayStr()); setClockIn(""); setClockOut("");
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const isValid = userId && date && /^([01]\d|2[0-3]):[0-5]\d$/.test(clockIn) && (!clockOut || /^([01]\d|2[0-3]):[0-5]\d$/.test(clockOut));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{t("attendanceLogPastTime")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-1">
          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground block mb-1">Worker</label>
            <select
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              className="w-full h-10 px-3 rounded-lg border-2 border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            >
              <option value="">Select worker…</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>{u.username}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground block mb-1">Date</label>
            <input
              type="date"
              value={date}
              max={todayStr()}
              onChange={(e) => setDate(e.target.value)}
              className="w-full h-10 px-3 rounded-lg border-2 border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground block mb-1">Clock-in</label>
              <input
                type="time"
                value={clockIn}
                onChange={(e) => setClockIn(e.target.value)}
                className="w-full h-10 px-3 rounded-lg border-2 border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
            <div>
              <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground block mb-1">Clock-out <span className="normal-case font-normal">(optional)</span></label>
              <input
                type="time"
                value={clockOut}
                onChange={(e) => setClockOut(e.target.value)}
                className="w-full h-10 px-3 rounded-lg border-2 border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
          </div>

          {clockIn && !clockOut && (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              No clock-out — the shift stays open and the timer runs from the clock-in time.
            </p>
          )}

          <div className="flex gap-2">
            <Button variant="outline" className="flex-1 h-10" onClick={() => onOpenChange(false)}>{t("cancel")}</Button>
            <Button
              className="flex-1 h-10 font-bold"
              disabled={!isValid || submit.isPending}
              onClick={() => submit.mutate()}
            >
              {submit.isPending ? t("saving") : t("save")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function AttendancePage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const { t } = useLang();
  const [note, setNote] = useState("");
  const [now, setNow] = useState(Date.now());
  const [showLeaveForm, setShowLeaveForm] = useState(false);
  const [showBackdateForm, setShowBackdateForm] = useState(false);

  const { data: autoCloseNotice } = useQuery<{ id: number; date: string; clockIn: string | null; clockOut: string | null; workSeconds: number } | null>({
    queryKey: ["/api/attendance/auto-close-notice"],
    queryFn: () => api("/api/attendance/auto-close-notice"),
  });

  const ackAutoClose = useMutation({
    mutationFn: (id: number) => api(`/api/attendance/auto-close-notice/${id}/ack`, { method: "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/attendance/auto-close-notice"] }),
  });

  // Ack leave decisions when worker opens the page
  useEffect(() => {
    api("/api/leave/worker-notifications/ack", { method: "POST" }).then(() => {
      qc.invalidateQueries({ queryKey: ["/api/admin/worker-notifications"] });
    }).catch(() => {});
  }, []);

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
    mutationFn: () => api("/api/attendance/absence", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "sick", note: note.trim() || undefined }),
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/attendance/today"] });
      setNote("");
      toast({ title: "Marked as sick today" });
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
          <h1 className="text-2xl font-black">{t("attendanceTitle")}</h1>
          <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">
            Today · {new Date().toLocaleDateString([], { weekday: "long", month: "short", day: "numeric" })}
          </p>
        </div>
        <Link href={`/attendance/report?month=${monthParam}`}>
          <Button variant="outline" size="sm" className="gap-1.5"><BarChart3 className="h-4 w-4" /> {t("attendanceMyReport")}</Button>
        </Link>
      </div>

      {autoCloseNotice && (
        <div className="rounded-2xl border-2 border-amber-300 bg-amber-50 p-4 space-y-2">
          <div className="flex items-start gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="font-bold text-sm text-amber-900">{t("attendanceAutoCloseTitle")}</p>
              <p className="text-xs text-amber-800 mt-0.5">
                You forgot to clock out on {fmtDate(autoCloseNotice.date)}. We closed the shift at your scheduled end time
                ({fmtTime(autoCloseNotice.clockOut)}). If that's wrong, ask a manager to fix the time.
              </p>
            </div>
            <button
              onClick={() => ackAutoClose.mutate(autoCloseNotice.id)}
              disabled={ackAutoClose.isPending}
              className="p-1 rounded hover:bg-amber-100 flex-shrink-0"
              aria-label="Dismiss"
            >
              <X className="h-4 w-4 text-amber-700" />
            </button>
          </div>
        </div>
      )}

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
              {isClockedIn ? t("attendanceWorking") : today?.clockOut ? t("attendanceClockedOut") : "Not started"}
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
              <LogOut className="h-5 w-5 mr-2" /> {t("tasksClockOut")}
            </Button>
          ) : (
            <Button size="lg" onClick={() => clockIn.mutate()} disabled={clockIn.isPending}
              className="w-full h-14 text-base font-black bg-green-600 hover:bg-green-700">
              <LogIn className="h-5 w-5 mr-2" /> {today?.clockOut ? "Resume Clock-In" : t("tasksClockIn")}
            </Button>
          )}
        </div>
      )}

      {/* Absence section — only show if not already declared an absence */}
      {(!today || today.type === "work") && !isClockedIn && (
        <div className="rounded-2xl border-2 border-border bg-card p-4 space-y-3">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-muted-foreground" />
            <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{t("attendanceSickToday")}</p>
          </div>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Optional note (e.g. flu)…"
            rows={2}
            className="w-full px-3 py-2 rounded-lg border-2 border-input bg-background text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
          <Button variant="outline" className="w-full h-12 border-rose-200 text-rose-700 hover:bg-rose-50 font-bold"
            disabled={absence.isPending || !!today?.workSeconds}
            onClick={() => absence.mutate()}>
            <Heart className="h-4 w-4 mr-1.5" /> {t("attendanceMarkSick")}
          </Button>
          <p className="text-[11px] text-muted-foreground text-center">
            {t("attendanceForVacation")}
          </p>
          {today?.workSeconds ? (
            <p className="text-xs text-muted-foreground text-center">{t("attendanceAlreadyWorked")}</p>
          ) : null}
        </div>
      )}

      {/* Future leave requests */}
      <div className="rounded-2xl border-2 border-border bg-card p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CalendarPlus className="h-4 w-4 text-muted-foreground" />
            <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{t("attendanceLeaveSection")}</p>
          </div>
          {!showLeaveForm && (
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setShowLeaveForm(true)}>
              {t("attendanceRequestPlus")}
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
          <p className="text-xs font-bold uppercase tracking-wider text-blue-700">{t("attendanceManagerTools")}</p>
          <div className="grid grid-cols-2 gap-2">
            <Link href="/attendance/live">
              <Button variant="outline" className="w-full h-11 border-blue-300 text-blue-700 font-bold">
                <Clock className="h-4 w-4 mr-1.5" /> {t("attendanceWhosIn")}
              </Button>
            </Link>
            {user?.role === "admin" && (
              <Link href={`/attendance/report?month=${monthParam}&userId=all`}>
                <Button variant="outline" className="w-full h-11 border-blue-300 text-blue-700 font-bold">
                  <BarChart3 className="h-4 w-4 mr-1.5" /> {t("attendanceReports")}
                </Button>
              </Link>
            )}
          </div>
          <Button
            variant="outline"
            className="w-full h-11 border-blue-300 text-blue-700 font-bold"
            onClick={() => setShowBackdateForm(true)}
          >
            <ClockArrowUp className="h-4 w-4 mr-1.5" /> {t("attendanceLogPastTime")}
          </Button>
          <LeaveApprovalPanel />
        </div>
      )}

      <BackdateDialog open={showBackdateForm} onOpenChange={setShowBackdateForm} />
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
  const { t } = useLang();
  const [notes, setNotes] = useState<Record<number, string>>({});

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
        {t("attendancePendingApprovals")} ({pending.length})
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
            placeholder={t("attendanceOptionalNote")}
            rows={2}
            className="w-full px-2 py-1.5 rounded border border-input bg-background text-xs resize-none focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
          <div className="flex gap-2">
            <Button size="sm" variant="outline"
              className="flex-1 h-8 border-red-200 text-red-600 hover:bg-red-50 font-bold text-xs"
              disabled={resolve.isPending}
              onClick={() => resolve.mutate({ id: r.id, status: "rejected", managerNote: notes[r.id] })}>
              <XCircle className="h-3.5 w-3.5 mr-1" /> {t("attendanceReject")}
            </Button>
            <Button size="sm"
              className="flex-1 h-8 bg-green-600 hover:bg-green-700 font-bold text-xs"
              disabled={resolve.isPending}
              onClick={() => resolve.mutate({ id: r.id, status: "approved", managerNote: notes[r.id] })}>
              <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> {t("attendanceApprove")}
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}
