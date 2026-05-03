import { useQuery } from "@tanstack/react-query";
import { useParams, useLocation } from "wouter";
import { QRCodeSVG } from "qrcode.react";
import { Button } from "@/components/ui/button";
import { Printer, ArrowLeft } from "lucide-react";

interface ItemStep {
  id: number;
  name: string;
  status: "not_started" | "in_progress" | "completed";
  sortOrder: number;
  roleName?: string | null;
}

interface ProjectItem {
  id: number;
  name: string;
  paintColor: string | null;
  sortOrder: number;
  procedures: ItemStep[];
  progress: number;
}

interface Project { id: number; name: string; deadline: string; priority: string }
interface ProjectWithItems extends Project { items: ProjectItem[] }

async function apiFetch(url: string) {
  const res = await fetch(url, { credentials: "include" });
  if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || "Failed"); }
  return res.json();
}

export default function PrintTagPage() {
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();

  const { data, isLoading, isError } = useQuery<ProjectWithItems>({
    queryKey: [`/api/work/projects/${id}`],
    queryFn: () => apiFetch(`/api/work/projects/${id}`),
    enabled: !!id,
  });

  if (isLoading) return (
    <div className="flex items-center justify-center min-h-screen">
      <p className="text-muted-foreground">Loading…</p>
    </div>
  );
  if (isError || !data) return (
    <div className="flex items-center justify-center min-h-screen">
      <p className="text-destructive">Failed to load project</p>
    </div>
  );

  const project = data;
  const items = data.items;
  const appOrigin = window.location.origin;

  return (
    <div className="min-h-screen bg-background">
      <div className="no-print flex items-center gap-3 px-4 py-3 border-b bg-muted/30 sticky top-0 z-10">
        <Button variant="ghost" size="sm" onClick={() => navigate(`/work/projects/${id}`)}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Back
        </Button>
        <span className="text-sm font-semibold flex-1">Job Tags — {project.name}</span>
        <Button size="sm" onClick={() => window.print()}>
          <Printer className="h-4 w-4 mr-1.5" /> Print
        </Button>
      </div>

      <style>{`
        @media print {
          .no-print { display: none !important; }
          nav, header, aside, [data-app-nav], [data-bottom-nav] { display: none !important; }
          body { margin: 0; }
          .tag-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12mm; padding: 12mm; }
          .tag { border: 1.5px solid #666; border-radius: 4mm; padding: 6mm; break-inside: avoid; }
        }
        @media screen {
          .tag-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 16px; padding: 16px; max-width: 900px; margin: 0 auto; }
          .tag { border: 2px solid hsl(var(--border)); border-radius: 12px; padding: 16px; }
        }
      `}</style>

      <div className="tag-grid">
        {items.map((item) => {
          const deepLinkUrl = `${appOrigin}/work/projects/${project.id}?item=${item.id}`;
          const activeStep = item.procedures?.find((s) => s.status === "in_progress");
          const nextStep = item.procedures?.find((s) => s.status === "not_started");
          const currentStep = activeStep ?? nextStep ?? null;
          const completedCount = item.procedures?.filter((s) => s.status === "completed").length ?? 0;
          const totalCount = item.procedures?.length ?? 0;
          const deadline = new Date(project.deadline);
          const deadlineStr = deadline.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
          return (
            <div key={item.id} className="tag space-y-3">
              <div>
                <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">Job Tag</p>
                <p className="text-base font-black leading-snug mt-0.5">{item.name}</p>
                <p className="text-xs text-muted-foreground">{project.name}</p>
                {item.paintColor && (
                  <p className="text-xs mt-0.5 font-medium text-muted-foreground">
                    Colour: {item.paintColor}
                  </p>
                )}
              </div>

              {currentStep && (
                <div className="rounded border border-dashed border-gray-400 px-2 py-1.5">
                  <p className="text-[9px] uppercase tracking-wider text-muted-foreground font-semibold mb-0.5">
                    {activeStep ? "Current step (active)" : "Next step"}
                  </p>
                  <p className="text-xs font-bold leading-snug">{currentStep.name}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    Step {(item.procedures?.indexOf(currentStep) ?? 0) + 1} of {totalCount}
                    {completedCount > 0 && ` · ${completedCount} done`}
                  </p>
                </div>
              )}
              {!currentStep && totalCount > 0 && (
                <div className="rounded border border-dashed border-green-400 px-2 py-1.5 text-center">
                  <p className="text-xs font-bold text-green-700">All {totalCount} steps complete</p>
                </div>
              )}

              <div className="flex items-start gap-4">
                <QRCodeSVG
                  value={deepLinkUrl}
                  size={88}
                  level="M"
                  style={{ flexShrink: 0 }}
                />
                <div className="text-[10px] text-muted-foreground break-all leading-relaxed">
                  <p className="font-semibold mb-0.5">Scan to open work order</p>
                  <p>{deepLinkUrl}</p>
                </div>
              </div>
              <div className="border-t pt-2 grid grid-cols-3 text-[10px] text-muted-foreground gap-1">
                <span>Due: <strong>{deadlineStr}</strong></span>
                <span className="text-center capitalize">
                  <strong>{project.priority}</strong>
                </span>
                <span className="text-right">ID: #{item.id}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
