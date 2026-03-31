import { useState, useRef } from "react";
import { useRoute } from "wouter";
import { MapPin, Plus, Minus, Search, ArrowLeft, Loader2 } from "lucide-react";
import { useGetLocation, useUpdateStock, useListProducts, getGetLocationQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";

function StockItem({ 
  locationId, 
  productId, 
  productName, 
  category, 
  quantity, 
  bufferStock 
}: { 
  locationId: string, 
  productId: number, 
  productName: string, 
  category: string, 
  quantity: number, 
  bufferStock: number 
}) {
  const [optimisticQty, setOptimisticQty] = useState(quantity);
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState("");
  const updateStock = useUpdateStock();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  // Ref for debouncing rapidly tapped buttons
  const timeoutRef = useRef<NodeJS.Timeout>();

  const handleUpdate = (newQty: number) => {
    // Optimistic UI update immediately
    setOptimisticQty(newQty);
    
    // Clear previous timeout
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    
    // Debounce the actual API call
    timeoutRef.current = setTimeout(() => {
      updateStock.mutate(
        { data: { locationId, productId, quantity: newQty } },
        {
          onSuccess: () => {
            // Revalidate to get the fresh data
            queryClient.invalidateQueries({ queryKey: getGetLocationQueryKey(locationId) });
          },
          onError: () => {
            // Revert on error
            setOptimisticQty(quantity);
            toast({
              title: "Update failed",
              description: "Could not update stock quantity.",
              variant: "destructive",
            });
          }
        }
      );
    }, 500);
  };

  const handleSaveEdit = () => {
    const parsed = parseInt(editValue, 10);
    if (!isNaN(parsed) && parsed >= 0) {
      handleUpdate(parsed);
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
            <div className="flex items-center gap-2 mt-1">
              <span className="text-xs font-medium px-2 py-0.5 bg-secondary text-secondary-foreground rounded-full">
                {category}
              </span>
              <span className="text-xs text-muted-foreground">
                Min: {bufferStock}
              </span>
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

function AddProductDialog({ locationId }: { locationId: string }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const { data: products, isLoading } = useListProducts({ query: { enabled: open } });
  const updateStock = useUpdateStock();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const filteredProducts = products?.filter(p => 
    p.name.toLowerCase().includes(search.toLowerCase()) || 
    p.category.toLowerCase().includes(search.toLowerCase())
  );

  const handleAdd = (productId: number) => {
    updateStock.mutate(
      { data: { locationId, productId, quantity: 1 } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetLocationQueryKey(locationId) });
          toast({ title: "Product added", description: "Set initial quantity to 1." });
          setOpen(false);
        }
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="lg" className="w-full h-14 text-lg font-bold">
          <Plus className="mr-2 h-6 w-6" /> Add Product to Location
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
          <h2 className="text-2xl font-bold">Location Not Found</h2>
          <p className="text-muted-foreground mt-1">ID: {id}</p>
        </div>
        <Link href="/scan">
          <Button size="lg" className="mt-4">Back to Scanner</Button>
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
              <p className="text-xs font-bold text-secondary-foreground/60 uppercase tracking-widest mb-0.5">Location</p>
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
            <p className="text-muted-foreground font-medium mb-4">No products at this location</p>
            <AddProductDialog locationId={location.id} />
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
                />
              ))}
            </div>
            
            <div className="pt-4">
              <AddProductDialog locationId={location.id} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}