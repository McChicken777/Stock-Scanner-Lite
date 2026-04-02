import { Link, useLocation } from "wouter";
import {
  LayoutDashboard, ScanLine, Package2, History, ShieldCheck,
  HardHat, LogOut, FolderKanban, Tag, Boxes, Building2, Crown, PackageCheck, CheckSquare, Truck
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

function UserMenu() {
  const { user, logout } = useAuth();
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
              <Crown className="mr-2 h-4 w-4 text-yellow-500" /> Owner Panel
            </DropdownMenuItem>
          </Link>
        )}
        {user.role === "admin" && (
          <>
            <Link href="/admin/dashboard">
              <DropdownMenuItem className="cursor-pointer font-semibold text-blue-600 focus:text-blue-600">
                <LayoutDashboard className="mr-2 h-4 w-4" /> Admin Dashboard
              </DropdownMenuItem>
            </Link>
            <Link href="/admin/users">
              <DropdownMenuItem className="cursor-pointer">
                <ShieldCheck className="mr-2 h-4 w-4" /> Manage Users
              </DropdownMenuItem>
            </Link>
            <Link href="/admin/company">
              <DropdownMenuItem className="cursor-pointer">
                <Building2 className="mr-2 h-4 w-4" /> Company & Plan
              </DropdownMenuItem>
            </Link>
            <Link href="/admin/suppliers">
              <DropdownMenuItem className="cursor-pointer">
                <Building2 className="mr-2 h-4 w-4" /> Suppliers
              </DropdownMenuItem>
            </Link>
          </>
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
          <Boxes className="h-3.5 w-3.5" />
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

function WorkOrdersBottomNav() {
  const [location] = useLocation();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  const navItems = [
    { href: "/tasks", icon: CheckSquare, label: "Tasks" },
    { href: "/work/projects", icon: FolderKanban, label: "Projects" },
    { href: "/work/inbound", icon: PackageCheck, label: "Inbound" },
    ...(isAdmin ? [{ href: "/orders", icon: Truck, label: "Orders" }] : []),
    ...(isAdmin ? [{ href: "/work/templates", icon: Tag, label: "Templates" }] : []),
  ];

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 bg-secondary border-t border-secondary-border">
      <div className="flex h-16 w-full max-w-md mx-auto">
        {navItems.map((item) => {
          const realActive = item.href === "/work/projects"
            ? (location.startsWith("/work/projects") || location === "/work/projects") && !location.startsWith("/work/projects/new") || location === "/work/projects"
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

export function AppLayout({ children }: { children: React.ReactNode }) {
  const { data: health } = useHealthCheck({ query: { refetchInterval: 60000 } });
  const [location] = useLocation();
  const { user } = useAuth();
  const isHealthy = health?.status === "ok";
  const isWorkSection = location.startsWith("/work");
  const isOwner = user?.role === "owner";

  return (
    <div className={cn("min-h-[100dvh] bg-background", !isOwner && "pb-16")}>
      <main className="w-full max-w-md mx-auto bg-background min-h-[100dvh] border-x border-border/50 relative">
        {/* Top bar */}
        <div className="sticky top-0 z-40 bg-background/95 backdrop-blur-sm border-b border-border/40">
          <div className="flex items-center justify-between px-3 py-2 gap-2">
            {isOwner ? (
              <div className="flex items-center gap-2">
                <Crown className="h-4 w-4 text-yellow-500" />
                <span className="text-xs font-bold uppercase tracking-wider text-yellow-600">Owner Panel</span>
              </div>
            ) : (
              <SectionSwitcher isWorkSection={isWorkSection} />
            )}
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

      {!isOwner && (isWorkSection ? <WorkOrdersBottomNav /> : <InventoryBottomNav />)}
    </div>
  );
}
