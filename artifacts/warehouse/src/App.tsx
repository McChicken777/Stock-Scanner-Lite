import { useState, useEffect, lazy, Suspense } from "react";
import { Switch, Route, Router as WouterRouter, Redirect } from "wouter";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppLayout } from "@/components/layout";
import { AuthProvider, useAuth, usePlan } from "@/contexts/auth";
import { LangProvider } from "@/contexts/lang";
import { SetupWizard } from "@/pages/setup-wizard";
import { FabriflowMark } from "@/components/fabriflow-logo";

// Eager pages — the shell + first screens that must never flash a loader.
import LoginPage from "@/pages/login";
import NotFound from "@/pages/not-found";

// Lazy pages — each becomes its own chunk loaded on demand, so the browser no
// longer parses every page up front. Page modules use `export default`, so the
// bare `import()` resolves to the right component.
const Dashboard = lazy(() => import("@/pages/dashboard"));
const ScanPage = lazy(() => import("@/pages/scan"));
const LocationsPage = lazy(() => import("@/pages/locations"));
const LocationPage = lazy(() => import("@/pages/location"));
const ItemActionPage = lazy(() => import("@/pages/item-action"));
const HelpPage = lazy(() => import("@/pages/help"));
const InventoryHomePage = lazy(() => import("@/pages/inventory-home"));
const LocationsPrintSheetPage = lazy(() => import("@/pages/locations-print-sheet"));
const ProductsPage = lazy(() => import("@/pages/products"));
const ProductFormPage = lazy(() => import("@/pages/product-form"));
const HistoryPage = lazy(() => import("@/pages/history"));
const AdminUsersPage = lazy(() => import("@/pages/admin-users"));
const AdminCompanyPage = lazy(() => import("@/pages/admin-company"));
const AdminRolesPage = lazy(() => import("@/pages/admin-roles"));
const AdminProceduresPage = lazy(() => import("@/pages/admin-procedures"));
const AdminProcedureInputsPage = lazy(() => import("@/pages/admin-procedure-inputs"));
const AdminSuppliersPage = lazy(() => import("@/pages/admin-suppliers"));
const OwnerPanelPage = lazy(() => import("@/pages/owner-panel"));
const TasksDashboardPage = lazy(() => import("@/pages/tasks-dashboard"));
const OrdersPage = lazy(() => import("@/pages/orders"));
const ValuationPage = lazy(() => import("@/pages/valuation"));
const AdminZonesPage = lazy(() => import("@/pages/admin-zones"));
const SupervisorPage = lazy(() => import("@/pages/supervisor"));
const AttendancePage = lazy(() => import("@/pages/attendance"));
const AttendanceLivePage = lazy(() => import("@/pages/attendance-live"));
const AttendanceReportPage = lazy(() => import("@/pages/attendance-report"));
const AdminLeaveInboxPage = lazy(() => import("@/pages/admin-leave-inbox"));

