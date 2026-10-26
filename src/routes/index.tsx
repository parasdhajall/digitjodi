import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Clock, Play, Zap, Smartphone, History } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { fmtTime, resultLabel, marketStatus } from "@/lib/matka";
import { useAuth, useTodayExpense } from "@/hooks/useAuth";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "PlayOn — Online Matka Play" },
      { name: "description", content: "Play daily online number markets. Live results and instant plays." },
      { property: "og:title", content: "PlayOn — Online Matka Play" },
      { property: "og:description", content: "Play daily number markets. Instant play." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Index,
});

export const marketsQuery = {
  queryKey: ["markets"],
  queryFn: async () => {
    const { data, error } = await supabase.from("markets").select("*").order("sort_order");
    if (error) throw error;
    return data;
  },
};

function Index() {
  const { data: markets, isLoading } = useQuery(marketsQuery);
  const { user } = useAuth();
  const { data: todayExp } = useTodayExpense(user?.id);

  const isApp = typeof navigator !== "undefined" && (
    navigator.userAgent.includes("PlayOnApp") ||
    (typeof window !== "undefined" && window.matchMedia && window.matchMedia("(display-mode: standalone)").matches)
  );

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      {/* Banner / Header */}
      <section className="mb-6 rounded-2xl border border-primary/20 bg-gradient-to-r from-card via-card/90 to-card p-6 shadow-glow">
        <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
              <Zap className="h-3.5 w-3.5 fill-primary" /> Live Matka Play
            </span>
            <h1 className="mt-2 font-display text-4xl tracking-wide text-gold sm:text-5xl md:text-6xl">
              Online Matka Markets
            </h1>
            <p className="mt-1 text-sm text-muted-foreground sm:text-base">
              Select a market and play your favorite game.
            </p>
            {!isApp && (
              <div className="mt-3.5">
                <a
                  href="/PlayOn.apk"
                  download="PlayOn.apk"
                  className="inline-flex items-center gap-2 rounded-xl border border-primary/40 bg-primary px-4 py-2 text-xs sm:text-sm font-bold text-primary-foreground shadow-md hover:bg-primary/90 transition-all"
                >
                  <Smartphone className="h-4 w-4" /> Download Android App (.apk)
                </a>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* User Today's Expense Only */}
      {user && (
        <section className="mb-6 rounded-xl border border-primary/30 bg-card p-4 sm:p-5 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div>
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Today's Bet (Expense)</span>
            <div className="mt-1 flex items-baseline gap-1.5">
              <span className="font-display text-3xl sm:text-4xl font-bold tracking-wide text-primary">
                ₹{todayExp?.totalExpense ?? 0}
              </span>
              <span className="text-xs text-muted-foreground">total bet played today</span>
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {todayExp?.playsCount ?? 0} {todayExp?.playsCount === 1 ? "bet" : "bets"} played today
            </p>
          </div>

          <Link
            to="/history"
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3.5 py-1.5 text-xs font-semibold text-primary hover:bg-primary/10 transition-colors"
          >
            <History className="h-3.5 w-3.5" /> View My Plays &rarr;
          </Link>
        </section>
      )}

      {/* Markets List */}
      <div className="mb-4 flex items-center justify-between">
        <h2 className="font-display text-3xl tracking-wide text-foreground">Live Bazar Markets</h2>
        <span className="text-xs text-muted-foreground">All times in IST</span>
      </div>

      {isLoading && <p className="text-muted-foreground">Loading markets…</p>}

      <div className="grid gap-4 sm:grid-cols-2">
        {markets?.map((m) => {
          const st = marketStatus(m);
          const done = !!m.close_panna;
          const isOpen = st.state === "open" && !done;
          const badge = isOpen
            ? "bg-success/20 text-success border-success/30"
            : st.state === "upcoming"
              ? "bg-accent/20 text-accent border-accent/30"
              : "bg-destructive/20 text-destructive border-destructive/30";

          return (
            <article
              key={m.id}
              className="relative flex flex-col justify-between overflow-hidden rounded-xl border bg-card p-5 transition-shadow hover:shadow-md"
            >
              {/* Header: Market Name and Live Status */}
              <div>
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-display text-2xl tracking-wide text-foreground">{m.name}</h3>
                  <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${badge}`}>
                    {isOpen && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-success" />}
                    {done ? "Results Declared" : st.note}
                  </span>
                </div>

                {/* Main Digits Display */}
                <div className="my-4 rounded-lg bg-background/60 py-3 text-center">
                  <p className="font-display text-4xl tracking-widest text-primary md:text-5xl">
                    {resultLabel(m.open_panna, m.close_panna)}
                  </p>
                </div>
              </div>

              {/* Bottom: Timing & Direct Play Button */}
              <div className="mt-2 space-y-3">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Clock className="h-3.5 w-3.5" /> Open: <strong className="text-foreground">{fmtTime(m.open_time)}</strong>
                  </span>
                  <span>
                    Close: <strong className="text-foreground">{fmtTime(m.close_time)}</strong>
                  </span>
                </div>

                {/* Direct Play Button - NO Chart button */}
                <Button
                  asChild
                  className="w-full font-semibold shadow-sm"
                  disabled={!isOpen}
                  variant={isOpen ? "default" : "secondary"}
                >
                  <Link to="/play/$marketId" params={{ marketId: m.id }} className="flex items-center justify-center gap-2">
                    <Play className="h-4 w-4 fill-current" />
                    {isOpen ? "Play Now" : done ? "Closed" : "Upcoming"}
                  </Link>
                </Button>
              </div>
            </article>
          );
        })}
      </div>
    </main>
  );
}
