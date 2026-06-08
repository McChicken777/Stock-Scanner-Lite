import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import {
  LayoutDashboard, ScanLine, Package2, History, ShieldCheck,
  HardHat, LogOut, FolderKanban, Building2, Crown, PackageCheck,
  CheckSquare, Truck, Eye, MapPin, Clock,
  BookTemplate, Wrench, Users, Settings, Store, CalendarCheck, Inbox, Palette, Scissors,
  BarChart2, ShoppingCart, FileText, PackageOpen, Layers, HelpCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useHealthCheck, getHealthCheckQueryKey } from "@workspace/api-client-react";
import { useAuth, useFeature } from "@/contexts/auth";
import { TutorialProvider, useTutorial } from "@/contexts/tutorial";
import { TutorialModal } from "@/components/tutorial-modal";
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

        {user.role === "owner" && (
          <Link href="/owner">
            <DropdownMenuItem className="cursor-pointer font-semibold text-yellow-600 focus:text-yellow-600">
              <Crown className="mr-2 h-4 w-4 text-yellow-500" /> Owner Panel
            </DropdownMenuItem>
          </Link>
        )}

        {/* Attendance — workers only (admins have it in sidebar/bottom nav) */}
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

// ─── Shared sidebar nav item ───────────────────────────────────────────────────

function SideNavItem({
  href, icon: Icon, label, active, badge = 0,
}: {
  href: string; icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  label: string; active: boolean; badge?: number;
}) {
  return (
    <Link href={href}>
      <div className={cn(
        "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-semibold transition-colors cursor-pointer",
        active
          ? "bg-primary/10 text-primary"
          : "text-muted-foreground hover:text-foreground hover:bg-muted"
      )}>
        <Icon className="h-[18px] w-[18px] flex-shrink-0" strokeWidth={active ? 2.5 : 2} />
        <span className="flex-1 truncate">{label}</span>
        {badge > 0 && (
          <span className="bg-red-500 text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] px-1 flex items-center justify-center leading-none flex-shrink-0">
            {badge > 99 ? "99+" : badge}
          </span>
        )}
      </div>
    </Link>
  );
}

function SidebarSection({ label }: { label: string }) {
  return (
    <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground px-3 pt-4 pb-1">
      {label}
    </p>
  );
}

// ─── Admin Desktop Sidebar ────────────────────────────────────────────────────

interface AttentionCounts { total: number; leaveRequests: number; lowStock: number; overdueJobs: number; }

function AdminDesktopSidebar() {
  const [location] = useLocation();
  const { logout, user } = useAuth();

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
    <aside className="hidden lg:flex flex-col w-64 fixed inset-y-0 left-0 z-30 bg-background border-r border-border">
      {/* Brand */}
      <div className="flex items-center gap-2.5 h-14 px-4 border-b border-border flex-shrink-0">
        <div className="h-7 w-7 rounded-lg bg-primary flex items-center justify-center flex-shrink-0">
          <ScanLine className="h-4 w-4 text-primary-foreground" />
        </div>
        <span className="font-bold text-base">Stock Scanner</span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-2 px-2 space-y-0.5">
        <SidebarSection label="Main" />
        <SideNavItem href="/work/projects" icon={FolderKanban} label="Jobs" active={isJobsActive} badge={attention?.overdueJobs ?? 0} />
        <SideNavItem href="/customers" icon={Store} label="Customers" active={isCustomersActive} />
        <SideNavItem href="/work/purchase-orders" icon={ShoppingCart} label="Purchasing" active={isPurchasingActive} />

        <SidebarSection label="Work" />
        <SideNavItem href="/work/templates" icon={BookTemplate} label="Job Templates" active={location.startsWith("/work/templates") || location.startsWith("/work/template-outline")} />
        <SideNavItem href="/work/materials" icon={PackageOpen} label="Materials" active={location.startsWith("/work/materials")} />
        <SideNavItem href="/admin/stations" icon={Layers} label="Production Flow" active={location.startsWith("/admin/stations")} />
        <SideNavItem href="/work/queues" icon={CheckSquare} label="Station Queues" active={location.startsWith("/work/queue")} />
        {user?.plan === "pro" && (
          <SideNavItem href="/analytics" icon={BarChart2} label="AI Analytics" active={location.startsWith("/analytics")} />
        )}

        <SidebarSection label="People" />
        <SideNavItem href="/admin/users" icon={Users} label="Manage Users" active={location.startsWith("/admin/users")} />
        <SideNavItem href="/attendance" icon={CalendarCheck} label="Attendance" active={location.startsWith("/attendance")} />
        <SideNavItem href="/admin/leave-inbox" icon={Inbox} label="Leave Requests" active={location.startsWith("/admin/leave-inbox")} badge={attention?.leaveRequests ?? 0} />

        <SidebarSection label="Business" />
        <SideNavItem href="/products" icon={Package2} label="Products & Stock" active={location.startsWith("/products")} badge={attention?.lowStock ?? 0} />
        <SideNavItem href="/admin/suppliers" icon={Truck} label="Suppliers" active={location.startsWith("/admin/suppliers")} />
        <SideNavItem href="/admin/company" icon={Building2} label="Company & Plan" active={location.startsWith("/admin/company")} />
      </nav>

      {/* Sign out */}
      <div className="flex-shrink-0 border-t border-border p-2">
        <button
          onClick={logout}
          className="flex w-full items-center gap-3 px-3 py-2 rounded-lg text-sm font-semibold text-destructive hover:bg-destructive/10 transition-colors"
        >
          <LogOut className="h-[18px] w-[18px] flex-shrink-0" />
          Sign Out
        </button>
      </div>
    </aside>
  );
}

