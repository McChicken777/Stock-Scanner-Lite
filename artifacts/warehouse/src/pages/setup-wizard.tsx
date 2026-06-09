import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { X, Plus, Loader2, ChevronLeft, CheckCircle2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

// ── Types ─────────────────────────────────────────────────────────────────────

type Station = { name: string; color: string };

// ── Presets ───────────────────────────────────────────────────────────────────

const INDUSTRIES = [
  {
    id: "metal",
    emoji: "🔧",
    name: "Metal Fabrication",
    desc: "Cutting, CNC, welding, grinding, paint",
    stations: [
      { name: "Cutting", color: "#ef4444" },
      { name: "CNC", color: "#8b5cf6" },
      { name: "Welding", color: "#f59e0b" },
      { name: "Grinding", color: "#6b7280" },
      { name: "Assembly", color: "#3b82f6" },
      { name: "Paint", color: "#ec4899" },
      { name: "QC", color: "#10b981" },
    ],
    roles: ["Welder", "CNC Operator", "Painter", "Grinder", "Assembler"],
  },
  {
    id: "woodworking",
    emoji: "🪚",
    name: "Woodworking",
    desc: "Cutting, routing, sanding, finishing",
    stations: [
      { name: "Cutting", color: "#ef4444" },
      { name: "CNC/Routing", color: "#8b5cf6" },
      { name: "Sanding", color: "#d97706" },
      { name: "Assembly", color: "#3b82f6" },
      { name: "Finishing", color: "#ec4899" },
      { name: "QC", color: "#10b981" },
    ],
    roles: ["Carpenter", "CNC Operator", "Finisher", "Assembler"],
  },
  {
    id: "cnc",
    emoji: "⚙️",
    name: "CNC Machining",
    desc: "Turning, milling, deburring",
    stations: [
      { name: "Sawing", color: "#ef4444" },
      { name: "CNC Turning", color: "#8b5cf6" },
      { name: "CNC Milling", color: "#6366f1" },
      { name: "Deburring", color: "#6b7280" },
      { name: "QC", color: "#10b981" },
    ],
    roles: ["CNC Operator", "Machinist", "Quality Inspector"],
  },
  {
    id: "welding",
    emoji: "🔥",
    name: "Welding Shop",
    desc: "Cutting, prep, welding, paint",
    stations: [
      { name: "Cutting", color: "#ef4444" },
      { name: "Prep/Grinding", color: "#6b7280" },
      { name: "Welding", color: "#f59e0b" },
      { name: "Paint", color: "#ec4899" },
      { name: "QC", color: "#10b981" },
    ],
    roles: ["Welder", "Fabricator", "Painter"],
  },
  {
    id: "electronics",
    emoji: "🔌",
    name: "Electronics",
    desc: "PCB assembly, soldering, testing",
    stations: [
      { name: "PCB Assembly", color: "#3b82f6" },
      { name: "Soldering", color: "#f59e0b" },
      { name: "Testing", color: "#10b981" },
      { name: "Packaging", color: "#6b7280" },
    ],
    roles: ["Technician", "Tester", "Assembler"],
  },
  {
    id: "general",
    emoji: "🏭",
    name: "General Manufacturing",
    desc: "Cutting, assembly, QC, packaging",
    stations: [
      { name: "Cutting", color: "#ef4444" },
      { name: "Assembly", color: "#3b82f6" },
      { name: "QC", color: "#10b981" },
      { name: "Packaging", color: "#6b7280" },
    ],
    roles: ["Machine Operator", "Assembler", "Quality Inspector"],
  },
];

const PALETTE = [
  "#ef4444", "#f97316", "#f59e0b", "#eab308", "#10b981",
  "#3b82f6", "#8b5cf6", "#ec4899", "#6b7280", "#6366f1",
];

// ── API helper ────────────────────────────────────────────────────────────────

async function apiFetch(url: string, opts?: RequestInit) {
  const res = await fetch(url, { credentials: "include", ...opts });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `HTTP ${res.status}`);
  }
  return res.json();
}

