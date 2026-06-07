import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import jsQR from "jsqr";
import { Scan, Keyboard, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";

export default function ScanPage() {
  const [, setLocation] = useLocation();
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [hasCamera, setHasCamera] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [manualMode, setManualMode] = useState(false);
  const [manualId, setManualId] = useState("");
  const requestRef = useRef<number | undefined>(undefined);

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
        setError("Could not access camera. Please enter location ID manually.");
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
          // If we found a code, navigate to it
          // Wait a tiny bit to prevent rapid multiple scans
          setTimeout(() => {
            setLocation(`/location/${encodeURIComponent(code.data)}`);
          }, 100);
          return; // Stop scanning
        }
      }
    }
    requestRef.current = requestAnimationFrame(tick);
  };

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (manualId.trim()) {
      setLocation(`/location/${encodeURIComponent(manualId.trim())}`);
    }
  };

  return (
    <div className="flex flex-col min-h-[calc(100vh-4rem)] bg-black relative">
      {!manualMode ? (
        <>
          <div className="absolute top-0 left-0 w-full p-4 z-10 bg-gradient-to-b from-black/80 to-transparent">
            <h1 className="text-white font-bold text-xl flex items-center gap-2">
              <Scan className="h-5 w-5" />
              Scan Location QR
            </h1>
            <p className="text-white/70 text-sm mt-1">Point camera at a location label</p>
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
              Manual Entry
            </Button>
          </div>
        </>
      ) : (
        <div className="flex-1 bg-background p-4 flex flex-col pt-12">
          <div className="mb-8">
            <h1 className="text-2xl font-bold tracking-tight">Manual Entry</h1>
            <p className="text-muted-foreground mt-1">Enter the location ID found on the label</p>
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
                Location ID
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
              Open Location
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
                Back to Camera
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}