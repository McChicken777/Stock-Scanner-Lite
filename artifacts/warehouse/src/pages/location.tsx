import { useState, useRef } from "react";
import { useRoute } from "wouter";
import { useLang } from "@/contexts/lang";
import { MapPin, Plus, Minus, Search, ArrowLeft, Loader2, Layers } from "lucide-react";
import { useGetLocation, useUpdateStock, useListProducts, getGetLocationQueryKey, getListProductsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/auth";
import { Link } from "wouter";

function StockItem({
  locationId,
  productId,
  productName,
  category,
  quantity,
  bufferStock,
  reserved = 0,
  available,
}: {
  locationId: string,
  productId: number,
  productName: string,
  category: string,
  quantity: number,
  bufferStock: number,
  reserved?: number,
  available?: number,
}) {
  const [optimisticQty, setOptimisticQty] = useState(quantity);
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState("");
  const updateStock = useUpdateStock();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { t } = useLang();
  const { user } = useAuth();

  // Ref for debouncing rapidly tapped buttons
  const timeoutRef = useRef<NodeJS.Timeout | undefined>(undefined);
  // Reason for the pending change — "adjusted" for +/- taps, "counted" for a typed count
  const reasonRef = useRef<string>("adjusted");

  const handleUpdate = (newQty: number, reason: string = "adjusted") => {
    // Optimistic UI update immediately
    setOptimisticQty(newQty);
    reasonRef.current = reason;

    // Clear previous timeout
    if (timeoutRef.current) clearTimeout(timeoutRef.current);

    // Debounce the actual API call
    timeoutRef.current = setTimeout(() => {
      updateStock.mutate(
        { locationId, productId, data: { quantity: newQty, changedBy: user?.username ?? null, reason: reasonRef.current } },
        {
          onSuccess: () => {
            // Revalidate to get the fresh data
            queryClient.invalidateQueries({ queryKey: getGetLocationQueryKey(locationId) });
          },
          onError: () => {
            // Revert on error
            setOptimisticQty(quantity);
            toast({
              title: t("locationUpdateFailed"),
              description: t("locationUpdateFailedDesc"),
              variant: "destructive",
            });
          }
        }
      );
    }, 500);
  };

  const handleSaveEdit = () => {
    const parsed = parseFloat(editValue);
    if (!isNaN(parsed) && parsed >= 0) {
      handleUpdate(parsed, "counted");
    }
    setIsEditing(false);
  };

  const isLow = optimisticQty < bufferStock;

  return (
    <Card className={`border-2 ${isLow ? 'border-destructive/30 bg-destructive/5' : 'border-border'} overflow-hidden`}>
      <CardContent className="p-0">
        <div className="p-4 border-b border-border/50 bg-background/50 flex justify-between items-start">
          <div>
            <h3 className="font-bold text-lg leading-tight">{productName}</h3>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <span className="text-xs font-medium px-2 py-0.5 bg-secondary text-secondary-foreground rounded-full">
                {category}
              </span>
              <span className="text-xs text-muted-foreground">
                Min: {bufferStock}
              </span>
              {reserved > 0 && (
                <span
                  title="Committed to active jobs across all locations"
                  className="text-xs font-semibold px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full"
                >
                  {reserved} reserved · {available ?? 0} free
                </span>
              )}
            </div>
          </div>
          {isLow && (
            <span className="text-xs font-bold text-destructive uppercase tracking-wider">
              Low Stock
            </span>
          )}
        </div>
        
        <div className="flex h-20 items-stretch bg-background">
          <button 
            onClick={() => optimisticQty > 0 && handleUpdate(optimisticQty - 1)}
            disabled={optimisticQty <= 0}
            className="flex-1 flex justify-center items-center bg-secondary/10 hover:bg-secondary/20 active:bg-secondary/30 transition-colors disabled:opacity-50 disabled:pointer-events-none"
            aria-label="Decrease quantity"
          >
            <Minus className="h-8 w-8 text-secondary-foreground/70" />
          </button>
          
          <div className="w-32 flex flex-col justify-center items-center border-x border-border font-mono relative">
            {isEditing ? (
              <div className="absolute inset-0 bg-background z-10 flex flex-col p-1">
                <div className="flex h-full gap-1">
                  <Input 
                    type="number" 
                    value={editValue} 
                    onChange={e => setEditValue(e.target.value)}
                    className="h-full text-xl text-center rounded-none border-primary font-bold"
                    autoFocus
                    onKeyDown={e => {
                      if (e.key === 'Enter') handleSaveEdit();
                      if (e.key === 'Escape') setIsEditing(false);
                    }}
                  />
                  <Button onClick={handleSaveEdit} className="h-full px-2 rounded-none">OK</Button>
                </div>
              </div>
            ) : (
              <div 
                className="text-4xl font-black cursor-pointer hover:text-primary transition-colors"
                onClick={() => {
                  setEditValue(optimisticQty.toString());
                  setIsEditing(true);
                }}
              >
                {optimisticQty}
              </div>
            )}
          </div>
          
          <button 
            onClick={() => handleUpdate(optimisticQty + 1)}
            className="flex-1 flex justify-center items-center bg-primary/10 hover:bg-primary/20 active:bg-primary/30 text-primary transition-colors"
            aria-label="Increase quantity"
          >
            <Plus className="h-8 w-8" />
          </button>
        </div>
      </CardContent>
    </Card>
  );
}

function FillStockDialog({ locationId, currentStock }: {
  locationId: string;
  currentStock: Array<{ productId: number; quantity: number }>;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [qtys, setQtys] = useState<Record<number, string>>({});
  const [saving, setSaving] = useState(false);
  const { data: products, isLoading } = useListProducts({ query: { queryKey: getListProductsQueryKey(), enabled: open } });
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { user } = useAuth();

  function onOpenChange(v: boolean) {
    setOpen(v);
    if (v) {
      // Pre-fill current quantities
      const initial: Record<number, string> = {};
      for (const s of currentStock) initial[s.productId] = String(s.quantity);
      setQtys(initial);
      setSearch("");
    }
  }

  const currentMap = new Map(currentStock.map((s) => [s.productId, s.quantity]));
  const filtered = products?.filter((p) =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    p.category.toLowerCase().includes(search.toLowerCase())
  ) ?? [];
  // Show products already stocked first
  const sorted = [...filtered].sort((a, b) => {
    const aHas = currentMap.has(a.id) ? 0 : 1;
    const bHas = currentMap.has(b.id) ? 0 : 1;
    return aHas - bHas;
  });

  async function handleSave() {
    const entries: Array<{ locationId: string; productId: number; quantity: number; changedBy: string | null }> = [];
    for (const [pidStr, qtyStr] of Object.entries(qtys)) {
      const productId = Number(pidStr);
      const qty = parseFloat(qtyStr);
      if (isNaN(qty) || qty < 0) continue;
      const current = currentMap.get(productId) ?? -1;
      if (qty === current) continue; // unchanged
      entries.push({ locationId, productId, quantity: qty, changedBy: user?.username ?? null });
    }
    if (entries.length === 0) { setOpen(false); return; }

    setSaving(true);
    try {
      const res = await fetch("/api/stock/bulk", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entries, reason: "counted" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      queryClient.invalidateQueries({ queryKey: getGetLocationQueryKey(locationId) });
      toast({ title: `Stock updated — ${data.inserted + data.updated} product${data.inserted + data.updated !== 1 ? "s" : ""} set` });
      setOpen(false);
    } catch (err) {
      toast({ title: err instanceof Error ? err.message : "Failed", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  const changedCount = Object.entries(qtys).filter(([pid, qtyStr]) => {
    const qty = parseFloat(qtyStr);
    return !isNaN(qty) && qty >= 0 && qty !== (currentMap.get(Number(pid)) ?? -1);
  }).length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button size="lg" variant="outline" className="w-full h-12 text-sm font-bold border-2 gap-2">
          <Layers className="h-5 w-5" /> Set quantities
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md max-h-[85vh] flex flex-col p-0">
        <DialogHeader className="p-4 border-b">
          <DialogTitle>Set stock quantities</DialogTitle>
        </DialogHeader>
        <div className="p-4 border-b bg-muted/30">
          <div className="relative">
            <Search className="absolute left-3 top-3 h-5 w-5 text-muted-foreground" />
            <Input
              placeholder="Search products..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10 h-11"
            />
          </div>
        </div>
        <div className="overflow-y-auto flex-1 p-3 space-y-1.5">
          {isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-14 w-full" />)}
            </div>
          ) : sorted.length === 0 ? (
            <p className="text-center text-muted-foreground py-8 text-sm">No products found</p>
          ) : sorted.map((p) => {
            const current = currentMap.get(p.id);
            const val = qtys[p.id] ?? "";
            const changed = val !== "" && parseFloat(val) !== (current ?? -1);
            return (
              <div key={p.id} className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border ${changed ? "border-primary bg-primary/5" : "border-border"}`}>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm truncate">{p.name}</p>
                  <p className="text-xs text-muted-foreground">{p.category}{current !== undefined ? ` · currently ${current}` : ""}</p>
                </div>
                <Input
                  type="number"
                  min="0"
                  value={val}
                  placeholder={current !== undefined ? String(current) : "0"}
                  onChange={(e) => setQtys((prev) => ({ ...prev, [p.id]: e.target.value }))}
                  onFocus={(e) => e.target.select()}
                  onWheel={(e) => (e.target as HTMLInputElement).blur()}
                  className="w-20 h-9 text-center font-bold border-2"
                />
              </div>
            );
          })}
        </div>
        <div className="p-4 border-t bg-background flex gap-3">
          <Button variant="outline" className="flex-1" onClick={() => setOpen(false)}>Cancel</Button>
          <Button className="flex-1 font-bold gap-1.5" onClick={handleSave} disabled={saving || changedCount === 0}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {changedCount > 0 ? `Save ${changedCount} change${changedCount !== 1 ? "s" : ""}` : "No changes"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function AddProductDialog({ locationId }: { locationId: string }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const { data: products, isLoading } = useListProducts({ query: { queryKey: getListProductsQueryKey(), enabled: open } });
  const updateStock = useUpdateStock();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { t } = useLang();

  const filteredProducts = products?.filter(p => 
    p.name.toLowerCase().includes(search.toLowerCase()) || 
    p.category.toLowerCase().includes(search.toLowerCase())
  );

  const handleAdd = (productId: number) => {
    updateStock.mutate(
      { locationId, productId, data: { quantity: 1 } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetLocationQueryKey(locationId) });
          toast({ title: t("locationProductAdded"), description: t("locationProductAddedDesc") });
          setOpen(false);
        }
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="lg" className="w-full h-14 text-lg font-bold">
          <Plus className="mr-2 h-6 w-6" /> {t("locationAddProduct")}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md max-h-[80vh] flex flex-col p-0">
        <DialogHeader className="p-4 border-b">
          <DialogTitle>Add Product</DialogTitle>
        </DialogHeader>
        <div className="p-4 border-b bg-muted/30">
          <div className="relative">
            <Search className="absolute left-3 top-3 h-5 w-5 text-muted-foreground" />
            <Input
              placeholder="Search products..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10 h-12 text-lg"
            />
          </div>
        </div>
        <div className="overflow-y-auto p-4 flex-1">
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map(i => <Skeleton key={i} className="h-16 w-full" />)}
            </div>
          ) : filteredProducts?.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">No products found</p>
          ) : (
            <div className="space-y-2">
              {filteredProducts?.map(product => (
                <button
                  key={product.id}
                  onClick={() => handleAdd(product.id)}
                  className="w-full flex items-center justify-between p-3 rounded-lg border text-left hover:border-primary hover:bg-primary/5 transition-colors"
                >
                  <div>
                    <p className="font-bold">{product.name}</p>
                    <p className="text-xs text-muted-foreground">{product.category}</p>
                  </div>
                  <Plus className="h-5 w-5 text-primary" />
                </button>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function LocationPage() {
  const [, params] = useRoute("/location/:id");
  const id = params?.id ? decodeURIComponent(params.id) : "";
  const { t } = useLang();
  
  const { data: location, isLoading, isError } = useGetLocation(id, {
    query: { 
      enabled: !!id,
      queryKey: getGetLocationQueryKey(id)
    }
  });

  if (isLoading) {
    return (
      <div className="p-4 space-y-6">
        <div className="flex items-center gap-4">
          <Skeleton className="h-10 w-10 rounded-full" />
          <Skeleton className="h-10 w-48" />
        </div>
        <div className="space-y-4">
          <Skeleton className="h-32 w-full rounded-xl" />
          <Skeleton className="h-32 w-full rounded-xl" />
        </div>
      </div>
    );
  }

  if (isError || !location) {
    return (
      <div className="p-4 flex flex-col items-center justify-center min-h-[60vh] text-center space-y-4">
        <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center">
          <MapPin className="h-8 w-8 text-muted-foreground" />
        </div>
        <div>
          <h2 className="text-2xl font-bold">{t("locationNotFound")}</h2>
          <p className="text-muted-foreground mt-1">ID: {id}</p>
        </div>
        <Link href="/scan">
          <Button size="lg" className="mt-4">{t("locationBackToScanner")}</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-full pb-6">
      <div className="bg-secondary text-secondary-foreground p-4 sticky top-0 z-20 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/" className="p-2 -ml-2 rounded-full hover:bg-secondary-foreground/10 transition-colors">
              <ArrowLeft className="h-6 w-6" />
            </Link>
            <div>
              <p className="text-xs font-bold text-secondary-foreground/60 uppercase tracking-widest mb-0.5">{t("locationLabel")}</p>
              <h1 className="text-2xl font-black leading-none">{location.id}</h1>
            </div>
          </div>
        </div>
        {location.description && (
          <p className="mt-3 text-sm text-secondary-foreground/80">{location.description}</p>
        )}
      </div>

      <div className="p-4 space-y-4">
        {location.stock.length === 0 ? (
          <div className="bg-muted/30 border-2 border-dashed border-muted-foreground/30 rounded-xl p-8 text-center">
            <p className="text-muted-foreground font-medium mb-4">{t("locationNoProducts")}</p>
            <div className="space-y-2">
              <AddProductDialog locationId={location.id} />
              <FillStockDialog locationId={location.id} currentStock={[]} />
            </div>
          </div>
        ) : (
          <>
            <div className="space-y-4">
              {location.stock.map((item) => (
                <StockItem
                  key={`${item.locationId}-${item.productId}`}
                  locationId={item.locationId}
                  productId={item.productId}
                  productName={item.productName}
                  category={item.productCategory}
                  quantity={item.quantity}
                  bufferStock={item.bufferStock}
                  reserved={item.reserved}
                  available={item.available}
                />
              ))}
            </div>

            <div className="pt-4 space-y-2">
              <AddProductDialog locationId={location.id} />
              <FillStockDialog
                locationId={location.id}
                currentStock={location.stock.map((s) => ({ productId: s.productId, quantity: s.quantity }))}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}