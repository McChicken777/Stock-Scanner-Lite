import { useState, createContext, useContext } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import {
  LayoutDashboard, ScanLine, Package2, History, ShieldCheck,
  HardHat, LogOut, FolderKanban, Building2, Crown, PackageCheck,
  CheckSquare, Truck, Eye, MapPin,
  BookTemplate, Wrench, Users, Settings, Store, CalendarCheck, Inbox, Palette, Scissors,
  BarChart2, ShoppingCart, FileText, PackageOpen, Layers, HelpCircle, ClipboardList, Sparkles, FlaskConical,
  PanelLeft, PanelLeftClose, Scale, BookOpen, Moon, Sun,
} from "lucide-react";
import { useTheme } from "next-themes";
import { cn } from "@/lib/utils";
import { useAuth, useFeature, usePlan } from "@/contexts/auth";
import { useLang } from "@/contexts/lang";
import { LANGUAGES } from "@/i18n/translations";
import { TutorialProvider, useTutorial } from "@/contexts/tutorial";
import { TutorialModal } from "@/components/tutorial-modal";
import { FabriflowMark } from "@/components/fabriflow-logo";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";

// ─── Sidebar collapse (icon-only rail) ─────────────────────────────────────────

const SidebarCtx = createContext<{ collapsed: boolean; toggle: () => void }>({
  collapsed: false,
  toggle: () => {},
});
function useSidebar() { return useContext(SidebarCtx); }

function SidebarBrand() {
  const { collapsed } = useSidebar();
  const { plan } = usePlan();
  return (
    <div className={cn(
      "flex items-center h-14 border-b border-border flex-shrink-0",
      collapsed ? "justify-center px-2" : "gap-2.5 px-4",
    )}>
      <div className="h-7 w-7 rounded-lg bg-primary flex items-center justify-center flex-shrink-0">
        <FabriflowMark className="h-4 w-4 text-primary-foreground" />
      </div>
      {!collapsed && (
        <div className="flex flex-col leading-none">
          <span className="font-bold text-base">Fabriflow</span>
          <span className="text-[10px] font-medium text-muted-foreground capitalize">{plan}</span>
        </div>
      )}
    </div>
  );
}

function SidebarFooter() {
  const { collapsed, toggle } = useSidebar();
  const { logout } = useAuth();
  const { t } = useLang();
  return (
    <div className="flex-shrink-0 border-t border-border p-2 space-y-0.5">
      <button
        onClick={toggle}
        title={collapsed ? t("sidebarExpand") : t("sidebarCollapse")}
        className={cn(
          "flex w-full items-center gap-3 px-3 py-2 rounded-lg text-sm font-semibold text-muted-foreground hover:text-foreground hover:bg-muted transition-colors",
          collapsed && "justify-center px-0",
        )}
      >
        {collapsed ? <PanelLeft className="h-[18px] w-[18px] flex-shrink-0" /> : <PanelLeftClose className="h-[18px] w-[18px] flex-shrink-0" />}
        {!collapsed && <span>{t("sidebarCollapse")}</span>}
      </button>
      <button
        onClick={logout}
        title={collapsed ? t("signOut") : undefined}
        className={cn(
          "flex w-full items-center gap-3 px-3 py-2 rounded-lg text-sm font-semibold text-destructive hover:bg-destructive/10 transition-colors",
          collapsed && "justify-center px-0",
        )}
      >
        <LogOut className="h-[18px] w-[18px] flex-shrink-0" />
        {!collapsed && t("signOut")}
      </button>
    </div>
  );
}

// ─── User Menu ────────────────────────────────────────────────────────────────

