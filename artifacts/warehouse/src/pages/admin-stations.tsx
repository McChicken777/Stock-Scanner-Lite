import { useState, useRef } from "react";
import { Link } from "wouter";
import { useLang } from "@/contexts/lang";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Plus, Trash2, Loader2, GripVertical, ChevronDown, ChevronUp,
  Settings2, Monitor, X, Check, Pencil, ChevronRight, HardHat, MapPin,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";

interface Workstation {
  id: number;
  name: string;
  priority: number;
  isActive: boolean;
  notes: string | null;
  stationTypeId: number;
}

interface StationType {
  id: number;
  name: string;
  color: string;
  flowOrder: number;
  roleId: number | null;
  roleName: string | null;
  defaultOutputLocationId: string | null;
  pendingCount: number;
  workstations: Workstation[];
}

interface LocationItem { id: string; description?: string | null }

interface Role {
  id: number;
  name: string;
}

const PRESET_COLORS = [
  "#6366f1", "#3b82f6", "#06b6d4", "#14b8a6",
  "#22c55e", "#eab308", "#f97316", "#ef4444",
  "#ec4899", "#a855f7", "#64748b",
];

async function apiFetch(url: string, opts?: RequestInit) {
  const res = await fetch(url, { credentials: "include", ...opts });
  if (!res.ok) {
    const d = await res.json().catch(() => ({}));
    throw new Error(d.error || "Request failed");
  }
  if (res.status === 204) return null;
  return res.json();
}

