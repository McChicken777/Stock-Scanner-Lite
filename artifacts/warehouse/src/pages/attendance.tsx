import { useState, useEffect } from "react";
import { Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/auth";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { Clock, LogIn, LogOut, Heart, Plane, FileText, BarChart3 } from "lucide-react";

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

export default function AttendancePage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [note, setNote] = useState("");
  const [now, setNow] = useState(Date.now());

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
            <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Declare absence</p>
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
              <Heart className="h-4 w-4 mr-1.5" /> Sick
            </Button>
            <Button variant="outline" className="h-12 border-sky-200 text-sky-700 hover:bg-sky-50 font-bold"
              disabled={absence.isPending || !!today?.workSeconds}
              onClick={() => absence.mutate("vacation")}>
              <Plane className="h-4 w-4 mr-1.5" /> Vacation
            </Button>
          </div>
          {today?.workSeconds ? (
            <p className="text-xs text-muted-foreground text-center">You already worked today; absence cannot be declared.</p>
          ) : null}
        </div>
      )}

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
        </div>
      )}
    </div>
  );
}
