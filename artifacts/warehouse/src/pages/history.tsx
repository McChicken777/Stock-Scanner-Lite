import { useState } from "react";
import { Link } from "wouter";
import { useListHistory } from "@workspace/api-client-react";
import { ArrowUpRight, ArrowDownRight, Search } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";

export default function HistoryPage() {
  const { data: history, isLoading } = useListHistory();
  const [search, setSearch] = useState("");

  const filteredHistory = history?.filter(entry => 
    entry.productName.toLowerCase().includes(search.toLowerCase()) || 
    entry.locationId.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="p-4 flex flex-col min-h-full">
      <div className="flex items-center justify-between px-1 pt-2 mb-4">
        <h1 className="text-2xl font-bold tracking-tight">Stock Log</h1>
      </div>

      <div className="relative mb-6">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
        <Input
          placeholder="Filter by product or location..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10 h-12 text-md shadow-sm bg-background border-2"
        />
      </div>

      <div className="flex-1 pb-8 space-y-3">
        {isLoading ? (
          [1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-20 w-full rounded-xl" />)
        ) : filteredHistory?.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            No history found
          </div>
        ) : (
          filteredHistory?.map((entry) => {
            const isAdd = entry.delta > 0;
            const isRemove = entry.delta < 0;
            const date = new Date(entry.changedAt);
            
            return (
              <div key={entry.id} className="bg-card rounded-xl p-4 border border-border shadow-sm flex gap-4">
                <div className={`mt-1 shrink-0 w-10 h-10 rounded-full flex items-center justify-center ${
                  isAdd ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 
                  isRemove ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' : 
                  'bg-muted text-muted-foreground'
                }`}>
                  {isAdd ? <ArrowUpRight className="h-5 w-5" /> : 
                   isRemove ? <ArrowDownRight className="h-5 w-5" /> : 
                   <span className="font-bold font-mono">0</span>}
                </div>
                
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-start mb-1">
                    <p className="font-bold truncate pr-2 text-foreground">{entry.productName}</p>
                    <span className={`font-mono font-bold whitespace-nowrap ${
                      isAdd ? 'text-green-600 dark:text-green-400' : 
                      isRemove ? 'text-red-600 dark:text-red-400' : 
                      'text-muted-foreground'
                    }`}>
                      {entry.delta > 0 ? "+" : ""}{entry.delta}
                    </span>
                  </div>
                  
                  <div className="flex justify-between items-end text-xs text-muted-foreground">
                    <div className="space-y-0.5">
                      <p className="flex items-center gap-1">
                        <Link href={`/location/${entry.locationId}`} className="text-primary font-medium hover:underline">
                          Loc: {entry.locationId}
                        </Link>
                      </p>
                      <p className="font-mono">{entry.previousQuantity} → {entry.newQuantity}</p>
                    </div>
                    <div className="text-right">
                      <p>{date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</p>
                      <p>{date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}</p>
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}