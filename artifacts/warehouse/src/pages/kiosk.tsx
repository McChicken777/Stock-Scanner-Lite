import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Loader2, CreditCard, KeyRound, User, Play, CheckCircle2, MapPin, Clock, ChevronRight, X, AlertTriangle, RefreshCw, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { differenceInSeconds } from "date-fns";
import { FabriflowMark } from "@/components/fabriflow-logo";

// ─── Types ────────────────────────────────────────────────────────────────────

interface KioskWorker { id: number; username: string; hasNfc: boolean; hasPin: boolean; }
interface KioskStation { id: number; label: string | null; }
interface Workstation { id: number; name: string; stationTypeId: number; }
interface StationType { id: number; name: string; color: string; }
interface KioskStep {
  stepId: number;
  stepName: string;
  status: "not_started" | "in_progress";
  durationEstimate: number | null;
  itemName: string;
  projectName: string;
  projectDeadline: string;
  projectPriority: string;
  collectFrom: string | null;
  claimedByUsername: string | null;
  startTime: string | null;
  consumesProductId: number | null;
  consumesQuantity: number;
}

interface VerifyResponse {
  kiosk: KioskStation;
  workstation: Workstation | null;
  stationType: StationType | null;
  workers: KioskWorker[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getToken(): string | null {
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(window.location.search);
  const urlToken = params.get("token");
  if (urlToken) {
    localStorage.setItem("kiosk_token", urlToken);
    return urlToken;
  }
  return localStorage.getItem("kiosk_token");
}

function formatDuration(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function urgencyColor(deadline: string, priority: string) {
  const now = new Date();
  const d = new Date(deadline);
  const diffDays = (d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
  if (diffDays < 0 || priority === "urgent") return "text-red-400";
  if (diffDays < 1) return "text-orange-400";
  if (diffDays < 3) return "text-yellow-400";
  return "text-green-400";
}

// ─── NFC hook ─────────────────────────────────────────────────────────────────

function useNfc(onScan: (uid: string) => void, enabled: boolean) {
  const readerRef = useRef<any>(null);
  const [nfcSupported] = useState(() => "NDEFReader" in window);

  useEffect(() => {
    if (!enabled || !nfcSupported) return;
    let active = true;
    async function startScan() {
      try {
        const NDEFReader = (window as any).NDEFReader;
        const reader = new NDEFReader();
        readerRef.current = reader;
        await reader.scan();
        reader.addEventListener("reading", ({ serialNumber }: { serialNumber: string }) => {
          if (active && serialNumber) onScan(serialNumber.toUpperCase());
        });
      } catch { /* NFC not available or denied */ }
    }
    startScan();
    return () => { active = false; };
  }, [enabled, nfcSupported, onScan]);

  return { nfcSupported };
}

// ─── PIN pad ──────────────────────────────────────────────────────────────────

function PinPad({ onSubmit, error, onCancel }: { onSubmit: (pin: string) => void; error?: string; onCancel: () => void }) {
  const [digits, setDigits] = useState("");

  const press = (d: string) => {
    if (digits.length >= 4) return;
    const next = digits + d;
    setDigits(next);
    if (next.length === 4) {
      setTimeout(() => onSubmit(next), 80);
    }
  };

  const del = () => setDigits((p) => p.slice(0, -1));

  return (
    <div className="flex flex-col items-center gap-6">
      <p className="text-white/60 text-sm">Enter your PIN</p>
      <div className="flex gap-3">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className={cn(
              "w-5 h-5 rounded-full border-2 transition-all",
              i < digits.length ? "bg-white border-white" : "bg-transparent border-white/30"
            )}
          />
        ))}
      </div>
      {error && <p className="text-red-400 text-sm">{error}</p>}
      <div className="grid grid-cols-3 gap-3 w-64">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
          <button
            key={d}
            onClick={() => press(d)}
            className="h-16 rounded-2xl bg-white/10 hover:bg-white/20 active:bg-white/30 text-white text-2xl font-bold transition-colors"
          >{d}</button>
        ))}
        <button onClick={onCancel} className="h-16 rounded-2xl bg-white/5 hover:bg-white/10 text-white/40 text-sm transition-colors">
          Cancel
        </button>
        <button onClick={() => press("0")} className="h-16 rounded-2xl bg-white/10 hover:bg-white/20 active:bg-white/30 text-white text-2xl font-bold transition-colors">
          0
        </button>
        <button onClick={del} className="h-16 rounded-2xl bg-white/5 hover:bg-white/10 text-white/60 text-xl transition-colors">
          ⌫
        </button>
      </div>
    </div>
  );
}

