import { useState } from "react";
import { Link, useLocation } from "wouter";
import {
  LayoutDashboard, ScanLine, Package2, History, ShieldCheck,
  HardHat, LogOut, FolderKanban, Building2, Crown, PackageCheck,
  CheckSquare, Truck, Eye, MapPin, Clock,
  BookTemplate, Wrench, Users, Settings, Store, CalendarCheck, Inbox,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useHealthCheck } from "@workspace/api-client-react";
import { useAuth, useFeature } from "@/contexts/auth";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

// ─── User Menu ────────────────────────────────────────────────────────────────

function UserMenu() {
  const { user, logout } = useAuth();
  if (!user) return null;

  const isAdmin = user.role === "admin";

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

        {/* Owner */}
        {user.role === "owner" && (
          <Link href="/owner">
            <DropdownMenuItem className="cursor-pointer font-semibold text-yellow-600 focus:text-yellow-600">
              <Crown className="mr-2 h-4 w-4 text-yellow-500" /> Owner Panel
            </DropdownMenuItem>
          </Link>
        )}

        {/* Admin — setup-only dropdown */}
        {isAdmin && (
          <>
            <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold py-1">
              Work Setup
            </DropdownMenuLabel>
            <Link href="/work/templates">
              <DropdownMenuItem className="cursor-pointer flex-col items-start gap-0">
                <div className="flex items-center w-full">
                  <BookTemplate className="mr-2 h-4 w-4 text-emerald-600" />
                  <span className="font-semibold">Item Templates</span>
                </div>
                <span className="text-[10px] text-muted-foreground ml-6">Reusable products with steps & BOM</span>
              </DropdownMenuItem>
            </Link>
            <Link href="/admin/procedures">
              <DropdownMenuItem className="cursor-pointer flex-col items-start gap-0">
                <div className="flex items-center w-full">
                  <Wrench className="mr-2 h-4 w-4 text-indigo-600" />
                  <span className="font-semibold">Procedures</span>
                </div>
                <span className="text-[10px] text-muted-foreground ml-6">Reusable steps for quick jobs</span>
              </DropdownMenuItem>
            </Link>
            <Link href="/admin/roles">
              <DropdownMenuItem className="cursor-pointer flex-col items-start gap-0">
                <div className="flex items-center w-full">
                  <HardHat className="mr-2 h-4 w-4 text-purple-600" />
                  <span className="font-semibold">Roles</span>
                </div>
                <span className="text-[10px] text-muted-foreground ml-6">Who does which step</span>
              </DropdownMenuItem>
            </Link>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold py-1">
              Administration
            </DropdownMenuLabel>
            <Link href="/admin/users">
              <DropdownMenuItem className="cursor-pointer">
                <Users className="mr-2 h-4 w-4" /> Manage Users
              </DropdownMenuItem>
            </Link>
            <Link href="/admin/zones">
              <DropdownMenuItem className="cursor-pointer">
                <MapPin className="mr-2 h-4 w-4" /> Production Zones
              </DropdownMenuItem>
            </Link>
            <Link href="/admin/suppliers">
              <DropdownMenuItem className="cursor-pointer">
                <Building2 className="mr-2 h-4 w-4" /> Suppliers
              </DropdownMenuItem>
            </Link>
            <Link href="/admin/company">
              <DropdownMenuItem className="cursor-pointer">
                <Building2 className="mr-2 h-4 w-4" /> Company & Plan
              </DropdownMenuItem>
            </Link>
            <Link href="/admin/dashboard">
              <DropdownMenuItem className="cursor-pointer">
                <LayoutDashboard className="mr-2 h-4 w-4 text-blue-600" /> Admin Dashboard
              </DropdownMenuItem>
            </Link>
            <Link href="/admin/leave-inbox">
              <DropdownMenuItem className="cursor-pointer">
                <Inbox className="mr-2 h-4 w-4 text-violet-600" /> Leave Inbox
              </DropdownMenuItem>
            </Link>
            <DropdownMenuSeparator />
          </>
        )}

        {/* Supervisor View (admin + supervisors) */}
        {(isAdmin || user.isSupervisor) && (
          <Link href="/supervisor">
            <DropdownMenuItem className="cursor-pointer font-semibold text-indigo-600 focus:text-indigo-600">
              <Eye className="mr-2 h-4 w-4" /> Supervisor View
            </DropdownMenuItem>
          </Link>
        )}

        {/* Attendance — workers & supervisors (admins have it in bottom nav) */}
        {!isAdmin && user.role !== "owner" && (
          <Link href="/attendance">
            <DropdownMenuItem className="cursor-pointer font-semibold text-emerald-600 focus:text-emerald-600">
              <Clock className="mr-2 h-4 w-4" /> Attendance
            </DropdownMenuItem>
          </Link>
        )}

        <DropdownMenuItem
          className="text-destructive focus:text-destructive cursor-pointer"
          onClick={logout}
        >
          <LogOut className="mr-2 h-4 w-4" /> Sign Out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ─── Section Switcher (non-admin supervisors & workers only) ──────────────────

function SectionSwitcher({ isWorkSection }: { isWorkSection: boolean }) {
  const workOrdersEnabled = useFeature("work_orders");
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
          Inventory
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
            Work Orders
          </button>
        </Link>
      )}
    </div>
  );
}

