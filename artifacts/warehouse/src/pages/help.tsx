import { Link } from "wouter";
import { usePlan } from "@/contexts/auth";
import { useLang } from "@/contexts/lang";
import type { Lang } from "@/i18n/translations";
import {
  HelpCircle, MapPin, Package2, ScanLine, AlertTriangle, Truck,
  History, Building2, FileText, ClipboardList, ArrowLeftRight, PackageCheck, Scale,
} from "lucide-react";

// IMPORTANT: keep this page in sync with the app's features. Whenever a feature
// changes — especially anything Lite does — update the relevant step + both
// languages below.

type Icon = React.ComponentType<{ className?: string }>;
interface Step { icon: Icon; title: string; paras: string[] }
interface Guide { intro: string; steps: Step[] }

const CONTENT: Record<Lang, { lite: Guide; standard: Guide }> = {
  en: {
    lite: {
      intro: "The short version: set up your bins → add your products and who supplies them → scan a bin and flag what's low → order it from the Suppliers tab.",
      steps: [
        { icon: HelpCircle, title: "Dashboard — your home screen", paras: [
          "Shows how many locations and products you have, a Scan button to open a bin, the items that have been flagged as running low (your reorder to-do), and a quotes overview.",
        ]},
        { icon: MapPin, title: "Set up your bins (locations)", paras: [
          "A location is any physical spot stock lives — a shelf, pallet space, closet or box. Open Locations and add them one by one, or use Bulk create to generate a whole range at once.",
          "Print all gives you a sheet of QR labels — stick one on each spot so it can be scanned later.",
        ]},
        { icon: Package2, title: "Add your products", paras: [
          "Each product is just a name, a category, and the supplier you buy it from. When you pick a supplier the form adapts: an email supplier gets a supplier SKU, a web-store supplier gets a product link.",
          "Filter the product list by supplier, and use the CSV template to import many products at once.",
        ]},
        { icon: ScanLine, title: "Scan a bin and flag what's low", paras: [
          "Tap Scan and scan a bin's label to open it and see the items kept there. When something is running low, tap its flag, enter how many you need, and it goes onto the reorder list.",
          "Lite doesn't track exact counts — you simply flag what needs buying and how much.",
        ]},
        { icon: Truck, title: "Order from suppliers", paras: [
          "In Suppliers, set how each supplier takes orders (email or their web store) and the language of their order emails. The \"Needs reorder\" section groups every flagged item by supplier.",
          "Email supplier: the app emails the order straight to them (set up your sending email in Company settings first). Web-store supplier: it opens a checklist — open each item, add it to the store cart, then mark the order placed.",
        ]},
        { icon: Scale, title: "Sourcing — compare supplier quotes", paras: [
          "When you're not sure who's cheapest, open Sourcing and send one quote request to several suppliers at once. They fill in prices on a no-login link (their SKUs are pre-filled), and the app lays every response side by side — highlighting the cheapest total and the fastest delivery.",
          "Pick the winner and it becomes a purchase order in one tap. Every quote is remembered, so the \"Predicted cheapest supplier\" card can estimate the best supplier for what you're low on — order straight away, or send a fresh request to confirm.",
        ]},
        { icon: Building2, title: "Company settings", paras: [
          "Set your company name and logo, your default currency, and — important for ordering by email — your \"Order email\" (the address orders are sent from). Use Send test to confirm it works.",
        ]},
        { icon: FileText, title: "Customers & quotes", paras: [
          "Keep your customers and create quotes for them. The quotes overview on the dashboard tracks draft → sent → approved → converted.",
        ]},
        { icon: History, title: "History", paras: [
          "Every change is recorded in History with who did it and when — your audit trail.",
        ]},
      ],
    },
    standard: {
      intro: "The short version: make bins → add items → receive stock into a bin → scan to move/use → count to stay accurate → flag and reorder from Suppliers.",
      steps: [
        { icon: MapPin, title: "Set up your bins (locations)", paras: [
          "A location is anywhere stock lives — rack, shelf, pallet spot or zone. Add them in Locations (single or Bulk create) and print QR labels so they can be scanned.",
        ]},
        { icon: Package2, title: "Add what you stock", paras: [
          "Consumables go in Products & Stock (name, category, supplier). Raw metal goes in Raw Materials — each grade + size is its own stock item, measured in mm/m/kg.",
        ]},
        { icon: PackageCheck, title: "Receive, move and use stock", paras: [
          "Scan an item or bin to Receive into a bin, Move between bins, or Consume when material is used. On-hand updates in one logged step, with reserved vs free shown per item.",
        ]},
        { icon: ClipboardList, title: "Count to stay accurate (stock-take)", paras: [
          "Open Stock-Take, walk the shelves and type what you actually counted. The app flags differences and corrects the system when you save.",
        ]},
        { icon: AlertTriangle, title: "Flag and reorder", paras: [
          "Flag items that are running low (from a bin, or the shortage form). The Suppliers tab's \"Needs reorder\" groups flagged items by supplier; order by emailed purchase order or the supplier's web-store cart, then mark them ordered/arrived.",
          "Set each supplier's order method and order-email language; configure your sending email in Company settings.",
        ]},
        { icon: Scale, title: "Sourcing — compare supplier quotes", paras: [
          "Open Sourcing to send one quote request to several suppliers at once. They enter prices on a no-login link (SKUs pre-filled), and the app compares every response — flagging the cheapest total and the fastest delivery; the winner becomes a purchase order in one tap.",
          "Every quote is stored, so the \"Predicted cheapest supplier\" card estimates the best supplier for your current shortages — order straight away from known prices, or send a fresh request to confirm.",
        ]},
        { icon: ArrowLeftRight, title: "Work orders & production", paras: [
          "Build job templates, run projects through station queues, and track progress and attendance (Pro adds time tracking).",
        ]},
        { icon: History, title: "History", paras: [
          "Every receive, consume, count, move and order is recorded in History with who and why.",
        ]},
      ],
    },
  },
  sl: {
    lite: {
      intro: "Na kratko: nastavi lokacije → dodaj izdelke in njihove dobavitelje → skeniraj lokacijo in označi, česa zmanjkuje → naroči v zavihku Dobavitelji.",
      steps: [
        { icon: HelpCircle, title: "Nadzorna plošča — domači zaslon", paras: [
          "Prikazuje, koliko lokacij in izdelkov imaš, gumb Skeniraj za odpiranje lokacije, izdelke, ki so označeni kot nizki na zalogi (tvoj seznam za naročanje), in pregled ponudb.",
        ]},
        { icon: MapPin, title: "Nastavi lokacije", paras: [
          "Lokacija je katero koli fizično mesto, kjer je zaloga — polica, paletno mesto, omara ali škatla. V zavihku Lokacije jih dodaš posamično ali z Množičnim ustvarjanjem ustvariš cel sklop naenkrat.",
          "Natisni vse ti pripravi list QR nalepk — nalepi po eno na vsako mesto, da ga lahko kasneje skeniraš.",
        ]},
        { icon: Package2, title: "Dodaj izdelke", paras: [
          "Vsak izdelek je le ime, kategorija in dobavitelj, pri katerem ga kupuješ. Ko izbereš dobavitelja, se obrazec prilagodi: dobavitelj po e-pošti dobi šifro (SKU), dobavitelj s spletno trgovino pa povezavo do izdelka.",
          "Seznam izdelkov lahko filtriraš po dobavitelju, z datoteko CSV pa uvoziš več izdelkov naenkrat.",
        ]},
        { icon: ScanLine, title: "Skeniraj lokacijo in označi, česa zmanjkuje", paras: [
          "Pritisni Skeniraj in skeniraj nalepko lokacije, da jo odpreš in vidiš izdelke na njej. Ko česa zmanjkuje, pritisni zastavico, vnesi, koliko potrebuješ, in se doda na seznam za naročilo.",
          "Lite ne sledi natančnim količinam — preprosto označiš, kaj je treba kupiti in koliko.",
        ]},
        { icon: Truck, title: "Naročanje pri dobaviteljih", paras: [
          "Pri vsakem dobavitelju nastavi način naročanja (po e-pošti ali prek spletne trgovine) in jezik naročil. Razdelek »Za naročilo« združi vse označene izdelke po dobaviteljih.",
          "Dobavitelj po e-pošti: aplikacija mu naročilo pošlje neposredno (najprej nastavi svojo e-pošto v Podjetje in paket). Dobavitelj s spletno trgovino: odpre se kontrolni seznam — odpri vsak izdelek, ga dodaj v košarico trgovine, nato označi naročilo kot oddano.",
        ]},
        { icon: Scale, title: "Nabava — primerjava ponudb dobaviteljev", paras: [
          "Ko nisi prepričan, kdo je najcenejši, odpri Nabavo in pošlji eno povpraševanje več dobaviteljem hkrati. Cene vpišejo prek povezave brez prijave (njihove šifre so že izpolnjene), aplikacija pa vse odgovore postavi enega ob drugega — označi najnižji skupni znesek in najhitrejšo dobavo.",
          "Izberi zmagovalca in z enim dotikom nastane naročilnica. Vsaka ponudba se shrani, zato lahko kartica »Predvideni najcenejši dobavitelj« oceni najboljšega dobavitelja za izdelke, ki ti zmanjkujejo — naroči takoj ali pošlji novo povpraševanje za potrditev.",
        ]},
        { icon: Building2, title: "Nastavitve podjetja", paras: [
          "Nastavi ime in logotip podjetja, privzeto valuto in — pomembno za naročanje po e-pošti — »E-pošto za naročila« (naslov, s katerega se pošiljajo naročila). S Pošlji test preveri delovanje.",
        ]},
        { icon: FileText, title: "Stranke in ponudbe", paras: [
          "Vodi stranke in jim ustvarjaj ponudbe. Pregled ponudb na nadzorni plošči sledi: osnutek → poslano → odobreno → pretvorjeno.",
        ]},
        { icon: History, title: "Zgodovina", paras: [
          "Vsaka sprememba je zabeležena v Zgodovini — kdo jo je naredil in kdaj.",
        ]},
      ],
    },
    standard: {
      intro: "Na kratko: ustvari lokacije → dodaj izdelke → prevzemi zalogo na lokacijo → skeniraj za premik/porabo → preštej za točnost → označi in naroči pri dobaviteljih.",
      steps: [
        { icon: MapPin, title: "Nastavi lokacije", paras: [
          "Lokacija je kjer koli je zaloga — regal, polica, paletno mesto ali cona. Dodaj jih v Lokacije (posamično ali množično) in natisni QR nalepke za skeniranje.",
        ]},
        { icon: Package2, title: "Dodaj, kar imaš na zalogi", paras: [
          "Potrošni material gre v Izdelke in zalogo (ime, kategorija, dobavitelj). Surovine gredo v Surovine — vsaka kakovost + dimenzija je svoja postavka, merjena v mm/m/kg.",
        ]},
        { icon: PackageCheck, title: "Prevzem, premik in poraba zaloge", paras: [
          "Skeniraj izdelek ali lokacijo za Prevzem na lokacijo, Premik med lokacijami ali Porabo materiala. Zaloga se posodobi v enem zabeleženem koraku, s prikazom rezervirano/prosto.",
        ]},
        { icon: ClipboardList, title: "Preštej za točnost (popis)", paras: [
          "Odpri Popis, prehodi police in vnesi, kar si dejansko preštel. Aplikacija označi razlike in ob shranjevanju popravi sistem.",
        ]},
        { icon: AlertTriangle, title: "Označevanje in naročanje", paras: [
          "Označi izdelke, ki jih zmanjkuje (na lokaciji ali prek obrazca). Razdelek »Za naročilo« v Dobaviteljih združi označene izdelke po dobaviteljih; naroči po e-pošti ali prek spletne košarice in označi kot naročeno/prispelo.",
          "Pri vsakem dobavitelju nastavi način naročanja in jezik e-pošte; pošiljateljsko e-pošto nastavi v Podjetje in paket.",
        ]},
        { icon: Scale, title: "Nabava — primerjava ponudb dobaviteljev", paras: [
          "Odpri Nabavo in pošlji eno povpraševanje več dobaviteljem hkrati. Cene vpišejo prek povezave brez prijave (šifre so že izpolnjene), aplikacija pa primerja vse odgovore — označi najnižji skupni znesek in najhitrejšo dobavo; zmagovalec z enim dotikom postane naročilnica.",
          "Vsaka ponudba se shrani, zato kartica »Predvideni najcenejši dobavitelj« oceni najboljšega dobavitelja za trenutne primanjkljaje — naroči takoj po znanih cenah ali pošlji novo povpraševanje za potrditev.",
        ]},
        { icon: ArrowLeftRight, title: "Delovni nalogi in proizvodnja", paras: [
          "Sestavi predloge nalogov, vodi projekte skozi čakalne vrste postaj ter spremljaj napredek in prisotnost (Pro doda beleženje časa).",
        ]},
        { icon: History, title: "Zgodovina", paras: [
          "Vsak prevzem, poraba, popis, premik in naročilo so zabeleženi v Zgodovini — kdo in zakaj.",
        ]},
      ],
    },
  },
};

