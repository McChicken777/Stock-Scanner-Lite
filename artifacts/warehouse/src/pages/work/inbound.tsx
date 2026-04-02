import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/auth";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  PackageCheck, Truck, Warehouse, Factory, Clock, ChevronRight, Trash2, MapPin, Wrench, Plus,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface InboundRecord {
  id: number;
  projectId: number | null;
  projectName: string | null;
  status: "expected" | "arrived" | "stored" | "in_production";
  locationId: string | null;
  locationName: string | null;
  assignedProcedure: string | null;
  receivedAt: string | null;
  notes: string | null;
  companyId: number;
  createdAt: string;
}

interface Location {
  id: string;
  description: string | null;
}

async function fetchInbound(): Promise<InboundRecord[]> {
  const res = await fetch("/api/inbound", { credentials: "include" });
  if (!res.ok) throw new Error("Failed to load inbound");
  return res.json();
}

async function fetchLocations(): Promise<Location[]> {
  const res = await fetch("/api/locations", { credentials: "include" });
  if (!res.ok) throw new Error("Failed to load locations");
  return res.json();
}

const statusConfig = {
  expected: { label: "Expected", icon: Clock, color: "text-blue-600 bg-blue-50 border-blue-200" },
  arrived: { label: "Arrived – Needs Routing", icon: Truck, color: "text-orange-600 bg-orange-50 border-orange-200" },
  stored: { label: "Stored", icon: Warehouse, color: "text-green-600 bg-green-50 border-green-200" },
  in_production: { label: "In Production", icon: Factory, color: "text-purple-600 bg-purple-50 border-purple-200" },
};

