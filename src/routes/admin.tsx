import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { toast } from "sonner";
import { Users, Coins, CheckCircle, Shield, Clock, PlusCircle, Key, Ban, Search, CheckCircle2, AlertTriangle, X } from "lucide-react";
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
      { name: "description", content: "Manage markets, declare results, change user passwords and block accounts." },
      { property: "og:title", content: "Admin Panel — PlayOn" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Admin,
});

type AdminUser = {
  id: string;
  email: string;
  display_name: string;
  points: number;
  is_blocked: boolean;
  created_at: string;
  last_sign_in_at: string | null;
};

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

  // Password change dialog state
  const [passwordModalUser, setPasswordModalUser] = useState<AdminUser | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [userSearch, setUserSearch] = useState("");

  // Query all registered users with emails and block status
  const { data: players } = useQuery<AdminUser[]>({
    queryKey: ["admin-users-list"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_get_all_users" as any);
      if (error) {
        // Fallback to profiles if function fails
        const { data: profs, error: pErr } = await supabase.from("profiles").select("*").order("created_at", { ascending: false });
        if (pErr) throw pErr;
        return (profs ?? []).map((p) => ({
          id: p.id,
          email: p.display_name || "Player",
          display_name: p.display_name || "Player",
          points: p.points,
          is_blocked: false,
          created_at: p.created_at,
          last_sign_in_at: null,
        }));
      }
      return data as AdminUser[];
    },
  });

  const { data: todayBets } = useQuery({
    queryKey: ["admin-today-bets"],
    refetchInterval: 10000,
    queryFn: async () => {
      const now = new Date();
      const istDateStr = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(now);
      const istStartIso = new Date(`${istDateStr}T00:00:00+05:30`).toISOString();
      const { data } = await supabase
        .from("bets")
        .select("user_id, points, status")
        .gte("created_at", istStartIso);
      return data ?? [];
    },
  });

  const todayExpenseByUser = useMemo(() => {
    const map: Record<string, number> = {};
    for (const b of todayBets ?? []) {
      if (b.status !== "refunded") {
        map[b.user_id] = (map[b.user_id] || 0) + (b.points || 0);
      }
    }
    return map;
  }, [todayBets]);

  const filteredPlayers = useMemo(() => {
    if (!players) return [];
    if (!userSearch.trim()) return players;
    const q = userSearch.toLowerCase();
    return players.filter(
      (p) => p.email?.toLowerCase().includes(q) || p.display_name?.toLowerCase().includes(q) || p.id.includes(q)
    );
  }, [players, userSearch]);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["markets"] });
    qc.invalidateQueries({ queryKey: ["admin-bets"] });
    qc.invalidateQueries({ queryKey: ["admin-users-list"] });
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

  const handleAdjustPoints = async (userId: string) => {
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
    toast.success(`Updated balance by ${amount > 0 ? "+" + amount : amount} ₹!`);
    setPointAdjust({ ...pointAdjust, [userId]: "" });
    refresh();
  };

  const handleUpdatePassword = async () => {
    if (!passwordModalUser || newPassword.length < 6) {
      toast.error("Password must be at least 6 characters long");
      return;
    }
    const { error } = await supabase.rpc("admin_set_user_password" as any, {
      _user_id: passwordModalUser.id,
      _new_password: newPassword,
    });
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(`Password successfully updated for ${passwordModalUser.email}!`);
    setPasswordModalUser(null);
    setNewPassword("");
  };

  const handleToggleBlock = async (u: AdminUser) => {
    const willBlock = !u.is_blocked;
    const actionText = willBlock ? "BLOCK" : "UNBLOCK";
    if (!confirm(`Are you sure you want to ${actionText} ${u.email}?`)) return;

    const { error } = await supabase.rpc("admin_toggle_block_user" as any, {
      _user_id: u.id,
      _blocked: willBlock,
    });
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(willBlock ? `Account for ${u.email} is now BLOCKED!` : `Account for ${u.email} is now UNBLOCKED!`);
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
            Users & Security ({players?.length ?? 0})
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

      {/* TAB 3: USERS, SECURITY, PASSWORDS & BLOCKING */}
      {activeTab === "players" && (
        <section className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-3">
            <div>
              <h2 className="font-display text-2xl tracking-wide text-gold">User Security & Account Control</h2>
              <p className="text-xs text-muted-foreground">Change user passwords, block/unblock accounts and adjust point balances.</p>
            </div>
            {/* Search User */}
            <div className="relative min-w-[240px]">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search email or username…"
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
                className="pl-8 h-9 text-xs"
              />
            </div>
          </div>

          <div className="overflow-x-auto rounded-xl border bg-card">
            <table className="w-full text-xs">
              <thead className="bg-secondary text-left text-muted-foreground">
                <tr>
                  <th className="p-3">User / Email</th>
                  <th>Status</th>
                  <th>Balance (₹)</th>
                  <th>Today's Bet (₹)</th>
                  <th>Joined Date</th>
                  <th className="text-right pr-4">Security Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredPlayers.map((p) => (
                  <tr key={p.id} className={`border-t hover:bg-muted/30 ${p.is_blocked ? "bg-destructive/10" : ""}`}>
                    <td className="p-3">
                      <div className="font-semibold text-foreground flex items-center gap-2">
                        <Users className="h-3.5 w-3.5 text-primary" />
                        <span>{p.email}</span>
                      </div>
                      <div className="text-[10px] text-muted-foreground">Name: {p.display_name}</div>
                    </td>

                    <td>
                      {p.is_blocked ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-destructive/20 border border-destructive/40 px-2.5 py-0.5 text-[11px] font-semibold text-destructive">
                          <Ban className="h-3 w-3" /> BLOCKED
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-success/20 border border-success/40 px-2.5 py-0.5 text-[11px] font-semibold text-success">
                          <CheckCircle2 className="h-3 w-3" /> ACTIVE
                        </span>
                      )}
                    </td>

                    <td>
                      <span className="font-display text-lg tracking-wide text-gold">
                        ₹{p.points.toLocaleString()}
                      </span>
                    </td>

                    <td>
                      <span className="font-semibold text-primary">
                        ₹{(todayExpenseByUser[p.id] ?? 0).toLocaleString()}
                      </span>
                    </td>

                    <td className="text-muted-foreground text-[11px]">{fmtIST(p.created_at)}</td>

                    <td className="text-right pr-4">
                      <div className="inline-flex items-center justify-end gap-2">
                        {/* Change Password Button */}
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 text-xs flex items-center gap-1.5 border-primary/40 hover:bg-primary/20"
                          onClick={() => {
                            setPasswordModalUser(p);
                            setNewPassword("");
                          }}
                        >
                          <Key className="h-3.5 w-3.5 text-primary" />
                          Change Password
                        </Button>

                        {/* Block / Unblock Button */}
                        <Button
                          size="sm"
                          variant={p.is_blocked ? "default" : "destructive"}
                          className="h-8 text-xs flex items-center gap-1.5"
                          onClick={() => handleToggleBlock(p)}
                        >
                          {p.is_blocked ? (
                            <>
                              <CheckCircle2 className="h-3.5 w-3.5" /> Unblock User
                            </>
                          ) : (
                            <>
                              <Ban className="h-3.5 w-3.5" /> Block User
                            </>
                          )}
                        </Button>

                        {/* Quick Balance Adjust */}
                        <div className="flex items-center gap-1 ml-2">
                          <Input
                            placeholder="±₹"
                            type="number"
                            value={pointAdjust[p.id] ?? ""}
                            onChange={(e) => setPointAdjust({ ...pointAdjust, [p.id]: e.target.value })}
                            className="w-20 text-xs h-8 text-center"
                          />
                          <Button
                            size="sm"
                            variant="secondary"
                            className="h-8 text-xs px-2.5"
                            onClick={() => handleAdjustPoints(p.id)}
                            title="Add or subtract amount (₹)"
                          >
                            Update
                          </Button>
                        </div>
                      </div>
                    </td>
                  </tr>
                ))}

                {filteredPlayers.length === 0 && (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-muted-foreground">
                      No users found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* CHANGE PASSWORD DIALOG MODAL */}
      {passwordModalUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl border bg-card p-6 shadow-2xl space-y-4">
            <div className="flex items-start justify-between border-b pb-3">
              <div>
                <h3 className="text-lg font-semibold flex items-center gap-2">
                  <Key className="h-5 w-5 text-primary" /> Reset User Password
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  User: <strong className="text-foreground">{passwordModalUser.email}</strong>
                </p>
              </div>
              <button
                onClick={() => setPasswordModalUser(null)}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-medium text-foreground block">
                Enter New Password for User:
              </label>
              <Input
                type="text"
                placeholder="Minimum 6 characters (e.g. User@123)"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="font-mono"
              />
              <p className="text-[11px] text-muted-foreground">
                The password will be updated immediately. The user can log in with this new password right away.
              </p>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t">
              <Button variant="ghost" size="sm" onClick={() => setPasswordModalUser(null)}>
                Cancel
              </Button>
              <Button size="sm" onClick={handleUpdatePassword} disabled={newPassword.length < 6}>
                Update Password
              </Button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
