import { useState } from "react";
import { useGetStockAtLocation, useListLocations, useUpdateStock } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { MapPin, Package, AlertCircle, Minus, Plus, Edit2, Check, X, Loader2 } from "lucide-react";
import { MoveStockDialog } from "./move-stock-dialog";
import { useToast } from "@/hooks/use-toast";

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
  const [editMode, setEditMode] = useState(false);
  const [editQty, setEditQty] = useState(item?.quantity.toString() || "0");
  const updateStock = useUpdateStock();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const handleUpdate = (newQty: number) => {
    if (newQty < 0) {
      toast({ title: "Quantity cannot be negative", variant: "destructive" });
      return;
    }
    if (newQty === item?.quantity) {
      setEditMode(false);
      return;
    }

    updateStock.mutate(
      { locationId, productId, data: { quantity: newQty } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: ["/api/stock"] });
          queryClient.invalidateQueries({ queryKey: ["/api/products"] });
          setEditMode(false);
          if (newQty === 0) {
            toast({ title: "Stock cleared — location will be removed if empty" });
          } else {
            toast({ title: `Stock updated to ${newQty} units` });
          }
        },
        onError: () => {
          toast({ title: "Failed to update stock", variant: "destructive" });
        },
      }
    );
  };

  const handleAddTake = (operation: "add" | "take", amount: string) => {
    const num = Number(amount);
    if (!num || num <= 0) return;
    const current = item?.quantity || 0;
    const newQty = operation === "add" ? current + num : Math.max(0, current - num);
    handleUpdate(newQty);
  };

  if (!item) return null;

  return (
    <div className="bg-card border-2 border-border rounded-lg p-4 space-y-3">
      <div className="flex justify-between items-start">
        <div>
          <p className="font-bold text-lg">{locationId}</p>
          {description && (
            <p className="text-xs text-muted-foreground">{description}</p>
          )}
        </div>
        {!editMode && (
          <div className="text-right">
            <p className="text-2xl font-black">{item.quantity}</p>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Units
            </p>
          </div>
        )}
      </div>

      {item.quantity < (item.bufferStock || bufferStock) && (
        <div className="bg-destructive/10 border border-destructive/30 rounded px-2 py-1.5 flex items-center gap-2 text-xs text-destructive font-medium">
          <AlertCircle className="h-3.5 w-3.5" />
          Below minimum ({item.bufferStock || bufferStock})
        </div>
      )}

      {!editMode ? (
        <div className="flex gap-2">
          <Button
            onClick={() => onMove(locationId, item.quantity)}
            variant="outline"
            size="sm"
            className="flex-1 h-10 font-bold"
          >
            Move
          </Button>
          <Button
            onClick={() => {
              setEditQty(item.quantity.toString());
              setEditMode(true);
            }}
            variant="outline"
            size="icon"
            className="h-10 w-10"
          >
            <Edit2 className="h-4 w-4" />
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          <Input
            type="number"
            min="0"
            value={editQty}
            onChange={(e) => setEditQty(e.target.value)}
            className="h-12 border-2 text-lg font-bold"
            placeholder="0"
          />

          <div className="grid grid-cols-2 gap-2">
            <Button
              onClick={() => {
                const amt = prompt("How many to add?", "1");
                if (amt) handleAddTake("add", amt);
              }}
              variant="outline"
              size="sm"
              className="h-10 font-bold"
            >
              <Plus className="h-4 w-4 mr-1" /> Add
            </Button>
            <Button
              onClick={() => {
                const amt = prompt("How many to take?", "1");
                if (amt) handleAddTake("take", amt);
              }}
              variant="outline"
              size="sm"
              className="h-10 font-bold"
            >
              <Minus className="h-4 w-4 mr-1" /> Take
            </Button>
          </div>

          <div className="flex gap-2">
            <Button
              onClick={() => handleUpdate(Number(editQty))}
              disabled={updateStock.isPending}
              className="flex-1 h-10 font-bold"
            >
              {updateStock.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />}
              Save
            </Button>
            <Button
              onClick={() => {
                setEditMode(false);
                setEditQty(item.quantity.toString());
              }}
              variant="outline"
              size="icon"
              className="h-10 w-10"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
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
                  description={loc.description ?? null}
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