// ─── Admin Bottom Nav ─────────────────────────────────────────────────────────

function AdminBottomNav() {
  const [location] = useLocation();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const { logout } = useAuth();

  const isProjectsActive =
    location.startsWith("/work/projects") ||
    location.startsWith("/tasks") ||
    location.startsWith("/work/inbound") ||
    location.startsWith("/work/reorder") ||
    location.startsWith("/work/purchase-orders") ||
    location.startsWith("/work/templates");
  const isStockActive =
    location === "/" ||
    location.startsWith("/scan") ||
    location.startsWith("/products") ||
    location.startsWith("/locations") ||
    location.startsWith("/location/") ||
    location.startsWith("/history") ||
    location.startsWith("/valuation");
  const isCustomersActive =
    location.startsWith("/customers") ||
    location.startsWith("/quotes") ||
    location.startsWith("/orders");
  const isAttendanceActive = location.startsWith("/attendance");

  const tabs = [
    { key: "projects", href: "/work/projects", icon: FolderKanban, label: "Projects", active: isProjectsActive },
    { key: "stock", href: "/", icon: Package2, label: "Stock", active: isStockActive },
    { key: "customers", href: "/customers", icon: Store, label: "Customers", active: isCustomersActive },
    { key: "attendance", href: "/attendance", icon: CalendarCheck, label: "Attendance", active: isAttendanceActive },
  ];

  return (
    <>
      <div className="fixed bottom-0 left-0 right-0 z-50 bg-secondary border-t border-secondary-border">
        <div className="flex h-16 w-full max-w-md mx-auto">
          {tabs.map((tab) => (
            <Link key={tab.key} href={tab.href} className="flex-1">
              <div className={cn(
                "flex flex-col items-center justify-center h-full space-y-1 transition-colors",
                tab.active ? "text-primary" : "text-secondary-foreground/60 hover:text-secondary-foreground"
              )}>
                <tab.icon className="h-6 w-6" strokeWidth={tab.active ? 2.5 : 2} />
                <span className="text-[10px] font-medium tracking-wide uppercase">{tab.label}</span>
              </div>
            </Link>
          ))}

          {/* Settings tab — opens sheet */}
          <button
            className="flex-1"
            onClick={() => setSettingsOpen(true)}
          >
            <div className={cn(
              "flex flex-col items-center justify-center h-full space-y-1 transition-colors",
              settingsOpen ? "text-primary" : "text-secondary-foreground/60 hover:text-secondary-foreground"
            )}>
              <Settings className="h-6 w-6" strokeWidth={settingsOpen ? 2.5 : 2} />
              <span className="text-[10px] font-medium tracking-wide uppercase">Settings</span>
            </div>
          </button>
        </div>
      </div>

      {/* Settings sheet */}
      <Sheet open={settingsOpen} onOpenChange={setSettingsOpen}>
        <SheetContent side="bottom" className="max-w-md mx-auto rounded-t-2xl pb-8">
          <SheetHeader className="pb-2">
            <SheetTitle className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Settings & Setup</SheetTitle>
          </SheetHeader>

          <div className="space-y-1 mt-2">
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground px-1 py-1">Work Setup</p>
            <Link href="/work/templates" onClick={() => setSettingsOpen(false)}>
              <div className="flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-muted transition-colors cursor-pointer">
                <BookTemplate className="h-5 w-5 text-emerald-600 shrink-0" />
                <div>
                  <p className="text-sm font-semibold">Item Templates</p>
                  <p className="text-xs text-muted-foreground">Reusable products with steps & BOM</p>
                </div>
              </div>
            </Link>
            <Link href="/admin/procedures" onClick={() => setSettingsOpen(false)}>
              <div className="flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-muted transition-colors cursor-pointer">
                <Wrench className="h-5 w-5 text-indigo-600 shrink-0" />
                <div>
                  <p className="text-sm font-semibold">Procedures</p>
                  <p className="text-xs text-muted-foreground">Reusable steps for quick jobs</p>
                </div>
              </div>
            </Link>
            <Link href="/admin/roles" onClick={() => setSettingsOpen(false)}>
              <div className="flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-muted transition-colors cursor-pointer">
                <HardHat className="h-5 w-5 text-purple-600 shrink-0" />
                <div>
                  <p className="text-sm font-semibold">Roles</p>
                  <p className="text-xs text-muted-foreground">Who does which step</p>
                </div>
              </div>
            </Link>

            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground px-1 py-1 pt-3">Administration</p>
            <Link href="/admin/users" onClick={() => setSettingsOpen(false)}>
              <div className="flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-muted transition-colors cursor-pointer">
                <Users className="h-5 w-5 text-muted-foreground shrink-0" />
                <p className="text-sm font-semibold">Manage Users</p>
              </div>
            </Link>
            <Link href="/admin/zones" onClick={() => setSettingsOpen(false)}>
              <div className="flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-muted transition-colors cursor-pointer">
                <MapPin className="h-5 w-5 text-muted-foreground shrink-0" />
                <p className="text-sm font-semibold">Production Zones</p>
              </div>
            </Link>
            <Link href="/admin/suppliers" onClick={() => setSettingsOpen(false)}>
              <div className="flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-muted transition-colors cursor-pointer">
                <Truck className="h-5 w-5 text-muted-foreground shrink-0" />
                <p className="text-sm font-semibold">Suppliers</p>
              </div>
            </Link>
            <Link href="/admin/company" onClick={() => setSettingsOpen(false)}>
              <div className="flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-muted transition-colors cursor-pointer">
                <Building2 className="h-5 w-5 text-muted-foreground shrink-0" />
                <p className="text-sm font-semibold">Company & Plan</p>
              </div>
            </Link>
            <Link href="/admin/dashboard" onClick={() => setSettingsOpen(false)}>
              <div className="flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-muted transition-colors cursor-pointer">
                <LayoutDashboard className="h-5 w-5 text-blue-600 shrink-0" />
                <p className="text-sm font-semibold">Admin Dashboard</p>
              </div>
            </Link>
            <Link href="/admin/leave-inbox" onClick={() => setSettingsOpen(false)}>
              <div className="flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-muted transition-colors cursor-pointer">
                <Inbox className="h-5 w-5 text-violet-600 shrink-0" />
                <div>
                  <p className="text-sm font-semibold">Leave Inbox</p>
                  <p className="text-xs text-muted-foreground">Approve or reject all leave requests</p>
                </div>
              </div>
            </Link>

            <div className="pt-2 border-t border-border mt-2">
              <button
                onClick={() => { setSettingsOpen(false); logout(); }}
                className="flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-destructive/10 transition-colors cursor-pointer w-full text-destructive"
              >
                <LogOut className="h-5 w-5 shrink-0" />
                <p className="text-sm font-semibold">Sign Out</p>
              </button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}

// ─── Supervisor Bottom Nav ────────────────────────────────────────────────────

function SupervisorBottomNav() {
  const [location] = useLocation();

  const navItems = [
    { href: "/tasks", icon: CheckSquare, label: "Tasks" },
    { href: "/work/projects", icon: FolderKanban, label: "Projects" },
    { href: "/work/inbound", icon: PackageCheck, label: "Inbound" },
    { href: "/attendance", icon: CalendarCheck, label: "Attendance" },
    { href: "/supervisor", icon: Eye, label: "Supervisor" },
  ];

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 bg-secondary border-t border-secondary-border">
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
                <span className="text-[10px] font-medium tracking-wide uppercase">{item.label}</span>
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

  const navItems = [
    { href: "/", icon: LayoutDashboard, label: "Dashboard" },
    { href: "/scan", icon: ScanLine, label: "Scan" },
    { href: "/products", icon: Package2, label: "Products" },
    { href: "/history", icon: History, label: "History" },
  ];

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 bg-secondary border-t border-secondary-border">
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
                <span className="text-[10px] font-medium tracking-wide uppercase">{item.label}</span>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

// ─── Work Orders Bottom Nav (non-admin supervisors, non-work-section fallback) ─

function WorkOrdersBottomNav() {
  const [location] = useLocation();

  const navItems = [
    { href: "/tasks", icon: CheckSquare, label: "Tasks" },
    { href: "/work/projects", icon: FolderKanban, label: "Projects" },
    { href: "/work/inbound", icon: PackageCheck, label: "Inbound" },
    { href: "/orders", icon: Truck, label: "Orders" },
  ];

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 bg-secondary border-t border-secondary-border">
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
                <span className="text-[10px] font-medium tracking-wide uppercase">{item.label}</span>
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

  const navItems = [
    { href: "/tasks", icon: CheckSquare, label: "My Tasks" },
    { href: "/work/inbound", icon: PackageCheck, label: "Inbound" },
  ];

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 bg-secondary border-t border-secondary-border">
      <div className="flex h-16 w-full max-w-md mx-auto">
        {navItems.map((item) => {
          const isActive = location.startsWith(item.href);
          return (
            <Link key={item.href} href={item.href} className="flex-1">
              <div className={cn(
                "flex flex-col items-center justify-center h-full space-y-1 transition-colors",
                isActive ? "text-primary" : "text-secondary-foreground/60 hover:text-secondary-foreground"
              )}>
                <item.icon className="h-6 w-6" strokeWidth={isActive ? 2.5 : 2} />
                <span className="text-[10px] font-medium tracking-wide uppercase">{item.label}</span>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

// ─── App Layout ───────────────────────────────────────────────────────────────

export function AppLayout({ children }: { children: React.ReactNode }) {
  const { data: health } = useHealthCheck({ query: { refetchInterval: 60000 } });
  const [location] = useLocation();
  const { user } = useAuth();
  const isHealthy = health?.status === "ok";
  const isOwner = user?.role === "owner";
  const isAdmin = user?.role === "admin";
  const isSupervisor = user?.role === "worker" && !!user?.isSupervisor;
  const isWorker = user?.role === "worker" && !user?.isSupervisor;

  // Section switcher only used by supervisors browsing both inventory + work
  const isWorkSection = location.startsWith("/work") || location.startsWith("/tasks") || location.startsWith("/attendance") || location.startsWith("/orders") || location.startsWith("/supervisor");

  function BottomNav() {
    if (isOwner) return null;
    if (isAdmin) return <AdminBottomNav />;
    if (isSupervisor) return <SupervisorBottomNav />;
    if (isWorker) return <WorkerBottomNav />;
    if (isWorkSection) return <WorkOrdersBottomNav />;
    return <InventoryBottomNav />;
  }

  // Header left side — brand/context indicator
  function HeaderLeft() {
    if (isOwner) {
      return (
        <div className="flex items-center gap-2">
          <Crown className="h-4 w-4 text-yellow-500" />
          <span className="text-xs font-bold uppercase tracking-wider text-yellow-600">Owner Panel</span>
        </div>
      );
    }
    if (isAdmin) {
      return (
        <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-primary/10 border border-primary/20 text-[11px] font-bold uppercase tracking-wider text-primary">
          <ShieldCheck className="h-3.5 w-3.5" />
          Admin
        </div>
      );
    }
    if (isSupervisor) {
      return (
        <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-indigo-500/10 border border-indigo-300/30 text-[11px] font-bold uppercase tracking-wider text-indigo-600">
          <Eye className="h-3.5 w-3.5" />
          Supervisor
        </div>
      );
    }
    if (isWorker) {
      return (
        <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-muted/60 border text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
          <CheckSquare className="h-3.5 w-3.5" />
          My Tasks
        </div>
      );
    }
    // Fallback: section switcher for any other role combo
    return <SectionSwitcher isWorkSection={isWorkSection} />;
  }

  return (
    <div className={cn("min-h-[100dvh] bg-background", !isOwner && "pb-16")}>
      <main className="w-full max-w-md mx-auto bg-background min-h-[100dvh] border-x border-border/50 relative">
        {/* Top bar */}
        <div className="sticky top-0 z-40 bg-background/95 backdrop-blur-sm border-b border-border/40">
          <div className="flex items-center justify-between px-3 py-2 gap-2">
            <HeaderLeft />
            <div className="flex items-center gap-1.5">
              <UserMenu />
              <div className={cn(
                "flex items-center gap-1 px-1.5 py-0.5 rounded-full border text-[9px] font-bold uppercase tracking-wider",
                isHealthy ? "border-green-500/20 text-green-600" : "border-red-500/20 text-red-600"
              )}>
                <div className={cn("h-1.5 w-1.5 rounded-full", isHealthy ? "bg-green-500 animate-pulse" : "bg-red-500")} />
                {isHealthy ? "On" : "Off"}
              </div>
            </div>
          </div>
        </div>

        {children}
      </main>

      <BottomNav />
    </div>
  );
}
