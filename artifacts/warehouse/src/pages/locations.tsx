import { useState, useRef } from "react";
import { Link, useLocation as useWouterLocation } from "wouter";
import { useListLocations, useCreateLocation, useDeleteLocation } from "@workspace/api-client-react";
import { useLang } from "@/contexts/lang";
import { useQueryClient } from "@tanstack/react-query";
import { Plus, Search, MapPin, Trash2, ArrowRight, QrCode, Printer, Grid2X2, Upload } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import * as XLSX from "xlsx";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useToast } from "@/hooks/use-toast";

const formSchema = z.object({
  id: z.string().min(2, "Location ID is required").toUpperCase(),
  description: z.string().optional().or(z.literal("")),
});
type FormValues = z.infer<typeof formSchema>;

// ── QR print label ────────────────────────────────────────────────────────────

function QrModal({ location }: { location: { id: string; description?: string | null } }) {
  const [open, setOpen] = useState(false);

  function printLabel() {
    const el = document.getElementById("qr-print-target");
    if (!el) return;
    const win = window.open("", "_blank", "width=400,height=400");
    if (!win) return;
    win.document.write(`
      <html><head><title>Label ${location.id}</title>
      <style>
        body { margin: 0; display: flex; flex-direction: column; align-items: center;
               justify-content: center; height: 100vh; font-family: monospace; }
        svg { display: block; }
        .id { font-size: 24px; font-weight: 900; margin-top: 8px; letter-spacing: 0.05em; }
        .desc { font-size: 13px; color: #555; margin-top: 2px; }
      </style></head><body>
      ${el.innerHTML}
      </body></html>
    `);
    win.document.close();
    win.focus();
    win.print();
    win.close();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" className="h-10 w-10 text-muted-foreground hover:text-foreground">
          <QrCode className="h-5 w-5" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-xs">
        <DialogHeader>
          <DialogTitle>Location label</DialogTitle>
        </DialogHeader>
        <div id="qr-print-target" className="flex flex-col items-center gap-2 py-4">
          <QRCodeSVG value={location.id} size={200} level="M" />
          <p className="font-black text-2xl font-mono tracking-wide mt-2">{location.id}</p>
          {location.description && (
            <p className="text-sm text-muted-foreground text-center">{location.description}</p>
          )}
        </div>
        <Button className="w-full gap-2" onClick={printLabel}>
          <Printer className="h-4 w-4" /> Print this label
        </Button>
      </DialogContent>
    </Dialog>
  );
}

// ── Bulk create dialog ────────────────────────────────────────────────────────

interface BulkRow { id: string; description: string }

