import { useState } from "react";
import { useGetStockAtLocation, useListLocations } from "@workspace/api-client-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { MapPin, Package, AlertCircle } from "lucide-react";
import { MoveStockDialog } from "./move-stock-dialog";

interface ProductLocationsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  productId: number;
  productName: string;
  totalStock: number;
}

export function ProductLocationsDialog({
  open,
  onOpenChange,
  productId,
  productName,
  totalStock,
}: ProductLocationsDialogProps) {
  const { data: locations, isLoading } = useListLocations();
  const [moveFromLocation, setMoveFromLocation] = useState<string | null>(null);
  const [moveQuantity, setMoveQuantity] = useState(0);

  const stockData = locations
    ?.map((loc) => ({
      locationId: loc.id,
      description: loc.description,
      stock: useGetStockAtLocation(loc.id).data?.find((s) => s.productId === productId),
    }))
    .filter((item) => item.stock && item.stock.quantity > 0);

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="w-[90vw] max-w-md rounded-xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MapPin className="h-5 w-5" />
              {productName} Locations
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
            {isLoading ? (
              <>
                <Skeleton className="h-24 w-full" />
                <Skeleton className="h-24 w-full" />
              </>
            ) : stockData && stockData.length > 0 ? (
              stockData.map((item) =>
                item.stock ? (
                  <div
                    key={item.locationId}
                    className="bg-card border-2 border-border rounded-lg p-4 space-y-3"
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="font-bold text-lg">{item.locationId}</p>
                        {item.description && (
                          <p className="text-xs text-muted-foreground">{item.description}</p>
                        )}
                      </div>
                      <div className="text-right">
                        <p className="text-2xl font-black">{item.stock.quantity}</p>
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                          Units
                        </p>
                      </div>
                    </div>

                    {item.stock.quantity < item.stock.bufferStock && (
                      <div className="bg-destructive/10 border border-destructive/30 rounded px-2 py-1.5 flex items-center gap-2 text-xs text-destructive font-medium">
                        <AlertCircle className="h-3.5 w-3.5" />
                        Below minimum ({item.stock.bufferStock})
                      </div>
                    )}

                    <Button
                      onClick={() => {
                        setMoveFromLocation(item.locationId);
                        setMoveQuantity(item.stock.quantity);
                      }}
                      variant="outline"
                      size="sm"
                      className="w-full h-10 font-bold"
                    >
                      Move from here
                    </Button>
                  </div>
                ) : null
              )
            ) : (
              <div className="text-center py-8 px-4 bg-muted/30 rounded-lg border border-dashed">
                <Package className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">{productName} is not stored anywhere yet.</p>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {moveFromLocation && (
        <MoveStockDialog
          open={!!moveFromLocation}
          onOpenChange={(open) => {
            if (!open) setMoveFromLocation(null);
          }}
          productId={productId}
          productName={productName}
          fromLocation={moveFromLocation}
          fromQuantity={moveQuantity}
        />
      )}
    </>
  );
}
