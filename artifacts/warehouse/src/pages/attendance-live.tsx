import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/auth";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, Clock, Heart, Plane, LogIn, LogOut, UserX, AlertTriangle } from "lucide-react";

interface LiveRow {
  userId: number;
  username: string;
  role: string;
  status: "clocked_in" | "clocked_out" | "sick" | "vacation" | "absent";
  clockIn: string | null;
  clockOut: string | null;
  workSeconds: number;
  note: string | null;
  autoClosed: boolean;
}

async function api(url: string) {
  const res = await fetch(url, { credentials: "include" });
  if (!res.ok) throw new Error("Failed");
  return res.json();
}

function fmtTime(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function fmtHours(seconds: number) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h === 0) return `${m}m`;
  return `${h}h ${m}m`;
}

const STATUS_STYLES: Record<string, { bg: string; text: string; label: string; Icon: typeof Clock }> = {
  clocked_in: { bg: "bg-green-50 border-green-200", text: "text-green-700", label: "Working", Icon: LogIn },
  clocked_out: { bg: "bg-gray-50 border-gray-200", text: "text-gray-600", label: "Done for day", Icon: LogOut },
  sick: { bg: "bg-rose-50 border-rose-200", text: "text-rose-700", label: "Sick", Icon: Heart },
  vacation: { bg: "bg-sky-50 border-sky-200", text: "text-sky-700", label: "Vacation", Icon: Plane },
  absent: { bg: "bg-muted/30 border-border", text: "text-muted-foreground", label: "Not checked in", Icon: UserX },
};

export default function AttendanceLivePage() {
  const { user } = useAuth();
  const { data: rows = [], isLoading } = useQuery<LiveRow[]>({
    queryKey: ["/api/attendance/live"],
    queryFn: () => api("/api/attendance/live"),
    refetchInterval: 15000,
  });

  if (user?.role !== "admin" && !user?.isSupervisor) {
    return <div className="p-6 text-center text-muted-foreground">Manager access only.</div>;
  }

  const counts = rows.reduce((acc, r) => { acc[r.status] = (acc[r.status] ?? 0) + 1; return acc; }, {} as Record<string, number>);

  return (
    <div className="flex flex-col min-h-full">
      <div className="bg-secondary text-secondary-foreground p-4 sticky top-0 z-20 shadow-sm flex items-center gap-3">
        <Link href="/attendance" className="p-2 -ml-2 rounded-full hover:bg-secondary-foreground/10">
          <ArrowLeft className="h-6 w-6" />
        </Link>
        <Clock className="h-5 w-5" />
        <div>
          <h1 className="text-xl font-bold">Who's In Today</h1>
          <p className="text-xs opacity-80">{new Date().toLocaleDateString([], { weekday: "long", month: "short", day: "numeric" })}</p>
        </div>
      </div>

      <div className="p-4 space-y-4 pb-24">
        <div className="grid grid-cols-4 gap-2 text-center">
          {[
            { key: "clocked_in", label: "Working", color: "text-green-700", bg: "bg-green-50 border-green-200" },
            { key: "clocked_out", label: "Done", color: "text-gray-600", bg: "bg-gray-50 border-gray-200" },
            { key: "sick", label: "Sick", color: "text-rose-700", bg: "bg-rose-50 border-rose-200" },
            { key: "vacation", label: "Vacation", color: "text-sky-700", bg: "bg-sky-50 border-sky-200" },
          ].map(s => (
            <div key={s.key} className={`rounded-lg border-2 p-2 ${s.bg}`}>
              <p className={`text-2xl font-black ${s.color}`}>{counts[s.key] ?? 0}</p>
              <p className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">{s.label}</p>
            </div>
          ))}
        </div>

        {isLoading ? (
          <div className="space-y-2">{[1, 2, 3].map(i => <Skeleton key={i} className="h-16 w-full rounded-xl" />)}</div>
        ) : rows.length === 0 ? (
          <div className="text-center py-12 bg-muted/30 rounded-xl border border-dashed">
            <p className="text-muted-foreground">No employees in this company.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {rows.map(r => {
              const s = STATUS_STYLES[r.status];
              return (
                <div key={r.userId} className={`rounded-xl border-2 p-3 ${s.bg}`}>
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="font-bold text-sm truncate">{r.username}</p>
                      <div className={`flex items-center gap-1 text-xs ${s.text} font-semibold mt-0.5`}>
                        <s.Icon className="h-3 w-3" /> {s.label}
                        {r.note && <span className="text-muted-foreground italic truncate">· "{r.note}"</span>}
                      </div>
                    </div>
                    {r.status === "clocked_in" && (
                      <div className="text-right flex-shrink-0">
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Since</p>
                        <p className="font-bold text-sm">{fmtTime(r.clockIn)}</p>
                      </div>
                    )}
                    {r.status === "clocked_out" && (
                      <div className="text-right flex-shrink-0">
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Worked</p>
                        <p className="font-bold text-sm">{fmtHours(r.workSeconds)}</p>
                      </div>
                    )}
                  </div>
                  {r.autoClosed && (
                    <div className="mt-2 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-amber-700 bg-amber-100 border border-amber-200 rounded px-2 py-1 w-fit">
                      <AlertTriangle className="h-3 w-3" /> Auto-closed
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
