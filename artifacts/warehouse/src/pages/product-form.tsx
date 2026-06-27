import { useEffect, useRef, useState } from "react";
import { useRoute, useLocation, Link } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ArrowLeft, Save, ShoppingCart, Factory, Package, Check } from "lucide-react";
import { useGetProduct } from "@workspace/api-client-react";
import type { Product } from "@workspace/api-client-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/auth";
import { usePlan } from "@/contexts/auth";
import { useLang } from "@/contexts/lang";

const ITEM_TYPES = [
  {
    value: "purchased_part",
    label: "Purchased Part",
    description: "Sourced from external suppliers, tracked in stock",
    icon: ShoppingCart,
    color: "border-blue-500 bg-blue-50 text-blue-700",
  },
  {
    value: "manufactured_part",
    label: "Manufactured Part",
    description: "Made in-house as a sub-component for final products",
    icon: Factory,
    color: "border-orange-500 bg-orange-50 text-orange-700",
  },
  {
    value: "final_product",
    label: "Final Product",
    description: "Finished goods delivered to customers",
    icon: Package,
    color: "border-green-500 bg-green-50 text-green-700",
  },
] as const;

type ItemType = "purchased_part" | "manufactured_part" | "final_product";

const formSchema = z.object({
  name: z.string().min(2, "Name is required"),
  itemType: z.enum(["purchased_part", "manufactured_part", "final_product"]).default("purchased_part"),
  category: z.string().default(""),
  supplierId: z.coerce.number().optional().or(z.literal("")),
  supplierProductName: z.string().optional().or(z.literal("")),
  supplierSku: z.string().optional().or(z.literal("")),
  storeProductUrl: z.string().url("Enter a valid URL").optional().or(z.literal("")),
});

type FormValues = z.infer<typeof formSchema>;

interface Supplier {
  id: number;
  name: string;
  orderMethod?: string;
  storePlatform?: string | null;
}

async function fetchSuppliers(): Promise<Supplier[]> {
  const res = await fetch("/api/suppliers", { credentials: "include" });
  if (!res.ok) throw new Error("Failed");
  return res.json();
}

async function fetchCategories(): Promise<string[]> {
  const res = await fetch("/api/products/categories", { credentials: "include" });
  if (!res.ok) return [];
  return res.json();
}

function normalizeItemType(raw: string | undefined | null): ItemType {
  if (raw === "purchase") return "purchased_part";
  if (raw === "production") return "manufactured_part";
  if (raw === "purchased_part" || raw === "manufactured_part" || raw === "final_product") return raw;
  return "purchased_part";
}

// ─── Per-supplier SKU panel (edit mode only) ───────────────────────────────────
// Set once here; auto-fills the supplier's quote form so they just enter the price.

interface SupplierSkuRow { supplierId: number; supplierName: string | null; supplierSku: string | null }

function SupplierSkuPanel({ productId }: { productId: number }) {
  const { data: allSuppliers = [] } = useQuery<{ id: number; name: string }[]>({
    queryKey: ["suppliers"],
    queryFn: () => fetch("/api/suppliers", { credentials: "include" }).then((r) => r.json()),
  });
  const { data: existing = [], refetch } = useQuery<SupplierSkuRow[]>({
    queryKey: [`/api/products/${productId}/supplier-skus`],
    queryFn: () => fetch(`/api/products/${productId}/supplier-skus`, { credentials: "include" }).then((r) => r.json()),
    enabled: productId > 0,
  });

  const [saved, setSaved] = useState<Set<number>>(new Set());
  const skuBySupplier = new Map(existing.map((r) => [r.supplierId, r.supplierSku ?? ""]));

  async function upsert(supplierId: number, sku: string) {
    if (sku.trim()) {
      await fetch(`/api/suppliers/${supplierId}/products`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId, supplierSku: sku.trim() }),
      });
    } else {
      await fetch(`/api/suppliers/${supplierId}/products/${productId}`, { method: "DELETE", credentials: "include" });
    }
    await refetch();
    setSaved((s) => new Set([...s, supplierId]));
    setTimeout(() => setSaved((s) => { const n = new Set(s); n.delete(supplierId); return n; }), 1500);
  }

  if (allSuppliers.length === 0) return null;

  return (
    <div className="space-y-3 p-4 bg-muted/30 border-2 border-border/60 rounded-xl">
      <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
        SKUs per supplier
      </p>
      <p className="text-xs text-muted-foreground -mt-1">
        Set your SKU for each supplier once — it pre-fills their quote form automatically.
      </p>
      <div className="space-y-2">
        {allSuppliers.map((s) => {
          const current = skuBySupplier.get(s.id) ?? "";
          return (
            <SupplierSkuField
              key={s.id}
              supplierId={s.id}
              supplierName={s.name}
              initialSku={current}
              savedFlash={saved.has(s.id)}
              onBlur={upsert}
            />
          );
        })}
      </div>
    </div>
  );
}

