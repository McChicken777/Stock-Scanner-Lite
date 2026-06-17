import { useState, useEffect } from "react";
import { useRoute, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Building2, CheckCircle2, XCircle } from "lucide-react";
import { FabriflowMark } from "@/components/fabriflow-logo";

type InviteStatus = "loading" | "valid" | "invalid" | "used" | "expired";

export default function JoinPage() {
  const [, params] = useRoute("/join/:token");
  const token = params?.token ?? "";
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const [inviteStatus, setInviteStatus] = useState<InviteStatus>("loading");
  const [prefillCompany, setPrefillCompany] = useState("");
  const [plan, setPlan] = useState("lite");

  const [companyName, setCompanyName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!token) { setInviteStatus("invalid"); return; }
    fetch(`/api/join/${token}`)
      .then((r) => {
        if (r.status === 404) { setInviteStatus("invalid"); return null; }
        if (r.status === 410) return r.json().then((d: { reason?: string }) => {
          setInviteStatus(d.reason === "used" ? "used" : "expired");
          return null;
        });
        return r.json();
      })
      .then((d) => {
        if (!d) return;
        setInviteStatus("valid");
        if (d.companyName) { setPrefillCompany(d.companyName); setCompanyName(d.companyName); }
        if (d.plan) setPlan(d.plan);
      })
      .catch(() => setInviteStatus("invalid"));
  }, [token]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) { toast({ title: "Passwords do not match", variant: "destructive" }); return; }
    if (password.length < 8) { toast({ title: "Password must be at least 8 characters", variant: "destructive" }); return; }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/join/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyName, adminUsername: username, adminEmail: email, password }),
      });
      const data = await res.json();
      if (!res.ok) { toast({ title: data.error || "Registration failed", variant: "destructive" }); return; }
      setSuccess(true);
    } catch {
      toast({ title: "Something went wrong", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  }

  if (inviteStatus === "loading") {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (inviteStatus === "invalid" || inviteStatus === "used" || inviteStatus === "expired") {
    return (
      <div className="min-h-[100dvh] flex flex-col items-center justify-center bg-background p-6 text-center gap-4">
        <XCircle className="h-14 w-14 text-destructive" />
        <h1 className="text-2xl font-black">
          {inviteStatus === "used" ? "Link already used" : inviteStatus === "expired" ? "Link has expired" : "Invalid link"}
        </h1>
        <p className="text-muted-foreground text-sm max-w-xs">
          {inviteStatus === "used"
            ? "This invite link has already been used to create an account."
            : inviteStatus === "expired"
            ? "This invite link has expired. Ask your contact to send a new one."
            : "This link is not valid. Please check the URL or ask for a new invite."}
        </p>
      </div>
    );
  }

  if (success) {
    return (
      <div className="min-h-[100dvh] flex flex-col items-center justify-center bg-background p-6 text-center gap-4">
        <CheckCircle2 className="h-14 w-14 text-green-500" />
        <h1 className="text-2xl font-black">Account created!</h1>
        <p className="text-muted-foreground text-sm max-w-xs">
          Your company <strong>{companyName}</strong> is ready. You can now log in with your username and password.
        </p>
        <Button onClick={() => setLocation("/")} className="h-12 px-8 font-bold">
          Go to login
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] flex flex-col items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm space-y-6">
        {/* Header */}
        <div className="flex flex-col items-center gap-2 text-center">
          <div className="h-14 w-14 rounded-2xl bg-primary flex items-center justify-center">
            <FabriflowMark className="h-8 w-8 text-primary-foreground" />
          </div>
          <h1 className="text-2xl font-black">Set up your account</h1>
          <p className="text-sm text-muted-foreground">
            You've been invited to use Fabriflow on the <strong className="capitalize">{plan}</strong> plan.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-sm font-bold">Company name</Label>
            <Input
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              placeholder="Your company name"
              required
              className="h-11 border-2"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm font-bold">Your username</Label>
            <Input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="e.g. john or admin"
              required
              minLength={2}
              className="h-11 border-2"
              autoComplete="username"
            />
            <p className="text-[11px] text-muted-foreground">This is what you'll use to log in.</p>
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm font-bold">Email <span className="font-normal text-muted-foreground">(optional)</span></Label>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
              className="h-11 border-2"
              autoComplete="email"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm font-bold">Password</Label>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Min. 8 characters"
              required
              minLength={8}
              className="h-11 border-2"
              autoComplete="new-password"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm font-bold">Confirm password</Label>
            <Input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="Repeat your password"
              required
              className="h-11 border-2"
              autoComplete="new-password"
            />
          </div>

          <Button
            type="submit"
            disabled={submitting || !companyName.trim() || !username.trim() || !password}
            className="w-full h-12 font-bold text-base"
          >
            {submitting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Creating account...</> : "Create account"}
          </Button>
        </form>

        <p className="text-center text-xs text-muted-foreground">
          Already have an account?{" "}
          <button onClick={() => setLocation("/")} className="underline font-semibold">Log in</button>
        </p>
      </div>
    </div>
  );
}
