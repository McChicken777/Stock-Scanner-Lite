import { useState, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import * as XLSX from "xlsx";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Download, Upload, CheckCircle2, AlertTriangle, ArrowRight, Loader2, FileSpreadsheet, X } from "lucide-react";

interface Product {
  id: number;
  name: string;
  barcode: string | null;
  category: string;
}

interface LocationItem {
  id: string;
  description: string;
}

interface PreviewRow {
  locationId: string;
  productId: number;
  productName: string;
  quantity: number;
  ok: boolean;
  reason?: string;
}

export default function StockImportPage() {
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [preview, setPreview] = useState<PreviewRow[]>([]);
  const [fileName, setFileName] = useState("");
  const [importing, setImporting] = useState(false);
  const [summary, setSummary] = useState<{ inserted: number; updated: number; deleted: number; skipped: number } | null>(null);

  const { data: products = [] } = useQuery<Product[]>({
    queryKey: ["/api/products"],
    queryFn: () => fetch("/api/products", { credentials: "include" }).then((r) => r.json()),
  });

  const { data: locations = [] } = useQuery<LocationItem[]>({
    queryKey: ["/api/locations"],
    queryFn: () => fetch("/api/locations", { credentials: "include" }).then((r) => r.json()),
  });

  function downloadTemplate() {
    const rows: (string | number)[][] = [
      ["Location ID", "Product Name", "Barcode", "Quantity"],
      ...products.map((p) => ["", p.name, p.barcode ?? "", ""]),
    ];
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws["!cols"] = [{ wch: 18 }, { wch: 35 }, { wch: 18 }, { wch: 12 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Stock Import");
    XLSX.writeFile(wb, "stock-import-template.xlsx");
  }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);

    const locationMap = new Map(locations.map((l) => [l.id.toUpperCase(), l.id]));
    const productByBarcode = new Map(products.filter((p) => p.barcode).map((p) => [p.barcode!.toLowerCase(), p]));
    const productByName = new Map(products.map((p) => [p.name.toLowerCase(), p]));

    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = new Uint8Array(ev.target!.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: "array" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const raw: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });

        const rows: PreviewRow[] = [];
        for (let i = 0; i < raw.length; i++) {
          const row = raw[i];
          const rawLocId = String(row[0] ?? "").trim();
          const rawName = String(row[1] ?? "").trim();
          const rawBarcode = String(row[2] ?? "").trim();
          const rawQty = row[3];

          // Skip header row
          if (i === 0 && /location/i.test(rawLocId)) continue;
          // Skip rows without a location
          if (!rawLocId) continue;
          // Skip rows without a quantity
          if (rawQty === "" || rawQty === null || rawQty === undefined) continue;

          const qty = Number(rawQty);
          if (isNaN(qty) || qty < 0) {
            rows.push({ locationId: rawLocId, productId: 0, productName: rawName || rawBarcode, quantity: 0, ok: false, reason: "Invalid quantity" });
            continue;
          }

          const resolvedLocId = locationMap.get(rawLocId.toUpperCase());
          if (!resolvedLocId) {
            rows.push({ locationId: rawLocId, productId: 0, productName: rawName || rawBarcode, quantity: qty, ok: false, reason: `Location "${rawLocId}" not found` });
            continue;
          }

          const product = productByBarcode.get(rawBarcode.toLowerCase()) ?? productByName.get(rawName.toLowerCase());
          if (!product) {
            rows.push({ locationId: resolvedLocId, productId: 0, productName: rawName || rawBarcode || "—", quantity: qty, ok: false, reason: "Product not matched" });
            continue;
          }

          rows.push({ locationId: resolvedLocId, productId: product.id, productName: product.name, quantity: qty, ok: true });
        }

        setPreview(rows);
        setStep(2);
      } catch {
        toast({ title: "Could not read file", variant: "destructive" });
      }
    };
    reader.readAsArrayBuffer(file);
  }

  async function runImport() {
    const validRows = preview.filter((r) => r.ok);
    if (!validRows.length) return;
    setImporting(true);
    try {
      const res = await fetch("/api/stock/bulk", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entries: validRows.map((r) => ({ locationId: r.locationId, productId: r.productId, quantity: r.quantity })),
          reason: "initial_entry",
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Import failed");
      setSummary({ ...data, skipped: preview.filter((r) => !r.ok).length });
      setStep(3);
    } catch (err) {
      toast({ title: err instanceof Error ? err.message : "Import failed", variant: "destructive" });
    } finally {
      setImporting(false);
    }
  }

  function reset() {
    setStep(1);
    setPreview([]);
    setFileName("");
    setSummary(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  const okRows = preview.filter((r) => r.ok);
  const badRows = preview.filter((r) => !r.ok);

  return (
    <div className="p-4 max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-black">Import Stock</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Set initial quantities across multiple locations at once using a spreadsheet.
        </p>
      </div>

      {/* Step indicator */}
      <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider">
        {([1, 2, 3] as const).map((s, i) => (
          <div key={s} className="flex items-center gap-2">
            <span className={`h-6 w-6 rounded-full flex items-center justify-center ${step >= s ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
              {s}
            </span>
            <span className={step >= s ? "text-foreground" : "text-muted-foreground"}>
              {s === 1 ? "Template" : s === 2 ? "Preview" : "Done"}
            </span>
            {i < 2 && <ArrowRight className="h-3 w-3 text-muted-foreground" />}
          </div>
        ))}
      </div>

      {/* Step 1: Download template */}
      {step === 1 && (
        <div className="space-y-4">
          <div className="border-2 border-dashed border-border rounded-xl p-6 space-y-4">
            <div className="flex items-start gap-4">
              <FileSpreadsheet className="h-10 w-10 text-primary flex-shrink-0 mt-1" />
              <div>
                <h2 className="font-bold text-base">Step 1 — Download the template</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  The template is pre-filled with all your products. Fill in the{" "}
                  <strong>Location ID</strong> and <strong>Quantity</strong> columns for each row you want to import.
                  Leave rows blank to skip them.
                </p>
                <p className="text-xs text-muted-foreground mt-2">
                  Location IDs must match exactly (e.g. <code className="bg-muted px-1 rounded">A01</code>).
                  You can see all location IDs on the Locations page.
                </p>
              </div>
            </div>
            <Button onClick={downloadTemplate} className="gap-2 font-bold h-12 w-full" disabled={products.length === 0}>
              <Download className="h-4 w-4" />
              Download template ({products.length} products)
            </Button>
          </div>

          <div className="border-2 border-border rounded-xl p-6 space-y-4">
            <h2 className="font-bold text-base">Step 2 — Upload your filled spreadsheet</h2>
            <p className="text-sm text-muted-foreground">
              Accepts <code className="bg-muted px-1 rounded">.xlsx</code>,{" "}
              <code className="bg-muted px-1 rounded">.xls</code>, or{" "}
              <code className="bg-muted px-1 rounded">.csv</code>
            </p>
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={handleFile}
            />
            <Button
              variant="outline"
              className="gap-2 font-bold h-12 w-full border-2"
              onClick={() => fileRef.current?.click()}
            >
              <Upload className="h-4 w-4" />
              Choose file to upload
            </Button>
          </div>
        </div>
      )}

      {/* Step 2: Preview */}
      {step === 2 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold">{fileName}</p>
              <p className="text-xs text-muted-foreground">
                {okRows.length} row{okRows.length !== 1 ? "s" : ""} ready · {badRows.length} skipped
              </p>
            </div>
            <Button variant="ghost" size="sm" onClick={reset}>
              <X className="h-4 w-4 mr-1" /> Start over
            </Button>
          </div>

          {/* Ready rows */}
          {okRows.length > 0 && (
            <div className="border-2 border-green-200 rounded-xl overflow-hidden">
              <div className="bg-green-50 px-4 py-2 border-b border-green-200 flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                <p className="text-sm font-bold text-green-700">{okRows.length} rows ready to import</p>
              </div>
              <div className="divide-y divide-border max-h-64 overflow-y-auto">
                {okRows.map((r, i) => (
                  <div key={i} className="flex items-center justify-between px-4 py-2.5 text-sm">
                    <div>
                      <span className="font-mono font-bold text-xs bg-muted px-1.5 py-0.5 rounded mr-2">{r.locationId}</span>
                      {r.productName}
                    </div>
                    <span className="font-bold text-primary">{r.quantity}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Skipped rows */}
          {badRows.length > 0 && (
            <div className="border-2 border-amber-200 rounded-xl overflow-hidden">
              <div className="bg-amber-50 px-4 py-2 border-b border-amber-200 flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-600" />
                <p className="text-sm font-bold text-amber-700">{badRows.length} rows will be skipped</p>
              </div>
              <div className="divide-y divide-border max-h-48 overflow-y-auto">
                {badRows.map((r, i) => (
                  <div key={i} className="flex items-center justify-between px-4 py-2.5 text-sm">
                    <div className="text-muted-foreground">
                      <span className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded mr-2">{r.locationId}</span>
                      {r.productName}
                    </div>
                    <span className="text-xs text-amber-600 font-medium">{r.reason}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {okRows.length === 0 && (
            <div className="text-center py-8 text-muted-foreground border-2 border-dashed rounded-xl">
              <AlertTriangle className="h-8 w-8 mx-auto mb-2 text-amber-400" />
              <p className="font-semibold">No valid rows found</p>
              <p className="text-sm mt-1">Make sure Location IDs and products match your data.</p>
            </div>
          )}

          <Button
            className="w-full h-12 font-bold gap-2"
            disabled={okRows.length === 0 || importing}
            onClick={runImport}
          >
            {importing ? (
              <><Loader2 className="h-4 w-4 animate-spin" /> Importing...</>
            ) : (
              <><Upload className="h-4 w-4" /> Import {okRows.length} rows</>
            )}
          </Button>
        </div>
      )}

      {/* Step 3: Done */}
      {step === 3 && summary && (
        <div className="space-y-4 text-center">
          <div className="flex flex-col items-center gap-3 py-6">
            <CheckCircle2 className="h-16 w-16 text-green-500" />
            <h2 className="text-xl font-black">Import complete!</h2>
            <p className="text-muted-foreground text-sm max-w-xs">
              Your stock quantities have been updated.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3 text-left">
            <div className="bg-green-50 border border-green-200 rounded-xl p-4">
              <p className="text-2xl font-black text-green-700">{summary.inserted}</p>
              <p className="text-xs text-green-600 font-semibold mt-1">New entries added</p>
            </div>
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
              <p className="text-2xl font-black text-blue-700">{summary.updated}</p>
              <p className="text-xs text-blue-600 font-semibold mt-1">Existing updated</p>
            </div>
            {summary.deleted > 0 && (
              <div className="bg-muted border border-border rounded-xl p-4">
                <p className="text-2xl font-black">{summary.deleted}</p>
                <p className="text-xs text-muted-foreground font-semibold mt-1">Set to zero (removed)</p>
              </div>
            )}
            {summary.skipped > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                <p className="text-2xl font-black text-amber-700">{summary.skipped}</p>
                <p className="text-xs text-amber-600 font-semibold mt-1">Rows skipped</p>
              </div>
            )}
          </div>

          <div className="flex gap-3 pt-2">
            <Button variant="outline" className="flex-1 font-bold" onClick={reset}>
              Import another file
            </Button>
            <Button className="flex-1 font-bold" onClick={() => window.location.href = "/locations"}>
              Go to Locations
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
