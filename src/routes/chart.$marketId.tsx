import { useMemo } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import { fmtTime, resultLabel, pannaDigit } from "@/lib/matka";

export const Route = createFileRoute("/chart/$marketId")({
  head: () => ({
    meta: [
      { title: "Result Chart — PlayOn" },
      { name: "description", content: "Day-by-day result chart for this market: open panna, jodi and close panna." },
      { property: "og:title", content: "Result Chart — PlayOn" },
      { property: "og:description", content: "Past results of this market, day by day. Free points game, no real money." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ChartPage,
});

function ChartPage() {
  const { marketId } = Route.useParams();

  const { data: m } = useQuery({
    queryKey: ["market", marketId],
    queryFn: async () => (await supabase.from("markets").select("*").eq("id", marketId).single()).data,
  });
  const { data: results } = useQuery({
    queryKey: ["chart", marketId],
    refetchInterval: 30000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("results")
        .select("result_date, session, panna")
        .eq("market_id", marketId)
        .order("result_date", { ascending: false })
        .order("session");
      if (error) throw error;
      return data as { result_date: string; session: string; panna: string }[];
    },
  });

  const rows = useMemo<[string, { open?: string; close?: string }][]>(() => {
    const map = new Map<string, { open?: string; close?: string }>();
    for (const r of results ?? []) {
      const cur = map.get(r.result_date) ?? {};
      if (r.session === "open") cur.open = r.panna;
      else cur.close = r.panna;
      map.set(r.result_date, cur);
    }
    return [...map.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [results]);

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      {!m ? (
        <p className="text-muted-foreground">Loading…</p>
      ) : (
        <>
          <div className="rounded-2xl border bg-card p-6 shadow-glow">
            <h1 className="font-display text-4xl tracking-wide text-gold">{m.name}</h1>
            <p className="text-sm text-muted-foreground">{fmtTime(m.open_time)} – {fmtTime(m.close_time)}</p>
            <p className="my-4 font-display text-4xl tracking-widest text-primary">{resultLabel(m.open_panna, m.close_panna)}</p>
            <Link to="/play/$marketId" params={{ marketId }} className="text-sm text-accent underline">Play this market</Link>
          </div>

          <section className="mt-6 rounded-xl border bg-card">
            <h2 className="border-b p-4 font-display text-2xl tracking-wide">Result Chart</h2>
            {rows.length === 0 ? (
              <p className="p-6 text-sm text-muted-foreground">No results declared yet.</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-secondary text-left text-muted-foreground">
                  <tr><th className="p-3">Date</th><th>Open Panna</th><th>Jodi</th><th>Close Panna</th></tr>
                </thead>
                <tbody>
                  {rows.map(([date, r]) => {
                    const od = pannaDigit(r.open);
                    const cd = pannaDigit(r.close);
                    return (
                      <tr key={date} className="border-t">
                        <td className="p-3 text-muted-foreground">{date}</td>
                        <td className="font-display text-xl tracking-widest">{r.open ?? "***"}</td>
                        <td className="font-display text-xl tracking-widest text-gold">{od !== null && cd !== null ? `${od}${cd}` : "**"}</td>
                        <td className="font-display text-xl tracking-widest">{r.close ?? "***"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </section>
        </>
      )}
    </main>
  );
}
