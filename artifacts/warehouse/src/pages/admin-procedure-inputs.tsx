import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/auth";
import { useLang } from "@/contexts/lang";
import { useRoute } from "wouter";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2, ArrowLeft } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Link } from "wouter";

type AnyItemType = "purchase" | "production" | "purchased_part" | "manufactured_part" | "final_product";

interface Product {
  id: number;
  name: string;
  itemType: AnyItemType;
}

interface ProcedureInput {
  id: number;
  itemId: number;
  quantityRequired: number;
  productName: string;
  itemType: AnyItemType;
}

interface Procedure {
  id: number;
  name: string;
  roleName: string;
}

async function fetchProcedure(procId: number): Promise<Procedure> {
  const res = await fetch(`/api/tasks/procedures`, { credentials: "include" });
  if (!res.ok) throw new Error("Failed");
  const procs: any[] = await res.json();
  return procs.find((p) => p.id === procId) || { id: 0, name: "", roleName: "" };
}

async function fetchProducts(): Promise<Product[]> {
  const res = await fetch("/api/products", { credentials: "include" });
  if (!res.ok) throw new Error("Failed");
  return res.json();
}

async function fetchInputs(procId: number): Promise<ProcedureInput[]> {
  const res = await fetch(`/api/tasks/procedures/${procId}/inputs`, { credentials: "include" });
  if (!res.ok) throw new Error("Failed");
  return res.json();
}

export default function AdminProcedureInputsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { t } = useLang();
  const queryClient = useQueryClient();
  const [, params] = useRoute("/admin/procedure-inputs/:procId");
  const procId = Number(params?.procId || 0);

  const [selectedItemId, setSelectedItemId] = useState<string>("");
  const [quantityRequired, setQuantityRequired] = useState("1");

  const { data: procedure, isLoading: procLoading } = useQuery({
    queryKey: ["/api/tasks/procedures", procId],
    queryFn: () => fetchProcedure(procId),
    enabled: !!procId,
  });

  const { data: products = [] } = useQuery({
    queryKey: ["/api/products"],
    queryFn: fetchProducts,
  });

  const { data: inputs = [], isLoading: inputsLoading } = useQuery({
    queryKey: ["/api/tasks/procedures", procId, "inputs"],
    queryFn: () => fetchInputs(procId),
    enabled: !!procId,
  });

  const addMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/tasks/procedures/${procId}/inputs`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          itemId: Number(selectedItemId),
          quantityRequired: Number(quantityRequired),
        }),
      });
      if (!res.ok) throw new Error("Failed");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks/procedures", procId, "inputs"] });
      setSelectedItemId("");
      setQuantityRequired("1");
      toast({ title: "Input added" });
    },
    onError: () => toast({ title: "Failed to add input", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (inputId: number) => {
      await fetch(`/api/tasks/procedures/inputs/${inputId}`, {
        method: "DELETE",
        credentials: "include",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks/procedures", procId, "inputs"] });
      toast({ title: "Input removed" });
    },
    onError: () => toast({ title: "Failed to remove input", variant: "destructive" }),
  });

  if (user?.role !== "admin") {
    return <div className="p-6 text-center text-muted-foreground">{t("adminOnly")}</div>;
  }

  if (!procId || procLoading) {
    return <div className="p-6 text-muted-foreground">{t("loading")}</div>;
  }

  return (
    <div className="p-4 space-y-4 pb-24">
      <Link href="/admin/procedures" className="flex items-center gap-2 text-primary hover:opacity-70">
        <ArrowLeft className="h-4 w-4" /> {t("procedureInputsBack")}
      </Link>

      <div>
        <h1 className="text-2xl font-bold">{procedure?.name}</h1>
        <p className="text-xs text-muted-foreground">{t("procedureInputsDesc")}</p>
      </div>

      {inputsLoading ? (
        <div className="text-muted-foreground">{t("procedureInputsLoading")}</div>
      ) : (
        <div className="space-y-2">
          {inputs.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">{t("procedureInputsNone")}</p>
          ) : (
            inputs.map((input) => (
              <div
                key={input.id}
                className="flex items-center justify-between bg-card p-3 rounded-lg border"
              >
                <div>
                  <p className="font-medium">{input.productName}</p>
                  <p className="text-xs text-muted-foreground">
                    {input.itemType === "purchased_part" || input.itemType === "purchase" ? "📦 Purchased Part" :
                     input.itemType === "final_product" ? "✅ Final Product" : "⚙️ Manufactured Part"} · Qty: {input.quantityRequired}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => deleteMutation.mutate(input.id)}
                  disabled={deleteMutation.isPending}
                  className="text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))
          )}
        </div>
      )}

      <div className="space-y-2 pt-4 border-t">
        <p className="text-sm font-bold">{t("procedureInputsAdd")}</p>
        <Select value={selectedItemId} onValueChange={setSelectedItemId}>
          <SelectTrigger className="h-12">
            <SelectValue placeholder={t("procedureInputsSelectItem")} />
          </SelectTrigger>
          <SelectContent>
            {products.map((p) => (
              <SelectItem key={p.id} value={String(p.id)}>
                {p.name} {p.itemType === "purchased_part" || p.itemType === "purchase" ? "(📦)" : p.itemType === "final_product" ? "(✅)" : "(⚙️)"}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          type="number"
          value={quantityRequired}
          onChange={(e) => setQuantityRequired(e.target.value)}
          placeholder={t("procedureInputsQuantityPlaceholder")}
          className="h-12"
          min="1"
        />
        <Button
          onClick={() => addMutation.mutate()}
          disabled={!selectedItemId || addMutation.isPending}
          className="w-full h-12 font-bold gap-1"
        >
          <Plus className="h-4 w-4" /> {t("procedureInputsAddBtn")}
        </Button>
      </div>
    </div>
  );
}
