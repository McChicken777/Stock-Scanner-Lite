import { useState, useRef } from "react";
import { useUpdateStock, useListLocations } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import jsQR from "jsqr";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Camera, Loader2, AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface MoveStockDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  productId: number;
  productName: string;
  fromLocation: string;
  fromQuantity: number;
}

export function MoveStockDialog({
  open,
  onOpenChange,
  productId,
  productName,
  fromLocation,
  fromQuantity,
}: MoveStockDialogProps) {
  const [toLocation, setToLocation] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [scanMode, setScanMode] = useState(false);
  const [scanning, setScanning] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { data: locations } = useListLocations();
  const updateStock = useUpdateStock();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const handleMove = async () => {
    const qty = Number(quantity);
    if (!toLocation) {
      toast({ title: "Select destination location", variant: "destructive" });
      return;
    }
    if (fromLocation === toLocation) {
      toast({ title: "Source and destination must be different", variant: "destructive" });
      return;
    }
    if (qty <= 0 || qty > fromQuantity) {
      toast({ title: "Invalid quantity", variant: "destructive" });
      return;
    }

    updateStock.mutate(
      { locationId: fromLocation, productId, data: { delta: -qty } },
      {
        onSuccess: () => {
          updateStock.mutate(
            { locationId: toLocation, productId, data: { delta: qty } },
            {
              onSuccess: () => {
                queryClient.invalidateQueries({ queryKey: ["/api/products"] });
                queryClient.invalidateQueries({ queryKey: ["/api/stock"] });
                queryClient.invalidateQueries({ queryKey: ["/api/location"] });
                toast({ title: `Moved ${qty} units to ${toLocation}` });
                onOpenChange(false);
                setToLocation("");
                setQuantity("1");
              },
              onError: () => {
                toast({ title: "Failed to move stock", variant: "destructive" });
              },
            }
          );
        },
        onError: () => {
          toast({ title: "Failed to move stock", variant: "destructive" });
        },
      }
    );
  };

  const startScanning = async () => {
    setScanning(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      scanQR();
    } catch (err) {
      toast({ title: "Failed to access camera", variant: "destructive" });
      setScanning(false);
    }
  };

  const scanQR = () => {
    if (!videoRef.current || !canvasRef.current || !scanning) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const video = videoRef.current;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx?.drawImage(video, 0, 0);

    const imageData = ctx?.getImageData(0, 0, canvas.width, canvas.height);
    if (imageData) {
      const code = jsQR(imageData.data, imageData.width, imageData.height);
      if (code) {
        const locId = code.data.trim();
        if (locations?.some((l) => l.id === locId)) {
          setToLocation(locId);
          setScanMode(false);
          stopScanning();
          toast({ title: `Scanned: ${locId}` });
          return;
        }
      }
    }

    if (scanning) {
      requestAnimationFrame(scanQR);
    }
  };

  const stopScanning = () => {
    setScanning(false);
    if (videoRef.current?.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach((track) => track.stop());
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[90vw] max-w-md rounded-xl">
        <DialogHeader>
          <DialogTitle>Move Stock</DialogTitle>
          <DialogDescription>
            Move {productName} from {fromLocation} ({fromQuantity} units available)
          </DialogDescription>
        </DialogHeader>

        <Tabs value={scanMode ? "scan" : "manual"} onValueChange={(v) => setScanMode(v === "scan")}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="manual">Manual</TabsTrigger>
            <TabsTrigger value="scan">Scan QR</TabsTrigger>
          </TabsList>

          <TabsContent value="manual" className="space-y-4 mt-4">
            <div>
              <label className="text-sm font-bold uppercase text-muted-foreground">Destination Location</label>
              <Select value={toLocation} onValueChange={setToLocation}>
                <SelectTrigger className="h-12 border-2 text-lg mt-1">
                  <SelectValue placeholder="Select location..." />
                </SelectTrigger>
                <SelectContent>
                  {locations
                    ?.filter((l) => l.id !== fromLocation)
                    .map((loc) => (
                      <SelectItem key={loc.id} value={loc.id}>
                        {loc.id} {loc.description && `- ${loc.description}`}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-sm font-bold uppercase text-muted-foreground">Quantity to Move</label>
              <Input
                type="number"
                min="1"
                max={fromQuantity}
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                className="h-12 border-2 text-lg mt-1"
              />
              <p className="text-xs text-muted-foreground mt-1">Max: {fromQuantity} units</p>
            </div>

            <Button
              onClick={handleMove}
              disabled={updateStock.isPending || !toLocation || !quantity}
              className="w-full h-12 text-lg font-bold"
            >
              {updateStock.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Move Stock
            </Button>
          </TabsContent>

          <TabsContent value="scan" className="space-y-4 mt-4">
            {!scanning ? (
              <div className="space-y-4">
                <div className="bg-muted/50 p-6 rounded-lg text-center border-2 border-dashed">
                  <Camera className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">Scan the destination location QR code</p>
                </div>
                <Button
                  onClick={startScanning}
                  variant="outline"
                  className="w-full h-12 font-bold"
                >
                  <Camera className="mr-2 h-4 w-4" /> Start Camera
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="bg-black rounded-lg overflow-hidden relative h-56">
                  <video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover" />
                  <div className="absolute inset-0 border-4 border-orange-500 m-8 rounded-lg pointer-events-none" />
                </div>
                <canvas ref={canvasRef} className="hidden" />

                {toLocation && (
                  <div className="bg-green-100 border border-green-400 rounded-lg p-3">
                    <p className="text-sm font-bold text-green-900">Scanned: {toLocation}</p>
                  </div>
                )}

                <div>
                  <label className="text-sm font-bold uppercase text-muted-foreground">Quantity to Move</label>
                  <Input
                    type="number"
                    min="1"
                    max={fromQuantity}
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                    className="h-12 border-2 text-lg mt-1"
                  />
                </div>

                <div className="flex gap-2">
                  <Button
                    onClick={stopScanning}
                    variant="outline"
                    className="flex-1 h-12 font-bold"
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={handleMove}
                    disabled={updateStock.isPending || !toLocation || !quantity}
                    className="flex-1 h-12 text-lg font-bold"
                  >
                    {updateStock.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    Move
                  </Button>
                </div>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