function BulkCreateDialog() {
  const [open, setOpen] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const { toast } = useToast();
  const { t } = useLang();
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);

  // Pattern tab state
  const [prefix, setPrefix] = useState("");
  const [from, setFrom] = useState(1);
  const [to, setTo] = useState(10);
  const [descTpl, setDescTpl] = useState("");

  // Excel tab state
  const [importRows, setImportRows] = useState<BulkRow[]>([]);
  const [fileName, setFileName] = useState("");

  const patternRows: BulkRow[] = (() => {
    const p = prefix.toUpperCase().trim();
    if (!p || from < 1 || to < from || to - from > 999) return [];
    return Array.from({ length: to - from + 1 }, (_, i) => ({
      id: `${p}${from + i}`,
      description: descTpl.replace("{n}", String(from + i)),
    }));
  })();

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = new Uint8Array(ev.target!.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: "array" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const raw: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
        const rows: BulkRow[] = [];
        for (const row of raw) {
          const id = String(row[0] ?? "").trim().toUpperCase();
          if (!id || id.length < 2) continue;
          // skip header row (first cell looks like a column name, not a code)
          if (rows.length === 0 && /^[a-z ]+$/i.test(id) && !/^\d/.test(id) && !/[-_]/.test(id)) continue;
          rows.push({ id, description: String(row[1] ?? "").trim() });
        }
        setImportRows(rows);
      } catch {
        toast({ title: "Could not read file", variant: "destructive" });
      }
    };
    reader.readAsArrayBuffer(file);
  }

  async function bulkCreate(rows: BulkRow[]) {
    if (!rows.length) return;
    setIsPending(true);
    try {
      const res = await fetch("/api/locations/bulk", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locations: rows }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed");
      toast({ title: `Created ${json.created}${json.skipped ? `, skipped ${json.skipped} (already exist)` : ""}` });
      queryClient.invalidateQueries({ queryKey: ["/api/locations"] });
      setOpen(false);
      setImportRows([]);
      setFileName("");
      if (fileRef.current) fileRef.current.value = "";
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed";
      toast({ title: `Import failed: ${msg}`, variant: "destructive" });
    } finally {
      setIsPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="font-bold gap-1.5">
          <Grid2X2 className="h-4 w-4" /> {t("locationsBulkCreate")}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("locationsBulkCreateTitle")}</DialogTitle>
        </DialogHeader>
        <Tabs defaultValue="pattern" className="mt-2">
          <TabsList className="w-full">
            <TabsTrigger value="pattern" className="flex-1">Pattern</TabsTrigger>
            <TabsTrigger value="excel" className="flex-1">Excel / CSV</TabsTrigger>
          </TabsList>

          {/* Pattern tab */}
          <TabsContent value="pattern" className="space-y-4 pt-2">
            <div className="flex gap-2">
              <div className="flex-1">
                <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground block mb-1">Prefix</label>
                <Input
                  placeholder="e.g. W1-A"
                  value={prefix}
                  onChange={(e) => setPrefix(e.target.value.toUpperCase())}
                  className="h-10 font-mono uppercase border-2"
                />
              </div>
              <div className="w-20">
                <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground block mb-1">From</label>
                <Input type="number" min={1} value={from} onChange={(e) => setFrom(Number(e.target.value))} className="h-10 border-2" />
              </div>
              <div className="w-20">
                <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground block mb-1">To</label>
                <Input type="number" min={from} value={to} onChange={(e) => setTo(Number(e.target.value))} className="h-10 border-2" />
              </div>
            </div>
            <div>
              <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground block mb-1">
                Description template <span className="normal-case font-normal">(optional, use <code className="bg-muted px-1 rounded">{"{n}"}</code> for number)</span>
              </label>
              <Input
                placeholder='e.g. Warehouse 1, shelf {n}'
                value={descTpl}
                onChange={(e) => setDescTpl(e.target.value)}
                className="h-10 border-2"
              />
            </div>

            {/* Preview */}
            {patternRows.length > 0 && (
              <div>
                <p className="text-xs text-muted-foreground mb-1">
                  Preview: <strong>{patternRows.length} locations</strong>
                </p>
                <div className="border rounded-lg max-h-36 overflow-y-auto divide-y text-sm">
                  {patternRows.slice(0, 20).map((r) => (
                    <div key={r.id} className="flex items-center gap-2 px-3 py-1.5">
                      <span className="font-mono font-bold">{r.id}</span>
                      {r.description && <span className="text-muted-foreground truncate text-xs">{r.description}</span>}
                    </div>
                  ))}
                  {patternRows.length > 20 && (
                    <div className="px-3 py-1.5 text-muted-foreground text-xs">…and {patternRows.length - 20} more</div>
                  )}
                </div>
              </div>
            )}

            <Button
              className="w-full h-11 font-bold"
              disabled={patternRows.length === 0 || isPending}
              onClick={() => bulkCreate(patternRows)}
            >
              {isPending ? "Creating…" : `Create ${patternRows.length} locations`}
            </Button>
          </TabsContent>

          {/* Excel tab */}
          <TabsContent value="excel" className="space-y-4 pt-2">
            <div className="border-2 border-dashed rounded-xl p-6 text-center">
              <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
              <p className="text-sm font-semibold mb-1">Upload Excel or CSV</p>
              <p className="text-xs text-muted-foreground mb-3">Column A: location code · Column B: description (optional)</p>
              <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
                Choose file
              </Button>
              <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleFile} />
              {fileName && <p className="text-xs text-muted-foreground mt-2 truncate">{fileName}</p>}
            </div>

            {importRows.length > 0 && (
              <div>
                <p className="text-xs text-muted-foreground mb-1">
                  Preview: <strong>{importRows.length} rows</strong>
                </p>
                <div className="border rounded-lg max-h-40 overflow-y-auto divide-y text-sm">
                  {importRows.slice(0, 10).map((r, i) => (
                    <div key={i} className="flex items-center gap-2 px-3 py-1.5">
                      <span className="font-mono font-bold">{r.id}</span>
                      {r.description && <span className="text-muted-foreground truncate text-xs">{r.description}</span>}
                    </div>
                  ))}
                  {importRows.length > 10 && (
                    <div className="px-3 py-1.5 text-muted-foreground text-xs">…and {importRows.length - 10} more</div>
                  )}
                </div>
              </div>
            )}

            <Button
              className="w-full h-11 font-bold"
              disabled={importRows.length === 0 || isPending}
              onClick={() => bulkCreate(importRows)}
            >
              {isPending ? "Importing…" : importRows.length > 0 ? `Import ${importRows.length} locations` : "Import"}
            </Button>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function LocationsPage() {
  const { data: locations, isLoading } = useListLocations();
  const deleteLocation = useDeleteLocation();
  const createLocation = useCreateLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { t } = useLang();
  const [, navigate] = useWouterLocation();

  const [search, setSearch] = useState("");
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { id: "", description: "" },
  });

  const filteredLocations = locations?.filter(l =>
    l.id.toLowerCase().includes(search.toLowerCase()) ||
    (l.description && l.description.toLowerCase().includes(search.toLowerCase()))
  );

  const handleDelete = (id: string) => {
    deleteLocation.mutate({ locationId: id }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["/api/locations"] });
        toast({ title: "Location deleted" });
      },
      onError: () => {
        toast({ title: "Cannot delete location", description: "Ensure it is empty first", variant: "destructive" });
      }
    });
  };

  const onSubmit = (data: FormValues) => {
    createLocation.mutate(
      { data: { id: data.id, description: data.description || null } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: ["/api/locations"] });
          toast({ title: "Location created" });
          setIsCreateOpen(false);
          form.reset();
        },
        onError: () => toast({ title: "Failed to create location", variant: "destructive" })
      }
    );
  };

  return (
    <div className="p-4 flex flex-col min-h-full">
      <div className="flex items-center justify-between px-1 pt-2 mb-4 gap-2 flex-wrap">
        <h1 className="text-2xl font-bold tracking-tight">{t("locationsTitle")}</h1>

        <div className="flex items-center gap-2">
          {/* Print all QR codes */}
          <Button size="sm" variant="ghost" className="gap-1.5 font-bold text-muted-foreground" onClick={() => navigate("/locations/print-sheet")}>
            <Printer className="h-4 w-4" /> {t("locationsPrintAll")}
          </Button>

          {/* Bulk create */}
          <BulkCreateDialog />

          {/* Single create */}
          <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="font-bold">
                <Plus className="h-4 w-4 mr-1" /> {t("new")}
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>{t("locationsCreateDialog")}</DialogTitle>
              </DialogHeader>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 pt-4">
                  <FormField
                    control={form.control}
                    name="id"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-sm font-bold uppercase tracking-wider text-muted-foreground">{t("locationsIdLabel")}</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g. A1-01-02" className="h-12 font-mono uppercase border-2" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="description"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-sm font-bold uppercase tracking-wider text-muted-foreground">{t("locationsDescLabel")}</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g. Top Shelf, Aisle 1" className="h-12 border-2" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <div className="pt-4">
                    <Button type="submit" className="w-full h-12 font-bold text-lg" disabled={createLocation.isPending}>
                      {createLocation.isPending ? t("saving") : t("locationsSave")}
                    </Button>
                  </div>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="relative mb-6">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
        <Input
          placeholder={t("locationsSearchPlaceholder")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10 h-12 text-md shadow-sm bg-background border-2"
        />
      </div>

      <div className="flex-1 pb-8 space-y-3">
        {isLoading ? (
          [1, 2, 3, 4].map(i => <Skeleton key={i} className="h-20 w-full rounded-xl" />)
        ) : filteredLocations?.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            {t("locationsNone")}
          </div>
        ) : (
          filteredLocations?.map((location) => (
            <div key={location.id} className="bg-card rounded-xl p-4 border border-border shadow-sm flex items-center justify-between">
              <div className="flex gap-3 items-center">
                <div className="w-10 h-10 rounded-full bg-secondary text-secondary-foreground flex items-center justify-center shrink-0">
                  <MapPin className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-bold text-lg font-mono text-foreground">{location.id}</h3>
                  {location.description && (
                    <p className="text-xs text-muted-foreground">{location.description}</p>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-1">
                <QrModal location={location} />

                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-10 w-10 text-destructive hover:text-destructive hover:bg-destructive/10">
                      <Trash2 className="h-5 w-5" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent className="w-[90vw] max-w-md rounded-xl">
                    <AlertDialogHeader>
                      <AlertDialogTitle>{t("locationsDeleteQ")}</AlertDialogTitle>
                      <AlertDialogDescription>
                        {t("locationsDeleteDesc")}
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter className="flex-col gap-2 sm:flex-row sm:gap-0 mt-4">
                      <AlertDialogCancel className="h-12 w-full sm:w-auto">{t("cancel")}</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() => handleDelete(location.id)}
                        className="h-12 w-full sm:w-auto bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      >
                        {t("delete")}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>

                <Link href={`/location/${location.id}`}>
                  <Button variant="secondary" size="icon" className="h-10 w-10 rounded-full">
                    <ArrowRight className="h-5 w-5" />
                  </Button>
                </Link>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
