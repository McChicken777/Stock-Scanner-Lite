import { useState } from "react";
import { useAuth } from "@/contexts/auth";
import { useToast } from "@/hooks/use-toast";
import { useLang } from "@/contexts/lang";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, MapPin, GripVertical, Loader2 } from "lucide-react";

interface ProductionZone {
  id: number;
  name: string;
  sortOrder: number;
}

async function apiFetch(url: string, opts?: RequestInit) {
  const res = await fetch(url, { credentials: "include", ...opts });
  if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || "Failed"); }
  return res.json();
}

export default function AdminZonesPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { t } = useLang();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");

  const { data: zones = [], isLoading } = useQuery<ProductionZone[]>({
    queryKey: ["/api/work/production-zones"],
    queryFn: () => apiFetch("/api/work/production-zones"),
  });

  const createMutation = useMutation({
    mutationFn: (zoneName: string) => apiFetch("/api/work/production-zones", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: zoneName }),
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/work/production-zones"] });
      setOpen(false);
      setName("");
      toast({ title: "Zone created" });
    },
    onError: (err: Error) => toast({ title: err.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiFetch(`/api/work/production-zones/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/work/production-zones"] });
      toast({ title: "Zone deleted" });
    },
    onError: (err: Error) => toast({ title: err.message, variant: "destructive" }),
  });

  if (user?.role !== "admin") {
    return <div className="p-6 text-center text-muted-foreground">{t("accessDenied")}</div>;
  }

  return (
    <div className="p-4 space-y-4 pb-24">
      <div className="flex items-center justify-between pt-2">
        <div>
          <h1 className="text-2xl font-black">{t("zonesTitle")}</h1>
          <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">
            {t("zonesSubtitle")}
          </p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="font-bold gap-2">
              <Plus className="h-4 w-4" /> {t("zonesAdd")}
            </Button>
          </DialogTrigger>
          <DialogContent className="w-[90vw] max-w-sm rounded-xl">
            <DialogHeader>
              <DialogTitle>{t("zonesNewDialog")}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>{t("zonesNameLabel")}</Label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={t("zonesNamePlaceholder")}
                  className="h-12 border-2"
                  onKeyDown={(e) => { if (e.key === "Enter" && name.trim()) createMutation.mutate(name.trim()); }}
                />
              </div>
              <Button
                className="w-full h-12 font-bold"
                disabled={!name.trim() || createMutation.isPending}
                onClick={() => createMutation.mutate(name.trim())}
              >
                {createMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                {t("zonesCreate")}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => <div key={i} className="h-16 bg-muted/40 rounded-lg animate-pulse" />)}
        </div>
      ) : zones.length === 0 ? (
        <div className="text-center py-16 px-4 bg-muted/30 rounded-xl border border-dashed">
          <MapPin className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
          <p className="font-semibold text-muted-foreground">{t("zonesNone")}</p>
          <p className="text-sm text-muted-foreground mt-1">{t("zonesNoneDesc")}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {zones.map((zone) => (
            <div
              key={zone.id}
              className="bg-card border-2 border-border rounded-lg p-4 flex items-center justify-between"
            >
              <div className="flex items-center gap-3">
                <GripVertical className="h-4 w-4 text-muted-foreground/40" />
                <MapPin className="h-5 w-5 text-blue-500" />
                <p className="font-bold">{zone.name}</p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="text-destructive hover:text-destructive hover:bg-destructive/10"
                onClick={() => {
                  if (confirm(`Delete zone "${zone.name}"?`)) deleteMutation.mutate(zone.id);
                }}
                disabled={deleteMutation.isPending}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
