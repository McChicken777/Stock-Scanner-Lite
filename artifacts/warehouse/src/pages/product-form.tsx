import { useEffect } from "react";
import { useRoute, useLocation, Link } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ArrowLeft, Save } from "lucide-react";
import { useCreateProduct, useUpdateProduct, useGetProduct } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/auth";

const formSchema = z.object({
  name: z.string().min(2, "Name is required"),
  category: z.string().min(2, "Category is required"),
  bufferStock: z.coerce.number().min(0, "Must be positive"),
  alertEmail: z.string().email("Invalid email").optional().or(z.literal("")),
});

type FormValues = z.infer<typeof formSchema>;

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

  const createProduct = useCreateProduct();
  const updateProduct = useUpdateProduct();

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      category: "",
      bufferStock: 0,
      alertEmail: "",
    },
  });

  useEffect(() => {
    if (product && isEdit) {
      form.reset({
        name: product.name,
        category: product.category,
        bufferStock: product.bufferStock,
        alertEmail: product.alertEmail || "",
      });
    }
  }, [product, isEdit, form]);

  const onSubmit = (data: FormValues) => {
    const payload = {
      ...data,
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
              name="bufferStock"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Minimum Stock Level</FormLabel>
                  <FormControl>
                    <Input type="number" min="0" className="h-14 text-lg border-2 shadow-sm font-mono" {...field} />
                  </FormControl>
                  <p className="text-xs text-muted-foreground mt-1.5">Alerts when total stock drops below this number</p>
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