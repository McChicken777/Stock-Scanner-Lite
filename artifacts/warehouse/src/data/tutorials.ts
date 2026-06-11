import type { Lang } from "@/i18n/translations";

export type TutorialKey =
  | "jobs" | "tasks" | "templates" | "stations" | "materials"
  | "products" | "locations" | "suppliers" | "purchasing" | "reorder"
  | "customers" | "quotes" | "users" | "attendance" | "leave"
  | "report" | "supervisor" | "company" | "analytics"
  | "inbound" | "paintqueue";

export interface TutorialStep {
  heading: string;
  body: string;
  tip?: string;
}

export interface Tutorial {
  title: string;
  subtitle: string;
  steps: TutorialStep[];
}

export const TUTORIALS: Record<TutorialKey, Tutorial> = {
  jobs: {
    title: "Jobs & Work Orders",
    subtitle: "Your production board — everything in one place",
    steps: [
      {
        heading: "Your production board",
        body: "All active jobs appear here, sorted by urgency. Overdue jobs are red, due today/tomorrow are orange, and due this week are amber. Completed jobs sit at the bottom.",
      },
      {
        heading: "Creating a work order",
        body: "Tap New to create a job. Pick a template you've built in Job Templates, set the deadline, priority, and how many items to produce. The system creates all steps automatically.",
        tip: "Set Urgent priority for rush jobs — workers see these pinned at the top of their task list.",
      },
      {
        heading: "Reading the board cards",
        body: "Each card shows: the job name, deadline countdown, a progress bar, a blocked-step count (shield icon), and the names of workers currently active on it.",
      },
      {
        heading: "Show more jobs",
        body: "Each section shows 5 jobs by default. Tap 'Show X more' to expand and see all jobs in that urgency group. Tap 'Show less' to collapse it again.",
      },
      {
        heading: "Supervisor View",
        body: "Scroll to the bottom of this page to find the embedded Supervisor panel with three tabs: Daily Plan (steps by role), Bottlenecks (overdue, blocked, stalled deliveries), and Unlogged (parts with missing locations).",
        tip: "The Supervisor panel only shows for admins and supervisors — workers see the job board only.",
      },
    ],
  },

  tasks: {
    title: "My Tasks",
    subtitle: "Your daily work list — start here every morning",
    steps: [
      {
        heading: "Steps assigned to you",
        body: "This page shows all production steps assigned to your role(s) that are ready to start. A green badge means it's ready. A lock icon means a previous step hasn't finished yet.",
      },
      {
        heading: "Starting a step",
        body: "Tap Start on any step. This automatically clocks you into attendance if you haven't already. The timer begins counting your work time.",
      },
      {
        heading: "Completing a step",
        body: "Tap Stop, then Complete. You'll be asked where you left the part: a warehouse location (scan or type the bin ID), a production zone, or 'with a worker'.",
        tip: "Always log the location — your supervisor uses this to track where every part is on the floor.",
      },
      {
        heading: "Batch steps",
        body: "Some steps are set to batch mode. A 'Batch' button appears when multiple items can be grouped and done together — e.g. weld 5 frames in one go, log one time entry for all of them.",
      },
    ],
  },

  templates: {
    title: "Job Templates",
    subtitle: "The production blueprint — build this before creating jobs",
    steps: [
      {
        heading: "What templates do",
        body: "Templates define how a product is made. Every work order is created from a template. The steps, roles, and station assignments you define here become the tasks workers see.",
        tip: "Set up templates before creating users — tasks appear automatically the moment a job is created.",
      },
      {
        heading: "Creating a template",
        body: "Click New Template, give it a name (e.g. 'Steel Frame 2m'). Optionally link it to a product from your catalogue — this enables material stock checks when creating jobs.",
      },
      {
        heading: "Adding steps",
        body: "Steps run in order unless you set dependencies. For each step set: a Role (who does it), a Station Type (where it happens), Batch Mode (individual, batch any, or batch same type), and a duration estimate in minutes.",
      },
      {
        heading: "Step dependencies",
        body: "Click the lock icon on a step to define what must finish before it can start. E.g. Welding can't start until Cutting is done. Workers only see steps that are unlocked.",
        tip: "Dependency chains prevent workers from working out of order — the system enforces your production flow automatically.",
      },
      {
        heading: "Consuming materials",
        body: "If a step uses raw material (bolts, welding wire, paint), set 'Consumes product' and the quantity. The system checks stock when a job is created and warns if there's a shortfall before you commit.",
      },
      {
        heading: "Step presets & AI editing",
        body: "Save a set of steps as a preset (e.g. 'Standard QC Steps') to apply to new templates in one click. Or use the AI text box to modify steps with natural language: 'Add a primer coat step after sanding'.",
      },
    ],
  },

  stations: {
    title: "Production Flow",
    subtitle: "Map your physical shop floor — stations and machines",
    steps: [
      {
        heading: "Two-level structure",
        body: "Station Types represent kinds of work (Cutting, Welding, CNC, Paint). Workstations are the individual machines within each type (Bandsaw 1, MIG Welder 2, CNC Machine A).",
      },
      {
        heading: "Creating station types",
        body: "Each station type needs a name, a color (shown on queues and boards), and optionally a default role. Drag the cards to reorder them — this flow order is reflected in station queue views.",
        tip: "Create station types before building job templates — templates reference them when assigning steps to stations.",
      },
      {
        heading: "Adding workstations",
        body: "Under each station type, add every physical machine. Set isActive to false for equipment that's out for maintenance — it won't appear in the queue assignment list.",
      },
      {
        heading: "Live queue",
        body: "Click the arrow on any station type to open its live work queue. Workers claim a step to a specific workstation, start it, and mark it complete. The number badge shows pending steps.",
        tip: "A green pulse dot on the station card means someone is actively working there right now.",
      },
    ],
  },

  materials: {
    title: "Materials",
    subtitle: "Raw materials and purchased parts — import in bulk",
    steps: [
      {
        heading: "What belongs here",
        body: "Materials shows purchased parts and manufactured parts — the raw inputs used in production. It's a focused view of your product catalogue filtered to those two types.",
      },
      {
        heading: "Importing in bulk",
        body: "Click Download Template to get the Excel/CSV template. Fill it in and drag it onto the import area. The importer accepts both .csv and .xlsx files.",
      },
      {
        heading: "Template columns",
        body: "name (required), category, unit (pcs / kg / m / mm / L), buffer_stock (low-stock alert threshold), target_stock (ideal level). Rows starting with # are comments — the template uses them for examples.",
        tip: "Use the preset categories: Fasteners, Hydraulics, Electrical, Welding Supplies, CNC Parts, Raw Materials, Pneumatics, Bearings & Seals, Hardware, Consumables.",
      },
      {
        heading: "Inline editing",
        body: "Click any material row to edit the name, category, or unit directly in the table. No forms to open — just click and type.",
      },
    ],
  },

  products: {
    title: "Products & Stock",
    subtitle: "Your full product catalogue with live stock levels",
    steps: [
      {
        heading: "The full catalogue",
        body: "This page shows everything: purchased parts, manufactured parts, and final products. Each product tracks total stock across all locations, low-stock alerts, and linked suppliers.",
      },
      {
        heading: "Importing via CSV",
        body: "Click Import and upload a CSV. Required columns: name, type. Optional: category, min_stock, target_stock, supplier_name, supplier_sku, alert_email.",
        tip: "supplier_name must exactly match a supplier you've already created — the import auto-links them. Duplicate names are skipped and listed in the import result.",
      },
      {
        heading: "Product types",
        body: "purchased_part — raw materials and bought components (what you order). manufactured_part — sub-assemblies you make in-house. final_product — what you sell to customers.",
      },
      {
        heading: "Stock levels",
        body: "The colored bar on each product shows stock vs target. Red means stock is below the buffer threshold (a low-stock alert fires). Amber means below target. Green means healthy.",
      },
      {
        heading: "Adjusting stock",
        body: "Click a product to see stock per location. Tap any location to open the adjustment screen. Enter a positive or negative number to add or remove units — every change is logged in History.",
      },
    ],
  },

  locations: {
    title: "Warehouse Locations",
    subtitle: "Bins, shelves, and racks — scan QR codes to update stock",
    steps: [
      {
        heading: "What locations are",
        body: "Locations are physical storage spots: racks, bins, shelves. Each gets a unique ID and a QR code you print and stick on the physical shelf.",
      },
      {
        heading: "Choosing IDs",
        body: "Pick a clear convention and stick to it. Recommended: A1-R01-S2-B3 (Aisle-Rack-Shelf-Bin) or SHELF-A1. IDs are uppercase, permanent, and appear on printed labels.",
        tip: "Keep IDs short — workers type them as fallback when the QR scanner struggles.",
      },
      {
        heading: "Printing QR labels",
        body: "Click the QR icon on any location to open the printable label. Print and laminate it. Stick it on the physical shelf so it's visible when scanning.",
      },
      {
        heading: "Scanning stock",
        body: "Workers open the Scan tab, point the camera at a QR code, and land directly on that location's stock page. Stock updates from anywhere on the shop floor without walking back to a terminal.",
      },
      {
        heading: "Entering initial stock",
        body: "After setup, visit each location, find the products stored there, and enter the current quantities. Every adjustment is logged so your audit history is clean from day one.",
      },
    ],
  },

  suppliers: {
    title: "Suppliers",
    subtitle: "Your supplier directory — linked to products and purchase orders",
    steps: [
      {
        heading: "Why suppliers matter",
        body: "Suppliers link to products, purchase orders, and the reorder queue. A supplier with an email address set can receive automated PO emails generated by the system.",
        tip: "Create suppliers before importing products via CSV — the supplier_name column auto-links at import time (exact name match required).",
      },
      {
        heading: "Adding a supplier",
        body: "Name (required), email (used for PO emails), phone, and notes. Use the Notes field for lead times, payment terms, or minimum order values.",
      },
      {
        heading: "Linking products",
        body: "Expand a supplier card and click Add Product. Select a purchased_part product, enter the supplier's SKU and your unit price. This data appears automatically on purchase orders and reorder alerts.",
      },
    ],
  },

  purchasing: {
    title: "Purchase Orders",
    subtitle: "Order materials, track deliveries, receive stock",
    steps: [
      {
        heading: "The purchase flow",
        body: "Purchase Orders track what you've ordered, what's arrived, and where stock was put. Status flows: Draft → Ordered → Partially Arrived → Arrived.",
      },
      {
        heading: "Creating a PO",
        body: "Pick a supplier (or leave blank for ad-hoc orders), set an expected delivery date, and add line items (products + quantities). You can also create POs directly from the Reorder Queue.",
        tip: "Use the New PO form's supplier dropdown — after selecting a supplier, their linked products appear grouped by category with quantity inputs.",
      },
      {
        heading: "Receiving stock",
        body: "For each line item, click Receive. Enter the quantity that arrived and select the location to put it. Stock updates immediately and the PO status advances automatically.",
      },
      {
        heading: "Emailing your supplier",
        body: "Once a PO is in Ordered status, the Email button generates a pre-written email with all line items, SKUs, and prices ready to send via your email client.",
      },
      {
        heading: "Waiting projects",
        body: "Each line item shows which active projects need that product — so you know the impact of a delayed delivery before you chase the supplier.",
      },
    ],
  },

  reorder: {
    title: "Reorder Queue",
    subtitle: "Automatic restocking alerts — your daily purchasing checklist",
    steps: [
      {
        heading: "Automatic alerts",
        body: "Products appear here when stock falls below their min_stock (reorder point). They're grouped by supplier so you can order everything from one supplier in a single PO.",
        tip: "Set min_stock on every critical material in Products & Stock — this page becomes your automated restocking checklist.",
      },
      {
        heading: "Creating a PO",
        body: "Click Create PO next to a supplier group. A draft PO is created instantly with all low-stock products pre-filled and their supplier prices loaded.",
      },
      {
        heading: "Shortage flags",
        body: "Workers can raise shortage flags mid-job when they run out of a material. These appear here with the project context so you know which jobs are impacted.",
      },
      {
        heading: "Pending POs filter",
        body: "Toggle 'Hide items with pending POs' to avoid ordering materials that are already on order. Prevents duplicate orders.",
      },
    ],
  },

  customers: {
    title: "Customers",
    subtitle: "Your customer directory — linked to quotes and work orders",
    steps: [
      {
        heading: "Customer records",
        body: "Every company or person you quote and work for lives here. Customers link to quotes, and approved quotes convert into work orders — so the full job history traces back to the customer.",
        tip: "Add the customer before creating their quote — it saves re-typing their details and keeps the history clean.",
      },
      {
        heading: "Adding a customer",
        body: "Name is required. Add contact person, phone, email, and address — these fields auto-populate into quotes when you select this customer.",
      },
      {
        heading: "Customer detail",
        body: "Click any customer to see all their quotes and job history. You can create a new quote pre-filled with their contact details directly from this page.",
      },
    ],
  },

  quotes: {
    title: "Quotes",
    subtitle: "Create quotes, get approval, convert to work orders",
    steps: [
      {
        heading: "The quote lifecycle",
        body: "Quotes flow through: Draft (being prepared) → Sent (emailed to customer) → Approved (customer confirmed) → Converted (turned into a work order). Rejected quotes stay on file.",
      },
      {
        heading: "Creating a quote",
        body: "Pick an existing customer or enter manual contact details. Add line items from your product catalogue or type them manually. Set unit prices, discount amount, and tax rate.",
      },
      {
        heading: "Converting to a work order",
        body: "Once a quote is Approved, click Convert. This creates a linked work project automatically. The quote and the job are linked — you can navigate between them.",
        tip: "Set a valid_until date on every quote — expired quotes are highlighted so you know when to follow up.",
      },
      {
        heading: "Revision history",
        body: "Every time you edit a quote, save a revision with a note. The full version history is kept — useful when customers ask what changed between versions.",
      },
    ],
  },

  users: {
    title: "Manage Users",
    subtitle: "Create worker accounts and assign production roles",
    steps: [
      {
        heading: "Two user types",
        body: "Workers see only their own tasks, attendance, and inbound. Admins have full access to all pages. Only create admin accounts for managers who need to configure the system.",
        tip: "Create production roles in Production Flow before adding users — you can't assign a role that doesn't exist yet.",
      },
      {
        heading: "Creating a user",
        body: "Username (what they log in with — keep it simple, e.g. johnk), password (tell them verbally — they can't change it themselves; admins reset it), and role.",
      },
      {
        heading: "Assigning production roles",
        body: "Click the roles icon on a user card. Assign roles with priority: Primary (their main role), Secondary (can cover if needed), Substitution (last resort). Workers only see steps matching their assigned roles.",
      },
      {
        heading: "Supervisors",
        body: "Toggle the Supervisor flag on a worker to give them the Supervisor View, access to the Projects board, and the ability to skip or reassign steps on behalf of the team.",
      },
    ],
  },

  attendance: {
    title: "Attendance",
    subtitle: "Clock in, clock out, and manage leave",
    steps: [
      {
        heading: "Clocking in and out",
        body: "Tap Clock In at the start of the shift and Clock Out at the end. The system calculates regular hours and overtime automatically based on your company's configured work hours per day.",
      },
      {
        heading: "Auto clock-in",
        body: "If a worker starts a task in My Tasks without clocking in first, the system clocks them in automatically. They still need to clock out manually at the end of the day.",
        tip: "If a shift doesn't close by midnight it's auto-closed. The worker sees a badge on their Attendance tab — tap it to acknowledge and the badge clears.",
      },
      {
        heading: "Leave requests",
        body: "Submit sick leave or vacation requests from the bottom of this page. Choose the type (sick or vacation), start and end dates. The request goes to your admin's Leave Inbox for approval.",
      },
      {
        heading: "Shift history",
        body: "The page shows the last 14 days of clock-in/out records. Auto-closed shifts are flagged. Approved or rejected leave requests also appear here with any manager notes.",
      },
    ],
  },

  leave: {
    title: "Leave Requests",
    subtitle: "Approve or reject worker time-off requests",
    steps: [
      {
        heading: "Incoming requests",
        body: "All worker leave requests land here. The badge count on the sidebar shows how many are pending. Requests show the worker name, type (sick/vacation), dates, and when they submitted it.",
        tip: "Pending requests also show a badge on the sidebar nav — it clears when all requests have been actioned.",
      },
      {
        heading: "Approving or rejecting",
        body: "Click Approve or Reject on any request. Add an optional manager note — the worker sees this message in their Attendance page when they acknowledge your decision.",
      },
      {
        heading: "Filtering",
        body: "Use the status filter (Pending / Approved / Rejected) and the user filter to quickly find specific requests. Filter by Pending to clear your backlog first.",
      },
    ],
  },

  report: {
    title: "Attendance Report",
    subtitle: "Monthly breakdowns and CSV export for payroll",
    steps: [
      {
        heading: "Monthly breakdown",
        body: "Select a month and optionally a specific user to see a day-by-day breakdown: shift type, clock-in/out times, regular hours, overtime hours, holiday and weekend markers.",
        tip: "Set your country and import public holidays in Company Settings before running reports — otherwise holiday days won't be flagged correctly.",
      },
      {
        heading: "Overtime calculation",
        body: "Overtime is calculated automatically based on the work hours per day set in Company & Plan. Public holidays and company holidays count as full overtime — any hour worked is overtime.",
      },
      {
        heading: "Export to CSV",
        body: "Click Download to get the report as a CSV file. Use this for payroll, accounting, or HR — it includes all the columns your accountant needs.",
      },
    ],
  },

  supervisor: {
    title: "Supervisor View",
    subtitle: "Real-time production overview — spot problems before they snowball",
    steps: [
      {
        heading: "Daily Plan tab",
        body: "Shows all steps that are ready or in-progress today, grouped by production role. A red bolt icon means a role has more than 8 hours of work queued — consider reassigning some steps.",
      },
      {
        heading: "Bottlenecks tab",
        body: "Lists: overdue projects, roles with a high ratio of blocked vs ready steps, items where every remaining step is blocked, and inbound deliveries stuck unrouted for 2+ days.",
        tip: "Check Bottlenecks first thing each morning — it surfaces everything that needs your attention in one view.",
      },
      {
        heading: "Unlogged tab",
        body: "Shows steps completed in the last 7 days where the worker forgot to log the part's location. Tap 'Remind worker' to copy a ready-to-send reminder message to your clipboard.",
      },
      {
        heading: "Taking action",
        body: "On any step in the Daily Plan, tap the ⋮ menu to reassign it to a different role, skip it entirely, or mark the parent project as Urgent.",
      },
    ],
  },

  company: {
    title: "Company Settings",
    subtitle: "Work hours, overtime rules, and public holidays",
    steps: [
      {
        heading: "Company name",
        body: "Your company name appears throughout the app. Click Edit to change it at any time.",
      },
      {
        heading: "Work hours per day",
        body: "Enter the standard hours in a working day (e.g. 8). Any hours worked beyond this threshold count as overtime in attendance reports and payroll exports.",
      },
      {
        heading: "Weekend overtime",
        body: "Toggle on if all Saturday and Sunday hours count as overtime regardless of daily hours — common in manufacturing environments with shift work.",
      },
      {
        heading: "Public holidays",
        body: "Select your country and click Import to auto-load official public holidays for the year. All hours worked on these days count as overtime. Run this import at the start of each year.",
        tip: "Add company-specific closure days manually (factory shutdowns, local events) using the Add Holiday form below.",
      },
      {
        heading: "Plan",
        body: "Your current plan (Basic or Pro) is shown here. Plan upgrades are managed by the account owner — contact them to unlock Pro features like AI Analytics.",
      },
    ],
  },

  inbound: {
    title: "Inbound Deliveries",
    subtitle: "Track incoming materials from arrival to the shop floor",
    steps: [
      {
        heading: "What inbound tracks",
        body: "Every delivery of external materials — parts ordered from suppliers, customer-supplied items, or anything coming in for a specific project — gets an inbound record. It follows the item from 'expected' all the way to 'in production'.",
      },
      {
        heading: "Four statuses",
        body: "Expected → Arrived → Stored → In Production. Create the record when you know something is coming. Mark it Arrived when it shows up at the door. Route it to a location once it's put away. It moves to In Production automatically when the linked step begins.",
        tip: "Deliveries stuck as 'Expected' for 2+ days show up in the Supervisor View's Bottlenecks tab so nothing gets forgotten.",
      },
      {
        heading: "Creating a record",
        body: "Tap the + button, optionally link it to an active project, and add any notes (e.g. supplier reference, PO number). The record appears in the list as Expected.",
      },
      {
        heading: "Marking arrived",
        body: "When the delivery comes in, tap Arrived on the record. Any worker can do this — they don't need admin access.",
      },
      {
        heading: "Routing (admin)",
        body: "Once arrived, admins tap Route to assign a warehouse location (where it's being stored) and optionally a procedure step it's linked to. This moves the status to Stored.",
        tip: "Tap the print icon to generate a label for the pallet or box — useful for keeping track of what's what in the receiving bay.",
      },
    ],
  },

  paintqueue: {
    title: "Paint Shop",
    subtitle: "Paint queue — your jobs sorted by colour and deadline",
    steps: [
      {
        heading: "What you see here",
        body: "The Paint Shop shows all production steps assigned to the paint station. Each card shows the RAL colour code, the part name, project name, deadline urgency, and current status.",
      },
      {
        heading: "RAL colour codes",
        body: "The colour code (e.g. RAL 9005 for Jet Black, RAL 5010 for Gentian Blue) is set by the admin when creating the job. It appears on the card so you know exactly what colour to mix before you start.",
        tip: "Parts with the same RAL code can often be batched together in one paint run — look for matching codes before setting up the gun.",
      },
      {
        heading: "Starting a part",
        body: "Tap Start on a card to mark it as in progress. The system logs your start time. If you're painting multiple parts with the same colour, start them all before picking up the gun.",
      },
      {
        heading: "Marking complete",
        body: "Tap Complete when the part is painted and dry enough to move. You'll be asked to log where the part is going next — a location, zone, or with another worker.",
      },
    ],
  },

  analytics: {
    title: "AI Analytics",
    subtitle: "Production insights powered by your real job data",
    steps: [
      {
        heading: "What it analyses",
        body: "Analytics processes your completed work orders, time logs, and step-level data to find patterns, bottlenecks, and trends you'd miss looking at individual jobs.",
        tip: "Analytics needs at least a few completed jobs to generate meaningful insights. The more data, the better the observations.",
      },
      {
        heading: "Efficiency chart",
        body: "Shows average completion time per step type over time. Improving (falling) lines mean your team is getting faster at that step. Flat or rising lines signal a recurring bottleneck.",
      },
      {
        heading: "Bottleneck heatmap",
        body: "Shows which steps consistently have the longest wait times. Red squares = your production constraint. Focus improvement efforts here first.",
      },
      {
        heading: "Deadline accuracy",
        body: "Tracks what percentage of jobs finish on time per month. If accuracy is falling, your estimations are too optimistic — use this to calibrate realistic deadlines.",
      },
      {
        heading: "AI insights",
        body: "Categorised observations: efficiency wins, recurring bottlenecks, deadline patterns, and worker-level notes. Dismiss insights you've already acted on — new ones generate after the next refresh.",
      },
    ],
  },
};

