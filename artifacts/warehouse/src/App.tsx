import { useState, useEffect } from "react";
import { Switch, Route, Router as WouterRouter, Redirect } from "wouter";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppLayout } from "@/components/layout";
import { AuthProvider, useAuth, usePlan } from "@/contexts/auth";
import { LangProvider } from "@/contexts/lang";
import { SetupWizard } from "@/pages/setup-wizard";
import { FabriflowMark } from "@/components/fabriflow-logo";

// Inventory Pages
import Dashboard from "@/pages/dashboard";
import ScanPage from "@/pages/scan";
import LocationsPage from "@/pages/locations";
import LocationPage from "@/pages/location";
import ItemActionPage from "@/pages/item-action";
import HelpPage from "@/pages/help";
import InventoryHomePage from "@/pages/inventory-home";
import LocationsPrintSheetPage from "@/pages/locations-print-sheet";
import ProductsPage from "@/pages/products";
import ProductFormPage from "@/pages/product-form";
import HistoryPage from "@/pages/history";
import AdminUsersPage from "@/pages/admin-users";
import AdminCompanyPage from "@/pages/admin-company";
import AdminRolesPage from "@/pages/admin-roles";
import AdminProceduresPage from "@/pages/admin-procedures";
import AdminProcedureInputsPage from "@/pages/admin-procedure-inputs";

import AdminSuppliersPage from "@/pages/admin-suppliers";
import OwnerPanelPage from "@/pages/owner-panel";
import TasksDashboardPage from "@/pages/tasks-dashboard";
import OrdersPage from "@/pages/orders";
import ValuationPage from "@/pages/valuation";
import LoginPage from "@/pages/login";
import NotFound from "@/pages/not-found";
import AdminZonesPage from "@/pages/admin-zones";
import SupervisorPage from "@/pages/supervisor";
import AttendancePage from "@/pages/attendance";
import AttendanceLivePage from "@/pages/attendance-live";
import AttendanceReportPage from "@/pages/attendance-report";
import AdminLeaveInboxPage from "@/pages/admin-leave-inbox";

// Work Order Pages
import WorkProjectsPage from "@/pages/work/projects";
import WorkProjectDetailPage from "@/pages/work/project-detail";
import WorkProjectFormPage from "@/pages/work/project-form";
import WorkTemplatesPage from "@/pages/work/templates";
import TemplateOutlinePage from "@/pages/work/template-outline";
import WorkInboundPage from "@/pages/work/inbound";
import WorkPrintTagPage from "@/pages/work/print-tag";
import ReorderQueuePage from "@/pages/work/reorder-queue";
import PurchaseOrdersPage from "@/pages/work/purchase-orders";
import PaintQueuePage from "@/pages/work/paint-queue";
import CuttingQueuePage from "@/pages/work/cutting-queue";
import MaterialsPage from "@/pages/work/materials";
import StocktakePage from "@/pages/work/stocktake";
import AdminStationsPage from "@/pages/admin-stations";
import QueuesPage from "@/pages/work/queues";
import StationQueuePage from "@/pages/work/station-queue";
import CustomersPage from "@/pages/customers";
import CustomerDetailPage from "@/pages/customer-detail";
import QuotesPage from "@/pages/quotes";
import QuoteFormPage from "@/pages/quote-form";
import QuoteDetailPage from "@/pages/quote-detail";
import AnalyticsPage from "@/pages/analytics";
import KioskPage from "@/pages/kiosk";
import AdminAiWizardPage from "@/pages/admin-ai-wizard";
import JoinPage from "@/pages/join";
import StockImportPage from "@/pages/stock-import";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

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

// Lite has no work orders/attendance — a Lite worker can only scan a bin and flag
// what's running low (plus the manual shortage report).
function LiteWorkerRoutes() {
  return (
    <Switch>
      <Route path="/scan" component={ScanPage} />
      <Route path="/location/:id" component={LocationPage} />
      <Route path="/work/reorder-queue" component={ReorderQueuePage} />
      <Route path="/"><Redirect to="/scan" /></Route>
      <Route component={() => <Redirect to="/scan" />} />
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
    enabled: !!user && user.role === "admin" && !wizardDismissed,
    staleTime: 60_000,
  });

  const showWizard =
    !wizardDismissed &&
    user?.role === "admin" &&
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
        <OwnerPanelPage />
      </AppLayout>
    );
  }

  // Plain workers (non-supervisor) get a simplified view matching the company's plan:
  // Standard/Pro → work-order tasks; Lite → scan & flag only.
  if (user.role === "worker" && !user.isSupervisor) {
    return (
      <AppLayout>
        {atLeast("standard") ? <WorkerRoutes /> : <LiteWorkerRoutes />}
      </AppLayout>
    );
  }

  return (
    <>
      {showWizard && (
        <SetupWizard onComplete={dismissWizard} onDismiss={dismissWizard} />
      )}
    <AppLayout>
      <Switch>
        {/* Admin home — Lite goes to Inventory home, Standard/Pro goes to Jobs */}
        <Route path="/"><Redirect to={atLeast("standard") ? "/work/projects" : "/dashboard"} /></Route>
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

        {/* Customers & Quotes */}
        <Route path="/customers" component={CustomersPage} />
        <Route path="/customers/:id" component={CustomerDetailPage} />
        <Route path="/quotes" component={QuotesPage} />
        <Route path="/quotes/new" component={QuoteFormPage} />
        <Route path="/quotes/:id/edit" component={QuoteFormPage} />
        <Route path="/quotes/:id" component={QuoteDetailPage} />

        <Route component={NotFound} />
      </Switch>
    </AppLayout>
    </>
  );
}

// ── Splash screen ────────────────────────────────────────────────────────────

function SplashScreen({ onDone }: { onDone: () => void }) {
  const [fading, setFading] = useState(false);

  useEffect(() => {
    const t1 = setTimeout(() => setFading(true), 1100);
    const t2 = setTimeout(onDone, 1500);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [onDone]);

  return (
    <div
      className="fixed inset-0 z-[9999] bg-primary flex flex-col items-center justify-center gap-4"
      style={{ transition: "opacity 0.4s ease", opacity: fading ? 0 : 1, pointerEvents: "none" }}
    >
      <div className="flex items-center gap-3 animate-in fade-in zoom-in-95 duration-300">
        <div className="h-14 w-14 rounded-2xl bg-white/15 flex items-center justify-center">
          <FabriflowMark className="h-8 w-8 text-white" />
        </div>
        <span className="text-white font-black text-3xl tracking-tight">Fabriflow</span>
      </div>
      <div className="flex gap-1.5 mt-2 animate-in fade-in duration-500 delay-200">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="h-1.5 w-1.5 rounded-full bg-white/60"
            style={{ animation: `pulse 1s ease-in-out ${i * 0.2}s infinite` }}
          />
        ))}
      </div>
    </div>
  );
}

function App() {
  const [splashDone, setSplashDone] = useState(false);

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <LangProvider>
          <AuthProvider>
            {!splashDone && <SplashScreen onDone={() => setSplashDone(true)} />}
            <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
              <Switch>
                <Route path="/kiosk" component={KioskPage} />
                <Route path="/join/:token" component={JoinPage} />
                <Route component={ProtectedRoutes} />
              </Switch>
            </WouterRouter>
            <Toaster />
          </AuthProvider>
        </LangProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
