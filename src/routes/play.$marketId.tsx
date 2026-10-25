import { useState, useMemo } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, Calendar, Clock, Check, X, Coins } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, useProfile } from "@/hooks/useAuth";
import { GAMES, PLAYABLE, type GameType, fmtTime, resultLabel } from "@/lib/matka";
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
      { title: "Play Market — Select Pannas & Numbers" },
      { name: "description", content: "Interactive visual panna chart and number selection for matka play." },
    ],
  }),
  component: PlayPage,
});

const ANK_LIST = [1, 2, 3, 4, 5, 6, 7, 8, 9, 0];

function PlayPage() {
  const { marketId } = Route.useParams();
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const { data: profile } = useProfile(user?.id);
  const qc = useQueryClient();

  const [game, setGame] = useState<GameType>("single_panna");
  const [session, setSession] = useState<"open" | "close">("open");
  const [selectedNumbers, setSelectedNumbers] = useState<Set<string>>(new Set());
  const [pointsPerBet, setPointsPerBet] = useState<number>(50);
  const [busy, setBusy] = useState(false);

  // Manual input fallback state for Sangam
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
  const openDone = !!m?.open_panna;
  const effSession = g.closeOnly ? "close" : openDone ? "close" : session;

  const handleGameChange = (newGame: GameType) => {
    setGame(newGame);
    setSelectedNumbers(new Set());
    setSangamPart1("");
    setSangamPart2("");
  };

  const toggleNumber = (num: string) => {
    setSelectedNumbers((prev) => {
      const next = new Set(prev);
      if (next.has(num)) {
        next.delete(num);
      } else {
        next.add(num);
      }
      return next;
    });
  };

  const selectRowAll = (numbers: string[]) => {
    setSelectedNumbers((prev) => {
      const next = new Set(prev);
      const allSelected = numbers.every((n) => next.has(n));
      if (allSelected) {
        numbers.forEach((n) => next.delete(n));
      } else {
        numbers.forEach((n) => next.add(n));
      }
      return next;
    });
  };

  const clearSelection = () => {
    setSelectedNumbers(new Set());
  };

  const selectedCount = selectedNumbers.size;
  const totalPoints = selectedCount * pointsPerBet;
  const userBalance = profile?.points ?? 0;

  // Place bet handler
  const handlePlay = async () => {
    if (!user) {
      toast.error("Please sign in to place plays");
      navigate({ to: "/auth" });
      return;
    }

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
        _points: pointsPerBet,
      });
      setBusy(false);
      if (error) {
        toast.error(error.message);
        return;
      }
      toast.success(`Bet placed on Sangam: ${num} for ${pointsPerBet} pts!`);
      setSangamPart1("");
      setSangamPart2("");
      qc.invalidateQueries({ queryKey: ["profile"] });
      return;
    }

    if (selectedCount === 0) {
      toast.error("Please select at least one number");
      return;
    }

    if (pointsPerBet < 10) {
      toast.error("Minimum points per number is 10");
      return;
    }

    if (totalPoints > userBalance) {
      toast.error(`Not enough points. Required: ${totalPoints} pts, Your balance: ${userBalance} pts`);
      return;
    }

    setBusy(true);
    const numsArray = Array.from(selectedNumbers);
    const { error } = await supabase.rpc("place_multiple_bets" as any, {
      _market: marketId,
      _game: game,
      _session: effSession,
      _numbers: numsArray,
      _points_per_bet: pointsPerBet,
    });
    setBusy(false);

    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success(`Success! Placed ${selectedCount} plays (${totalPoints} pts total) on ${m?.name}!`);
    clearSelection();
    qc.invalidateQueries({ queryKey: ["profile"] });
  };

  if (!m) return <main className="mx-auto max-w-lg p-8 text-center text-muted-foreground">Loading…</main>;

  return (
    <main className="mx-auto max-w-xl pb-32 pt-2 px-3">
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

          <div className="flex items-center gap-1 text-xs font-bold text-primary">
            <Coins className="h-3.5 w-3.5" />
            <span>{userBalance.toLocaleString()} pts</span>
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
          return (
            <button
              key={k}
              onClick={() => handleGameChange(k)}
              disabled={GAMES[k].closeOnly && openDone}
              className={`whitespace-nowrap rounded-xl px-3.5 py-2 text-xs font-semibold transition-all ${
                isSelected
                  ? "bg-primary text-primary-foreground shadow"
                  : "border bg-card text-muted-foreground hover:bg-secondary/70 hover:text-foreground"
              }`}
            >
              {GAMES[k].label}
            </button>
          );
        })}
      </div>

      {/* Main Playing Container (Styled exactly like the mobile app screenshots) */}
      <div className="rounded-2xl border bg-card p-4 shadow-md space-y-4">
        {/* Game Title Header */}
        <div className="text-center">
          <h2 className="font-display text-2xl uppercase tracking-wider text-primary">
            {GAMES[game].label}
          </h2>
        </div>

        {/* Session Toggle: OPEN | CLOSE Pills (as seen in screenshots) */}
        {!g.closeOnly && (
          <div className="grid grid-cols-2 gap-2 rounded-xl bg-secondary/60 p-1 border">
            <button
              type="button"
              disabled={openDone}
              onClick={() => {
                setSession("open");
                clearSelection();
              }}
              className={`rounded-lg py-2.5 text-xs font-bold uppercase tracking-wider transition-all ${
                effSession === "open"
                  ? "bg-primary text-primary-foreground shadow"
                  : "text-muted-foreground hover:text-foreground"
              } ${openDone ? "opacity-40 cursor-not-allowed" : ""}`}
            >
              OPEN {openDone && "(Declared)"}
            </button>

            <button
              type="button"
              onClick={() => {
                setSession("close");
                clearSelection();
              }}
              className={`rounded-lg py-2.5 text-xs font-bold uppercase tracking-wider transition-all ${
                effSession === "close"
                  ? "bg-primary text-primary-foreground shadow"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              CLOSE
            </button>
          </div>
        )}

        {/* Section Header: "Select Pannas" + Multiplier Badge */}
        <div className="flex items-center justify-between border-b pb-2.5">
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-foreground">
              {game.includes("panna") ? "Select Pannas" : "Select Numbers"}
            </span>
            <span className="rounded-md border bg-secondary px-2 py-0.5 text-xs font-bold text-gold">
              ×{g.rate}
            </span>
          </div>

          {selectedCount > 0 && (
            <button
              onClick={clearSelection}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive"
            >
              <X className="h-3.5 w-3.5" /> Clear ({selectedCount})
            </button>
          )}
        </div>

        {/* 1. SINGLE PANNA GRID (Grouped by Ank 1-9, 0) */}
        {game === "single_panna" && (
          <div className="space-y-2.5">
            {ANK_LIST.map((ank) => {
              const pannas = SINGLE_PANNA_BY_ANK[ank] ?? [];
              const allRowSelected = pannas.every((p) => selectedNumbers.has(p));

              return (
                <div
                  key={ank}
                  className="flex items-center gap-2 rounded-xl border border-border/80 bg-background/50 p-2.5"
                >
                  {/* Left Ank Button (Tap to select whole row) */}
                  <button
                    onClick={() => selectRowAll(pannas)}
                    title={`Select/Deselect all for digit ${ank}`}
                    className={`flex h-10 w-9 shrink-0 items-center justify-center rounded-lg font-display text-xl font-bold transition-colors ${
                      allRowSelected
                        ? "bg-primary text-primary-foreground"
                        : "bg-secondary text-foreground hover:bg-primary/20"
                    }`}
                  >
                    {ank}
                  </button>

                  {/* Panna Pills Grid */}
                  <div className="flex flex-wrap gap-1.5 flex-1">
                    {pannas.map((p) => {
                      const isSel = selectedNumbers.has(p);
                      return (
                        <button
                          key={p}
                          type="button"
                          onClick={() => toggleNumber(p)}
                          className={`rounded-lg px-2.5 py-1.5 font-mono text-xs font-bold tracking-wider transition-all ${
                            isSel
                              ? "bg-primary text-primary-foreground shadow ring-1 ring-primary scale-105"
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

        {/* 2. DOUBLE PANNA GRID (Grouped by Ank 1-9, 0) */}
        {game === "double_panna" && (
          <div className="space-y-2.5">
            {ANK_LIST.map((ank) => {
              const pannas = DOUBLE_PANNA_BY_ANK[ank] ?? [];
              const allRowSelected = pannas.every((p) => selectedNumbers.has(p));

              return (
                <div
                  key={ank}
                  className="flex items-center gap-2 rounded-xl border border-border/80 bg-background/50 p-2.5"
                >
                  {/* Left Ank Button */}
                  <button
                    onClick={() => selectRowAll(pannas)}
                    title={`Select/Deselect all for digit ${ank}`}
                    className={`flex h-10 w-9 shrink-0 items-center justify-center rounded-lg font-display text-xl font-bold transition-colors ${
                      allRowSelected
                        ? "bg-primary text-primary-foreground"
                        : "bg-secondary text-foreground hover:bg-primary/20"
                    }`}
                  >
                    {ank}
                  </button>

                  {/* Panna Pills Grid */}
                  <div className="flex flex-wrap gap-1.5 flex-1">
                    {pannas.map((p) => {
                      const isSel = selectedNumbers.has(p);
                      return (
                        <button
                          key={p}
                          type="button"
                          onClick={() => toggleNumber(p)}
                          className={`rounded-lg px-2.5 py-1.5 font-mono text-xs font-bold tracking-wider transition-all ${
                            isSel
                              ? "bg-primary text-primary-foreground shadow ring-1 ring-primary scale-105"
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

        {/* 3. TRIPLE PANNA GRID (000 to 999) */}
        {game === "triple_panna" && (
          <div className="grid grid-cols-5 gap-2.5 p-2 rounded-xl bg-background/40 border">
            {TRIPLE_PANNAS.map((p) => {
              const isSel = selectedNumbers.has(p);
              return (
                <button
                  key={p}
                  type="button"
                  onClick={() => toggleNumber(p)}
                  className={`rounded-xl py-3 font-mono text-sm font-bold tracking-widest transition-all ${
                    isSel
                      ? "bg-primary text-primary-foreground shadow ring-2 ring-primary scale-105"
                      : "bg-card border border-border/80 text-foreground hover:border-primary hover:bg-secondary"
                  }`}
                >
                  {p}
                </button>
              );
            })}
          </div>
        )}

        {/* 4. SINGLE DIGIT GRID (0 to 9) */}
        {game === "single" && (
          <div className="grid grid-cols-5 gap-3 p-3 rounded-xl bg-background/40 border">
            {SINGLE_DIGITS.map((d) => {
              const isSel = selectedNumbers.has(d);
              return (
                <button
                  key={d}
                  type="button"
                  onClick={() => toggleNumber(d)}
                  className={`rounded-xl py-4 font-display text-3xl font-bold transition-all ${
                    isSel
                      ? "bg-primary text-primary-foreground shadow ring-2 ring-primary scale-105"
                      : "bg-card border border-border/80 text-foreground hover:border-primary hover:bg-secondary"
                  }`}
                >
                  {d}
                </button>
              );
            })}
          </div>
        )}

        {/* 5. JODI GRID (100 Jodis) */}
        {game === "jodi" && (
          <div className="space-y-2">
            {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((row) => (
              <div key={row} className="flex flex-wrap gap-1.5 justify-between">
                {JODI_BY_ROW[row].map((j) => {
                  const isSel = selectedNumbers.has(j);
                  return (
                    <button
                      key={j}
                      type="button"
                      onClick={() => toggleNumber(j)}
                      className={`flex-1 min-w-[34px] rounded-lg py-2 font-mono text-xs font-bold transition-all ${
                        isSel
                          ? "bg-primary text-primary-foreground shadow ring-1 ring-primary scale-105"
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

        {/* 6. SANGAM (Half / Full) */}
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

      {/* STICKY BOTTOM ACTION BAR (Matches exact look of screenshots) */}
      <div className="fixed bottom-0 left-0 right-0 z-30 border-t bg-background/95 backdrop-blur-md px-4 py-3 shadow-2xl">
        <div className="mx-auto max-w-xl space-y-2.5">
          {/* Points Input & Quick Presets */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-muted-foreground font-medium">Points:</span>
              <Input
                type="number"
                min={10}
                step={10}
                value={pointsPerBet}
                onChange={(e) => setPointsPerBet(Math.max(10, Number(e.target.value) || 10))}
                className="w-24 text-center font-bold text-sm h-8"
              />
            </div>

            {/* Quick point chips */}
            <div className="flex gap-1">
              {[50, 100, 200, 500].map((amt) => (
                <button
                  key={amt}
                  type="button"
                  onClick={() => setPointsPerBet(amt)}
                  className={`rounded-md px-2 py-1 text-[11px] font-semibold border ${
                    pointsPerBet === amt ? "bg-primary text-primary-foreground border-primary" : "bg-card hover:bg-secondary"
                  }`}
                >
                  +{amt}
                </button>
              ))}
            </div>
          </div>

          {/* Big Action Button (Exact text from screenshot: "Select pannas and enter points" when 0) */}
          {selectedCount === 0 && game !== "half_sangam" && game !== "full_sangam" ? (
            <Button disabled className="w-full h-12 text-sm font-semibold rounded-xl bg-muted text-muted-foreground">
              Select pannas and enter points
            </Button>
          ) : (
            <Button
              onClick={handlePlay}
              disabled={busy}
              className="w-full h-12 text-sm font-bold rounded-xl shadow-lg bg-primary hover:bg-primary/90 text-primary-foreground"
            >
              {busy
                ? "Placing Plays…"
                : game.includes("sangam")
                  ? `Play Sangam (${pointsPerBet} pts)`
                  : `Play (${selectedCount} selected · Total ${totalPoints} pts)`}
            </Button>
          )}
        </div>
      </div>
    </main>
  );
}
