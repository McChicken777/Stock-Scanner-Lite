import { useEffect } from "react";
import { useRoute, useLocation, Link } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ArrowLeft, Save } from "lucide-react";
import { useCreateProduct, useUpdateProduct, useGetProduct } from "@workspace/api-client-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/auth";

const formSchema = z.object({
  name: z.string().min(2, "Name is required"),
  category: z.string().min(2, "Category is required"),
  itemType: z.enum(["purchase", "production"]).default("purchase"),
  bufferStock: z.coerce.number().min(0, "Must be positive"),
  targetStock: z.coerce.number().min(0, "Must be positive"),
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

export default function ProductFormPage() {
  const [, params] = useRoute("/products/:id/edit");
  const isEdit = !!params?.id;
  const productId = isEdit ? parseInt(params.id!, 10) : 0;
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  const { data: product, isLoading: isProductLoading } = useGetProduct(productId, {
    query: { enabled: isEdit, queryKey: [`/api/products/${productId}`] }
  });

  const { data: suppliers = [] } = useQuery({
    queryKey: ["suppliers"],
    queryFn: fetchSuppliers,
  });

  const createProduct = useCreateProduct();
  const updateProduct = useUpdateProduct();

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      category: "",
      itemType: "purchase",
      bufferStock: 0,
      targetStock: 0,
      supplierId: "",
      supplierProductName: "",
      supplierSku: "",
      alertEmail: "",
    },
  });

  useEffect(() => {
    if (product && isEdit) {
      form.reset({
        name: product.name,
        category: product.category,
        itemType: (product as any).itemType || "purchase",
        bufferStock: product.bufferStock,
        targetStock: (product as any).targetStock || 0,
        supplierId: (product as any).supplierId ? String((product as any).supplierId) : "",
        supplierProductName: (product as any).supplierProductName || "",
        supplierSku: (product as any).supplierSku || "",
        alertEmail: product.alertEmail || "",
      });
    }
  }, [product, isEdit, form]);

  const onSubmit = (data: FormValues) => {
    const payload = {
      ...data,
      supplierId: data.supplierId ? parseInt(String(data.supplierId)) : null,
      supplierProductName: data.supplierProductName || null,
      supplierSku: data.supplierSku || null,
      alertEmail: data.alertEmail || null,
    };

    if (isEdit) {
      updateProduct.mutate(
        { productId, data: payload },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["/api/products"] });
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
        <p className="font-semibold">Access restricted</p>
        <p className="text-sm mt-1">Only admins can manage products.</p>
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
        <h1 className="text-xl font-bold">{isEdit ? "Edit Product" : "New Product"}</h1>
      </div>

      <div className="p-4 flex-1">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
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
                  <FormLabel className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Category</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g. Hardware" className="h-14 text-lg border-2 shadow-sm" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="itemType"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Item Type</FormLabel>
                  <FormControl>
                    <select className="w-full h-14 px-3 border-2 rounded-lg text-lg shadow-sm bg-background" {...field}>
                      <option value="purchase">Purchase (sourced from suppliers)</option>
                      <option value="production">Production (produced in-house)</option>
                    </select>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="bufferStock"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Minimum Stock Level (Buffer)</FormLabel>
                  <FormControl>
                    <Input type="number" min="0" className="h-14 text-lg border-2 shadow-sm font-mono" {...field} />
                  </FormControl>
                  <p className="text-xs text-muted-foreground mt-1.5">Triggers restock alert when stock drops below this level</p>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="targetStock"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Target Stock Level</FormLabel>
                  <FormControl>
                    <Input type="number" min="0" className="h-14 text-lg border-2 shadow-sm font-mono" {...field} />
                  </FormControl>
                  <p className="text-xs text-muted-foreground mt-1.5">Desired stock level for restocking calculations</p>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="supplierId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Supplier (Purchase Items Only)</FormLabel>
                  <FormControl>
                    <select className="w-full h-14 px-3 border-2 rounded-lg text-lg shadow-sm bg-background" {...field}>
                      <option value="">No supplier</option>
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
                  <FormLabel className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Supplier Product Name</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g. M10 Stainless Steel Hex Bolt" className="h-14 text-lg border-2 shadow-sm" {...field} />
                  </FormControl>
                  <p className="text-xs text-muted-foreground mt-1.5">The product name as listed by the supplier</p>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="supplierSku"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Supplier SKU</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g. MB-2024-001" className="h-14 text-lg border-2 shadow-sm font-mono" {...field} />
                  </FormControl>
                  <p className="text-xs text-muted-foreground mt-1.5">The supplier's part/SKU number</p>
                  <FormMessage />
                </FormItem>
              )}
            />

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
                    When stock drops below the minimum, an email is sent here:<br />
                    <span className="font-mono">LOW STOCK! [item] - you have [n] left</span>
                  </p>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="pt-6 pb-8">
              <Button type="submit" size="lg" className="w-full h-14 text-lg font-bold" disabled={isPending}>
                {isPending ? "Saving..." : (
                  <>
                    <Save className="mr-2 h-5 w-5" /> Save Product
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