import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Flame } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { gameLabel, fmtIST } from "@/lib/matka";

type Market = { id: string; name: string };

export function AdminPlays({ markets }: { markets: Market[] }) {
  const [marketId, setMarketId] = useState<string>("all");
  const [onlyPending, setOnlyPending] = useState(true);

  const { data } = useQuery({
    queryKey: ["admin-bets", marketId, onlyPending],
    refetchInterval: 10000,
    queryFn: async () => {
      let q = supabase.from("bets").select("*").order("created_at", { ascending: false }).limit(1000);
      if (marketId !== "all") q = q.eq("market_id", marketId);
      if (onlyPending) q = q.eq("status", "pending");
      const { data: bets, error } = await q;
      if (error) throw error;
      const ids = [...new Set(bets.map((b) => b.user_id))];
      const { data: profs } = ids.length
        ? await supabase.from("profiles").select("id, display_name").in("id", ids)
        : { data: [] };
      const names = Object.fromEntries((profs ?? []).map((p) => [p.id, p.display_name ?? "Player"]));
      return bets.map((b) => ({ ...b, player: names[b.user_id] ?? "Player" }));
    },
  });

  const marketName = (id: string) => markets.find((m) => m.id === id)?.name ?? "—";

  // Most played numbers: grouped by market + game + session + number, sorted by total points.
  const top = useMemo(() => {
    const map = new Map<string, { market_id: string; game_type: string; session: string; number: string; points: number; count: number }>();
    for (const b of data ?? []) {
      const k = `${b.market_id}|${b.game_type}|${b.session}|${b.number}`;
      const cur = map.get(k) ?? { market_id: b.market_id, game_type: b.game_type, session: b.session, number: b.number, points: 0, count: 0 };
      cur.points += b.points;
      cur.count += 1;
      map.set(k, cur);
    }
    return [...map.values()].sort((a, b) => b.points - a.points).slice(0, 10);
  }, [data]);

  const total = (data ?? []).reduce((s, b) => s + b.points, 0);

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="mr-auto font-display text-3xl tracking-wide text-gold">Player Plays</h2>
        <select value={marketId} onChange={(e) => setMarketId(e.target.value)}
          className="h-9 rounded-md border bg-secondary px-3 text-sm">
          <option value="all">All markets</option>
          {markets.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
        <Button size="sm" variant={onlyPending ? "default" : "outline"} onClick={() => setOnlyPending(!onlyPending)}>
          {onlyPending ? "Showing open plays" : "Showing all plays"}
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Plays" value={data?.length ?? 0} />
        <Stat label="Total points played" value={total} />
        <Stat label="Players" value={new Set((data ?? []).map((b) => b.user_id)).size} />
      </div>

      <div className="rounded-xl border bg-card p-4">
        <h3 className="mb-3 flex items-center gap-2 font-semibold"><Flame className="h-4 w-4 text-accent" /> Most played numbers</h3>
        {top.length === 0 ? <p className="text-sm text-muted-foreground">No plays yet.</p> : (
          <div className="grid gap-2 sm:grid-cols-2">
            {top.map((t, i) => (
              <div key={i} className={`flex items-center gap-3 rounded-lg p-3 ${i === 0 ? "bg-accent/20 ring-1 ring-accent" : "bg-secondary"}`}>
                <span className="font-display text-3xl tracking-widest text-primary">{t.number}</span>
                <div className="text-xs text-muted-foreground">
                  <div className="text-sm text-foreground">{gameLabel(t.game_type)} · <span className="capitalize">{t.session}</span></div>
                  {marketName(t.market_id)}
                </div>
                <div className="ml-auto text-right">
                  <div className="font-semibold">{t.points} pts</div>
                  <div className="text-xs text-muted-foreground">{t.count} plays</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="overflow-x-auto rounded-xl border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-secondary text-left text-muted-foreground">
            <tr><th className="p-3">Player</th><th>Market</th><th>Game</th><th>Number</th><th>Points</th><th>Status</th><th className="pr-3">Time</th></tr>
          </thead>
          <tbody>
            {data?.map((b) => (
              <tr key={b.id} className="border-t">
                <td className="p-3 font-medium">{b.player}</td>
                <td>{marketName(b.market_id)}</td>
                <td>{gameLabel(b.game_type)} <span className="text-xs capitalize text-muted-foreground">{b.session}</span></td>
                <td className="font-display text-xl tracking-widest">{b.number}</td>
                <td>{b.points}</td>
                <td className="capitalize">{b.status}{b.payout > 0 && ` +${b.payout}`}</td>
                <td className="pr-3 text-xs text-muted-foreground">{fmtIST(b.created_at)} IST</td>
              </tr>
            ))}
            {data?.length === 0 && <tr><td colSpan={7} className="p-6 text-center text-muted-foreground">No plays found.</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="font-display text-3xl tracking-wide">{value}</div>
    </div>
  );
}
