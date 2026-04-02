import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2, Loader2, Package, ChevronDown, ChevronRight, Wrench, ShoppingCart, X, ListPlus, ArrowUp, ArrowDown } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

interface Product {
  id: number;
  name: string;
  itemType: string;
}

interface Procedure {
  id: number;
  productId: number;
  name: string;
  sortOrder: number;
}

interface ComponentEntry {
  id: number;
  parentProductId: number;
  componentProductId: number;
  quantity: number;
  sortOrder: number;
  product: Product;
  procedures: Procedure[];
}

interface Template {
  id: number;
  name: string;
  productId: number | null;
}

async function fetchTemplates(): Promise<Template[]> {
  const res = await fetch("/api/work/templates", { credentials: "include" });
  if (!res.ok) throw new Error("Failed");
  return res.json();
}

async function fetchProducts(): Promise<Product[]> {
  const res = await fetch("/api/products", { credentials: "include" });
  if (!res.ok) throw new Error("Failed");
  return res.json();
}

async function fetchComponents(productId: number): Promise<ComponentEntry[]> {
  const res = await fetch(`/api/products/${productId}/components`, { credentials: "include" });
  if (!res.ok) throw new Error("Failed");
  return res.json();
}

function TemplateBOM({ template, allProducts }: { template: Template; allProducts: Product[] }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const productId = template.productId;

  const [addingComponent, setAddingComponent] = useState(false);
  const [selectedComponentId, setSelectedComponentId] = useState<number | "new">("new");
  const [newPartName, setNewPartName] = useState("");
  const [componentQty, setComponentQty] = useState(1);

  const [addingProcedure, setAddingProcedure] = useState<number | null>(null);
  const [newProcName, setNewProcName] = useState("");

  const { data: components = [], isLoading } = useQuery<ComponentEntry[]>({
    queryKey: [`/api/products/${productId}/components`],
    queryFn: () => fetchComponents(productId!),
    enabled: !!productId,
  });

  const invalidateComponents = () => {
    queryClient.invalidateQueries({ queryKey: [`/api/products/${productId}/components`] });
  };

  const addComponentMutation = useMutation({
    mutationFn: async ({ componentProductId, quantity }: { componentProductId: number; quantity: number }) => {
      const res = await fetch(`/api/products/${productId}/components`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ componentProductId, quantity }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || "Failed");
      }
      return res.json();
    },
    onSuccess: () => {
      invalidateComponents();
      setAddingComponent(false);
      setSelectedComponentId("new");
      setNewPartName("");
      setComponentQty(1);
      toast({ title: "Component added" });
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const createPartAndAddMutation = useMutation({
    mutationFn: async ({ name, quantity }: { name: string; quantity: number }) => {
      const createRes = await fetch("/api/products", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, itemType: "manufactured_part", bufferStock: 0, targetStock: 0 }),
      });
      if (!createRes.ok) {
        const d = await createRes.json().catch(() => ({}));
        throw new Error(d.error || "Failed to create part");
      }
      const newPart: Product = await createRes.json();
      const addRes = await fetch(`/api/products/${productId}/components`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ componentProductId: newPart.id, quantity }),
      });
      if (!addRes.ok) {
        const d = await addRes.json().catch(() => ({}));
        throw new Error(d.error || "Failed to add component");
      }
      return addRes.json();
    },
    onSuccess: () => {
      invalidateComponents();
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      setAddingComponent(false);
      setSelectedComponentId("new");
      setNewPartName("");
      setComponentQty(1);
      toast({ title: "Manufactured part created and added" });
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const removeComponentMutation = useMutation({
    mutationFn: async (componentId: number) => {
      await fetch(`/api/products/${productId}/components/${componentId}`, {
        method: "DELETE", credentials: "include",
      });
    },
    onSuccess: () => { invalidateComponents(); toast({ title: "Component removed" }); },
    onError: () => toast({ title: "Failed to remove component", variant: "destructive" }),
  });

  const reorderComponentsMutation = useMutation({
    mutationFn: async (order: { id: number; sortOrder: number }[]) => {
      await fetch(`/api/products/${productId}/components/reorder`, {
        method: "PUT", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order }),
      });
    },
    onSuccess: () => invalidateComponents(),
    onError: () => toast({ title: "Failed to reorder", variant: "destructive" }),
  });

  const reorderProceduresMutation = useMutation({
    mutationFn: async ({ partProductId, order }: { partProductId: number; order: { id: number; sortOrder: number }[] }) => {
      await fetch(`/api/products/${partProductId}/procedures/reorder`, {
        method: "PUT", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order }),
      });
    },
    onSuccess: () => invalidateComponents(),
    onError: () => toast({ title: "Failed to reorder", variant: "destructive" }),
  });

  const moveComponent = (index: number, direction: -1 | 1) => {
    const newComps = [...components];
    const swapIndex = index + direction;
    if (swapIndex < 0 || swapIndex >= newComps.length) return;
    const order = newComps.map((c, i) => {
      if (i === index) return { id: c.id, sortOrder: swapIndex };
      if (i === swapIndex) return { id: c.id, sortOrder: index };
      return { id: c.id, sortOrder: i };
    });
    reorderComponentsMutation.mutate(order);
  };

  const moveProcedure = (comp: ComponentEntry, procIndex: number, direction: -1 | 1) => {
    const newProcs = [...comp.procedures];
    const swapIndex = procIndex + direction;
    if (swapIndex < 0 || swapIndex >= newProcs.length) return;
    const order = newProcs.map((p, i) => {
      if (i === procIndex) return { id: p.id, sortOrder: swapIndex };
      if (i === swapIndex) return { id: p.id, sortOrder: procIndex };
      return { id: p.id, sortOrder: i };
    });
    reorderProceduresMutation.mutate({ partProductId: comp.componentProductId, order });
  };

  const addProcedureMutation = useMutation({
    mutationFn: async ({ partProductId, name }: { partProductId: number; name: string }) => {
      const res = await fetch(`/api/products/${partProductId}/procedures`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || "Failed");
      }
      return res.json();
    },
    onSuccess: () => {
      invalidateComponents();
      setAddingProcedure(null);
      setNewProcName("");
      toast({ title: "Procedure added" });
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const removeProcedureMutation = useMutation({
    mutationFn: async ({ partProductId, procedureId }: { partProductId: number; procedureId: number }) => {
      await fetch(`/api/products/${partProductId}/procedures/${procedureId}`, {
        method: "DELETE", credentials: "include",
      });
    },
    onSuccess: () => { invalidateComponents(); toast({ title: "Procedure removed" }); },
    onError: () => toast({ title: "Failed to remove procedure", variant: "destructive" }),
  });

  const manufactureParts = allProducts.filter((p) => p.itemType === "manufactured_part");
  const purchasedParts = allProducts.filter((p) => p.itemType === "purchased_part" || p.itemType === "purchase");

  const availableParts = [...manufactureParts, ...purchasedParts].filter(
    (p) => !components.some((c) => c.componentProductId === p.id),
  );

  const handleAddComponent = () => {
    if (!productId) return;
    if (selectedComponentId === "new") {
      if (!newPartName.trim()) return;
      createPartAndAddMutation.mutate({ name: newPartName.trim(), quantity: componentQty });
    } else {
      addComponentMutation.mutate({ componentProductId: selectedComponentId as number, quantity: componentQty });
    }
  };

  if (!productId) {
    return (
      <div className="px-4 pb-4 text-sm text-muted-foreground italic">
        No product linked to this template.
      </div>
    );
  }

  if (isLoading) {
    return <div className="px-4 pb-4"><div className="h-16 bg-muted/40 rounded-lg animate-pulse" /></div>;
  }

  return (
    <div className="px-4 pb-4 space-y-3">
      {components.length === 0 && (
        <p className="text-sm text-muted-foreground italic">No components yet. Add sub-parts below.</p>
      )}

      {components.map((comp, compIndex) => {
        const isManufactured = comp.product?.itemType === "manufactured_part";
        const isPurchased = comp.product?.itemType === "purchased_part" || comp.product?.itemType === "purchase";

        return (
          <div key={comp.id} className={`rounded-lg border-2 p-3 space-y-2 ${isManufactured ? "border-blue-200 bg-blue-50/40" : "border-orange-200 bg-orange-50/40"}`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="flex flex-col">
                  <button
                    onClick={() => moveComponent(compIndex, -1)}
                    disabled={compIndex === 0 || reorderComponentsMutation.isPending}
                    className="text-muted-foreground hover:text-foreground disabled:opacity-30 p-0.5"
                  >
                    <ArrowUp className="h-3 w-3" />
                  </button>
                  <button
                    onClick={() => moveComponent(compIndex, 1)}
                    disabled={compIndex === components.length - 1 || reorderComponentsMutation.isPending}
                    className="text-muted-foreground hover:text-foreground disabled:opacity-30 p-0.5"
                  >
                    <ArrowDown className="h-3 w-3" />
                  </button>
                </div>
                {isManufactured
                  ? <Wrench className="h-4 w-4 text-blue-600" />
                  : <ShoppingCart className="h-4 w-4 text-orange-600" />}
                <span className="font-bold text-sm">{comp.product?.name ?? "Unknown"}</span>
                <span className={`text-xs font-semibold px-1.5 py-0.5 rounded ${isManufactured ? "bg-blue-100 text-blue-700" : "bg-orange-100 text-orange-700"}`}>
                  {isManufactured ? "Manufactured" : "Purchased"}
                </span>
                {comp.quantity > 1 && (
                  <span className="text-xs font-medium text-muted-foreground bg-muted px-1.5 py-0.5 rounded">×{comp.quantity}</span>
                )}
              </div>
              <button
                onClick={() => removeComponentMutation.mutate(comp.id)}
                disabled={removeComponentMutation.isPending}
                className="text-destructive hover:text-destructive/80 p-1 rounded"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {isManufactured && (
              <div className="space-y-1.5 pl-6">
                {comp.procedures.length === 0 && (
                  <p className="text-xs text-muted-foreground italic">No procedures defined</p>
                )}
                {comp.procedures.map((proc, procIndex) => (
                  <div key={proc.id} className="flex items-center justify-between bg-white rounded px-2 py-1 border border-blue-100">
                    <div className="flex items-center gap-1.5">
                      <div className="flex flex-col">
                        <button
                          onClick={() => moveProcedure(comp, procIndex, -1)}
                          disabled={procIndex === 0 || reorderProceduresMutation.isPending}
                          className="text-muted-foreground hover:text-foreground disabled:opacity-30 leading-none"
                        >
                          <ArrowUp className="h-2.5 w-2.5" />
                        </button>
                        <button
                          onClick={() => moveProcedure(comp, procIndex, 1)}
                          disabled={procIndex === comp.procedures.length - 1 || reorderProceduresMutation.isPending}
                          className="text-muted-foreground hover:text-foreground disabled:opacity-30 leading-none"
                        >
                          <ArrowDown className="h-2.5 w-2.5" />
                        </button>
                      </div>
                      <span className="text-xs text-muted-foreground font-mono w-4">{procIndex + 1}.</span>
                      <span className="text-sm">{proc.name}</span>
                    </div>
                    <button
                      onClick={() => removeProcedureMutation.mutate({ partProductId: comp.componentProductId, procedureId: proc.id })}
                      className="text-muted-foreground hover:text-destructive p-0.5 rounded"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}

                {addingProcedure === comp.componentProductId ? (
                  <div className="flex gap-2 items-center">
                    <Input
                      value={newProcName}
                      onChange={(e) => setNewProcName(e.target.value)}
                      placeholder="e.g. CNC Milling"
                      className="h-8 text-sm border-2"
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && newProcName.trim()) {
                          addProcedureMutation.mutate({ partProductId: comp.componentProductId, name: newProcName.trim() });
                        }
                        if (e.key === "Escape") { setAddingProcedure(null); setNewProcName(""); }
                      }}
                    />
                    <Button
                      size="sm"
                      className="h-8 px-2"
                      disabled={!newProcName.trim() || addProcedureMutation.isPending}
                      onClick={() => addProcedureMutation.mutate({ partProductId: comp.componentProductId, name: newProcName.trim() })}
                    >
                      {addProcedureMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
                    </Button>
                    <Button size="sm" variant="ghost" className="h-8 px-2" onClick={() => { setAddingProcedure(null); setNewProcName(""); }}>
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                ) : (
                  <button
                    onClick={() => { setAddingProcedure(comp.componentProductId); setNewProcName(""); }}
                    className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1 font-medium"
                  >
                    <Plus className="h-3 w-3" /> Add procedure step
                  </button>
                )}
              </div>
            )}

            {isPurchased && (
              <p className="pl-6 text-xs text-muted-foreground italic">Tracked via stock / inbound</p>
            )}
          </div>
        );
      })}

      {addingComponent ? (
        <div className="rounded-lg border-2 border-dashed border-muted-foreground/30 p-3 space-y-3">
          <p className="text-sm font-bold">Add Component</p>

          <div className="space-y-2">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Select part</label>
            <select
              value={selectedComponentId}
              onChange={(e) => setSelectedComponentId(e.target.value === "new" ? "new" : Number(e.target.value))}
              className="w-full rounded-md border-2 border-border bg-background px-3 py-2 text-sm"
            >
              <option value="new">+ Create new manufactured part</option>
              {availableParts.length > 0 && <option disabled>── Existing parts ──</option>}
              {availableParts.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.itemType === "manufactured_part" ? "Manufactured" : "Purchased"})
                </option>
              ))}
            </select>
          </div>

          {selectedComponentId === "new" && (
            <div className="space-y-1">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Part name</label>
              <Input
                value={newPartName}
                onChange={(e) => setNewPartName(e.target.value)}
                placeholder="e.g. Steel Bracket, Frame"
                className="h-9 border-2"
                autoFocus
              />
            </div>
          )}

          <div className="space-y-1">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Quantity</label>
            <Input
              type="number"
              min={1}
              value={componentQty}
              onChange={(e) => setComponentQty(Math.max(1, Number(e.target.value)))}
              className="h-9 border-2 w-24"
            />
          </div>

          <div className="flex gap-2">
            <Button
              size="sm"
              className="h-9 font-bold"
              disabled={
                (selectedComponentId === "new" && !newPartName.trim()) ||
                addComponentMutation.isPending ||
                createPartAndAddMutation.isPending
              }
              onClick={handleAddComponent}
            >
              {(addComponentMutation.isPending || createPartAndAddMutation.isPending) ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Plus className="mr-1.5 h-3.5 w-3.5" />}
              Add
            </Button>
            <Button size="sm" variant="outline" className="h-9" onClick={() => { setAddingComponent(false); setSelectedComponentId("new"); setNewPartName(""); setComponentQty(1); }}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setAddingComponent(true)}
          className="w-full flex items-center justify-center gap-2 text-sm font-semibold text-primary border-2 border-dashed border-primary/30 rounded-lg py-2.5 hover:border-primary/60 hover:bg-primary/5 transition-all"
        >
          <ListPlus className="h-4 w-4" />
          Add component (sub-part)
        </button>
      )}
    </div>
  );
}

