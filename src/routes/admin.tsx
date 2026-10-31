import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo, useEffect, useRef } from "react";
import { toast } from "sonner";
import {
  Users,
  Coins,
  CheckCircle,
  Shield,
  Clock,
  PlusCircle,
  Key,
  Ban,
  Search,
  CheckCircle2,
  AlertTriangle,
  X,
  Calendar,
  TrendingUp,
  TrendingDown,
  RefreshCw,
  Zap,
  DollarSign,
  Activity,
  BarChart3,
  Radio,
  Sparkles,
  ArrowUpRight,
  ArrowDownRight,
  ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, useProfile } from "@/hooks/useAuth";
import { marketsQuery } from "./index";
import { resultLabel, fmtTime, marketStatus, fmtIST, gameLabel, canMarketDeclareOpen, canMarketDeclareClose, isMarketOpenForAdmin, sortMarketsForAdmin } from "@/lib/matka";
import { AdminPlays } from "@/components/AdminPlays";
import { fetchRsbossLiveResults, type MarketLiveResult } from "@/lib/rsbossFetcher";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "Admin Management Panel — PlayOn" },
      { name: "description", content: "Manage markets, live RSBoss results, declare results, view profit/loss, change user passwords and block accounts." },
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

type AutoFetchMode = "manual" | "semi_auto" | "full_auto";

