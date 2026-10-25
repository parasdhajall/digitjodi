import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Users, Coins, CheckCircle, Shield, Clock, PlusCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, useProfile } from "@/hooks/useAuth";
import { marketsQuery } from "./index";
import { resultLabel, fmtTime, marketStatus, fmtIST } from "@/lib/matka";
import { AdminPlays } from "@/components/AdminPlays";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "Admin Management Panel — PlayOn" },
      { name: "description", content: "Manage markets, declare results and manage players." },
      { property: "og:title", content: "Admin Panel — PlayOn" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Admin,
});

function Admin() {
  const { user } = useAuth();
  const { data: profile, isLoading } = useProfile(user?.id);
  const { data: markets } = useQuery(marketsQuery);
  const qc = useQueryClient();

  const [activeTab, setActiveTab] = useState<"markets" | "plays" | "players">("markets");
  const [form, setForm] = useState({ name: "", open_time: "10:00", close_time: "11:00" });
  const [pannas, setPannas] = useState<Record<string, string>>({});
  const [times, setTimes] = useState<Record<string, { open_time: string; close_time: string }>>({});
  const [pointAdjust, setPointAdjust] = useState<Record<string, string>>({});

  // Query all registered players
  const { data: players } = useQuery({
    queryKey: ["admin-players"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["markets"] });
    qc.invalidateQueries({ queryKey: ["admin-bets"] });
    qc.invalidateQueries({ queryKey: ["admin-players"] });
    qc.invalidateQueries({ queryKey: ["profile"] });
  };

  const run = async (p: PromiseLike<{ error: { message: string } | null }>, ok: string) => {
    const { error } = await p;
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(ok);
    refresh();
  };

  const handleAdjustPoints = async (userId: string, currentPoints: number) => {
    const amount = Number(pointAdjust[userId]);
    if (!amount || isNaN(amount)) {
      toast.error("Please enter a valid amount (e.g. 500 or -200)");
      return;
    }
    const { error } = await supabase.rpc("admin_adjust_points" as any, {
      _user_id: userId,
      _points: amount,
    });
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(`Updated points by ${amount > 0 ? "+" + amount : amount} pts!`);
    setPointAdjust({ ...pointAdjust, [userId]: "" });
    refresh();
  };

  if (isLoading) return null;
  if (!profile?.isAdmin) {
    return <main className="p-8 text-center text-muted-foreground">Access denied. Admins only.</main>;
  }

  return (
    <main className="mx-auto max-w-5xl space-y-6 px-4 py-8">
      {/* Admin Title & Tabs */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b pb-4">
        <div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
            <Shield className="h-3.5 w-3.5" /> Full Control
          </span>
          <h1 className="mt-1 font-display text-4xl tracking-wide text-gold">Master Admin Panel</h1>
        </div>

        {/* Tab Navigation */}
        <div className="flex rounded-lg border bg-secondary/50 p-1">
          <button
            onClick={() => setActiveTab("markets")}
            className={`rounded-md px-3.5 py-1.5 text-xs font-semibold transition-colors ${
              activeTab === "markets" ? "bg-primary text-primary-foreground shadow" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Markets & Results
          </button>
          <button
            onClick={() => setActiveTab("plays")}
            className={`rounded-md px-3.5 py-1.5 text-xs font-semibold transition-colors ${
              activeTab === "plays" ? "bg-primary text-primary-foreground shadow" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Live Player Bets
          </button>
          <button
            onClick={() => setActiveTab("players")}
            className={`rounded-md px-3.5 py-1.5 text-xs font-semibold transition-colors ${
              activeTab === "players" ? "bg-primary text-primary-foreground shadow" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Players & Balances ({players?.length ?? 0})
          </button>
        </div>
      </div>

      {/* TAB 1: MARKETS & RESULTS */}
      {activeTab === "markets" && (
        <section className="space-y-6">
          {/* Add Market Form */}
          <form
            className="flex flex-wrap items-end gap-2 rounded-xl border bg-card p-4"
            onSubmit={(e) => {
              e.preventDefault();
              run(
                supabase.from("markets").insert({ ...form, sort_order: (markets?.length ?? 0) + 1 }),
                "Market added"
              );
              setForm({ ...form, name: "" });
            }}
          >
            <div className="flex-1 min-w-[200px]">
              <label className="text-xs text-muted-foreground mb-1 block">New Market Name</label>
              <Input
                placeholder="e.g. KALYAN DAY"
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Open Time</label>
              <Input
                type="time"
                value={form.open_time}
                onChange={(e) => setForm({ ...form, open_time: e.target.value })}
                className="w-32"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Close Time</label>
              <Input
                type="time"
                value={form.close_time}
                onChange={(e) => setForm({ ...form, close_time: e.target.value })}
                className="w-32"
              />
            </div>
            <Button>Add Market</Button>
          </form>

          {/* Markets List */}
          <div className="space-y-4">
            {markets?.map((m) => {
              const session = m.open_panna ? "close" : "open";
              const st = marketStatus(m);
              const done = !!m.close_panna;

              return (
                <div key={m.id} className="rounded-xl border bg-card p-5 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-3">
                    <div className="flex items-center gap-3">
                      <h2 className="font-display text-2xl tracking-wide">{m.name}</h2>
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-xs font-semibold border ${
                          st.state === "open" && !done
                            ? "bg-success/20 text-success border-success/30"
                            : "bg-destructive/20 text-destructive border-destructive/30"
                        }`}
                      >
                        {done ? "Results Declared" : st.note}
                      </span>
                    </div>

                    <div className="flex items-center gap-4">
                      <span className="font-display text-2xl tracking-widest text-primary">
                        {resultLabel(m.open_panna, m.close_panna)}
                      </span>
                      <label className="flex items-center gap-2 text-xs font-medium">
                        Active{" "}
                        <Switch
                          checked={m.active}
                          onCheckedChange={(v) =>
                            run(supabase.from("markets").update({ active: v }).eq("id", m.id), "Updated")
                          }
                        />
                      </label>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    {/* Timing Editor */}
                    <Input
                      type="time"
                      className="w-28 text-xs h-9"
                      title="Open time"
                      value={times[m.id]?.open_time ?? m.open_time}
                      onChange={(e) => {
                        const cur = times[m.id] ?? { open_time: m.open_time, close_time: m.close_time };
                        setTimes({ ...times, [m.id]: { ...cur, open_time: e.target.value } });
                      }}
                    />
                    <Input
                      type="time"
                      className="w-28 text-xs h-9"
                      title="Close time"
                      value={times[m.id]?.close_time ?? m.close_time}
                      onChange={(e) => {
                        const cur = times[m.id] ?? { open_time: m.open_time, close_time: m.close_time };
                        setTimes({ ...times, [m.id]: { ...cur, close_time: e.target.value } });
                      }}
                    />
                    <Button
                      size="sm"
                      variant="secondary"
                      className="text-xs h-9"
                      onClick={() => {
                        const t = times[m.id];
                        if (t) run(supabase.from("markets").update(t).eq("id", m.id), "Times updated");
                      }}
                    >
                      Save Times
                    </Button>

                    {/* Declare Result */}
                    {!m.close_panna ? (
                      <div className="flex items-center gap-1.5 ml-auto">
                        <Input
                          placeholder={`${session.toUpperCase()} panna (e.g. 123)`}
                          maxLength={3}
                          className="w-40 text-xs h-9"
                          value={pannas[m.id] ?? ""}
                          onChange={(e) =>
                            setPannas({ ...pannas, [m.id]: e.target.value.replace(/\D/g, "") })
                          }
                        />
                        <Button
                          size="sm"
                          className="h-9 text-xs"
                          onClick={() => {
                            run(
                              supabase.rpc("declare_result", {
                                _market: m.id,
                                _session: session,
                                _panna: pannas[m.id] ?? "",
                              }),
                              `Declared ${session.toUpperCase()} result and distributed winnings!`
                            );
                            setPannas({ ...pannas, [m.id]: "" });
                          }}
                        >
                          Declare {session.toUpperCase()}
                        </Button>
                      </div>
                    ) : (
                      <span className="ml-auto text-xs font-semibold text-success flex items-center gap-1">
                        <CheckCircle className="h-4 w-4" /> Full Day Declared
                      </span>
                    )}

                    <Button
                      variant="secondary"
                      size="sm"
                      className="h-9 text-xs"
                      onClick={() => run(supabase.rpc("reset_market", { _market: m.id }), "Market reset for a new day")}
                    >
                      Reset Day
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      className="h-9 text-xs"
                      onClick={() =>
                        confirm(`Delete ${m.name}?`) &&
                        run(supabase.from("markets").delete().eq("id", m.id), "Deleted")
                      }
                    >
                      Delete
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* TAB 2: LIVE PLAYER PLAYS */}
      {activeTab === "plays" && <AdminPlays markets={markets ?? []} />}

      {/* TAB 3: PLAYERS & BALANCES */}
      {activeTab === "players" && (
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-2xl tracking-wide text-gold">Registered Players</h2>
            <span className="text-xs text-muted-foreground">Total Players: {players?.length ?? 0}</span>
          </div>

          <div className="overflow-x-auto rounded-xl border bg-card">
            <table className="w-full text-xs">
              <thead className="bg-secondary text-left text-muted-foreground">
                <tr>
                  <th className="p-3">Player Name</th>
                  <th>Joined Date</th>
                  <th>Points Balance</th>
                  <th className="pr-3">Add / Deduct Points</th>
                </tr>
              </thead>
              <tbody>
                {players?.map((p) => (
                  <tr key={p.id} className="border-t hover:bg-muted/30">
                    <td className="p-3 font-semibold text-foreground">
                      <div className="flex items-center gap-2">
                        <Users className="h-3.5 w-3.5 text-primary" />
                        <span>{p.display_name || "Player"}</span>
                      </div>
                      <span className="text-[10px] text-muted-foreground font-mono">{p.id}</span>
                    </td>
                    <td className="text-muted-foreground">{fmtIST(p.created_at)}</td>
                    <td>
                      <span className="font-display text-lg tracking-wide text-gold">
                        {p.points.toLocaleString()} pts
                      </span>
                    </td>
                    <td className="pr-3">
                      <div className="flex items-center gap-2">
                        <Input
                          placeholder="+500 or -200"
                          type="number"
                          value={pointAdjust[p.id] ?? ""}
                          onChange={(e) => setPointAdjust({ ...pointAdjust, [p.id]: e.target.value })}
                          className="w-28 text-xs h-8"
                        />
                        <Button
                          size="sm"
                          className="h-8 text-xs"
                          onClick={() => handleAdjustPoints(p.id, p.points)}
                        >
                          Update Points
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
                {players?.length === 0 && (
                  <tr>
                    <td colSpan={4} className="p-8 text-center text-muted-foreground">
                      No players registered yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </main>
  );
}
