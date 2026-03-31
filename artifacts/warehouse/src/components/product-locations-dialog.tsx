import { useState } from "react";
import { useGetStockAtLocation, useListLocations } from "@workspace/api-client-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { MapPin, Package, AlertCircle } from "lucide-react";
import { MoveStockDialog } from "./move-stock-dialog";

interface LocationStockItemProps {
  locationId: string;
  description: string | null;
  productId: number;
  bufferStock: number;
  onMove: (locationId: string, quantity: number) => void;
}

function LocationStockItem({
  locationId,
  description,
  productId,
  bufferStock,
  onMove,
}: LocationStockItemProps) {
  const { data: stock } = useGetStockAtLocation(locationId);
  const item = stock?.find((s) => s.productId === productId);

  return (
    <div className="bg-card border-2 border-border rounded-lg p-4 space-y-3">
      <div className="flex justify-between items-start">
        <div>
          <p className="font-bold text-lg">{locationId}</p>
          {description && (
            <p className="text-xs text-muted-foreground">{description}</p>
          )}
        </div>
        <div className="text-right">
          <p className="text-2xl font-black">{item?.quantity || 0}</p>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Units
          </p>
        </div>
      </div>

      {item && item.quantity < (item.bufferStock || bufferStock) && (
        <div className="bg-destructive/10 border border-destructive/30 rounded px-2 py-1.5 flex items-center gap-2 text-xs text-destructive font-medium">
          <AlertCircle className="h-3.5 w-3.5" />
          Below minimum ({item.bufferStock || bufferStock})
        </div>
      )}

      <Button
        onClick={() => onMove(locationId, item?.quantity || 0)}
        variant="outline"
        size="sm"
        className="w-full h-10 font-bold"
        disabled={!item || item.quantity === 0}
      >
        Move from here
      </Button>
    </div>
  );
}

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
            {!locations ? (
              <>
                <Skeleton className="h-24 w-full" />
                <Skeleton className="h-24 w-full" />
              </>
            ) : locations.length === 0 ? (
              <div className="text-center py-8 px-4 bg-muted/30 rounded-lg border border-dashed">
                <Package className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">No storage locations configured.</p>
              </div>
            ) : (
              locations.map((loc) => (
                <LocationStockItem
                  key={loc.id}
                  locationId={loc.id}
                  description={loc.description}
                  productId={productId}
                  bufferStock={0}
                  onMove={(locId, qty) => {
                    setMoveFromLocation(locId);
                    setMoveQuantity(qty);
                  }}
                />
              ))
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