// ─── Supervisor Desktop Sidebar ───────────────────────────────────────────────

function SupervisorDesktopSidebar() {
  const [location] = useLocation();
  const { logout } = useAuth();

  return (
    <aside className="hidden lg:flex flex-col w-64 fixed inset-y-0 left-0 z-30 bg-background border-r border-border">
      <div className="flex items-center gap-2.5 h-14 px-4 border-b border-border flex-shrink-0">
        <div className="h-7 w-7 rounded-lg bg-primary flex items-center justify-center flex-shrink-0">
          <ScanLine className="h-4 w-4 text-primary-foreground" />
        </div>
        <span className="font-bold text-base">Stock Scanner</span>
      </div>
      <nav className="flex-1 overflow-y-auto py-2 px-2 space-y-0.5">
        <SidebarSection label="Navigation" />
        <SideNavItem href="/tasks" icon={CheckSquare} label="Tasks" active={location.startsWith("/tasks")} />
        <SideNavItem href="/work/projects" icon={FolderKanban} label="Projects" active={location.startsWith("/work/projects")} />
        <SideNavItem href="/work/inbound" icon={PackageCheck} label="Inbound" active={location.startsWith("/work/inbound")} />
        <SideNavItem href="/work/queues" icon={Layers} label="Station Queues" active={location.startsWith("/work/queue")} />
        <SideNavItem href="/attendance" icon={CalendarCheck} label="Attendance" active={location.startsWith("/attendance")} />
        <SideNavItem href="/supervisor" icon={Eye} label="Supervisor View" active={location.startsWith("/supervisor")} />
      </nav>
      <div className="flex-shrink-0 border-t border-border p-2">
        <button onClick={logout} className="flex w-full items-center gap-3 px-3 py-2 rounded-lg text-sm font-semibold text-destructive hover:bg-destructive/10 transition-colors">
          <LogOut className="h-[18px] w-[18px] flex-shrink-0" /> Sign Out
        </button>
      </div>
    </aside>
  );
}

// ─── Worker Desktop Sidebar ───────────────────────────────────────────────────

interface WorkerNotifications { total: number; autoClosed: number; leaveDecisions: number; }

