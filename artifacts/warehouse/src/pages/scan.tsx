import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { useLang } from "@/contexts/lang";
import jsQR from "jsqr";
import { Scan, Keyboard, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";

export default function ScanPage() {
  const [, setLocation] = useLocation();
  const { t } = useLang();
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [hasCamera, setHasCamera] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [manualMode, setManualMode] = useState(false);
  const [manualId, setManualId] = useState("");
  const requestRef = useRef<number | undefined>(undefined);
  const handlingRef = useRef(false);

  // Resolve a scanned/typed code to a bin location or a product, then route there.
  const resolveAndGo = async (raw: string) => {
    const code = raw.trim();
    if (!code || handlingRef.current) return;
    handlingRef.current = true;
    try {
      const r = await fetch(`/api/stock/resolve/${encodeURIComponent(code)}`, { credentials: "include" });
      const d = await r.json();
      if (d?.type === "location") { setLocation(`/location/${encodeURIComponent(d.id)}?scanned=1`); return; }
      if (d?.type === "product") { setLocation(`/item/${d.productId}`); return; }
      setError(`Code not recognised: ${code}`);
      setManualMode(true);
      handlingRef.current = false;
    } catch {
      // Network/parse failure — fall back to treating it as a location id
      setLocation(`/location/${encodeURIComponent(code)}?scanned=1`);
    }
  };

  useEffect(() => {
    if (manualMode) return;

    let stream: MediaStream | null = null;

    const startCamera = async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" }
        });
        
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.setAttribute("playsinline", "true"); // required for iOS Safari
          videoRef.current.play();
          requestRef.current = requestAnimationFrame(tick);
        }
      } catch (err) {
        console.error("Error accessing camera:", err);
        setHasCamera(false);
        setManualMode(true);
        setError(t("scanCameraError"));
      }
    };

    startCamera();

    return () => {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
      if (requestRef.current) {
        cancelAnimationFrame(requestRef.current);
      }
    };
  }, [manualMode]);

  const tick = () => {
    if (!videoRef.current || !canvasRef.current || manualMode) return;

    if (videoRef.current.readyState === videoRef.current.HAVE_ENOUGH_DATA) {
      const canvas = canvasRef.current;
      const video = videoRef.current;
      
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        
        // Scan for QR code
        const code = jsQR(imageData.data, imageData.width, imageData.height, {
          inversionAttempts: "dontInvert",
        });

        if (code && code.data) {
          // Resolve the code (bin location or item) then route. resolveAndGo guards
          // against rapid duplicate scans.
          resolveAndGo(code.data);
          return; // Stop scanning
        }
      }
    }
    requestRef.current = requestAnimationFrame(tick);
  };

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (manualId.trim()) {
      handlingRef.current = false; // allow a fresh manual attempt
      resolveAndGo(manualId.trim());
    }
  };

  return (
    <div className="flex flex-col min-h-[calc(100vh-4rem)] bg-black relative">
      {!manualMode ? (
        <>
          <div className="absolute top-0 left-0 w-full p-4 z-10 bg-gradient-to-b from-black/80 to-transparent">
            <h1 className="text-white font-bold text-xl flex items-center gap-2">
              <Scan className="h-5 w-5" />
              {t("scanTitle")}
            </h1>
            <p className="text-white/70 text-sm mt-1">{t("scanDesc")}</p>
          </div>

          <div className="flex-1 relative flex items-center justify-center overflow-hidden">
            <video 
              ref={videoRef} 
              className="absolute min-w-full min-h-full object-cover" 
            />
            <canvas ref={canvasRef} className="hidden" />
            
            {/* Viewfinder overlay */}
            <div className="relative z-10 w-64 h-64 border-2 border-primary/80 rounded-2xl flex items-center justify-center">
              <div className="absolute top-0 left-0 w-4 h-4 border-t-4 border-l-4 border-primary rounded-tl-lg -translate-x-1 -translate-y-1"></div>
              <div className="absolute top-0 right-0 w-4 h-4 border-t-4 border-r-4 border-primary rounded-tr-lg translate-x-1 -translate-y-1"></div>
              <div className="absolute bottom-0 left-0 w-4 h-4 border-b-4 border-l-4 border-primary rounded-bl-lg -translate-x-1 translate-y-1"></div>
              <div className="absolute bottom-0 right-0 w-4 h-4 border-b-4 border-r-4 border-primary rounded-br-lg translate-x-1 translate-y-1"></div>
              <div className="w-full h-[2px] bg-primary/50 animate-[scan_2s_ease-in-out_infinite]"></div>
            </div>
            
            <div className="absolute inset-0 bg-black/40 z-0 [mask-image:radial-gradient(ellipse_at_center,transparent_30%,black_60%)]"></div>
          </div>

          <div className="absolute bottom-0 left-0 w-full p-6 z-10 bg-gradient-to-t from-black/90 to-transparent flex justify-center">
            <Button 
              size="lg" 
              variant="secondary" 
              onClick={() => setManualMode(true)}
              className="w-full max-w-xs h-14 font-bold uppercase tracking-wider"
            >
              <Keyboard className="mr-2 h-5 w-5" />
              {t("scanManualEntry")}
            </Button>
          </div>
        </>
      ) : (
        <div className="flex-1 bg-background p-4 flex flex-col pt-12">
          <div className="mb-8">
            <h1 className="text-2xl font-bold tracking-tight">{t("scanManualEntry")}</h1>
            <p className="text-muted-foreground mt-1">{t("scanManualDesc")}</p>
          </div>

          {error && (
            <Alert variant="destructive" className="mb-6">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <form onSubmit={handleManualSubmit} className="space-y-6 flex-1">
            <div className="space-y-2">
              <label htmlFor="locationId" className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
                {t("scanLocationId")}
              </label>
              <Input
                id="locationId"
                value={manualId}
                onChange={(e) => setManualId(e.target.value)}
                placeholder="e.g. A1-01-02"
                className="h-16 text-2xl font-mono uppercase text-center border-2 border-border focus-visible:border-primary focus-visible:ring-primary shadow-sm"
                autoFocus
                autoComplete="off"
                autoCapitalize="off"
              />
            </div>
            <Button type="submit" size="lg" className="w-full h-14 text-lg font-bold" disabled={!manualId.trim()}>
              {t("scanOpenLocation")}
            </Button>
          </form>

          {hasCamera && (
            <div className="mt-auto pt-6">
              <Button 
                variant="outline" 
                size="lg" 
                className="w-full h-14 font-bold"
                onClick={() => setManualMode(false)}
              >
                <Scan className="mr-2 h-5 w-5" />
                {t("scanBackToCamera")}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}