// ─── Worker selector ──────────────────────────────────────────────────────────

function WorkerSelector({ workers, onSelect, onCancel }: { workers: KioskWorker[]; onSelect: (id: number) => void; onCancel: () => void }) {
  return (
    <div className="flex flex-col gap-3 w-full max-w-xs">
      <p className="text-white/60 text-sm text-center">Select your name</p>
      <div className="flex flex-col gap-2 max-h-72 overflow-y-auto">
        {workers.map((w) => (
          <button
            key={w.id}
            onClick={() => onSelect(w.id)}
            className="flex items-center gap-3 px-4 py-4 rounded-2xl bg-white/10 hover:bg-white/20 active:bg-white/25 transition-colors text-left"
          >
            <div className="h-9 w-9 rounded-full bg-white/20 flex items-center justify-center text-white font-bold text-sm">
              {w.username[0].toUpperCase()}
            </div>
            <span className="text-white font-semibold text-lg">{w.username}</span>
          </button>
        ))}
      </div>
      <button onClick={onCancel} className="mt-1 text-white/40 text-sm hover:text-white/70 transition-colors">
        Cancel
      </button>
    </div>
  );
}

// ─── Location picker ──────────────────────────────────────────────────────────

function LocationPicker({ onConfirm, onSkip }: { onConfirm: (type: "warehouse" | "zone" | "with_worker", value?: string) => void; onSkip: () => void }) {
  const [type, setType] = useState<"warehouse" | "zone" | "with_worker" | null>(null);
  const [value, setValue] = useState("");

  return (
    <div className="flex flex-col items-center gap-4 w-full max-w-xs">
      <p className="text-white font-bold text-lg text-center">Where is the part going?</p>
      <div className="flex flex-col gap-2 w-full">
        {([
          { key: "warehouse" as const, label: "Warehouse location", hint: "e.g. A-12, Shelf 3" },
          { key: "zone" as const, label: "Production zone", hint: "e.g. Welding Bay" },
          { key: "with_worker" as const, label: "Staying here / with me", hint: "" },
        ]).map((opt) => (
          <button
            key={opt.key}
            onClick={() => setType(opt.key)}
            className={cn(
              "flex flex-col items-start px-4 py-4 rounded-2xl border-2 transition-all text-left",
              type === opt.key ? "border-white bg-white/15" : "border-white/20 bg-white/5 hover:bg-white/10"
            )}
          >
            <span className="text-white font-semibold">{opt.label}</span>
            {opt.hint && <span className="text-white/40 text-xs">{opt.hint}</span>}
          </button>
        ))}
      </div>

      {(type === "warehouse" || type === "zone") && (
        <input
          className="w-full px-4 py-3 rounded-2xl bg-white/10 border border-white/20 text-white placeholder-white/30 text-lg text-center font-semibold focus:outline-none focus:border-white/50"
          placeholder={type === "warehouse" ? "Location code (e.g. B-12)" : "Zone name"}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          autoFocus
        />
      )}

      <div className="flex gap-3 w-full">
        <button
          onClick={onSkip}
          className="flex-1 h-12 rounded-2xl bg-white/5 text-white/50 hover:text-white/70 transition-colors"
        >Skip</button>
        <button
          disabled={!type || ((type === "warehouse" || type === "zone") && !value.trim())}
          onClick={() => type && onConfirm(type, value.trim() || undefined)}
          className="flex-1 h-12 rounded-2xl bg-white text-black font-bold disabled:opacity-30 transition-all hover:bg-white/90"
        >Confirm</button>
      </div>
    </div>
  );
}

// ─── Main kiosk page ──────────────────────────────────────────────────────────

type IdentifyMode = "idle" | "nfc-waiting" | "pin" | "select";
type KioskPhase = "idle" | "working" | "done-location" | "completed";

