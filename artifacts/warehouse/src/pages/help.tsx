import { Link } from "wouter";
import { usePlan } from "@/contexts/auth";
import {
  HelpCircle, MapPin, Package2, ScanLine, ArrowLeftRight, Minus,
  ClipboardList, AlertTriangle, Truck, History, PackageCheck, Plus,
} from "lucide-react";

// Static, no-backend inventory how-to guide. Available on every plan.

function Step({ n, icon: Icon, title, children }: {
  n: number; icon: React.ComponentType<{ className?: string }>; title: string; children: React.ReactNode;
}) {
  return (
    <div className="flex gap-3">
      <div className="flex flex-col items-center flex-shrink-0">
        <div className="h-9 w-9 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-black text-sm">
          {n}
        </div>
        <div className="flex-1 w-px bg-border mt-1" />
      </div>
      <div className="pb-6 min-w-0">
        <h3 className="font-bold text-base flex items-center gap-1.5">
          <Icon className="h-4 w-4 text-primary" /> {title}
        </h3>
        <div className="text-sm text-muted-foreground mt-1 space-y-1.5 leading-relaxed">{children}</div>
      </div>
    </div>
  );
}

function Pill({ to, label }: { to: string; label: string }) {
  return (
    <Link href={to} className="inline-flex items-center gap-1 text-primary font-semibold underline underline-offset-2">
      {label}
    </Link>
  );
}

export default function HelpPage() {
  const { atLeast } = usePlan();

  return (
    <div className="flex flex-col min-h-full pb-24">
      <div className="bg-secondary text-secondary-foreground p-4 sticky top-0 z-20 shadow-sm flex items-center gap-3">
        <Link href="/" className="p-2 -ml-2 rounded-full hover:bg-secondary-foreground/10 transition-colors">
          <HelpCircle className="h-6 w-6" />
        </Link>
        <div>
          <h1 className="text-xl font-black leading-none">Inventory guide</h1>
          <p className="text-xs text-secondary-foreground/70 mt-0.5">How to run stock end to end</p>
        </div>
      </div>

      <div className="p-4 max-w-2xl mx-auto w-full">
        <div className="rounded-xl border-2 border-border bg-card p-4 mb-5 text-sm text-muted-foreground">
          The short version: <strong className="text-foreground">make bins → add your items → receive stock into a bin → scan to move/use → count to keep it honest</strong>. Every change is logged with who and why.
        </div>

        <div>
          <Step n={1} icon={MapPin} title="Set up your bins (locations)">
            <p>A location is anywhere stock physically lives — a rack, shelf, pallet spot or zone. Open <Pill to="/locations" label="Locations" /> and add one per spot using a short code like <code className="bg-muted px-1 rounded">A1-01</code>. Label each bin (a printed code or QR) so it can be scanned later.</p>
          </Step>

          <Step n={2} icon={Package2} title="Add what you stock">
            <p><strong>Consumables</strong> (bolts, discs, paint, etc.) go in <Pill to="/products" label="Products & Stock" />. Set a <em>min</em> level so the app can warn you when it's low.</p>
            {atLeast("standard") && <p><strong>Raw metal</strong> goes in Raw Materials — each grade + size (e.g. S235 Ø30) is its own stock item, measured in mm/m/kg.</p>}
          </Step>

          <Step n={3} icon={ScanLine} title="Book stock in (receive)">
            <p>Tap <Pill to="/scan" label="Scan" /> and scan the item's label (or open it from Products). Choose <strong>Receive</strong>, pick the bin, enter the quantity. That's it — the item now shows on-hand in that bin.</p>
            <p className="text-xs">No barcode yet? You can also scan a bin and add the product to it directly.</p>
          </Step>

          <Step n={4} icon={PackageCheck} title="See where everything is">
            <p>Scan a bin (or open it from <Pill to="/locations" label="Locations" />) to see everything stored there and how much. Each item shows <strong>on-hand</strong>, and how much is <strong>reserved</strong> for jobs vs <strong>free</strong> to take.</p>
          </Step>

          <Step n={5} icon={ArrowLeftRight} title="Move pallets between bins">
            <p>Scan the item → <strong>Move</strong> → pick the destination bin and quantity. Stock leaves one bin and lands in the other in a single logged step — no double entry.</p>
          </Step>

          <Step n={6} icon={Minus} title="Use stock (consume)">
            <p>When material gets used, scan it → <strong>Consume</strong> → quantity. The on-hand drops and it's recorded against you and the reason.</p>
          </Step>

          <Step n={7} icon={ClipboardList} title="Count to stay accurate (stock-take)">
            <p>Open <Pill to="/work/stocktake" label="Stock-Take" />, walk the shelves and type what you actually counted. The app flags any differences and corrects the system to match when you save.</p>
          </Step>

          <Step n={8} icon={AlertTriangle} title="See what's running low">
            <p>Items below their min show a low-stock badge on <Pill to="/products" label="Products & Stock" />. The <Pill to="/admin/suppliers" label="Suppliers" /> tab also highlights which low items each supplier provides.</p>
          </Step>

          <Step n={9} icon={Truck} title="Reorder">
            {atLeast("standard") ? (
              <p>From the reorder queue you can raise a purchase order to a supplier in one click and email it. Mark items as arrived to add them straight back into stock.</p>
            ) : (
              <p>On Lite, the <Pill to="/admin/suppliers" label="Suppliers" /> tab shows what's low and who supplies it. Raising a purchase order in one click is a Standard feature — upgrade when you're ready to order from inside the app.</p>
            )}
          </Step>

          <div className="flex gap-3">
            <div className="flex flex-col items-center flex-shrink-0">
              <div className="h-9 w-9 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-black text-sm">10</div>
            </div>
            <div className="min-w-0">
              <h3 className="font-bold text-base flex items-center gap-1.5">
                <History className="h-4 w-4 text-primary" /> Check the history
              </h3>
              <div className="text-sm text-muted-foreground mt-1 leading-relaxed">
                <p>Every receive, consume, count, move and transfer is recorded in <Pill to="/history" label="History" /> with who did it and why — your full audit trail.</p>
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-xl border-2 border-primary/30 bg-primary/5 p-4 mt-4 text-sm">
          <p className="font-bold flex items-center gap-1.5 mb-1"><Plus className="h-4 w-4 text-primary" /> Tip</p>
          <p className="text-muted-foreground">Keep min levels realistic — they drive the low-stock warnings and the Suppliers reorder view. Start with your fastest-moving items and expand from there.</p>
        </div>
      </div>
    </div>
  );
}