function Admin() {
  const { user } = useAuth();
  const { data: profile, isLoading } = useProfile(user?.id);
  const { data: markets } = useQuery(marketsQuery);
  const sortedMarkets = useMemo(() => {
    return markets ? sortMarketsForAdmin(markets) : [];
  }, [markets]);
  const qc = useQueryClient();

  const [activeTab, setActiveTab] = useState<"markets" | "plays" | "players" | "pnl">("markets");
  const [form, setForm] = useState({ name: "", open_time: "10:00", close_time: "11:00" });
  const [pannas, setPannas] = useState<Record<string, string>>({});
  const [times, setTimes] = useState<Record<string, { open_time: string; close_time: string }>>({});
  const [pointAdjust, setPointAdjust] = useState<Record<string, string>>({});

  // Auto-Fetch & Dual Mode State (Manual | Semi-Auto 1-Click | Full-Auto)
  const [autoFetchMode, setAutoFetchMode] = useState<AutoFetchMode>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("admin_autofetch_mode");
      if (saved === "manual" || saved === "semi_auto" || saved === "full_auto") {
        return saved;
      }
    }
    return "semi_auto";
  });

  const handleSetAutoFetchMode = (mode: AutoFetchMode) => {
    setAutoFetchMode(mode);
    if (typeof window !== "undefined") {
      localStorage.setItem("admin_autofetch_mode", mode);
    }
    toast.success(
      mode === "manual"
        ? "Switched to Manual Result Declaration"
        : mode === "semi_auto"
        ? "Switched to Semi-Auto: 1-Click confirmation enabled"
        : "Switched to Full-Auto: Automatic Result Declaration active!"
    );
  };

  // Password change dialog state
  const [passwordModalUser, setPasswordModalUser] = useState<AdminUser | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [userSearch, setUserSearch] = useState("");

  // P&L Date Filter State
  const now = new Date();
  const todayDateStr = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(now);
  const yesterdayDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const yesterdayDateStr = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(yesterdayDate);

  const [pnlDateFilter, setPnlDateFilter] = useState<"today" | "yesterday" | "custom" | "all">("today");
  const [pnlCustomDate, setPnlCustomDate] = useState<string>(todayDateStr);

  const pnlTargetDate =
    pnlDateFilter === "today"
      ? todayDateStr
      : pnlDateFilter === "yesterday"
      ? yesterdayDateStr
      : pnlCustomDate;

  // Query RSBoss Live Results
  const {
    data: rsbossData,
    isLoading: isRsbossLoading,
    isFetching: isRsbossFetching,
    refetch: refetchRsboss,
  } = useQuery({
    queryKey: ["rsboss-live-results"],
    queryFn: async () => {
      return await fetchRsbossLiveResults();
    },
    refetchInterval: autoFetchMode === "manual" ? false : 30000,
    staleTime: 15000,
  });

  // Query all registered users with emails and block status
  const { data: players } = useQuery<AdminUser[]>({
    queryKey: ["admin-users-list"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_get_all_users" as any);
      if (error) {
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

  const [selectedDateForPlayers, setSelectedDateForPlayers] = useState<string>("");

  const { data: userBetStats } = useQuery({
    queryKey: ["admin-user-bet-stats", selectedDateForPlayers],
    refetchInterval: 10000,
    queryFn: async () => {
      let minStartIso = new Date(`${yesterdayDateStr}T00:00:00+05:30`).toISOString();

      if (selectedDateForPlayers) {
        const customStartIso = new Date(`${selectedDateForPlayers}T00:00:00+05:30`).toISOString();
        if (customStartIso < minStartIso) minStartIso = customStartIso;
      }

      const { data } = await supabase
        .from("bets")
        .select("user_id, points, status, created_at")
        .gte("created_at", minStartIso);

      const todayMap: Record<string, number> = {};
      const yesterdayMap: Record<string, number> = {};
      const customMap: Record<string, number> = {};

      for (const b of data ?? []) {
        if (b.status !== "refunded") {
          const bDateStr = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date(b.created_at));
          if (bDateStr === todayDateStr) {
            todayMap[b.user_id] = (todayMap[b.user_id] || 0) + (b.points || 0);
          } else if (bDateStr === yesterdayDateStr) {
            yesterdayMap[b.user_id] = (yesterdayMap[b.user_id] || 0) + (b.points || 0);
          }
          if (selectedDateForPlayers && bDateStr === selectedDateForPlayers) {
            customMap[b.user_id] = (customMap[b.user_id] || 0) + (b.points || 0);
          }
        }
      }

      return { todayMap, yesterdayMap, customMap, todayStr: todayDateStr, yesterdayStr: yesterdayDateStr };
    },
  });

  // Query Bets for Profit & Loss Calculations
  const { data: pnlBets = [] } = useQuery({
    queryKey: ["admin-pnl-bets", pnlDateFilter, pnlTargetDate],
    refetchInterval: 15000,
    queryFn: async () => {
      let q = supabase
        .from("bets")
        .select("id, market_id, game_type, number, session, points, payout, status, created_at");

      if (pnlDateFilter !== "all" && pnlTargetDate) {
        const startIso = new Date(`${pnlTargetDate}T00:00:00+05:30`).toISOString();
        const endIso = new Date(`${pnlTargetDate}T23:59:59.999+05:30`).toISOString();
        q = q.gte("created_at", startIso).lte("created_at", endIso);
      } else {
        q = q.limit(2500);
      }

      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });

  // Profit & Loss Aggregates per Market and Overall
  const { marketPnLMap, grandPnL, gameTypePnLMap } = useMemo(() => {
    const marketMap: Record<
      string,
      { collection: number; payout: number; net: number; betsCount: number; wonCount: number }
    > = {};
    const gameMap: Record<
      string,
      { collection: number; payout: number; net: number; count: number }
    > = {};

    let totalCollection = 0;
    let totalPayout = 0;
    let totalBets = 0;
    let totalWins = 0;

    for (const b of pnlBets) {
      if (b.status === "refunded") continue;

      const pts = Number(b.points) || 0;
      const pay = b.status === "won" ? Number(b.payout) || 0 : 0;

      // Overall
      totalCollection += pts;
      totalPayout += pay;
      totalBets += 1;
      if (b.status === "won") totalWins += 1;

      // Market
      if (!marketMap[b.market_id]) {
        marketMap[b.market_id] = { collection: 0, payout: 0, net: 0, betsCount: 0, wonCount: 0 };
      }
      marketMap[b.market_id].collection += pts;
      marketMap[b.market_id].payout += pay;
      marketMap[b.market_id].betsCount += 1;
      if (b.status === "won") marketMap[b.market_id].wonCount += 1;

      // Game Type
      const gt = b.game_type || "other";
      if (!gameMap[gt]) {
        gameMap[gt] = { collection: 0, payout: 0, net: 0, count: 0 };
      }
      gameMap[gt].collection += pts;
      gameMap[gt].payout += pay;
      gameMap[gt].count += 1;
    }

    // Finalize nets
    for (const k in marketMap) {
      marketMap[k].net = marketMap[k].collection - marketMap[k].payout;
    }
    for (const k in gameMap) {
      gameMap[k].net = gameMap[k].collection - gameMap[k].payout;
    }

    const netHousePnL = totalCollection - totalPayout;
    const marginPct = totalCollection > 0 ? (netHousePnL / totalCollection) * 100 : 0;
    const winRate = totalBets > 0 ? (totalWins / totalBets) * 100 : 0;

    return {
      marketPnLMap: marketMap,
      gameTypePnLMap: gameMap,
      grandPnL: {
        totalCollection,
        totalPayout,
        netHousePnL,
        marginPct,
        totalBets,
        totalWins,
        winRate,
      },
    };
  }, [pnlBets]);

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
    qc.invalidateQueries({ queryKey: ["admin-pnl-bets"] });
    qc.invalidateQueries({ queryKey: ["admin-users-list"] });
    qc.invalidateQueries({ queryKey: ["profile"] });
  };

  const run = async (p: PromiseLike<{ error: { message: string } | null }>, ok: string) => {
    const { error } = await p;
    if (error) {
      toast.error(error.message);
      return false;
    }
    toast.success(ok);
    refresh();
    return true;
  };

  // Declare Result Function (Manual or 1-Click Auto)
  const handleDeclare = async (marketId: string, marketName: string, session: "open" | "close", panna: string) => {
    if (!panna || !/^[0-9]{3}$/.test(panna)) {
      toast.error("Panna must be exactly 3 digits (0-9)");
      return;
    }
    const success = await run(
      supabase.rpc("declare_result", {
        _market: marketId,
        _session: session,
        _panna: panna,
      }),
      `Declared ${marketName} ${session.toUpperCase()} (${panna}) and distributed payouts!`
    );
    if (success) {
      setPannas((prev) => ({ ...prev, [marketId]: "" }));
    }
  };

  // Full-Auto Lock Ref to avoid race conditions
  const isAutoDeclaringRef = useRef<boolean>(false);

  // Full-Auto Background Checker (Safely guarded by IST session times)
  useEffect(() => {
    if (autoFetchMode !== "full_auto" || !markets || !rsbossData?.results || isAutoDeclaringRef.current) {
      return;
    }

    const checkAndAutoDeclare = async () => {
      for (const m of markets) {
        if (!m.active) continue;
        const live = rsbossData.results[m.name];
        if (!live) continue;

        // Auto declare Open ONLY if open time has arrived today and open_panna is missing
        if (!m.open_panna && canMarketDeclareOpen(m) && live.openPanna && /^[0-9]{3}$/.test(live.openPanna)) {
          isAutoDeclaringRef.current = true;
          try {
            await handleDeclare(m.id, m.name, "open", live.openPanna);
          } finally {
            isAutoDeclaringRef.current = false;
          }
          break; // process one per cycle to let queries settle
        }

        // Auto declare Close ONLY if open is declared, close is missing, and close time has arrived today
        if (m.open_panna && !m.close_panna && canMarketDeclareClose(m) && live.closePanna && /^[0-9]{3}$/.test(live.closePanna)) {
          isAutoDeclaringRef.current = true;
          try {
            await handleDeclare(m.id, m.name, "close", live.closePanna);
          } finally {
            isAutoDeclaringRef.current = false;
          }
          break;
        }
      }
    };

    checkAndAutoDeclare();
  }, [autoFetchMode, markets, rsbossData]);

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
    toast.success(`Password updated successfully for ${passwordModalUser.email}!`);
    setPasswordModalUser(null);
    setNewPassword("");
  };

  const handleToggleBlock = async (u: AdminUser) => {
    const willBlock = !u.is_blocked;
    const { error } = await supabase.rpc("admin_toggle_user_block" as any, {
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

  // Find unopened markets that currently have results set from previous days
  const unopenedMarketsWithResults = useMemo(() => {
    return (markets ?? []).filter((m) => {
      const canOpen = canMarketDeclareOpen(m);
      return !canOpen && (m.open_panna || m.close_panna);
    });
  }, [markets]);

  // 6:00 AM Morning Auto-Reset Engine:
  // Automatically detects markets whose open session has not arrived today, but still carry old results from yesterday.
  // Overnight markets (e.g. Main Bazar 21:40 - 00:05) are protected until 00:05 AM.
  // At 06:00 AM, any unopened market with old results is automatically reset in DB so today starts clean!
  const isAutoResettingRef = useRef(false);

  useEffect(() => {
    if (!markets || markets.length === 0 || isAutoResettingRef.current) return;

    const staleMarkets = markets.filter((m) => {
      const canOpen = canMarketDeclareOpen(m);
      return !canOpen && (m.open_panna || m.close_panna);
    });

    if (staleMarkets.length === 0) return;

    const runMorningAutoReset = async () => {
      isAutoResettingRef.current = true;
      try {
        console.log(`[6:00 AM Auto-Reset] Found ${staleMarkets.length} unopened markets with old results. Resetting for today...`);
        let count = 0;
        for (const m of staleMarkets) {
          const { error } = await supabase.rpc("reset_market", { _market: m.id });
          if (!error) count++;
        }
        if (count > 0) {
          toast.success(`☀️ 6:00 AM Auto-Reset: Cleaned ${count} markets for today's new games!`, {
            duration: 5000,
          });
          refresh();
        }
      } catch (err) {
        console.error("[6:00 AM Auto-Reset] Error during auto-reset:", err);
      } finally {
        isAutoResettingRef.current = false;
      }
    };

    runMorningAutoReset();
  }, [markets]);

  // Handlers to reset unopened markets or all markets
  const [isResettingUnopened, setIsResettingUnopened] = useState(false);
  const handleResetUnopenedMarkets = async () => {
    if (unopenedMarketsWithResults.length === 0) return;
    setIsResettingUnopened(true);
    toast.info(`Resetting ${unopenedMarketsWithResults.length} unopened markets...`);
    let count = 0;
    try {
      for (const m of unopenedMarketsWithResults) {
        const { error } = await supabase.rpc("reset_market", { _market: m.id });
        if (!error) count++;
      }
      toast.success(`Successfully reset ${count} unopened markets for play!`);
      refresh();
    } finally {
      setIsResettingUnopened(false);
    }
  };

  const [isResettingAll, setIsResettingAll] = useState(false);
  const handleResetAllMarkets = async () => {
    if (!confirm("Are you sure you want to reset ALL 14 markets for a new day?")) return;
    setIsResettingAll(true);
    toast.info("Resetting all markets...");
    let count = 0;
    try {
      for (const m of markets ?? []) {
        const { error } = await supabase.rpc("reset_market", { _market: m.id });
        if (!error) count++;
      }
      toast.success(`All ${count} markets have been reset for today!`);
      refresh();
    } finally {
      setIsResettingAll(false);
    }
  };

  if (isLoading) return null;
  if (!profile?.isAdmin) {
    return <main className="p-8 text-center text-muted-foreground">Access denied. Admins only.</main>;
  }

  // Count ready auto results (strictly checking session timing)
  const readyRsbossDeclarations = (markets ?? []).filter((m) => {
    const live = rsbossData?.results[m.name];
    if (!live) return false;
    if (!m.open_panna && canMarketDeclareOpen(m) && live.openPanna) return true;
    if (m.open_panna && !m.close_panna && canMarketDeclareClose(m) && live.closePanna) return true;
    return false;
  });

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
        <div className="flex flex-wrap rounded-lg border bg-secondary/50 p-1 gap-1">
          <button
            onClick={() => setActiveTab("markets")}
            className={`rounded-md px-3.5 py-1.5 text-xs font-semibold transition-colors ${
              activeTab === "markets" ? "bg-primary text-primary-foreground shadow" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Markets & Results
          </button>
          <button
            onClick={() => setActiveTab("pnl")}
            className={`flex items-center gap-1.5 rounded-md px-3.5 py-1.5 text-xs font-semibold transition-colors ${
              activeTab === "pnl" ? "bg-primary text-primary-foreground shadow" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <TrendingUp className="h-3.5 w-3.5" />
            Profit & Loss (P&L)
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

      {/* DUAL-MODE & RSBOSS LIVE RESULTS CONTROLLER BANNER */}
      <div className="rounded-xl border border-primary/30 bg-gradient-to-r from-card via-secondary/30 to-card p-4 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          {/* Left: RSBoss Status indicator */}
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
              </span>
              <span className="font-semibold text-xs text-foreground tracking-wide flex items-center gap-1">
                RSBoss.net Live Sync
                <span className="text-[10px] text-muted-foreground font-mono">({rsbossData?.source || "connecting"})</span>
              </span>
              {readyRsbossDeclarations.length > 0 && (
                <span className="rounded-full bg-primary/20 text-primary border border-primary/30 px-2 py-0.2 text-[10px] font-bold animate-pulse">
                  {readyRsbossDeclarations.length} Pending Results Detected!
                </span>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground">
              Live market results fetched automatically from <strong className="text-foreground">rsboss.net</strong>. Choose between Manual, 1-Click Semi-Auto, or Full-Auto declare.
            </p>
          </div>

          {/* Right: Mode Switcher & Sync Button */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center rounded-lg border bg-background/80 p-0.5 text-xs font-medium">
              <button
                type="button"
                onClick={() => handleSetAutoFetchMode("manual")}
                className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-all ${
                  autoFetchMode === "manual"
                    ? "bg-secondary text-foreground shadow-sm border border-border"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Manual Only
              </button>
              <button
                type="button"
                onClick={() => handleSetAutoFetchMode("semi_auto")}
                className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-all flex items-center gap-1 ${
                  autoFetchMode === "semi_auto"
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Zap className="h-3 w-3" /> Semi-Auto (1-Click)
              </button>
              <button
                type="button"
                onClick={() => handleSetAutoFetchMode("full_auto")}
                className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-all flex items-center gap-1 ${
                  autoFetchMode === "full_auto"
                    ? "bg-emerald-600 text-white shadow-sm animate-pulse"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Sparkles className="h-3 w-3" /> Full Auto
              </button>
            </div>

            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs gap-1.5"
              disabled={isRsbossFetching}
              onClick={() => {
                refetchRsboss();
                toast.info("Checking rsboss.net for latest results...");
              }}
            >
              <RefreshCw className={`h-3 w-3 ${isRsbossFetching ? "animate-spin" : ""}`} />
              Sync Now
            </Button>
          </div>
        </div>
      </div>

      {/* TAB 1: MARKETS & RESULTS */}
      {activeTab === "markets" && (
        <section className="space-y-6">
          {/* Warning Banner if Unopened Markets have Results Set */}
          {unopenedMarketsWithResults.length > 0 && (
            <div className="rounded-xl border border-amber-500/50 bg-amber-500/10 p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-md">
              <div className="flex items-start gap-3">
                <div className="rounded-full bg-amber-500/20 p-2 text-amber-500 shrink-0">
                  <AlertTriangle className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-semibold text-sm text-foreground">
                    {unopenedMarketsWithResults.length} Unopened Markets have previous results set
                  </h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Today's open time hasn't arrived yet for: <strong className="text-foreground">{unopenedMarketsWithResults.map((m) => m.name).join(", ")}</strong>.
                    6:00 AM Auto-Reset cleans them automatically so players can place fresh bets today.
                  </p>
                </div>
              </div>
              <Button
                size="sm"
                disabled={isResettingUnopened}
                className="bg-amber-500 hover:bg-amber-600 text-black font-bold text-xs gap-1.5 shrink-0 shadow"
                onClick={handleResetUnopenedMarkets}
              >
                <RefreshCw className={`h-3.5 w-3.5 ${isResettingUnopened ? "animate-spin" : ""}`} />
                Reset Unopened Markets ({unopenedMarketsWithResults.length})
              </Button>
            </div>
          )}

          {/* Add Market Form & Reset All Action */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-end justify-between gap-3">
            <form
              className="flex-1 flex flex-wrap items-end gap-2 rounded-xl border bg-card p-4"
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

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
              <span className="hidden sm:inline-flex items-center gap-1 text-[11px] font-medium text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1.5 rounded-lg">
                ☀️ 6:00 AM Auto-Reset Active
              </span>
              <Button
                type="button"
                variant="outline"
                disabled={isResettingAll}
                className="h-full border-primary/40 text-xs font-semibold gap-1.5 hover:bg-primary/10"
                onClick={handleResetAllMarkets}
                title="Reset all markets for a brand new day"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${isResettingAll ? "animate-spin" : ""}`} />
                Reset All Markets (New Day)
              </Button>
            </div>
          </div>

          {/* Markets List */}
          <div className="space-y-4">
            {sortedMarkets.map((m, index) => {
              const session: "open" | "close" = m.open_panna ? "close" : "open";
              const st = marketStatus(m);
              const done = !!m.close_panna;
              const live = rsbossData?.results[m.name];
              const pnl = marketPnLMap[m.id] || { collection: 0, payout: 0, net: 0, betsCount: 0 };

              const canOpen = canMarketDeclareOpen(m);
              const canClose = canMarketDeclareClose(m);
              const isSessionTimePassed = session === "open" ? canOpen : canClose;
              const isUnopenedWithOldResult = !canOpen && (m.open_panna || m.close_panna);

              // Determine if RSBoss has a suggested result ready for declaration
              const suggestedPanna =
                session === "open"
                  ? live?.openPanna
                  : live?.closePanna;

              const isMarketClosed = !isMarketOpenForAdmin(m);
              const isFirstClosed = isMarketClosed && index > 0 && isMarketOpenForAdmin(sortedMarkets[index - 1]);

              return (
                <div key={m.id} className="space-y-4">
                  {isFirstClosed && (
                    <div className="pt-4 pb-2 flex items-center gap-3">
                      <div className="h-px flex-1 bg-border/60" />
                      <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/80 flex items-center gap-1.5">
                        <CheckCircle className="h-3.5 w-3.5 text-success" /> Full Day Declared / Closed Markets
                      </span>
                      <div className="h-px flex-1 bg-border/60" />
                    </div>
                  )}

                  <div className="rounded-xl border bg-card p-5 space-y-3.5 transition-all hover:border-primary/40">
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-3">
                    <div className="flex flex-wrap items-center gap-3">
                      <h2 className="font-display text-2xl tracking-wide">{m.name}</h2>
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-xs font-semibold border ${
                          isUnopenedWithOldResult
                            ? "bg-amber-500/20 text-amber-400 border-amber-500/30"
                            : !canOpen && !m.open_panna
                            ? "bg-primary/20 text-primary border-primary/30"
                            : st.state === "open" && !done
                            ? "bg-success/20 text-success border-success/30"
                            : "bg-destructive/20 text-destructive border-destructive/30"
                        }`}
                      >
                        {isUnopenedWithOldResult
                          ? "⚠️ Unopened (Has Old Result — Click Reset Day)"
                          : !canOpen && !m.open_panna
                          ? `🕒 Opens at ${fmtTime(m.open_time)}`
                          : done
                          ? "Results Declared"
                          : st.note}
                      </span>

                      {/* Mini Market P&L Badge */}
                      <span
                        className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-mono font-semibold border ${
                          pnl.net > 0
                            ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                            : pnl.net < 0
                            ? "bg-rose-500/10 text-rose-400 border-rose-500/30"
                            : "bg-secondary text-muted-foreground border-border"
                        }`}
                        title={`Bets: ${pnl.betsCount} | In: ₹${pnl.collection} | Out: ₹${pnl.payout}`}
                      >
                        {pnl.net >= 0 ? (
                          <ArrowUpRight className="h-3 w-3 text-emerald-400" />
                        ) : (
                          <ArrowDownRight className="h-3 w-3 text-rose-400" />
                        )}
                        P&L: ₹{pnl.net.toLocaleString()} ({pnl.betsCount} bets)
                      </span>
                    </div>

                    <div className="flex items-center gap-4">
                      {/* Current DB Result */}
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

                  {/* RSBoss Live Status Chip & 1-Click Action Bar */}
                  {live && (
                    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-secondary/40 px-3 py-1.5 text-xs border border-border/60">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-muted-foreground">rsboss.net Live:</span>
                        <span className="font-mono font-bold text-foreground bg-background px-2 py-0.5 rounded border">
                          {live.rawResult}
                        </span>
                        <span className="text-[11px] text-muted-foreground">
                          {!canOpen ? (
                            <span className="text-amber-400 font-medium">
                              (Old / Yesterday's result — Market opens at {fmtTime(m.open_time)})
                            </span>
                          ) : session === "close" && !canClose ? (
                            <span className="text-primary font-medium">
                              (Open declared: {m.open_panna} — Close session running until {fmtTime(m.close_time)})
                            </span>
                          ) : (
                            <span>
                              {live.openPanna && <>Open: <span className="font-mono text-primary font-semibold">{live.openPanna}</span></>}
                              {live.closePanna && <>, Close: <span className="font-mono text-primary font-semibold">{live.closePanna}</span></>}
                            </span>
                          )}
                        </span>
                      </div>

                      {/* 1-Click Auto Declare Button ONLY IF session time has actually arrived! */}
                      {!done && suggestedPanna && isSessionTimePassed && (
                        <div className="flex items-center gap-2">
                          <Button
                            size="sm"
                            className="h-7 text-xs bg-gold hover:bg-gold-light text-black font-bold gap-1 shadow-sm"
                            onClick={() => handleDeclare(m.id, m.name, session, suggestedPanna)}
                          >
                            <Zap className="h-3 w-3 fill-current" />
                            1-Click Declare {session.toUpperCase()} ({suggestedPanna})
                          </Button>
                          <button
                            type="button"
                            className="text-[11px] text-muted-foreground hover:text-foreground underline"
                            onClick={() => setPannas({ ...pannas, [m.id]: suggestedPanna })}
                            title="Copy to manual input below"
                          >
                            Fill Box
                          </button>
                        </div>
                      )}

                      {!done && !isSessionTimePassed && (
                        <span className="text-[11px] font-mono text-muted-foreground bg-secondary/60 px-2 py-0.5 rounded">
                          Waiting for {session === "open" ? `open (${fmtTime(m.open_time)})` : `close (${fmtTime(m.close_time)})`}
                        </span>
                      )}
                    </div>
                  )}

                  {/* Control Row: Times, Manual Declare, Reset, Delete */}
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

                    {/* Manual Declare Result */}
                    {!m.close_panna ? (
                      <div className="flex items-center gap-1.5 ml-auto">
                        <Input
                          placeholder={`${session.toUpperCase()} panna (e.g. 123)`}
                          maxLength={3}
                          className="w-40 text-xs h-9 font-mono"
                          value={pannas[m.id] ?? ""}
                          onChange={(e) =>
                            setPannas({ ...pannas, [m.id]: e.target.value.replace(/\D/g, "") })
                          }
                        />
                        <Button
                          size="sm"
                          className="h-9 text-xs"
                          onClick={() => handleDeclare(m.id, m.name, session, pannas[m.id] ?? "")}
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
              </div>
            );
          })}
          </div>
        </section>
      )}

      {/* TAB 2: PROFIT & LOSS (P&L) DASHBOARD */}
      {activeTab === "pnl" && (
        <section className="space-y-6">
          {/* Header & Date Filter Bar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b pb-4">
            <div>
              <h2 className="font-display text-3xl tracking-wide text-gold">House Profit & Loss (P&L)</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Real-time financial analytics: Inflow (Collection) vs Outflow (Winning Payouts) across all markets.
              </p>
            </div>

            {/* Date Filters */}
            <div className="flex flex-wrap items-center gap-1.5 rounded-lg border bg-secondary/60 p-1 text-xs">
              <button
                type="button"
                onClick={() => setPnlDateFilter("today")}
                className={`rounded px-3 py-1 font-semibold transition-colors ${
                  pnlDateFilter === "today" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Today
              </button>
              <button
                type="button"
                onClick={() => setPnlDateFilter("yesterday")}
                className={`rounded px-3 py-1 font-semibold transition-colors ${
                  pnlDateFilter === "yesterday" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Yesterday
              </button>
              <button
                type="button"
                onClick={() => setPnlDateFilter("all")}
                className={`rounded px-3 py-1 font-semibold transition-colors ${
                  pnlDateFilter === "all" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                All Time
              </button>
              <div className="flex items-center gap-1 pl-2 border-l border-border/80">
                <input
                  type="date"
                  value={pnlCustomDate}
                  max={todayDateStr}
                  onChange={(e) => {
                    setPnlCustomDate(e.target.value);
                    setPnlDateFilter("custom");
                  }}
                  className="bg-transparent text-xs font-semibold text-foreground focus:outline-none cursor-pointer"
                />
              </div>
            </div>
          </div>

          {/* 4 GRAND SUMMARY METRIC CARDS */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {/* Total Collection */}
            <div className="rounded-xl border bg-card p-4 space-y-1.5 shadow-sm">
              <div className="flex items-center justify-between text-muted-foreground">
                <span className="text-xs font-medium uppercase tracking-wider">Total Collection (In)</span>
                <div className="p-1.5 rounded-lg bg-primary/10 text-primary">
                  <Coins className="h-4 w-4" />
                </div>
              </div>
              <div className="font-display text-3xl font-bold tracking-tight text-foreground">
                ₹{grandPnL.totalCollection.toLocaleString()}
              </div>
              <div className="text-[11px] text-muted-foreground">
                Total played across {grandPnL.totalBets} bets
              </div>
            </div>

            {/* Total Payout */}
            <div className="rounded-xl border bg-card p-4 space-y-1.5 shadow-sm">
              <div className="flex items-center justify-between text-muted-foreground">
                <span className="text-xs font-medium uppercase tracking-wider">Total Payouts (Out)</span>
                <div className="p-1.5 rounded-lg bg-rose-500/10 text-rose-400">
                  <ArrowDownRight className="h-4 w-4" />
                </div>
              </div>
              <div className="font-display text-3xl font-bold tracking-tight text-rose-400">
                ₹{grandPnL.totalPayout.toLocaleString()}
              </div>
              <div className="text-[11px] text-muted-foreground">
                Won by players across {grandPnL.totalWins} bets
              </div>
            </div>

            {/* Net House Profit / Loss */}
            <div
              className={`rounded-xl border p-4 space-y-1.5 shadow-sm ${
                grandPnL.netHousePnL >= 0
                  ? "bg-emerald-950/20 border-emerald-500/30"
                  : "bg-rose-950/20 border-rose-500/30"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Net House P&L
                </span>
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-bold tracking-wider ${
                    grandPnL.netHousePnL >= 0
                      ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                      : "bg-rose-500/20 text-rose-400 border border-rose-500/30"
                  }`}
                >
                  {grandPnL.netHousePnL >= 0 ? "PROFIT" : "LOSS"}
                </span>
              </div>
              <div
                className={`font-display text-3xl font-bold tracking-tight ${
                  grandPnL.netHousePnL >= 0 ? "text-emerald-400" : "text-rose-400"
                }`}
              >
                {grandPnL.netHousePnL >= 0 ? "+" : ""}₹{grandPnL.netHousePnL.toLocaleString()}
              </div>
              <div className="text-[11px] text-muted-foreground">
                House Margin: <strong className="text-foreground">{grandPnL.marginPct.toFixed(1)}%</strong>
              </div>
            </div>

            {/* Player Win Rate & Volume */}
            <div className="rounded-xl border bg-card p-4 space-y-1.5 shadow-sm">
              <div className="flex items-center justify-between text-muted-foreground">
                <span className="text-xs font-medium uppercase tracking-wider">Player Win Rate</span>
                <div className="p-1.5 rounded-lg bg-secondary text-primary">
                  <Activity className="h-4 w-4" />
                </div>
              </div>
              <div className="font-display text-3xl font-bold tracking-tight text-foreground">
                {grandPnL.winRate.toFixed(1)}%
              </div>
              <div className="text-[11px] text-muted-foreground">
                {grandPnL.totalWins} wins / {grandPnL.totalBets} total bets
              </div>
            </div>
          </div>

          {/* MARKET-BY-MARKET BREAKDOWN TABLE */}
          <div className="rounded-xl border bg-card overflow-hidden shadow-sm">
            <div className="p-4 border-b flex items-center justify-between">
              <div className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5 text-primary" />
                <h3 className="font-display text-xl tracking-wide">Market-by-Market P&L Breakdown</h3>
              </div>
              <span className="text-xs text-muted-foreground">
                Date: <strong className="text-foreground font-mono">{pnlTargetDate}</strong>
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-secondary/70 text-left text-muted-foreground border-b">
                  <tr>
                    <th className="p-3">Market</th>
                    <th>Result (DB)</th>
                    <th className="text-right">Total Bets</th>
                    <th className="text-right">Collection (₹)</th>
                    <th className="text-right">Payout (₹)</th>
                    <th className="text-right">Net House P&L</th>
                    <th className="text-right">Margin %</th>
                    <th className="text-center pr-3">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {sortedMarkets.map((m) => {
                    const stats = marketPnLMap[m.id] || { collection: 0, payout: 0, net: 0, betsCount: 0, wonCount: 0 };
                    const margin = stats.collection > 0 ? (stats.net / stats.collection) * 100 : 0;
                    const isProfit = stats.net >= 0;

                    return (
                      <tr key={m.id} className="hover:bg-muted/30 transition-colors">
                        <td className="p-3 font-semibold text-foreground">
                          {m.name}
                        </td>
                        <td>
                          <span className="font-mono text-primary font-semibold">
                            {resultLabel(m.open_panna, m.close_panna)}
                          </span>
                        </td>
                        <td className="text-right font-mono">{stats.betsCount}</td>
                        <td className="text-right font-mono font-medium">₹{stats.collection.toLocaleString()}</td>
                        <td className="text-right font-mono text-rose-400 font-medium">₹{stats.payout.toLocaleString()}</td>
                        <td className="text-right font-mono font-bold">
                          <span className={isProfit ? "text-emerald-400" : "text-rose-400"}>
                            {isProfit ? "+" : ""}₹{stats.net.toLocaleString()}
                          </span>
                        </td>
                        <td className="text-right font-mono">
                          <span
                            className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                              margin >= 0
                                ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                                : "bg-rose-500/10 text-rose-400 border border-rose-500/20"
                            }`}
                          >
                            {margin.toFixed(1)}%
                          </span>
                        </td>
                        <td className="text-center pr-3">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-[11px] gap-1 text-muted-foreground hover:text-foreground"
                            onClick={() => setActiveTab("plays")}
                          >
                            View Bets <ExternalLink className="h-3 w-3" />
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* GAME-TYPE BREAKDOWN GRID */}
          <div className="space-y-3">
            <h3 className="font-display text-xl tracking-wide flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" /> Game-Type Breakdown
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {[
                "single",
                "jodi",
                "single_panna",
                "double_panna",
                "triple_panna",
                "half_sangam",
                "full_sangam",
              ].map((gt) => {
                const gStats = gameTypePnLMap[gt] || { collection: 0, payout: 0, net: 0, count: 0 };
                const isProf = gStats.net >= 0;
                return (
                  <div key={gt} className="rounded-xl border bg-card p-3.5 space-y-2 shadow-sm">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-xs text-foreground uppercase tracking-wide">
                        {gameLabel(gt)}
                      </span>
                      <span className="text-[10px] text-muted-foreground font-mono">
                        {gStats.count} bets
                      </span>
                    </div>
                    <div className="space-y-0.5 text-xs font-mono">
                      <div className="flex justify-between text-muted-foreground">
                        <span>In:</span>
                        <span className="text-foreground">₹{gStats.collection.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between text-muted-foreground">
                        <span>Out:</span>
                        <span className="text-rose-400">₹{gStats.payout.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between pt-1 border-t border-border font-bold">
                        <span>Net:</span>
                        <span className={isProf ? "text-emerald-400" : "text-rose-400"}>
                          {isProf ? "+" : ""}₹{gStats.net.toLocaleString()}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {/* TAB 3: LIVE PLAYER PLAYS */}
      {activeTab === "plays" && <AdminPlays markets={sortedMarkets} />}

      {/* TAB 4: USERS, SECURITY, PASSWORDS & BLOCKING */}
      {activeTab === "players" && (
        <section className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-3">
            <div>
              <h2 className="font-display text-2xl tracking-wide text-gold">User Security & Account Control</h2>
              <p className="text-xs text-muted-foreground">Change user passwords, block/unblock accounts and adjust point balances.</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {/* Specific Date Filter for Players */}
              <div className="flex items-center gap-1.5 rounded-lg border bg-secondary/80 px-2.5 py-1 text-xs">
                <Calendar className="h-3.5 w-3.5 text-primary shrink-0" />
                <span className="font-semibold text-[11px] text-muted-foreground hidden sm:inline">Specific Date:</span>
                <input
                  type="date"
                  value={selectedDateForPlayers}
                  max={userBetStats?.todayStr}
                  onChange={(e) => setSelectedDateForPlayers(e.target.value)}
                  className="bg-transparent text-xs font-bold text-foreground focus:outline-none cursor-pointer"
                  title="Check specific date bet for players"
                />
                {selectedDateForPlayers && (
                  <button
                    type="button"
                    onClick={() => setSelectedDateForPlayers("")}
                    className="ml-1 text-[11px] text-muted-foreground hover:text-foreground font-bold px-1"
                    title="Clear date"
                  >
                    ✕
                  </button>
                )}
              </div>

              {/* Search User */}
              <div className="relative min-w-[200px]">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search email or username…"
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                  className="pl-8 h-9 text-xs"
                />
              </div>
            </div>
          </div>

          <div className="overflow-x-auto rounded-xl border bg-card">
            <table className="w-full text-xs">
              <thead className="bg-secondary text-left text-muted-foreground">
                <tr>
                  <th className="p-3">Player / Mobile</th>
                  <th>Status</th>
                  <th>Balance (₹)</th>
                  <th>Today's Bet (₹)</th>
                  <th>Yesterday's Bet (₹)</th>
                  {selectedDateForPlayers &&
                    selectedDateForPlayers !== userBetStats?.todayStr &&
                    selectedDateForPlayers !== userBetStats?.yesterdayStr && (
                      <th className="text-accent">{selectedDateForPlayers} Bet (₹)</th>
                    )}
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
                        <span>{p.email.replace("@playon.app", "")}</span>
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
                      <span className="font-mono text-xs font-semibold text-foreground">
                        ₹{(userBetStats?.todayMap[p.id] || 0).toLocaleString()}
                      </span>
                    </td>

                    <td>
                      <span className="font-mono text-xs text-muted-foreground">
                        ₹{(userBetStats?.yesterdayMap[p.id] || 0).toLocaleString()}
                      </span>
                    </td>

                    {selectedDateForPlayers &&
                      selectedDateForPlayers !== userBetStats?.todayStr &&
                      selectedDateForPlayers !== userBetStats?.yesterdayStr && (
                        <td>
                          <span className="font-mono text-xs font-bold text-accent">
                            ₹{(userBetStats?.customMap[p.id] || 0).toLocaleString()}
                          </span>
                        </td>
                      )}

                    <td className="text-muted-foreground font-mono">
                      {fmtIST(p.created_at)}
                    </td>

                    <td className="p-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {/* Adjust Points Inline */}
                        <div className="flex items-center gap-1">
                          <Input
                            placeholder="± Points"
                            className="w-20 h-8 text-[11px] px-2 font-mono"
                            value={pointAdjust[p.id] ?? ""}
                            onChange={(e) => setPointAdjust({ ...pointAdjust, [p.id]: e.target.value })}
                          />
                          <Button
                            size="sm"
                            variant="secondary"
                            className="h-8 px-2 text-[11px]"
                            onClick={() => handleAdjustPoints(p.id)}
                            title="Add or remove balance"
                          >
                            Save
                          </Button>
                        </div>

                        {/* Reset Password Button */}
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 px-2.5 text-[11px] gap-1"
                          onClick={() => {
                            setPasswordModalUser(p);
                            setNewPassword("");
                          }}
                        >
                          <Key className="h-3 w-3 text-primary" /> Password
                        </Button>

                        {/* Block/Unblock Button */}
                        <Button
                          size="sm"
                          variant={p.is_blocked ? "default" : "destructive"}
                          className="h-8 px-2.5 text-[11px] gap-1"
                          onClick={() => handleToggleBlock(p)}
                        >
                          <Ban className="h-3 w-3" />
                          {p.is_blocked ? "Unblock" : "Block"}
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
                {filteredPlayers.length === 0 && (
                  <tr>
                    <td colSpan={selectedDateForPlayers ? 8 : 7} className="p-8 text-center text-muted-foreground">
                      No users found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* PASSWORD RESET MODAL */}
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
