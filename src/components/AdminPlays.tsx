import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Flame,
  Search,
  Calendar,
  Users,
  Trophy,
  AlertTriangle,
  Layers,
  Hash,
  Sparkles,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { gameLabel, fmtIST } from "@/lib/matka";

type Market = { id: string; name: string };

export function AdminPlays({ markets }: { markets: Market[] }) {
  const [dateFilter, setDateFilter] = useState<"today" | "yesterday" | "custom" | "all">("today");
  const [customDate, setCustomDate] = useState<string>(() => {
    return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
  });
  const [marketId, setMarketId] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [search, setSearch] = useState<string>("");

  // Specific Market & Session Filter for High Volume analysis
  const [hvMarketId, setHvMarketId] = useState<string>(() => markets[0]?.id || "all");
  const [hvSession, setHvSession] = useState<"all" | "open" | "close">("all");
  const [expandedSections, setExpandedSections] = useState<{ single: boolean; jodi: boolean; panna: boolean }>({
    single: false,
    jodi: false,
    panna: false,
  });

  // Calculate IST Date strings for Today & Yesterday
  const now = new Date();
  const todayDateStr = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(now);
  const yesterdayDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const yesterdayDateStr = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(yesterdayDate);

  const selectedTargetDate =
    dateFilter === "today"
      ? todayDateStr
      : dateFilter === "yesterday"
        ? yesterdayDateStr
        : customDate;

  const { data } = useQuery({
    queryKey: ["admin-bets", dateFilter, selectedTargetDate],
    refetchInterval: 10000,
    queryFn: async () => {
      let query = supabase.from("bets").select("*").order("created_at", { ascending: false });

      if (dateFilter !== "all" && selectedTargetDate) {
        const startIso = new Date(`${selectedTargetDate}T00:00:00+05:30`).toISOString();
        const endIso = new Date(`${selectedTargetDate}T23:59:59.999+05:30`).toISOString();
        query = query.gte("created_at", startIso).lte("created_at", endIso);
      } else {
        query = query.limit(1000);
      }

      const { data: bets, error } = await query;
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

  // 1. Filter by Date (Today, Yesterday, Custom Date, or All)
  const dateFilteredBets = useMemo(() => {
    if (!data) return [];
    if (dateFilter === "all") return data;
    return data.filter((b) => {
      const bDate = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date(b.created_at));
      return bDate === selectedTargetDate;
    });
  }, [data, dateFilter, selectedTargetDate]);

  // 2. Filter by Market, Status, and Search for general table
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

  // High Volume Market Resolution:
  // If user selected a specific market in the main filter, use it. Otherwise use the HV market picker.
  const activeHvMarketId = marketId !== "all" ? marketId : hvMarketId;
  const targetMarketName =
    markets.find((m) => m.id === activeHvMarketId)?.name ??
    (activeHvMarketId === "all" ? "All Markets Combined" : "—");

  // Filter bets specifically for High Volume analysis on this specific market & date
  const marketHvBets = useMemo(() => {
    return dateFilteredBets.filter((b) => {
      if (activeHvMarketId !== "all" && b.market_id !== activeHvMarketId) return false;
      if (hvSession !== "all" && b.session !== hvSession) return false;
      return true;
    });
  }, [dateFilteredBets, activeHvMarketId, hvSession]);

  const marketHvTotalPoints = useMemo(() => marketHvBets.reduce((sum, b) => sum + b.points, 0), [marketHvBets]);
  const marketHvTotalPlays = marketHvBets.length;

  // 1. Single Digits (Ank 0-9) High Volume
  const highVolumeSingle = useMemo(() => {
    const map = new Map<string, { number: string; session: string; points: number; count: number; liability: number }>();
    for (const b of marketHvBets) {
      if (b.game_type === "single" || b.game_type === "ank_bulk") {
        const k = `${b.session}|${b.number}`;
        const cur = map.get(k) ?? { number: b.number, session: b.session, points: 0, count: 0, liability: 0 };
        cur.points += b.points;
        cur.count += 1;
        cur.liability += b.points * 9; // Single digit rate: 9x
        map.set(k, cur);
      }
    }
    return [...map.values()].sort((a, b) => b.points - a.points);
  }, [marketHvBets]);

  // 2. Jodi (00-99) High Volume
  const highVolumeJodi = useMemo(() => {
    const map = new Map<string, { number: string; session: string; points: number; count: number; liability: number }>();
    for (const b of marketHvBets) {
      if (b.game_type === "jodi" || b.game_type === "jodi_bulk" || b.game_type === "family_jodi") {
        const k = b.number;
        const cur = map.get(k) ?? { number: b.number, session: "close", points: 0, count: 0, liability: 0 };
        cur.points += b.points;
        cur.count += 1;
        cur.liability += b.points * 90; // Jodi rate: 90x
        map.set(k, cur);
      }
    }
    return [...map.values()].sort((a, b) => b.points - a.points);
  }, [marketHvBets]);

  // 3. Panna (Single, Double, Triple Panna) High Volume
  const highVolumePanna = useMemo(() => {
    const map = new Map<string, { number: string; session: string; game_type: string; points: number; count: number; liability: number }>();
    for (const b of marketHvBets) {
      if (
        b.game_type === "single_panna" ||
        b.game_type === "double_panna" ||
        b.game_type === "triple_panna" ||
        b.game_type === "panna" ||
        b.game_type === "family_panna"
      ) {
        const k = `${b.session}|${b.number}`;
        const distinct = new Set(b.number.split("")).size;
        const mult = distinct === 1 ? 600 : distinct === 2 ? 280 : 140;
        const cur = map.get(k) ?? { number: b.number, session: b.session, game_type: b.game_type, points: 0, count: 0, liability: 0 };
        cur.points += b.points;
        cur.count += 1;
        cur.liability += b.points * mult;
        map.set(k, cur);
      }
    }
    return [...map.values()].sort((a, b) => b.points - a.points);
  }, [marketHvBets]);

  const totalPoints = dateFilteredBets.reduce((s, b) => s + b.points, 0);
  const totalPayout = dateFilteredBets.reduce((s, b) => s + (b.payout || 0), 0);
  const totalUniquePlayers = new Set(dateFilteredBets.map((b) => b.user_id)).size;
  const dateLabel =
    dateFilter === "today"
      ? "Today"
      : dateFilter === "yesterday"
        ? "Yesterday"
        : dateFilter === "custom"
          ? customDate
          : "All Time";

  return (
    <section className="space-y-6">
      {/* Overview Stats */}
      <div className="grid gap-3 sm:grid-cols-4">
        <Stat label={`Total Plays (${dateLabel})`} value={dateFilteredBets.length} />
        <Stat label={`Total Amount Played (${dateLabel})`} value={totalPoints} unit="₹" />
        <Stat label={`Total Payouts Won (${dateLabel})`} value={totalPayout} unit="₹" />
        <Stat label={`Active Players (${dateLabel})`} value={totalUniquePlayers} />
      </div>

      {/* Filter Toolbar with Specific Date & Search */}
      <div className="rounded-xl border bg-card p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-3">
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-gold" />
            <span className="font-semibold text-xs text-foreground">Date Filter:</span>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 text-xs">
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

            {/* Specific Date Picker */}
            <div
              className={`flex items-center gap-1.5 rounded px-2.5 py-1 border transition-all ${
                dateFilter === "custom"
                  ? "bg-primary/20 border-primary text-foreground shadow-sm ring-1 ring-primary/40"
                  : "border-border/60 bg-background/60 text-muted-foreground hover:text-foreground"
              }`}
            >
              <Calendar className="h-3.5 w-3.5 text-primary shrink-0" />
              <span className="font-semibold text-[11px] hidden sm:inline">Date:</span>
              <input
                type="date"
                value={customDate}
                max={todayDateStr}
                onChange={(e) => {
                  if (e.target.value) {
                    setCustomDate(e.target.value);
                    setDateFilter("custom");
                  }
                }}
                onClick={() => setDateFilter("custom")}
                className="bg-transparent text-xs font-bold text-foreground focus:outline-none cursor-pointer"
                title="Select specific date"
              />
            </div>

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
            onChange={(e) => {
              const val = e.target.value;
              setMarketId(val);
              if (val !== "all") setHvMarketId(val);
            }}
            className="h-9 rounded-md border bg-secondary px-3 text-xs"
          >
            <option value="all">All Markets (Table)</option>
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
                setCustomDate(todayDateStr);
              }}
              className="text-xs h-9"
            >
              Reset Filters
            </Button>
          )}
        </div>
      </div>

      {/* ========================================================================= */}
      {/* MARKET SPECIFIC HIGH VOLUME ANALYZER (TOP 3 HIGHLIGHTED IN RED)           */}
      {/* ========================================================================= */}
      <div className="rounded-2xl border-2 border-gold/40 bg-card p-4 space-y-4 shadow-sm">
        {/* Market Selector & Session Toggle Bar */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b pb-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-red-500/15 text-red-500 border border-red-500/30">
                <Flame className="h-4 w-4 fill-red-500" />
              </span>
              <div>
                <h3 className="font-display text-xl tracking-wide text-foreground flex items-center gap-2">
                  Market High Volume Numbers
                  <span className="rounded-md bg-red-500/15 border border-red-500/30 text-red-500 font-bold text-[11px] px-2 py-0.5">
                    Top 3 in Red (Danger)
                  </span>
                </h3>
                <p className="text-xs text-muted-foreground">
                  Analyzing risk for <strong className="text-gold">{targetMarketName}</strong> ({dateLabel})
                </p>
              </div>
            </div>
          </div>

          {/* Session toggle buttons */}
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-semibold text-muted-foreground">Session:</span>
            <div className="flex rounded-lg border bg-secondary/70 p-0.5 text-xs">
              <button
                type="button"
                onClick={() => setHvSession("all")}
                className={`rounded-md px-2.5 py-1 font-bold transition-all ${
                  hvSession === "all" ? "bg-primary text-primary-foreground shadow" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                All
              </button>
              <button
                type="button"
                onClick={() => setHvSession("open")}
                className={`rounded-md px-2.5 py-1 font-bold transition-all ${
                  hvSession === "open" ? "bg-emerald-600 text-white shadow" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                OPEN
              </button>
              <button
                type="button"
                onClick={() => setHvSession("close")}
                className={`rounded-md px-2.5 py-1 font-bold transition-all ${
                  hvSession === "close" ? "bg-blue-600 text-white shadow" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                CLOSE
              </button>
            </div>
          </div>
        </div>

        {/* Quick Market Pills Scroll */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-[11px] font-semibold text-muted-foreground px-0.5">
            <span>Select Market for Specific Exposure:</span>
            <span>
              Total Volume: <strong className="text-gold">₹{marketHvTotalPoints.toLocaleString("en-IN")}</strong> ({marketHvTotalPlays} Plays)
            </span>
          </div>
          <div className="flex gap-1.5 overflow-x-auto no-scrollbar py-1">
            <button
              type="button"
              onClick={() => {
                setHvMarketId("all");
                if (marketId !== "all") setMarketId("all");
              }}
              className={`rounded-lg px-3 py-1.5 text-xs font-bold whitespace-nowrap transition-all ${
                activeHvMarketId === "all"
                  ? "bg-primary text-primary-foreground shadow-sm ring-1 ring-primary"
                  : "border bg-secondary text-muted-foreground hover:text-foreground"
              }`}
            >
              All Markets
            </button>
            {markets.map((m) => {
              const isActive = activeHvMarketId === m.id;
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => {
                    setHvMarketId(m.id);
                    if (marketId !== "all") setMarketId(m.id);
                  }}
                  className={`rounded-lg px-3 py-1.5 text-xs font-bold whitespace-nowrap transition-all ${
                    isActive
                      ? "bg-gold text-slate-950 font-black shadow-md ring-2 ring-gold scale-105"
                      : "border bg-card text-foreground hover:border-gold hover:bg-secondary"
                  }`}
                >
                  {m.name}
                </button>
              );
            })}
          </div>
        </div>

        {/* ===================================================================== */}
        {/* 1. SEPARATE BOX: SINGLE DIGITS (ANK 0-9) HIGH VOLUME                  */}
        {/* ===================================================================== */}
        <div className="rounded-xl border border-border/80 bg-background/60 p-4 space-y-3">
          <div className="flex items-center justify-between border-b pb-2">
            <div className="flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-md bg-primary/10 text-primary">
                <Hash className="h-4 w-4" />
              </span>
              <h4 className="font-display text-base font-bold text-foreground">
                Single Digit (Ank 0-9) — High Volume
              </h4>
              <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-bold text-muted-foreground border">
                {highVolumeSingle.length} Active Numbers
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="rounded-md bg-secondary/80 px-2 py-0.5 text-[10px] font-bold text-gold">
                Rate: 9×
              </span>
              {highVolumeSingle.length > 8 && (
                <button
                  type="button"
                  onClick={() => setExpandedSections((prev) => ({ ...prev, single: !prev.single }))}
                  className="text-xs text-primary hover:underline font-semibold flex items-center gap-0.5"
                >
                  {expandedSections.single ? (
                    <>Show Less <ChevronUp className="h-3 w-3" /></>
                  ) : (
                    <>View All ({highVolumeSingle.length}) <ChevronDown className="h-3 w-3" /></>
                  )}
                </button>
              )}
            </div>
          </div>

          {highVolumeSingle.length === 0 ? (
            <p className="text-xs text-muted-foreground py-2 text-center">
              No Single Digit plays recorded for {targetMarketName} on this date.
            </p>
          ) : (
            <div className="grid gap-2.5 sm:grid-cols-2 md:grid-cols-4">
              {(expandedSections.single ? highVolumeSingle : highVolumeSingle.slice(0, 8)).map((item, index) => (
                <VolumeCard
                  key={`single-${item.session}-${item.number}`}
                  item={item}
                  index={index}
                  multLabel="9×"
                />
              ))}
            </div>
          )}
        </div>

        {/* ===================================================================== */}
        {/* 2. SEPARATE BOX: JODI (00-99) HIGH VOLUME                             */}
        {/* ===================================================================== */}
        <div className="rounded-xl border border-border/80 bg-background/60 p-4 space-y-3">
          <div className="flex items-center justify-between border-b pb-2">
            <div className="flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-md bg-primary/10 text-primary">
                <Layers className="h-4 w-4" />
              </span>
              <h4 className="font-display text-base font-bold text-foreground">
                Jodi (00 to 99) — High Volume
              </h4>
              <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-bold text-muted-foreground border">
                {highVolumeJodi.length} Active Jodis
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="rounded-md bg-secondary/80 px-2 py-0.5 text-[10px] font-bold text-gold">
                Rate: 90×
              </span>
              {highVolumeJodi.length > 8 && (
                <button
                  type="button"
                  onClick={() => setExpandedSections((prev) => ({ ...prev, jodi: !prev.jodi }))}
                  className="text-xs text-primary hover:underline font-semibold flex items-center gap-0.5"
                >
                  {expandedSections.jodi ? (
                    <>Show Less <ChevronUp className="h-3 w-3" /></>
                  ) : (
                    <>View All ({highVolumeJodi.length}) <ChevronDown className="h-3 w-3" /></>
                  )}
                </button>
              )}
            </div>
          </div>

          {highVolumeJodi.length === 0 ? (
            <p className="text-xs text-muted-foreground py-2 text-center">
              No Jodi plays recorded for {targetMarketName} on this date.
            </p>
          ) : (
            <div className="grid gap-2.5 sm:grid-cols-2 md:grid-cols-4">
              {(expandedSections.jodi ? highVolumeJodi : highVolumeJodi.slice(0, 8)).map((item, index) => (
                <VolumeCard
                  key={`jodi-${item.number}`}
                  item={item}
                  index={index}
                  multLabel="90×"
                />
              ))}
            </div>
          )}
        </div>

        {/* ===================================================================== */}
        {/* 3. SEPARATE BOX: PANNA (SINGLE, DOUBLE, TRIPLE) HIGH VOLUME          */}
        {/* ===================================================================== */}
        <div className="rounded-xl border border-border/80 bg-background/60 p-4 space-y-3">
          <div className="flex items-center justify-between border-b pb-2">
            <div className="flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-md bg-primary/10 text-primary">
                <Sparkles className="h-4 w-4 text-gold" />
              </span>
              <h4 className="font-display text-base font-bold text-foreground">
                Panna (Single, Double, Triple Panna) — High Volume
              </h4>
              <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-bold text-muted-foreground border">
                {highVolumePanna.length} Active Pannas
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="rounded-md bg-secondary/80 px-2 py-0.5 text-[10px] font-bold text-gold">
                Rate: 140× – 600×
              </span>
              {highVolumePanna.length > 8 && (
                <button
                  type="button"
                  onClick={() => setExpandedSections((prev) => ({ ...prev, panna: !prev.panna }))}
                  className="text-xs text-primary hover:underline font-semibold flex items-center gap-0.5"
                >
                  {expandedSections.panna ? (
                    <>Show Less <ChevronUp className="h-3 w-3" /></>
                  ) : (
                    <>View All ({highVolumePanna.length}) <ChevronDown className="h-3 w-3" /></>
                  )}
                </button>
              )}
            </div>
          </div>

          {highVolumePanna.length === 0 ? (
            <p className="text-xs text-muted-foreground py-2 text-center">
              No Panna plays recorded for {targetMarketName} on this date.
            </p>
          ) : (
            <div className="grid gap-2.5 sm:grid-cols-2 md:grid-cols-4">
              {(expandedSections.panna ? highVolumePanna : highVolumePanna.slice(0, 8)).map((item, index) => (
                <VolumeCard
                  key={`panna-${item.session}-${item.number}`}
                  item={item}
                  index={index}
                  multLabel="Panna"
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ========================================================================= */}
      {/* COMPLETE PLAYS AUDIT TABLE WITH DATE & TIME                               */}
      {/* ========================================================================= */}
      <div className="space-y-2">
        <div className="flex items-center justify-between px-1">
          <h3 className="font-semibold text-sm text-foreground">
            All Individual Plays Log ({filteredBets.length} Records)
          </h3>
          <span className="text-xs text-muted-foreground">Live updates every 10s</span>
        </div>

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
                      : b.status === "refunded"
                        ? "bg-muted text-muted-foreground"
                        : "bg-warning/20 text-warning font-semibold";

                return (
                  <tr key={b.id} className="border-t hover:bg-secondary/50 transition-colors">
                    <td className="p-3 text-muted-foreground whitespace-nowrap font-mono text-[11px]">
                      {fmtIST(b.created_at)}
                    </td>
                    <td className="font-medium text-foreground">{b.player}</td>
                    <td>{marketName(b.market_id)}</td>
                    <td>
                      {gameLabel(b.game_type)}{" "}
                      <span className="text-[10px] capitalize text-muted-foreground">({b.session})</span>
                    </td>
                    <td className="font-display text-base font-bold tracking-wider text-primary">{b.number}</td>
                    <td className="font-semibold text-foreground">₹{b.points}</td>
                    <td>
                      <span className={`rounded px-2 py-0.5 text-[10px] uppercase tracking-wide ${statusBadge}`}>
                        {b.status}
                      </span>
                    </td>
                    <td className="pr-3 font-semibold text-success">
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
      </div>
    </section>
  );
}

// Volume Card Component with Top 3 Red Highlight
function VolumeCard({
  item,
  index,
  multLabel,
}: {
  item: { number: string; session?: string; points: number; count: number; liability?: number };
  index: number;
  multLabel?: string;
}) {
  const isTop3 = index < 3;
  return (
    <div
      className={`relative overflow-hidden rounded-xl p-3 transition-all flex flex-col justify-between ${
        index === 0
          ? "border-2 border-red-500 bg-red-500/15 dark:bg-red-950/40 shadow-md shadow-red-500/20 ring-1 ring-red-500"
          : index === 1
            ? "border-2 border-red-500/80 bg-red-500/10 dark:bg-red-950/30 shadow-sm ring-1 ring-red-500/50"
            : index === 2
              ? "border-2 border-red-500/60 bg-red-500/10 dark:bg-red-950/20 ring-1 ring-red-500/30"
              : "border border-border/80 bg-secondary/40 hover:bg-secondary/70 text-foreground"
      }`}
    >
      {/* Top Header Row with Rank Badge and Session */}
      <div className="flex items-center justify-between gap-1 mb-1.5">
        <div className="flex items-center gap-1.5">
          {isTop3 ? (
            <span
              className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-black tracking-wide text-white shadow-xs ${
                index === 0 ? "bg-red-600 animate-pulse" : index === 1 ? "bg-red-600/90" : "bg-red-700/90"
              }`}
            >
              <Flame className="h-3 w-3 fill-white shrink-0" />
              TOP {index + 1}
            </span>
          ) : (
            <span className="rounded-md bg-muted px-2 py-0.5 text-[10px] font-bold text-muted-foreground">
              #{index + 1}
            </span>
          )}

          {item.session && item.session !== "all" && (
            <span
              className={`rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider ${
                item.session === "open"
                  ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30"
                  : "bg-blue-500/15 text-blue-600 dark:text-blue-400 border border-blue-500/30"
              }`}
            >
              {item.session}
            </span>
          )}
        </div>

        <span className="text-[11px] font-semibold text-muted-foreground">
          {item.count} {item.count === 1 ? "play" : "plays"}
        </span>
      </div>

      {/* Main Number Display */}
      <div className="my-1 flex items-baseline justify-between">
        <div>
          <span
            className={`font-display tracking-widest block leading-none ${
              isTop3
                ? "text-3xl font-black text-red-500 drop-shadow-xs"
                : "text-2xl font-bold text-foreground"
            }`}
          >
            {item.number}
          </span>
          {multLabel && (
            <span className="text-[10px] text-muted-foreground font-medium">
              Rate: {multLabel}
            </span>
          )}
        </div>

        {/* Total Points */}
        <div className="text-right">
          <span className="block text-[10px] uppercase font-bold text-muted-foreground">Bet Volume</span>
          <span
            className={`font-mono text-base font-black ${
              isTop3 ? "text-red-500" : "text-gold"
            }`}
          >
            ₹{item.points.toLocaleString("en-IN")}
          </span>
        </div>
      </div>

      {/* Liability Warning Bar */}
      {item.liability !== undefined && item.liability > 0 && (
        <div
          className={`mt-2 flex items-center justify-between rounded-lg px-2 py-1 text-[10px] font-bold border ${
            isTop3
              ? "bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/30"
              : "bg-secondary text-muted-foreground border-border/60"
          }`}
        >
          <span className="flex items-center gap-1">
            {isTop3 && <AlertTriangle className="h-3 w-3 shrink-0" />}
            Payout Liability:
          </span>
          <span className="font-mono">₹{item.liability.toLocaleString("en-IN")}</span>
        </div>
      )}
    </div>
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
