import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { fmtTime, resultLabel, marketStatus } from "@/lib/matka";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "PlayOn — Free Points Number Game" },
      { name: "description", content: "Play daily number markets with free points. Live results, no real money." },
      { property: "og:title", content: "PlayOn — Free Points Number Game" },
      { property: "og:description", content: "Play daily number markets with free points. No real money." },
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

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <section className="mb-8 rounded-2xl border bg-card p-6 shadow-glow">
        <h1 className="font-display text-5xl tracking-wide text-gold md:text-6xl">Today's Markets</h1>
        <p className="mt-2 max-w-xl text-muted-foreground">
          Every new player gets 1000 free points. Pick a market, choose your number, and watch the results. Just for fun — no real money.
        </p>
      </section>

      {isLoading && <p className="text-muted-foreground">Loading markets…</p>}
      <div className="grid gap-4 sm:grid-cols-2">
        {markets?.map((m) => {
          const st = marketStatus(m);
          const done = !!m.close_panna;
          const badge = st.state === "open" && !done ? "bg-success/20 text-success" : st.state === "upcoming" ? "bg-accent/20 text-accent" : "bg-destructive/20 text-destructive";
          return (
            <article key={m.id} className="rounded-xl border bg-card p-5">
              <div className="flex items-start justify-between">
                <h2 className="font-display text-2xl tracking-wide">{m.name}</h2>
                <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${badge}`}>
                  {done ? "Results declared" : st.note}
                </span>
              </div>
              <p className="my-3 font-display text-4xl tracking-widest text-primary">{resultLabel(m.open_panna, m.close_panna)}</p>
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1 text-sm text-muted-foreground">
                  <Clock className="h-4 w-4" /> {fmtTime(m.open_time)} – {fmtTime(m.close_time)}
                </span>
                <div className="flex gap-2">
                  <Button asChild variant="secondary" size="sm">
                    <Link to="/chart/$marketId" params={{ marketId: m.id }}>Chart</Link>
                  </Button>
                  <Button asChild size="sm" disabled={st.state !== "open" || done}>
                    <Link to="/play/$marketId" params={{ marketId: m.id }}>Play</Link>
                  </Button>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </main>
  );
}