export default function AdminStationsPage() {
  const { t } = useLang();
  const { toast } = useToast();
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ["/api/stations/types"] });

  const { data: types = [], isLoading } = useQuery<StationType[]>({
    queryKey: ["/api/stations/types"],
    queryFn: () => apiFetch("/api/stations/types"),
  });

  const { data: roles = [] } = useQuery<Role[]>({
    queryKey: ["/api/tasks/roles"],
    queryFn: () => apiFetch("/api/tasks/roles"),
  });

  const { data: locations = [] } = useQuery<LocationItem[]>({
    queryKey: ["/api/locations"],
    queryFn: () => apiFetch("/api/locations"),
    staleTime: 60_000,
  });

  // New station type form
  const [newTypeName, setNewTypeName] = useState("");
  const [newTypeColor, setNewTypeColor] = useState("#6366f1");
  const [newTypeRoleId, setNewTypeRoleId] = useState<string>("");
  const [newTypeLocationId, setNewTypeLocationId] = useState<string>("");
  const [addingType, setAddingType] = useState(false);

  // Expanded station types
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const toggleExpand = (id: number) =>
    setExpanded((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  // Editing state per type
  const [editingTypeId, setEditingTypeId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [editColor, setEditColor] = useState("");
  const [editRoleId, setEditRoleId] = useState<string>("");
  const [editLocationId, setEditLocationId] = useState<string>("");

  // New workstation form per type
  const [addingWsFor, setAddingWsFor] = useState<number | null>(null);
  const [newWsName, setNewWsName] = useState("");
  const [newWsPriority, setNewWsPriority] = useState(1);

  // Drag-to-reorder
  const dragIdx = useRef<number | null>(null);

  const createTypeMutation = useMutation({
    mutationFn: (data: { name: string; color: string; roleId: number | null; defaultOutputLocationId?: string | null }) =>
      apiFetch("/api/stations/types", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      invalidate();
      setAddingType(false); setNewTypeName(""); setNewTypeColor("#6366f1"); setNewTypeRoleId(""); setNewTypeLocationId("");
      toast({ title: "Station type added" });
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const updateTypeMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: { name?: string; color?: string; roleId?: number | null; defaultOutputLocationId?: string | null } }) =>
      apiFetch(`/api/stations/types/${id}`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }),
    onSuccess: () => { invalidate(); setEditingTypeId(null); },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const deleteTypeMutation = useMutation({
    mutationFn: (id: number) => apiFetch(`/api/stations/types/${id}`, { method: "DELETE" }),
    onSuccess: () => { invalidate(); toast({ title: "Station type deleted" }); },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const createWsMutation = useMutation({
    mutationFn: (data: { stationTypeId: number; name: string; priority: number }) =>
      apiFetch("/api/stations/workstations", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }),
    onSuccess: () => { invalidate(); setAddingWsFor(null); setNewWsName(""); setNewWsPriority(1); toast({ title: "Workstation added" }); },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const updateWsMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: { isActive?: boolean; name?: string; priority?: number } }) =>
      apiFetch(`/api/stations/workstations/${id}`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }),
    onSuccess: () => invalidate(),
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const deleteWsMutation = useMutation({
    mutationFn: (id: number) => apiFetch(`/api/stations/workstations/${id}`, { method: "DELETE" }),
    onSuccess: () => { invalidate(); toast({ title: "Workstation removed" }); },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  function handleDrop(targetIdx: number) {
    const from = dragIdx.current;
    if (from === null || from === targetIdx) return;
    dragIdx.current = null;
    const reordered = [...types];
    const [moved] = reordered.splice(from, 1);
    reordered.splice(targetIdx, 0, moved);
    const order = reordered.map((t, i) => ({ id: t.id, flowOrder: i }));
    apiFetch("/api/stations/types/reorder", {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ order }),
    }).then(invalidate).catch((e: Error) => toast({ title: e.message, variant: "destructive" }));
  }

  function startEdit(type: StationType) {
    setEditingTypeId(type.id);
    setEditName(type.name);
    setEditColor(type.color);
    setEditRoleId(type.roleId != null ? String(type.roleId) : "");
    setEditLocationId(type.defaultOutputLocationId ?? "");
  }

  function saveEdit(id: number) {
    updateTypeMutation.mutate({
      id,
      data: {
        name: editName,
        color: editColor,
        roleId: editRoleId ? Number(editRoleId) : null,
        defaultOutputLocationId: editLocationId || null,
      },
    });
  }

  return (
    <div className="p-4 space-y-4 pb-24">
      <div className="pt-2">
        <h1 className="text-2xl font-black">{t("stationsTitle")}</h1>
        <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold mt-0.5">
          {t("stationsSubtitle")}
        </p>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <div key={i} className="h-16 bg-muted/30 rounded-xl animate-pulse" />)}
        </div>
      ) : (
        <div className="space-y-2">
          {types.map((type, idx) => (
            <div
              key={type.id}
              draggable
              onDragStart={() => { dragIdx.current = idx; }}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => handleDrop(idx)}
              className="rounded-xl border-2 border-border bg-card overflow-hidden"
            >
              {/* Type header */}
              <div className="flex items-center gap-2 p-3">
                <GripVertical className="h-4 w-4 text-muted-foreground cursor-grab flex-shrink-0" />
                <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: type.color }} />

                {editingTypeId === type.id ? (
                  <div className="flex flex-col gap-2 flex-1 min-w-0">
                    {/* Row 1: name + colors */}
                    <div className="flex items-center gap-2">
                      <Input
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="h-7 text-sm border-2 flex-1"
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === "Enter") saveEdit(type.id);
                          if (e.key === "Escape") setEditingTypeId(null);
                        }}
                      />
                      <div className="flex gap-1 flex-shrink-0">
                        {PRESET_COLORS.map((c) => (
                          <button
                            key={c}
                            onClick={() => setEditColor(c)}
                            className="w-4 h-4 rounded-full border-2 flex-shrink-0"
                            style={{ backgroundColor: c, borderColor: editColor === c ? "#000" : "transparent" }}
                          />
                        ))}
                      </div>
                    </div>
                    {/* Row 2: role picker */}
                    <div className="flex items-center gap-2">
                      <HardHat className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                      <select
                        value={editRoleId}
                        onChange={(e) => setEditRoleId(e.target.value)}
                        className="flex-1 h-7 px-2 rounded border border-input bg-background text-xs"
                      >
                        <option value="">No role linked</option>
                        {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                      </select>
                    </div>
                    {/* Row 3: output location + save/cancel */}
                    <div className="flex items-center gap-2">
                      <MapPin className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                      <select
                        value={editLocationId}
                        onChange={(e) => setEditLocationId(e.target.value)}
                        className="flex-1 h-7 px-2 rounded border border-input bg-background text-xs"
                      >
                        <option value="">No default output location</option>
                        {locations.map((l) => <option key={l.id} value={l.id}>{l.id}{l.description ? ` — ${l.description}` : ""}</option>)}
                      </select>
                      <button onClick={() => saveEdit(type.id)} className="text-green-600 hover:text-green-700">
                        <Check className="h-4 w-4" />
                      </button>
                      <button onClick={() => setEditingTypeId(null)} className="text-muted-foreground hover:text-foreground">
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex-1 min-w-0">
                      <span className="font-bold text-sm">{type.name}</span>
                      {type.roleName && (
                        <span className="ml-2 text-[10px] font-semibold text-purple-700 bg-purple-50 border border-purple-200 rounded-full px-1.5 py-0.5 inline-flex items-center gap-0.5">
                          <HardHat className="h-2.5 w-2.5" />{type.roleName}
                        </span>
                      )}
                      {type.defaultOutputLocationId && (
                        <span className="ml-1 text-[10px] font-semibold text-teal-700 bg-teal-50 border border-teal-200 rounded-full px-1.5 py-0.5 inline-flex items-center gap-0.5">
                          <MapPin className="h-2.5 w-2.5" />{type.defaultOutputLocationId}
                        </span>
                      )}
                    </div>
                    {type.pendingCount > 0 ? (
                      <span className="text-[10px] font-bold rounded-full px-2 py-0.5 text-white flex-shrink-0" style={{ backgroundColor: type.color }}>
                        {type.pendingCount}
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground flex-shrink-0">
                        {type.workstations.length} machine{type.workstations.length !== 1 ? "s" : ""}
                      </span>
                    )}
                    <Link href={`/work/queue/${type.id}`}>
                      <button className="text-muted-foreground hover:text-foreground p-1 flex items-center gap-0.5 text-[10px] font-semibold">
                        {t("stationsQueue")} <ChevronRight className="h-3 w-3" />
                      </button>
                    </Link>
                    <button onClick={() => startEdit(type)} className="text-muted-foreground hover:text-foreground p-1">
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button onClick={() => deleteTypeMutation.mutate(type.id)}
                      className="text-muted-foreground hover:text-destructive p-1">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                    <button onClick={() => toggleExpand(type.id)} className="text-muted-foreground hover:text-foreground p-1">
                      {expanded.has(type.id) ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </button>
                  </>
                )}
              </div>

              {/* Workstations (expanded) */}
              {expanded.has(type.id) && (
                <div className="border-t border-border bg-muted/20 px-3 py-2 space-y-1.5">
                  {type.workstations.length === 0 && (
                    <p className="text-xs text-muted-foreground italic pl-6">{t("stationsNoMachines")}</p>
                  )}
                  {type.workstations
                    .slice()
                    .sort((a, b) => a.priority - b.priority)
                    .map((ws) => (
                      <div key={ws.id} className="flex items-center gap-2 bg-white rounded-lg px-3 py-2 border border-border">
                        <Monitor className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                        <span className="text-sm font-medium flex-1">{ws.name}</span>
                        <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">P{ws.priority}</span>
                        <button
                          onClick={() => updateWsMutation.mutate({ id: ws.id, data: { isActive: !ws.isActive } })}
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${ws.isActive ? "bg-green-100 text-green-700 border-green-200" : "bg-muted text-muted-foreground border-border"}`}
                        >
                          {ws.isActive ? t("stationsActive") : t("stationsInactive")}
                        </button>
                        <button onClick={() => deleteWsMutation.mutate(ws.id)}
                          className="text-muted-foreground hover:text-destructive p-0.5">
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}

                  {/* Add workstation inline */}
                  {addingWsFor === type.id ? (
                    <div className="flex items-center gap-2 pl-1">
                      <Input
                        value={newWsName}
                        onChange={(e) => setNewWsName(e.target.value)}
                        placeholder="Machine name — e.g. CNC Machine 2"
                        className="h-8 text-xs border-2 flex-1"
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && newWsName.trim())
                            createWsMutation.mutate({ stationTypeId: type.id, name: newWsName.trim(), priority: newWsPriority });
                          if (e.key === "Escape") { setAddingWsFor(null); setNewWsName(""); }
                        }}
                      />
                      <Input
                        type="number" min={1} value={newWsPriority}
                        onChange={(e) => setNewWsPriority(Math.max(1, Number(e.target.value)))}
                        className="h-8 text-xs border-2 w-16 text-center"
                        placeholder="Priority"
                      />
                      <Button size="sm" className="h-8 px-2" disabled={!newWsName.trim() || createWsMutation.isPending}
                        onClick={() => createWsMutation.mutate({ stationTypeId: type.id, name: newWsName.trim(), priority: newWsPriority })}>
                        {createWsMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                      </Button>
                      <Button size="sm" variant="ghost" className="h-8 px-2"
                        onClick={() => { setAddingWsFor(null); setNewWsName(""); }}>
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  ) : (
                    <button
                      onClick={() => { setAddingWsFor(type.id); setNewWsName(""); setNewWsPriority((type.workstations.length || 0) + 1); }}
                      className="flex items-center gap-1.5 text-xs font-semibold text-primary pl-1 hover:underline"
                    >
                      <Plus className="h-3 w-3" /> {t("stationsAddMachine")}
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}

          {/* Add station type */}
          {addingType ? (
            <div className="rounded-xl border-2 border-dashed border-primary/40 p-4 space-y-3 bg-primary/5">
              <p className="text-sm font-bold">{t("stationsAddType")}</p>
              <Input
                value={newTypeName}
                onChange={(e) => setNewTypeName(e.target.value)}
                placeholder="e.g. CNC, Welding, Tapping…"
                className="h-9 border-2"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter" && newTypeName.trim())
                    createTypeMutation.mutate({ name: newTypeName.trim(), color: newTypeColor, roleId: newTypeRoleId ? Number(newTypeRoleId) : null });
                  if (e.key === "Escape") { setAddingType(false); setNewTypeName(""); }
                }}
              />
              {/* Role picker */}
              <div className="flex items-center gap-2">
                <HardHat className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                <select
                  value={newTypeRoleId}
                  onChange={(e) => setNewTypeRoleId(e.target.value)}
                  className="flex-1 h-9 px-3 rounded-lg border-2 border-input bg-background text-sm"
                >
                  <option value="">No role linked (visible to all)</option>
                  {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
              </div>
              {/* Default output location */}
              <div className="flex items-center gap-2">
                <MapPin className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                <select
                  value={newTypeLocationId}
                  onChange={(e) => setNewTypeLocationId(e.target.value)}
                  className="flex-1 h-9 px-3 rounded-lg border-2 border-input bg-background text-sm"
                >
                  <option value="">No default output location</option>
                  {locations.map((l) => <option key={l.id} value={l.id}>{l.id}{l.description ? ` — ${l.description}` : ""}</option>)}
                </select>
              </div>
              <div className="flex gap-2 flex-wrap">
                {PRESET_COLORS.map((c) => (
                  <button
                    key={c}
                    onClick={() => setNewTypeColor(c)}
                    className="w-7 h-7 rounded-full border-4 transition-all"
                    style={{ backgroundColor: c, borderColor: newTypeColor === c ? "#000" : "transparent" }}
                  />
                ))}
              </div>
              <div className="flex gap-2">
                <Button size="sm" className="h-9 font-bold"
                  disabled={!newTypeName.trim() || createTypeMutation.isPending}
                  onClick={() => createTypeMutation.mutate({ name: newTypeName.trim(), color: newTypeColor, roleId: newTypeRoleId ? Number(newTypeRoleId) : null, defaultOutputLocationId: newTypeLocationId || null })}>
                  {createTypeMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : t("add")}
                </Button>
                <Button size="sm" variant="outline" className="h-9"
                  onClick={() => { setAddingType(false); setNewTypeName(""); setNewTypeRoleId(""); setNewTypeLocationId(""); }}>{t("cancel")}</Button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setAddingType(true)}
              className="w-full flex items-center justify-center gap-2 text-sm font-semibold text-primary border-2 border-dashed border-primary/30 rounded-xl py-3 hover:border-primary/60 hover:bg-primary/5 transition-all"
            >
              <Plus className="h-4 w-4" /> {t("stationsAddType")}
            </button>
          )}
        </div>
      )}

      {/* Empty state */}
      {!isLoading && types.length === 0 && !addingType && (
        <div className="text-center py-12 text-muted-foreground">
          <Settings2 className="h-10 w-10 mx-auto mb-3 opacity-40" />
          <p className="font-semibold">{t("stationsNoSetup")}</p>
          <p className="text-sm mt-1">{t("stationsNoSetupDesc")}</p>
        </div>
      )}
    </div>
  );
}
