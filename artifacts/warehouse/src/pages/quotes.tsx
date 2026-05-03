import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { useState } from "react";
import { useAuth } from "@/contexts/auth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, FileText, ChevronRight, Search, X } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

interface QuoteRow {
  id: number;
  quoteNumber: string;
  status: "draft" | "sent" | "approved" | "rejected" | "converted";
  customerId: number | null;
  customerDisplayName: string;
  total: number | string;
  validUntil: string | null;
  workProjectId: number | null;
  createdAt: string;
}

const statuses: { key: QuoteRow["status"] | "all"; label: string; color: string }[] = [
  { key: "all", label: "All", color: "bg-muted text-foreground" },
  { key: "draft", label: "Draft", color: "bg-slate-100 text-slate-700" },
  { key: "sent", label: "Sent", color: "bg-blue-100 text-blue-700" },
  { key: "approved", label: "Approved", color: "bg-green-100 text-green-700" },
  { key: "rejected", label: "Rejected", color: "bg-red-100 text-red-700" },
  { key: "converted", label: "Converted", color: "bg-purple-100 text-purple-700" },
];

const statusBadge: Record<string, string> = {
  draft: "bg-slate-100 text-slate-700 border-slate-200",
  sent: "bg-blue-100 text-blue-700 border-blue-200",
  approved: "bg-green-100 text-green-700 border-green-200",
  rejected: "bg-red-100 text-red-700 border-red-200",
  converted: "bg-purple-100 text-purple-700 border-purple-200",
};

export default function QuotesPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [filter, setFilter] = useState<typeof statuses[number]["key"]>("all");
  const [search, setSearch] = useState("");
  const [customerFilter, setCustomerFilter] = useState<string>("all");
  const [fromDate, setFromDate] = useState<string>("");
  const [toDate, setToDate] = useState<string>("");

  const { data: quotes = [], isLoading } = useQuery<QuoteRow[]>({
    queryKey: ["/api/quotes", fromDate, toDate],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (fromDate) params.set("from", new Date(fromDate).toISOString());
      if (toDate) {
        const end = new Date(toDate); end.setHours(23, 59, 59, 999);
        params.set("to", end.toISOString());
      }
      const url = "/api/quotes" + (params.toString() ? `?${params}` : "");
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  const customers = Array.from(
    new Map(
      quotes
        .filter((q) => q.customerId !== null)
        .map((q) => [q.customerId, { id: q.customerId!, name: q.customerDisplayName }]),
    ).values(),
  );

  const filtered = quotes.filter((q) => {
    if (filter !== "all" && q.status !== filter) return false;
    if (customerFilter !== "all" && String(q.customerId ?? "") !== customerFilter) return false;
    if (search) {
      const s = search.toLowerCase();
      if (!q.quoteNumber.toLowerCase().includes(s) && !q.customerDisplayName.toLowerCase().includes(s)) return false;
    }
    return true;
  });

  const hasActiveFilter = filter !== "all" || customerFilter !== "all" || fromDate || toDate || search;

  return (
    <div className="p-4 space-y-4 pb-24">
      <div className="flex items-center justify-between pt-2">
        <div>
          <h1 className="text-2xl font-black">Quotes</h1>
          <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">{quotes.length} total</p>
        </div>
        {isAdmin && (
          <Link href="/quotes/new">
            <Button size="sm" className="font-bold gap-1"><Plus className="h-4 w-4" /> New</Button>
          </Link>
        )}
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by number or customer…" className="pl-9 h-10 border-2" />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <select
          value={customerFilter}
          onChange={(e) => setCustomerFilter(e.target.value)}
          className="h-10 px-3 rounded-md border-2 bg-background text-sm font-medium"
        >
          <option value="all">All customers</option>
          {customers.map((c) => (
            <option key={c.id} value={String(c.id)}>{c.name}</option>
          ))}
        </select>
        <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="h-10 border-2" placeholder="From" />
        <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="h-10 border-2" placeholder="To" />
      </div>
      {hasActiveFilter && (
        <button
          onClick={() => { setFilter("all"); setCustomerFilter("all"); setFromDate(""); setToDate(""); setSearch(""); }}
          className="text-xs font-bold uppercase tracking-wider text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
        >
          <X className="h-3 w-3" /> Clear filters
        </button>
      )}

      <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1">
        {statuses.map((s) => (
          <button
            key={s.key}
            onClick={() => setFilter(s.key)}
            className={cn(
              "px-3 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider whitespace-nowrap transition-all border-2",
              filter === s.key ? `${s.color} border-current` : "bg-muted/30 text-muted-foreground border-transparent"
            )}
          >
            {s.label} {filter === s.key && quotes.filter((q) => s.key === "all" || q.status === s.key).length > 0 && `(${quotes.filter((q) => s.key === "all" || q.status === s.key).length})`}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="space-y-2">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-20 w-full rounded-xl" />)}</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 px-4 bg-muted/30 rounded-xl border border-dashed">
          <FileText className="h-10 w-10 mx-auto mb-3 text-muted-foreground" />
          <p className="font-semibold">No quotes</p>
          {isAdmin && <p className="text-sm text-muted-foreground mt-1">Create your first quote to send to a customer.</p>}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((q) => (
            <Link key={q.id} href={`/quotes/${q.id}`}>
              <div className="bg-card border-2 border-border rounded-xl p-3 hover:border-primary/40 transition-colors cursor-pointer">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-bold">{q.quoteNumber}</p>
                      <Badge className={`text-[9px] uppercase ${statusBadge[q.status]}`}>{q.status}</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground truncate mt-0.5">{q.customerDisplayName}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{format(new Date(q.createdAt), "dd MMM yyyy")}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-mono font-black text-lg">${Number(q.total).toFixed(2)}</p>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