function UserMenu() {
  const { user, logout } = useAuth();
  const { t } = useLang();
  const { resolvedTheme, setTheme } = useTheme();
  const isDark = resolvedTheme === "dark";
  if (!user) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-background/80 backdrop-blur-sm border shadow-sm text-[10px] font-bold uppercase tracking-wider hover:bg-muted transition-colors">
          {user.role === "owner" ? (
            <Crown className="h-3.5 w-3.5 text-yellow-500" />
          ) : user.role === "admin" ? (
            <ShieldCheck className="h-3.5 w-3.5 text-primary" />
          ) : (
            <HardHat className="h-3.5 w-3.5 text-muted-foreground" />
          )}
          {user.username}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuLabel className="font-normal">
          <p className="font-semibold">{user.username}</p>
          <p className="text-xs text-muted-foreground capitalize">{user.role}</p>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />

        {user.role === "owner" && (
          <Link href="/owner">
            <DropdownMenuItem className="cursor-pointer font-semibold text-yellow-600 focus:text-yellow-600">
              <Crown className="mr-2 h-4 w-4 text-yellow-500" /> {t("ownerPanel")}
            </DropdownMenuItem>
          </Link>
        )}

        <DropdownMenuItem
          className="cursor-pointer"
          onClick={(e) => { e.preventDefault(); setTheme(isDark ? "light" : "dark"); }}
        >
          {isDark ? <Sun className="mr-2 h-4 w-4" /> : <Moon className="mr-2 h-4 w-4" />}
          {isDark ? t("themeLight") : t("themeDark")}
        </DropdownMenuItem>
        <DropdownMenuSeparator />

        <DropdownMenuItem
          className="text-destructive focus:text-destructive cursor-pointer"
          onClick={logout}
        >
          <LogOut className="mr-2 h-4 w-4" /> {t("signOut")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ─── Language Picker ─────────────────────────────────────────────────────────

function LangToggle() {
  const { lang, setLang, t } = useLang();
  const current = LANGUAGES.find((l) => l.code === lang) ?? LANGUAGES[0];
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="flex items-center gap-1 px-2 py-1 rounded-full border border-border text-[10px] font-bold uppercase tracking-wider text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
          {current.flag} {current.label}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuLabel className="text-xs text-muted-foreground font-normal">{t("langLabel")}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {LANGUAGES.map((l) => (
          <DropdownMenuItem
            key={l.code}
            onClick={() => setLang(l.code)}
            className={cn("cursor-pointer gap-2", lang === l.code && "font-semibold text-primary")}
          >
            <span>{l.flag}</span>
            <span>{l.label}</span>
            {lang === l.code && <span className="ml-auto text-primary">✓</span>}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ─── Section Switcher (non-admin supervisors & workers only) ──────────────────

function SectionSwitcher({ isWorkSection }: { isWorkSection: boolean }) {
  const workOrdersEnabled = useFeature("work_orders");
  const { t } = useLang();
  return (
    <div className="flex items-center gap-1 bg-muted/50 border border-border rounded-full p-0.5">
      <Link href="/">
        <button
          className={cn(
            "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-bold uppercase tracking-wider transition-all",
            !isWorkSection
              ? "bg-background shadow text-foreground"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          <Package2 className="h-3.5 w-3.5" />
          {t("navInventory")}
        </button>
      </Link>
      {workOrdersEnabled && (
        <Link href="/work/projects">
          <button
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-bold uppercase tracking-wider transition-all",
              isWorkSection
                ? "bg-background shadow text-foreground"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <FolderKanban className="h-3.5 w-3.5" />
            {t("jobsWorkOrders")}
          </button>
        </Link>
      )}
    </div>
  );
}

// ─── Shared sidebar nav item ───────────────────────────────────────────────────

function SideNavItem({
  href, icon: Icon, label, active, badge = 0, pulse = false,
}: {
  href: string; icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  label: string; active: boolean; badge?: number; pulse?: boolean;
}) {
  const { collapsed } = useSidebar();
  return (
    <Link href={href}>
      <div
        title={collapsed ? label : undefined}
        className={cn(
          "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-semibold transition-colors cursor-pointer relative",
          collapsed && "justify-center px-0",
          active
            ? "bg-primary/10 text-primary"
            : "text-muted-foreground hover:text-foreground hover:bg-muted"
        )}>
        <Icon className="h-[18px] w-[18px] flex-shrink-0" strokeWidth={active ? 2.5 : 2} />
        {!collapsed && <span className="flex-1 truncate">{label}</span>}
        {badge > 0 && (
          pulse ? (
            <span className={cn(
              "h-2.5 w-2.5 rounded-full bg-red-500 animate-pulse ring-2 ring-background flex-shrink-0",
              collapsed ? "absolute top-1 right-1.5" : "ml-auto",
            )} />
          ) : collapsed ? (
            <span className="absolute top-1 right-1.5 h-2 w-2 rounded-full bg-red-500 ring-2 ring-background" />
          ) : (
            <span className="bg-red-500 text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] px-1 flex items-center justify-center leading-none flex-shrink-0">
              {badge > 99 ? "99+" : badge}
            </span>
          )
        )}
      </div>
    </Link>
  );
}

function SidebarSection({ label }: { label: string }) {
  const { collapsed } = useSidebar();
  if (collapsed) {
    return <div className="mx-auto my-2 h-px w-6 bg-border" />;
  }
  return (
    <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground px-3 pt-4 pb-1">
      {label}
    </p>
  );
}

// ─── Admin Desktop Sidebar ────────────────────────────────────────────────────

interface AttentionCounts { total: number; leaveRequests: number; lowStock: number; overdueJobs: number; restockRequests: number; openRfqsWithResponses: number; }

function AdminDesktopSidebar() {
  const [location] = useLocation();
  const { atLeast } = usePlan();
  const { t } = useLang();
  const { collapsed } = useSidebar();

  const { data: attention } = useQuery<AttentionCounts>({
    queryKey: ["/api/admin/attention"],
    queryFn: async () => {
      const r = await fetch("/api/admin/attention", { credentials: "include" });
      if (!r.ok) throw new Error("Failed");
      return r.json();
    },
    staleTime: 60_000,
    refetchInterval: 60_000,
  });

  const isJobsActive = location.startsWith("/work/projects") || location.startsWith("/tasks") || location.startsWith("/work/inbound") || location.startsWith("/work/templates") || location.startsWith("/work/template-outline");
  const isCustomersActive = location.startsWith("/customers") || location.startsWith("/quotes") || location.startsWith("/orders");
  const isPurchasingActive = location.startsWith("/work/reorder") || location.startsWith("/work/purchase-orders");

  return (
    <aside className={cn(
      "hidden md:flex flex-col fixed inset-y-0 left-0 z-30 bg-background border-r border-border transition-[width] duration-200",
      collapsed ? "w-16" : "w-64",
    )}>
      <SidebarBrand />

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-2 px-2 space-y-0.5">
        {!atLeast("standard") ? (
          // ── Lite nav ────────────────────────────────────────────────────────
          <>
            <SidebarSection label={t("navMain")} />
            <SideNavItem href="/dashboard" icon={LayoutDashboard} label={t("navDashboard")} active={location === "/dashboard" || location === "/"} />

            <SidebarSection label={t("navInventory")} />
            <SideNavItem href="/locations" icon={MapPin} label={t("locationsTitle")} active={location === "/locations" || location.startsWith("/locations/")} />
            <SideNavItem href="/products" icon={Package2} label={t("navProductsStock")} active={location.startsWith("/products")} badge={attention?.lowStock ?? 0} />

            <SidebarSection label={t("navPeople")} />
            <SideNavItem href="/admin/users" icon={Users} label={t("navManageUsers")} active={location.startsWith("/admin/users")} />

            <SidebarSection label={t("navBusiness")} />
            <SideNavItem href="/customers" icon={Store} label={t("navCustomers")} active={location.startsWith("/customers") || location.startsWith("/quotes")} />
            <SideNavItem href="/admin/suppliers" icon={Truck} label={t("navSuppliers")} active={location.startsWith("/admin/suppliers")} />
            <SideNavItem href="/admin/catalog" icon={BookOpen} label={t("navCatalog")} active={location.startsWith("/admin/catalog")} />
            <SideNavItem href="/sourcing" icon={Scale} label={t("navSourcing")} active={location.startsWith("/sourcing")} badge={attention?.openRfqsWithResponses ?? 0} pulse />
            <SideNavItem href="/admin/company" icon={Building2} label={t("navCompanyPlan")} active={location.startsWith("/admin/company")} />
            <SideNavItem href="/help" icon={HelpCircle} label={t("navHelp")} active={location.startsWith("/help")} />
          </>
        ) : (
          // ── Standard / Pro nav ──────────────────────────────────────────────
          <>
            <SidebarSection label={t("navMain")} />
            <SideNavItem href="/work/projects" icon={FolderKanban} label={t("navJobs")} active={isJobsActive} badge={attention?.overdueJobs ?? 0} />
            <SideNavItem href="/customers" icon={Store} label={t("navCustomers")} active={isCustomersActive} />
            <SideNavItem href="/quotes" icon={FileText} label={t("navQuotes")} active={location.startsWith("/quotes")} />
            <SideNavItem href="/work/purchase-orders" icon={ShoppingCart} label={t("navPurchasing")} active={isPurchasingActive} badge={attention?.restockRequests ?? 0} />

            <SidebarSection label={t("navInventory")} />
            <SideNavItem href="/scan" icon={ScanLine} label={t("navScan")} active={location.startsWith("/scan") || location.startsWith("/location/") || location.startsWith("/item/")} />
            <SideNavItem href="/locations" icon={MapPin} label={t("locationsTitle")} active={location === "/locations" || location.startsWith("/locations/")} />
            <SideNavItem href="/products" icon={Package2} label={t("navProductsStock")} active={location.startsWith("/products")} badge={attention?.lowStock ?? 0} />
            <SideNavItem href="/work/stocktake" icon={ClipboardList} label={t("navStockTake")} active={location.startsWith("/work/stocktake")} />
            <SideNavItem href="/history" icon={History} label={t("navHistory")} active={location.startsWith("/history")} />
            <SideNavItem href="/valuation" icon={FileText} label={t("valuationTitle")} active={location.startsWith("/valuation")} />
            <SideNavItem href="/admin/stock-import" icon={PackageOpen} label={t("navStockImport")} active={location.startsWith("/admin/stock-import")} />

            <SidebarSection label={t("navWork")} />
            <SideNavItem href="/work/templates" icon={BookTemplate} label={t("navJobTemplates")} active={location.startsWith("/work/templates") || location.startsWith("/work/template-outline")} />
            <SideNavItem href="/work/materials" icon={PackageOpen} label={t("navMaterials")} active={location.startsWith("/work/materials") && !location.startsWith("/work/stocktake")} />
            {atLeast("pro") && <SideNavItem href="/admin/stations" icon={Layers} label={t("navProductionFlow")} active={location.startsWith("/admin/stations")} />}
            {atLeast("pro") && <SideNavItem href="/work/queues" icon={CheckSquare} label={t("navStationQueues")} active={location.startsWith("/work/queue")} />}
            <SideNavItem href="/analytics" icon={BarChart2} label={t("navAnalytics")} active={location.startsWith("/analytics")} />
            <Link href="/admin/ai-wizard">
              <div
                title={collapsed ? "AI Wizard" : undefined}
                className={cn(
                  "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-semibold transition-colors cursor-pointer",
                  collapsed && "justify-center px-0",
                  location.startsWith("/admin/ai-wizard")
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted"
                )}>
                <Sparkles className="h-[18px] w-[18px] flex-shrink-0" strokeWidth={location.startsWith("/admin/ai-wizard") ? 2.5 : 2} />
                {!collapsed && <span className="flex-1 truncate">AI Wizard</span>}
                {!collapsed && <span className="text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 bg-amber-400 text-amber-900 rounded-full flex-shrink-0">TEST</span>}
              </div>
            </Link>

            <SidebarSection label={t("navPeople")} />
            <SideNavItem href="/admin/users" icon={Users} label={t("navManageUsers")} active={location.startsWith("/admin/users")} />
            <SideNavItem href="/attendance" icon={CalendarCheck} label={t("navAttendance")} active={location.startsWith("/attendance")} />
            <SideNavItem href="/admin/leave-inbox" icon={Inbox} label={t("navLeaveRequests")} active={location.startsWith("/admin/leave-inbox")} badge={attention?.leaveRequests ?? 0} />

            <SidebarSection label={t("navBusiness")} />
            <SideNavItem href="/admin/suppliers" icon={Truck} label={t("navSuppliers")} active={location.startsWith("/admin/suppliers")} />
            <SideNavItem href="/admin/catalog" icon={BookOpen} label={t("navCatalog")} active={location.startsWith("/admin/catalog")} />
            <SideNavItem href="/sourcing" icon={Scale} label={t("navSourcing")} active={location.startsWith("/sourcing")} badge={attention?.openRfqsWithResponses ?? 0} pulse />
            <SideNavItem href="/admin/company" icon={Building2} label={t("navCompanyPlan")} active={location.startsWith("/admin/company")} />
            <SideNavItem href="/help" icon={HelpCircle} label={t("navHelp")} active={location.startsWith("/help")} />
          </>
        )}
      </nav>

      <SidebarFooter />
    </aside>
  );
}

// ─── Supervisor Desktop Sidebar ───────────────────────────────────────────────

function SupervisorDesktopSidebar() {
  const [location] = useLocation();
  const { t } = useLang();
  const { collapsed } = useSidebar();

  return (
    <aside className={cn(
      "hidden md:flex flex-col fixed inset-y-0 left-0 z-30 bg-background border-r border-border transition-[width] duration-200",
      collapsed ? "w-16" : "w-64",
    )}>
      <SidebarBrand />
      <nav className="flex-1 overflow-y-auto py-2 px-2 space-y-0.5">
        <SidebarSection label={t("navNavigation")} />
        <SideNavItem href="/tasks" icon={CheckSquare} label={t("navTasks")} active={location.startsWith("/tasks")} />
        <SideNavItem href="/work/projects" icon={FolderKanban} label={t("navProjects")} active={location.startsWith("/work/projects")} />
        <SideNavItem href="/work/inbound" icon={PackageCheck} label={t("navInbound")} active={location.startsWith("/work/inbound")} />
        <SideNavItem href="/work/queues" icon={Layers} label={t("navStationQueues")} active={location.startsWith("/work/queue")} />
        <SideNavItem href="/attendance" icon={CalendarCheck} label={t("navAttendance")} active={location.startsWith("/attendance")} />
        <SideNavItem href="/supervisor" icon={Eye} label={t("navSupervisor")} active={location.startsWith("/supervisor")} />
      </nav>
      <SidebarFooter />
    </aside>
  );
}

// ─── Worker Desktop Sidebar ───────────────────────────────────────────────────

interface WorkerNotifications { total: number; autoClosed: number; leaveDecisions: number; }

function WorkerDesktopSidebar() {
  const [location] = useLocation();
  const { t } = useLang();
  const { collapsed } = useSidebar();

  const { data: painterData } = useQuery<{ isPainter: boolean }>({
    queryKey: ["/api/work/painter-access"],
    queryFn: () => fetch("/api/work/painter-access", { credentials: "include" }).then((r) => r.json()),
    staleTime: 5 * 60 * 1000,
  });

  const { data: workerNotifs } = useQuery<WorkerNotifications>({
    queryKey: ["/api/admin/worker-notifications"],
    queryFn: async () => {
      const r = await fetch("/api/admin/worker-notifications", { credentials: "include" });
      if (!r.ok) throw new Error("Failed");
      return r.json();
    },
    staleTime: 60_000,
    refetchInterval: 60_000,
  });

  return (
    <aside className={cn(
      "hidden md:flex flex-col fixed inset-y-0 left-0 z-30 bg-background border-r border-border transition-[width] duration-200",
      collapsed ? "w-16" : "w-64",
    )}>
      <SidebarBrand />
      <nav className="flex-1 overflow-y-auto py-2 px-2 space-y-0.5">
        <SidebarSection label={t("navNavigation")} />
        <SideNavItem href="/tasks" icon={CheckSquare} label={t("navMyTasks")} active={location.startsWith("/tasks")} />
        <SideNavItem href="/work/inbound" icon={PackageCheck} label={t("navInbound")} active={location.startsWith("/work/inbound")} />
        <SideNavItem href="/work/queues" icon={Layers} label={t("navStationQueues")} active={location.startsWith("/work/queue")} />
        <SideNavItem href="/attendance" icon={CalendarCheck} label={t("navAttendance")} active={location.startsWith("/attendance")} badge={workerNotifs?.total ?? 0} />
        {painterData?.isPainter && (
          <SideNavItem href="/work/paint-queue" icon={Palette} label={t("navPaintShop")} active={location.startsWith("/work/paint-queue")} />
        )}
      </nav>
      <SidebarFooter />
    </aside>
  );
}

// ─── Admin Bottom Nav ─────────────────────────────────────────────────────────

function AttentionBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span className="flex-shrink-0 ml-auto bg-red-500 text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] px-1 flex items-center justify-center leading-none">
      {count > 99 ? "99+" : count}
    </span>
  );
}

function AdminBottomNav() {
  const [location] = useLocation();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const { logout, user } = useAuth();
  const { atLeast } = usePlan();
  const { t } = useLang();

  const { data: attention } = useQuery<AttentionCounts>({
    queryKey: ["/api/admin/attention"],
    queryFn: async () => {
      const r = await fetch("/api/admin/attention", { credentials: "include" });
      if (!r.ok) throw new Error("Failed");
      return r.json();
    },
    staleTime: 60_000,
    refetchInterval: 60_000,
  });

  const isJobsActive =
    location.startsWith("/work/projects") ||
    location.startsWith("/tasks") ||
    location.startsWith("/work/inbound") ||
    location.startsWith("/work/templates") ||
    location.startsWith("/work/template-outline");
  const isCustomersActive =
    location.startsWith("/customers") ||
    location.startsWith("/orders");
  const isPurchasingActive =
    location.startsWith("/work/reorder") ||
    location.startsWith("/work/purchase-orders");
  const isInventoryActive =
    location === "/inventory" ||
    location.startsWith("/scan") ||
    location.startsWith("/location") ||
    location.startsWith("/item/") ||
    location.startsWith("/products") ||
    location.startsWith("/history") ||
    location.startsWith("/locations");

  const isProductsActive = location.startsWith("/products");
  const isSuppliersActive = location.startsWith("/admin/suppliers");
  const isLocationsActive =
    location === "/locations" ||
    location.startsWith("/locations/") ||
    location.startsWith("/location/");

  // Lite: Dashboard · Locations · Products · Settings (Suppliers lives in Settings)
  // Standard/Pro: Jobs · Customers · Purchasing · Settings
  const tabs = atLeast("standard")
    ? [
        { key: "jobs", href: "/work/projects", icon: FolderKanban, label: t("navJobs"), active: isJobsActive },
        { key: "customers", href: "/customers", icon: Store, label: t("navCustomers"), active: isCustomersActive },
        { key: "purchasing", href: "/work/purchase-orders", icon: ShoppingCart, label: t("navPurchasing"), active: isPurchasingActive },
      ]
    : [
        { key: "dashboard", href: "/dashboard", icon: LayoutDashboard, label: t("navDashboard"), active: location === "/dashboard" || location === "/" },
        { key: "locations", href: "/locations", icon: MapPin, label: t("locationsTitle"), active: isLocationsActive },
        { key: "products", href: "/products", icon: Package2, label: t("navProductsStock"), active: isProductsActive },
      ];

  return (
    <>
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-secondary border-t border-secondary-border">
        <div className="flex h-16 w-full max-w-md mx-auto">
          {tabs.map((tab) => (
            <Link key={tab.key} href={tab.href} className="flex-1">
              <div className={cn(
                "flex flex-col items-center justify-center h-full space-y-1 transition-colors",
                tab.active ? "text-primary" : "text-secondary-foreground/60 hover:text-secondary-foreground"
              )}>
                <tab.icon className="h-6 w-6 shrink-0" strokeWidth={tab.active ? 2.5 : 2} />
                <span className="w-full px-0.5 text-center text-[10px] font-medium tracking-tight uppercase leading-[1.1] line-clamp-2">{tab.label}</span>
              </div>
            </Link>
          ))}

          <button className="flex-1" onClick={() => setSettingsOpen(true)}>
            <div className={cn(
              "flex flex-col items-center justify-center h-full space-y-1 transition-colors relative",
              settingsOpen ? "text-primary" : "text-secondary-foreground/60 hover:text-secondary-foreground"
            )}>
              <div className="relative">
                <Settings className="h-6 w-6" strokeWidth={settingsOpen ? 2.5 : 2} />
                {(attention?.total ?? 0) > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-[9px] font-bold rounded-full min-w-[16px] h-[16px] px-0.5 flex items-center justify-center leading-none">
                    {(attention!.total) > 99 ? "99+" : attention!.total}
                  </span>
                )}
              </div>
              <span className="w-full px-0.5 text-center text-[10px] font-medium tracking-tight uppercase leading-[1.1] line-clamp-2">{t("navMore")}</span>
            </div>
          </button>
        </div>
      </div>

      <Drawer open={settingsOpen} onOpenChange={setSettingsOpen} shouldScaleBackground={false}>
        <DrawerContent aria-describedby={undefined} className="max-w-md mx-auto max-h-[85dvh] px-4 pb-0">
          <DrawerHeader className="pb-2 flex-shrink-0 px-1 text-left">
            <DrawerTitle className="text-sm font-bold uppercase tracking-wider text-muted-foreground">{t("navMore")}</DrawerTitle>
          </DrawerHeader>

          <div className="space-y-1 mt-2 overflow-y-auto flex-1 pb-8 overscroll-contain">
            {/* Work section — Standard+ only */}
            {atLeast("standard") && (
              <>
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground px-1 py-1">{t("navWork")}</p>
                <Link href="/work/templates" onClick={() => setSettingsOpen(false)}>
                  <div className="flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-muted transition-colors cursor-pointer">
                    <BookTemplate className="h-5 w-5 text-emerald-600 shrink-0" />
                    <div>
                      <p className="text-sm font-semibold">{t("navJobTemplates")}</p>
                      <p className="text-xs text-muted-foreground">{t("descJobTemplates")}</p>
                    </div>
                  </div>
                </Link>
                <Link href="/work/materials" onClick={() => setSettingsOpen(false)}>
                  <div className="flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-muted transition-colors cursor-pointer">
                    <PackageOpen className="h-5 w-5 text-amber-600 shrink-0" />
                    <div>
                      <p className="text-sm font-semibold">{t("navMaterials")}</p>
                      <p className="text-xs text-muted-foreground">{t("descMaterials")}</p>
                    </div>
                  </div>
                </Link>
                <Link href="/admin/stations" onClick={() => setSettingsOpen(false)}>
                  <div className="flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-muted transition-colors cursor-pointer">
                    <Layers className="h-5 w-5 text-indigo-600 shrink-0" />
                    <div>
                      <p className="text-sm font-semibold">{t("navProductionFlow")}</p>
                      <p className="text-xs text-muted-foreground">{t("descProductionFlow")}</p>
                    </div>
                  </div>
                </Link>
                <Link href="/work/queues" onClick={() => setSettingsOpen(false)}>
                  <div className="flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-muted transition-colors cursor-pointer">
                    <CheckSquare className="h-5 w-5 text-teal-600 shrink-0" />
                    <div>
                      <p className="text-sm font-semibold">{t("navStationQueues")}</p>
                      <p className="text-xs text-muted-foreground">{t("descStationQueues")}</p>
                    </div>
                  </div>
                </Link>
                <Link href="/analytics" onClick={() => setSettingsOpen(false)}>
                  <div className="flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-muted transition-colors cursor-pointer">
                    <BarChart2 className="h-5 w-5 text-violet-600 shrink-0" />
                    <div>
                      <p className="text-sm font-semibold">{t("navAnalytics")}</p>
                      <p className="text-xs text-muted-foreground">{t("descAnalytics")}</p>
                    </div>
                  </div>
                </Link>
              </>
            )}

            {/* People section */}
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground px-1 py-1 pt-3">{t("navPeople")}</p>
            <Link href="/admin/users" onClick={() => setSettingsOpen(false)}>
              <div className="flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-muted transition-colors cursor-pointer">
                <Users className="h-5 w-5 text-muted-foreground shrink-0" />
                <div>
                  <p className="text-sm font-semibold">{t("navManageUsers")}</p>
                  <p className="text-xs text-muted-foreground">{t("descManageUsers")}</p>
                </div>
              </div>
            </Link>
            {atLeast("standard") && (
              <>
                <Link href="/attendance" onClick={() => setSettingsOpen(false)}>
                  <div className="flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-muted transition-colors cursor-pointer">
                    <CalendarCheck className="h-5 w-5 text-muted-foreground shrink-0" />
                    <div>
                      <p className="text-sm font-semibold">{t("navAttendance")}</p>
                      <p className="text-xs text-muted-foreground">{t("descAttendance")}</p>
                    </div>
                  </div>
                </Link>
                <Link href="/admin/leave-inbox" onClick={() => setSettingsOpen(false)}>
                  <div className="flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-muted transition-colors cursor-pointer">
                    <Inbox className="h-5 w-5 text-violet-600 shrink-0" />
                    <div className="flex-1">
                      <p className="text-sm font-semibold">{t("navLeaveRequests")}</p>
                      <p className="text-xs text-muted-foreground">{t("descLeaveRequests")}</p>
                    </div>
                    <AttentionBadge count={attention?.leaveRequests ?? 0} />
                  </div>
                </Link>
              </>
            )}

            {/* Business section */}
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground px-1 py-1 pt-3">{t("navBusiness")}</p>
            {/* Lite: Products & Locations are bottom tabs — surface Customers, Quotes & Suppliers here instead */}
            {!atLeast("standard") ? (
              <>
                <Link href="/customers" onClick={() => setSettingsOpen(false)}>
                  <div className="flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-muted transition-colors cursor-pointer">
                    <Store className="h-5 w-5 text-muted-foreground shrink-0" />
                    <div>
                      <p className="text-sm font-semibold">{t("navCustomers")}</p>
                      <p className="text-xs text-muted-foreground">{t("descCustomers")}</p>
                    </div>
                  </div>
                </Link>
                <Link href="/quotes" onClick={() => setSettingsOpen(false)}>
                  <div className="flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-muted transition-colors cursor-pointer">
                    <FileText className="h-5 w-5 text-muted-foreground shrink-0" />
                    <div>
                      <p className="text-sm font-semibold">{t("navQuotes")}</p>
                      <p className="text-xs text-muted-foreground">{t("descQuotes")}</p>
                    </div>
                  </div>
                </Link>
                <Link href="/admin/suppliers" onClick={() => setSettingsOpen(false)}>
                  <div className="flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-muted transition-colors cursor-pointer">
                    <Truck className="h-5 w-5 text-muted-foreground shrink-0" />
                    <div>
                      <p className="text-sm font-semibold">{t("navSuppliers")}</p>
                      <p className="text-xs text-muted-foreground">{t("descSuppliers")}</p>
                    </div>
                  </div>
                </Link>
              </>
            ) : (
              <>
                <Link href="/products" onClick={() => setSettingsOpen(false)}>
                  <div className="flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-muted transition-colors cursor-pointer">
                    <Package2 className="h-5 w-5 text-muted-foreground shrink-0" />
                    <div className="flex-1">
                      <p className="text-sm font-semibold">{t("navProductsStock")}</p>
                      <p className="text-xs text-muted-foreground">{t("descProductsStock")}</p>
                    </div>
                    <AttentionBadge count={attention?.lowStock ?? 0} />
                  </div>
                </Link>
                <Link href="/admin/suppliers" onClick={() => setSettingsOpen(false)}>
                  <div className="flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-muted transition-colors cursor-pointer">
                    <Truck className="h-5 w-5 text-muted-foreground shrink-0" />
                    <div>
                      <p className="text-sm font-semibold">{t("navSuppliers")}</p>
                      <p className="text-xs text-muted-foreground">{t("descSuppliers")}</p>
                    </div>
                  </div>
                </Link>
              </>
            )}
            <Link href="/admin/company" onClick={() => setSettingsOpen(false)}>
              <div className="flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-muted transition-colors cursor-pointer">
                <Building2 className="h-5 w-5 text-muted-foreground shrink-0" />
                <div>
                  <p className="text-sm font-semibold">{t("navCompanyPlan")}</p>
                  <p className="text-xs text-muted-foreground">{t("descCompanyPlan")}</p>
                </div>
              </div>
            </Link>
            {/* Sourcing (Supplier Quotes) is infrequent — keep it after Company/Plan */}
            <Link href="/sourcing" onClick={() => setSettingsOpen(false)}>
              <div className="flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-muted transition-colors cursor-pointer">
                <Scale className="h-5 w-5 text-muted-foreground shrink-0" />
                <div className="flex-1">
                  <p className="text-sm font-semibold">{t("navSourcing")}</p>
                  <p className="text-xs text-muted-foreground">{t("descSourcing")}</p>
                </div>
                <AttentionBadge count={attention?.openRfqsWithResponses ?? 0} />
              </div>
            </Link>
            <Link href="/help" onClick={() => setSettingsOpen(false)}>
              <div className="flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-muted transition-colors cursor-pointer">
                <HelpCircle className="h-5 w-5 text-muted-foreground shrink-0" />
                <div>
                  <p className="text-sm font-semibold">{t("navHelp")}</p>
                </div>
              </div>
            </Link>

            <div className="pt-2 border-t border-border mt-2">
              <button
                onClick={() => { setSettingsOpen(false); logout(); }}
                className="flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-destructive/10 transition-colors cursor-pointer w-full text-destructive"
              >
                <LogOut className="h-5 w-5 shrink-0" />
                <p className="text-sm font-semibold">{t("signOut")}</p>
              </button>
            </div>
          </div>
        </DrawerContent>
      </Drawer>
    </>
  );
}

// ─── Supervisor Bottom Nav ────────────────────────────────────────────────────

function SupervisorBottomNav() {
  const [location] = useLocation();
  const { t } = useLang();

  const navItems = [
    { href: "/tasks", icon: CheckSquare, label: t("navTasks") },
    { href: "/work/projects", icon: FolderKanban, label: t("navProjects") },
    { href: "/work/inbound", icon: PackageCheck, label: t("navInbound") },
    { href: "/attendance", icon: CalendarCheck, label: t("navAttendance") },
    { href: "/supervisor", icon: Eye, label: t("navSupervisor") },
  ];

  return (
    <div className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-secondary border-t border-secondary-border">
      <div className="flex h-16 w-full max-w-md mx-auto">
        {navItems.map((item) => {
          const isActive = item.href === "/work/projects"
            ? location.startsWith("/work/projects")
            : location.startsWith(item.href);
          return (
            <Link key={item.href} href={item.href} className="flex-1">
              <div className={cn(
                "flex flex-col items-center justify-center h-full space-y-1 transition-colors",
                isActive ? "text-primary" : "text-secondary-foreground/60 hover:text-secondary-foreground"
              )}>
                <item.icon className="h-6 w-6" strokeWidth={isActive ? 2.5 : 2} />
                <span className="w-full px-0.5 text-center text-[10px] font-medium tracking-tight uppercase leading-[1.1] line-clamp-2">{item.label}</span>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

// ─── Inventory Bottom Nav (non-admin, non-work-section) ───────────────────────

function InventoryBottomNav() {
  const [location] = useLocation();
  const { t } = useLang();

  const navItems = [
    { href: "/", icon: LayoutDashboard, label: t("navDashboard") },
    { href: "/scan", icon: ScanLine, label: t("navScan") },
    { href: "/products", icon: Package2, label: t("productsTitle") },
    { href: "/history", icon: History, label: t("navHistory") },
  ];

  return (
    <div className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-secondary border-t border-secondary-border">
      <div className="flex h-16 w-full max-w-md mx-auto relative">
        <Link href="/scan" className="absolute left-1/2 -top-6 -translate-x-1/2 group">
          <div className={cn(
            "h-14 w-14 rounded-full flex items-center justify-center border-4 border-background shadow-lg transition-transform group-active:scale-95",
            "bg-primary text-primary-foreground"
          )}>
            <ScanLine className="h-6 w-6" strokeWidth={2.5} />
          </div>
        </Link>

        {navItems.map((item) => {
          if (item.href === "/scan") {
            return <div key={item.href} className="flex-1 pointer-events-none" />;
          }
          const isActive = location === item.href || (item.href !== "/" && location.startsWith(item.href));
          return (
            <Link key={item.href} href={item.href} className="flex-1">
              <div className={cn(
                "flex flex-col items-center justify-center h-full space-y-1 transition-colors",
                isActive ? "text-primary" : "text-secondary-foreground/60 hover:text-secondary-foreground"
              )}>
                <item.icon className="h-6 w-6" strokeWidth={isActive ? 2.5 : 2} />
                <span className="w-full px-0.5 text-center text-[10px] font-medium tracking-tight uppercase leading-[1.1] line-clamp-2">{item.label}</span>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

// ─── Work Orders Bottom Nav ───────────────────────────────────────────────────

function WorkOrdersBottomNav() {
  const [location] = useLocation();
  const { t } = useLang();

  const navItems = [
    { href: "/tasks", icon: CheckSquare, label: t("navTasks") },
    { href: "/work/projects", icon: FolderKanban, label: t("navProjects") },
    { href: "/work/inbound", icon: PackageCheck, label: t("navInbound") },
    { href: "/orders", icon: Truck, label: t("navOrders") },
  ];

  return (
    <div className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-secondary border-t border-secondary-border">
      <div className="flex h-16 w-full max-w-md mx-auto">
        {navItems.map((item) => {
          const realActive = item.href === "/work/projects"
            ? location.startsWith("/work/projects")
            : location.startsWith(item.href);
          return (
            <Link key={item.href} href={item.href} className="flex-1">
              <div className={cn(
                "flex flex-col items-center justify-center h-full space-y-1 transition-colors",
                realActive ? "text-primary" : "text-secondary-foreground/60 hover:text-secondary-foreground"
              )}>
                <item.icon className="h-6 w-6" strokeWidth={realActive ? 2.5 : 2} />
                <span className="w-full px-0.5 text-center text-[10px] font-medium tracking-tight uppercase leading-[1.1] line-clamp-2">{item.label}</span>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

// ─── Worker Bottom Nav ────────────────────────────────────────────────────────

function WorkerBottomNav() {
  const [location] = useLocation();
  const { atLeast } = usePlan();
  const { t } = useLang();

  const { data: painterData } = useQuery<{ isPainter: boolean }>({
    queryKey: ["/api/work/painter-access"],
    queryFn: () => fetch("/api/work/painter-access", { credentials: "include" }).then((r) => r.json()),
    staleTime: 5 * 60 * 1000,
  });

  const { data: workerNotifs } = useQuery<WorkerNotifications>({
    queryKey: ["/api/admin/worker-notifications"],
    queryFn: async () => {
      const r = await fetch("/api/admin/worker-notifications", { credentials: "include" });
      if (!r.ok) throw new Error("Failed");
      return r.json();
    },
    staleTime: 60_000,
    refetchInterval: 60_000,
  });

  const { data: queueCount } = useQuery<{ pending: number }>({
    queryKey: ["/api/stations/my-pending-count"],
    queryFn: async () => {
      const r = await fetch("/api/stations/my-pending-count", { credentials: "include" });
      if (!r.ok) throw new Error("Failed");
      return r.json();
    },
    staleTime: 15_000,
    refetchInterval: 15_000,
  });

  const attendanceBadge = workerNotifs?.total ?? 0;
  const queueBadge = queueCount?.pending ?? 0;

  const navItems = [
    { href: "/tasks", icon: CheckSquare, label: t("navMyTasks"), badge: 0, show: atLeast("standard") },
    { href: "/work/queues", icon: Layers, label: t("navQueues"), badge: queueBadge, show: atLeast("pro") },
    { href: "/attendance", icon: CalendarCheck, label: t("navAttendance"), badge: attendanceBadge, show: atLeast("standard") },
    ...(painterData?.isPainter && atLeast("pro") ? [{ href: "/work/paint-queue", icon: Palette, label: t("navPaintShop"), badge: 0, show: true }] : []),
  ].filter((i) => i.show);

  return (
    <div className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-secondary border-t border-secondary-border">
      <div className="flex h-16 w-full max-w-md mx-auto">
        {navItems.map((item) => {
          const isActive = location.startsWith(item.href);
          return (
            <Link key={item.href} href={item.href} className="flex-1">
              <div className={cn(
                "flex flex-col items-center justify-center h-full space-y-1 transition-colors",
                isActive ? "text-primary" : "text-secondary-foreground/60 hover:text-secondary-foreground"
              )}>
                <div className="relative">
                  <item.icon className="h-6 w-6" strokeWidth={isActive ? 2.5 : 2} />
                  {item.badge > 0 && (
                    <span className="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-[9px] font-bold rounded-full min-w-[16px] h-[16px] px-0.5 flex items-center justify-center leading-none">
                      {item.badge > 99 ? "99+" : item.badge}
                    </span>
                  )}
                </div>
                <span className="w-full px-0.5 text-center text-[10px] font-medium tracking-tight uppercase leading-[1.1] line-clamp-2">{item.label}</span>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

// ─── Tutorial help button ─────────────────────────────────────────────────────

function TutorialHelpButton() {
  const { hasTutorial, openTutorial } = useTutorial();
  if (!hasTutorial) return null;
  return (
    <button
      onClick={() => openTutorial()}
      title="Page guide"
      className="flex items-center justify-center h-7 w-7 rounded-full border border-border bg-muted/50 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
    >
      <HelpCircle className="h-3.5 w-3.5" />
    </button>
  );
}

// ─── Lite Worker Bottom Nav ───────────────────────────────────────────────────
// Lite workers can only scan & flag stock. Give them a minimal two-tab bar so they
// always have a way to reach Help instead of being stranded on a bare camera.
function LiteWorkerBottomNav() {
  const [location] = useLocation();
  const { t } = useLang();
  const tabs = [
    { key: "scan", href: "/scan", icon: ScanLine, label: t("navScan"), active: location.startsWith("/scan") || location.startsWith("/location/") },
    { key: "help", href: "/help", icon: HelpCircle, label: t("navHelp"), active: location.startsWith("/help") },
  ];
  return (
    <div className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-secondary border-t border-secondary-border">
      <div className="flex h-16 w-full max-w-md mx-auto">
        {tabs.map((tab) => (
          <Link key={tab.key} href={tab.href} className="flex-1">
            <div className={cn(
              "flex flex-col items-center justify-center gap-1 h-full transition-colors",
              tab.active ? "text-primary" : "text-secondary-foreground/70",
            )}>
              <tab.icon className="h-6 w-6" strokeWidth={tab.active ? 2.5 : 2} />
              <span className="w-full px-0.5 text-center text-[10px] font-medium tracking-tight uppercase leading-[1.1] line-clamp-2">{tab.label}</span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

// ─── App Layout ───────────────────────────────────────────────────────────────

export function AppLayout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { user } = useAuth();
  const { atLeast } = usePlan();
  const { t } = useLang();
  const [collapsed, setCollapsed] = useState(() =>
    typeof window !== "undefined" && localStorage.getItem("sidebar_collapsed") === "1"
  );
  const toggle = () => setCollapsed((c) => {
    const next = !c;
    try { localStorage.setItem("sidebar_collapsed", next ? "1" : "0"); } catch { /* ignore */ }
    return next;
  });
  const isOwner = user?.role === "owner";
  const isAdmin = user?.role === "admin";
  const isSupervisor = user?.role === "worker" && !!user?.isSupervisor;
  const isWorker = user?.role === "worker" && !user?.isSupervisor;
  // Lite workers only flag — give them a chrome-free view (no sidebar).
  const liteWorker = isWorker && !atLeast("standard");

  const isWorkSection = location.startsWith("/work") || location.startsWith("/tasks") || location.startsWith("/attendance") || location.startsWith("/orders") || location.startsWith("/supervisor");
  const hasSidebar = !isOwner && (isAdmin || isSupervisor || (isWorker && !liteWorker));

  function BottomNav() {
    if (isOwner) return null;
    if (liteWorker) return <LiteWorkerBottomNav />; // Lite worker: Scan + Help
    if (isAdmin) return <AdminBottomNav />;
    if (isSupervisor) return <SupervisorBottomNav />;
    if (isWorker) return <WorkerBottomNav />;
    if (isWorkSection) return <WorkOrdersBottomNav />;
    return <InventoryBottomNav />;
  }

  function HeaderLeft() {
    if (isOwner) {
      return (
        <div className="flex items-center gap-2">
          <Crown className="h-4 w-4 text-yellow-500" />
          <span className="text-xs font-bold uppercase tracking-wider text-yellow-600">{t("ownerPanel")}</span>
        </div>
      );
    }
    if (isAdmin) {
      return (
        <div className="flex items-center gap-2">
          <div className="h-6 w-6 rounded-md bg-primary flex items-center justify-center md:hidden">
            <FabriflowMark className="h-3.5 w-3.5 text-primary-foreground" />
          </div>
          <span className="font-bold text-sm md:hidden">Fabriflow</span>
        </div>
      );
    }
    if (isSupervisor) {
      return (
        <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-indigo-500/10 border border-indigo-300/30 text-[11px] font-bold uppercase tracking-wider text-indigo-600">
          <Eye className="h-3.5 w-3.5" />
          {t("navSupervisor")}
        </div>
      );
    }
    if (liteWorker) {
      return (
        <div className="flex items-center gap-2">
          <div className="h-6 w-6 rounded-md bg-primary flex items-center justify-center">
            <FabriflowMark className="h-3.5 w-3.5 text-primary-foreground" />
          </div>
          <span className="font-bold text-sm">Fabriflow</span>
        </div>
      );
    }
    if (isWorker) {
      return (
        <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-muted/60 border text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
          <CheckSquare className="h-3.5 w-3.5" />
          {t("navMyTasks")}
        </div>
      );
    }
    return <SectionSwitcher isWorkSection={isWorkSection} />;
  }

  return (
    <SidebarCtx.Provider value={{ collapsed, toggle }}>
    <TutorialProvider>
    <TutorialModal />
    <div className="min-h-[100dvh] bg-background">
      {/* Desktop sidebars — hidden on mobile via md:flex inside each component */}
      {isAdmin && <AdminDesktopSidebar />}
      {isSupervisor && <SupervisorDesktopSidebar />}
      {isWorker && !liteWorker && <WorkerDesktopSidebar />}

      {/* Main content area */}
      <div className={cn(
        "min-h-[100dvh] overflow-x-hidden",
        hasSidebar && (collapsed ? "md:ml-16" : "md:ml-64"),
        !isOwner && "pb-16 md:pb-0",
      )}>
        <main className="w-full max-w-md mx-auto md:max-w-none bg-background border-x border-border/50 md:border-x-0 relative overflow-x-hidden">
          {/* Top bar */}
          <div className="sticky top-0 z-40 bg-background/95 backdrop-blur-sm border-b border-border/40">
            <div className="flex items-center justify-between px-3 py-2 gap-2">
              <HeaderLeft />
              <div className="flex items-center gap-1.5">
                <LangToggle />
                <TutorialHelpButton />
                <UserMenu />
              </div>
            </div>
          </div>

          {children}
        </main>
      </div>

      <BottomNav />
    </div>
    </TutorialProvider>
    </SidebarCtx.Provider>
  );
}
