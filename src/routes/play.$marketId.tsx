import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, Calendar, Clock, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, useProfile, useTodayExpense } from "@/hooks/useAuth";
import { GAMES, PLAYABLE, type GameType, fmtTime, resultLabel, isOpenPast, isClosePast } from "@/lib/matka";
import {
  SINGLE_PANNA_BY_ANK,
  DOUBLE_PANNA_BY_ANK,
  TRIPLE_PANNAS,
  SINGLE_DIGITS,
  JODI_BY_ROW,
} from "@/lib/pannaChartData";

export const Route = createFileRoute("/play/$marketId")({
  head: () => ({
    meta: [
      { title: "Play Market — Select Panna" },
      { name: "description", content: "Choose your number and place bets with points." },
    ],
  }),
  component: PlayPage,
});

const ANK_LIST = [1, 2, 3, 4, 5, 6, 7, 8, 9, 0];
const POINT_PRESETS = [5, 10, 20, 50, 100, 200, 500];

function PlayPage() {
  const { marketId } = Route.useParams();
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const { data: profile } = useProfile(user?.id);
  const { data: todayExp } = useTodayExpense(user?.id);
  const qc = useQueryClient();

  const [game, setGame] = useState<GameType>("single_panna");
  const [session, setSession] = useState<"open" | "close">("open");
  // Single selection only (no multi-select)
  const [selectedNumber, setSelectedNumber] = useState<string | null>(null);
  // Default points starts from 5
  const [points, setPoints] = useState<number>(5);
  const [busy, setBusy] = useState(false);

  // Jodi Bulk state
  const [selectedJodis, setSelectedJodis] = useState<string[]>([]);
  const [jodiPoints, setJodiPoints] = useState<Record<string, number>>({});

  // Ank Bulk state (digits 0 to 9)
  const [ankPoints, setAnkPoints] = useState<Record<number, number>>({});

  // Manual input state for Sangam
  const [sangamPart1, setSangamPart1] = useState("");
  const [sangamPart2, setSangamPart2] = useState("");

  const { data: m } = useQuery({
    queryKey: ["market", marketId],
    queryFn: async () => (await supabase.from("markets").select("*").eq("id", marketId).single()).data,
  });

  const todayIST = new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date());

  const g = GAMES[game];
  // Check if Open timing has passed or open result declared
  const openClosed = m ? isOpenPast(m) : false;
  // Check if Close timing has passed or close result declared
  const marketClosed = m ? isClosePast(m) : false;

  // If Open timing has passed or game is close-only, session MUST be "close"
  const effSession: "open" | "close" = g.closeOnly ? "close" : openClosed ? "close" : session;

  const handleGameChange = (newGame: GameType) => {
    if (openClosed && GAMES[newGame].closeOnly) {
      toast.error(`${GAMES[newGame].label} is closed because Open timing (${fmtTime(m?.open_time || "")}) has passed.`);
      return;
    }
    setGame(newGame);
    setSelectedNumber(null);
    setSelectedJodis([]);
    setJodiPoints({});
    setAnkPoints({});
    setSangamPart1("");
    setSangamPart2("");
  };

  const selectNumber = (num: string) => {
    // Only one number selected at a time (toggle if tapped again)
    setSelectedNumber((prev) => (prev === num ? null : num));
  };

  const clearSelection = () => {
    setSelectedNumber(null);
  };

  // Jodi Bulk helpers
  const toggleJodi = (jodi: string) => {
    setSelectedJodis((prev) => {
      if (prev.includes(jodi)) {
        const next = prev.filter((x) => x !== jodi);
        setJodiPoints((pts) => {
          const copy = { ...pts };
          delete copy[jodi];
          return copy;
        });
        return next;
      } else {
        setJodiPoints((pts) => ({ ...pts, [jodi]: pts[jodi] || points || 5 }));
        return [...prev, jodi];
      }
    });
  };

  const removeJodi = (jodi: string) => {
    setSelectedJodis((prev) => prev.filter((x) => x !== jodi));
    setJodiPoints((pts) => {
      const copy = { ...pts };
      delete copy[jodi];
      return copy;
    });
  };

  const setAllJodiPoints = (pts: number) => {
    setPoints(pts);
    const updated: Record<string, number> = {};
    for (const j of selectedJodis) {
      updated[j] = pts;
    }
    setJodiPoints(updated);
  };

  const totalJodiPoints = selectedJodis.reduce((sum, j) => sum + (jodiPoints[j] || 5), 0);

  // Ank Bulk helpers
  const setAnkPoint = (digit: number, pts: number) => {
    setAnkPoints((prev) => ({ ...prev, [digit]: pts }));
  };

  const fillAllAnkPoints = (pts: number) => {
    const updated: Record<number, number> = {};
    for (let d = 0; d <= 9; d++) {
      updated[d] = pts;
    }
    setAnkPoints(updated);
  };

  const clearAllAnkPoints = () => {
    setAnkPoints({});
  };

  const activeAnkEntries = Object.entries(ankPoints)
    .filter(([_, pts]) => typeof pts === "number" && pts >= 5)
    .map(([d, pts]) => ({ number: d, points: pts }));

  const totalAnkPoints = activeAnkEntries.reduce((sum, e) => sum + e.points, 0);

  const userBalance = profile?.points ?? 0;
  const winMultiplier = g.rate;
  const potentialWin = (points || 0) * winMultiplier;

  // Place bet handler (supports Single, Sangam, Jodi Bulk, Ank Bulk)
  const handlePlay = async () => {
    if (!user) {
      toast.error("Please sign in to place plays");
      navigate({ to: "/auth" });
      return;
    }

    if (marketClosed) {
      toast.error(`Market has closed for today (${m?.name} closed at ${fmtTime(m?.close_time || "")})`);
      return;
    }

    // 1. JODI BULK PLAY
    if (game === "jodi_bulk") {
      if (openClosed) {
        toast.error(`Jodi Bulk is closed because Open timing (${fmtTime(m?.open_time || "")}) has passed.`);
        return;
      }
      if (selectedJodis.length === 0) {
        toast.error("Please select at least one Jodi");
        return;
      }
      const bets = selectedJodis.map((j) => ({
        number: j,
        points: jodiPoints[j] || 5,
      }));
      const anyInvalid = bets.some((b) => b.points < 5);
      if (anyInvalid) {
        toast.error("Minimum bet per Jodi is ₹5");
        return;
      }
      if (totalJodiPoints > userBalance) {
        toast.error(`Not enough balance. Required: ₹${totalJodiPoints}`);
        return;
      }

      setBusy(true);
      const { error } = await supabase.rpc("place_bulk_bets", {
        _market: marketId,
        _game: "jodi",
        _session: "close",
        _bets: bets,
      });
      setBusy(false);

      if (error) {
        toast.error(error.message);
        return;
      }

      toast.success(`Success! Placed ${bets.length} Jodi bets on ${m?.name} (Total ₹${totalJodiPoints})!`);
      setSelectedJodis([]);
      setJodiPoints({});
      qc.invalidateQueries({ queryKey: ["profile"] });
      qc.invalidateQueries({ queryKey: ["today-expense"] });
      return;
    }

    // 2. ANK BULK PLAY
    if (game === "ank_bulk") {
      if (effSession === "open" && openClosed) {
        toast.error(`Open session has closed for ${m?.name} (${fmtTime(m?.open_time || "")}). Please play Close session.`);
        return;
      }
      if (activeAnkEntries.length === 0) {
        toast.error("Please enter at least ₹5 for one digit");
        return;
      }
      if (totalAnkPoints > userBalance) {
        toast.error(`Not enough balance. Required: ₹${totalAnkPoints}`);
        return;
      }

      setBusy(true);
      const { error } = await supabase.rpc("place_bulk_bets", {
        _market: marketId,
        _game: "single",
        _session: effSession,
        _bets: activeAnkEntries,
      });
      setBusy(false);

      if (error) {
        toast.error(error.message);
        return;
      }

      toast.success(
        `Success! Placed ${activeAnkEntries.length} Ank bets (${effSession.toUpperCase()}) on ${m?.name} (Total ₹${totalAnkPoints})!`
      );
      setAnkPoints({});
      qc.invalidateQueries({ queryKey: ["profile"] });
      qc.invalidateQueries({ queryKey: ["today-expense"] });
      return;
    }

    // 3. SANGAM PLAY
    if (game === "half_sangam" || game === "full_sangam") {
      const num = `${sangamPart1}-${sangamPart2}`;
      if (!sangamPart1 || !sangamPart2) {
        toast.error("Please enter both parts for Sangam");
        return;
      }
      setBusy(true);
      const { error } = await supabase.rpc("place_bet", {
        _market: marketId,
        _game: game,
        _session: "close",
        _number: num,
        _points: points,
      });
      setBusy(false);
      if (error) {
        toast.error(error.message);
        return;
      }
      toast.success(`Bet placed on Sangam: ${num} for ₹${points}!`);
      setSangamPart1("");
      setSangamPart2("");
      qc.invalidateQueries({ queryKey: ["profile"] });
      qc.invalidateQueries({ queryKey: ["today-expense"] });
      return;
    }

    // 4. REGULAR SINGLE SELECTION PLAY
    if (effSession === "open" && openClosed) {
      toast.error(`Open session has closed for ${m?.name} (${fmtTime(m?.open_time || "")}). Please play Close session.`);
      return;
    }

    if (g.closeOnly && openClosed) {
      toast.error(`${g.label} can only be played before Open timing.`);
      return;
    }

    if (!selectedNumber) {
      toast.error("Please select a number first");
      return;
    }

    if (points < 5) {
      toast.error("Minimum bet is ₹5");
      return;
    }

    if (points > userBalance) {
      toast.error(`Not enough balance. Required: ₹${points}`);
      return;
    }

    setBusy(true);
    const { error } = await supabase.rpc("place_bet", {
      _market: marketId,
      _game: game,
      _session: effSession,
      _number: selectedNumber,
      _points: points,
    });
    setBusy(false);

    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success(`Success! Played ${selectedNumber} on ${m?.name} (${effSession.toUpperCase()}) for ₹${points}!`);
    setSelectedNumber(null);
    qc.invalidateQueries({ queryKey: ["profile"] });
    qc.invalidateQueries({ queryKey: ["today-expense"] });
  };

  if (!m) return <main className="mx-auto max-w-lg p-8 text-center text-muted-foreground">Loading…</main>;

  return (
    <main className="mx-auto max-w-xl pb-36 pt-2 px-3">
      {/* Top Header Card */}
      <div className="mb-3 rounded-2xl border bg-card p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <Link
            to="/"
            className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" /> Markets
          </Link>

          <h1 className="font-display text-2xl tracking-wider text-gold">{m.name}</h1>

          <div className="flex items-center gap-1.5 rounded-full border border-primary/40 bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary" title="Today's Expense">
            <span className="text-[10px] uppercase font-bold text-muted-foreground">Today's Bet:</span>
            <span className="font-bold text-foreground">₹{todayExp?.totalExpense ?? 0}</span>
          </div>
        </div>

        {/* Timing and Date Info */}
        <div className="mt-2.5 flex items-center justify-between text-[11px] text-muted-foreground border-t pt-2">
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3 text-primary" /> {fmtTime(m.open_time)} – {fmtTime(m.close_time)}
          </span>
          <span className="flex items-center gap-1 font-medium text-foreground">
            <Calendar className="h-3 w-3 text-primary" /> {todayIST}
          </span>
        </div>

        {/* Live Market Result */}
        <div className="mt-2 text-center rounded-lg bg-background/60 py-1.5">
          <span className="font-display text-2xl tracking-widest text-primary">
            {resultLabel(m.open_panna, m.close_panna)}
          </span>
        </div>
      </div>

      {/* Game Type Horizontal Scroll Tabs */}
      <div className="mb-3 flex overflow-x-auto no-scrollbar gap-1.5 pb-1">
        {PLAYABLE.map((k) => {
          const isSelected = game === k;
          const isGameClosed = openClosed && GAMES[k].closeOnly;
          return (
            <button
              key={k}
              onClick={() => handleGameChange(k)}
              disabled={isGameClosed}
              className={`whitespace-nowrap rounded-xl px-3.5 py-2 text-xs font-semibold transition-all ${
                isSelected
                  ? "bg-primary text-primary-foreground shadow"
                  : "border bg-card text-muted-foreground hover:bg-secondary/70 hover:text-foreground"
              } ${isGameClosed ? "opacity-40 cursor-not-allowed bg-muted/40" : ""}`}
            >
              {GAMES[k].label} {isGameClosed && "(Closed)"}
            </button>
          );
        })}
      </div>

      {/* Main Playing Container (Styled exactly like mobile app screenshots) */}
      <div className="rounded-2xl border bg-card p-4 shadow-md space-y-4">
        {/* Game Title Header */}
        <div className="text-center">
          <h2 className="font-display text-2xl uppercase tracking-wider text-primary">
            {game === "ank_bulk"
              ? `ANK ${effSession.toUpperCase()} BULK`
              : game === "jodi_bulk"
                ? "JODI BULK"
                : GAMES[game].label}
          </h2>
        </div>

        {/* Market / Session Timing Alerts */}
        {marketClosed ? (
          <div className="rounded-xl border border-destructive/40 bg-destructive/10 px-3 py-2 text-center text-xs font-semibold text-destructive">
            ⛔ Market Closed for today ({fmtTime(m.close_time)}). New bets cannot be placed.
          </div>
        ) : openClosed ? (
          <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-center text-xs font-medium text-amber-500">
            ⏰ Open Session has closed ({fmtTime(m.open_time)} passed). Playing on <strong>CLOSE Session</strong> until {fmtTime(m.close_time)}.
          </div>
        ) : null}

        {/* Session Toggle: OPEN | CLOSE Pills */}
        {!g.closeOnly && (
          <div className="grid grid-cols-2 gap-2 rounded-xl bg-secondary/60 p-1 border">
            <button
              type="button"
              disabled={openClosed || marketClosed}
              onClick={() => {
                if (openClosed || marketClosed) return;
                setSession("open");
                clearSelection();
              }}
              className={`rounded-lg py-2.5 text-xs font-bold uppercase tracking-wider transition-all ${
                effSession === "open"
                  ? "bg-primary text-primary-foreground shadow"
                  : "text-muted-foreground hover:text-foreground"
              } ${openClosed ? "opacity-40 cursor-not-allowed bg-muted/40 line-through" : ""}`}
            >
              {m.open_panna ? "OPEN (Declared)" : openClosed ? `OPEN (Closed)` : `OPEN (${fmtTime(m.open_time)})`}
            </button>

            <button
              type="button"
              disabled={marketClosed}
              onClick={() => {
                if (marketClosed) return;
                setSession("close");
                clearSelection();
              }}
              className={`rounded-lg py-2.5 text-xs font-bold uppercase tracking-wider transition-all ${
                effSession === "close"
                  ? "bg-primary text-primary-foreground shadow"
                  : "text-muted-foreground hover:text-foreground"
              } ${marketClosed ? "opacity-40 cursor-not-allowed" : ""}`}
            >
              CLOSE ({fmtTime(m.close_time)})
            </button>
          </div>
        )}

        {/* Section Header: "Select Panna" + Multiplier Badge (only for standard single games) */}
        {game !== "jodi_bulk" && game !== "ank_bulk" && (
          <div className="flex items-center justify-between border-b pb-2.5">
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-foreground">
                {game.includes("panna") ? "Select Panna" : "Select Number"}
              </span>
              <span className="rounded-md border bg-secondary px-2 py-0.5 text-xs font-bold text-gold">
                ×{g.rate}
              </span>
            </div>

            {selectedNumber && (
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-primary">
                  Selected: <strong className="font-mono text-sm text-gold">{selectedNumber}</strong>
                </span>
                <button
                  onClick={clearSelection}
                  className="text-xs text-muted-foreground hover:text-destructive"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
          </div>
        )}

        {/* 1. SINGLE PANNA GRID (Only 1 Panna selectable at a time) */}
        {game === "single_panna" && (
          <div className="space-y-2.5">
            {ANK_LIST.map((ank) => {
              const pannas = SINGLE_PANNA_BY_ANK[ank] ?? [];

              return (
                <div
                  key={ank}
                  className="flex items-center gap-2 rounded-xl border border-border/80 bg-background/50 p-2.5"
                >
                  {/* Left Ank Label */}
                  <div className="flex h-10 w-9 shrink-0 items-center justify-center rounded-lg bg-secondary font-display text-xl font-bold text-muted-foreground border">
                    {ank}
                  </div>

                  {/* Panna Pills Grid */}
                  <div className="flex flex-wrap gap-1.5 flex-1">
                    {pannas.map((p) => {
                      const isSel = selectedNumber === p;
                      return (
                        <button
                          key={p}
                          type="button"
                          onClick={() => selectNumber(p)}
                          className={`rounded-lg px-2.5 py-1.5 font-mono text-xs font-bold tracking-wider transition-all ${
                            isSel
                              ? "bg-primary text-primary-foreground shadow-md ring-2 ring-primary scale-105"
                              : "bg-card border border-border/70 text-foreground hover:border-primary hover:bg-secondary/80"
                          }`}
                        >
                          {p}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* 2. DOUBLE PANNA GRID (Only 1 Panna selectable at a time) */}
        {game === "double_panna" && (
          <div className="space-y-2.5">
            {ANK_LIST.map((ank) => {
              const pannas = DOUBLE_PANNA_BY_ANK[ank] ?? [];

              return (
                <div
                  key={ank}
                  className="flex items-center gap-2 rounded-xl border border-border/80 bg-background/50 p-2.5"
                >
                  {/* Left Ank Label */}
                  <div className="flex h-10 w-9 shrink-0 items-center justify-center rounded-lg bg-secondary font-display text-xl font-bold text-muted-foreground border">
                    {ank}
                  </div>

                  {/* Panna Pills Grid */}
                  <div className="flex flex-wrap gap-1.5 flex-1">
                    {pannas.map((p) => {
                      const isSel = selectedNumber === p;
                      return (
                        <button
                          key={p}
                          type="button"
                          onClick={() => selectNumber(p)}
                          className={`rounded-lg px-2.5 py-1.5 font-mono text-xs font-bold tracking-wider transition-all ${
                            isSel
                              ? "bg-primary text-primary-foreground shadow-md ring-2 ring-primary scale-105"
                              : "bg-card border border-border/70 text-foreground hover:border-primary hover:bg-secondary/80"
                          }`}
                        >
                          {p}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* 3. TRIPLE PANNA GRID (Only 1 Panna selectable) */}
        {game === "triple_panna" && (
          <div className="grid grid-cols-5 gap-2.5 p-2 rounded-xl bg-background/40 border">
            {TRIPLE_PANNAS.map((p) => {
              const isSel = selectedNumber === p;
              return (
                <button
                  key={p}
                  type="button"
                  onClick={() => selectNumber(p)}
                  className={`rounded-xl py-3 font-mono text-sm font-bold tracking-widest transition-all ${
                    isSel
                      ? "bg-primary text-primary-foreground shadow-md ring-2 ring-primary scale-105"
                      : "bg-card border border-border/80 text-foreground hover:border-primary hover:bg-secondary"
                  }`}
                >
                  {p}
                </button>
              );
            })}
          </div>
        )}

        {/* 4. SINGLE DIGIT GRID (Only 1 Digit selectable) */}
        {game === "single" && (
          <div className="grid grid-cols-5 gap-3 p-3 rounded-xl bg-background/40 border">
            {SINGLE_DIGITS.map((d) => {
              const isSel = selectedNumber === d;
              return (
                <button
                  key={d}
                  type="button"
                  onClick={() => selectNumber(d)}
                  className={`rounded-xl py-4 font-display text-3xl font-bold transition-all ${
                    isSel
                      ? "bg-primary text-primary-foreground shadow-md ring-2 ring-primary scale-105"
                      : "bg-card border border-border/80 text-foreground hover:border-primary hover:bg-secondary"
                  }`}
                >
                  {d}
                </button>
              );
            })}
          </div>
        )}

        {/* 5. JODI GRID (Only 1 Jodi selectable) */}
        {game === "jodi" && (
          <div className="space-y-2">
            {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((row) => (
              <div key={row} className="flex flex-wrap gap-1.5 justify-between">
                {JODI_BY_ROW[row].map((j) => {
                  const isSel = selectedNumber === j;
                  return (
                    <button
                      key={j}
                      type="button"
                      onClick={() => selectNumber(j)}
                      className={`flex-1 min-w-[34px] rounded-lg py-2 font-mono text-xs font-bold transition-all ${
                        isSel
                          ? "bg-primary text-primary-foreground shadow-md ring-1 ring-primary scale-105"
                          : "bg-card border border-border/70 text-foreground hover:border-primary hover:bg-secondary"
                      }`}
                    >
                      {j}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        )}

        {/* 6. ANK BULK VIEW (Matches Screenshot 2) */}
        {game === "ank_bulk" && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-foreground">Enter Amount (₹) Per Digit</h3>
              {/* Quick toolbar */}
              <div className="flex items-center gap-1">
                {[5, 10, 20, 50, 100].map((amt) => (
                  <button
                    key={amt}
                    type="button"
                    onClick={() => fillAllAnkPoints(amt)}
                    className="rounded border bg-secondary px-2 py-0.5 text-[10px] font-semibold hover:bg-primary hover:text-primary-foreground transition-colors"
                  >
                    +₹{amt} All
                  </button>
                ))}
                <button
                  type="button"
                  onClick={clearAllAnkPoints}
                  className="rounded border bg-secondary px-2 py-0.5 text-[10px] font-semibold text-muted-foreground hover:text-destructive"
                >
                  Clear
                </button>
              </div>
            </div>

            {/* 10 Digit Rows: 0 to 9 (as shown in screenshot 2) */}
            <div className="space-y-2">
              {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((digit) => (
                <div key={digit} className="flex items-center gap-2">
                  {/* Digit Badge */}
                  <div className="flex h-11 w-12 shrink-0 items-center justify-center rounded-xl bg-secondary font-display text-lg font-bold text-foreground border">
                    {digit}
                  </div>

                  {/* Amount Input */}
                  <Input
                    type="number"
                    min={5}
                    step={5}
                    placeholder="₹ Amount"
                    value={ankPoints[digit] || ""}
                    onChange={(e) => setAnkPoint(digit, Number(e.target.value) || 0)}
                    className="h-11 flex-1 font-semibold text-sm bg-secondary/40"
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 7. JODI BULK VIEW (Matches Screenshot 1) */}
        {game === "jodi_bulk" && (
          <div className="space-y-4">
            {/* Select Jodis Card */}
            <div className="rounded-2xl border bg-card p-4 shadow-sm space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-foreground">Select Jodis</h3>
                <span className="rounded-lg bg-foreground px-2.5 py-1 text-xs font-bold text-background shadow">
                  {selectedJodis.length} selected
                </span>
              </div>

              {/* 100 Jodis 10x10 Grid (00 to 99) */}
              <div className="grid grid-cols-10 gap-1 sm:gap-1.5">
                {Array.from({ length: 100 }, (_, i) => String(i).padStart(2, "0")).map((jodi) => {
                  const isSel = selectedJodis.includes(jodi);
                  return (
                    <button
                      key={jodi}
                      type="button"
                      onClick={() => toggleJodi(jodi)}
                      className={`aspect-square rounded-md text-[11px] sm:text-xs font-mono font-bold transition-all ${
                        isSel
                          ? "bg-foreground text-background shadow-md ring-2 ring-primary scale-105"
                          : "bg-secondary/70 text-foreground hover:bg-secondary border border-border/50"
                      }`}
                    >
                      {jodi}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Points Per Jodi Section (matches screenshot 1) */}
            {selectedJodis.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-bold text-foreground">Points Per Jodi</h4>
                  {/* Quick presets to apply to all selected */}
                  <div className="flex items-center gap-1">
                    <span className="text-[10px] text-muted-foreground mr-0.5">All:</span>
                    {[5, 10, 20, 50, 100].map((amt) => (
                      <button
                        key={amt}
                        type="button"
                        onClick={() => setAllJodiPoints(amt)}
                        className="rounded border bg-secondary px-1.5 py-0.5 text-[10px] font-semibold hover:bg-primary hover:text-primary-foreground transition-colors"
                      >
                        ₹{amt}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                  {selectedJodis.map((jodi) => (
                    <div key={jodi} className="flex items-center gap-2">
                      {/* Jodi Badge */}
                      <div className="flex h-11 w-12 shrink-0 items-center justify-center rounded-xl bg-secondary font-mono text-base font-bold text-foreground border">
                        {jodi}
                      </div>

                      {/* Amount Input */}
                      <Input
                        type="number"
                        min={5}
                        step={5}
                        placeholder="₹ Amount"
                        value={jodiPoints[jodi] || ""}
                        onChange={(e) =>
                          setJodiPoints((pts) => ({
                            ...pts,
                            [jodi]: Number(e.target.value) || 0,
                          }))
                        }
                        className="h-11 flex-1 font-semibold text-sm bg-secondary/40"
                      />

                      {/* Red Delete Button */}
                      <button
                        type="button"
                        onClick={() => removeJodi(jodi)}
                        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-destructive/10 text-destructive hover:bg-destructive/20 transition-colors"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* 8. SANGAM (Half / Full) */}
        {(game === "half_sangam" || game === "full_sangam") && (
          <div className="space-y-4 p-3 rounded-xl bg-background/50 border">
            <p className="text-xs text-muted-foreground text-center">
              {game === "half_sangam" ? "Half Sangam: 1 Open Digit - 3 Close Panna" : "Full Sangam: 3 Open Panna - 3 Close Panna"}
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">
                  {game === "half_sangam" ? "Open Digit (1)" : "Open Panna (3)"}
                </label>
                <Input
                  inputMode="numeric"
                  maxLength={game === "half_sangam" ? 1 : 3}
                  value={sangamPart1}
                  onChange={(e) => setSangamPart1(e.target.value.replace(/\D/g, ""))}
                  placeholder={game === "half_sangam" ? "0" : "123"}
                  className="text-center font-display text-2xl tracking-widest"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Close Panna (3)</label>
                <Input
                  inputMode="numeric"
                  maxLength={3}
                  value={sangamPart2}
                  onChange={(e) => setSangamPart2(e.target.value.replace(/\D/g, ""))}
                  placeholder="456"
                  className="text-center font-display text-2xl tracking-widest"
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* STICKY BOTTOM ACTION BAR */}
      <div className="fixed bottom-0 left-0 right-0 z-30 border-t bg-background/95 backdrop-blur-md px-4 py-3 shadow-2xl">
        <div className="mx-auto max-w-xl space-y-2">
          {/* A. JODI BULK BOTTOM BAR */}
          {game === "jodi_bulk" ? (
            <div className="space-y-2">
              {selectedJodis.length > 0 && (
                <div className="flex items-center justify-between text-xs px-1">
                  <span className="text-muted-foreground">
                    Selected: <strong className="text-foreground">{selectedJodis.length} Jodis</strong>
                  </span>
                  <span className="font-semibold text-gold">
                    Total: <strong>₹{totalJodiPoints}</strong> (Win Pays 90×)
                  </span>
                </div>
              )}

              {marketClosed ? (
                <Button disabled className="w-full h-11 text-sm font-semibold rounded-xl bg-muted text-muted-foreground">
                  Market Closed for Today
                </Button>
              ) : openClosed ? (
                <Button disabled className="w-full h-11 text-sm font-semibold rounded-xl bg-muted text-muted-foreground">
                  Jodi Bulk Closed (Open Timing Passed)
                </Button>
              ) : selectedJodis.length === 0 ? (
                <Button disabled className="w-full h-11 text-sm font-semibold rounded-xl bg-muted text-muted-foreground">
                  Select jodis and enter amount (₹)
                </Button>
              ) : (
                <Button
                  onClick={handlePlay}
                  disabled={busy || totalJodiPoints === 0}
                  className="w-full h-11 text-sm font-bold rounded-xl shadow-lg bg-primary hover:bg-primary/90 text-primary-foreground"
                >
                  {busy ? "Placing Plays…" : `Place Bets (${selectedJodis.length} Jodis · Total ₹${totalJodiPoints})`}
                </Button>
              )}
            </div>
          ) : game === "ank_bulk" ? (
            /* B. ANK BULK BOTTOM BAR */
            <div className="space-y-2">
              {activeAnkEntries.length > 0 && (
                <div className="flex items-center justify-between text-xs px-1">
                  <span className="text-muted-foreground">
                    Playing: <strong className="text-foreground">{activeAnkEntries.length} Digits</strong> ({effSession.toUpperCase()})
                  </span>
                  <span className="font-semibold text-gold">
                    Total: <strong>₹{totalAnkPoints}</strong> (Win Pays 9×)
                  </span>
                </div>
              )}

              {marketClosed ? (
                <Button disabled className="w-full h-11 text-sm font-semibold rounded-xl bg-muted text-muted-foreground">
                  Market Closed for Today
                </Button>
              ) : effSession === "open" && openClosed ? (
                <Button disabled className="w-full h-11 text-sm font-semibold rounded-xl bg-muted text-muted-foreground">
                  Open Session Closed
                </Button>
              ) : activeAnkEntries.length === 0 ? (
                <Button disabled className="w-full h-11 text-sm font-semibold rounded-xl bg-muted text-muted-foreground">
                  Enter amount (₹) to place bets
                </Button>
              ) : (
                <Button
                  onClick={handlePlay}
                  disabled={busy}
                  className="w-full h-11 text-sm font-bold rounded-xl shadow-lg bg-primary hover:bg-primary/90 text-primary-foreground"
                >
                  {busy ? "Placing Plays…" : `Place Bets (${activeAnkEntries.length} Digits · Total ₹${totalAnkPoints})`}
                </Button>
              )}
            </div>
          ) : (
            /* C. STANDARD SINGLE / SANGAM BOTTOM BAR */
            <div className="space-y-2">
              {/* Points Input & Quick Presets starting from 5 */}
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-muted-foreground font-medium">Amount:</span>
                  <div className="flex items-center gap-1">
                    <span className="text-sm font-bold text-gold">₹</span>
                    <Input
                      type="number"
                      min={5}
                      step={5}
                      value={points}
                      onChange={(e) => setPoints(Math.max(5, Number(e.target.value) || 5))}
                      className="w-20 text-center font-bold text-sm h-8"
                    />
                  </div>
                </div>

                {/* Quick amount chips */}
                <div className="flex gap-1 overflow-x-auto">
                  {POINT_PRESETS.map((amt) => (
                    <button
                      key={amt}
                      type="button"
                      onClick={() => setPoints(amt)}
                      className={`rounded-md px-2.5 py-1 text-xs font-semibold border transition-colors ${
                        points === amt
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-card hover:bg-secondary text-foreground"
                      }`}
                    >
                      ₹{amt}
                    </button>
                  ))}
                </div>
              </div>

              {/* Potential Win Banner when selected */}
              {selectedNumber && (
                <div className="flex items-center justify-between text-xs px-1">
                  <span className="text-muted-foreground">
                    Playing: <strong className="text-foreground">{selectedNumber}</strong> ({effSession.toUpperCase()})
                  </span>
                  <span className="font-semibold text-gold">
                    Win Pays {winMultiplier}× = <strong>₹{potentialWin}</strong>
                  </span>
                </div>
              )}

              {/* Big Action Button */}
              {marketClosed ? (
                <Button disabled className="w-full h-11 text-sm font-semibold rounded-xl bg-muted text-muted-foreground">
                  Market Closed for Today
                </Button>
              ) : openClosed && g.closeOnly ? (
                <Button disabled className="w-full h-11 text-sm font-semibold rounded-xl bg-muted text-muted-foreground">
                  {g.label} Closed (Open Timing Passed)
                </Button>
              ) : !selectedNumber && game !== "half_sangam" && game !== "full_sangam" ? (
                <Button disabled className="w-full h-11 text-sm font-semibold rounded-xl bg-muted text-muted-foreground">
                  Select number and enter amount (₹)
                </Button>
              ) : (
                <Button
                  onClick={handlePlay}
                  disabled={busy}
                  className="w-full h-11 text-sm font-bold rounded-xl shadow-lg bg-primary hover:bg-primary/90 text-primary-foreground"
                >
                  {busy
                    ? "Placing Play…"
                    : game.includes("sangam")
                      ? `Play Sangam (₹${points})`
                      : `Play ${selectedNumber} (₹${points})`}
                </Button>
              )}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