// ── Sub-step components ───────────────────────────────────────────────────────

function StepIndustry({ onSelect, onCustom }: { onSelect: (id: string) => void; onCustom: () => void }) {
  return (
    <div>
      <h2 className="text-lg font-semibold mb-1">What kind of shop are you?</h2>
      <p className="text-sm text-muted-foreground mb-5">
        We'll pre-configure workstations and roles — you can edit everything next.
      </p>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {INDUSTRIES.map((ind) => (
          <button
            key={ind.id}
            onClick={() => onSelect(ind.id)}
            className="flex flex-col items-start gap-2 p-4 rounded-lg border border-border hover:border-primary hover:bg-primary/5 text-left transition-colors"
          >
            <span className="text-2xl">{ind.emoji}</span>
            <div>
              <p className="font-medium text-sm">{ind.name}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{ind.desc}</p>
            </div>
          </button>
        ))}
        <button
          onClick={onCustom}
          className="flex flex-col items-start gap-2 p-4 rounded-lg border border-dashed border-border hover:border-primary hover:bg-primary/5 text-left transition-colors"
        >
          <span className="text-2xl">✏️</span>
          <div>
            <p className="font-medium text-sm">Custom</p>
            <p className="text-xs text-muted-foreground mt-0.5">Start from scratch</p>
          </div>
        </button>
      </div>
    </div>
  );
}

