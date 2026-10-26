import { Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Coins, LogOut, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, useProfile } from "@/hooks/useAuth";

export function SiteHeader() {
  const { user } = useAuth();
  const { data: profile } = useProfile(user?.id);
  const qc = useQueryClient();
  const navigate = useNavigate();

  const signOut = async () => {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  };

  const isApp = typeof navigator !== "undefined" && (
    navigator.userAgent.includes("PlayOnApp") ||
    (typeof window !== "undefined" && window.matchMedia && window.matchMedia("(display-mode: standalone)").matches)
  );

  return (
    <header className="sticky top-0 z-20 border-b bg-background/85 backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center gap-3 px-3 py-2.5 sm:px-4 sm:py-3">
        <Link to="/" className="font-display text-2xl sm:text-3xl tracking-wider text-gold">PLAYON</Link>
        <nav className="flex items-center gap-2.5 sm:gap-4 text-xs sm:text-sm text-muted-foreground">
          <Link to="/" activeProps={{ className: "text-primary font-semibold" }} activeOptions={{ exact: true }}>Markets</Link>
          {user && <Link to="/history" activeProps={{ className: "text-primary font-semibold" }}>My Plays</Link>}
          {profile?.isAdmin && (
            <Link
              to="/admin"
              className="rounded-md border border-gold/40 bg-gold/15 px-2 py-0.5 text-xs font-bold text-gold hover:bg-gold hover:text-background transition-colors"
            >
              Admin
            </Link>
          )}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          {/* Direct Android APK download (hidden if already running inside app) */}
          {!isApp && (
            <a
              href="/PlayOn.apk"
              download="PlayOn.apk"
              className="flex items-center gap-1.5 rounded-full border border-primary/40 bg-primary/10 px-2.5 py-1 text-xs font-bold text-gold hover:bg-primary hover:text-primary-foreground transition-all shadow-sm"
              title="Download Android APK"
            >
              <Smartphone className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Download</span> App
            </a>
          )}

          {user ? (
            <>
              <span className="flex items-center gap-1 rounded-full bg-secondary px-3 py-1 text-sm font-semibold text-primary">
                <Coins className="h-4 w-4" /> {profile?.points ?? "…"}
              </span>
              <Button size="icon" variant="ghost" onClick={signOut} aria-label="Sign out">
                <LogOut className="h-4 w-4" />
              </Button>
            </>
          ) : (
            <Button asChild size="sm"><Link to="/auth">Sign in</Link></Button>
          )}
        </div>
      </div>
    </header>
  );
}
