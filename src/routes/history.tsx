import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, useTodayExpense } from "@/hooks/useAuth";
import { gameLabel, fmtIST } from "@/lib/matka";

export const Route = createFileRoute("/history")({
  head: () => ({
    meta: [
      { title: "My Plays — PlayOn" },
      { name: "description", content: "See your past plays and winnings." },
      { property: "og:title", content: "My Plays — PlayOn" },
      { property: "og:description", content: "Your PlayOn play history." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: History,
});

const statusCls: Record<string, string> = {
  won: "text-success", lost: "text-destructive", pending: "text-primary", refunded: "text-muted-foreground",
};

function History() {
  const { user, loading } = useAuth();
  const { data: todayExp } = useTodayExpense(user?.id);
  const { data } = useQuery({
    queryKey: ["bets", user?.id],
    enabled: !!user,
    queryFn: async () =>
      (await supabase.from("bets").select("*, markets(name)").eq("user_id", user!.id).order("created_at", { ascending: false }).limit(200)).data ?? [],
  });

  if (!loading && !user)
    return <main className="mx-auto max-w-lg p-8 text-center"><Button asChild><Link to="/auth">Sign in to see your plays</Link></Button></main>;

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="font-display text-4xl tracking-wide text-gold">My Plays</h1>
        <span className="text-xs text-muted-foreground">Recent 200 plays</span>
      </div>

      {/* Today's Expense Summary */}
      <div className="mb-6 rounded-xl border border-primary/30 bg-card p-4 shadow-sm">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Today's Bet (Expense)</span>
        <div className="mt-1 flex items-baseline gap-1.5">
          <span className="font-display text-3xl font-bold text-primary">₹{todayExp?.totalExpense ?? 0}</span>
          <span className="text-xs text-muted-foreground">total played today</span>
        </div>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {todayExp?.playsCount ?? 0} {todayExp?.playsCount === 1 ? "play" : "plays"} placed today
        </p>
      </div>
      <div className="overflow-hidden rounded-xl border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-secondary text-left text-muted-foreground">
            <tr><th className="p-3">Market</th><th>Game</th><th>Number</th><th>Points</th><th>Result</th></tr>
          </thead>
          <tbody>
            {data?.map((b) => (
              <tr key={b.id} className="border-t">
                <td className="p-3">{b.markets?.name}<div className="text-xs text-muted-foreground">{fmtIST(b.created_at)} IST</div></td>
                <td>{gameLabel(b.game_type)} <span className="text-xs capitalize text-muted-foreground">{b.session}</span></td>
                <td className="font-display text-xl tracking-widest">{b.number}</td>
                <td>{b.points}</td>
                <td className={`font-semibold capitalize ${statusCls[b.status]}`}>{b.status}{b.payout > 0 && ` +${b.payout}`}</td>
              </tr>
            ))}
            {data?.length === 0 && <tr><td colSpan={5} className="p-6 text-center text-muted-foreground">No plays yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </main>
  );
}
