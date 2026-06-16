import { useState, useEffect } from "react";
import { Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth, usePlan } from "@/contexts/auth";
import { useLang } from "@/contexts/lang";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Building2, Loader2, Check, Calendar, Globe, Plus, Trash2, Download, Crown, Clock, Users } from "lucide-react";
import { cn } from "@/lib/utils";

interface Company {
  id: number;
  name: string;
  plan: "lite" | "standard" | "pro";
  workHoursPerDay: number;
  weekendOvertimeEnabled: boolean;
  country: string | null;
  timezone: string;
  logo: string | null;
  quoteSignerName: string | null;
  currency: string;
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

interface CompanyShift {
  id: number;
  name: string;
  startTime: string;
  endTime: string;
}

interface QuoteIssuer {
  id: number;
  name: string;
  email: string | null;
  phone: string | null;
}

const CURRENCIES = [
  { code: "USD", label: "US Dollar ($)" },
  { code: "EUR", label: "Euro (€)" },
  { code: "GBP", label: "British Pound (£)" },
  { code: "CHF", label: "Swiss Franc (Fr)" },
  { code: "JPY", label: "Japanese Yen (¥)" },
  { code: "CAD", label: "Canadian Dollar (CA$)" },
  { code: "AUD", label: "Australian Dollar (A$)" },
  { code: "NOK", label: "Norwegian Krone (kr)" },
  { code: "SEK", label: "Swedish Krona (kr)" },
  { code: "DKK", label: "Danish Krone (kr)" },
  { code: "PLN", label: "Polish Złoty (zł)" },
  { code: "CZK", label: "Czech Koruna (Kč)" },
  { code: "HUF", label: "Hungarian Forint (Ft)" },
  { code: "RSD", label: "Serbian Dinar (din)" },
  { code: "RON", label: "Romanian Leu (lei)" },
  { code: "HRK", label: "Croatian Kuna (kn)" },
];

const COUNTRIES = [
  { code: "AU", label: "Australia" },
  { code: "AT", label: "Austria" },
  { code: "BR", label: "Brazil" },
  { code: "CA", label: "Canada" },
  { code: "HR", label: "Croatia" },
  { code: "CZ", label: "Czech Republic" },
  { code: "DK", label: "Denmark" },
  { code: "FI", label: "Finland" },
  { code: "FR", label: "France" },
  { code: "DE", label: "Germany" },
  { code: "HU", label: "Hungary" },
  { code: "IT", label: "Italy" },
  { code: "JP", label: "Japan" },
  { code: "MX", label: "Mexico" },
  { code: "NL", label: "Netherlands" },
  { code: "NO", label: "Norway" },
  { code: "PL", label: "Poland" },
  { code: "PT", label: "Portugal" },
  { code: "SI", label: "Slovenia" },
  { code: "ES", label: "Spain" },
  { code: "SE", label: "Sweden" },
  { code: "CH", label: "Switzerland" },
  { code: "GB", label: "United Kingdom" },
  { code: "US", label: "United States" },
];

const COUNTRY_TIMEZONES: Record<string, string> = {
  AU: "Australia/Sydney",
  AT: "Europe/Vienna",
  BR: "America/Sao_Paulo",
  CA: "America/Toronto",
  HR: "Europe/Zagreb",
  CZ: "Europe/Prague",
  DK: "Europe/Copenhagen",
  FI: "Europe/Helsinki",
  FR: "Europe/Paris",
  DE: "Europe/Berlin",
  HU: "Europe/Budapest",
  IT: "Europe/Rome",
  JP: "Asia/Tokyo",
  MX: "America/Mexico_City",
  NL: "Europe/Amsterdam",
  NO: "Europe/Oslo",
  PL: "Europe/Warsaw",
  PT: "Europe/Lisbon",
  SI: "Europe/Ljubljana",
  ES: "Europe/Madrid",
  SE: "Europe/Stockholm",
  CH: "Europe/Zurich",
  GB: "Europe/London",
  US: "America/New_York",
};

const TIMEZONES = [
  { value: "UTC", label: "UTC" },
  { value: "Europe/Ljubljana", label: "Ljubljana (UTC+1/+2)" },
  { value: "Europe/Vienna", label: "Vienna (UTC+1/+2)" },
  { value: "Europe/Zagreb", label: "Zagreb (UTC+1/+2)" },
  { value: "Europe/Prague", label: "Prague (UTC+1/+2)" },
  { value: "Europe/Warsaw", label: "Warsaw (UTC+1/+2)" },
  { value: "Europe/Budapest", label: "Budapest (UTC+1/+2)" },
  { value: "Europe/Rome", label: "Rome (UTC+1/+2)" },
  { value: "Europe/Berlin", label: "Berlin (UTC+1/+2)" },
  { value: "Europe/Paris", label: "Paris (UTC+1/+2)" },
  { value: "Europe/Amsterdam", label: "Amsterdam (UTC+1/+2)" },
  { value: "Europe/Madrid", label: "Madrid (UTC+1/+2)" },
  { value: "Europe/Zurich", label: "Zurich (UTC+1/+2)" },
  { value: "Europe/Stockholm", label: "Stockholm (UTC+1/+2)" },
  { value: "Europe/Copenhagen", label: "Copenhagen (UTC+1/+2)" },
  { value: "Europe/Oslo", label: "Oslo (UTC+1/+2)" },
  { value: "Europe/Helsinki", label: "Helsinki (UTC+2/+3)" },
  { value: "Europe/Lisbon", label: "Lisbon (UTC+0/+1)" },
  { value: "Europe/London", label: "London (UTC+0/+1)" },
  { value: "Asia/Tokyo", label: "Tokyo (UTC+9)" },
  { value: "Australia/Sydney", label: "Sydney (UTC+10/+11)" },
  { value: "America/New_York", label: "New York (UTC-5/-4)" },
  { value: "America/Chicago", label: "Chicago (UTC-6/-5)" },
  { value: "America/Denver", label: "Denver (UTC-7/-6)" },
  { value: "America/Los_Angeles", label: "Los Angeles (UTC-8/-7)" },
  { value: "America/Toronto", label: "Toronto (UTC-5/-4)" },
  { value: "America/Sao_Paulo", label: "São Paulo (UTC-3)" },
  { value: "America/Mexico_City", label: "Mexico City (UTC-6/-5)" },
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

async function fetchShifts(): Promise<CompanyShift[]> {
  const res = await fetch("/api/settings/shifts", { credentials: "include" });
  if (!res.ok) throw new Error("Failed to load shifts");
  return res.json();
}

function fmtDate(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString([], { weekday: "short", month: "short", day: "numeric", year: "numeric" });
}

function crossesMidnight(start: string, end: string): boolean {
  return end < start;
}

export default function AdminCompanyPage() {
  const { user } = useAuth();
  const { t } = useLang();
  const { atLeast } = usePlan();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [companyName, setCompanyName] = useState("");
  const [editingName, setEditingName] = useState(false);
  const [workHours, setWorkHours] = useState("8");
  const [newHolidayDate, setNewHolidayDate] = useState("");
  const [newHolidayLabel, setNewHolidayLabel] = useState("");
  const [selectedCountry, setSelectedCountry] = useState("");
  const [selectedTimezone, setSelectedTimezone] = useState("UTC");
  const [importYear] = useState(new Date().getFullYear());
  const [newShiftName, setNewShiftName] = useState("");
  const [newShiftStart, setNewShiftStart] = useState("07:00");
  const [newShiftEnd, setNewShiftEnd] = useState("15:00");
  const [signerName, setSignerName] = useState("");
  const [newIssuerName, setNewIssuerName] = useState("");
  const [newIssuerEmail, setNewIssuerEmail] = useState("");
  const [newIssuerPhone, setNewIssuerPhone] = useState("");

  const { data: company, isLoading } = useQuery({
    queryKey: ["/api/company"],
    queryFn: fetchCompany,
  });

  const { data: holidays = [] } = useQuery({
    queryKey: ["/api/settings/holidays"],
    queryFn: fetchHolidays,
  });

  const { data: shifts = [] } = useQuery<CompanyShift[]>({
    queryKey: ["/api/settings/shifts"],
    queryFn: fetchShifts,
  });

  const { data: issuers = [] } = useQuery<QuoteIssuer[]>({
    queryKey: ["/api/quote-issuers"],
    queryFn: async () => {
      const res = await fetch("/api/quote-issuers", { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  useEffect(() => {
    if (company && !editingName) setCompanyName(company.name);
    if (company) setWorkHours(String((company.workHoursPerDay ?? 480) / 60));
    if (company?.country) setSelectedCountry(company.country);
    if (company?.timezone) setSelectedTimezone(company.timezone);
    if (company) setSignerName(company.quoteSignerName ?? "");
  }, [company?.name, company?.workHoursPerDay, company?.country, company?.timezone, company?.quoteSignerName]);

  // Auto-fill timezone when country changes
  useEffect(() => {
    if (selectedCountry && COUNTRY_TIMEZONES[selectedCountry]) {
      setSelectedTimezone(COUNTRY_TIMEZONES[selectedCountry]);
    }
  }, [selectedCountry]);

  const updateBrandingMutation = useMutation({
    mutationFn: async (data: { logo?: string | null; quoteSignerName?: string | null; currency?: string }) => {
      const res = await fetch("/api/company", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(data),
      });
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || "Failed"); }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/company"] });
      toast({ description: "Quote branding updated" });
    },
    onError: (e: Error) => toast({ description: e.message, variant: "destructive" }),
  });

  const onLogoFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!/^image\/(png|jpe?g)$/.test(file.type)) { toast({ description: "Use a PNG or JPG image", variant: "destructive" }); return; }
    if (file.size > 500 * 1024) { toast({ description: "Logo must be under 500KB", variant: "destructive" }); return; }
    const reader = new FileReader();
    reader.onload = () => updateBrandingMutation.mutate({ logo: String(reader.result) });
    reader.readAsDataURL(file);
  };

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

  const updateSchedulingMutation = useMutation({
    mutationFn: async (data: { weekendOvertimeEnabled?: boolean; country?: string | null; timezone?: string }) => {
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

  const addShiftMutation = useMutation({
    mutationFn: async (data: { name: string; startTime: string; endTime: string }) => {
      const res = await fetch("/api/settings/shifts", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || "Failed"); }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings/shifts"] });
      setNewShiftName(""); setNewShiftStart("07:00"); setNewShiftEnd("15:00");
      toast({ title: "Shift added" });
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const deleteShiftMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/settings/shifts/${id}`, { method: "DELETE", credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/settings/shifts"] }),
    onError: () => toast({ title: "Failed to delete shift", variant: "destructive" }),
  });

  const addIssuerMutation = useMutation({
    mutationFn: async (data: { name: string; email?: string; phone?: string }) => {
      const res = await fetch("/api/quote-issuers", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || "Failed"); }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/quote-issuers"] });
      setNewIssuerName(""); setNewIssuerEmail(""); setNewIssuerPhone("");
      toast({ title: "Issuer added" });
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const deleteIssuerMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/quote-issuers/${id}`, { method: "DELETE", credentials: "include" });
      if (!res.ok) throw new Error("Failed");
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/quote-issuers"] }),
    onError: () => toast({ title: "Failed to remove issuer", variant: "destructive" }),
  });

  if (user?.role !== "admin") {
    return <div className="p-6 text-center text-muted-foreground mt-20"><p>{t("adminOnly")}</p></div>;
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
        <h1 className="text-xl font-bold">{t("companySettingsTitle")}</h1>
      </div>

      <div className="p-4 space-y-6 pb-24">
        {/* Company Name */}
        <div className="bg-card border-2 border-border rounded-xl p-4 space-y-3">
          <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{t("companyNameSection")}</p>
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
                {t("cancel")}
              </Button>
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <p className="text-lg font-bold">{company.name}</p>
              <Button variant="outline" size="sm" onClick={() => { setEditingName(true); setCompanyName(company.name); }}>
                {t("edit")}
              </Button>
            </div>
          )}
        </div>

        {/* Quote branding: logo + signer */}
        <div className="bg-card border-2 border-border rounded-xl p-4 space-y-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Quote branding</p>
            <p className="text-xs text-muted-foreground mt-1">Shown on quote PDFs. Logo: PNG or JPG, under 500KB.</p>
          </div>
          <div className="flex items-center gap-4">
            <div className="h-16 w-32 rounded-lg border-2 border-dashed border-border flex items-center justify-center overflow-hidden bg-muted/30 flex-shrink-0">
              {company.logo
                ? <img src={company.logo} alt="Company logo" className="max-h-full max-w-full object-contain" />
                : <span className="text-[10px] text-muted-foreground">No logo</span>}
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="inline-flex items-center justify-center h-9 px-3 rounded-md text-sm font-semibold border-2 border-input bg-background hover:bg-muted cursor-pointer">
                <input type="file" accept="image/png,image/jpeg" className="hidden" onChange={onLogoFile} />
                {company.logo ? "Replace logo" : "Upload logo"}
              </label>
              {company.logo && (
                <Button variant="outline" size="sm" className="h-8 text-xs text-destructive border-destructive/30"
                  onClick={() => updateBrandingMutation.mutate({ logo: null })}>
                  Remove logo
                </Button>
              )}
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground">Signed by — name on quotes</label>
            <div className="flex gap-2">
              <Input value={signerName} onChange={(e) => setSignerName(e.target.value)}
                placeholder="e.g. John Smith, Owner" className="h-10 flex-1 border-2" />
              <Button size="sm" className="h-10" disabled={updateBrandingMutation.isPending}
                onClick={() => updateBrandingMutation.mutate({ quoteSignerName: signerName.trim() || null })}>
                {updateBrandingMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              </Button>
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground">Default currency</label>
            <select
              value={company.currency ?? "USD"}
              onChange={(e) => updateBrandingMutation.mutate({ currency: e.target.value })}
              className="w-full h-10 px-3 rounded-lg border-2 border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            >
              {CURRENCIES.map((c) => (
                <option key={c.code} value={c.code}>{c.code} — {c.label}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Quote issuers — all plans */}
        <div className="bg-card border-2 border-border rounded-xl p-4 space-y-4">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-muted-foreground" />
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Quote issuers</p>
              <p className="text-xs text-muted-foreground mt-0.5">People who issue quotes — selectable per quote and shown on PDFs.</p>
            </div>
          </div>

          {issuers.length > 0 && (
            <div className="space-y-1.5">
              {issuers.map((issuer) => (
                <div key={issuer.id} className="flex items-start justify-between p-2.5 rounded-lg border bg-background text-sm">
                  <div>
                    <p className="font-semibold">{issuer.name}</p>
                    {issuer.email && <p className="text-xs text-muted-foreground">{issuer.email}</p>}
                    {issuer.phone && <p className="text-xs text-muted-foreground">{issuer.phone}</p>}
                  </div>
                  <button
                    onClick={() => deleteIssuerMutation.mutate(issuer.id)}
                    disabled={deleteIssuerMutation.isPending}
                    className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors flex-shrink-0"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="space-y-2 p-3 bg-muted/30 rounded-lg border">
            <p className="text-xs font-bold text-muted-foreground">Add issuer</p>
            <Input
              placeholder="Name (required)"
              value={newIssuerName}
              onChange={(e) => setNewIssuerName(e.target.value)}
              className="h-9 text-sm border-2"
            />
            <Input
              placeholder="Email (optional)"
              type="email"
              value={newIssuerEmail}
              onChange={(e) => setNewIssuerEmail(e.target.value)}
              className="h-9 text-sm border-2"
            />
            <Input
              placeholder="Phone (optional)"
              value={newIssuerPhone}
              onChange={(e) => setNewIssuerPhone(e.target.value)}
              className="h-9 text-sm border-2"
            />
            <Button
              size="sm"
              className="w-full h-9 gap-2"
              disabled={!newIssuerName.trim() || addIssuerMutation.isPending}
              onClick={() => addIssuerMutation.mutate({
                name: newIssuerName.trim(),
                ...(newIssuerEmail.trim() ? { email: newIssuerEmail.trim() } : {}),
                ...(newIssuerPhone.trim() ? { phone: newIssuerPhone.trim() } : {}),
              })}
            >
              {addIssuerMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
              Add issuer
            </Button>
          </div>
        </div>

        {/* Work hours + Shifts (combined) — Standard/Pro only */}
        {atLeast("standard") && <div className="bg-card border-2 border-border rounded-xl p-4 space-y-5">
          {/* Standard work hours */}
          <div className="space-y-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{t("companyWorkHours")}</p>
              <p className="text-xs text-muted-foreground mt-1">{t("companyWorkHoursDesc")}</p>
            </div>
            <div className="flex gap-2 items-center">
              <Input
                type="number"
                min="1" max="24" step="0.5"
                value={workHours}
                onChange={(e) => setWorkHours(e.target.value)}
                className="h-10 flex-1 border-2"
              />
              <span className="text-sm text-muted-foreground font-bold">{t("companyHours")}</span>
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

          <div className="border-t border-border" />

          {/* Shifts */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{t("companyWorkShifts")}</p>
            </div>
            <p className="text-xs text-muted-foreground -mt-1">
              {t("companyWorkShiftsDesc")}
            </p>

            {/* Add shift form */}
            <div className="space-y-2 p-3 bg-muted/30 rounded-lg border">
              <p className="text-xs font-bold text-muted-foreground">{t("companyAddShift")}</p>
              <Input
                placeholder="Shift name (e.g. Morning, Night)"
                value={newShiftName}
                onChange={(e) => setNewShiftName(e.target.value)}
                className="h-9 text-sm border-2"
              />
              <div className="flex gap-2 items-center">
                <div className="flex-1 space-y-1">
                  <p className="text-[11px] text-muted-foreground font-semibold">Start</p>
                  <input
                    type="time"
                    value={newShiftStart}
                    onChange={(e) => setNewShiftStart(e.target.value)}
                    className="w-full h-9 px-2 rounded-lg border-2 border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                </div>
                <div className="flex-1 space-y-1">
                  <p className="text-[11px] text-muted-foreground font-semibold">End</p>
                  <input
                    type="time"
                    value={newShiftEnd}
                    onChange={(e) => setNewShiftEnd(e.target.value)}
                    className="w-full h-9 px-2 rounded-lg border-2 border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                </div>
                <Button
                  size="sm"
                  className="h-9 w-9 p-0 self-end"
                  disabled={!newShiftName.trim() || addShiftMutation.isPending}
                  onClick={() => addShiftMutation.mutate({ name: newShiftName.trim(), startTime: newShiftStart, endTime: newShiftEnd })}
                >
                  {addShiftMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                </Button>
              </div>
              {newShiftStart && newShiftEnd && crossesMidnight(newShiftStart, newShiftEnd) && (
                <p className="text-[11px] text-amber-600 font-medium">{t("companyNightShift")}</p>
              )}
            </div>

            {/* Shift list */}
            {shifts.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-2">{t("companyNoShifts")}</p>
            ) : (
              <div className="space-y-1.5">
                {shifts.map((s) => (
                  <div key={s.id} className="flex items-center justify-between p-2.5 rounded-lg border bg-background text-sm">
                    <div>
                      <p className="font-semibold text-sm">{s.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {s.startTime} → {s.endTime}
                        {crossesMidnight(s.startTime, s.endTime) && (
                          <span className="ml-1.5 text-amber-600 font-medium">(+1 day)</span>
                        )}
                      </p>
                    </div>
                    <button
                      onClick={() => deleteShiftMutation.mutate(s.id)}
                      disabled={deleteShiftMutation.isPending}
                      className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>}

        {/* Scheduling Rules — Standard/Pro only */}
        {atLeast("standard") && <div className="bg-card border-2 border-border rounded-xl p-4 space-y-4">
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{t("companyScheduling")}</p>
          </div>

          {/* Weekend overtime toggle */}
          <div className="flex items-center justify-between p-3 rounded-lg border border-border bg-muted/20">
            <div>
              <p className="font-semibold text-sm">{t("companyWeekendOT")}</p>
              <p className="text-xs text-muted-foreground">{t("companyWeekendOTDesc")}</p>
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

          {/* Country + Timezone */}
          <div className="space-y-3">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Globe className="h-3.5 w-3.5 text-muted-foreground" />
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{t("companyCountry")}</p>
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
                  onClick={() => updateSchedulingMutation.mutate({ country: selectedCountry || null, timezone: selectedTimezone })}
                >
                  <Check className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* Timezone — select, auto-filled from country */}
            <div className="space-y-1.5">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5" /> {t("companyTimezone")}
              </p>
              <div className="flex gap-2">
                <select
                  value={selectedTimezone}
                  onChange={(e) => setSelectedTimezone(e.target.value)}
                  className="flex-1 h-10 px-3 rounded-lg border-2 border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                >
                  {TIMEZONES.map((tz) => (
                    <option key={tz.value} value={tz.value}>{tz.label}</option>
                  ))}
                </select>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-10"
                  disabled={updateSchedulingMutation.isPending}
                  onClick={() => updateSchedulingMutation.mutate({ timezone: selectedTimezone })}
                >
                  <Check className="h-4 w-4" />
                </Button>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Used for clock-in dates and overtime calculations. Active: <span className="font-semibold">{company.timezone || "UTC"}</span>
              </p>
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
              {t("companyImportHolidays")} {importYear} {COUNTRIES.find(c => c.code === selectedCountry)?.label}
            </Button>
          )}
        </div>}

        {/* Holidays management — Standard/Pro only */}
        {atLeast("standard") && <div className="bg-card border-2 border-border rounded-xl p-4 space-y-4">
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{t("companyHolidays")}</p>
          </div>
          <p className="text-xs text-muted-foreground -mt-2">{t("companyHolidaysDesc")}</p>

          {/* Add holiday form */}
          <div className="space-y-2 p-3 bg-muted/30 rounded-lg border">
            <p className="text-xs font-bold text-muted-foreground">{t("companyAddHoliday")}</p>
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
            <p className="text-xs text-muted-foreground text-center py-3">{t("companyNoHolidays")}</p>
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
        </div>}

        {/* Plan — read-only for admins */}
        <div className="bg-card border-2 border-border rounded-xl p-4 space-y-3">
          <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{t("companyPlan")}</p>
          <div className={cn(
            "flex items-center justify-between p-4 rounded-xl border-2",
            company.plan === "pro" ? "border-primary bg-primary/5"
            : company.plan === "standard" ? "border-blue-400 bg-blue-50"
            : "border-muted-foreground/30 bg-muted/30"
          )}>
            <div>
              <p className={cn("font-black text-xl uppercase",
                company.plan === "pro" ? "text-primary"
                : company.plan === "standard" ? "text-blue-600"
                : "text-muted-foreground")}>
                {company.plan}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {company.plan === "pro" ? "Full production management"
                : company.plan === "standard" ? "Jobs, attendance & purchasing"
                : "Inventory & quotes"}
              </p>
            </div>
            <span className="text-xs font-bold text-green-600 bg-green-100 border border-green-200 rounded-full px-2.5 py-1">
              Active
            </span>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/40 rounded-lg px-3 py-2.5">
            <Crown className="h-3.5 w-3.5 text-yellow-500 flex-shrink-0" />
            <span>{t("companyPlanManagedByOwner")}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
