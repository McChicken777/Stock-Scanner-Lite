import { useState } from "react";
import { Link } from "wouter";
import { useListProducts, useDeleteProduct } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Plus, Search, AlertTriangle, Edit2, Trash2, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { ProductLocationsDialog } from "@/components/product-locations-dialog";
import { useAuth } from "@/contexts/auth";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

export default function ProductsPage() {
  const { data: products, isLoading } = useListProducts();
  const deleteProduct = useDeleteProduct();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [search, setSearch] = useState("");
  const [selectedProduct, setSelectedProduct] = useState<number | null>(null);
  const [showLocationsDialog, setShowLocationsDialog] = useState(false);
  
  const filteredProducts = products?.filter(p => 
    p.name.toLowerCase().includes(search.toLowerCase()) || 
    p.category.toLowerCase().includes(search.toLowerCase())
  );

  const handleDelete = (id: number) => {
    deleteProduct.mutate({ productId: id }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      }
    });
  };

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between px-1 pt-2">
        <h1 className="text-2xl font-bold tracking-tight">Products</h1>
        {isAdmin && (
          <Link href="/products/new">
            <Button size="sm" className="font-bold">
              <Plus className="h-4 w-4 mr-1" /> New
            </Button>
          </Link>
        )}
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
        <Input
          placeholder="Search products..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10 h-12 text-md shadow-sm bg-background border-2"
        />
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-24 w-full rounded-xl" />)}
        </div>
      ) : (
        <div className="space-y-3 pb-8">
          {filteredProducts?.length === 0 ? (
            <div className="text-center py-12 px-4 bg-muted/30 rounded-xl border border-dashed">
              <p className="text-muted-foreground">No products found matching your search.</p>
            </div>
          ) : (
            filteredProducts?.map((product) => (
              <div 
                key={product.id} 
                className={`bg-card rounded-xl p-4 border-2 shadow-sm relative overflow-hidden ${
                  product.isLowStock ? 'border-destructive/40' : 'border-border'
                }`}
              >
                {product.isLowStock && (
                  <div className="absolute top-0 right-0 bg-destructive text-destructive-foreground text-[10px] font-bold px-2 py-0.5 rounded-bl-lg flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3" /> LOW STOCK
                  </div>
                )}
                
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <h3 className="font-bold text-lg leading-tight pr-16">{product.name}</h3>
                    <Badge variant="secondary" className="mt-1 font-medium bg-secondary/10 hover:bg-secondary/10 text-secondary border-none">
                      {product.category}
                    </Badge>
                  </div>
                  <div className="text-right">
                    <p className={`text-2xl font-black leading-none ${product.isLowStock ? 'text-destructive' : ''}`}>
                      {product.totalStock}
                    </p>
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mt-1">
                      Total
                    </p>
                  </div>
                </div>

                <div className="space-y-3 mt-4 pt-4 border-t border-border/50">
                  <div className="text-xs text-muted-foreground">
                    Min stock: <span className="font-bold text-foreground">{product.bufferStock}</span>
                  </div>
                  
                  <div className="flex gap-2">
                    <Button
                      onClick={() => {
                        setSelectedProduct(product.id);
                        setShowLocationsDialog(true);
                      }}
                      variant="outline"
                      size="sm"
                      className="flex-1 h-10 font-bold text-sm"
                    >
                      <MapPin className="h-4 w-4 mr-1" /> Locations
                    </Button>

                    {isAdmin && (
                      <>
                        <Link href={`/products/${product.id}/edit`}>
                          <Button variant="outline" size="icon" className="h-10 w-10">
                            <Edit2 className="h-4 w-4" />
                          </Button>
                        </Link>
                        
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="outline" size="icon" className="h-10 w-10 text-destructive hover:text-destructive hover:bg-destructive/10 border-destructive/20">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent className="w-[90vw] max-w-md rounded-xl">
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete Product?</AlertDialogTitle>
                              <AlertDialogDescription>
                                This will permanently delete {product.name} and remove it from all locations. This action cannot be undone.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter className="flex-col gap-2 sm:flex-row sm:gap-0 mt-4">
                              <AlertDialogCancel className="h-12 w-full sm:w-auto">Cancel</AlertDialogCancel>
                              <AlertDialogAction 
                                onClick={() => handleDelete(product.id)}
                                className="h-12 w-full sm:w-auto bg-destructive text-destructive-foreground hover:bg-destructive/90"
                              >
                                Delete
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {selectedProduct && (
        <ProductLocationsDialog
          open={showLocationsDialog}
          onOpenChange={setShowLocationsDialog}
          productId={selectedProduct}
          productName={filteredProducts?.find((p) => p.id === selectedProduct)?.name || ""}
          totalStock={filteredProducts?.find((p) => p.id === selectedProduct)?.totalStock || 0}
        />
      )}
    </div>
  );
}
