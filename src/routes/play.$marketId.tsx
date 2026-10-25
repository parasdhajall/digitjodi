import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
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
      { name: "description", content: "Choose a game and number to play with your free points." },
      { property: "og:title", content: "Play a Market — PlayOn" },
      { property: "og:description", content: "Pick single, jodi or panna and play with free points." },
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

  const g = GAMES[game];
  const openDone = !!m?.open_panna;
  const effSession = g.closeOnly ? "close" : openDone ? "close" : session;
  const number = parts.join("-");
  const complete = g.parts.every((len, i) => (parts[i] ?? "").length === len);

  const pick = (k: GameType) => { setGame(k); setParts(GAMES[k].parts.map(() => "")); };

  const play = async () => {
    setBusy(true);
    const { error } = await supabase.rpc("place_bet", {
      _market: marketId, _game: game, _session: effSession, _number: number, _points: Number(points),
    });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success(`Played ${number} for ${points} points`);
    setParts(g.parts.map(() => ""));
    qc.invalidateQueries({ queryKey: ["profile"] });
  };

  if (!m) return <main className="mx-auto max-w-lg p-8 text-muted-foreground">Loading…</main>;

  return (
    <main className="mx-auto max-w-lg px-4 py-8">
      <div className="rounded-2xl border bg-card p-6 shadow-glow">
        <h1 className="font-display text-4xl tracking-wide text-gold">{m.name}</h1>
        <p className="text-sm text-muted-foreground">{fmtTime(m.open_time)} – {fmtTime(m.close_time)}</p>
        <p className="my-4 font-display text-4xl tracking-widest text-primary">{resultLabel(m.open_panna, m.close_panna)}</p>
        <Link to="/chart/$marketId" params={{ marketId }} className="text-sm text-accent underline">View result chart</Link>

        {!loading && !user ? (
          <Button asChild className="mt-4 w-full"><Link to="/auth">Sign in to play</Link></Button>
        ) : m.close_panna || !m.active ? (
          <p className="mt-4 text-center text-muted-foreground">This market is closed for today.</p>
        ) : (
          <div className="mt-4 space-y-4">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {PLAYABLE.map((k) => (
                <Button key={k} variant={game === k ? "default" : "secondary"} disabled={GAMES[k].closeOnly && openDone}
                  onClick={() => pick(k)} className="h-auto flex-col py-2">
                  <span>{GAMES[k].label}</span>
                  <span className="text-xs opacity-70">1 × {GAMES[k].rate}</span>
                </Button>
              ))}
            </div>
            {!g.closeOnly && (
              <div className="grid grid-cols-2 gap-2">
                {(["open", "close"] as const).map((s) => (
                  <Button key={s} variant={effSession === s ? "default" : "outline"} disabled={s === "open" && openDone}
                    onClick={() => setSession(s)} className="capitalize">{s}</Button>
                ))}
              </div>
            )}
            <div className={`grid gap-2 ${g.parts.length > 1 ? "grid-cols-2" : ""}`}>
              {g.parts.map((len, i) => (
                <div key={`${game}-${i}`} className="space-y-1">
                  <Label>{g.partLabels[i]}</Label>
                  <Input inputMode="numeric" maxLength={len} value={parts[i] ?? ""}
                    onChange={(e) => { const n = [...parts]; n[i] = e.target.value.replace(/\D/g, ""); setParts(n); }}
                    className="text-center font-display text-3xl tracking-[0.4em]" />
                </div>
              ))}
            </div>
            <div className="space-y-1">
              <Label>Points</Label>
              <Input type="number" min={10} value={points} onChange={(e) => setPoints(e.target.value)} />
              <p className="text-xs text-muted-foreground">Win pays {g.rate}× — you'd get {(Number(points) || 0) * g.rate} points.</p>
            </div>
            <Button className="w-full" size="lg" disabled={busy || !complete} onClick={play}>Play now</Button>
          </div>
        )}
      </div>
    </main>
  );
}
