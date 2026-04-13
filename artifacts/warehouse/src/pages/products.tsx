import React, { useState, useRef } from "react";
import { Link } from "wouter";
import { useListProducts, useDeleteProduct } from "@workspace/api-client-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Plus, Search, AlertTriangle, Edit2, Trash2, MapPin, RefreshCw,
  Download, Upload, ChevronDown, ChevronRight, X, FileText, CheckCircle2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { ProductLocationsDialog } from "@/components/product-locations-dialog";
import { useAuth } from "@/contexts/auth";
import { useToast } from "@/hooks/use-toast";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";

type FilterType = "all" | "purchased" | "manufactured" | "final";

type ItemType = "purchased_part" | "manufactured_part" | "final_product" | "purchase" | "production";

interface ProductFull {
  id: number;
  name: string;
  category: string;
  bufferStock: number;
  targetStock: number;
  alertEmail?: string | null;
  createdAt: Date;
  totalStock: number;
  isLowStock: boolean;
  itemType: ItemType;
  supplierId?: number | null;
  supplierSku?: string | null;
  supplierProductName?: string | null;
}

const FILTER_LABELS: Record<FilterType, string> = {
  all: "All",
  purchased: "Purchased",
  manufactured: "Manufactured",
  final: "Final Products",
};

const VALID_CSV_TYPES = ["purchased_part", "manufactured_part", "final_product"] as const;
type CsvItemType = (typeof VALID_CSV_TYPES)[number];

interface CsvRow {
  name: string;
  type: string;
  category: string;
  min_stock: string;
  target_stock: string;
  supplier_name: string;
  supplier_sku: string;
  alert_email: string;
  _valid: boolean;
  _error: string;
  _supplierWarning?: string;
}