function StepRow({ n, step, last }: { n: number; step: Step; last: boolean }) {
  const Icon = step.icon;
  return (
    <div className="flex gap-3">
      <div className="flex flex-col items-center flex-shrink-0">
        <div className="h-9 w-9 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-black text-sm">
          {n}
        </div>
        {!last && <div className="flex-1 w-px bg-border mt-1" />}
      </div>
      <div className="pb-6 min-w-0">
        <h3 className="font-bold text-base flex items-center gap-1.5">
          <Icon className="h-4 w-4 text-primary" /> {step.title}
        </h3>
        <div className="text-sm text-muted-foreground mt-1 space-y-1.5 leading-relaxed">
          {step.paras.map((p, i) => <p key={i}>{p}</p>)}
        </div>
      </div>
    </div>
  );
}

export default function HelpPage() {
  const { atLeast } = usePlan();
  const { t, lang } = useLang();
  const guide = atLeast("standard") ? CONTENT[lang].standard : CONTENT[lang].lite;

  return (
    <div className="flex flex-col min-h-full pb-24">
      <div className="bg-secondary text-secondary-foreground p-4 sticky top-0 z-20 shadow-sm flex items-center gap-3">
        <Link href="/" className="p-2 -ml-2 rounded-full hover:bg-secondary-foreground/10 transition-colors">
          <HelpCircle className="h-6 w-6" />
        </Link>
        <div>
          <h1 className="text-xl font-black leading-none">{t("helpGuideTitle")}</h1>
          <p className="text-xs text-secondary-foreground/70 mt-0.5">{t("helpGuideSubtitle")}</p>
        </div>
      </div>

      <div className="p-4 max-w-2xl mx-auto w-full">
        <div className="rounded-xl border-2 border-border bg-card p-4 mb-5 text-sm text-muted-foreground">
          {guide.intro}
        </div>

        <div>
          {guide.steps.map((step, i) => (
            <StepRow key={i} n={i + 1} step={step} last={i === guide.steps.length - 1} />
          ))}
        </div>
      </div>
    </div>
  );
}
