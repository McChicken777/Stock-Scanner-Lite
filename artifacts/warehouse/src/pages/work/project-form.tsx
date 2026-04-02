import { useState } from "react";
import { useLocation, Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { ArrowLeft, Loader2, Calendar, FolderPlus, Minus, Plus, Palette, PackageCheck } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface Template {
  id: number;
  name: string;
  procedures: { id: number; name: string; sortOrder: number }[];
}

interface TemplateItem {
  templateId: number;
  quantity: number;
}

async function fetchTemplates(): Promise<Template[]> {
  const res = await fetch("/api/work/templates", { credentials: "include" });
  if (!res.ok) throw new Error("Failed to load templates");
  return res.json();
}

const priorities = [
  { value: "low", label: "Low", color: "border-blue-400 bg-blue-50 text-blue-700" },
  { value: "medium", label: "Medium", color: "border-orange-400 bg-orange-50 text-orange-700" },
  { value: "high", label: "High", color: "border-red-400 bg-red-50 text-red-700" },
];

function RalColorInput({
  value,
  onChange,
  placeholder = "e.g. RAL9005",
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const [raw, setRaw] = useState(() => {
    const m = value?.match(/^RAL(\d+)$/i);
    return m ? m[1] : value || "";
  });

  const handleChange = (v: string) => {
    const num = v.replace(/\D/g, "");
    setRaw(num);
    onChange(num ? `RAL${num}` : "");
  };

  return (
    <div className="flex items-center border-2 rounded-lg overflow-hidden focus-within:ring-2 focus-within:ring-primary/30 bg-background">
      <span className="px-3 py-2.5 bg-muted font-bold text-sm text-muted-foreground border-r-2 border-border">RAL</span>
      <input
        type="text"
        inputMode="numeric"
        value={raw}
        onChange={(e) => handleChange(e.target.value)}
        placeholder={placeholder.replace(/^RAL/, "")}
        className="flex-1 px-3 py-2.5 text-sm bg-transparent outline-none"
      />
    </div>
  );
}

export { RalColorInput };

export default function WorkProjectFormPage() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [name, setName] = useState("");
  const [deadline, setDeadline] = useState("");
  const [priority, setPriority] = useState<"low" | "medium" | "high">("medium");
  const [paintColor, setPaintColor] = useState("");
  const [requiresExternalParts, setRequiresExternalParts] = useState(false);
  const [templateItems, setTemplateItems] = useState<TemplateItem[]>([]);

  const { data: templates = [], isLoading } = useQuery({
    queryKey: ["/api/work/templates"],
    queryFn: fetchTemplates,
  });

  const createMutation = useMutation({
    mutationFn: async (data: { name: string; deadline: string; priority: string; paintColor: string | null; requiresExternalParts: boolean; templateItems: TemplateItem[] }) => {
      const res = await fetch("/api/work/projects", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || "Failed to create project");
      }
      return res.json();
    },
    onSuccess: (project) => {
      queryClient.invalidateQueries({ queryKey: ["/api/work/projects"] });
      toast({ title: "Work order created!" });
      setLocation(`/work/projects/${project.id}`);
    },
    onError: (err) => toast({ title: err instanceof Error ? err.message : "Failed", variant: "destructive" }),
  });

  if (user?.role !== "admin") {
    return <div className="p-6 text-center text-muted-foreground mt-20"><p>Admin only</p></div>;
  }

  const getTemplateItem = (id: number) => templateItems.find((t) => t.templateId === id);

  const toggleTemplate = (id: number) => {
    if (getTemplateItem(id)) {
      setTemplateItems((prev) => prev.filter((t) => t.templateId !== id));
    } else {
      setTemplateItems((prev) => [...prev, { templateId: id, quantity: 1 }]);
    }
  };

  const setQuantity = (id: number, qty: number) => {
    setTemplateItems((prev) =>
      prev.map((t) => t.templateId === id ? { ...t, quantity: Math.max(1, Math.min(100, qty)) } : t)
    );
  };

  const canSubmit = name.trim() && deadline && templateItems.length > 0;

  return (
    <div className="flex flex-col min-h-full">
      <div className="bg-secondary text-secondary-foreground p-4 sticky top-0 z-20 shadow-sm flex items-center gap-3">
        <Link href="/work/projects" className="p-2 -ml-2 rounded-full hover:bg-secondary-foreground/10 transition-colors">
          <ArrowLeft className="h-6 w-6" />
        </Link>
        <h1 className="text-xl font-bold">New Work Order</h1>
      </div>

      <div className="p-4 space-y-6 pb-24">
        {/* Name */}
        <div className="space-y-2">
          <Label className="text-sm font-bold">Project Name</Label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Batch #42 Production"
            className="h-12 border-2 text-base"
          />
        </div>

        {/* Deadline */}
        <div className="space-y-2">
          <Label className="text-sm font-bold flex items-center gap-2">
            <Calendar className="h-4 w-4" /> Deadline
          </Label>
          <Input
            type="date"
            value={deadline}
            onChange={(e) => setDeadline(e.target.value)}
            className="h-12 border-2 text-base"
            min={new Date().toISOString().split("T")[0]}
          />
        </div>

        {/* Priority */}
        <div className="space-y-2">
          <Label className="text-sm font-bold">Priority</Label>
          <div className="grid grid-cols-3 gap-2">
            {priorities.map((p) => (
              <button
                key={p.value}
                type="button"
                onClick={() => setPriority(p.value as "low" | "medium" | "high")}
                className={cn(
                  "h-12 rounded-lg border-2 font-bold text-sm transition-all",
                  priority === p.value ? p.color + " border-current" : "bg-muted/30 text-muted-foreground border-border"
                )}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* Project-level Paint Color */}
        <div className="space-y-2">
          <Label className="text-sm font-bold flex items-center gap-2">
            <Palette className="h-4 w-4" /> Paint Color (whole order)
          </Label>
          <RalColorInput value={paintColor} onChange={setPaintColor} placeholder="RAL9005" />
          <p className="text-xs text-muted-foreground">Leave blank if items have individual colors or no paint needed.</p>
        </div>

        {/* Requires External Parts */}
        <div
          className={`rounded-xl border-2 p-4 flex items-start gap-3 cursor-pointer transition-all ${requiresExternalParts ? "border-orange-400 bg-orange-50" : "border-border bg-muted/20"}`}
          onClick={() => setRequiresExternalParts((v) => !v)}
        >
          <div className={`mt-0.5 w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-all ${requiresExternalParts ? "bg-orange-500 border-orange-500" : "border-muted-foreground/40 bg-background"}`}>
            {requiresExternalParts && <svg className="h-3 w-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <PackageCheck className={`h-4 w-4 ${requiresExternalParts ? "text-orange-600" : "text-muted-foreground"}`} />
              <p className={`font-bold text-sm ${requiresExternalParts ? "text-orange-700" : "text-foreground"}`}>Requires External Parts</p>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Creates an inbound record so you can track when parts arrive and route them.
            </p>
          </div>
        </div>

        {/* Template selection with quantity */}
        <div className="space-y-3">
          <Label className="text-sm font-bold">Select Items to Produce</Label>
          {isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => <div key={i} className="h-16 bg-muted/40 rounded-lg animate-pulse" />)}
            </div>
          ) : templates.length === 0 ? (
            <div className="text-center py-8 px-4 bg-muted/30 rounded-xl border border-dashed text-sm text-muted-foreground">
              No item templates created yet.{" "}
              <Link href="/work/templates" className="text-primary font-semibold">Create templates first.</Link>
            </div>
          ) : (
            <div className="space-y-2">
              {templates.map((template) => {
                const item = getTemplateItem(template.id);
                const selected = !!item;
                return (
                  <div
                    key={template.id}
                    className={cn(
                      "rounded-lg border-2 transition-all overflow-hidden",
                      selected ? "border-primary bg-primary/5" : "border-border bg-card"
                    )}
                  >
                    <label className="flex items-start gap-3 p-3 cursor-pointer">
                      <Checkbox
                        checked={selected}
                        onCheckedChange={() => toggleTemplate(template.id)}
                        className="mt-0.5"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="font-bold">{template.name}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {template.procedures.length} step{template.procedures.length !== 1 ? "s" : ""}: {template.procedures.map((p) => p.name).join(", ")}
                        </p>
                      </div>
                    </label>

                    {selected && (
                      <div className="px-3 pb-3 flex items-center gap-3">
                        <span className="text-sm font-semibold text-muted-foreground">Quantity:</span>
                        <div className="flex items-center gap-1 bg-background border-2 border-primary/20 rounded-lg">
                          <button
                            type="button"
                            className="p-2 hover:bg-muted rounded-l-lg transition-colors"
                            onClick={() => setQuantity(template.id, (item?.quantity ?? 1) - 1)}
                          >
                            <Minus className="h-4 w-4" />
                          </button>
                          <input
                            type="number"
                            min={1}
                            max={100}
                            value={item?.quantity ?? 1}
                            onChange={(e) => setQuantity(template.id, Number(e.target.value))}
                            className="w-14 text-center text-lg font-black bg-transparent outline-none py-1"
                          />
                          <button
                            type="button"
                            className="p-2 hover:bg-muted rounded-r-lg transition-colors"
                            onClick={() => setQuantity(template.id, (item?.quantity ?? 1) + 1)}
                          >
                            <Plus className="h-4 w-4" />
                          </button>
                        </div>
                        <span className="text-xs text-muted-foreground">
                          = {item?.quantity ?? 1} item{(item?.quantity ?? 1) !== 1 ? "s" : ""}
                        </span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Summary */}
        {templateItems.length > 0 && (
          <div className="bg-muted/30 border border-border rounded-xl p-3 text-sm">
            <p className="font-bold mb-1">Summary</p>
            {templateItems.map((ti) => {
              const t = templates.find((t) => t.id === ti.templateId);
              return t ? (
                <p key={ti.templateId} className="text-muted-foreground">
                  • {ti.quantity}× {t.name}
                  {ti.quantity > 1 && <span className="text-xs ml-1">(numbered {t.name} #1 – #{ti.quantity})</span>}
                </p>
              ) : null;
            })}
            {paintColor && <p className="mt-1 font-medium text-primary">Paint: {paintColor}</p>}
          </div>
        )}

        <Button
          onClick={() => createMutation.mutate({
            name: name.trim(), deadline, priority,
            paintColor: paintColor || null,
            requiresExternalParts,
            templateItems,
          })}
          disabled={!canSubmit || createMutation.isPending}
          className="w-full h-14 font-bold text-base"
        >
          {createMutation.isPending ? (
            <><Loader2 className="mr-2 h-5 w-5 animate-spin" /> Creating…</>
          ) : (
            <><FolderPlus className="mr-2 h-5 w-5" /> Create Work Order</>
          )}
        </Button>
      </div>
    </div>
  );
}
