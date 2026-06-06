import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { CheckCircle2, Scissors, PackageOpen, ChevronDown, ChevronUp } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface CutEntry {
  stepId: number;
  stepName: string;
  status: string;
  consumesQuantity: number;
  itemId: number;
  itemName: string;
  projectId: number;
  projectName: string;
  slot: number;
}

interface Batch {
  materialId: number;
  materialName: string;
  cuts: CutEntry[];
}

interface Slot {
  slot: number;
  projectId: number;
  projectName: string;
}

interface CuttingQueueData {
  batches: Batch[];
  slots: Slot[];
}

async function fetchCuttingQueue(): Promise<CuttingQueueData> {
  const res = await fetch("/api/work/cutting-queue", { credentials: "include" });
  if (!res.ok) throw new Error("Failed to load cutting queue");
  return res.json();
}

async function completeCut(stepId: number) {
  const res = await fetch("/api/work/cutting-queue/complete", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ stepId }),
  });
  if (!res.ok) throw new Error("Failed to complete cut");
}

const slotColors = [
  "bg-red-100 border-red-400 text-red-800",
  "bg-orange-100 border-orange-400 text-orange-800",
  "bg-yellow-100 border-yellow-400 text-yellow-800",
  "bg-lime-100 border-lime-500 text-lime-800",
  "bg-green-100 border-green-400 text-green-800",
  "bg-teal-100 border-teal-400 text-teal-800",
  "bg-cyan-100 border-cyan-400 text-cyan-800",
  "bg-blue-100 border-blue-400 text-blue-800",
  "bg-violet-100 border-violet-400 text-violet-800",
  "bg-pink-100 border-pink-400 text-pink-800",
];

function slotColor(slot: number) {
  return slotColors[(slot - 1) % slotColors.length] ?? slotColors[0];
}

export default function CuttingQueuePage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [expandedBatch, setExpandedBatch] = useState<number | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["/api/work/cutting-queue"],
    queryFn: fetchCuttingQueue,
    refetchInterval: 20000,
  });

  const completeMut = useMutation({
    mutationFn: completeCut,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/work/cutting-queue"] });
    },
    onError: () => toast({ title: "Failed to mark cut done", variant: "destructive" }),
  });

  const batches = data?.batches ?? [];
  const slots = data?.slots ?? [];

  // Auto-expand first batch
  const firstMaterialId = batches[0]?.materialId;
  const activeBatch = expandedBatch ?? firstMaterialId ?? null;

  return (
    <div className="p-4 space-y-4 pb-24 max-w-2xl mx-auto">
      <div className="pt-2">
        <h1 className="text-2xl font-black flex items-center gap-2">
          <Scissors className="h-6 w-6" /> Cutting Queue
        </h1>
        <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Bandsaw · Batch by material</p>
      </div>

      {/* Slot legend */}
      {slots.length > 0 && (
        <div className="bg-card border-2 rounded-xl p-3 space-y-2">
          <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Job Boxes</p>
          <div className="flex flex-wrap gap-1.5">
            {slots.map((s) => (
              <span key={s.slot} className={`inline-flex items-center gap-1 text-xs font-bold border-2 rounded-full px-2.5 py-0.5 ${slotColor(s.slot)}`}>
                <PackageOpen className="h-3 w-3" /> Box {s.slot} — {s.projectName}
              </span>
            ))}
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2].map((i) => <Skeleton key={i} className="h-24 w-full rounded-xl" />)}
        </div>
      ) : batches.length === 0 ? (
        <div className="text-center py-16 px-4 bg-muted/30 rounded-xl border border-dashed">
          <Scissors className="h-10 w-10 mx-auto mb-3 text-muted-foreground" />
          <p className="font-semibold">No cuts pending</p>
          <p className="text-sm text-muted-foreground mt-1">All cutting steps are done or no steps have materials assigned.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {batches.map((batch) => {
            const isOpen = activeBatch === batch.materialId;
            const pendingCount = batch.cuts.filter((c) => c.status !== "completed").length;
            return (
              <div key={batch.materialId} className="bg-card border-2 rounded-xl overflow-hidden">
                <button
                  className="w-full p-4 flex items-center justify-between text-left"
                  onClick={() => setExpandedBatch(isOpen ? null : batch.materialId)}
                >
                  <div>
                    <p className="font-black text-lg">{batch.materialName}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {pendingCount} cut{pendingCount !== 1 ? "s" : ""} pending · {batch.cuts.length} total
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {pendingCount === 0 && (
                      <CheckCircle2 className="h-5 w-5 text-green-500" />
                    )}
                    {isOpen ? <ChevronUp className="h-5 w-5 text-muted-foreground" /> : <ChevronDown className="h-5 w-5 text-muted-foreground" />}
                  </div>
                </button>

                {isOpen && (
                  <div className="border-t-2 divide-y-2">
                    {batch.cuts.map((cut) => {
                      const done = cut.status === "completed";
                      return (
                        <div key={cut.stepId} className={`p-4 flex items-center gap-3 transition-opacity ${done ? "opacity-40" : ""}`}>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-black text-xl leading-none">{cut.consumesQuantity} mm</span>
                              <span className={`text-xs font-bold border-2 rounded-full px-2 py-0.5 flex-shrink-0 ${slotColor(cut.slot)}`}>
                                Box {cut.slot}
                              </span>
                            </div>
                            <p className="text-sm text-muted-foreground truncate mt-0.5">{cut.stepName} · {cut.itemName}</p>
                          </div>
                          <Button
                            size="sm"
                            variant={done ? "outline" : "default"}
                            disabled={done || completeMut.isPending}
                            onClick={() => completeMut.mutate(cut.stepId)}
                            className="flex-shrink-0 font-bold h-10 min-w-[80px]"
                          >
                            {done ? (
                              <><CheckCircle2 className="h-4 w-4 mr-1 text-green-500" /> Done</>
                            ) : "DONE"}
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
