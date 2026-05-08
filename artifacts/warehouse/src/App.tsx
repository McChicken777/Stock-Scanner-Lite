import { Switch, Route, Router as WouterRouter, Redirect } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppLayout } from "@/components/layout";
import { AuthProvider, useAuth } from "@/contexts/auth";

// Inventory Pages
import Dashboard from "@/pages/dashboard";
import ScanPage from "@/pages/scan";
import LocationsPage from "@/pages/locations";
import LocationPage from "@/pages/location";
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
import WorkInboundPage from "@/pages/work/inbound";
import WorkPrintTagPage from "@/pages/work/print-tag";
import ReorderQueuePage from "@/pages/work/reorder-queue";
import PurchaseOrdersPage from "@/pages/work/purchase-orders";
import PaintQueuePage from "@/pages/work/paint-queue";
import CustomersPage from "@/pages/customers";
import CustomerDetailPage from "@/pages/customer-detail";
import QuotesPage from "@/pages/quotes";
import QuoteFormPage from "@/pages/quote-form";
import QuoteDetailPage from "@/pages/quote-detail";

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
      <Route path="/attendance" component={AttendancePage} />
      <Route path="/attendance/report" component={AttendanceReportPage} />
      <Route path="/">
        <Redirect to="/tasks" />
      </Route>
      <Route component={() => <Redirect to="/tasks" />} />
    </Switch>
  );
}

function ProtectedRoutes() {
  const { user, isLoading } = useAuth();

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

  // Plain workers (non-supervisor) get a simplified work-only view
  if (user.role === "worker" && !user.isSupervisor) {
    return (
      <AppLayout>
        <WorkerRoutes />
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <Switch>
        {/* Inventory */}
        <Route path="/" component={Dashboard} />
        <Route path="/scan" component={ScanPage} />
        <Route path="/locations" component={LocationsPage} />
        <Route path="/location/:id" component={LocationPage} />
        <Route path="/products" component={ProductsPage} />
        <Route path="/products/new" component={ProductFormPage} />
        <Route path="/products/:id/edit" component={ProductFormPage} />
        <Route path="/history" component={HistoryPage} />
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
        <Route path="/work/templates" component={WorkTemplatesPage} />
        <Route path="/work/inbound" component={WorkInboundPage} />
        <Route path="/work/reorder-queue" component={ReorderQueuePage} />
        <Route path="/work/purchase-orders/:id" component={PurchaseOrdersPage} />
        <Route path="/work/purchase-orders" component={PurchaseOrdersPage} />
        <Route path="/work/paint-queue" component={PaintQueuePage} />

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
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AuthProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <ProtectedRoutes />
          </WouterRouter>
          <Toaster />
        </AuthProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
