import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { ChevronRight, Layers, Settings2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/contexts/auth";

interface StationType {
  id: number;
  name: string;
  color: string;
  flowOrder: number;
  workstations: { id: number; name: string; isActive: boolean }[];
}

async function fetchTypes(): Promise<StationType[]> {
  const res = await fetch("/api/stations/types", { credentials: "include" });
  if (!res.ok) return [];
  return res.json();
}

export default function QueuesPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  const { data: types = [], isLoading } = useQuery<StationType[]>({
    queryKey: ["/api/stations/types"],
    queryFn: fetchTypes,
  });

  return (
    <div className="p-4 space-y-4 pb-24">
      <div className="flex items-center justify-between pt-2">
        <div>
          <h1 className="text-2xl font-black">Queues</h1>
          <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Station work queues</p>
        </div>
        {isAdmin && (
          <Link href="/admin/stations">
            <button className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground border border-border rounded-lg px-3 py-2">
              <Settings2 className="h-3.5 w-3.5" /> Manage
            </button>
          </Link>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-20 w-full rounded-xl" />)}
        </div>
      ) : types.length === 0 ? (
        <div className="text-center py-16 px-4 bg-muted/30 rounded-xl border border-dashed">
          <Layers className="h-10 w-10 mx-auto mb-3 text-muted-foreground" />
          <p className="font-semibold">No stations set up yet</p>
          {isAdmin && (
            <p className="text-sm text-muted-foreground mt-1">
              Go to <Link href="/admin/stations"><span className="text-primary underline">Production Flow</span></Link> in Settings to add your workstations.
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {types.map((type, idx) => {
            const activeCount = type.workstations.filter((w) => w.isActive).length;
            return (
              <Link key={type.id} href={`/work/queue/${type.id}`}>
                <div className="flex items-center gap-4 bg-card border-2 rounded-xl px-4 py-4 hover:border-primary/40 transition-colors cursor-pointer">
                  <div className="flex items-center justify-center w-10 h-10 rounded-xl flex-shrink-0"
                    style={{ backgroundColor: type.color + "22", border: `2px solid ${type.color}44` }}>
                    <span className="text-lg font-black" style={{ color: type.color }}>{idx + 1}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-base">{type.name}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {activeCount > 0
                        ? `${activeCount} machine${activeCount !== 1 ? "s" : ""} — ${type.workstations.slice(0, 3).map((w) => w.name).join(", ")}${type.workstations.length > 3 ? "…" : ""}`
                        : "No machines configured"}
                    </p>
                  </div>
                  <ChevronRight className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