function SupplierSkuField({
  supplierId, supplierName, initialSku, savedFlash, onBlur,
}: { supplierId: number; supplierName: string; initialSku: string; savedFlash: boolean; onBlur: (id: number, sku: string) => Promise<void> }) {
  const [value, setValue] = useState(initialSku);
  useEffect(() => { setValue(initialSku); }, [initialSku]);

  async function handleBlur() {
    if (value !== initialSku) await onBlur(supplierId, value);
  }

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs font-medium text-muted-foreground w-28 flex-shrink-0 truncate">{supplierName}</span>
      <Input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={handleBlur}
        placeholder="SKU (optional)"
        className="h-8 border-2 font-mono text-sm flex-1"
      />
      {savedFlash && <Check className="h-4 w-4 text-green-500 flex-shrink-0" />}
    </div>
  );
}

export default function ProductFormPage() {
  const [, params] = useRoute("/products/:id/edit");
  const isEdit = !!params?.id;
  const productId = isEdit ? parseInt(params.id!, 10) : 0;
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { atLeast } = usePlan();
  const { t } = useLang();
  const isAdmin = user?.role === "admin" || user?.role === "owner";
  const categoryListId = useRef(`cat-list-${Math.random().toString(36).slice(2)}`).current;

  const { data: product, isLoading: isProductLoading } = useGetProduct(productId, {
    query: { enabled: isEdit, queryKey: [`/api/products/${productId}`] }
  });

  const { data: suppliers = [] } = useQuery({
    queryKey: ["suppliers"],
    queryFn: fetchSuppliers,
  });

  const { data: categories = [] } = useQuery({
    queryKey: ["product-categories"],
    queryFn: fetchCategories,
  });

  const [isSaving, setIsSaving] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      itemType: "purchased_part",
      category: "",
      supplierId: "",
      supplierProductName: "",
      supplierSku: "",
      storeProductUrl: "",
    },
  });

  const watchedItemType = form.watch("itemType");
  const isPurchased = watchedItemType === "purchased_part";
  const watchedSupplierId = form.watch("supplierId");
  const selectedSupplier = suppliers.find((s) => s.id === Number(watchedSupplierId));
  const isWebStoreSupplier = selectedSupplier?.orderMethod === "web_store";

  useEffect(() => {
    if (product && isEdit) {
      const p = product as Product;
      form.reset({
        name: p.name,
        itemType: normalizeItemType(p.itemType),
        category: p.category || "",
        supplierId: p.supplierId ?? "",
        supplierProductName: p.supplierProductName || "",
        supplierSku: p.supplierSku || "",
        storeProductUrl: (p as Product & { storeProductUrl?: string | null }).storeProductUrl || "",
      });
    }
  }, [product, isEdit, form]);

  const onSubmit = async (data: FormValues) => {
    const linkedSupplier = isPurchased && data.supplierId ? parseInt(String(data.supplierId)) : null;
    const payload = {
      name: data.name,
      category: data.category || "",
      itemType: data.itemType,
      supplierId: linkedSupplier,
      // For email suppliers we keep the SKU + supplier product name; for web-store
      // suppliers we keep the per-product link instead.
      supplierProductName: linkedSupplier && !isWebStoreSupplier ? (data.supplierProductName || null) : null,
      supplierSku: linkedSupplier && !isWebStoreSupplier ? (data.supplierSku || null) : null,
      storeProductUrl: linkedSupplier && isWebStoreSupplier ? (data.storeProductUrl || null) : null,
    };

    setIsSaving(true);
    try {
      const res = await fetch(isEdit ? `/api/products/${productId}` : "/api/products", {
        method: isEdit ? "PUT" : "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || "Failed");
      }
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      queryClient.invalidateQueries({ queryKey: ["product-categories"] });
      toast({ title: isEdit ? "Product updated successfully" : "Product created successfully" });
      setLocation("/products");
    } catch {
      toast({ title: isEdit ? "Failed to update product" : "Failed to create product", variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  const isPending = isSaving;

  if (!isAdmin) {
    return (
      <div className="p-6 text-center text-muted-foreground mt-20">
        <p className="font-semibold">{t("accessDenied")}</p>
        <p className="text-sm mt-1">{t("adminOnly")}</p>
      </div>
    );
  }

  if (isEdit && isProductLoading) {
    return (
      <div className="p-4 space-y-6">
        <Skeleton className="h-10 w-48" />
        <div className="space-y-4 mt-8">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-full">
      <div className="bg-secondary text-secondary-foreground p-4 sticky top-0 z-20 shadow-sm flex items-center gap-3">
        <Link href="/products" className="p-2 -ml-2 rounded-full hover:bg-secondary-foreground/10 transition-colors">
          <ArrowLeft className="h-6 w-6" />
        </Link>
        <h1 className="text-xl font-bold">{isEdit ? t("productsEditTitle") : t("productsNewTitle")}</h1>
      </div>

      <div className="p-4 flex-1">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">

            {atLeast("standard") && (
            <FormField
              control={form.control}
              name="itemType"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm font-bold uppercase tracking-wider text-muted-foreground">{t("productsItemType")}</FormLabel>
                  <div className="grid grid-cols-1 gap-2">
                    {ITEM_TYPES.map((type) => {
                      const Icon = type.icon;
                      const selected = field.value === type.value;
                      return (
                        <button
                          key={type.value}
                          type="button"
                          onClick={() => field.onChange(type.value)}
                          className={`flex items-center gap-3 p-3 rounded-xl border-2 text-left transition-all ${
                            selected ? type.color + " border-opacity-100" : "border-border bg-muted/20 text-muted-foreground"
                          }`}
                        >
                          <Icon className="h-5 w-5 flex-shrink-0" />
                          <div>
                            <p className="font-bold text-sm">{type.value === "purchased_part" ? t("productsPurchased") : type.value === "manufactured_part" ? t("productsManufactured") : t("productsFinalProduct")}</p>
                            <p className="text-xs opacity-80">{type.description}</p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />
            )}

            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Product Name</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g. 10mm Hex Bolts" className="h-14 text-lg border-2 shadow-sm" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="category"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm font-bold uppercase tracking-wider text-muted-foreground">{t("productsCategory")}</FormLabel>
                  <datalist id={categoryListId}>
                    {categories.map((c) => <option key={c} value={c} />)}
                  </datalist>
                  <FormControl>
                    <Input
                      placeholder="e.g. Fasteners, Hydraulics, Welding Consumables"
                      className="h-12 border-2 shadow-sm"
                      list={categoryListId}
                      {...field}
                    />
                  </FormControl>
                  <p className="text-xs text-muted-foreground mt-1">Groups items together on the products page</p>
                  <FormMessage />
                </FormItem>
              )}
            />

            {isPurchased && (
              <div className="space-y-4 p-4 bg-blue-50/50 border-2 border-blue-100 rounded-xl">
                <p className="text-xs font-bold uppercase tracking-wider text-blue-700">Supplier Information</p>

                <FormField
                  control={form.control}
                  name="supplierId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-sm font-bold text-muted-foreground">{t("productsSupplier")}</FormLabel>
                      <FormControl>
                        <select className="w-full h-12 px-3 border-2 rounded-lg text-base shadow-sm bg-background" {...field}>
                          <option value="">No supplier linked</option>
                          {suppliers.map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.name}
                            </option>
                          ))}
                        </select>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {isWebStoreSupplier ? (
                  <FormField
                    control={form.control}
                    name="storeProductUrl"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-sm font-bold text-muted-foreground">Product Link</FormLabel>
                        <FormControl>
                          <Input
                            type="url"
                            placeholder="Paste the item's product or add-to-cart URL"
                            className="h-12 border-2"
                            {...field}
                          />
                        </FormControl>
                        <p className="text-xs text-muted-foreground mt-1">
                          This supplier takes orders via their web store — reordering opens this link.
                        </p>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                ) : (
                  <>
                    <FormField
                      control={form.control}
                      name="supplierProductName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-sm font-bold text-muted-foreground">Supplier Product Name</FormLabel>
                          <FormControl>
                            <Input placeholder="e.g. M10 Stainless Steel Hex Bolt" className="h-12 border-2" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="supplierSku"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-sm font-bold text-muted-foreground">Supplier SKU</FormLabel>
                          <FormControl>
                            <Input placeholder="e.g. MB-2024-001" className="h-12 border-2 font-mono" {...field} />
                          </FormControl>
                          <p className="text-xs text-muted-foreground mt-1">
                            Included when emailing this supplier an order.
                          </p>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </>
                )}
              </div>
            )}

            {isEdit && isPurchased && <SupplierSkuPanel productId={productId} />}

            <div className="pt-6 pb-8">
              <Button type="submit" size="lg" className="w-full h-14 text-lg font-bold" disabled={isPending}>
                {isPending ? t("saving") : (
                  <>
                    <Save className="mr-2 h-5 w-5" /> {t("save")}
                  </>
                )}
              </Button>
            </div>
          </form>
        </Form>
      </div>
    </div>
  );
}