function InboundCard({
  record,
  onArrive,
  onRoute,
  onDelete,
  isAdmin,
}: {
  record: InboundRecord;
  onArrive: (id: number) => void;
  onRoute: (record: InboundRecord) => void;
  onDelete: (id: number) => void;
  isAdmin: boolean;
}) {
  const cfg = statusConfig[record.status];
  const Icon = cfg.icon;

  return (
    <div className={`bg-card rounded-xl border-2 p-4 space-y-3 ${record.status === "arrived" ? "border-orange-300" : "border-border"}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="font-bold text-base leading-tight truncate">
            {record.projectName ?? "Manual Entry"}
          </p>
          {record.notes && (
            <p className="text-xs text-muted-foreground mt-0.5 truncate">{record.notes}</p>
          )}
        </div>
        <span className={cn("flex items-center gap-1 text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border whitespace-nowrap", cfg.color)}>
          <Icon className="h-3 w-3" />
          {cfg.label}
        </span>
      </div>

      {record.status === "stored" && record.locationName && (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <MapPin className="h-3.5 w-3.5" />
          <span className="font-medium">{record.locationName || record.locationId}</span>
        </div>
      )}
      {record.status === "in_production" && record.assignedProcedure && (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Wrench className="h-3.5 w-3.5" />
          <span className="font-medium">{record.assignedProcedure}</span>
        </div>
      )}
      {record.receivedAt && (
        <p className="text-xs text-muted-foreground">
          Received: {new Date(record.receivedAt).toLocaleDateString()}
        </p>
      )}

      <div className="flex gap-2 pt-1">
        {record.status === "expected" && (
          <Button
            size="sm"
            className="flex-1 h-10 font-bold bg-blue-600 hover:bg-blue-700 text-white"
            onClick={() => onArrive(record.id)}
          >
            <Truck className="h-4 w-4 mr-1.5" /> Unload Pallet
          </Button>
        )}
        {record.status === "arrived" && (
          <Button
            size="sm"
            className="flex-1 h-10 font-bold bg-orange-500 hover:bg-orange-600 text-white"
            onClick={() => onRoute(record)}
          >
            <ChevronRight className="h-4 w-4 mr-1.5" /> Route
          </Button>
        )}
        {isAdmin && (
          <Button
            size="sm"
            variant="outline"
            className="h-10 w-10 p-0 text-destructive hover:text-destructive hover:bg-destructive/10 border-destructive/20"
            onClick={() => {
              if (confirm("Delete this inbound record?")) onDelete(record.id);
            }}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
}

function Section({
  title,
  icon: Icon,
  records,
  onArrive,
  onRoute,
  onDelete,
  isAdmin,
  emptyText,
}: {
  title: string;
  icon: React.ElementType;
  records: InboundRecord[];
  onArrive: (id: number) => void;
  onRoute: (record: InboundRecord) => void;
  onDelete: (id: number) => void;
  isAdmin: boolean;
  emptyText: string;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 px-1">
        <Icon className="h-4 w-4 text-muted-foreground" />
        <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">{title}</h2>
        <span className="ml-auto text-xs font-bold text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
          {records.length}
        </span>
      </div>
      {records.length === 0 ? (
        <div className="text-center py-6 text-xs text-muted-foreground bg-muted/20 rounded-xl border border-dashed">
          {emptyText}
        </div>
      ) : (
        <div className="space-y-2">
          {records.map((r) => (
            <InboundCard
              key={r.id}
              record={r}
              onArrive={onArrive}
              onRoute={onRoute}
              onDelete={onDelete}
              isAdmin={isAdmin}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function InboundPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const isAdmin = user?.role === "admin";

  const [routeRecord, setRouteRecord] = useState<InboundRecord | null>(null);
  const [routeDest, setRouteDest] = useState<"store" | "production">("store");
  const [routeLocation, setRouteLocation] = useState("");
  const [routeProcedure, setRouteProcedure] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [newNotes, setNewNotes] = useState("");

  const { data: inbound = [], isLoading } = useQuery({
    queryKey: ["/api/inbound"],
    queryFn: fetchInbound,
    refetchInterval: 30000,
  });

  const { data: locations = [] } = useQuery({
    queryKey: ["/api/locations"],
    queryFn: fetchLocations,
    enabled: !!routeRecord && routeDest === "store",
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["/api/inbound"] });

  const arriveMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/inbound/${id}/arrive`, {
        method: "PUT", credentials: "include",
        headers: { "Content-Type": "application/json" },
      });
      if (!res.ok) throw new Error("Failed");
    },
    onSuccess: () => { invalidate(); toast({ title: "Pallet marked as arrived" }); },
    onError: () => toast({ title: "Failed to update", variant: "destructive" }),
  });

  const routeMutation = useMutation({
    mutationFn: async ({ id, destination, locationId, assignedProcedure }: {
      id: number; destination: "store" | "production"; locationId?: string; assignedProcedure?: string;
    }) => {
      const res = await fetch(`/api/inbound/${id}/route`, {
        method: "PUT", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ destination, locationId, assignedProcedure }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || "Failed");
      }
    },
    onSuccess: () => {
      invalidate();
      setRouteRecord(null);
      setRouteLocation("");
      setRouteProcedure("");
      toast({ title: "Pallet routed successfully" });
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await fetch(`/api/inbound/${id}`, { method: "DELETE", credentials: "include" });
    },
    onSuccess: () => { invalidate(); toast({ title: "Record deleted" }); },
    onError: () => toast({ title: "Failed to delete", variant: "destructive" }),
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/inbound", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes: newNotes || undefined }),
      });
      if (!res.ok) throw new Error("Failed");
    },
    onSuccess: () => {
      invalidate();
      setCreateOpen(false);
      setNewNotes("");
      toast({ title: "Inbound record created" });
    },
    onError: () => toast({ title: "Failed to create", variant: "destructive" }),
  });

  const expected = inbound.filter((r) => r.status === "expected");
  const arrived = inbound.filter((r) => r.status === "arrived");
  const processed = inbound.filter((r) => r.status === "stored" || r.status === "in_production");

  const handleRoute = () => {
    if (!routeRecord) return;
    if (routeDest === "store" && !routeLocation) {
      toast({ title: "Select a location", variant: "destructive" });
      return;
    }
    if (routeDest === "production" && !routeProcedure.trim()) {
      toast({ title: "Enter a procedure name", variant: "destructive" });
      return;
    }
    routeMutation.mutate({
      id: routeRecord.id,
      destination: routeDest,
      locationId: routeDest === "store" ? routeLocation : undefined,
      assignedProcedure: routeDest === "production" ? routeProcedure.trim() : undefined,
    });
  };

  return (
    <div className="flex flex-col min-h-full">
      <div className="bg-secondary text-secondary-foreground p-4 sticky top-0 z-20 shadow-sm flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Inbound</h1>
          <p className="text-xs opacity-70">Pallet arrivals &amp; routing</p>
        </div>
        {isAdmin && (
          <Button
            size="sm"
            variant="secondary"
            className="font-bold gap-1 bg-secondary-foreground/10 hover:bg-secondary-foreground/20 text-secondary-foreground"
            onClick={() => setCreateOpen(true)}
          >
            <Plus className="h-4 w-4" /> Add
          </Button>
        )}
      </div>

      <div className="p-4 space-y-6 pb-24">
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-28 w-full rounded-xl" />)}
          </div>
        ) : (
          <>
            {/* Arrived section first — needs attention */}
            {arrived.length > 0 && (
              <div className="bg-orange-50 border-2 border-orange-200 rounded-xl p-4 space-y-2">
                <div className="flex items-center gap-2 mb-1">
                  <Truck className="h-5 w-5 text-orange-600" />
                  <h2 className="text-sm font-bold text-orange-700 uppercase tracking-wider">Needs Routing</h2>
                  <span className="ml-auto bg-orange-200 text-orange-800 text-xs font-bold px-2 py-0.5 rounded-full">{arrived.length}</span>
                </div>
                {arrived.map((r) => (
                  <InboundCard
                    key={r.id}
                    record={r}
                    onArrive={arriveMutation.mutate}
                    onRoute={setRouteRecord}
                    onDelete={deleteMutation.mutate}
                    isAdmin={isAdmin}
                  />
                ))}
              </div>
            )}

            <Section
              title="Expected"
              icon={Clock}
              records={expected}
              onArrive={arriveMutation.mutate}
              onRoute={setRouteRecord}
              onDelete={deleteMutation.mutate}
              isAdmin={isAdmin}
              emptyText="No pallets expected"
            />

            <Section
              title="Stored / In Production"
              icon={PackageCheck}
              records={processed}
              onArrive={arriveMutation.mutate}
              onRoute={setRouteRecord}
              onDelete={deleteMutation.mutate}
              isAdmin={isAdmin}
              emptyText="No processed pallets"
            />
          </>
        )}
      </div>

      {/* Route Dialog */}
      <Dialog open={!!routeRecord} onOpenChange={(o) => { if (!o) setRouteRecord(null); }}>
        <DialogContent className="w-[90vw] max-w-sm rounded-xl">
          <DialogHeader>
            <DialogTitle>Route Pallet</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground font-medium">
              {routeRecord?.projectName ?? "Manual pallet"}
            </p>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setRouteDest("store")}
                className={cn(
                  "h-14 rounded-xl border-2 font-bold text-sm transition-all flex flex-col items-center justify-center gap-1",
                  routeDest === "store"
                    ? "border-green-500 bg-green-50 text-green-700"
                    : "border-border bg-muted/30 text-muted-foreground"
                )}
              >
                <Warehouse className="h-5 w-5" />
                Store
              </button>
              <button
                type="button"
                onClick={() => setRouteDest("production")}
                className={cn(
                  "h-14 rounded-xl border-2 font-bold text-sm transition-all flex flex-col items-center justify-center gap-1",
                  routeDest === "production"
                    ? "border-purple-500 bg-purple-50 text-purple-700"
                    : "border-border bg-muted/30 text-muted-foreground"
                )}
              >
                <Factory className="h-5 w-5" />
                Production
              </button>
            </div>

            {routeDest === "store" && (
              <div className="space-y-2">
                <label className="text-sm font-bold">Select Location</label>
                {locations.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No locations configured.</p>
                ) : (
                  <div className="space-y-1.5 max-h-48 overflow-y-auto">
                    {locations.map((loc) => (
                      <button
                        key={loc.id}
                        type="button"
                        onClick={() => setRouteLocation(loc.id)}
                        className={cn(
                          "w-full text-left px-3 py-2.5 rounded-lg border-2 text-sm font-medium transition-all",
                          routeLocation === loc.id
                            ? "border-green-500 bg-green-50 text-green-700"
                            : "border-border bg-card hover:border-primary/50"
                        )}
                      >
                        <span className="font-bold">{loc.id}</span>
                        {loc.description && <span className="text-muted-foreground ml-2">{loc.description}</span>}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {routeDest === "production" && (
              <div className="space-y-2">
                <label className="text-sm font-bold">Procedure / Process</label>
                <input
                  type="text"
                  value={routeProcedure}
                  onChange={(e) => setRouteProcedure(e.target.value)}
                  placeholder="e.g. Sandblasting, CNC, Welding..."
                  className="w-full px-3 py-2.5 h-11 border-2 border-border rounded-lg text-sm bg-background outline-none focus:border-primary"
                />
              </div>
            )}

            <Button
              className="w-full h-12 font-bold"
              onClick={handleRoute}
              disabled={routeMutation.isPending}
            >
              {routeMutation.isPending ? "Routing…" : routeDest === "store" ? "Send to Storage" : "Send to Production"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Create manual inbound */}
      {isAdmin && (
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogContent className="w-[90vw] max-w-sm rounded-xl">
            <DialogHeader>
              <DialogTitle>Add Inbound Record</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Create an inbound record for a pallet not linked to a project.
              </p>
              <div className="space-y-1.5">
                <label className="text-sm font-bold">Notes (optional)</label>
                <input
                  type="text"
                  value={newNotes}
                  onChange={(e) => setNewNotes(e.target.value)}
                  placeholder="e.g. Supplier X, PO #12345"
                  className="w-full px-3 py-2.5 h-11 border-2 border-border rounded-lg text-sm bg-background outline-none focus:border-primary"
                />
              </div>
              <Button
                className="w-full h-12 font-bold"
                onClick={() => createMutation.mutate()}
                disabled={createMutation.isPending}
              >
                <PackageCheck className="h-4 w-4 mr-2" /> Create Inbound Record
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
