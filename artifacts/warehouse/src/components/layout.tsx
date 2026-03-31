import { Link, useLocation } from "wouter";
import { LayoutDashboard, ScanLine, Package2, History, MapPin, Activity } from "lucide-react";
import { cn } from "@/lib/utils";
import { useHealthCheck } from "@workspace/api-client-react";

export function BottomNav() {
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
        {/* Floating Scan Button */}
        <Link href="/scan" className="absolute left-1/2 -top-6 -translate-x-1/2 group">
          <div className={cn(
            "h-14 w-14 rounded-full flex items-center justify-center border-4 border-background shadow-lg transition-transform group-active:scale-95",
            location === "/scan" ? "bg-primary text-primary-foreground" : "bg-primary text-primary-foreground"
          )}>
            <ScanLine className="h-6 w-6" strokeWidth={2.5} />
          </div>
        </Link>
        
        {navItems.map((item) => {
          if (item.href === "/scan") {
            // Placeholder for the scan button space
            return <div key={item.href} className="flex-1 pointer-events-none" />;
          }

          const isActive = location === item.href || (item.href !== "/" && location.startsWith(item.href));
          return (
            <Link key={item.href} href={item.href} className="flex-1">
              <div
                className={cn(
                  "flex flex-col items-center justify-center h-full space-y-1 transition-colors",
                  isActive ? "text-primary" : "text-secondary-foreground/60 hover:text-secondary-foreground"
                )}
              >
                <item.icon className="h-6 w-6" strokeWidth={isActive ? 2.5 : 2} />
                <span className="text-[10px] font-medium tracking-wide uppercase">
                  {item.label}
                </span>
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
  const isHealthy = health?.status === "ok";

  return (
    <div className="min-h-[100dvh] bg-background pb-16">
      <main className="w-full max-w-md mx-auto bg-background min-h-[100dvh] border-x border-border/50 relative">
        {/* Connection status indicator */}
        <div className="absolute top-2 right-2 z-50 pointer-events-none">
          <div className={cn(
            "flex items-center gap-1.5 px-2 py-1 rounded-full bg-background/80 backdrop-blur-sm border shadow-sm text-[10px] font-bold uppercase tracking-wider",
            isHealthy ? "border-green-500/20 text-green-600" : "border-red-500/20 text-red-600"
          )}>
            <div className={cn("h-2 w-2 rounded-full", isHealthy ? "bg-green-500 animate-pulse" : "bg-red-500")} />
            {isHealthy ? "Online" : "Offline"}
          </div>
        </div>
        {children}
      </main>
      <BottomNav />
    </div>
  );
}