export default function KioskPage() {
  const [, navigate] = useLocation();
  const token = getToken();
  const queryClient = useQueryClient();

  const [activeWorker, setActiveWorker] = useState<{ id: number; username: string } | null>(null);
  const [activeStepId, setActiveStepId] = useState<number | null>(null);
  const [phase, setPhase] = useState<KioskPhase>("idle");
  const [identifyMode, setIdentifyMode] = useState<IdentifyMode>("idle");
  const [pinError, setPinError] = useState("");
  const [elapsed, setElapsed] = useState(0);
  const [startedAt, setStartedAt] = useState<Date | null>(null);

  // Token missing — show setup screen
  if (!token) {
    return (
      <div className="min-h-[100dvh] bg-zinc-950 flex flex-col items-center justify-center gap-6 p-6">
        <FabriflowMark className="h-12 w-12 text-white/30" />
        <div className="text-center">
          <p className="text-white font-bold text-xl">Kiosk not configured</p>
          <p className="text-white/40 mt-1 text-sm">Scan the QR code from the Owner Panel to set up this tablet.</p>
        </div>
      </div>
    );
  }

  return <KioskMain token={token} />;
}

function KioskMain({ token }: { token: string }) {
  const queryClient = useQueryClient();
  const [activeWorker, setActiveWorker] = useState<{ id: number; username: string } | null>(null);
  const [activeStepId, setActiveStepId] = useState<number | null>(null);
  const [phase, setPhase] = useState<KioskPhase>("idle");
  const [identifyMode, setIdentifyMode] = useState<IdentifyMode>("idle");
  const [pinError, setPinError] = useState("");
  const [elapsed, setElapsed] = useState(0);
  const [startedAt, setStartedAt] = useState<Date | null>(null);
  const [completedMsg, setCompletedMsg] = useState("");

  // ── Verify token ─────────────────────────────────────────────────────────
  const { data: info, isLoading: verifying, isError } = useQuery<VerifyResponse>({
    queryKey: [`/api/kiosk/verify/${token}`],
    queryFn: () => fetch(`/api/kiosk/verify/${token}`).then((r) => {
      if (!r.ok) throw new Error("Invalid token");
      return r.json();
    }),
    retry: 1,
    staleTime: 60_000,
  });

  // ── Queue ─────────────────────────────────────────────────────────────────
  const { data: queueData, refetch: refetchQueue } = useQuery<{ steps: KioskStep[] }>({
    queryKey: [`/api/kiosk/${token}/queue`],
    queryFn: () => fetch(`/api/kiosk/${token}/queue`).then((r) => r.json()),
    enabled: !!info,
    refetchInterval: 30_000,
  });

  const steps = queueData?.steps ?? [];
  const nextStep = steps.find((s) => s.status === "not_started") ?? steps[0] ?? null;
  const inProgressStep = steps.find((s) => s.status === "in_progress" && s.claimedByUsername === activeWorker?.username) ?? null;
  const displayStep = inProgressStep ?? nextStep;

  // ── Elapsed timer ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== "working" || !startedAt) return;
    const t = setInterval(() => setElapsed(differenceInSeconds(new Date(), startedAt)), 1000);
    return () => clearInterval(t);
  }, [phase, startedAt]);

  // Auto-reset after completed message
  useEffect(() => {
    if (phase !== "completed") return;
    const t = setTimeout(() => {
      setPhase("idle");
      setActiveWorker(null);
      setActiveStepId(null);
      setElapsed(0);
      setStartedAt(null);
      setCompletedMsg("");
      refetchQueue();
    }, 3000);
    return () => clearTimeout(t);
  }, [phase, refetchQueue]);

  // ── NFC scanning ─────────────────────────────────────────────────────────
  const handleNfcScan = useCallback((uid: string) => {
    if (identifyMode !== "nfc-waiting") return;
    identifyMutation.mutate({ method: "nfc", cardUid: uid });
  }, [identifyMode]);

  const { nfcSupported } = useNfc(handleNfcScan, identifyMode === "nfc-waiting");

  // ── Mutations ─────────────────────────────────────────────────────────────
  const identifyMutation = useMutation({
    mutationFn: async (body: object) => {
      const r = await fetch(`/api/kiosk/${token}/identify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Failed");
      return d as { worker: { id: number; username: string } };
    },
    onSuccess: ({ worker }) => {
      setActiveWorker(worker);
      setIdentifyMode("idle");
      setPinError("");
    },
    onError: (err) => {
      if (identifyMode === "pin") setPinError(err instanceof Error ? err.message : "Incorrect PIN");
    },
  });

  const startMutation = useMutation({
    mutationFn: async (stepId: number) => {
      const r = await fetch(`/api/kiosk/${token}/steps/${stepId}/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workerId: activeWorker!.id }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Failed");
      return d;
    },
    onSuccess: (_, stepId) => {
      setActiveStepId(stepId);
      setPhase("working");
      setStartedAt(new Date());
      setElapsed(0);
      refetchQueue();
    },
  });

  const completeMutation = useMutation({
    mutationFn: async ({ locationType, locationValue }: { locationType?: "warehouse" | "zone" | "with_worker"; locationValue?: string }) => {
      const r = await fetch(`/api/kiosk/${token}/steps/${activeStepId}/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workerId: activeWorker!.id, locationType, locationValue }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Failed");
      return d;
    },
    onSuccess: ({ durationSeconds }) => {
      setCompletedMsg(`Done in ${formatDuration(durationSeconds)}`);
      setPhase("completed");
      refetchQueue();
    },
  });

  // ── Render states ─────────────────────────────────────────────────────────

  if (verifying) {
    return (
      <div className="min-h-[100dvh] bg-zinc-950 flex items-center justify-center">
        <Loader2 className="h-10 w-10 text-white/30 animate-spin" />
      </div>
    );
  }

  if (isError || !info) {
    return (
      <div className="min-h-[100dvh] bg-zinc-950 flex flex-col items-center justify-center gap-4 p-6">
        <AlertTriangle className="h-10 w-10 text-red-400" />
        <p className="text-white font-bold text-xl text-center">Invalid or revoked kiosk token</p>
        <p className="text-white/40 text-sm text-center">Ask your admin to regenerate the QR code.</p>
        <button
          onClick={() => { localStorage.removeItem("kiosk_token"); window.location.reload(); }}
          className="mt-2 px-6 py-3 rounded-2xl bg-white/10 text-white hover:bg-white/15 transition-colors"
        >
          Clear & retry
        </button>
      </div>
    );
  }

  const { workstation, stationType } = info;
  const stationColor = stationType?.color ?? "#6366f1";

  // ── Completed flash ───────────────────────────────────────────────────────
  if (phase === "completed") {
    return (
      <div className="min-h-[100dvh] bg-zinc-950 flex flex-col items-center justify-center gap-5">
        <div className="h-24 w-24 rounded-full bg-green-500/20 flex items-center justify-center animate-in zoom-in duration-300">
          <CheckCircle2 className="h-12 w-12 text-green-400" />
        </div>
        <p className="text-white font-black text-3xl">Step Complete!</p>
        <p className="text-white/50 text-lg">{completedMsg}</p>
        {activeWorker && <p className="text-white/40 text-sm">Great work, {activeWorker.username}</p>}
      </div>
    );
  }

  // ── Location picker ───────────────────────────────────────────────────────
  if (phase === "done-location") {
    return (
      <div className="min-h-[100dvh] bg-zinc-950 flex flex-col items-center justify-center p-6">
        <LocationPicker
          onConfirm={(type, value) => completeMutation.mutate({ locationType: type, locationValue: value })}
          onSkip={() => completeMutation.mutate({})}
        />
        {completeMutation.isPending && (
          <div className="mt-4"><Loader2 className="h-6 w-6 text-white/40 animate-spin" /></div>
        )}
        {completeMutation.isError && (
          <p className="mt-3 text-red-400 text-sm">{(completeMutation.error as Error).message}</p>
        )}
      </div>
    );
  }

  return (
    <div
      className="min-h-[100dvh] flex flex-col bg-zinc-950 overflow-hidden select-none"
      style={{ fontFamily: "'Inter', sans-serif" }}
    >
      {/* Station header */}
      <div className="px-6 pt-8 pb-4 flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <div className="h-3 w-3 rounded-full" style={{ backgroundColor: stationColor }} />
            <span className="text-white/50 text-xs uppercase tracking-widest font-bold">{stationType?.name ?? "Station"}</span>
          </div>
          <h1 className="text-white font-black text-3xl leading-tight">{workstation?.name ?? info.kiosk.label ?? "Kiosk"}</h1>
        </div>
        {activeWorker && phase === "idle" && (
          <button
            onClick={() => { setActiveWorker(null); setIdentifyMode("idle"); }}
            className="flex items-center gap-2 px-3 py-2 rounded-full bg-white/10 text-white/60 hover:bg-white/15 transition-colors text-sm"
          >
            <div className="h-6 w-6 rounded-full bg-white/20 flex items-center justify-center text-xs font-bold text-white">
              {activeWorker.username[0].toUpperCase()}
            </div>
            {activeWorker.username}
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* Main content */}
      <div className="flex-1 px-6 flex flex-col gap-5 pb-8">

        {/* Task card */}
        {displayStep ? (
          <div
            className="rounded-3xl p-5 flex flex-col gap-4"
            style={{ background: `linear-gradient(135deg, ${stationColor}22 0%, ${stationColor}08 100%)`, border: `1px solid ${stationColor}33` }}
          >
            {/* Collect-from hint */}
            {displayStep.collectFrom && (
              <div className="flex items-center gap-2 bg-yellow-500/10 border border-yellow-500/20 rounded-2xl px-4 py-3">
                <MapPin className="h-4 w-4 text-yellow-400 shrink-0" />
                <div>
                  <p className="text-yellow-300 text-xs font-bold uppercase tracking-wide">Collect first</p>
                  <p className="text-yellow-100 font-semibold">{displayStep.collectFrom}</p>
                </div>
              </div>
            )}

            {/* Step name + project */}
            <div>
              <p className={cn("text-sm font-bold uppercase tracking-wide mb-1", urgencyColor(displayStep.projectDeadline, displayStep.projectPriority))}>
                {displayStep.projectName}
              </p>
              <p className="text-white font-black text-2xl leading-tight">{displayStep.stepName}</p>
              <p className="text-white/50 text-base mt-0.5">{displayStep.itemName}</p>
            </div>

            {/* Meta row */}
            <div className="flex items-center gap-4 text-white/40 text-sm">
              {displayStep.durationEstimate && (
                <span className="flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5" /> ~{displayStep.durationEstimate}min
                </span>
              )}
              {displayStep.status === "in_progress" && displayStep.claimedByUsername && (
                <span className="text-orange-400 font-semibold">In progress by {displayStep.claimedByUsername}</span>
              )}
            </div>
          </div>
        ) : (
          <div className="rounded-3xl border border-white/10 bg-white/3 p-8 flex flex-col items-center justify-center gap-3 min-h-40">
            <CheckCircle2 className="h-10 w-10 text-white/20" />
            <p className="text-white/40 font-semibold">No tasks in queue</p>
            <button onClick={() => queryClient.invalidateQueries({ queryKey: [`/api/kiosk/${token}/queue`] })} className="flex items-center gap-1.5 text-white/30 text-sm hover:text-white/50 transition-colors">
              <RefreshCw className="h-3.5 w-3.5" /> Refresh
            </button>
          </div>
        )}

        {/* ─── Working phase ─── */}
        {phase === "working" && activeStepId && (
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between px-2">
              <span className="text-white/60 text-sm">Working as <span className="text-white font-semibold">{activeWorker?.username}</span></span>
              <span className="text-white font-mono text-2xl font-black tabular-nums">{formatDuration(elapsed)}</span>
            </div>
            <button
              onClick={() => setPhase("done-location")}
              disabled={completeMutation.isPending}
              className="h-20 rounded-3xl font-black text-2xl text-black transition-all active:scale-95"
              style={{ backgroundColor: stationColor }}
            >
              {completeMutation.isPending ? <Loader2 className="h-8 w-8 animate-spin mx-auto" /> : "DONE"}
            </button>
          </div>
        )}

        {/* ─── Idle phase: identification + start ─── */}
        {phase === "idle" && displayStep && (
          <>
            {/* Identification */}
            {!activeWorker && identifyMode === "idle" && (
              <div className="flex flex-col gap-3">
                <p className="text-white/50 text-sm text-center font-medium">Who are you?</p>
                <div className="grid grid-cols-2 gap-3">
                  {nfcSupported && (
                    <button
                      onClick={() => setIdentifyMode("nfc-waiting")}
                      className="flex flex-col items-center gap-2 h-24 rounded-2xl bg-white/8 border border-white/15 hover:bg-white/12 transition-colors"
                    >
                      <CreditCard className="h-7 w-7 text-white/70 mt-4" />
                      <span className="text-white/70 font-semibold text-sm">Tap card</span>
                    </button>
                  )}
                  <button
                    onClick={() => setIdentifyMode("pin")}
                    className="flex flex-col items-center gap-2 h-24 rounded-2xl bg-white/8 border border-white/15 hover:bg-white/12 transition-colors"
                  >
                    <KeyRound className="h-7 w-7 text-white/70 mt-4" />
                    <span className="text-white/70 font-semibold text-sm">Enter PIN</span>
                  </button>
                  <button
                    onClick={() => setIdentifyMode("select")}
                    className={cn(
                      "flex flex-col items-center gap-2 h-24 rounded-2xl bg-white/8 border border-white/15 hover:bg-white/12 transition-colors",
                      nfcSupported ? "" : "col-span-2"
                    )}
                  >
                    <Users className="h-7 w-7 text-white/70 mt-4" />
                    <span className="text-white/70 font-semibold text-sm">Select name</span>
                  </button>
                </div>
              </div>
            )}

            {/* NFC waiting */}
            {identifyMode === "nfc-waiting" && (
              <div className="flex flex-col items-center gap-4 py-4">
                <div className="h-20 w-20 rounded-full bg-white/10 flex items-center justify-center animate-pulse">
                  <CreditCard className="h-10 w-10 text-white/70" />
                </div>
                <p className="text-white font-bold text-lg">Tap your card now</p>
                {identifyMutation.isPending && <Loader2 className="h-5 w-5 animate-spin text-white/50" />}
                <button onClick={() => setIdentifyMode("idle")} className="text-white/40 text-sm hover:text-white/60 transition-colors">Cancel</button>
              </div>
            )}

            {/* PIN entry */}
            {identifyMode === "pin" && (
              <PinPad
                onSubmit={(pin) => identifyMutation.mutate({ method: "pin", pin })}
                error={pinError}
                onCancel={() => { setIdentifyMode("idle"); setPinError(""); }}
              />
            )}

            {/* Select from list */}
            {identifyMode === "select" && (
              <WorkerSelector
                workers={info.workers}
                onSelect={(id) => identifyMutation.mutate({ method: "select", userId: id })}
                onCancel={() => setIdentifyMode("idle")}
              />
            )}

            {/* Start button — only shown once worker is identified */}
            {activeWorker && identifyMode === "idle" && (
              <button
                onClick={() => displayStep && startMutation.mutate(displayStep.stepId)}
                disabled={startMutation.isPending || !displayStep}
                className="h-20 rounded-3xl font-black text-2xl text-black transition-all active:scale-95 disabled:opacity-50"
                style={{ backgroundColor: stationColor }}
              >
                {startMutation.isPending
                  ? <Loader2 className="h-8 w-8 animate-spin mx-auto" />
                  : <span className="flex items-center justify-center gap-2"><Play className="h-7 w-7 fill-black" /> START</span>
                }
              </button>
            )}
            {startMutation.isError && (
              <p className="text-red-400 text-sm text-center">{(startMutation.error as Error).message}</p>
            )}
          </>
        )}

        {/* Queue count badge */}
        {steps.length > 1 && (
          <div className="flex items-center justify-center gap-2 text-white/30 text-sm">
            <span>{steps.length - 1} more task{steps.length > 2 ? "s" : ""} in queue</span>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-6 pb-6 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <FabriflowMark className="h-4 w-4 text-white/20" />
          <span className="text-white/20 text-xs font-bold">Fabriflow</span>
        </div>
        <button
          onClick={() => queryClient.invalidateQueries({ queryKey: [`/api/kiosk/${token}/queue`] })}
          className="flex items-center gap-1 text-white/20 text-xs hover:text-white/40 transition-colors"
        >
          <RefreshCw className="h-3 w-3" /> Refresh
        </button>
      </div>
    </div>
  );
}
