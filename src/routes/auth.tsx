import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Phone, Lock, User, ArrowRight, ShieldCheck, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in — PlayOn" },
      { name: "description", content: "Sign in or create your PlayOn account with mobile number." },
      { property: "og:title", content: "Sign in — PlayOn" },
      { property: "og:description", content: "Create an account and start playing." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuthPage,
});

export function AuthPage() {
  const [mode, setMode] = useState<"in" | "up">("in");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();

  // Helper to format phone into internal auth credential
  const formatAuthEmail = (raw: string) => {
    const trimmed = raw.trim();
    if (trimmed.includes("@")) {
      return trimmed.toLowerCase();
    }
    const digits = trimmed.replace(/\D/g, "");
    return `${digits}@playon.app`;
  };

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loginId.trim()) {
      toast.error("Please enter your mobile number");
      return;
    }
    if (!password) {
      toast.error("Please enter your password");
      return;
    }

    setBusy(true);
    const email = formatAuthEmail(loginId);
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    setBusy(false);

    if (error) {
      if (
        error.message.toLowerCase().includes("invalid login credentials") ||
        error.message.toLowerCase().includes("invalid_grant")
      ) {
        toast.error("Invalid mobile number or password. Please check and try again.");
      } else {
        toast.error(error.message);
      }
      return;
    }

    toast.success("Welcome back!");
    navigate({ to: "/" });
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanPhone = phone.replace(/\D/g, "");

    if (cleanPhone.length !== 10) {
      toast.error("Please enter a valid 10-digit mobile number");
      return;
    }
    if (!name.trim()) {
      toast.error("Please enter your name");
      return;
    }
    if (password.length < 6) {
      toast.error("Password must be at least 6 characters long");
      return;
    }

    setBusy(true);
    const email = `${cleanPhone}@playon.app`;

    // 1. Create account
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          display_name: name.trim(),
          phone: cleanPhone,
        },
      },
    });

    if (error) {
      setBusy(false);
      if (
        error.message.toLowerCase().includes("already registered") ||
        error.message.toLowerCase().includes("user already")
      ) {
        toast.error("This mobile number is already registered. Please sign in.");
        setMode("in");
        setLoginId(cleanPhone);
      } else {
        toast.error(error.message);
      }
      return;
    }

    // 2. Immediate Sign In (since account is auto-confirmed in Postgres)
    const { error: signInErr } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    setBusy(false);

    if (signInErr) {
      if (data.session) {
        toast.success(`Welcome ${name.trim()}! Account created successfully.`);
        navigate({ to: "/" });
        return;
      }
      toast.error(signInErr.message);
      setMode("in");
      setLoginId(cleanPhone);
      return;
    }

    toast.success(`Welcome ${name.trim()}! Account created successfully.`);
    navigate({ to: "/" });
  };

  return (
    <main className="mx-auto max-w-sm px-4 py-12">
      <div className="rounded-2xl border bg-card p-6 shadow-glow">
        {/* Header */}
        <div className="text-center space-y-1 mb-6">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-gold/15 text-gold border border-gold/40 mb-2 shadow-inner">
            <Sparkles className="h-6 w-6" />
          </div>
          <h1 className="font-display text-4xl tracking-wider text-gold">
            {mode === "in" ? "Welcome Back" : "Join PlayOn"}
          </h1>
          <p className="text-xs text-muted-foreground">
            {mode === "in"
              ? "Sign in with your mobile number to play"
              : "Create your account using your mobile number"}
          </p>
        </div>

        {/* Tab switcher */}
        <div className="grid grid-cols-2 p-1 mb-5 rounded-xl bg-secondary/60 border text-xs font-semibold">
          <button
            type="button"
            onClick={() => setMode("in")}
            className={`py-2 rounded-lg transition-all cursor-pointer ${
              mode === "in"
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Sign In
          </button>
          <button
            type="button"
            onClick={() => setMode("up")}
            className={`py-2 rounded-lg transition-all cursor-pointer ${
              mode === "up"
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Register
          </button>
        </div>

        {/* Form */}
        <form onSubmit={mode === "in" ? handleSignIn : handleSignUp} className="space-y-4">
          {mode === "up" && (
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Player Name</Label>
              <div className="relative flex items-center">
                <User className="absolute left-3 h-4 w-4 text-muted-foreground" />
                <Input
                  type="text"
                  placeholder="Enter your name (e.g. Ramesh)"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="pl-9 h-11 text-sm rounded-xl"
                  required
                />
              </div>
            </div>
          )}

          {mode === "up" ? (
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Mobile Number</Label>
              <div className="relative flex items-center">
                <div className="absolute left-3 flex items-center gap-1 text-xs font-bold text-muted-foreground border-r pr-2">
                  <span>+91</span>
                </div>
                <Input
                  type="tel"
                  inputMode="numeric"
                  maxLength={10}
                  placeholder="10-digit mobile number"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
                  className="pl-16 h-11 text-sm font-semibold tracking-wider rounded-xl"
                  required
                />
              </div>
              <p className="text-[10px] text-muted-foreground">Only 10-digit Indian mobile number</p>
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Mobile Number</Label>
              <div className="relative flex items-center">
                <Phone className="absolute left-3 h-4 w-4 text-muted-foreground" />
                <Input
                  type="text"
                  placeholder="10-digit mobile number"
                  value={loginId}
                  onChange={(e) => setLoginId(e.target.value)}
                  className="pl-9 h-11 text-sm font-semibold rounded-xl"
                  required
                />
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Password</Label>
            <div className="relative flex items-center">
              <Lock className="absolute left-3 h-4 w-4 text-muted-foreground" />
              <Input
                type="password"
                minLength={6}
                placeholder="Enter password (min 6 chars)"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="pl-9 h-11 text-sm rounded-xl"
                required
              />
            </div>
          </div>

          <Button
            type="submit"
            disabled={busy}
            className="w-full h-11 text-sm font-bold rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg flex items-center justify-center gap-2 cursor-pointer mt-2"
          >
            {busy ? (
              "Please wait…"
            ) : mode === "in" ? (
              <>
                Sign In <ArrowRight className="h-4 w-4" />
              </>
            ) : (
              <>
                Create Account & Play <ArrowRight className="h-4 w-4" />
              </>
            )}
          </Button>

          <div className="text-center pt-2">
            <button
              type="button"
              className="text-xs text-muted-foreground hover:text-gold transition-colors cursor-pointer"
              onClick={() => {
                setMode(mode === "in" ? "up" : "in");
              }}
            >
              {mode === "in"
                ? "New player? Create an account with Mobile No."
                : "Already registered? Sign in with Mobile No."}
            </button>
          </div>
        </form>

        <div className="mt-6 border-t pt-4 text-center">
          <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" />
            Fast & secure mobile registration
          </span>
        </div>
      </div>
    </main>
  );
}
