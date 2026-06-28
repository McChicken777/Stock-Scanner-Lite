import { useEffect, useState } from "react";
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
});

type FormValues = z.infer<typeof formSchema>;

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

// ─── Per-supplier SKU panel (edit mode, purchased parts) ──────────────────────

interface SupplierSkuRow { supplierId: number; supplierName: string | null; supplierSku: string | null }

function SupplierSkuPanel({ productId, category }: { productId: number; category: string }) {
  const { t } = useLang();
  const { data: categorySuppliers = [] } = useQuery<{ id: number; name: string; categories?: string[] }[]>({
    queryKey: ["/api/suppliers/by-categories", category],
    queryFn: () => {
      if (!category) return Promise.resolve([]);
      const params = new URLSearchParams();
      params.append("cats[]", category);
      return fetch(`/api/suppliers/by-categories?${params.toString()}`, { credentials: "include" }).then((r) => r.json());
    },
    enabled: !!category,
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

  return (
    <div className="space-y-3 p-4 bg-muted/30 border-2 border-border/60 rounded-xl">
      <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
        {t("prodSkusPerSupplier")}
      </p>
      <p className="text-xs text-muted-foreground -mt-1">
        {t("prodSkusPerSupplierHint")}
      </p>
      {!category ? (
        <p className="text-xs text-muted-foreground italic">{t("prodSkusSelectCategory")}</p>
      ) : categorySuppliers.length === 0 ? (
        <p className="text-xs text-amber-600">{t("prodSkusNoSuppliersPre")}"{category}"{t("prodSkusNoSuppliersPost")}</p>
      ) : (
        <div className="space-y-2">
          {categorySuppliers.map((s) => {
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
      )}
    </div>
  );
}

function SupplierSkuField({
  supplierId, supplierName, initialSku, savedFlash, onBlur,
}: { supplierId: number; supplierName: string; initialSku: string; savedFlash: boolean; onBlur: (id: number, sku: string) => Promise<void> }) {
  const { t } = useLang();
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
        placeholder={t("prodSkuOptional")}
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

  const { data: product, isLoading: isProductLoading } = useGetProduct(productId, {
    query: { enabled: isEdit, queryKey: [`/api/products/${productId}`] }
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
    },
  });

  const watchedItemType = form.watch("itemType");
  const watchedCategory = form.watch("category");
  const isPurchased = watchedItemType === "purchased_part";

  useEffect(() => {
    if (product && isEdit) {
      const p = product as Product;
      form.reset({
        name: p.name,
        itemType: normalizeItemType(p.itemType),
        category: p.category || "",
      });
    }
  }, [product, isEdit, form]);

  const onSubmit = async (data: FormValues) => {
    const payload = {
      name: data.name,
      category: data.category || "",
      itemType: data.itemType,
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
      toast({ title: isEdit ? t("prodUpdated") : t("prodCreated") });
      setLocation("/products");
    } catch {
      toast({ title: isEdit ? t("prodUpdateFailed") : t("prodCreateFailed"), variant: "destructive" });
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
                            <p className="text-xs opacity-80">{type.value === "purchased_part" ? t("prodTypePurchasedDesc") : type.value === "manufactured_part" ? t("prodTypeManufacturedDesc") : t("prodTypeFinalDesc")}</p>
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
                  <FormLabel className="text-sm font-bold uppercase tracking-wider text-muted-foreground">{t("prodName")}</FormLabel>
                  <FormControl>
                    <Input placeholder={t("prodNamePlaceholder")} className="h-14 text-lg border-2 shadow-sm" {...field} />
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
                  <FormControl>
                    <select className="w-full h-12 px-3 border-2 rounded-lg text-base shadow-sm bg-background" {...field}>
                      <option value="">{t("prodSelectCategory")}</option>
                      {field.value && !categories.includes(field.value) && (
                        <option value={field.value}>{field.value}</option>
                      )}
                      {categories.map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </FormControl>
                  <p className="text-xs text-muted-foreground mt-1">{t("prodCategoryHint")}</p>
                  <FormMessage />
                </FormItem>
              )}
            />

            {isEdit && isPurchased && <SupplierSkuPanel productId={productId} category={watchedCategory} />}

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