function WorkerDesktopSidebar() {
  const [location] = useLocation();
  const { logout } = useAuth();

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
    <aside className="hidden lg:flex flex-col w-64 fixed inset-y-0 left-0 z-30 bg-background border-r border-border">
      <div className="flex items-center gap-2.5 h-14 px-4 border-b border-border flex-shrink-0">
        <div className="h-7 w-7 rounded-lg bg-primary flex items-center justify-center flex-shrink-0">
          <ScanLine className="h-4 w-4 text-primary-foreground" />
        </div>
        <span className="font-bold text-base">Stock Scanner</span>
      </div>
      <nav className="flex-1 overflow-y-auto py-2 px-2 space-y-0.5">
        <SidebarSection label="Navigation" />
        <SideNavItem href="/tasks" icon={CheckSquare} label="My Tasks" active={location.startsWith("/tasks")} />
        <SideNavItem href="/work/inbound" icon={PackageCheck} label="Inbound" active={location.startsWith("/work/inbound")} />
        <SideNavItem href="/work/queues" icon={Layers} label="Station Queues" active={location.startsWith("/work/queue")} />
        <SideNavItem href="/attendance" icon={CalendarCheck} label="Attendance" active={location.startsWith("/attendance")} badge={workerNotifs?.total ?? 0} />
        {painterData?.isPainter && (
          <SideNavItem href="/work/paint-queue" icon={Palette} label="Paint Shop" active={location.startsWith("/work/paint-queue")} />
        )}
      </nav>
      <div className="flex-shrink-0 border-t border-border p-2">
        <button onClick={logout} className="flex w-full items-center gap-3 px-3 py-2 rounded-lg text-sm font-semibold text-destructive hover:bg-destructive/10 transition-colors">
          <LogOut className="h-[18px] w-[18px] flex-shrink-0" /> Sign Out
        </button>
      </div>
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
    location.startsWith("/quotes") ||
    location.startsWith("/orders");
  const isPurchasingActive =
    location.startsWith("/work/reorder") ||
    location.startsWith("/work/purchase-orders");

  const tabs = [
    { key: "jobs", href: "/work/projects", icon: FolderKanban, label: "Jobs", active: isJobsActive },
    { key: "customers", href: "/customers", icon: Store, label: "Customers", active: isCustomersActive },
    { key: "purchasing", href: "/work/purchase-orders", icon: ShoppingCart, label: "Purchasing", active: isPurchasingActive },
  ];

  return (
    <>
      <div className="lg:hidden fixed bottom-0 left-0 right-0 z-50 bg-secondary border-t border-secondary-border">
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
              <span className="text-[10px] font-medium tracking-wide uppercase">Settings</span>
            </div>
          </button>
        </div>
      </div>

      <Sheet open={settingsOpen} onOpenChange={setSettingsOpen}>
        <SheetContent side="bottom" className="max-w-md mx-auto rounded-t-2xl pb-0 max-h-[85dvh] flex flex-col">
          <SheetHeader className="pb-2 flex-shrink-0">
            <SheetTitle className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Settings</SheetTitle>
          </SheetHeader>

          <div className="space-y-1 mt-2 overflow-y-auto flex-1 pb-8 overscroll-contain">
            {/* Work section */}
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground px-1 py-1">Work</p>
            <Link href="/work/templates" onClick={() => setSettingsOpen(false)}>
              <div className="flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-muted transition-colors cursor-pointer">
                <BookTemplate className="h-5 w-5 text-emerald-600 shrink-0" />
                <div>
                  <p className="text-sm font-semibold">Job Templates</p>
                  <p className="text-xs text-muted-foreground">Define steps & parts for each job type</p>
                </div>
              </div>
            </Link>
            <Link href="/work/materials" onClick={() => setSettingsOpen(false)}>
              <div className="flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-muted transition-colors cursor-pointer">
                <PackageOpen className="h-5 w-5 text-amber-600 shrink-0" />
                <div>
                  <p className="text-sm font-semibold">Materials</p>
                  <p className="text-xs text-muted-foreground">Raw materials & purchased parts — import via Excel</p>
                </div>
              </div>
            </Link>
            <Link href="/admin/stations" onClick={() => setSettingsOpen(false)}>
              <div className="flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-muted transition-colors cursor-pointer">
                <Layers className="h-5 w-5 text-indigo-600 shrink-0" />
                <div>
                  <p className="text-sm font-semibold">Production Flow</p>
                  <p className="text-xs text-muted-foreground">Station types & workstations (machines)</p>
                </div>
              </div>
            </Link>
            <Link href="/work/queues" onClick={() => setSettingsOpen(false)}>
              <div className="flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-muted transition-colors cursor-pointer">
                <CheckSquare className="h-5 w-5 text-teal-600 shrink-0" />
                <div>
                  <p className="text-sm font-semibold">Station Queues</p>
                  <p className="text-xs text-muted-foreground">Live work queue per station type</p>
                </div>
              </div>
            </Link>
            {user?.plan === "pro" && (
              <Link href="/analytics" onClick={() => setSettingsOpen(false)}>
                <div className="flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-muted transition-colors cursor-pointer">
                  <BarChart2 className="h-5 w-5 text-violet-600 shrink-0" />
                  <div>
                    <p className="text-sm font-semibold">AI Analytics</p>
                    <p className="text-xs text-muted-foreground">Production insights & trends</p>
                  </div>
                </div>
              </Link>
            )}

            {/* People section */}
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground px-1 py-1 pt-3">People</p>
            <Link href="/admin/users" onClick={() => setSettingsOpen(false)}>
              <div className="flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-muted transition-colors cursor-pointer">
                <Users className="h-5 w-5 text-muted-foreground shrink-0" />
                <div>
                  <p className="text-sm font-semibold">Manage Users</p>
                  <p className="text-xs text-muted-foreground">Add workers, set roles & permissions</p>
                </div>
              </div>
            </Link>
            <Link href="/attendance" onClick={() => setSettingsOpen(false)}>
              <div className="flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-muted transition-colors cursor-pointer">
                <CalendarCheck className="h-5 w-5 text-muted-foreground shrink-0" />
                <div>
                  <p className="text-sm font-semibold">Attendance</p>
                  <p className="text-xs text-muted-foreground">Check-ins, timesheets & reports</p>
                </div>
              </div>
            </Link>
            <Link href="/admin/leave-inbox" onClick={() => setSettingsOpen(false)}>
              <div className="flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-muted transition-colors cursor-pointer">
                <Inbox className="h-5 w-5 text-violet-600 shrink-0" />
                <div className="flex-1">
                  <p className="text-sm font-semibold">Leave Requests</p>
                  <p className="text-xs text-muted-foreground">Approve or reject time-off requests</p>
                </div>
                <AttentionBadge count={attention?.leaveRequests ?? 0} />
              </div>
            </Link>

            {/* Business section */}
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground px-1 py-1 pt-3">Business</p>
            <Link href="/products" onClick={() => setSettingsOpen(false)}>
              <div className="flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-muted transition-colors cursor-pointer">
                <Package2 className="h-5 w-5 text-muted-foreground shrink-0" />
                <div className="flex-1">
                  <p className="text-sm font-semibold">Products & Stock</p>
                  <p className="text-xs text-muted-foreground">Manage your product catalogue</p>
                </div>
                <AttentionBadge count={attention?.lowStock ?? 0} />
              </div>
            </Link>
            <Link href="/admin/suppliers" onClick={() => setSettingsOpen(false)}>
              <div className="flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-muted transition-colors cursor-pointer">
                <Truck className="h-5 w-5 text-muted-foreground shrink-0" />
                <div>
                  <p className="text-sm font-semibold">Suppliers</p>
                  <p className="text-xs text-muted-foreground">Manage your supplier list</p>
                </div>
              </div>
            </Link>
            <Link href="/admin/company" onClick={() => setSettingsOpen(false)}>
              <div className="flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-muted transition-colors cursor-pointer">
                <Building2 className="h-5 w-5 text-muted-foreground shrink-0" />
                <div>
                  <p className="text-sm font-semibold">Company & Plan</p>
                  <p className="text-xs text-muted-foreground">Company details & subscription</p>
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
    <div className="lg:hidden fixed bottom-0 left-0 right-0 z-50 bg-secondary border-t border-secondary-border">
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
    <div className="lg:hidden fixed bottom-0 left-0 right-0 z-50 bg-secondary border-t border-secondary-border">
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

// ─── Work Orders Bottom Nav ───────────────────────────────────────────────────

function WorkOrdersBottomNav() {
  const [location] = useLocation();

  const navItems = [
    { href: "/tasks", icon: CheckSquare, label: "Tasks" },
    { href: "/work/projects", icon: FolderKanban, label: "Projects" },
    { href: "/work/inbound", icon: PackageCheck, label: "Inbound" },
    { href: "/orders", icon: Truck, label: "Orders" },
  ];

  return (
    <div className="lg:hidden fixed bottom-0 left-0 right-0 z-50 bg-secondary border-t border-secondary-border">
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
    staleTime: 30_000,
    refetchInterval: 30_000,
  });

  const attendanceBadge = workerNotifs?.total ?? 0;
  const queueBadge = queueCount?.pending ?? 0;

  const navItems = [
    { href: "/tasks", icon: CheckSquare, label: "My Tasks", badge: 0 },
    { href: "/work/queues", icon: Layers, label: "Queues", badge: queueBadge },
    { href: "/attendance", icon: CalendarCheck, label: "Attendance", badge: attendanceBadge },
    ...(painterData?.isPainter ? [{ href: "/work/paint-queue", icon: Palette, label: "Paint", badge: 0 }] : []),
  ];

  return (
    <div className="lg:hidden fixed bottom-0 left-0 right-0 z-50 bg-secondary border-t border-secondary-border">
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
                <span className="text-[10px] font-medium tracking-wide uppercase">{item.label}</span>
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

// ─── App Layout ───────────────────────────────────────────────────────────────

export function AppLayout({ children }: { children: React.ReactNode }) {
  const { data: health } = useHealthCheck({ query: { queryKey: getHealthCheckQueryKey(), refetchInterval: 60000 } });
  const [location] = useLocation();
  const { user } = useAuth();
  const isHealthy = health?.status === "ok";
  const isOwner = user?.role === "owner";
  const isAdmin = user?.role === "admin";
  const isSupervisor = user?.role === "worker" && !!user?.isSupervisor;
  const isWorker = user?.role === "worker" && !user?.isSupervisor;

  const isWorkSection = location.startsWith("/work") || location.startsWith("/tasks") || location.startsWith("/attendance") || location.startsWith("/orders") || location.startsWith("/supervisor");
  const hasSidebar = !isOwner && (isAdmin || isSupervisor || isWorker);

  function BottomNav() {
    if (isOwner) return null;
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
          <span className="text-xs font-bold uppercase tracking-wider text-yellow-600">Owner Panel</span>
        </div>
      );
    }
    if (isAdmin) {
      return (
        <div className="flex items-center gap-2">
          <div className="h-6 w-6 rounded-md bg-primary flex items-center justify-center lg:hidden">
            <ScanLine className="h-3.5 w-3.5 text-primary-foreground" />
          </div>
          <span className="font-bold text-sm">Stock Scanner</span>
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
    return <SectionSwitcher isWorkSection={isWorkSection} />;
  }

  return (
    <TutorialProvider>
    <TutorialModal />
    <div className="min-h-[100dvh] bg-background">
      {/* Desktop sidebars — hidden on mobile via lg:flex inside each component */}
      {isAdmin && <AdminDesktopSidebar />}
      {isSupervisor && <SupervisorDesktopSidebar />}
      {isWorker && <WorkerDesktopSidebar />}

      {/* Main content area */}
      <div className={cn(
        "min-h-[100dvh]",
        hasSidebar && "lg:ml-64",
        !isOwner && "pb-16 lg:pb-0",
      )}>
        <main className="w-full max-w-md mx-auto lg:max-w-none bg-background border-x border-border/50 lg:border-x-0 relative">
          {/* Top bar */}
          <div className="sticky top-0 z-40 bg-background/95 backdrop-blur-sm border-b border-border/40">
            <div className="flex items-center justify-between px-3 py-2 gap-2">
              <HeaderLeft />
              <div className="flex items-center gap-1.5">
                <TutorialHelpButton />
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
      </div>

      <BottomNav />
    </div>
    </TutorialProvider>
  );
}