const TUTORIALS_SL: Record<TutorialKey, Tutorial> = {
  jobs: {
    title: "Nalogi in delovni nalogi",
    subtitle: "Vaša producijska tabla — vse na enem mestu",
    steps: [
      { heading: "Vaša producijska tabla", body: "Vsi aktivni nalogi so prikazani tukaj, razvrščeni po nujnosti. Zamujeni nalogi so rdeči, tisti z rokom danes/jutri so oranžni, tisti ta teden so jantarni. Dokončani nalogi so na dnu." },
      { heading: "Ustvarjanje delovnega naloga", body: "Tapnite Novo za ustvarjanje naloga. Izberite predlogo iz Predlog nalogov, nastavite rok, prioriteto in število kosov. Sistem samodejno ustvari vse korake.", tip: "Nastavite prioriteto Nujno za rush naloge — delavci jih vidijo na vrhu svojega seznama nalog." },
      { heading: "Branje kartic table", body: "Vsaka kartica prikazuje: ime naloga, odštevalnik roka, vrstico napredka, število blokiranih korakov (ikona ščita) in imena delavcev, ki trenutno delajo na njej." },
      { heading: "Prikaži več nalogov", body: "Vsaka sekcija privzeto prikazuje 5 nalogov. Tapnite 'Prikaži X več' za razširitev. Tapnite 'Prikaži manj' za skrčitev." },
      { heading: "Pogled nadzornika", body: "Pomaknite se na dno za vgrajeno ploščo nadzornika s tremi zavihki: Dnevni načrt, Ozka grla in Nezabeleženo.", tip: "Plošča nadzornika se prikazuje samo za administratorje in nadzornike — delavci vidijo samo tablo nalogov." },
    ],
  },
  tasks: {
    title: "Moje naloge",
    subtitle: "Vaš dnevni seznam del — začnite tukaj vsako jutro",
    steps: [
      { heading: "Koraki, dodeljeni vam", body: "Ta stran prikazuje vse producijske korake za vašo vlogo, ki so pripravljeni za začetek. Zelena značka pomeni pripravljeno. Ikona ključavnice pomeni, da predhodni korak še ni končan." },
      { heading: "Začetek koraka", body: "Tapnite Začni na kateremkoli koraku. To samodejno zabeleži vaš prihod pri prisotnosti. Začne se odštevanje vašega delovnega časa." },
      { heading: "Dokončanje koraka", body: "Tapnite Ustavi, nato Dokončaj. Vprašani boste, kje ste pustili del: lokacija skladišča, producijska cona ali 'pri delavcu'.", tip: "Vedno beležite lokacijo — nadzornik jo uporablja za sledenje vsakemu delu na tlorisu." },
      { heading: "Skupinski koraki", body: "Nekateri koraki so nastavljeni na skupinski način. Gumb Skupinsko se prikaže, ko je mogoče več elementov združiti — npr. variti 5 okvirjev naenkrat z enim časovnim vnosom." },
    ],
  },
  templates: {
    title: "Predloge nalogov",
    subtitle: "Producijski načrt — sestavite to pred ustvarjanjem nalogov",
    steps: [
      { heading: "Kaj predloge naredijo", body: "Predloge določajo, kako se izdela produkt. Vsak delovni nalog je ustvarjen iz predloge. Koraki, vloge in dodelitve postaj postanejo naloge, ki jih vidijo delavci.", tip: "Nastavite predloge pred ustvarjanjem uporabnikov — naloge se pojavijo samodejno ob ustvarjanju naloga." },
      { heading: "Ustvarjanje predloge", body: "Kliknite Nova predloga, dajte ji ime (npr. 'Jekleni okvir 2m'). Po želji jo povežite s produktom iz kataloga — to omogoča preverjanje materialne zaloge pri ustvarjanju nalogov." },
      { heading: "Dodajanje korakov", body: "Koraki tečejo v vrstnem redu, razen če nastavite odvisnosti. Za vsak korak nastavite: Vlogo, Vrsto postaje, Način serije in oceno trajanja v minutah." },
      { heading: "Odvisnosti korakov", body: "Kliknite ikono ključavnice za določitev, kaj mora biti končano, preden se korak začne. Delavci vidijo samo odklenjene korake.", tip: "Verige odvisnosti preprečujejo napačen vrstni red — sistem samodejno uveljavlja vaš producijski tok." },
      { heading: "Poraba materialov", body: "Če korak porabi surovino, nastavite 'Porabi produkt' in količino. Sistem preveri zalogo pri ustvarjanju naloga in opozori ob primanjkljaju." },
      { heading: "Prednastavitve in AI urejanje", body: "Shranite nabor korakov kot prednastavitev za enkratno aplikacijo. Ali uporabite AI polje za naravnojezično urejanje: 'Dodaj korak praimerom po brušenju'." },
    ],
  },
  stations: {
    title: "Producijski tok",
    subtitle: "Narišite vaš fizični tloris — postaje in stroji",
    steps: [
      { heading: "Dvonivojska struktura", body: "Vrste postaj predstavljajo vrste dela (Rezanje, Varjenje, CNC, Barva). Delovne postaje so posamezni stroji znotraj vsake vrste (Tračna žaga 1, MIG varilnik 2)." },
      { heading: "Ustvarjanje vrst postaj", body: "Vsaka vrsta postaje potrebuje ime, barvo in po želji privzeto vlogo. Povlecite kartice za prerazvrstitev — vrstni red se odraža v pogledih čakalnih vrst.", tip: "Ustvarite vrste postaj pred gradnjo predlog nalogov." },
      { heading: "Dodajanje delovnih postaj", body: "Pod vsako vrsto postaje dodajte vsak fizični stroj. Nastavite isActive na false za opremo v vzdrževanju." },
      { heading: "Živa čakalna vrsta", body: "Kliknite puščico na vrsti postaje za odprtje žive čakalne vrste. Delavci prevzamejo korak, ga začnejo in označijo kot dokončanega.", tip: "Zelena utripajoča pika pomeni, da nekdo trenutno aktivno dela tam." },
    ],
  },
  materials: {
    title: "Materiali",
    subtitle: "Surovine in kupljeni deli — uvoz v množici",
    steps: [
      { heading: "Kaj spada sem", body: "Materiali prikazuje kupljene in proizvedene dele — surove vhode v produkciji. Usmerjen pogled kataloga, filtriran na ti dve vrsti." },
      { heading: "Uvoz v množici", body: "Kliknite Prenesi predlogo za Excel/CSV predlogo. Izpolnite jo in jo povlecite v območje uvoza. Sprejema .csv in .xlsx datoteke." },
      { heading: "Stolpci predloge", body: "ime (obvezno), kategorija, enota (kos / kg / m / mm / L), buffer_stock, target_stock. Vrstice z # so komentarji.", tip: "Kategorije: Spojni elementi, Hidravlika, Elektrika, Varilni material, CNC deli, Surovine, Pnevmatika, Ležaji in tesnila, Okovje, Potrošni material." },
      { heading: "Urejanje v vrstici", body: "Kliknite katero koli vrstico za neposredno urejanje ime, kategorije ali enote. Ni treba odpirati obrazcev — samo kliknite in tipkajte." },
    ],
  },
  products: {
    title: "Produkti in zaloga",
    subtitle: "Vaš celoten katalog produktov z živimi ravnmi zaloge",
    steps: [
      { heading: "Celoten katalog", body: "Ta stran prikazuje vse: kupljene dele, proizvedene dele in končne produkte. Sledi skupni zalogi, opozorilom in dobaviteljem." },
      { heading: "Uvoz prek CSV", body: "Kliknite Uvoz in naložite CSV. Obvezni stolpci: ime, vrsta. Neobvezni: kategorija, min_stock, target_stock, supplier_name, supplier_sku.", tip: "supplier_name mora točno ujemati obstoječemu dobavitelju — uvoz jih samodejno poveže." },
      { heading: "Vrste produktov", body: "purchased_part — surovine in kupljene komponente. manufactured_part — interno proizvedeni podsklopovi. final_product — kar prodajate strankam." },
      { heading: "Ravni zaloge", body: "Barvna vrstica prikazuje zalogo glede na cilj. Rdeča = pod puferjem (opozorilo). Jantarna = pod ciljem. Zelena = zdravo." },
      { heading: "Prilagajanje zaloge", body: "Kliknite produkt za zalogo po lokacijah. Tapnite lokacijo za prilagoditev. Vnesite pozitivno ali negativno število — vsaka sprememba je zabeležena v Zgodovini." },
    ],
  },
  locations: {
    title: "Lokacije skladišča",
    subtitle: "Kosi, police in regali — skenirajte QR kode za posodabljanje zaloge",
    steps: [
      { heading: "Kaj so lokacije", body: "Lokacije so fizična mesta shranjevanja: regali, kosi, police. Vsaka dobi unikaten ID in QR kodo za natis." },
      { heading: "Izbira ID-jev", body: "Izberite jasno konvencijo in se je držite. Priporočeno: A1-R01-S2-B3 ali POLICA-A1. ID-ji so z velikimi črkami in trajni.", tip: "Ohranite ID-je kratke — delavci jih vtipkavajo kot rezervo, ko skener ne deluje." },
      { heading: "Tiskanje QR etiket", body: "Kliknite ikono QR za odprtje natisljive etikete. Natisnite, zalaminirajte in prilepite na fizično polico." },
      { heading: "Skeniranje zaloge", body: "Delavci odprejo zavihek Skeniraj, umerijo kamero na QR kodo in pristanejo na strani zaloge te lokacije. Posodobitve od kjerkoli na tlorisu." },
      { heading: "Vnos začetne zaloge", body: "Po nastavitvi obiščite vsako lokacijo in vnesite trenutne količine. Vsaka prilagoditev je zabeležena za čisto revizijsko zgodovino." },
    ],
  },
  suppliers: {
    title: "Dobavitelji",
    subtitle: "Vaš imenik dobaviteljev — povezan s produkti in naročilnicami",
    steps: [
      { heading: "Zakaj so dobavitelji pomembni", body: "Dobavitelji se povežejo s produkti, naročilnicami in čakalno vrsto. Dobavitelju z e-pošto so lahko poslana avtomatizirana naročilna sporočila.", tip: "Ustvarite dobavitelje pred uvozom produktov prek CSV — stolpec supplier_name se samodejno poveže." },
      { heading: "Dodajanje dobavitelja", body: "Ime (obvezno), e-pošta, telefon in opombe. Polje Opombe uporabite za roke dobave, plačilne pogoje ali minimalne vrednosti naročil." },
      { heading: "Povezovanje produktov", body: "Razširite kartico dobavitelja in kliknite Dodaj produkt. Izberite produkt tipa purchased_part, vnesite SKU in ceno. Ti podatki se samodejno pojavijo na naročilnicah." },
    ],
  },
  purchasing: {
    title: "Naročilnice",
    subtitle: "Naročajte materiale, sledite dostavam, prejemlajte zalogo",
    steps: [
      { heading: "Tok nakupa", body: "Naročilnice sledijo naročenemu, prispelemu in nameščenemu. Status: Osnutek → Naročeno → Delno prišlo → Prišlo." },
      { heading: "Ustvarjanje naročilnice", body: "Izberite dobavitelja, nastavite datum dostave in dodajte postavke. Naročilnice lahko ustvarite tudi iz Čakalne vrste za naročilo.", tip: "V spustnem meniju dobavitelja se njihovi povezani produkti prikažejo razvrščeni po kategoriji." },
      { heading: "Prejemanje zaloge", body: "Za vsako postavko kliknite Prejmi. Vnesite količino in izberite lokacijo. Zaloga se takoj posodobi in status naročilnice samodejno napreduje." },
      { heading: "E-pošta dobavitelju", body: "Ko je naročilnica naročena, gumb E-pošta ustvari vnaprej napisano sporočilo z vsemi postavkami, SKU-ji in cenami." },
      { heading: "Čakajoči projekti", body: "Vsaka postavka prikazuje aktivne projekte, ki potrebujejo ta produkt — da veste o vplivu zapoznele dostave." },
    ],
  },
  reorder: {
    title: "Čakalna vrsta za naročilo",
    subtitle: "Samodejna opozorila o dopolnjevanju — vaš dnevni seznam nakupov",
    steps: [
      { heading: "Samodejna opozorila", body: "Produkti se tu prikažejo, ko zaloga pade pod min_stock. Razvrščeni so po dobavitelju za naročilo vsega z eno naročilnico.", tip: "Nastavite min_stock za vsak kritičen material — ta stran postane vaš samodejni seznam dopolnjevanja." },
      { heading: "Ustvarjanje naročilnice", body: "Kliknite Ustvari naročilnico poleg skupiny dobavitelja. Osnutek se takoj ustvari z vsemi produkti z nizko zalogo." },
      { heading: "Zastavice pomanjkanja", body: "Delavci dvignejo zastavice, ko jim zmanjka materiala. Pojavijo se tukaj s kontekstom projekta." },
      { heading: "Filter čakajočih naročilnic", body: "Preklop za skrivanje elementov s čakajočimi naročilnicami preprečuje podvojena naročila." },
    ],
  },
  customers: {
    title: "Stranke",
    subtitle: "Vaš imenik strank — povezan s ponudbami in delovnimi nalogi",
    steps: [
      { heading: "Evidence strank", body: "Tu so vsa podjetja ali osebe, ki jim ponujate. Stranke so povezane s ponudbami; odobrene ponudbe se pretvorijo v delovne naloge.", tip: "Dodajte stranko pred ustvarjanjem ponudbe — prihranite si ponovnega tipkanja." },
      { heading: "Dodajanje stranke", body: "Ime je obvezno. Dodajte kontaktno osebo, telefon, e-pošto in naslov — samodejno se izpolnijo v ponudbah." },
      { heading: "Podrobnosti stranke", body: "Kliknite katero koli stranko za ogled vseh ponudb in zgodovine nalogov. Neposredno ustvarite novo ponudbo z vnaprej izpolnjenimi podatki." },
    ],
  },
  quotes: {
    title: "Ponudbe",
    subtitle: "Ustvarjajte ponudbe, pridobite odobritev, pretvorite v delovne naloge",
    steps: [
      { heading: "Življenjski cikel ponudbe", body: "Ponudbe tečejo: Osnutek → Poslano → Odobreno → Pretvorjeno. Zavrnjene ponudbe ostanejo v evidenci." },
      { heading: "Ustvarjanje ponudbe", body: "Izberite stranko ali vnesite podatke ročno. Dodajte postavke iz kataloga ali ročno. Nastavite cene, popust in davčno stopnjo." },
      { heading: "Pretvorba v delovni nalog", body: "Ko je ponudba Odobrena, kliknite Pretvori. Samodejno se ustvari povezan delovni projekt.", tip: "Nastavite datum veljavnosti na vsako ponudbo — pretečene so označene za sledenje." },
      { heading: "Zgodovina revizij", body: "Ob vsakem urejanju shranite revizijo z opombo. Celotna zgodovina različic je shranjena za primerjavo med verzijami." },
    ],
  },
  users: {
    title: "Upravljanje uporabnikov",
    subtitle: "Ustvarite račune delavcev in dodelite producijske vloge",
    steps: [
      { heading: "Dve vrsti uporabnikov", body: "Delavci vidijo samo svoje naloge, prisotnost in vstopno blago. Administratorji imajo popoln dostop. Ustvarite admin račune samo za vodje.", tip: "Pred dodajanjem uporabnikov ustvarite producijske vloge v Producijskem toku." },
      { heading: "Ustvarjanje uporabnika", body: "Uporabniško ime (za prijavo), geslo (povejte ustno — admin ga ponastavi) in vloga." },
      { heading: "Dodeljevanje vlog", body: "Kliknite ikono vlog na kartici. Dodelite vloge: Primarna, Sekundarna, Nadomeščanje. Delavci vidijo samo korake, ki ustrezajo njihovim vlogam." },
      { heading: "Nadzorniki", body: "Zastavica Nadzornik da delavcu Pogled nadzornika, dostop do table Projektov in zmožnost preskočiti ali prerazporediti korake." },
    ],
  },
  attendance: {
    title: "Prisotnost",
    subtitle: "Prijava, odjava in upravljanje dopustov",
    steps: [
      { heading: "Prijava in odjava", body: "Tapnite Prijava na začetku izmene in Odjava na koncu. Sistem samodejno izračuna redne ure in nadure." },
      { heading: "Samodejna prijava", body: "Če delavec začne nalogo brez prijave, ga sistem samodejno prijavi. Na koncu dneva se mora ročno odjaviti.", tip: "Če izmena ne zaključi do polnoči, se samodejno zaključi. Tapnite značko za potrditev." },
      { heading: "Zahtevki za dopust", body: "Oddajte zahtevke za bolniški ali počitnice na dnu strani. Izberite vrsto, datume začetka in konca. Zahtevek gre administratorju za odobritev." },
      { heading: "Zgodovina izmen", body: "Stran prikazuje zadnjih 14 dni evidenc. Samodejno zaprte izmene so označene. Odobreni/zavrnjeni zahtevki za dopust so prav tako vidni." },
    ],
  },
  leave: {
    title: "Zahtevki za dopust",
    subtitle: "Odobritev ali zavrnitev zahtevkov za prosti čas",
    steps: [
      { heading: "Prispeli zahtevki", body: "Vsi zahtevki pristanejo tukaj. Število na bočni vrstici prikazuje čakajoče. Vidijo se ime, vrsta, datumi in čas oddaje.", tip: "Čakajoči zahtevki prikažejo značko na navigaci — počisti se ob obravnavi vseh." },
      { heading: "Odobritev ali zavrnitev", body: "Kliknite Odobri ali Zavrni. Dodajte neobvezno opombo — delavec jo vidi v Prisotnosti ob potrditvi." },
      { heading: "Filtriranje", body: "Filtrirajte po stanju (Čakanje / Odobreno / Zavrnjeno) in po uporabniku. Filtrirajte po Čakanju za hitro obdelavo zaostankov." },
    ],
  },
  report: {
    title: "Poročilo o prisotnosti",
    subtitle: "Mesečni pregledi in CSV izvoz za obračun plač",
    steps: [
      { heading: "Mesečni pregled", body: "Izberite mesec in po želji uporabnika za dnevni pregled: vrsta izmene, ure prijave/odjave, redne ure, nadure, oznake praznikov.", tip: "Nastavite državo in uvozite praznike v Nastavitvah podjetja pred poročili." },
      { heading: "Izračun nadur", body: "Nadure so samodejne glede na delovne ure na dan. Državni in podjetniški prazniki so polne nadure." },
      { heading: "Izvoz v CSV", body: "Kliknite Prenesi za CSV datoteko. Vključuje vse stolpce za obračun plač, računovodstvo ali HR." },
    ],
  },
  supervisor: {
    title: "Pogled nadzornika",
    subtitle: "Pregled produkcije v realnem času — odkrijte težave zgodaj",
    steps: [
      { heading: "Zavihek Dnevni načrt", body: "Prikazuje vse današnje pripravljene/aktivne korake po vlogi. Rdeča strela = vloga ima 8+ ur v čakalni vrsti — razmislite o prerazporeditvi." },
      { heading: "Zavihek Ozka grla", body: "Zamujeni projekti, vloge z visokim razmerjem blokiranih korakov, elementi kjer so vsi koraki blokirani, dostave zastale 2+ dni.", tip: "Preverite Ozka grla vsako jutro — vse potrebno pozornosti v enem pogledu." },
      { heading: "Zavihek Nezabeleženo", body: "Koraki iz zadnjih 7 dni, kjer delavec ni zabeležil lokacije. Tapnite Opomni za kopiranje sporočila v odložišče." },
      { heading: "Ukrepanje", body: "Na kateremkoli koraku v Dnevnem načrtu tapnite meni ⋮ za dodelitev drugi vlogi, preskočitev ali označitev projekta kot Nujno." },
    ],
  },
  company: {
    title: "Nastavitve podjetja",
    subtitle: "Delovne ure, pravila nadur in prazniki",
    steps: [
      { heading: "Ime podjetja", body: "Ime se prikazuje po celotni aplikaciji. Kliknite Uredi za kadarkoli spremembo." },
      { heading: "Delovne ure na dan", body: "Vnesite standardne ure (npr. 8). Ure nad tem pragom se štejejo kot nadure v poročilih." },
      { heading: "Nadure ob vikendih", body: "Vklopite, če se vse sobotne in nedeljske ure štejejo kot nadure — pogosto v izmenskem delu." },
      { heading: "Državni prazniki", body: "Izberite državo in kliknite Uvoz za nalaganje praznikov. Vse ure na te dni so nadure. Ponovite vsako leto.", tip: "Ročno dodajte zaprta dneve podjetja (ustavitve, lokalni dogodki) z obrazcem Dodaj praznik." },
      { heading: "Načrt", body: "Vaš trenutni načrt je prikazan tukaj. Nadgradnje upravlja lastnik računa — obrnite se nanje za Pro funkcije." },
    ],
  },
  analytics: {
    title: "AI Analitika",
    subtitle: "Producijski uvidi iz vaših dejanskih podatkov",
    steps: [
      { heading: "Kaj analizira", body: "Analitika obdela dokončane naloge, časovne dnevnike in korake za iskanje vzorcev, ozkih grl in trendov.", tip: "Potrebuje vsaj nekaj dokončanih nalogov. Več podatkov, boljši uvidi." },
      { heading: "Graf učinkovitosti", body: "Povprečen čas dokončanja na vrsto koraka skozi čas. Padajoče linije = ekipa postaja hitrejša. Ravne/naraščajoče = ponavljajoče ozko grlo." },
      { heading: "Toplotni zemljevid ozkih grl", body: "Kateri koraki imajo najdaljše čakalne čase. Rdeče polje = vaša producijska omejitev. Izboljšave najprej tu." },
      { heading: "Točnost rokov", body: "Odstotek nalogov, dokončanih pravočasno na mesec. Padajoča točnost = preveč optimistične ocene — kalibrirajte roke." },
      { heading: "AI uvidi", body: "Opažanja: dobički učinkovitosti, ozka grla, vzorci rokov, opombe delavcev. Zavrzite, na kar ste ukrepali — novi se ustvarijo ob osveževanju." },
    ],
  },
  inbound: {
    title: "Dohodne dostave",
    subtitle: "Sledite materialom od prihoda do tlorisa",
    steps: [
      { heading: "Kaj inbound sledi", body: "Vsaka dostava zunanjih materialov dobi evidenco. Sledi elementu od 'pričakovanega' do 'v produkciji'." },
      { heading: "Štiri stanja", body: "Pričakovano → Prišlo → Shranjeno → V produkciji. Ustvarite evidenco ob napovedani dostavi. Označite ob prihodu. Usmerite ob odlaganju.", tip: "Dostave 2+ dni v stanju 'Pričakovano' se prikažejo v Ozkih grlih nadzornika." },
      { heading: "Ustvarjanje evidence", body: "Tapnite +, po želji povežite z aktivnim projektom in dodajte opombe (referenca, številka naročilnice)." },
      { heading: "Označevanje prihoda", body: "Ob dostavi tapnite Prišlo. To lahko stori kateri koli delavec brez admin dostopa." },
      { heading: "Usmerjanje (admin)", body: "Administratorji tapnejo Usmeri za dodelitev lokacije in po želji koraka postopka. Status preide na Shranjeno.", tip: "Tapnite ikono tiskanja za etiketo palete ali škatle." },
    ],
  },
  paintqueue: {
    title: "Lakirnica",
    subtitle: "Čakalna vrsta lakiranje — razvrstitev po barvi in roku",
    steps: [
      { heading: "Kaj vidite tukaj", body: "Lakirnica prikazuje vse producijske korake za postajo lakiranje. Vsaka kartica prikazuje kodo RAL, ime dela, projekt, nujnost roka in stanje." },
      { heading: "Kode barv RAL", body: "Kodo barve nastavi administrator pri ustvarjanju naloga. Prikazuje se na kartici, da veste, katero barvo zmešati.", tip: "Dele z isto kodo RAL pogosto lakirate v eni seriji — poiščite ujemajoče kode pred nastavitvijo." },
      { heading: "Začetek dela", body: "Tapnite Začni na kartici. Sistem zabeleži čas začetka. Če lakirate več delov iste barve, jih vse začnite pred dvigom pištole." },
      { heading: "Označevanje dokončanega", body: "Tapnite Dokončano, ko je del posušen. Vprašani boste, kam gre del — lokacija, cona ali pri delavcu." },
    ],
  },
};

export function getTutorials(lang: Lang): Record<TutorialKey, Tutorial> {
  return lang === "sl" ? TUTORIALS_SL : TUTORIALS;
}

export function getTutorialKey(path: string): TutorialKey | null {
  if (path === "/work/projects") return "jobs";
  if (path === "/tasks") return "tasks";
  if (path === "/work/templates") return "templates";
  if (path === "/admin/stations") return "stations";
  if (path === "/work/materials") return "materials";
  if (path === "/products") return "products";
  if (path === "/locations") return "locations";
  if (path === "/admin/suppliers") return "suppliers";
  if (path === "/work/purchase-orders") return "purchasing";
  if (path === "/work/reorder-queue") return "reorder";
  if (path === "/customers") return "customers";
  if (path === "/quotes") return "quotes";
  if (path === "/admin/users") return "users";
  if (path === "/attendance") return "attendance";
  if (path === "/admin/leave-inbox") return "leave";
  if (path === "/attendance/report") return "report";
  if (path === "/supervisor") return "supervisor";
  if (path === "/admin/company") return "company";
  if (path === "/analytics") return "analytics";
  if (path === "/work/inbound") return "inbound";
  if (path === "/work/paint-queue") return "paintqueue";
  return null;
}