export default function WorkTemplatesPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [newTemplateName, setNewTemplateName] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const { data: templates = [], isLoading } = useQuery({
    queryKey: ["/api/work/templates"],
    queryFn: fetchTemplates,
  });

  const { data: allProducts = [] } = useQuery<Product[]>({
    queryKey: ["/api/products"],
    queryFn: fetchProducts,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["/api/work/templates"] });

  const createTemplate = useMutation({
    mutationFn: async (name: string) => {
      const res = await fetch("/api/work/templates", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onSuccess: (data: Template) => {
      invalidate();
      setCreateOpen(false);
      setNewTemplateName("");
      setExpandedId(data.id);
      toast({ title: "Template created — now add sub-components below!" });
    },
    onError: () => toast({ title: "Failed to create template", variant: "destructive" }),
  });

  const deleteTemplate = useMutation({
    mutationFn: async (id: number) => {
      await fetch(`/api/work/templates/${id}`, { method: "DELETE", credentials: "include" });
    },
    onSuccess: () => { invalidate(); toast({ title: "Template deleted" }); },
    onError: () => toast({ title: "Failed to delete", variant: "destructive" }),
  });

  if (user?.role !== "admin") {
    return <div className="p-6 text-center text-muted-foreground mt-20"><p>Admin only</p></div>;
  }

  return (
    <div className="p-4 space-y-4 pb-24">
      <div className="flex items-center justify-between pt-2">
        <div>
          <h1 className="text-2xl font-black">Item Templates</h1>
          <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Admin Only</p>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="font-bold gap-1">
              <Plus className="h-4 w-4" /> New
            </Button>
          </DialogTrigger>
          <DialogContent className="w-[90vw] max-w-sm rounded-xl">
            <DialogHeader>
              <DialogTitle>New Item Template</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-bold">Template Name</label>
                <Input
                  value={newTemplateName}
                  onChange={(e) => setNewTemplateName(e.target.value)}
                  placeholder="e.g. Standard Assembly, Widget A"
                  className="h-12 border-2"
                  onKeyDown={(e) => { if (e.key === "Enter" && newTemplateName.trim()) createTemplate.mutate(newTemplateName.trim()); }}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Creates a final product automatically. After creating, you can add manufactured sub-parts and their procedures directly on this page.
              </p>
              <Button
                className="w-full h-12 font-bold"
                disabled={!newTemplateName.trim() || createTemplate.isPending}
                onClick={() => createTemplate.mutate(newTemplateName.trim())}
              >
                {createTemplate.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Create Template
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">
        <p className="font-semibold mb-0.5">How templates work</p>
        <p className="text-xs">Each template is a final product. Expand it to define its bill of materials — the manufactured sub-parts (and their production procedures) that get created as sub-items when you start a work order.</p>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2].map((i) => <div key={i} className="h-20 bg-muted/40 rounded-xl animate-pulse" />)}
        </div>
      ) : templates.length === 0 ? (
        <div className="text-center py-16 px-4 bg-muted/30 rounded-xl border border-dashed">
          <Package className="h-10 w-10 mx-auto mb-3 text-muted-foreground" />
          <p className="font-semibold">No templates yet</p>
          <p className="text-sm text-muted-foreground mt-1">Create templates to use when creating work orders.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {templates.map((template) => {
            const isExpanded = expandedId === template.id;
            return (
              <div key={template.id} className="bg-card border-2 border-border rounded-xl overflow-hidden">
                <button
                  className="w-full flex items-center justify-between p-4 text-left hover:bg-muted/30 transition-colors"
                  onClick={() => setExpandedId(isExpanded ? null : template.id)}
                >
                  <div className="flex items-center gap-3">
                    {isExpanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                    <div>
                      <h3 className="font-bold text-base">{template.name}</h3>
                      <p className="text-xs text-muted-foreground mt-0.5">Final product · tap to manage components</p>
                    </div>
                  </div>
                  <button
                    className="p-2 text-destructive hover:text-destructive/80 hover:bg-destructive/10 rounded-lg z-10"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (confirm(`Delete template "${template.name}"?`)) {
                        deleteTemplate.mutate(template.id);
                        if (expandedId === template.id) setExpandedId(null);
                      }
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </button>

                {isExpanded && (
                  <div className="border-t-2 border-border">
                    <TemplateBOM template={template} allProducts={allProducts} />
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
