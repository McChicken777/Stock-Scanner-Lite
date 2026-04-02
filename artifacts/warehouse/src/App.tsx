import { Switch, Route, Router as WouterRouter } from "wouter";
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
import OwnerPanelPage from "@/pages/owner-panel";
import LoginPage from "@/pages/login";
import NotFound from "@/pages/not-found";

// Work Order Pages
import WorkProjectsPage from "@/pages/work/projects";
import WorkProjectDetailPage from "@/pages/work/project-detail";
import WorkProjectFormPage from "@/pages/work/project-form";
import WorkTemplatesPage from "@/pages/work/templates";
import WorkInboundPage from "@/pages/work/inbound";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

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
        <Route path="/owner" component={OwnerPanelPage} />

        {/* Work Orders */}
        <Route path="/work/projects" component={WorkProjectsPage} />
        <Route path="/work/projects/new" component={WorkProjectFormPage} />
        <Route path="/work/projects/:id" component={WorkProjectDetailPage} />
        <Route path="/work/templates" component={WorkTemplatesPage} />
        <Route path="/work/inbound" component={WorkInboundPage} />

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
