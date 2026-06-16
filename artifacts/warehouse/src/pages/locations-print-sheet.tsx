import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { QRCodeSVG } from "qrcode.react";
import { ArrowLeft, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

interface LocationItem { id: string; description?: string | null }

export default function LocationsPrintSheetPage() {
  const { data: locations, isLoading } = useQuery<LocationItem[]>({
    queryKey: ["/api/locations"],
    queryFn: () => fetch("/api/locations", { credentials: "include" }).then((r) => r.json()),
    staleTime: 60_000,
  });

  useEffect(() => {
    if (!isLoading && locations && locations.length > 0) {
      const t = setTimeout(() => window.print(), 500);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [isLoading, locations]);

  return (
    <>
      {/* Screen controls — hidden when printing */}
      <div className="print:hidden p-4 border-b bg-background sticky top-0 z-10 flex items-center gap-3">
        <Link href="/locations">
          <Button variant="ghost" size="sm" className="gap-2">
            <ArrowLeft className="h-4 w-4" /> Back
          </Button>
        </Link>
        <span className="text-sm font-semibold flex-1">
          {isLoading ? "Loading…" : `${locations?.length ?? 0} location labels`}
        </span>
        <Button size="sm" className="gap-2" onClick={() => window.print()}>
          <Printer className="h-4 w-4" /> Print
        </Button>
      </div>

      {/* Print grid */}
      <div className="p-4 print:p-0">
        {isLoading ? (
          <div className="grid grid-cols-3 gap-4">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <Skeleton key={i} className="h-40 rounded-xl" />
            ))}
          </div>
        ) : (
          <div
            className="grid gap-4 print:gap-0"
            style={{
              gridTemplateColumns: "repeat(3, 1fr)",
            }}
          >
            {locations?.map((loc) => (
              <div
                key={loc.id}
                className="border border-border rounded-xl p-4 flex flex-col items-center gap-2 print:border print:border-black print:rounded-none print:break-inside-avoid"
                style={{ pageBreakInside: "avoid" }}
              >
                <QRCodeSVG value={loc.id} size={120} level="M" />
                <p className="font-black text-lg font-mono tracking-wide text-center">{loc.id}</p>
                {loc.description && (
                  <p className="text-xs text-muted-foreground text-center print:text-black leading-tight">{loc.description}</p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Print-only styles */}
      <style>{`
        @media print {
          body > *:not(.print-root) { display: none; }
          .print\\:hidden { display: none !important; }
          @page { margin: 8mm; size: A4; }
        }
      `}</style>
    </>
  );
}
