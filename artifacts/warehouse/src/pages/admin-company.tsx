import { useState, useEffect } from "react";
import { Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/auth";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Building2, Loader2, Check, Users, Wrench, BookTemplate, Calendar, Globe, Plus, Trash2, Download } from "lucide-react";
import { cn } from "@/lib/utils";

interface Company {
  id: number;
  name: string;
  plan: "basic" | "pro";
  workHoursPerDay: number;
  weekendOvertimeEnabled: boolean;
  country: string | null;
  features: {
    inventory: boolean;
    alerts: boolean;
    work_orders: boolean;
    progress_tracking: boolean;
    deadline_alerts: boolean;
    time_tracking: boolean;
  };
}

interface Holiday {
  id: number;
  date: string;
  label: string;
}

const FEATURE_LABELS: Record<string, { label: string; description: string }> = {
  inventory: { label: "Inventory Management", description: "Stock tracking, QR scanning, locations" },
  alerts: { label: "Low Stock Alerts", description: "Email notifications when stock is low" },
  work_orders: { label: "Work Orders", description: "Production tracking and work order management" },
  progress_tracking: { label: "Progress Tracking", description: "Visual progress bars per item and project" },
  deadline_alerts: { label: "Deadline Alerts", description: "Urgency indicators for approaching deadlines" },
  time_tracking: { label: "Time Tracking", description: "Start/stop timers per procedure" },
};

const COUNTRIES = [
  { code: "US", label: "United States" },
  { code: "GB", label: "United Kingdom" },
  { code: "DE", label: "Germany" },
  { code: "FR", label: "France" },
  { code: "ES", label: "Spain" },
  { code: "PT", label: "Portugal" },
  { code: "NL", label: "Netherlands" },
  { code: "IT", label: "Italy" },
  { code: "BR", label: "Brazil" },
  { code: "AU", label: "Australia" },
];

async function fetchCompany(): Promise<Company> {
  const res = await fetch("/api/company", { credentials: "include" });
  if (!res.ok) throw new Error("Failed to load company");
  return res.json();
}

async function fetchHolidays(): Promise<Holiday[]> {
  const res = await fetch("/api/settings/holidays", { credentials: "include" });
  if (!res.ok) throw new Error("Failed to load holidays");
  return res.json();
}

function fmtDate(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString([], { weekday: "short", month: "short", day: "numeric", year: "numeric" });
}

export default function AdminCompanyPage() {
  const { user, refreshUser } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [companyName, setCompanyName] = useState("");
  const [editingName, setEditingName] = useState(false);
  const [workHours, setWorkHours] = useState("8");
  const [newHolidayDate, setNewHolidayDate] = useState("");
  const [newHolidayLabel, setNewHolidayLabel] = useState("");
  const [selectedCountry, setSelectedCountry] = useState("");
  const [importYear] = useState(new Date().getFullYear());

  const { data: company, isLoading } = useQuery({
    queryKey: ["/api/company"],
    queryFn: fetchCompany,
  });

  const { data: holidays = [] } = useQuery({
    queryKey: ["/api/settings/holidays"],
    queryFn: fetchHolidays,
  });

  useEffect(() => {
    if (company && !editingName) setCompanyName(company.name);
    if (company) setWorkHours(String((company.workHoursPerDay ?? 480) / 60));
    if (company?.country) setSelectedCountry(company.country);
  }, [company?.name, company?.workHoursPerDay, company?.country]);

  const updateHoursMutation = useMutation({
    mutationFn: async (hours: number) => {
      const res = await fetch("/api/company", {
        method: "PUT", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workHoursPerDay: Math.round(hours * 60) }),
      });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/company"] });
      toast({ title: "Work hours updated!" });
    },
    onError: () => toast({ title: "Failed to update work hours", variant: "destructive" }),
  });

  const updatePlanMutation = useMutation({
    mutationFn: async (plan: "basic" | "pro") => {
      const res = await fetch("/api/company", {
        method: "PUT", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan }),
      });
      if (!res.ok) throw new Error("Failed to update plan");
      return res.json();
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/company"] });
      await refreshUser();
      toast({ title: "Plan updated!" });
    },
    onError: () => toast({ title: "Failed to update plan", variant: "destructive" }),
  });

  const updateNameMutation = useMutation({
    mutationFn: async (name: string) => {
      const res = await fetch("/api/company", {
        method: "PUT", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) throw new Error("Failed to update");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/company"] });
      setEditingName(false);
      toast({ title: "Company name updated!" });
    },
    onError: () => toast({ title: "Failed to update", variant: "destructive" }),
  });

  const toggleFeatureMutation = useMutation({
    mutationFn: async ({ feature, enabled }: { feature: string; enabled: boolean }) => {
      const res = await fetch("/api/company/features", {
        method: "PUT", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [feature]: enabled }),
      });
      if (!res.ok) throw new Error("Failed to update feature");
      return res.json();
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/company"] });
      await refreshUser();
    },
    onError: () => toast({ title: "Failed to toggle feature", variant: "destructive" }),
  });

  const updateSchedulingMutation = useMutation({
    mutationFn: async (data: { weekendOvertimeEnabled?: boolean; country?: string | null }) => {
      const res = await fetch("/api/settings/company/scheduling", {
        method: "PUT", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/company"] });
      toast({ title: "Scheduling settings saved" });
    },
    onError: () => toast({ title: "Failed to save scheduling settings", variant: "destructive" }),
  });

  const addHolidayMutation = useMutation({
    mutationFn: async ({ date, label }: { date: string; label: string }) => {
      const res = await fetch("/api/settings/holidays", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date, label }),
      });
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || "Failed"); }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings/holidays"] });
      setNewHolidayDate(""); setNewHolidayLabel("");
      toast({ title: "Holiday added" });
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const deleteHolidayMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/settings/holidays/${id}`, { method: "DELETE", credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/settings/holidays"] }),
    onError: () => toast({ title: "Failed to delete holiday", variant: "destructive" }),
  });

  const importHolidaysMutation = useMutation({
    mutationFn: async (country: string) => {
      const presetsRes = await fetch(`/api/settings/holidays/presets?country=${country}`, { credentials: "include" });
      if (!presetsRes.ok) throw new Error("Failed to load presets");
      const presets = await presetsRes.json();
      if (presets.length === 0) throw new Error("No holidays found for this country");
      const res = await fetch("/api/settings/holidays/bulk", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ holidays: presets, year: importYear }),
      });
      if (!res.ok) throw new Error("Failed to import holidays");
      return res.json();
    },
    onSuccess: (data: { inserted: number }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings/holidays"] });
      toast({ title: `Imported ${data.inserted} public holidays for ${importYear}` });
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  if (user?.role !== "admin") {
    return <div className="p-6 text-center text-muted-foreground mt-20"><p>Admin only</p></div>;
  }

  if (isLoading) {
    return <div className="flex justify-center items-center py-20"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;
  }

  if (!company) return null;

  const sortedHolidays = [...holidays].sort((a, b) => a.date.localeCompare(b.date));

  return (
    <div className="flex flex-col min-h-full">
      <div className="bg-secondary text-secondary-foreground p-4 sticky top-0 z-20 shadow-sm flex items-center gap-3">
        <Link href="/" className="p-2 -ml-2 rounded-full hover:bg-secondary-foreground/10 transition-colors">
          <ArrowLeft className="h-6 w-6" />
        </Link>
        <Building2 className="h-5 w-5" />
        <h1 className="text-xl font-bold">Company Settings</h1>
      </div>

      <div className="p-4 space-y-6 pb-24">
        {/* Company Name */}
        <div className="bg-card border-2 border-border rounded-xl p-4 space-y-3">
          <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Company Name</p>
          {editingName ? (
            <div className="flex gap-2">
              <Input
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                className="h-10 flex-1 border-2"
                autoFocus
              />
              <Button
                size="sm"
                onClick={() => updateNameMutation.mutate(companyName)}
                disabled={updateNameMutation.isPending || !companyName.trim()}
                className="h-10"
              >
                {updateNameMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              </Button>
              <Button variant="outline" size="sm" onClick={() => { setEditingName(false); setCompanyName(company.name); }} className="h-10">
                Cancel
              </Button>
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <p className="text-lg font-bold">{company.name}</p>
              <Button variant="outline" size="sm" onClick={() => { setEditingName(true); setCompanyName(company.name); }}>
                Edit
              </Button>
            </div>
          )}
        </div>

        {/* Quick Links for Task Management */}
        <div className="bg-card border-2 border-border rounded-xl p-4 space-y-3">
          <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Task Management</p>
          <div className="grid grid-cols-2 gap-3">
            <Link href="/admin/roles" className="block">
              <button className="w-full p-4 rounded-lg border-2 border-border hover:border-blue-400 hover:bg-blue-50/50 transition-all text-left">
                <Users className="h-5 w-5 text-blue-600 mb-1" />
                <p className="font-bold text-sm">Roles</p>
                <p className="text-xs text-muted-foreground">Create production roles</p>
              </button>
            </Link>
            <Link href="/admin/procedures" className="block">
              <button className="w-full p-4 rounded-lg border-2 border-border hover:border-purple-400 hover:bg-purple-50/50 transition-all text-left">
                <Wrench className="h-5 w-5 text-purple-600 mb-1" />
                <p className="font-bold text-sm">Procedures</p>
                <p className="text-xs text-muted-foreground">Reusable steps for quick jobs</p>
              </button>
            </Link>
            <Link href="/work/templates" className="block col-span-2">
              <button className="w-full p-4 rounded-lg border-2 border-border hover:border-emerald-400 hover:bg-emerald-50/50 transition-all text-left">
                <BookTemplate className="h-5 w-5 text-emerald-600 mb-1" />
                <p className="font-bold text-sm">Item Templates</p>
                <p className="text-xs text-muted-foreground">Define products with steps & sub-parts. Generate with AI or start from a starter pack.</p>
              </button>
            </Link>
          </div>
        </div>

        {/* Work hours per day */}
        <div className="bg-card border-2 border-border rounded-xl p-4 space-y-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Standard Work Hours / Day</p>
            <p className="text-xs text-muted-foreground mt-1">Used to calculate overtime in attendance reports</p>
          </div>
          <div className="flex gap-2 items-center">
            <Input
              type="number"
              min="1" max="24" step="0.5"
              value={workHours}
              onChange={(e) => setWorkHours(e.target.value)}
              className="h-10 flex-1 border-2"
            />
            <span className="text-sm text-muted-foreground font-bold">hours</span>
            <Button
              size="sm"
              onClick={() => {
                const n = Number(workHours);
                if (Number.isFinite(n) && n > 0 && n <= 24) updateHoursMutation.mutate(n);
              }}
              disabled={updateHoursMutation.isPending || !workHours}
              className="h-10"
            >
              {updateHoursMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            </Button>
          </div>
        </div>

        {/* Scheduling Rules */}
        <div className="bg-card border-2 border-border rounded-xl p-4 space-y-4">
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Scheduling Rules</p>
          </div>

          {/* Weekend overtime toggle */}
          <div className="flex items-center justify-between p-3 rounded-lg border border-border bg-muted/20">
            <div>
              <p className="font-semibold text-sm">Weekend Overtime</p>
              <p className="text-xs text-muted-foreground">All hours on Sat/Sun count as overtime</p>
            </div>
            <button
              onClick={() => updateSchedulingMutation.mutate({ weekendOvertimeEnabled: !company.weekendOvertimeEnabled })}
              disabled={updateSchedulingMutation.isPending}
              className={cn(
                "relative w-12 h-6 rounded-full transition-colors flex-shrink-0",
                company.weekendOvertimeEnabled ? "bg-primary" : "bg-muted-foreground/30"
              )}
            >
              <span className={cn(
                "absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform",
                company.weekendOvertimeEnabled ? "translate-x-6" : "translate-x-0"
              )} />
            </button>
          </div>

          {/* Country selector */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Globe className="h-3.5 w-3.5 text-muted-foreground" />
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Country (for public holidays import)</p>
            </div>
            <div className="flex gap-2">
              <select
                value={selectedCountry}
                onChange={(e) => setSelectedCountry(e.target.value)}
                className="flex-1 h-10 px-3 rounded-lg border-2 border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              >
                <option value="">No country selected</option>
                {COUNTRIES.map((c) => (
                  <option key={c.code} value={c.code}>{c.label}</option>
                ))}
              </select>
              <Button
                size="sm"
                variant="outline"
                className="h-10"
                disabled={updateSchedulingMutation.isPending}
                onClick={() => updateSchedulingMutation.mutate({ country: selectedCountry || null })}
              >
                <Check className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Import presets */}
          {selectedCountry && company.country === selectedCountry && (
            <Button
              variant="outline"
              className="w-full h-10 border-primary/30 text-primary hover:bg-primary/5 font-bold"
              disabled={importHolidaysMutation.isPending}
              onClick={() => importHolidaysMutation.mutate(selectedCountry)}
            >
              {importHolidaysMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Download className="h-4 w-4 mr-2" />
              )}
              Import {importYear} Public Holidays for {COUNTRIES.find(c => c.code === selectedCountry)?.label}
            </Button>
          )}
        </div>

        {/* Holidays management */}
        <div className="bg-card border-2 border-border rounded-xl p-4 space-y-4">
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Company Holidays</p>
          </div>
          <p className="text-xs text-muted-foreground -mt-2">Days listed here are treated as non-overtime days (all hours count as regular).</p>

          {/* Add holiday form */}
          <div className="space-y-2 p-3 bg-muted/30 rounded-lg border">
            <p className="text-xs font-bold text-muted-foreground">Add Holiday</p>
            <div className="flex gap-2">
              <input
                type="date"
                value={newHolidayDate}
                onChange={(e) => setNewHolidayDate(e.target.value)}
                className="flex-1 h-9 px-2 rounded-lg border-2 border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
              <input
                type="text"
                placeholder="Label (e.g. Christmas)"
                value={newHolidayLabel}
                onChange={(e) => setNewHolidayLabel(e.target.value)}
                className="flex-1 h-9 px-2 rounded-lg border-2 border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
              <Button
                size="sm"
                className="h-9 w-9 p-0"
                disabled={!newHolidayDate || !newHolidayLabel.trim() || addHolidayMutation.isPending}
                onClick={() => addHolidayMutation.mutate({ date: newHolidayDate, label: newHolidayLabel.trim() })}
              >
                {addHolidayMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
              </Button>
            </div>
          </div>

          {/* Holiday list */}
          {sortedHolidays.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-3">No holidays configured yet.</p>
          ) : (
            <div className="space-y-1.5 max-h-72 overflow-y-auto">
              {sortedHolidays.map((h) => (
                <div key={h.id} className="flex items-center justify-between p-2.5 rounded-lg border bg-background text-sm">
                  <div>
                    <p className="font-semibold text-xs">{h.label}</p>
                    <p className="text-xs text-muted-foreground">{fmtDate(h.date)}</p>
                  </div>
                  <button
                    onClick={() => deleteHolidayMutation.mutate(h.id)}
                    disabled={deleteHolidayMutation.isPending}
                    className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Plan */}
        <div className="bg-card border-2 border-border rounded-xl p-4 space-y-3">
          <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Plan</p>
          <div className="grid grid-cols-2 gap-3">
            {(["basic", "pro"] as const).map((plan) => (
              <button
                key={plan}
                onClick={() => updatePlanMutation.mutate(plan)}
                disabled={updatePlanMutation.isPending}
                className={cn(
                  "p-4 rounded-xl border-2 text-left transition-all",
                  company.plan === plan
                    ? plan === "pro" ? "border-primary bg-primary/5" : "border-orange-400 bg-orange-50"
                    : "border-border bg-muted/20 hover:border-muted-foreground/50"
                )}
              >
                <p className={cn("font-black text-lg uppercase", company.plan === plan && plan === "pro" ? "text-primary" : "")}>
                  {plan}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {plan === "basic" ? "Core features only" : "All features enabled"}
                </p>
                {company.plan === plan && (
                  <span className="text-xs font-bold text-green-600">✓ Current plan</span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Features */}
        <div className="bg-card border-2 border-border rounded-xl p-4 space-y-1">
          <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3">Feature Overrides</p>
          <p className="text-xs text-muted-foreground mb-4">Toggle individual features regardless of plan. Changes apply instantly.</p>
          {Object.entries(FEATURE_LABELS).map(([key, { label, description }]) => {
            const enabled = company.features[key as keyof typeof company.features];
            return (
              <div
                key={key}
                className={cn(
                  "flex items-center justify-between p-3 rounded-lg border transition-all",
                  enabled ? "border-green-200 bg-green-50/50" : "border-border bg-muted/20"
                )}
              >
                <div className="flex-1 min-w-0 pr-4">
                  <p className="font-semibold text-sm">{label}</p>
                  <p className="text-xs text-muted-foreground">{description}</p>
                </div>
                <button
                  onClick={() => toggleFeatureMutation.mutate({ feature: key, enabled: !enabled })}
                  disabled={toggleFeatureMutation.isPending}
                  className={cn(
                    "relative w-12 h-6 rounded-full transition-colors flex-shrink-0",
                    enabled ? "bg-green-500" : "bg-muted-foreground/30"
                  )}
                >
                  <span className={cn(
                    "absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform",
                    enabled ? "translate-x-6" : "translate-x-0"
                  )} />
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
