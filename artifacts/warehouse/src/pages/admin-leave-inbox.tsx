import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/auth";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Heart, Plane, CheckCircle2, XCircle, Inbox } from "lucide-react";
import { cn } from "@/lib/utils";

async function api(url: string, opts?: RequestInit) {
  const res = await fetch(url, { credentials: "include", ...opts });
  if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || "Failed"); }
  return res.json();
}

function fmtDate(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
}

function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
}

interface LeaveRow {
  id: number;
  userId: number;
  username: string;
  type: "sick" | "vacation";
  startDate: string;
  endDate: string;
  status: "pending" | "approved" | "rejected";
  managerNote: string | null;
  createdAt: string;
}

interface UserOption {
  id: number;
  username: string;
}

type StatusFilter = "all" | "pending" | "approved" | "rejected";

const STATUS_TABS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "pending", label: "Pending" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
];

const statusColors: Record<string, string> = {
  pending: "bg-amber-100 text-amber-700",
  approved: "bg-green-100 text-green-700",
  rejected: "bg-red-100 text-red-700",
};

const cardBorders: Record<string, string> = {
  pending: "border-amber-200",
  approved: "border-green-200",
  rejected: "border-red-200",
};

export default function AdminLeaveInboxPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [userFilter, setUserFilter] = useState<string>("");
  const [notes, setNotes] = useState<Record<number, string>>({});

  if (user?.role !== "admin") {
    return (
      <div className="p-8 text-center text-muted-foreground">
        <p className="font-bold">Access denied</p>
        <p className="text-sm mt-1">This page is only available to admins.</p>
      </div>
    );
  }

  const queryParams = new URLSearchParams();
  if (statusFilter !== "all") queryParams.set("status", statusFilter);
  if (userFilter) queryParams.set("userId", userFilter);
  const queryString = queryParams.toString();

  const { data: requests = [], isLoading } = useQuery<LeaveRow[]>({
    queryKey: ["/api/leave/all", statusFilter, userFilter],
    queryFn: () => api(`/api/leave/all${queryString ? `?${queryString}` : ""}`),
  });

  const { data: users = [] } = useQuery<UserOption[]>({
    queryKey: ["/api/leave/users"],
    queryFn: () => api("/api/leave/users"),
  });

  const resolve = useMutation({
    mutationFn: ({ id, status, managerNote }: { id: number; status: "approved" | "rejected"; managerNote?: string }) =>
      api(`/api/leave/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, ...(managerNote ? { managerNote } : {}) }),
      }),
    onSuccess: (_d, { id, status }) => {
      qc.invalidateQueries({ queryKey: ["/api/leave/all"] });
      qc.invalidateQueries({ queryKey: ["/api/leave/pending"] });
      setNotes((prev) => { const n = { ...prev }; delete n[id]; return n; });
      toast({ title: status === "approved" ? "Leave approved — attendance updated" : "Leave request rejected" });
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const pendingCount = requests.filter((r) => r.status === "pending").length;

  return (
    <div className="p-4 space-y-5 pb-24">
      <div className="pt-2">
        <div className="flex items-center gap-2">
          <Inbox className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-black">Leave Inbox</h1>
          {pendingCount > 0 && (
            <span className="ml-1 px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 text-xs font-bold">
              {pendingCount} pending
            </span>
          )}
        </div>
        <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold mt-0.5">
          All leave requests · Company-wide
        </p>
      </div>

      {/* Status filter tabs */}
      <div className="flex gap-1 bg-muted/50 border border-border rounded-full p-0.5 overflow-x-auto">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.value}
            onClick={() => setStatusFilter(tab.value)}
            className={cn(
              "flex-1 px-3 py-1.5 rounded-full text-[11px] font-bold uppercase tracking-wider transition-all whitespace-nowrap",
              statusFilter === tab.value
                ? "bg-background shadow text-foreground"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* User filter */}
      <div>
        <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block mb-1">
          Filter by worker
        </label>
        <select
          value={userFilter}
          onChange={(e) => setUserFilter(e.target.value)}
          className="w-full h-10 px-3 rounded-lg border-2 border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
        >
          <option value="">All workers</option>
          {users.map((u) => (
            <option key={u.id} value={String(u.id)}>{u.username}</option>
          ))}
        </select>
      </div>

      {/* Results */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-24 w-full rounded-xl" />)}
        </div>
      ) : requests.length === 0 ? (
        <div className="text-center py-16 px-4 bg-muted/30 rounded-xl border border-dashed">
          <Inbox className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
          <p className="font-semibold text-muted-foreground">No leave requests</p>
          <p className="text-sm text-muted-foreground mt-1">
            {statusFilter !== "all" ? `No ${statusFilter} requests match your filters.` : "No requests have been submitted yet."}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {requests.map((r) => (
            <div key={r.id} className={cn("rounded-xl border-2 bg-card p-4 space-y-3", cardBorders[r.status])}>
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  {r.type === "sick"
                    ? <Heart className="h-4 w-4 text-rose-500 flex-shrink-0" />
                    : <Plane className="h-4 w-4 text-sky-500 flex-shrink-0" />}
                  <div className="min-w-0">
                    <p className="font-bold text-sm truncate">{r.username}</p>
                    <p className="text-xs text-muted-foreground capitalize">{r.type}</p>
                  </div>
                </div>
                <span className={cn("text-[10px] font-bold uppercase px-2 py-0.5 rounded-full flex-shrink-0", statusColors[r.status])}>
                  {r.status}
                </span>
              </div>

              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span className="font-semibold text-foreground">
                  {fmtDate(r.startDate)}{r.startDate !== r.endDate ? ` → ${fmtDate(r.endDate)}` : ""}
                </span>
                <span>Submitted {fmtDateTime(r.createdAt)}</span>
              </div>

              {r.managerNote && (
                <p className="text-xs text-muted-foreground bg-muted/50 rounded-lg px-2.5 py-2 italic">
                  "{r.managerNote}"
                </p>
              )}

              {r.status === "pending" && (
                <div className="space-y-2 pt-1 border-t border-border/50">
                  <textarea
                    value={notes[r.id] ?? ""}
                    onChange={(e) => setNotes((prev) => ({ ...prev, [r.id]: e.target.value }))}
                    placeholder="Optional note to worker…"
                    rows={2}
                    className="w-full px-3 py-2 rounded-lg border border-input bg-background text-xs resize-none focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1 h-9 border-red-200 text-red-600 hover:bg-red-50 font-bold text-xs"
                      disabled={resolve.isPending}
                      onClick={() => resolve.mutate({ id: r.id, status: "rejected", managerNote: notes[r.id] })}
                    >
                      <XCircle className="h-3.5 w-3.5 mr-1" /> Reject
                    </Button>
                    <Button
                      size="sm"
                      className="flex-1 h-9 bg-green-600 hover:bg-green-700 font-bold text-xs"
                      disabled={resolve.isPending}
                      onClick={() => resolve.mutate({ id: r.id, status: "approved", managerNote: notes[r.id] })}
                    >
                      <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Approve
                    </Button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