// Work Order Pages
const WorkProjectsPage = lazy(() => import("@/pages/work/projects"));
const WorkProjectDetailPage = lazy(() => import("@/pages/work/project-detail"));
const WorkProjectFormPage = lazy(() => import("@/pages/work/project-form"));
const WorkTemplatesPage = lazy(() => import("@/pages/work/templates"));
const TemplateOutlinePage = lazy(() => import("@/pages/work/template-outline"));
const WorkInboundPage = lazy(() => import("@/pages/work/inbound"));
const WorkPrintTagPage = lazy(() => import("@/pages/work/print-tag"));
const ReorderQueuePage = lazy(() => import("@/pages/work/reorder-queue"));
const PurchaseOrdersPage = lazy(() => import("@/pages/work/purchase-orders"));
const PaintQueuePage = lazy(() => import("@/pages/work/paint-queue"));
const CuttingQueuePage = lazy(() => import("@/pages/work/cutting-queue"));
const MaterialsPage = lazy(() => import("@/pages/work/materials"));
const StocktakePage = lazy(() => import("@/pages/work/stocktake"));
const AdminStationsPage = lazy(() => import("@/pages/admin-stations"));
const QueuesPage = lazy(() => import("@/pages/work/queues"));
const StationQueuePage = lazy(() => import("@/pages/work/station-queue"));
const CustomersPage = lazy(() => import("@/pages/customers"));
const CustomerDetailPage = lazy(() => import("@/pages/customer-detail"));
const QuotesPage = lazy(() => import("@/pages/quotes"));
const QuoteFormPage = lazy(() => import("@/pages/quote-form"));
const QuoteDetailPage = lazy(() => import("@/pages/quote-detail"));
const AnalyticsPage = lazy(() => import("@/pages/analytics"));
const KioskPage = lazy(() => import("@/pages/kiosk"));
const AdminAiWizardPage = lazy(() => import("@/pages/admin-ai-wizard"));
const JoinPage = lazy(() => import("@/pages/join"));
const StockImportPage = lazy(() => import("@/pages/stock-import"));
const SourcingPage = lazy(() => import("@/pages/sourcing"));
const SourcingDetailPage = lazy(() => import("@/pages/sourcing-detail"));
const RfqQuotePage = lazy(() => import("@/pages/rfq-quote"));
const AdminCatalogPage = lazy(() => import("@/pages/admin-catalog"));
const QuotePublicPage = lazy(() => import("@/pages/quote-public"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

// Suspense fallback while a lazy-loaded page chunk downloads. Centered spinner so
// in-app navigation shows a brief loader in the content area (the shell stays put).
function PageLoader() {
  return (
    <div className="min-h-[60dvh] flex items-center justify-center">
      <div className="h-8 w-8 rounded-full border-4 border-primary border-t-transparent animate-spin" />
    </div>
  );
}

function WorkerRoutes() {
  return (
    <Switch>
      <Route path="/tasks" component={TasksDashboardPage} />
      <Route path="/work/inbound" component={WorkInboundPage} />
      <Route path="/work/paint-queue" component={PaintQueuePage} />
      <Route path="/work/cutting-queue" component={CuttingQueuePage} />
      <Route path="/work/queues" component={QueuesPage} />
      <Route path="/work/queue/:typeId" component={StationQueuePage} />
      <Route path="/attendance" component={AttendancePage} />
      <Route path="/attendance/report" component={AttendanceReportPage} />
      <Route path="/">
        <Redirect to="/tasks" />
      </Route>
      <Route component={() => <Redirect to="/tasks" />} />
    </Switch>
  );
}

// Lite has no work orders/attendance — a Lite worker can ONLY scan a bin and flag
// what's running low. Everything else redirects to the scanner.
function LiteWorkerRoutes() {
  return (
    <Switch>
      <Route path="/scan" component={ScanPage} />
      <Route path="/location/:id" component={LocationPage} />
      <Route path="/help" component={HelpPage} />
      <Route path="/"><Redirect to="/scan" /></Route>
      <Route component={() => <Redirect to="/scan" />} />
    </Switch>
  );
}

// Lite admins/supervisors only get the inventory + sales routes. Every Standard/Pro
// URL (analytics, work orders, tasks, attendance, …) is unmounted here so typing it
// redirects to the dashboard instead of loading a dead-end paywall/empty page.
function LiteAdminRoutes() {
  return (
    <Switch>
      <Route path="/"><Redirect to="/dashboard" /></Route>
      <Route path="/dashboard" component={Dashboard} />
      <Route path="/inventory" component={InventoryHomePage} />
      <Route path="/locations/print-sheet" component={LocationsPrintSheetPage} />
      <Route path="/scan" component={ScanPage} />
      <Route path="/locations" component={LocationsPage} />
      <Route path="/location/:id" component={LocationPage} />
      <Route path="/item/:productId" component={ItemActionPage} />
      <Route path="/products" component={ProductsPage} />
      <Route path="/products/new" component={ProductFormPage} />
      <Route path="/products/:id/edit" component={ProductFormPage} />
      <Route path="/history" component={HistoryPage} />
      <Route path="/help" component={HelpPage} />
      <Route path="/admin/users" component={AdminUsersPage} />
      <Route path="/admin/company" component={AdminCompanyPage} />
      <Route path="/admin/suppliers" component={AdminSuppliersPage} />
      <Route path="/sourcing" component={SourcingPage} />
      <Route path="/sourcing/:id" component={SourcingDetailPage} />
      <Route path="/admin/stock-import" component={StockImportPage} />
      <Route path="/admin/catalog" component={AdminCatalogPage} />
      <Route path="/customers" component={CustomersPage} />
      <Route path="/customers/:id" component={CustomerDetailPage} />
      <Route path="/quotes" component={QuotesPage} />
      <Route path="/quotes/new" component={QuoteFormPage} />
      <Route path="/quotes/:id/edit" component={QuoteFormPage} />
      <Route path="/quotes/:id" component={QuoteDetailPage} />
      <Route component={() => <Redirect to="/dashboard" />} />
    </Switch>
  );
}

function ProtectedRoutes() {
  const { user, isLoading } = useAuth();
  const { atLeast } = usePlan();

  const wizardKey = user?.companyId != null ? `setup_done_${user.companyId}` : null;
  const [wizardDismissed, setWizardDismissed] = useState(() =>
    wizardKey ? !!localStorage.getItem(wizardKey) : true
  );

  const { data: stationTypes } = useQuery<{ id: number }[]>({
    queryKey: ["/api/stations/types"],
    queryFn: () => fetch("/api/stations/types", { credentials: "include" }).then((r) => r.json()),
    enabled: !!user && user.role === "admin" && !wizardDismissed && atLeast("standard"),
    staleTime: 60_000,
  });

  // The setup wizard configures production stations/roles — Standard/Pro concepts.
  // Lite has no manufacturing flow, so it must never see the wizard.
  const showWizard =
    !wizardDismissed &&
    user?.role === "admin" &&
    atLeast("standard") &&
    Array.isArray(stationTypes) &&
    stationTypes.length === 0;

  function dismissWizard() {
    if (wizardKey) localStorage.setItem(wizardKey, "1");
    setWizardDismissed(true);
  }

  if (isLoading) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-background">
        <div className="h-8 w-8 rounded-full border-4 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }

  if (!user) {
    return <LoginPage />;
  }

  // Owner sees only the panel
  if (user.role === "owner") {
    return (
      <AppLayout>
        <Suspense fallback={<PageLoader />}>
          <OwnerPanelPage />
        </Suspense>
      </AppLayout>
    );
  }

  // Plain workers (non-supervisor) get a simplified view matching the company's plan:
  // Standard/Pro → work-order tasks; Lite → scan & flag only.
  if (user.role === "worker" && !user.isSupervisor) {
    return (
      <AppLayout>
        <Suspense fallback={<PageLoader />}>
          {atLeast("standard") ? <WorkerRoutes /> : <LiteWorkerRoutes />}
        </Suspense>
      </AppLayout>
    );
  }

  return (
    <>
      {showWizard && (
        <SetupWizard onComplete={dismissWizard} onDismiss={dismissWizard} />
      )}
    <AppLayout>
      <Suspense fallback={<PageLoader />}>
      {!atLeast("standard") ? <LiteAdminRoutes /> : (
      <Switch>
        {/* Admin home — Standard/Pro goes to Jobs */}
        <Route path="/"><Redirect to="/work/projects" /></Route>
        <Route path="/dashboard" component={Dashboard} />
        <Route path="/inventory" component={InventoryHomePage} />
        <Route path="/locations/print-sheet" component={LocationsPrintSheetPage} />
        <Route path="/scan" component={ScanPage} />
        <Route path="/locations" component={LocationsPage} />
        <Route path="/location/:id" component={LocationPage} />
        <Route path="/item/:productId" component={ItemActionPage} />
        <Route path="/products" component={ProductsPage} />
        <Route path="/products/new" component={ProductFormPage} />
        <Route path="/products/:id/edit" component={ProductFormPage} />
        <Route path="/history" component={HistoryPage} />
        <Route path="/help" component={HelpPage} />
        <Route path="/admin/users" component={AdminUsersPage} />
        <Route path="/admin/company" component={AdminCompanyPage} />
        <Route path="/admin/suppliers" component={AdminSuppliersPage} />
        <Route path="/sourcing" component={SourcingPage} />
        <Route path="/sourcing/:id" component={SourcingDetailPage} />
        <Route path="/admin/roles" component={AdminRolesPage} />
        <Route path="/admin/procedures" component={AdminProceduresPage} />
        <Route path="/admin/procedure-inputs/:procId" component={AdminProcedureInputsPage} />
        <Route path="/admin/dashboard"><Redirect to="/" /></Route>
        <Route path="/admin/zones" component={AdminZonesPage} />
        <Route path="/supervisor" component={SupervisorPage} />
        <Route path="/attendance" component={AttendancePage} />
        <Route path="/attendance/live" component={AttendanceLivePage} />
        <Route path="/attendance/report" component={AttendanceReportPage} />
        <Route path="/admin/leave-inbox" component={AdminLeaveInboxPage} />
        <Route path="/owner" component={OwnerPanelPage} />
        <Route path="/tasks" component={TasksDashboardPage} />
        <Route path="/orders" component={OrdersPage} />
        <Route path="/valuation" component={ValuationPage} />

        {/* Work Orders */}
        <Route path="/work/projects" component={WorkProjectsPage} />
        <Route path="/work/projects/new" component={WorkProjectFormPage} />
        <Route path="/work/projects/:id/print-tag" component={WorkPrintTagPage} />
        <Route path="/work/projects/:id" component={WorkProjectDetailPage} />
        <Route path="/work/template-outline" component={TemplateOutlinePage} />
        <Route path="/work/templates" component={WorkTemplatesPage} />
        <Route path="/work/inbound" component={WorkInboundPage} />
        <Route path="/work/reorder-queue" component={ReorderQueuePage} />
        <Route path="/work/purchase-orders/:id" component={PurchaseOrdersPage} />
        <Route path="/work/purchase-orders" component={PurchaseOrdersPage} />
        <Route path="/work/paint-queue" component={PaintQueuePage} />
        <Route path="/work/cutting-queue" component={CuttingQueuePage} />
        <Route path="/work/materials" component={MaterialsPage} />
        <Route path="/work/stocktake" component={StocktakePage} />
        <Route path="/work/queues" component={QueuesPage} />
        <Route path="/work/queue/:typeId" component={StationQueuePage} />
        <Route path="/admin/stations" component={AdminStationsPage} />

        {/* Analytics (Pro, admin-only) */}
        <Route path="/analytics" component={AnalyticsPage} />

        {/* AI Template Wizard (TEST) */}
        <Route path="/admin/ai-wizard" component={AdminAiWizardPage} />
        <Route path="/admin/stock-import" component={StockImportPage} />

        {/* Admin catalog */}
        <Route path="/admin/catalog" component={AdminCatalogPage} />

        {/* Customers & Quotes */}
        <Route path="/customers" component={CustomersPage} />
        <Route path="/customers/:id" component={CustomerDetailPage} />
        <Route path="/quotes" component={QuotesPage} />
        <Route path="/quotes/new" component={QuoteFormPage} />
        <Route path="/quotes/:id/edit" component={QuoteFormPage} />
        <Route path="/quotes/:id" component={QuoteDetailPage} />

        <Route component={NotFound} />
      </Switch>
      )}
      </Suspense>
    </AppLayout>
    </>
  );
}

// ── Splash screen ─────────────────────────────────────────────────────────────

function SplashScreen({ onDone }: { onDone: () => void }) {
  const [fading, setFading] = useState(false);

  useEffect(() => {
    const t1 = setTimeout(() => setFading(true), 1500);
    const t2 = setTimeout(onDone, 2000);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [onDone]);

  // circumference of r=18 circle ≈ 113.1; 28% arc for the spinner gap
  const r = 18;
  const circ = 2 * Math.PI * r;
  const arc = circ * 0.28;

  return (
    <div
      className="fixed inset-0 z-[9999] bg-secondary flex flex-col items-center justify-center gap-8"
      style={{ transition: "opacity 0.5s ease", opacity: fading ? 0 : 1, pointerEvents: "none" }}
    >
      <div className="flex flex-col items-center gap-5 animate-in zoom-in-90 fade-in duration-500">
        <div className="h-24 w-24 rounded-3xl bg-primary flex items-center justify-center shadow-2xl">
          <FabriflowMark className="h-14 w-14 text-white" />
        </div>
        <span className="text-white font-black text-4xl tracking-tight">Fabriflow</span>
      </div>

      {/* Smooth circular loader */}
      <svg
        width="40" height="40" viewBox="0 0 40 40"
        className="animate-spin"
        style={{ animationDuration: "0.85s", animationTimingFunction: "linear" }}
      >
        {/* Track */}
        <circle cx="20" cy="20" r={r} fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="2.5" />
        {/* Arc */}
        <circle
          cx="20" cy="20" r={r}
          fill="none"
          stroke="white"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeDasharray={`${circ - arc} ${arc}`}
          strokeDashoffset={circ * 0.25}
        />
      </svg>
    </div>
  );
}

function App() {
  const [splashDone, setSplashDone] = useState(false);

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false} storageKey="fabriflow_theme" disableTransitionOnChange>
        <LangProvider>
          <AuthProvider>
            {!splashDone && <SplashScreen onDone={() => setSplashDone(true)} />}
            <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
              <Suspense fallback={<div className="min-h-[100dvh] flex items-center justify-center bg-background"><div className="h-8 w-8 rounded-full border-4 border-primary border-t-transparent animate-spin" /></div>}>
                <Switch>
                  <Route path="/kiosk" component={KioskPage} />
                  <Route path="/join/:token" component={JoinPage} />
                  <Route path="/rfq/:token" component={RfqQuotePage} />
                  <Route path="/q/:token" component={QuotePublicPage} />
                  <Route component={ProtectedRoutes} />
                </Switch>
              </Suspense>
            </WouterRouter>
            <Toaster />
          </AuthProvider>
        </LangProvider>
        </ThemeProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
