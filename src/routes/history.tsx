import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, useTodayExpense } from "@/hooks/useAuth";
import { gameLabel, fmtIST } from "@/lib/matka";
import { ThermalReceiptModal } from "@/components/ThermalReceiptModal";
import { PrinterStatusBadge } from "@/components/PrinterStatusBadge";
import type { ReceiptData } from "@/lib/thermalPrinter";

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
  const [receiptData, setReceiptData] = useState<ReceiptData | null>(null);
  const [isReceiptOpen, setIsReceiptOpen] = useState(false);

  const { data } = useQuery({
    queryKey: ["bets", user?.id],
    enabled: !!user,
    queryFn: async () =>
      (await supabase.from("bets").select("*, markets(name)").eq("user_id", user!.id).order("created_at", { ascending: false }).limit(200)).data ?? [],
  });

  if (!loading && !user)
    return <main className="mx-auto max-w-lg p-8 text-center"><Button asChild><Link to="/auth">Sign in to see your plays</Link></Button></main>;

  const todayStr = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
  const todayBets = data?.filter((b) => {
    const betDateStr = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date(b.created_at));
    return todayStr === betDateStr;
  }) || [];

  const handlePrintSingle = (b: any) => {
    const d = new Date(b.created_at);
    const dateStr = new Intl.DateTimeFormat("en-IN", {
      timeZone: "Asia/Kolkata",
      day: "2-digit",
      month: "short",
      year: "numeric",
    }).format(d);
    const timeStr = new Intl.DateTimeFormat("en-IN", {
      timeZone: "Asia/Kolkata",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }).format(d);

    setReceiptData({
      slipId: b.id.slice(0, 8).toUpperCase(),
      marketName: b.markets?.name || "MARKET",
      playerName: user?.email || "Player",
      dateStr,
      timeStr,
      items: [
        {
          gameLabel: gameLabel(b.game_type),
          session: b.session,
          number: b.number,
          points: b.points,
        },
      ],
      totalPoints: b.points,
    });
    setIsReceiptOpen(true);
  };

  const handlePrintTodayAll = () => {
    if (todayBets.length === 0) return;
    const now = new Date();
    const dateStr = new Intl.DateTimeFormat("en-IN", {
      timeZone: "Asia/Kolkata",
      day: "2-digit",
      month: "short",
      year: "numeric",
    }).format(now);
    const timeStr = new Intl.DateTimeFormat("en-IN", {
      timeZone: "Asia/Kolkata",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }).format(now);

    const totalPts = todayBets.reduce((sum, b) => sum + b.points, 0);

    setReceiptData({
      slipId: `TD-${Date.now().toString().slice(-6)}`,
      marketName: "TODAY'S PLAYS",
      playerName: user?.email || "Player",
      dateStr,
      timeStr,
      items: todayBets.map((b) => ({
        gameLabel: `${b.markets?.name ? b.markets.name.slice(0, 4) + ' ' : ''}${gameLabel(b.game_type)}`,
        session: b.session,
        number: b.number,
        points: b.points,
      })),
      totalPoints: totalPts,
    });
    setIsReceiptOpen(true);
  };

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="font-display text-4xl tracking-wide text-gold">My Plays</h1>
        <div className="flex items-center gap-2">
          <PrinterStatusBadge showTextOnMobile={true} />
          <span className="text-xs text-muted-foreground hidden sm:inline">Recent 200 plays</span>
        </div>
      </div>

      {/* Today's Expense Summary */}
      <div className="mb-6 rounded-xl border border-primary/30 bg-card p-4 shadow-sm flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Today's Bet (Expense)</span>
          <div className="mt-1 flex items-baseline gap-1.5">
            <span className="font-display text-3xl font-bold text-primary">₹{todayExp?.totalExpense ?? 0}</span>
            <span className="text-xs text-muted-foreground">total played today</span>
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {todayExp?.playsCount ?? 0} {todayExp?.playsCount === 1 ? "play" : "plays"} placed today
          </p>
        </div>

        {todayBets.length > 0 && (
          <Button
            type="button"
            variant="outline"
            onClick={handlePrintTodayAll}
            className="h-10 text-xs font-bold border-gold/40 text-gold hover:bg-gold/15 flex items-center gap-2 cursor-pointer"
          >
            <Printer className="h-4 w-4" />
            Print Today's Slip ({todayBets.length} Plays)
          </Button>
        )}
      </div>

      <div className="overflow-hidden rounded-xl border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-secondary text-left text-muted-foreground">
            <tr>
              <th className="p-3">Market</th>
              <th>Game</th>
              <th>Number</th>
              <th>Rupees (₹)</th>
              <th>Result</th>
              <th className="text-right pr-4">Print</th>
            </tr>
          </thead>
          <tbody>
            {data?.map((b) => (
              <tr key={b.id} className="border-t">
                <td className="p-3">{b.markets?.name}<div className="text-xs text-muted-foreground">{fmtIST(b.created_at)} IST</div></td>
                <td>{gameLabel(b.game_type)} <span className="text-xs capitalize text-muted-foreground">{b.session}</span></td>
                <td className="font-display text-xl tracking-widest">{b.number}</td>
                <td className="font-semibold text-foreground">₹{b.points}</td>
                <td className={`font-semibold capitalize ${statusCls[b.status]}`}>{b.status}{b.payout > 0 && ` +₹${b.payout}`}</td>
                <td className="text-right pr-4">
                  <button
                    type="button"
                    onClick={() => handlePrintSingle(b)}
                    className="p-1.5 rounded-lg text-muted-foreground hover:text-gold hover:bg-gold/10 transition-colors cursor-pointer"
                    title="Print Bill Slip"
                  >
                    <Printer className="h-4 w-4" />
                  </button>
                </td>
              </tr>
            ))}
            {data?.length === 0 && <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">No plays yet.</td></tr>}
          </tbody>
        </table>
      </div>

      {/* Thermal Receipt Modal */}
      <ThermalReceiptModal
        open={isReceiptOpen}
        onOpenChange={setIsReceiptOpen}
        receiptData={receiptData}
      />
    </main>
  );
}