function parseCSV(text: string): Record<string, string>[] {
  const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  if (lines.length < 2) return [];
  const headers = parseCsvLine(lines[0]).map((h) => h.trim().toLowerCase());
  const rows: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const values = parseCsvLine(line);
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => { row[h] = (values[idx] ?? "").trim(); });
    rows.push(row);
  }
  return rows;
}

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
      else { inQuotes = !inQuotes; }
    } else if (ch === "," && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

function validateRows(raw: Record<string, string>[], knownSuppliers: string[]): CsvRow[] {
  const supplierSet = new Set(knownSuppliers.map((s) => s.toLowerCase().trim()));
  return raw.map((r) => {
    const name = (r["name"] ?? "").trim();
    const type = (r["type"] ?? "").trim();
    const minStockRaw = (r["min_stock"] ?? "0").trim();
    const targetStockRaw = (r["target_stock"] ?? "0").trim();
    const alertEmailRaw = (r["alert_email"] ?? "").trim();
    const errors: string[] = [];
    let supplierWarning: string | undefined;

    if (!name) errors.push("Name is required");
    if (!VALID_CSV_TYPES.includes(type as CsvItemType))
      errors.push(`Type must be one of: ${VALID_CSV_TYPES.join(", ")}`);
    if (minStockRaw && (isNaN(Number(minStockRaw)) || Number(minStockRaw) < 0 || !Number.isInteger(Number(minStockRaw))))
      errors.push("min_stock must be a non-negative integer");
    if (targetStockRaw && (isNaN(Number(targetStockRaw)) || Number(targetStockRaw) < 0 || !Number.isInteger(Number(targetStockRaw))))
      errors.push("target_stock must be a non-negative integer");
    if (alertEmailRaw && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(alertEmailRaw))
      errors.push("alert_email must be a valid email or blank");

    const supplierName = (r["supplier_name"] ?? "").trim();
    if (supplierName && !supplierSet.has(supplierName.toLowerCase()))
      supplierWarning = `Supplier "${supplierName}" not found — will import without supplier link`;

    const error = errors.join("; ");
    return {
      name,
      type,
      category: (r["category"] ?? "").trim(),
      min_stock: minStockRaw || "0",
      target_stock: targetStockRaw || "0",
      supplier_name: supplierName,
      supplier_sku: (r["supplier_sku"] ?? "").trim(),
      alert_email: alertEmailRaw,
      _valid: errors.length === 0,
      _error: error,
      _supplierWarning: supplierWarning,
    };
  });
}

function downloadTemplate() {
  const headers = "name,type,category,min_stock,target_stock,supplier_name,supplier_sku,alert_email";
  const ex1 = "M10 Hex Bolts,purchased_part,Fasteners,50,200,Acme Hardware,ACM-M10-HB,";
  const ex2 = "Side Panel Bracket,manufactured_part,Frames,5,20,,,";
  const content = [headers, ex1, ex2].join("\n");
  const blob = new Blob([content], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "inventory_template.csv";
  a.click();
  URL.revokeObjectURL(url);
}

function normalizeItemType(raw: string | undefined | null): FilterType {
  if (raw === "purchased_part" || raw === "purchase") return "purchased";
  if (raw === "manufactured_part" || raw === "production") return "manufactured";
  if (raw === "final_product") return "final";
  return "purchased";
}

function typeLabel(raw: string | undefined | null): string {
  if (raw === "manufactured_part" || raw === "production") return "Manufactured";
  if (raw === "final_product") return "Final Product";
  return "Purchased";
}

function typeBadgeClass(raw: string | undefined | null): string {
  if (raw === "manufactured_part" || raw === "production") return "bg-orange-100 text-orange-700 hover:bg-orange-100";
  if (raw === "final_product") return "bg-green-100 text-green-700 hover:bg-green-100";
  return "bg-blue-100 text-blue-700 hover:bg-blue-100";
}

async function fetchSuppliers(): Promise<{ id: number; name: string }[]> {
  const res = await fetch("/api/suppliers", { credentials: "include" });
  if (!res.ok) return [];
  return res.json();
}

async function importProducts(rows: CsvRow[]): Promise<{ created: number; skipped: { row: number; reason: string }[] }> {
  const payload = rows.map((r) => ({
    name: r.name,
    type: r.type,
    category: r.category,
    min_stock: r.min_stock,
    target_stock: r.target_stock,
    supplier_name: r.supplier_name,
    supplier_sku: r.supplier_sku,
    alert_email: r.alert_email,
  }));
  const res = await fetch("/api/products/import", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    credentials: "include",
  });
  if (!res.ok) throw new Error("Import failed");
  return res.json();
}

export default function ProductsPage() {
  const { data: rawProducts, isLoading } = useListProducts();
  const products = rawProducts as ProductFull[] | undefined;
  const deleteProduct = useDeleteProduct();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { toast } = useToast();
  const isAdmin = user?.role === "admin" || user?.role === "owner";

  const [search, setSearch] = useState("");
  const [activeFilter, setActiveFilter] = useState<FilterType>("all");
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set());
  const [selectedProduct, setSelectedProduct] = useState<number | null>(null);
  const [showLocationsDialog, setShowLocationsDialog] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [csvRows, setCsvRows] = useState<CsvRow[] | null>(null);
  const [importResult, setImportResult] = useState<{ created: number; skipped: { row: number; reason: string }[] } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: suppliers = [] } = useQuery({
    queryKey: ["suppliers"],
    queryFn: fetchSuppliers,
  });

  const importMutation = useMutation({
    mutationFn: importProducts,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      queryClient.invalidateQueries({ queryKey: ["product-categories"] });
      setImportResult(data);
      setCsvRows(null);
      if (data.skipped.length > 0) {
        const preview = data.skipped.slice(0, 3).map((s) => `Row ${s.row}: ${s.reason}`).join("; ");
        const more = data.skipped.length > 3 ? ` …and ${data.skipped.length - 3} more` : "";
        toast({ title: `Import complete: ${data.created} created, ${data.skipped.length} skipped`, description: preview + more });
      } else {
        toast({ title: "Import complete", description: `${data.created} item${data.created !== 1 ? "s" : ""} created successfully.` });
      }
    },
    onError: () => toast({ title: "Import failed", variant: "destructive" }),
  });

  const handleDelete = (id: number) => {
    deleteProduct.mutate({ productId: id }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      }
    });
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const raw = parseCSV(text);
      if (raw.length === 0) {
        toast({ title: "No rows found in file", variant: "destructive" });
        return;
      }
      setCsvRows(validateRows(raw, suppliers.map((s) => s.name)));
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const toggleCategory = (key: string) => {
    setCollapsedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const allFiltered = products?.filter((p) => {
    const q = search.toLowerCase();
    return p.name.toLowerCase().includes(q) || (p.category ?? "").toLowerCase().includes(q);
  }) ?? [];

  const byType = (filter: FilterType) => {
    if (filter === "all") return allFiltered;
    if (filter === "purchased") return allFiltered.filter((p) => p.itemType === "purchased_part" || p.itemType === "purchase");
    if (filter === "manufactured") return allFiltered.filter((p) => p.itemType === "manufactured_part" || p.itemType === "production");
    return allFiltered.filter((p) => p.itemType === "final_product");
  };

  const visibleProducts = byType(activeFilter);

  const groupedProducts = () => {
    if (activeFilter === "all" || activeFilter === "final") {
      return [{ key: "__flat__", label: null, items: visibleProducts }];
    }
    const groups = new Map<string, typeof visibleProducts>();
    for (const p of visibleProducts) {
      const cat = (p.category ?? "").trim() || "Uncategorised";
      if (!groups.has(cat)) groups.set(cat, []);
      groups.get(cat)!.push(p);
    }
    const sorted = Array.from(groups.entries()).sort(([a], [b]) => {
      if (a === "Uncategorised") return 1;
      if (b === "Uncategorised") return -1;
      return a.localeCompare(b);
    });
    return sorted.map(([key, items]) => ({ key, label: key, items }));
  };

  const groups = groupedProducts();
  const validCsvRows = csvRows?.filter((r) => r._valid) ?? [];
  const invalidCsvRows = csvRows?.filter((r) => !r._valid) ?? [];

  const ProductCard = ({ product }: { product: ProductFull }) => (
    <div
      className={`bg-card rounded-xl p-4 border-2 shadow-sm relative overflow-hidden ${
        product.isLowStock ? "border-destructive/40" : "border-border"
      }`}
    >
      {product.isLowStock && (
        <div className="absolute top-0 right-0 bg-destructive text-destructive-foreground text-[10px] font-bold px-2 py-0.5 rounded-bl-lg flex items-center gap-1">
          <AlertTriangle className="h-3 w-3" /> LOW STOCK
        </div>
      )}

      <div className="flex justify-between items-start mb-3">
        <div>
          <h3 className="font-bold text-lg leading-tight pr-16">{product.name}</h3>
          <div className="flex gap-1.5 mt-1.5 flex-wrap">
            <Badge
              className={`font-medium text-xs ${typeBadgeClass(product.itemType)}`}
              variant="outline"
            >
              {typeLabel(product.itemType)}
            </Badge>
          </div>
        </div>
        <div className="text-right">
          <p className={`text-2xl font-black leading-none ${product.isLowStock ? "text-destructive" : ""}`}>
            {product.totalStock}
          </p>
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mt-1">
            Total
          </p>
        </div>
      </div>

      <div className="space-y-3 mt-4 pt-4 border-t border-border/50">
        <div className="grid grid-cols-3 gap-2 text-xs">
          <div>
            <p className="text-muted-foreground">Buffer</p>
            <p className="font-bold text-sm text-foreground">{product.bufferStock}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Target</p>
            <p className="font-bold text-sm text-foreground">{product.targetStock || 0}</p>
          </div>
          {product.totalStock < product.bufferStock && (
            <div className="bg-red-50 rounded p-2 col-span-3">
              <div className="flex items-center gap-1 text-red-700">
                <RefreshCw className="h-3.5 w-3.5" />
                <span className="font-bold text-xs">
                  Restock: +{(product.targetStock || 0) - product.totalStock}
                </span>
              </div>
            </div>
          )}
        </div>

        <div className="flex gap-2">
          <Button
            onClick={() => { setSelectedProduct(product.id); setShowLocationsDialog(true); }}
            variant="outline"
            size="sm"
            className="flex-1 h-10 font-bold text-sm"
          >
            <MapPin className="h-4 w-4 mr-1" /> Locations
          </Button>

          {isAdmin && (
            <>
              <Link href={`/products/${product.id}/edit`}>
                <Button variant="outline" size="icon" className="h-10 w-10">
                  <Edit2 className="h-4 w-4" />
                </Button>
              </Link>

              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="outline" size="icon" className="h-10 w-10 text-destructive hover:text-destructive hover:bg-destructive/10 border-destructive/20">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent className="w-[90vw] max-w-md rounded-xl">
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete Product?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will permanently delete {product.name} and remove it from all locations. This action cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter className="flex-col gap-2 sm:flex-row sm:gap-0 mt-4">
                    <AlertDialogCancel className="h-12 w-full sm:w-auto">Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => handleDelete(product.id)}
                      className="h-12 w-full sm:w-auto bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                      Delete
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between px-1 pt-2 gap-2">
        <h1 className="text-2xl font-bold tracking-tight">Products</h1>
        <div className="flex items-center gap-2">
          {isAdmin && (
            <>
              <Button size="sm" variant="outline" className="font-bold" onClick={downloadTemplate}>
                <Download className="h-4 w-4 mr-1" /> Template
              </Button>
              <Button size="sm" variant="outline" className="font-bold" onClick={() => { setShowImport(true); setCsvRows(null); }}>
                <Upload className="h-4 w-4 mr-1" /> Import
              </Button>
              <Link href="/products/new">
                <Button size="sm" className="font-bold">
                  <Plus className="h-4 w-4 mr-1" /> New
                </Button>
              </Link>
            </>
          )}
        </div>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
        <Input
          placeholder="Search products..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10 h-12 text-md shadow-sm bg-background border-2"
        />
      </div>

      <div className="flex gap-2 flex-wrap">
        {(Object.keys(FILTER_LABELS) as FilterType[]).map((f) => (
          <button
            key={f}
            onClick={() => setActiveFilter(f)}
            className={`px-3 py-1.5 rounded-full text-sm font-semibold border-2 transition-all ${
              activeFilter === f
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-background border-border text-muted-foreground hover:border-primary/40"
            }`}
          >
            {FILTER_LABELS[f]}
            {f !== "all" && products && (
              <span className="ml-1.5 opacity-70 text-xs">
                ({byType(f).length})
              </span>
            )}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-24 w-full rounded-xl" />)}
        </div>
      ) : visibleProducts.length === 0 ? (
        <div className="text-center py-12 px-4 bg-muted/30 rounded-xl border border-dashed">
          <p className="text-muted-foreground">No products found.</p>
        </div>
      ) : (
        <div className="space-y-4 pb-8">
          {groups.map((group) => {
            if (group.label === null) {
              return (
                <div key="flat" className="space-y-3">
                  {group.items.map((p) => <ProductCard key={p.id} product={p} />)}
                </div>
              );
            }
            const isCollapsed = collapsedCategories.has(group.key);
            const lowCount = group.items.filter((p) => p.isLowStock).length;
            return (
              <div key={group.key} className="rounded-xl border-2 border-border overflow-hidden">
                <button
                  className="w-full flex items-center justify-between px-4 py-3 bg-muted/40 hover:bg-muted/60 transition-colors text-left"
                  onClick={() => toggleCategory(group.key)}
                >
                  <div className="flex items-center gap-2">
                    {isCollapsed
                      ? <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                    <span className="font-bold text-sm">{group.label}</span>
                    <span className="text-xs text-muted-foreground font-medium">({group.items.length})</span>
                    {lowCount > 0 && (
                      <span className="text-[10px] font-bold bg-destructive text-destructive-foreground px-1.5 py-0.5 rounded-full">
                        {lowCount} low
                      </span>
                    )}
                  </div>
                </button>
                {!isCollapsed && (
                  <div className="p-3 space-y-3">
                    {group.items.map((p) => <ProductCard key={p.id} product={p} />)}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {selectedProduct && (
        <ProductLocationsDialog
          open={showLocationsDialog}
          onOpenChange={setShowLocationsDialog}
          productId={selectedProduct}
          productName={products?.find((p) => p.id === selectedProduct)?.name || ""}
          totalStock={products?.find((p) => p.id === selectedProduct)?.totalStock || 0}
        />
      )}

      <Dialog open={showImport} onOpenChange={(o) => { setShowImport(o); if (!o) { setCsvRows(null); setImportResult(null); } }}>
        <DialogContent className="w-[95vw] max-w-2xl rounded-xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Import Products from CSV</DialogTitle>
          </DialogHeader>

          {importResult ? (
            <div className="flex-1 space-y-4">
              <div className={`rounded-lg p-4 border-2 ${importResult.skipped.length === 0 ? "border-green-200 bg-green-50" : "border-amber-200 bg-amber-50"}`}>
                <p className="font-bold text-lg">
                  {importResult.created} item{importResult.created !== 1 ? "s" : ""} imported
                  {importResult.skipped.length > 0 && `, ${importResult.skipped.length} skipped`}
                </p>
                {importResult.created > 0 && importResult.skipped.length === 0 && (
                  <p className="text-sm text-green-700 mt-1">All items were imported successfully.</p>
                )}
              </div>

              {importResult.skipped.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm font-semibold text-destructive">Skipped rows (with reasons):</p>
                  <div className="overflow-auto max-h-48 rounded-lg border border-border">
                    <table className="w-full text-xs">
                      <thead className="bg-muted/60 sticky top-0">
                        <tr>
                          <th className="text-left px-3 py-2 font-semibold">Row #</th>
                          <th className="text-left px-3 py-2 font-semibold">Reason</th>
                        </tr>
                      </thead>
                      <tbody>
                        {importResult.skipped.map((s) => (
                          <tr key={s.row} className="border-t border-border bg-red-50">
                            <td className="px-3 py-1.5 font-mono font-bold text-destructive">{s.row}</td>
                            <td className="px-3 py-1.5 text-destructive">{s.reason}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              <Button
                className="w-full"
                onClick={() => { setShowImport(false); setImportResult(null); }}
              >
                Done
              </Button>
            </div>
          ) : !csvRows ? (
            <div className="space-y-4 flex-1">
              <div className="rounded-lg border-2 border-dashed border-border p-6 text-center space-y-3">
                <FileText className="h-10 w-10 mx-auto text-muted-foreground" />
                <div>
                  <p className="font-semibold">Select your CSV file</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Use the template (download it from the Products page) to prepare your data.
                  </p>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,text/csv"
                  className="hidden"
                  onChange={handleFileChange}
                />
                <div className="flex gap-2 justify-center">
                  <Button variant="outline" onClick={downloadTemplate}>
                    <Download className="h-4 w-4 mr-1" /> Download Template
                  </Button>
                  <Button onClick={() => fileInputRef.current?.click()}>
                    <Upload className="h-4 w-4 mr-1" /> Choose File
                  </Button>
                </div>
              </div>

              <div className="rounded-lg bg-muted/40 p-3 text-xs text-muted-foreground space-y-1">
                <p className="font-semibold text-foreground">CSV columns</p>
                <p><span className="font-mono bg-muted px-1 rounded">name</span> — required. Product name.</p>
                <p><span className="font-mono bg-muted px-1 rounded">type</span> — required. One of: <span className="font-mono">purchased_part</span>, <span className="font-mono">manufactured_part</span>, <span className="font-mono">final_product</span></p>
                <p><span className="font-mono bg-muted px-1 rounded">category</span> — optional. Groups items (e.g. Fasteners, Hydraulics).</p>
                <p><span className="font-mono bg-muted px-1 rounded">min_stock</span>, <span className="font-mono bg-muted px-1 rounded">target_stock</span> — optional whole numbers (integers).</p>
                <p><span className="font-mono bg-muted px-1 rounded">supplier_name</span> — optional. Must match an existing supplier name exactly.</p>
              </div>
            </div>
          ) : (
            <div className="flex-1 overflow-hidden flex flex-col gap-3 min-h-0">
              <div className="flex items-center justify-between flex-shrink-0">
                <div className="flex items-center gap-3 text-sm">
                  <span className="flex items-center gap-1 text-green-700 font-semibold">
                    <CheckCircle2 className="h-4 w-4" /> {validCsvRows.length} ready
                  </span>
                  {invalidCsvRows.length > 0 && (
                    <span className="flex items-center gap-1 text-destructive font-semibold">
                      <X className="h-4 w-4" /> {invalidCsvRows.length} invalid (will be skipped)
                    </span>
                  )}
                </div>
                <button
                  className="text-xs text-muted-foreground underline"
                  onClick={() => { setCsvRows(null); fileInputRef.current?.click(); }}
                >
                  Change file
                </button>
              </div>

              <div className="overflow-auto flex-1 rounded-lg border border-border">
                <table className="w-full text-xs min-w-[520px]">
                  <thead className="bg-muted/60 sticky top-0">
                    <tr>
                      <th className="text-left px-2 py-2 font-semibold">#</th>
                      <th className="text-left px-2 py-2 font-semibold">Name</th>
                      <th className="text-left px-2 py-2 font-semibold">Type</th>
                      <th className="text-left px-2 py-2 font-semibold">Category</th>
                      <th className="text-left px-2 py-2 font-semibold">Min</th>
                      <th className="text-left px-2 py-2 font-semibold">Target</th>
                      <th className="text-left px-2 py-2 font-semibold">Supplier</th>
                    </tr>
                  </thead>
                  <tbody>
                    {csvRows.map((row, i) => (
                      <React.Fragment key={i}>
                        <tr
                          className={`border-t border-border ${!row._valid ? "bg-red-50" : row._supplierWarning ? "bg-amber-50" : ""}`}
                        >
                          <td className="px-2 py-1.5 text-muted-foreground">{i + 1}</td>
                          <td className="px-2 py-1.5 font-medium">
                            {row.name || <span className="text-destructive italic">missing</span>}
                          </td>
                          <td className="px-2 py-1.5">
                            <span className={!VALID_CSV_TYPES.includes(row.type as CsvItemType) ? "text-destructive" : ""}>
                              {row.type || "—"}
                            </span>
                          </td>
                          <td className="px-2 py-1.5 text-muted-foreground">{row.category || "—"}</td>
                          <td className="px-2 py-1.5 font-mono">{row.min_stock || "0"}</td>
                          <td className="px-2 py-1.5 font-mono">{row.target_stock || "0"}</td>
                          <td className="px-2 py-1.5">
                            {row.supplier_name ? (
                              <span className={row._supplierWarning ? "text-amber-700" : ""}>
                                {row.supplier_name}
                                {row._supplierWarning && " ⚠"}
                              </span>
                            ) : "—"}
                          </td>
                        </tr>
                        {!row._valid && (
                          <tr className="bg-red-50">
                            <td />
                            <td colSpan={6} className="px-2 pb-1.5 text-destructive text-[11px]">
                              {row._error}
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    ))}
                  </tbody>
                </table>
              </div>

              {csvRows.some((r) => r._supplierWarning) && (
                <p className="text-xs text-amber-700 flex-shrink-0">
                  ⚠ Highlighted rows have unrecognised supplier names — those items will still import without a supplier link.
                </p>
              )}

              <div className="flex gap-2 flex-shrink-0">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => { setShowImport(false); setCsvRows(null); setImportResult(null); }}
                >
                  Cancel
                </Button>
                <Button
                  className="flex-1"
                  disabled={validCsvRows.length === 0 || importMutation.isPending}
                  onClick={() => importMutation.mutate(csvRows!)}
                >
                  {importMutation.isPending
                    ? "Importing…"
                    : invalidCsvRows.length > 0
                    ? `Import ${validCsvRows.length} valid, skip ${invalidCsvRows.length}`
                    : `Import ${validCsvRows.length} item${validCsvRows.length !== 1 ? "s" : ""}`}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
