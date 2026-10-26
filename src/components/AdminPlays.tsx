import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Flame, Search, Calendar, Users, Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { gameLabel, fmtIST } from "@/lib/matka";

type Market = { id: string; name: string };

export function AdminPlays({ markets }: { markets: Market[] }) {
  const [dateFilter, setDateFilter] = useState<"today" | "yesterday" | "all">("today");
  const [marketId, setMarketId] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [search, setSearch] = useState<string>("");

  const { data } = useQuery({
    queryKey: ["admin-bets"],
    refetchInterval: 10000,
    queryFn: async () => {
      const { data: bets, error } = await supabase
        .from("bets")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(1000);
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

  // Calculate IST Date strings for Today & Yesterday
  const now = new Date();
  const todayDateStr = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(now);
  const yesterdayDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const yesterdayDateStr = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(yesterdayDate);

  // 1. Filter by Date (Today, Yesterday, or All)
  const dateFilteredBets = useMemo(() => {
    if (!data) return [];
    if (dateFilter === "all") return data;
    const targetDate = dateFilter === "today" ? todayDateStr : yesterdayDateStr;
    return data.filter((b) => {
      const bDate = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date(b.created_at));
      return bDate === targetDate;
    });
  }, [data, dateFilter, todayDateStr, yesterdayDateStr]);

  // 2. Filter by Market, Status, and Search
  const filteredBets = useMemo(() => {
    return dateFilteredBets.filter((b) => {
      if (marketId !== "all" && b.market_id !== marketId) return false;
      if (statusFilter !== "all" && b.status !== statusFilter) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        const matchesPlayer = b.player.toLowerCase().includes(q);
        const matchesNum = b.number.includes(q);
        const matchesMarket = marketName(b.market_id).toLowerCase().includes(q);
        if (!matchesPlayer && !matchesNum && !matchesMarket) return false;
      }
      return true;
    });
  }, [dateFilteredBets, marketId, statusFilter, search, markets]);

  // 3. Top Most played numbers for this selected date
  const top = useMemo(() => {
    const map = new Map<string, { market_id: string; game_type: string; session: string; number: string; points: number; count: number }>();
    for (const b of dateFilteredBets) {
      const k = `${b.market_id}|${b.game_type}|${b.session}|${b.number}`;
      const cur = map.get(k) ?? { market_id: b.market_id, game_type: b.game_type, session: b.session, number: b.number, points: 0, count: 0 };
      cur.points += b.points;
      cur.count += 1;
      map.set(k, cur);
    }
    return [...map.values()].sort((a, b) => b.points - a.points).slice(0, 8);
  }, [dateFilteredBets]);

  const totalPoints = dateFilteredBets.reduce((s, b) => s + b.points, 0);
  const totalPayout = dateFilteredBets.reduce((s, b) => s + (b.payout || 0), 0);
  const totalUniquePlayers = new Set(dateFilteredBets.map((b) => b.user_id)).size;
  const dateLabel = dateFilter === "today" ? "Today" : dateFilter === "yesterday" ? "Yesterday" : "All Time";

  return (
    <section className="space-y-4">
      {/* Overview Stats */}
      <div className="grid gap-3 sm:grid-cols-4">
        <Stat label={`Total Plays (${dateLabel})`} value={dateFilteredBets.length} />
        <Stat label={`Total Amount Played (${dateLabel})`} value={totalPoints} unit="₹" />
        <Stat label={`Total Payouts Won (${dateLabel})`} value={totalPayout} unit="₹" />
        <Stat label={`Active Players (${dateLabel})`} value={totalUniquePlayers} />
      </div>

      {/* Header and Filter Controls */}
      <div className="rounded-xl border bg-card p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-3">
          <div className="flex items-center gap-2">
            <h2 className="font-display text-2xl tracking-wide text-gold">Player Plays Feed</h2>
            <span className="text-xs text-muted-foreground">({dateLabel})</span>
          </div>

          {/* Quick Date Switcher: Today | Yesterday | All Time */}
          <div className="flex items-center gap-1 rounded-lg border bg-secondary/80 p-1 text-xs">
            <button
              type="button"
              onClick={() => setDateFilter("today")}
              className={`rounded px-3 py-1 font-semibold transition-all ${
                dateFilter === "today"
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Today
            </button>
            <button
              type="button"
              onClick={() => setDateFilter("yesterday")}
              className={`rounded px-3 py-1 font-semibold transition-all ${
                dateFilter === "yesterday"
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Yesterday
            </button>
            <button
              type="button"
              onClick={() => setDateFilter("all")}
              className={`rounded px-3 py-1 font-semibold transition-all ${
                dateFilter === "all"
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              All Time
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Search by player or number */}
          <div className="relative flex-1 min-w-[180px]">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search player, market or number…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 h-9 text-xs"
            />
          </div>

          {/* Market filter */}
          <select
            value={marketId}
            onChange={(e) => setMarketId(e.target.value)}
            className="h-9 rounded-md border bg-secondary px-3 text-xs"
          >
            <option value="all">All Markets</option>
            {markets.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>

          {/* Status filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="h-9 rounded-md border bg-secondary px-3 text-xs"
          >
            <option value="all">All Status</option>
            <option value="pending">Pending (Open)</option>
            <option value="won">Won</option>
            <option value="lost">Lost</option>
            <option value="refunded">Refunded</option>
          </select>

          {(search || marketId !== "all" || statusFilter !== "all" || dateFilter !== "today") && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setSearch("");
                setMarketId("all");
                setStatusFilter("all");
                setDateFilter("today");
              }}
              className="text-xs h-9"
            >
              Reset Filters
            </Button>
          )}
        </div>
      </div>

      {/* Most Played Numbers (Hot Bids) */}
      <div className="rounded-xl border bg-card p-4">
        <h3 className="mb-3 flex items-center gap-2 font-semibold text-sm">
          <Flame className="h-4 w-4 text-accent fill-accent" /> High Volume Numbers ({dateLabel})
        </h3>
        {top.length === 0 ? (
          <p className="text-sm text-muted-foreground">No plays recorded yet.</p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-4">
            {top.map((t, i) => (
              <div
                key={i}
                className={`flex items-center justify-between rounded-lg p-2.5 ${
                  i === 0 ? "bg-accent/20 ring-1 ring-accent" : "bg-secondary"
                }`}
              >
                <div>
                  <span className="font-display text-2xl tracking-widest text-primary">{t.number}</span>
                  <div className="text-[11px] text-muted-foreground">
                    {marketName(t.market_id)} · <span className="capitalize">{t.session}</span>
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-semibold text-xs">₹{t.points}</div>
                  <div className="text-[11px] text-muted-foreground">{t.count} plays</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Complete Plays Table with Date & Time */}
      <div className="overflow-x-auto rounded-xl border bg-card">
        <table className="w-full text-xs">
          <thead className="bg-secondary text-left text-muted-foreground">
            <tr>
              <th className="p-3">Date & Time (IST)</th>
              <th>Player</th>
              <th>Market</th>
              <th>Game</th>
              <th>Number</th>
              <th>Amount (₹)</th>
              <th>Status</th>
              <th className="pr-3">Payout (₹)</th>
            </tr>
          </thead>
          <tbody>
            {filteredBets.map((b) => {
              const statusBadge =
                b.status === "won"
                  ? "bg-success/20 text-success font-semibold"
                  : b.status === "lost"
                    ? "bg-destructive/20 text-destructive"
                    : b.status === "pending"
                      ? "bg-primary/20 text-primary font-medium"
                      : "bg-muted text-muted-foreground";

              return (
                <tr key={b.id} className="border-t hover:bg-muted/30">
                  <td className="p-3 font-medium text-foreground whitespace-nowrap">
                    <span className="flex items-center gap-1.5">
                      <Calendar className="h-3 w-3 text-muted-foreground" />
                      {fmtIST(b.created_at)}
                    </span>
                  </td>
                  <td className="font-medium text-foreground">{b.player}</td>
                  <td>{marketName(b.market_id)}</td>
                  <td>
                    {gameLabel(b.game_type)}{" "}
                    <span className="rounded bg-secondary px-1 py-0.5 text-[10px] uppercase text-muted-foreground">
                      {b.session}
                    </span>
                  </td>
                  <td className="font-display text-lg tracking-widest text-primary font-bold">{b.number}</td>
                  <td className="font-semibold">₹{b.points}</td>
                  <td>
                    <span className={`rounded-full px-2 py-0.5 text-[11px] uppercase ${statusBadge}`}>
                      {b.status}
                    </span>
                  </td>
                  <td className="pr-3 font-semibold text-gold">
                    {b.payout > 0 ? `+₹${b.payout}` : "—"}
                  </td>
                </tr>
              );
            })}
            {filteredBets.length === 0 && (
              <tr>
                <td colSpan={8} className="p-8 text-center text-muted-foreground">
                  No plays found matching your criteria.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Stat({ label, value, unit }: { label: string; value: number; unit?: string }) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 font-display text-3xl tracking-wide text-foreground">
        {unit === "₹" && <span className="text-gold font-sans mr-0.5">₹</span>}
        {value.toLocaleString()}
        {unit && unit !== "₹" && <span className="text-xs text-gold font-sans ml-1">{unit}</span>}
      </div>
    </div>
  );
}
