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
          videoRef.current.setAttribute("playsinline", "true");
          videoRef.current.play();
          requestRef.current = requestAnimationFrame(tick);
        }
      } catch {
        setHasCamera(false);
        setManualMode(true);
        setError(t("scanCameraError"));
      }
    };

    startCamera();

    return () => {
      if (stream) stream.getTracks().forEach(track => track.stop());
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
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

        const code = jsQR(imageData.data, imageData.width, imageData.height, {
          inversionAttempts: "dontInvert",
        });

        if (code && code.data) {
          resolveAndGo(code.data);
          return;
        }
      }
    }
    requestRef.current = requestAnimationFrame(tick);
  };

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (manualId.trim()) {
      handlingRef.current = false;
      resolveAndGo(manualId.trim().toUpperCase());
    }
  };

  // ── Manual mode — normal page flow within AppLayout ───────────────────────
  if (manualMode) {
    return (
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
    );
  }

  // ── Camera mode — fixed full-screen overlay above AppLayout chrome ─────────
  return (
    <>
      <canvas ref={canvasRef} className="hidden" />

      <div className="fixed inset-0 z-50 bg-background flex flex-col">
        {/* Live camera feed — sits behind the white overlay, visible only through the viewfinder cutout */}
        <video
          ref={videoRef}
          playsInline
          muted
          className="absolute inset-0 w-full h-full object-cover"
        />

        {/* White overlay with viewfinder cutout via box-shadow */}
        <div className="absolute inset-0 flex items-center justify-center z-10">
          <div
            className="relative w-72 h-72"
            style={{ boxShadow: "0 0 0 9999px var(--color-background, white)" }}
          >
            {/* Corner brackets */}
            <div className="absolute top-0 left-0 w-9 h-9 border-t-[3px] border-l-[3px] border-primary rounded-tl-xl" />
            <div className="absolute top-0 right-0 w-9 h-9 border-t-[3px] border-r-[3px] border-primary rounded-tr-xl" />
            <div className="absolute bottom-0 left-0 w-9 h-9 border-b-[3px] border-l-[3px] border-primary rounded-bl-xl" />
            <div className="absolute bottom-0 right-0 w-9 h-9 border-b-[3px] border-r-[3px] border-primary rounded-br-xl" />

            {/* Animated scan line */}
            <div
              className="absolute left-4 right-4 h-[2px] rounded-full bg-gradient-to-r from-transparent via-primary to-transparent"
              style={{ animation: "scan-line 1.8s ease-in-out infinite alternate" }}
            />
          </div>
        </div>

        {/* Header — sits above the overlay */}
        <div className="relative z-20 px-5 pt-12 pb-4">
          <h1 className="text-foreground font-bold text-xl flex items-center gap-2">
            <Scan className="h-5 w-5 text-primary" />
            {t("scanTitle")}
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">{t("scanDesc")}</p>
        </div>

        {/* Bottom controls */}
        <div className="absolute bottom-0 left-0 right-0 z-20 flex flex-col items-center p-6 pb-10">
          <button
            onClick={() => setManualMode(true)}
            className="flex items-center justify-center gap-2 w-full max-w-xs h-14 rounded-2xl bg-secondary text-secondary-foreground font-bold text-sm uppercase tracking-wider active:scale-95 transition-transform"
          >
            <Keyboard className="h-5 w-5" />
            {t("scanManualEntry")}
          </button>
        </div>
      </div>
    </>
  );
}