function StepStations({
  stations, newStation, setNewStation, onAdd, onRemove, onColorChange,
}: {
  stations: Station[];
  newStation: string;
  setNewStation: (v: string) => void;
  onAdd: () => void;
  onRemove: (i: number) => void;
  onColorChange: (i: number, color: string) => void;
}) {
  return (
    <div>
      <h2 className="text-lg font-semibold mb-1">Workstations / Processes</h2>
      <p className="text-sm text-muted-foreground mb-5">
        These are the stations on your shop floor. Workers will pick up jobs at these queues.
      </p>

      <div className="space-y-2 mb-4">
        {stations.length === 0 && (
          <p className="text-sm text-muted-foreground italic">No stations yet — add one below.</p>
        )}
        {stations.map((s, i) => (
          <div key={i} className="flex items-center gap-3 p-3 rounded-lg border border-border bg-muted/30">
            {/* Color picker row */}
            <div className="flex items-center gap-1">
              {PALETTE.map((c) => (
                <button
                  key={c}
                  title={c}
                  onClick={() => onColorChange(i, c)}
                  className="w-4 h-4 rounded-full border-2 transition-transform hover:scale-110 shrink-0"
                  style={{
                    background: c,
                    borderColor: s.color === c ? "white" : "transparent",
                    outline: s.color === c ? `2px solid ${c}` : "none",
                  }}
                />
              ))}
            </div>
            <span
              className="w-3 h-3 rounded-full shrink-0"
              style={{ background: s.color }}
            />
            <span className="flex-1 text-sm font-medium">{s.name}</span>
            <button onClick={() => onRemove(i)} className="text-muted-foreground hover:text-destructive p-1 rounded transition-colors">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>

      <div className="flex gap-2">
        <Input
          placeholder="Add a workstation..."
          value={newStation}
          onChange={(e) => setNewStation(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && onAdd()}
          className="flex-1"
        />
        <Button variant="outline" onClick={onAdd} size="sm">
          <Plus className="h-4 w-4 mr-1" /> Add
        </Button>
      </div>
    </div>
  );
}

function StepRoles({
  roles, newRole, setNewRole, onAdd, onRemove,
}: {
  roles: string[];
  newRole: string;
  setNewRole: (v: string) => void;
  onAdd: () => void;
  onRemove: (i: number) => void;
}) {
  return (
    <div>
      <h2 className="text-lg font-semibold mb-1">Worker Roles</h2>
      <p className="text-sm text-muted-foreground mb-5">
        Roles let you assign workers to stations and control who sees what jobs.
      </p>

      <div className="space-y-2 mb-4">
        {roles.length === 0 && (
          <p className="text-sm text-muted-foreground italic">No roles yet — add one below.</p>
        )}
        {roles.map((r, i) => (
          <div key={i} className="flex items-center gap-3 p-3 rounded-lg border border-border bg-muted/30">
            <div className="w-7 h-7 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold shrink-0">
              {r[0]?.toUpperCase()}
            </div>
            <span className="flex-1 text-sm font-medium">{r}</span>
            <button onClick={() => onRemove(i)} className="text-muted-foreground hover:text-destructive p-1 rounded transition-colors">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>

      <div className="flex gap-2">
        <Input
          placeholder="Add a role (e.g. Welder, Painter...)"
          value={newRole}
          onChange={(e) => setNewRole(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && onAdd()}
          className="flex-1"
        />
        <Button variant="outline" onClick={onAdd} size="sm">
          <Plus className="h-4 w-4 mr-1" /> Add
        </Button>
      </div>
    </div>
  );
}

function StepTemplate({ templateName, onChange }: { templateName: string; onChange: (v: string) => void }) {
  return (
    <div>
      <h2 className="text-lg font-semibold mb-1">Create your first job template</h2>
      <p className="text-sm text-muted-foreground mb-5">
        Templates define the steps for a type of job — e.g. "Steel Bracket" or "Custom Cabinet".
        You'll add step details in the Templates page. Skip if you want to set this up later.
      </p>
      <Input
        placeholder="Template name (e.g. Steel Bracket, Custom Cabinet...)"
        value={templateName}
        onChange={(e) => onChange(e.target.value)}
        className="text-base"
        autoFocus
      />
      <p className="text-xs text-muted-foreground mt-2">Leave blank to skip</p>
    </div>
  );
}

function StepCustomer({ name, email, onNameChange, onEmailChange }: {
  name: string; email: string;
  onNameChange: (v: string) => void;
  onEmailChange: (v: string) => void;
}) {
  return (
    <div>
      <h2 className="text-lg font-semibold mb-1">Add your first customer</h2>
      <p className="text-sm text-muted-foreground mb-5">
        Customers are linked to jobs and quotes. Skip if you want to set this up later.
      </p>
      <div className="space-y-3">
        <div>
          <label className="text-sm font-medium mb-1 block">Company / Customer name</label>
          <Input
            placeholder="e.g. Acme Engineering"
            value={name}
            onChange={(e) => onNameChange(e.target.value)}
            autoFocus
          />
        </div>
        <div>
          <label className="text-sm font-medium mb-1 block">Email <span className="text-muted-foreground font-normal">(optional)</span></label>
          <Input
            type="email"
            placeholder="contact@acme.com"
            value={email}
            onChange={(e) => onEmailChange(e.target.value)}
          />
        </div>
      </div>
      <p className="text-xs text-muted-foreground mt-3">Leave blank to skip</p>
    </div>
  );
}

// ── Main wizard ───────────────────────────────────────────────────────────────

interface Props { onComplete: () => void; onDismiss: () => void; }

export function SetupWizard({ onComplete, onDismiss }: Props) {
  const { toast } = useToast();
  const qc = useQueryClient();

  const [step, setStep] = useState(0);
  const [stations, setStations] = useState<Station[]>([]);
  const [roles, setRoles] = useState<string[]>([]);
  const [templateName, setTemplateName] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [newStation, setNewStation] = useState("");
  const [newRole, setNewRole] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const TOTAL = 5;

  function selectIndustry(id: string) {
    const ind = INDUSTRIES.find((i) => i.id === id)!;
    setStations([...ind.stations]);
    setRoles([...ind.roles]);
    setStep(1);
  }

  function removeStation(idx: number) { setStations((p) => p.filter((_, i) => i !== idx)); }
  function addStation() {
    const name = newStation.trim();
    if (!name) return;
    setStations((p) => [...p, { name, color: PALETTE[p.length % PALETTE.length] }]);
    setNewStation("");
  }
  function changeStationColor(idx: number, color: string) {
    setStations((p) => p.map((s, i) => (i === idx ? { ...s, color } : s)));
  }

  function removeRole(idx: number) { setRoles((p) => p.filter((_, i) => i !== idx)); }
  function addRole() {
    const name = newRole.trim();
    if (!name) return;
    setRoles((p) => [...p, name]);
    setNewRole("");
  }

  async function finish() {
    setSubmitting(true);
    try {
      for (const s of stations) {
        await apiFetch("/api/stations/types", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: s.name, color: s.color }),
        });
      }
      for (const r of roles) {
        await apiFetch("/api/tasks/roles", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: r }),
        });
      }
      if (templateName.trim()) {
        await apiFetch("/api/work/templates", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: templateName.trim() }),
        });
      }
      if (customerName.trim()) {
        await apiFetch("/api/customers", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: customerName.trim(),
            email: customerEmail.trim() || null,
          }),
        });
      }
      await qc.invalidateQueries();
      toast({ title: "Workspace ready!", description: "You're all set. Start creating jobs." });
      onComplete();
    } catch (err: any) {
      toast({ title: "Setup failed", description: err.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  }

  const stepLabels = ["Industry", "Workstations", "Roles", "Template", "Customer"];

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
      <div className="bg-background w-full max-w-2xl rounded-xl shadow-2xl flex flex-col max-h-[90dvh] overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-6 pb-4 shrink-0">
          <div>
            <h1 className="text-xl font-semibold">Quick Setup</h1>
            <p className="text-sm text-muted-foreground">
              {step + 1} / {TOTAL} — {stepLabels[step]}
            </p>
          </div>
          {step > 0 && (
            <button
              onClick={onDismiss}
              className="text-muted-foreground hover:text-foreground p-1.5 rounded-md hover:bg-muted transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Progress */}
        <div className="px-6 pb-4 shrink-0">
          <div className="flex gap-1.5">
            {stepLabels.map((label, i) => (
              <div
                key={label}
                className="h-1.5 flex-1 rounded-full transition-colors"
                style={{ background: i <= step ? "hsl(var(--primary))" : "hsl(var(--muted))" }}
              />
            ))}
          </div>
        </div>

        {/* Divider */}
        <div className="border-t shrink-0" />

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6">
          {step === 0 && (
            <StepIndustry onSelect={selectIndustry} onCustom={() => { setStations([]); setRoles([]); setStep(1); }} />
          )}
          {step === 1 && (
            <StepStations
              stations={stations}
              newStation={newStation}
              setNewStation={setNewStation}
              onAdd={addStation}
              onRemove={removeStation}
              onColorChange={changeStationColor}
            />
          )}
          {step === 2 && (
            <StepRoles
              roles={roles}
              newRole={newRole}
              setNewRole={setNewRole}
              onAdd={addRole}
              onRemove={removeRole}
            />
          )}
          {step === 3 && (
            <StepTemplate templateName={templateName} onChange={setTemplateName} />
          )}
          {step === 4 && (
            <StepCustomer
              name={customerName}
              email={customerEmail}
              onNameChange={setCustomerName}
              onEmailChange={setCustomerEmail}
            />
          )}
        </div>

        {/* Footer */}
        {step > 0 && (
          <div className="flex items-center justify-between px-6 py-4 border-t shrink-0 bg-muted/20">
            <Button variant="ghost" size="sm" onClick={() => setStep((s) => s - 1)}>
              <ChevronLeft className="h-4 w-4 mr-1" /> Back
            </Button>
            {step < TOTAL - 1 ? (
              <Button onClick={() => setStep((s) => s + 1)}>
                Continue →
              </Button>
            ) : (
              <Button onClick={finish} disabled={submitting}>
                {submitting
                  ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Setting up...</>
                  : <><CheckCircle2 className="h-4 w-4 mr-2" /> Finish Setup</>}
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default SetupWizard;
