import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Clock, Play, Zap, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { fmtTime, resultLabel, marketStatus, GAMES } from "@/lib/matka";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "PlayOn — Online Matka Play" },
      { name: "description", content: "Play daily online number markets with free points. Live results and instant plays." },
      { property: "og:title", content: "PlayOn — Online Matka Play" },
      { property: "og:description", content: "Play daily number markets with free points. Instant play, no real money." },
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

const PLAY_RATES = [
  { game: "Single Digit", rate: "10 ka 90", mult: "1 : 9" },
  { game: "Jodi", rate: "10 ka 900", mult: "1 : 90" },
  { game: "Single Panna", rate: "10 ka 1400", mult: "1 : 140" },
  { game: "Double Panna", rate: "10 ka 2800", mult: "1 : 280" },
  { game: "Triple Panna", rate: "10 ka 6000", mult: "1 : 600" },
  { game: "Half Sangam", rate: "10 ka 10,000", mult: "1 : 1000" },
  { game: "Full Sangam", rate: "10 ka 1,00,000", mult: "1 : 10,000" },
];

function Index() {
  const { data: markets, isLoading } = useQuery(marketsQuery);

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
              1000 free bonus points on signup. Select a market and play your favorite game.
            </p>
            <div className="mt-3.5">
              <a
                href="/PlayOn.apk"
                download="PlayOn.apk"
                className="inline-flex items-center gap-2 rounded-xl border border-primary/40 bg-primary px-4 py-2 text-xs sm:text-sm font-bold text-primary-foreground shadow-md hover:bg-primary/90 transition-all"
              >
                <Smartphone className="h-4 w-4" /> Download Android App (.apk)
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* Matka Play Rate Section (Inspired by matkaplay.xyz) */}
      <section className="mb-8 rounded-xl border bg-card p-5">
        <div className="mb-4 flex items-center justify-between border-b pb-3">
          <h2 className="font-display text-2xl tracking-wide text-primary">Matka Play Rates</h2>
          <span className="text-xs text-muted-foreground">Winning Payouts</span>
        </div>
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4 md:grid-cols-7">
          {PLAY_RATES.map((r) => (
            <div
              key={r.game}
              className="flex flex-col items-center justify-center rounded-lg border border-border/60 bg-background/50 p-3 text-center transition-colors hover:border-primary/50"
            >
              <span className="text-xs font-medium text-muted-foreground">{r.game}</span>
              <span className="mt-1 font-display text-lg tracking-wide text-gold">{r.rate}</span>
              <span className="text-[11px] text-muted-foreground/80">{r.mult}</span>
            </div>
          ))}
        </div>
      </section>

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
