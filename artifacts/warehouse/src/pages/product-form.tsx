import { useEffect, useRef } from "react";
import { useRoute, useLocation, Link } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ArrowLeft, Save, ShoppingCart, Factory, Package } from "lucide-react";
import { useCreateProduct, useUpdateProduct, useGetProduct } from "@workspace/api-client-react";
import type { Product } from "@workspace/api-client-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/auth";
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
  minStock: z.coerce.number().min(0, "Must be positive"),
  bufferStock: z.coerce.number().min(0, "Must be positive"),
  targetStock: z.coerce.number().min(0, "Must be positive"),
  unitCost: z.coerce.number().min(0, "Must be positive").default(0),
  salePrice: z.coerce.number().min(0, "Must be positive").default(0),
  supplierId: z.coerce.number().optional().or(z.literal("")),
  supplierProductName: z.string().optional().or(z.literal("")),
  supplierSku: z.string().optional().or(z.literal("")),
  alertEmail: z.string().email("Invalid email").optional().or(z.literal("")),
});

type FormValues = z.infer<typeof formSchema>;

interface Supplier {
  id: number;
  name: string;
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

export default function ProductFormPage() {
  const [, params] = useRoute("/products/:id/edit");
  const isEdit = !!params?.id;
  const productId = isEdit ? parseInt(params.id!, 10) : 0;
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();
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

  const createProduct = useCreateProduct();
  const updateProduct = useUpdateProduct();

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      itemType: "purchased_part",
      category: "",
      minStock: 0,
      bufferStock: 0,
      targetStock: 0,
      unitCost: 0,
      salePrice: 0,
      supplierId: "",
      supplierProductName: "",
      supplierSku: "",
      alertEmail: "",
    },
  });

  const watchedItemType = form.watch("itemType");
  const isPurchased = watchedItemType === "purchased_part";

  useEffect(() => {
    if (product && isEdit) {
      const p = product as Product;
      form.reset({
        name: p.name,
        itemType: normalizeItemType(p.itemType),
        category: p.category || "",
        minStock: (p as Product & { minStock?: number }).minStock ?? 0,
        bufferStock: p.bufferStock,
        targetStock: p.targetStock || 0,
        unitCost: (p as Product & { unitCost?: number }).unitCost ?? 0,
        salePrice: (p as Product & { salePrice?: number }).salePrice ?? 0,
        supplierId: p.supplierId ?? "",
        supplierProductName: p.supplierProductName || "",
        supplierSku: p.supplierSku || "",
        alertEmail: p.alertEmail || "",
      });
    }
  }, [product, isEdit, form]);

  const onSubmit = (data: FormValues) => {
    const payload = {
      ...data,
      category: data.category || "",
      minStock: data.minStock,
      supplierId: isPurchased && data.supplierId ? parseInt(String(data.supplierId)) : null,
      supplierProductName: isPurchased ? (data.supplierProductName || null) : null,
      supplierSku: isPurchased ? (data.supplierSku || null) : null,
      alertEmail: data.alertEmail || null,
      unitCost: data.unitCost ?? 0,
      salePrice: data.salePrice ?? 0,
    };

    if (isEdit) {
      updateProduct.mutate(
        { productId, data: payload },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["/api/products"] });
            queryClient.invalidateQueries({ queryKey: ["product-categories"] });
            toast({ title: "Product updated successfully" });
            setLocation("/products");
          },
          onError: () => toast({ title: "Failed to update product", variant: "destructive" })
        }
      );
    } else {
      createProduct.mutate(
        { data: payload },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["/api/products"] });
            queryClient.invalidateQueries({ queryKey: ["product-categories"] });
            toast({ title: "Product created successfully" });
            setLocation("/products");
          },
          onError: () => toast({ title: "Failed to create product", variant: "destructive" })
        }
      );
    }
  };

  const isPending = createProduct.isPending || updateProduct.isPending;

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

            <div className="grid grid-cols-3 gap-3">
              <FormField
                control={form.control}
                name="minStock"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{t("productsReorderAt")}</FormLabel>
                    <FormControl>
                      <Input type="number" min="0" className="h-12 text-base border-2 shadow-sm font-mono" {...field} />
                    </FormControl>
                    <p className="text-[10px] text-muted-foreground mt-1">Trigger reorder</p>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="bufferStock"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{t("productsAlertAt")}</FormLabel>
                    <FormControl>
                      <Input type="number" min="0" className="h-12 text-base border-2 shadow-sm font-mono" {...field} />
                    </FormControl>
                    <p className="text-[10px] text-muted-foreground mt-1">Email alert below</p>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="targetStock"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{t("productsTarget")}</FormLabel>
                    <FormControl>
                      <Input type="number" min="0" className="h-12 text-base border-2 shadow-sm font-mono" {...field} />
                    </FormControl>
                    <p className="text-[10px] text-muted-foreground mt-1">Restock to this</p>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

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
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="unitCost"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm font-bold uppercase tracking-wider text-muted-foreground">{t("productsUnitCost")}</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder="0.00"
                        className="h-12 text-base border-2 shadow-sm font-mono"
                        {...field}
                      />
                    </FormControl>
                    <p className="text-xs text-muted-foreground mt-1">Inventory valuation</p>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="salePrice"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm font-bold uppercase tracking-wider text-muted-foreground">{t("productsSalePrice")}</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder="0.00"
                        className="h-12 text-base border-2 shadow-sm font-mono"
                        {...field}
                      />
                    </FormControl>
                    <p className="text-xs text-muted-foreground mt-1">Customer price — for margin</p>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {(() => {
              const cost = Number(form.watch("unitCost") || 0);
              const price = Number(form.watch("salePrice") || 0);
              if (price <= 0) return null;
              const margin = price - cost;
              const pct = price > 0 ? (margin / price) * 100 : 0;
              return (
                <div className="flex items-center justify-between p-3 bg-emerald-50 border-2 border-emerald-100 rounded-xl">
                  <span className="text-xs font-bold uppercase tracking-wider text-emerald-700">Gross margin / unit</span>
                  <span className="font-mono font-bold text-emerald-700">${margin.toFixed(2)} ({pct.toFixed(1)}%)</span>
                </div>
              );
            })()}

            <FormField
              control={form.control}
              name="alertEmail"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Low Stock Alert Email</FormLabel>
                  <FormControl>
                    <Input type="email" placeholder="manager@warehouse.com" className="h-14 text-lg border-2 shadow-sm" {...field} />
                  </FormControl>
                  <p className="text-xs text-muted-foreground mt-1.5">
                    Receive an email when stock drops below the minimum level
                  </p>
                  <FormMessage />
                </FormItem>
              )}
            />

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
