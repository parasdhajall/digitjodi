import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Calendar, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { GAMES, PLAYABLE, type GameType, fmtTime, resultLabel } from "@/lib/matka";

export const Route = createFileRoute("/play/$marketId")({
  head: () => ({
    meta: [
      { title: "Play a Market — PlayOn" },
      { name: "description", content: "Choose a game and number to play with your points." },
      { property: "og:title", content: "Play a Market — PlayOn" },
      { property: "og:description", content: "Pick single, jodi or panna and play with points." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PlayPage,
});

function PlayPage() {
  const { marketId } = Route.useParams();
  const { user, loading } = useAuth();
  const qc = useQueryClient();
  const [game, setGame] = useState<GameType>("single");
  const [session, setSession] = useState<"open" | "close">("open");
  const [parts, setParts] = useState<string[]>([""]);
  const [points, setPoints] = useState("50");
  const [busy, setBusy] = useState(false);

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
  const number = parts.join("-");
  const complete = g.parts.every((len, i) => (parts[i] ?? "").length === len);

  const pick = (k: GameType) => {
    setGame(k);
    setParts(GAMES[k].parts.map(() => ""));
  };

  const play = async () => {
    setBusy(true);
    const { error } = await supabase.rpc("place_bet", {
      _market: marketId,
      _game: game,
      _session: effSession,
      _number: number,
      _points: Number(points),
    });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(`Bet placed on ${m?.name}: Number ${number} (${effSession.toUpperCase()}) for ${points} pts on ${todayIST}`);
    setParts(g.parts.map(() => ""));
    qc.invalidateQueries({ queryKey: ["profile"] });
  };

  if (!m) return <main className="mx-auto max-w-lg p-8 text-muted-foreground">Loading…</main>;

  return (
    <main className="mx-auto max-w-lg px-4 py-8">
      <div className="rounded-2xl border bg-card p-6 shadow-glow">
        {/* Header with Title and Current Date */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-3">
          <div>
            <h1 className="font-display text-4xl tracking-wide text-gold">{m.name}</h1>
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Clock className="h-3.5 w-3.5" /> {fmtTime(m.open_time)} – {fmtTime(m.close_time)} (IST)
            </p>
          </div>
          {/* Prominent Game Date Badge */}
          <div className="flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
            <Calendar className="h-3.5 w-3.5" />
            <span>{todayIST}</span>
          </div>
        </div>

        {/* Live Digits Display */}
        <div className="my-4 rounded-xl bg-background/70 py-3 text-center">
          <p className="font-display text-4xl tracking-widest text-primary md:text-5xl">
            {resultLabel(m.open_panna, m.close_panna)}
          </p>
          <p className="mt-1 text-[11px] text-muted-foreground">Live Market Result</p>
        </div>

        {!loading && !user ? (
          <Button asChild className="mt-4 w-full">
            <Link to="/auth">Sign in to play</Link>
          </Button>
        ) : m.close_panna || !m.active ? (
          <p className="mt-4 text-center text-muted-foreground">This market is closed for today.</p>
        ) : (
          <div className="mt-4 space-y-4">
            {/* Game Selection Buttons */}
            <div>
              <Label className="mb-2 block text-xs text-muted-foreground">Select Game Type</Label>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {PLAYABLE.map((k) => (
                  <Button
                    key={k}
                    variant={game === k ? "default" : "secondary"}
                    disabled={GAMES[k].closeOnly && openDone}
                    onClick={() => pick(k)}
                    className="h-auto flex-col py-2"
                  >
                    <span className="text-xs font-semibold">{GAMES[k].label}</span>
                    <span className="text-[11px] opacity-75">1 × {GAMES[k].rate}</span>
                  </Button>
                ))}
              </div>
            </div>

            {/* Session Selection (Open / Close) */}
            {!g.closeOnly && (
              <div>
                <Label className="mb-2 block text-xs text-muted-foreground">Select Session</Label>
                <div className="grid grid-cols-2 gap-2">
                  {(["open", "close"] as const).map((s) => (
                    <Button
                      key={s}
                      variant={effSession === s ? "default" : "outline"}
                      disabled={s === "open" && openDone}
                      onClick={() => setSession(s)}
                      className="capitalize"
                    >
                      {s} Session {s === "open" && openDone && "(Declared)"}
                    </Button>
                  ))}
                </div>
              </div>
            )}

            {/* Number Inputs */}
            <div className={`grid gap-2 ${g.parts.length > 1 ? "grid-cols-2" : ""}`}>
              {g.parts.map((len, i) => (
                <div key={`${game}-${i}`} className="space-y-1">
                  <Label className="text-xs">{g.partLabels[i]}</Label>
                  <Input
                    inputMode="numeric"
                    maxLength={len}
                    value={parts[i] ?? ""}
                    placeholder={"0".repeat(len)}
                    onChange={(e) => {
                      const n = [...parts];
                      n[i] = e.target.value.replace(/\D/g, "");
                      setParts(n);
                    }}
                    className="text-center font-display text-3xl tracking-[0.3em]"
                  />
                </div>
              ))}
            </div>

            {/* Points Amount Input */}
            <div className="space-y-1">
              <div className="flex justify-between text-xs">
                <Label>Points to Play</Label>
                <span className="text-muted-foreground">Min 10 pts</span>
              </div>
              <Input
                type="number"
                min={10}
                step={10}
                value={points}
                onChange={(e) => setPoints(e.target.value)}
              />
            </div>

            {/* Live Bet Confirmation & Date Summary Card */}
            <div className="rounded-xl border border-border/80 bg-background/50 p-3.5 text-xs space-y-1.5">
              <div className="flex justify-between text-muted-foreground">
                <span className="flex items-center gap-1"><Calendar className="h-3 w-3 text-primary" /> Playing Date:</span>
                <span className="font-semibold text-foreground">{todayIST}</span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>Session / Game:</span>
                <span className="font-semibold capitalize text-foreground">{effSession} · {g.label}</span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>Selected Number:</span>
                <span className="font-display text-base tracking-widest text-primary">{number || "—"}</span>
              </div>
              <div className="flex justify-between text-muted-foreground border-t pt-1.5">
                <span>Win Pays ({g.rate}×):</span>
                <span className="font-display text-base font-bold text-gold tracking-wide">
                  {(Number(points) || 0) * g.rate} pts
                </span>
              </div>
            </div>

            {/* Play Button */}
            <Button
              className="w-full font-semibold shadow-md"
              size="lg"
              disabled={busy || !complete || Number(points) < 10}
              onClick={play}
            >
              {busy ? "Placing Play…" : `Play now (${points || 0} pts)`}
            </Button>
          </div>
        )}
      </div>
    </main>
  );
}
