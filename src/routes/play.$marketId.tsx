import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, Calendar, Clock, X, ShoppingBag, Trash2, Plus, CheckCircle2, Printer, Layers, Sparkles, Table, Check, Search, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ThermalReceiptModal } from "@/components/ThermalReceiptModal";
import { PrinterStatusBadge } from "@/components/PrinterStatusBadge";
import {
  type ReceiptData,
  printerManager,
  generateEscPosBytes,
} from "@/lib/thermalPrinter";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, useProfile, useTodayExpense } from "@/hooks/useAuth";
import { GAMES, PLAYABLE, type GameType, fmtTime, resultLabel, isOpenPast, isClosePast, getPlayerDisplayName, canMarketDeclareOpen } from "@/lib/matka";
import {
  SINGLE_PANNA_BY_ANK,
  DOUBLE_PANNA_BY_ANK,
  TRIPLE_PANNAS,
  SINGLE_DIGITS,
  JODI_BY_ROW,
  PANEL_FAMILIES_35,
  findFamilyByPanna,
  normalizePanna,
  getPannaTypeInfo,
  type PanelFamily,
} from "@/lib/pannaChartData";
import {
  JODI_FAMILIES_15,
  findFamilyByJodi,
  type JodiFamily,
} from "@/lib/jodiFamilyData";

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

export type BucketItem = {
  id: string;
  game: GameType;
  gameLabel: string;
  session: "open" | "close";
  number: string;
  points: number;
};

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

  // Bucket / Order Cart State
  const [bucket, setBucket] = useState<BucketItem[]>([]);
  const [isBucketOpen, setIsBucketOpen] = useState(false);

  // Thermal Receipt Slip State
  const [receiptData, setReceiptData] = useState<ReceiptData | null>(null);
  const [isReceiptOpen, setIsReceiptOpen] = useState(false);

  // Jodi Bulk state
  const [selectedJodis, setSelectedJodis] = useState<string[]>([]);
  const [jodiPoints, setJodiPoints] = useState<Record<string, number>>({});

  // Ank Bulk state (digits 0 to 9)
  const [ankPoints, setAnkPoints] = useState<Record<number, number>>({});

  // Manual input state for Sangam
  const [sangamPart1, setSangamPart1] = useState("");
  const [sangamPart2, setSangamPart2] = useState("");

  // Family Panna state
  const [familyInput, setFamilyInput] = useState("");
  const [activeFamily, setActiveFamily] = useState<PanelFamily | null>(null);
  const [selectedFamilyPannas, setSelectedFamilyPannas] = useState<string[]>([]);
  const [isFamilyChartOpen, setIsFamilyChartOpen] = useState(false);
  const [familyChartSearch, setFamilyChartSearch] = useState("");

  // Jodi Family state
  const [jodiFamilyInput, setJodiFamilyInput] = useState("");
  const [activeJodiFamily, setActiveJodiFamily] = useState<JodiFamily | null>(null);
  const [selectedFamilyJodis, setSelectedFamilyJodis] = useState<string[]>([]);
  const [isJodiFamilyChartOpen, setIsJodiFamilyChartOpen] = useState(false);
  const [jodiFamilyChartSearch, setJodiFamilyChartSearch] = useState("");

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
    setFamilyInput("");
    setActiveFamily(null);
    setSelectedFamilyPannas([]);
    setJodiFamilyInput("");
    setActiveJodiFamily(null);
    setSelectedFamilyJodis([]);
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

  const winMultiplier = g.rate;
  const potentialWin = (points || 0) * winMultiplier;

  // Total amount in the bucket
  const totalBucketAmount = bucket.reduce((sum, item) => sum + item.points, 0);

  // Helper to add items into Bucket
  const addToBucket = (newItems: Omit<BucketItem, "id">[]): boolean => {
    if (marketClosed) {
      toast.error(`Market has closed for today (${m?.name} closed at ${fmtTime(m?.close_time || "")})`);
      return false;
    }

    setBucket((prev) => {
      const updated = [...prev];
      for (const item of newItems) {
        // Merge with existing item if same game, session, and number
        const existingIdx = updated.findIndex(
          (x) => x.game === item.game && x.session === item.session && x.number === item.number
        );
        if (existingIdx !== -1) {
          updated[existingIdx] = {
            ...updated[existingIdx],
            points: updated[existingIdx].points + item.points,
          };
        } else {
          updated.push({
            ...item,
            id: Math.random().toString(36).slice(2, 9),
          });
        }
      }
      return updated;
    });

    const addedCount = newItems.length;
    const addedTotal = newItems.reduce((acc, x) => acc + x.points, 0);
    toast.success(`🧺 Added ${addedCount} bet${addedCount > 1 ? "s" : ""} (₹${addedTotal}) to Bucket!`);
    return true;
  };

  const removeFromBucket = (id: string) => {
    setBucket((prev) => prev.filter((item) => item.id !== id));
  };

  const updateBucketItemPoints = (id: string, newPoints: number) => {
    const safePts = Math.max(5, newPoints);
    setBucket((prev) =>
      prev.map((item) => (item.id === id ? { ...item, points: safePts } : item))
    );
  };

  const clearBucket = () => {
    setBucket([]);
    toast.info("Bucket cleared");
  };

  // Add Single / Panna / Sangam to Bucket
  const handleSingleAddToBucket = (): boolean => {
    if (marketClosed) {
      toast.error(`Market has closed for today (${m?.name} closed at ${fmtTime(m?.close_time || "")})`);
      return false;
    }

    if (game === "half_sangam" || game === "full_sangam") {
      const num = `${sangamPart1}-${sangamPart2}`;
      if (!sangamPart1 || !sangamPart2) {
        toast.error("Please enter both parts for Sangam");
        return false;
      }
      if (openClosed) {
        toast.error("Sangam can only be played before Open timing.");
        return false;
      }
      if (points < 5) {
        toast.error("Minimum bet is ₹5");
        return false;
      }
      const ok = addToBucket([
        {
          game,
          gameLabel: g.label,
          session: "close",
          number: num,
          points,
        },
      ]);
      if (ok) {
        setSangamPart1("");
        setSangamPart2("");
      }
      return ok;
    }

    if (effSession === "open" && openClosed) {
      toast.error(`Open session has closed for ${m?.name} (${fmtTime(m?.open_time || "")}).`);
      return false;
    }

    if (g.closeOnly && openClosed) {
      toast.error(`${g.label} can only be played before Open timing.`);
      return false;
    }

    if (!selectedNumber) {
      toast.error("Please select a number first");
      return false;
    }

    if (points < 5) {
      toast.error("Minimum bet is ₹5");
      return false;
    }

    const ok = addToBucket([
      {
        game,
        gameLabel: g.label,
        session: effSession,
        number: selectedNumber,
        points,
      },
    ]);
    if (ok) {
      setSelectedNumber(null);
    }
    return ok;
  };

  // Add Jodi Bulk to Bucket
  const handleAddJodiBulkToBucket = (): boolean => {
    if (marketClosed) {
      toast.error(`Market has closed for today (${m?.name} closed at ${fmtTime(m?.close_time || "")})`);
      return false;
    }
    if (openClosed) {
      toast.error(`Jodi Bulk is closed because Open timing (${fmtTime(m?.open_time || "")}) has passed.`);
      return false;
    }
    if (selectedJodis.length === 0) {
      toast.error("Please select at least one Jodi");
      return false;
    }

    const bets = selectedJodis.map((j) => ({
      game: "jodi" as GameType,
      gameLabel: "Jodi",
      session: "close" as const,
      number: j,
      points: jodiPoints[j] || 5,
    }));

    const anyInvalid = bets.some((b) => b.points < 5);
    if (anyInvalid) {
      toast.error("Minimum bet per Jodi is ₹5");
      return false;
    }

    const ok = addToBucket(bets);
    if (ok) {
      setSelectedJodis([]);
      setJodiPoints({});
    }
    return ok;
  };

  // Add Ank Bulk to Bucket
  const handleAddAnkBulkToBucket = (): boolean => {
    if (marketClosed) {
      toast.error(`Market has closed for today (${m?.name} closed at ${fmtTime(m?.close_time || "")})`);
      return false;
    }
    if (effSession === "open" && openClosed) {
      toast.error(`Open session has closed for ${m?.name} (${fmtTime(m?.open_time || "")}).`);
      return false;
    }
    if (activeAnkEntries.length === 0) {
      toast.error("Please enter at least ₹5 for one digit");
      return false;
    }

    const bets = activeAnkEntries.map((e) => ({
      game: "single" as GameType,
      gameLabel: "Single Digit",
      session: effSession,
      number: e.number,
      points: e.points,
    }));

    const ok = addToBucket(bets);
    if (ok) {
      setAnkPoints({});
    }
    return ok;
  };

  // Family Panna helpers & bucket action
  const handleFamilyInputChange = (val: string) => {
    const cleaned = val.replace(/\D/g, "").slice(0, 3);
    setFamilyInput(cleaned);
    if (cleaned.length === 3) {
      const fam = findFamilyByPanna(cleaned);
      if (fam) {
        setActiveFamily(fam);
        setSelectedFamilyPannas(fam.pannas);
      } else {
        setActiveFamily(null);
        setSelectedFamilyPannas([]);
      }
    } else if (cleaned.length === 0) {
      setActiveFamily(null);
      setSelectedFamilyPannas([]);
    }
  };

  const selectFamily = (fam: PanelFamily) => {
    setActiveFamily(fam);
    setFamilyInput(fam.family);
    setSelectedFamilyPannas(fam.pannas);
  };

  const toggleFamilyPanna = (p: string) => {
    setSelectedFamilyPannas((prev) =>
      prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]
    );
  };

  const selectAllFamilyPannas = () => {
    if (activeFamily) {
      setSelectedFamilyPannas(activeFamily.pannas);
    }
  };

  const deselectAllFamilyPannas = () => {
    setSelectedFamilyPannas([]);
  };

  const totalFamilyPoints = selectedFamilyPannas.length * points;

  const handleAddFamilyToBucket = (): boolean => {
    if (marketClosed) {
      toast.error(`Market has closed for today (${m?.name} closed at ${fmtTime(m?.close_time || "")})`);
      return false;
    }
    if (effSession === "open" && openClosed) {
      toast.error(`Open session has closed for ${m?.name} (${fmtTime(m?.open_time || "")}).`);
      return false;
    }
    if (!activeFamily || selectedFamilyPannas.length === 0) {
      toast.error("Please enter a 3-digit Panna or select a Family");
      return false;
    }
    if (points < 5) {
      toast.error("Minimum bet per Panna is ₹5");
      return false;
    }

    const bets = selectedFamilyPannas.map((p) => {
      const info = getPannaTypeInfo(p);
      return {
        game: info.gameType as GameType,
        gameLabel: `Family (${info.short})`,
        session: effSession,
        number: p,
        points: points,
      };
    });

    const ok = addToBucket(bets);
    if (ok) {
      toast.success(`Added ${bets.length} Family Pannas to Bucket (₹${bets.length * points})`);
    }
    return ok;
  };

  // Jodi Family helpers & bucket action
  const handleJodiFamilyInputChange = (val: string) => {
    const cleaned = val.replace(/\D/g, "").slice(0, 2);
    setJodiFamilyInput(cleaned);
    if (cleaned.length === 2) {
      const fam = findFamilyByJodi(cleaned);
      if (fam) {
        setActiveJodiFamily(fam);
        setSelectedFamilyJodis(fam.jodis);
      } else {
        setActiveJodiFamily(null);
        setSelectedFamilyJodis([]);
      }
    } else if (cleaned.length === 0) {
      setActiveJodiFamily(null);
      setSelectedFamilyJodis([]);
    }
  };

  const selectJodiFamily = (fam: JodiFamily) => {
    setActiveJodiFamily(fam);
    setJodiFamilyInput(fam.family);
    setSelectedFamilyJodis(fam.jodis);
  };

  const toggleFamilyJodi = (j: string) => {
    setSelectedFamilyJodis((prev) =>
      prev.includes(j) ? prev.filter((x) => x !== j) : [...prev, j]
    );
  };

  const selectAllFamilyJodis = () => {
    if (activeJodiFamily) {
      setSelectedFamilyJodis(activeJodiFamily.jodis);
    }
  };

  const deselectAllFamilyJodis = () => {
    setSelectedFamilyJodis([]);
  };

  const totalJodiFamilyPoints = selectedFamilyJodis.length * points;

  const handleAddJodiFamilyToBucket = (): boolean => {
    if (marketClosed) {
      toast.error(`Market has closed for today (${m?.name} closed at ${fmtTime(m?.close_time || "")})`);
      return false;
    }
    if (openClosed) {
      toast.error(`Jodi games are closed because Open timing (${fmtTime(m?.open_time || "")}) has passed.`);
      return false;
    }
    if (!activeJodiFamily || selectedFamilyJodis.length === 0) {
      toast.error("Please enter a 2-digit Jodi or select a Family");
      return false;
    }
    if (points < 5) {
      toast.error("Minimum bet per Jodi is ₹5");
      return false;
    }

    const bets = selectedFamilyJodis.map((j) => ({
      game: "jodi" as GameType,
      gameLabel: `Family Jodi (${activeJodiFamily.family})`,
      session: "close" as const,
      number: j,
      points: points,
    }));

    const ok = addToBucket(bets);
    if (ok) {
      toast.success(`Added ${bets.length} Family Jodis (${activeJodiFamily.family} Family) to Bucket (₹${bets.length * points})`);
    }
    return ok;
  };

  // Confirm and Place All Bucket Bets
  const handleConfirmBucket = async () => {
    if (!user) {
      toast.error("Please sign in to place plays");
      navigate({ to: "/auth" });
      return;
    }

    if (marketClosed) {
      toast.error(`Market has closed for today (${m?.name} closed at ${fmtTime(m?.close_time || "")})`);
      return;
    }

    if (bucket.length === 0) {
      toast.error("Your bucket is empty. Add plays first.");
      return;
    }

    const betsPayload = bucket.map((item) => ({
      game:
        item.game === "jodi_bulk" || (item.game as string) === "family_jodi"
          ? "jodi"
          : item.game === "ank_bulk"
            ? "single"
            : (item.game as string) === "family_panna"
              ? getPannaTypeInfo(item.number).gameType
              : item.game,
      session: item.session,
      number: item.number,
      points: item.points,
    }));

    setBusy(true);
    const { error } = await supabase.rpc("place_bucket_bets", {
      _market: marketId,
      _bets: betsPayload,
    });
    setBusy(false);

    if (error) {
      toast.error(error.message);
      return;
    }

    const placedCount = bucket.length;
    const placedTotal = totalBucketAmount;

    // Generate Thermal Receipt Slip Data
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

    const newReceipt: ReceiptData = {
      slipId: `PO-${Date.now().toString().slice(-6)}`,
      marketName: m?.name || "MARKET",
      playerName: getPlayerDisplayName(user, profile),
      dateStr,
      timeStr,
      items: bucket.map((b) => ({
        gameLabel: b.gameLabel,
        session: b.session,
        number: b.number,
        points: b.points,
      })),
      totalPoints: placedTotal,
    };

    setReceiptData(newReceipt);
    setIsReceiptOpen(true);

    // Auto-Print Receipt if printer is connected
    if (printerManager.isConnected()) {
      toast.info(`🖨️ Printing slip on ${printerManager.deviceName}...`);
      printerManager.sendBytes(generateEscPosBytes(newReceipt)).then((res) => {
        if (res.success) {
          toast.success("Receipt printed on thermal printer!");
        } else {
          toast.error(`Print failed: ${res.message}`);
        }
      });
    } else {
      toast("Tip: Connect your Bluetooth thermal printer to auto-print paper slips on confirm.", {
        action: {
          label: "Connect Printer",
          onClick: () => printerManager.connect(),
        },
      });
    }

    toast.success(
      `🎉 Success! Placed ${placedCount} bets on ${m?.name} (Total ₹${placedTotal})!`
    );

    setBucket([]);
    setIsBucketOpen(false);
    qc.invalidateQueries({ queryKey: ["profile"] });
    qc.invalidateQueries({ queryKey: ["today-expense"] });
    qc.invalidateQueries({ queryKey: ["market", marketId] });
  };

  // Play button handler: queues active selection into bucket and opens bucket for confirmation
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

    if (game === "jodi_bulk") {
      if (selectedJodis.length > 0) {
        const ok = handleAddJodiBulkToBucket();
        if (ok) setIsBucketOpen(true);
      } else if (bucket.length > 0) {
        setIsBucketOpen(true);
      } else {
        toast.error("Please select at least one Jodi");
      }
      return;
    }

    if (game === "ank_bulk") {
      if (activeAnkEntries.length > 0) {
        const ok = handleAddAnkBulkToBucket();
        if (ok) setIsBucketOpen(true);
      } else if (bucket.length > 0) {
        setIsBucketOpen(true);
      } else {
        toast.error("Please enter at least ₹5 for one digit");
      }
      return;
    }

    if (game === "family_jodi") {
      if (activeJodiFamily && selectedFamilyJodis.length > 0) {
        const ok = handleAddJodiFamilyToBucket();
        if (ok) setIsBucketOpen(true);
      } else if (bucket.length > 0) {
        setIsBucketOpen(true);
      } else {
        toast.error("Please enter a 2-digit Jodi or select a Family first");
      }
      return;
    }

    if (game === "family_panna") {
      if (activeFamily && selectedFamilyPannas.length > 0) {
        const ok = handleAddFamilyToBucket();
        if (ok) setIsBucketOpen(true);
      } else if (bucket.length > 0) {
        setIsBucketOpen(true);
      } else {
        toast.error("Please enter a 3-digit Panna or select a Family first");
      }
      return;
    }

    if (selectedNumber || game.includes("sangam")) {
      const ok = handleSingleAddToBucket();
      if (ok) setIsBucketOpen(true);
    } else if (bucket.length > 0) {
      setIsBucketOpen(true);
    } else {
      toast.error("Please select a number first");
    }
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

          <div className="flex items-center gap-2">
            <PrinterStatusBadge showTextOnMobile={false} />

            {receiptData && (
              <button
                type="button"
                onClick={() => setIsReceiptOpen(true)}
                className="flex items-center gap-1 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-1 text-xs font-semibold text-emerald-500 hover:bg-emerald-500/20 transition-all cursor-pointer"
                title="Print Last Slip"
              >
                <Printer className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Slip</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => setIsBucketOpen(true)}
              className="relative flex items-center gap-1.5 rounded-full border border-gold/40 bg-gold/10 px-2.5 py-1 text-xs font-semibold text-gold hover:bg-gold/20 transition-all cursor-pointer"
              title="View Bet Bucket"
            >
              <ShoppingBag className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Bucket</span>
              {bucket.length > 0 && (
                <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-gold px-1 text-[10px] font-black text-slate-950">
                  {bucket.length}
                </span>
              )}
            </button>

            <div className="flex items-center gap-1.5 rounded-full border border-primary/40 bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary" title="Today's Expense">
              <span className="text-[10px] uppercase font-bold text-muted-foreground hidden sm:inline">Today's Bet:</span>
              <span className="font-bold text-foreground">₹{todayExp?.totalExpense ?? 0}</span>
            </div>
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
            {resultLabel(
              m && canMarketDeclareOpen(m) ? m.open_panna : null,
              m && canMarketDeclareOpen(m) ? m.close_panna : null
            )}
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
                : game === "family_jodi"
                  ? "JODI FAMILY"
                : game === "family_panna"
                  ? `FAMILY PANNA (${effSession.toUpperCase()})`
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
        {game !== "jodi_bulk" && game !== "ank_bulk" && game !== "family_panna" && game !== "family_jodi" && (
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

        {/* 3.1 FAMILY PANNA / SET PANA (35 Families) */}
        {game === "family_panna" && (
          <div className="space-y-4">
            {/* Search or Enter Panna Card */}
            <div className="rounded-xl border border-primary/30 bg-primary/5 p-3.5 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs font-bold text-primary uppercase tracking-wide">
                  <Sparkles className="h-4 w-4 text-gold" />
                  <span>Enter Panna or Pick Family</span>
                </div>
                <button
                  type="button"
                  onClick={() => setIsFamilyChartOpen(true)}
                  className="flex items-center gap-1 text-xs font-bold text-gold hover:underline"
                >
                  <Table className="h-3.5 w-3.5" /> 35 Families Chart
                </button>
              </div>

              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Input
                    type="text"
                    inputMode="numeric"
                    maxLength={3}
                    placeholder="Enter 3-Digit Panna (e.g. 128)"
                    value={familyInput}
                    onChange={(e) => handleFamilyInputChange(e.target.value)}
                    className="font-mono text-center text-lg font-bold tracking-widest h-11 bg-background"
                  />
                  {familyInput && (
                    <button
                      type="button"
                      onClick={() => {
                        setFamilyInput("");
                        setActiveFamily(null);
                        setSelectedFamilyPannas([]);
                      }}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>
                {activeFamily && (
                  <div className="rounded-xl border border-gold/40 bg-gold/15 px-3 py-2 text-center shrink-0">
                    <span className="block text-[10px] uppercase font-bold text-muted-foreground">Family</span>
                    <strong className="font-mono text-base font-black text-gold">{activeFamily.family}</strong>
                  </div>
                )}
              </div>

              {/* Quick 35 Families Chips Scroll */}
              <div className="space-y-1.5 pt-1">
                <div className="flex items-center justify-between text-[11px] text-muted-foreground font-semibold px-0.5">
                  <span>Quick Pick from 35 Families:</span>
                  <span className="text-[10px] text-muted-foreground">Tap to select</span>
                </div>
                <div className="flex gap-1.5 overflow-x-auto no-scrollbar py-1">
                  {PANEL_FAMILIES_35.map((fam) => {
                    const isFamActive = activeFamily?.family === fam.family;
                    return (
                      <button
                        key={fam.family}
                        type="button"
                        onClick={() => selectFamily(fam)}
                        className={`rounded-lg px-2.5 py-1.5 font-mono text-xs font-bold shrink-0 transition-all ${
                          isFamActive
                            ? "bg-primary text-primary-foreground ring-2 ring-primary shadow-md scale-105"
                            : "border bg-card text-foreground hover:border-primary hover:bg-secondary"
                        }`}
                      >
                        {fam.family}
                        <span className="ml-1 text-[10px] opacity-75">({fam.count})</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Active Family Members View */}
            {activeFamily ? (
              <div className="rounded-xl border border-border/80 bg-background/50 p-3 space-y-3">
                <div className="flex items-center justify-between border-b pb-2">
                  <div className="flex items-center gap-2">
                    <span className="font-display text-lg font-bold text-foreground">
                      Family <strong className="font-mono text-gold">{activeFamily.family}</strong>
                    </span>
                    <span className="rounded-md border bg-secondary px-2 py-0.5 text-xs font-bold text-gold">
                      {selectedFamilyPannas.length} / {activeFamily.count} Selected
                    </span>
                  </div>

                  <div className="flex items-center gap-2 text-xs">
                    <button
                      type="button"
                      onClick={selectAllFamilyPannas}
                      className="font-semibold text-primary hover:underline"
                    >
                      All
                    </button>
                    <span className="text-muted-foreground">•</span>
                    <button
                      type="button"
                      onClick={deselectAllFamilyPannas}
                      className="font-semibold text-muted-foreground hover:text-foreground"
                    >
                      Clear
                    </button>
                  </div>
                </div>

                {/* Pannas Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {activeFamily.pannas.map((p) => {
                    const isSelected = selectedFamilyPannas.includes(p);
                    const info = getPannaTypeInfo(p);
                    return (
                      <button
                        key={p}
                        type="button"
                        onClick={() => toggleFamilyPanna(p)}
                        className={`flex items-center justify-between rounded-xl p-2.5 transition-all text-left border ${
                          isSelected
                            ? "border-primary bg-primary/10 shadow-sm ring-1 ring-primary"
                            : "border-border/60 bg-card/60 opacity-60 hover:opacity-100"
                        }`}
                      >
                        <div>
                          <span className="font-mono text-base font-bold tracking-wider block text-foreground">
                            {p}
                          </span>
                          <span className="text-[10px] font-semibold text-muted-foreground">
                            {info.short} · {info.rate}×
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-bold text-gold">₹{points}</span>
                          <div
                            className={`flex h-5 w-5 items-center justify-center rounded-md border text-[11px] font-bold ${
                              isSelected
                                ? "bg-primary border-primary text-primary-foreground"
                                : "border-muted-foreground/40 bg-secondary"
                            }`}
                          >
                            {isSelected ? <Check className="h-3 w-3 stroke-[3]" /> : null}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>

                {/* Summary calculation */}
                <div className="flex items-center justify-between text-xs pt-1 px-1 text-muted-foreground">
                  <span>
                    {selectedFamilyPannas.length} Pannas × ₹{points} each
                  </span>
                  <span className="font-bold text-foreground">
                    Family Total: <strong className="text-gold font-mono text-sm">₹{totalFamilyPoints}</strong>
                  </span>
                </div>
              </div>
            ) : (
              /* Helpful Guide Banner when no family chosen yet */
              <div className="rounded-xl border border-dashed border-border p-5 text-center space-y-2 bg-secondary/30">
                <div className="flex justify-center">
                  <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                    <Layers className="h-5 w-5" />
                  </div>
                </div>
                <h3 className="font-bold text-sm text-foreground">How Family Panna (सेट पाना) Works</h3>
                <p className="text-xs text-muted-foreground max-w-sm mx-auto leading-relaxed">
                  Enter any 3-digit panna (e.g. <strong>128</strong>) or pick a family above. The system automatically selects all cut-digit variations in that family (e.g. 123, 128, 137, 178, 236, 268, 367, 678) for Open or Close play!
                </p>
                <div className="pt-1">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => selectFamily(PANEL_FAMILIES_35[6]) /* 123 */}
                    className="text-xs font-semibold"
                  >
                    Try Example Family: 123 (8 Pannas)
                  </Button>
                </div>
              </div>
            )}
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

        {/* 7B. JODI FAMILY / FAMILY JODI (15 Families) */}
        {game === "family_jodi" && (
          <div className="space-y-4">
            {/* Search or Enter Jodi Card */}
            <div className="rounded-xl border border-primary/30 bg-primary/5 p-3.5 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs font-bold text-primary uppercase tracking-wide">
                  <Sparkles className="h-4 w-4 text-gold" />
                  <span>Enter Jodi or Pick Family</span>
                </div>
                <button
                  type="button"
                  onClick={() => setIsJodiFamilyChartOpen(true)}
                  className="flex items-center gap-1 text-xs font-bold text-gold hover:underline"
                >
                  <Table className="h-3.5 w-3.5" /> 15 Families Chart
                </button>
              </div>

              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Input
                    type="text"
                    inputMode="numeric"
                    maxLength={2}
                    placeholder="Enter 2-Digit Jodi (e.g. 12 or 76)"
                    value={jodiFamilyInput}
                    onChange={(e) => handleJodiFamilyInputChange(e.target.value)}
                    className="font-mono text-center text-lg font-bold tracking-widest h-11 bg-background"
                  />
                  {jodiFamilyInput && (
                    <button
                      type="button"
                      onClick={() => {
                        setJodiFamilyInput("");
                        setActiveJodiFamily(null);
                        setSelectedFamilyJodis([]);
                      }}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>
                {activeJodiFamily && (
                  <div className="rounded-xl border border-gold/40 bg-gold/15 px-3 py-2 text-center shrink-0">
                    <span className="block text-[10px] uppercase font-bold text-muted-foreground">Family</span>
                    <strong className="font-mono text-base font-black text-gold">{activeJodiFamily.family}</strong>
                  </div>
                )}
              </div>

              {/* Quick 15 Families Chips Scroll */}
              <div className="space-y-1.5 pt-1">
                <div className="flex items-center justify-between text-[11px] text-muted-foreground font-semibold px-0.5">
                  <span>Quick Pick from 15 Families:</span>
                  <span className="text-[10px] text-muted-foreground">Tap to select</span>
                </div>
                <div className="flex gap-1.5 overflow-x-auto no-scrollbar py-1">
                  {JODI_FAMILIES_15.map((fam) => {
                    const isFamActive = activeJodiFamily?.family === fam.family;
                    return (
                      <button
                        key={fam.family}
                        type="button"
                        onClick={() => selectJodiFamily(fam)}
                        className={`rounded-lg px-2.5 py-1.5 font-mono text-xs font-bold shrink-0 transition-all ${
                          isFamActive
                            ? "bg-primary text-primary-foreground ring-2 ring-primary shadow-md scale-105"
                            : "border bg-card text-foreground hover:border-primary hover:bg-secondary"
                        }`}
                      >
                        {fam.family}
                        <span className="ml-1 text-[10px] opacity-75">({fam.count})</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Active Jodi Family Members View */}
            {activeJodiFamily ? (
              <div className="rounded-xl border border-border/80 bg-background/50 p-3 space-y-3">
                <div className="flex items-center justify-between border-b pb-2">
                  <div className="flex items-center gap-2">
                    <span className="font-display text-lg font-bold text-foreground">
                      Family <strong className="font-mono text-gold">{activeJodiFamily.family}</strong>
                    </span>
                    <span className="rounded-md border bg-secondary px-2 py-0.5 text-xs font-bold text-gold">
                      {selectedFamilyJodis.length} / {activeJodiFamily.count} Selected
                    </span>
                  </div>

                  <div className="flex items-center gap-2 text-xs">
                    <button
                      type="button"
                      onClick={selectAllFamilyJodis}
                      className="font-semibold text-primary hover:underline"
                    >
                      Select All
                    </button>
                    <span className="text-muted-foreground">•</span>
                    <button
                      type="button"
                      onClick={deselectAllFamilyJodis}
                      className="font-semibold text-muted-foreground hover:text-foreground"
                    >
                      Clear
                    </button>
                  </div>
                </div>

                {/* Grid of Jodis in this Family */}
                <div className="grid grid-cols-4 gap-2 sm:grid-cols-4">
                  {activeJodiFamily.jodis.map((j) => {
                    const isSelected = selectedFamilyJodis.includes(j);
                    return (
                      <button
                        key={j}
                        type="button"
                        onClick={() => toggleFamilyJodi(j)}
                        className={`flex items-center justify-between rounded-xl p-2.5 transition-all text-left border ${
                          isSelected
                            ? "border-primary bg-primary/10 shadow-sm ring-1 ring-primary"
                            : "border-border/60 bg-card/60 opacity-60 hover:opacity-100"
                        }`}
                      >
                        <div>
                          <span className="font-mono text-base font-bold tracking-wider block text-foreground">
                            {j}
                          </span>
                          <span className="text-[10px] font-semibold text-muted-foreground">
                            Jodi · 90×
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-bold text-gold">₹{points}</span>
                          <div
                            className={`flex h-5 w-5 items-center justify-center rounded-md border text-[11px] font-bold ${
                              isSelected
                                ? "bg-primary border-primary text-primary-foreground"
                                : "border-muted-foreground/40 bg-secondary"
                            }`}
                          >
                            {isSelected ? <Check className="h-3 w-3 stroke-[3]" /> : null}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>

                {/* Summary calculation */}
                <div className="flex items-center justify-between text-xs pt-1 px-1 text-muted-foreground">
                  <span>
                    {selectedFamilyJodis.length} Jodis × ₹{points} each
                  </span>
                  <span className="font-bold text-foreground">
                    Family Total: <strong className="text-gold font-mono text-sm">₹{totalJodiFamilyPoints}</strong>
                  </span>
                </div>
              </div>
            ) : (
              /* Helpful Guide Banner when no family chosen yet */
              <div className="rounded-xl border border-dashed border-border p-5 text-center space-y-2 bg-secondary/30">
                <div className="flex justify-center">
                  <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                    <Layers className="h-5 w-5" />
                  </div>
                </div>
                <h3 className="font-bold text-sm text-foreground">How Jodi Family (जोड़ी फैमिली) Works</h3>
                <p className="text-xs text-muted-foreground max-w-sm mx-auto leading-relaxed">
                  Enter any 2-digit Jodi (e.g. <strong>12</strong> or <strong>76</strong>) or pick a family above. The system automatically loads all direct, reverse, and cut variations (e.g. 12, 17, 21, 26, 62, 67, 71, 76) for 1-click play!
                </p>
                <div className="pt-1">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => selectJodiFamily(JODI_FAMILIES_15[6]) /* 12 */}
                    className="text-xs font-semibold"
                  >
                    Try Example Family: 12 (8 Jodis)
                  </Button>
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
          {/* Floating Bucket Alert Banner (when bucket has queued plays) */}
          {bucket.length > 0 && (
            <button
              type="button"
              onClick={() => setIsBucketOpen(true)}
              className="w-full flex items-center justify-between rounded-xl bg-gold/15 border border-gold/40 px-3.5 py-2 text-xs font-semibold text-foreground hover:bg-gold/25 transition-all shadow-md backdrop-blur-sm"
            >
              <div className="flex items-center gap-2">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-gold text-slate-950 font-black text-[11px]">
                  {bucket.length}
                </span>
                <span>
                  Bucket: <strong>{bucket.length} Plays Queued</strong>
                </span>
              </div>
              <div className="flex items-center gap-1 text-gold font-bold">
                <span>Total ₹{totalBucketAmount}</span>
                <span className="text-[11px] underline ml-1">View & Confirm →</span>
              </div>
            </button>
          )}

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
                <div className="flex gap-2">
                  <Button disabled className="flex-1 h-11 text-xs font-semibold rounded-xl bg-muted text-muted-foreground">
                    Select jodis and enter amount (₹)
                  </Button>
                  {bucket.length > 0 && (
                    <Button
                      type="button"
                      onClick={() => setIsBucketOpen(true)}
                      className="h-11 px-4 text-xs font-bold rounded-xl bg-gold text-slate-950 hover:bg-gold/90 shadow-sm"
                    >
                      <ShoppingBag className="h-4 w-4 mr-1.5" /> Bucket ({bucket.length})
                    </Button>
                  )}
                </div>
              ) : (
                <div className="flex gap-2">
                  <Button
                    type="button"
                    onClick={handleAddJodiBulkToBucket}
                    className="flex-1 h-11 text-xs font-bold rounded-xl border border-gold/40 bg-gold/10 hover:bg-gold/20 text-gold"
                  >
                    <Plus className="h-4 w-4 mr-1" /> Add ({selectedJodis.length}) to Bucket
                  </Button>
                  <Button
                    type="button"
                    onClick={handlePlay}
                    className="flex-1 h-11 text-xs font-bold rounded-xl shadow-lg bg-primary hover:bg-primary/90 text-primary-foreground"
                  >
                    Confirm & Review ({selectedJodis.length} Jodis)
                  </Button>
                </div>
              )}
            </div>
          ) : game === "family_jodi" ? (
            /* B.1B JODI FAMILY BOTTOM BAR */
            <div className="space-y-2">
              {/* Points Input & Quick Presets */}
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-muted-foreground font-medium">Per Jodi:</span>
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

              {activeJodiFamily && selectedFamilyJodis.length > 0 && (
                <div className="flex items-center justify-between text-xs px-1">
                  <span className="text-muted-foreground">
                    Playing: <strong className="text-foreground">{selectedFamilyJodis.length} Jodis</strong> ({activeJodiFamily.family} Family)
                  </span>
                  <span className="font-semibold text-gold">
                    Total: <strong>₹{totalJodiFamilyPoints}</strong> (Win Pays 90×)
                  </span>
                </div>
              )}

              {marketClosed ? (
                <Button disabled className="w-full h-11 text-sm font-semibold rounded-xl bg-muted text-muted-foreground">
                  Market Closed for Today
                </Button>
              ) : openClosed ? (
                <Button disabled className="w-full h-11 text-sm font-semibold rounded-xl bg-muted text-muted-foreground">
                  Jodi Closed (Open Timing Passed)
                </Button>
              ) : !activeJodiFamily || selectedFamilyJodis.length === 0 ? (
                <div className="flex gap-2">
                  <Button disabled className="flex-1 h-11 text-xs font-semibold rounded-xl bg-muted text-muted-foreground">
                    Enter jodi or select a family
                  </Button>
                  {bucket.length > 0 && (
                    <Button
                      type="button"
                      onClick={() => setIsBucketOpen(true)}
                      className="h-11 px-4 text-xs font-bold rounded-xl bg-gold text-slate-950 hover:bg-gold/90 shadow-sm"
                    >
                      <ShoppingBag className="h-4 w-4 mr-1.5" /> Bucket ({bucket.length})
                    </Button>
                  )}
                </div>
              ) : (
                <div className="flex gap-2">
                  <Button
                    type="button"
                    onClick={handleAddJodiFamilyToBucket}
                    className="flex-1 h-11 text-xs font-bold rounded-xl border border-gold/40 bg-gold/10 hover:bg-gold/20 text-gold"
                  >
                    <Plus className="h-4 w-4 mr-1" /> Add Family ({selectedFamilyJodis.length}) to Bucket
                  </Button>
                  <Button
                    type="button"
                    onClick={handleDirectPlay}
                    className="flex-1 h-11 text-xs font-bold rounded-xl shadow-lg bg-primary hover:bg-primary/90 text-primary-foreground"
                  >
                    <Play className="h-4 w-4 mr-1 fill-current" /> Play Now (₹{totalJodiFamilyPoints})
                  </Button>
                </div>
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
                <div className="flex gap-2">
                  <Button disabled className="flex-1 h-11 text-xs font-semibold rounded-xl bg-muted text-muted-foreground">
                    Enter amount (₹) to place bets
                  </Button>
                  {bucket.length > 0 && (
                    <Button
                      type="button"
                      onClick={() => setIsBucketOpen(true)}
                      className="h-11 px-4 text-xs font-bold rounded-xl bg-gold text-slate-950 hover:bg-gold/90 shadow-sm"
                    >
                      <ShoppingBag className="h-4 w-4 mr-1.5" /> Bucket ({bucket.length})
                    </Button>
                  )}
                </div>
              ) : (
                <div className="flex gap-2">
                  <Button
                    type="button"
                    onClick={handleAddAnkBulkToBucket}
                    className="flex-1 h-11 text-xs font-bold rounded-xl border border-gold/40 bg-gold/10 hover:bg-gold/20 text-gold"
                  >
                    <Plus className="h-4 w-4 mr-1" /> Add ({activeAnkEntries.length}) to Bucket
                  </Button>
                  <Button
                    type="button"
                    onClick={handlePlay}
                    className="flex-1 h-11 text-xs font-bold rounded-xl shadow-lg bg-primary hover:bg-primary/90 text-primary-foreground"
                  >
                    Confirm & Review ({activeAnkEntries.length} Digits)
                  </Button>
                </div>
              )}
            </div>
          ) : game === "family_panna" ? (
            /* B.2 FAMILY PANNA BOTTOM BAR */
            <div className="space-y-2">
              {/* Points Input & Quick Presets */}
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-muted-foreground font-medium">Per Panna:</span>
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

              {activeFamily && selectedFamilyPannas.length > 0 && (
                <div className="flex items-center justify-between text-xs px-1">
                  <span className="text-muted-foreground">
                    Playing: <strong className="text-foreground">{selectedFamilyPannas.length} Pannas</strong> ({effSession.toUpperCase()})
                  </span>
                  <span className="font-semibold text-gold">
                    Total: <strong>₹{totalFamilyPoints}</strong> ({selectedFamilyPannas.length} × ₹{points})
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
              ) : !activeFamily || selectedFamilyPannas.length === 0 ? (
                <div className="flex gap-2">
                  <Button disabled className="flex-1 h-11 text-xs font-semibold rounded-xl bg-muted text-muted-foreground">
                    Enter panna or select a family
                  </Button>
                  {bucket.length > 0 && (
                    <Button
                      type="button"
                      onClick={() => setIsBucketOpen(true)}
                      className="h-11 px-4 text-xs font-bold rounded-xl bg-gold text-slate-950 hover:bg-gold/90 shadow-sm"
                    >
                      <ShoppingBag className="h-4 w-4 mr-1.5" /> Bucket ({bucket.length})
                    </Button>
                  )}
                </div>
              ) : (
                <div className="flex gap-2">
                  <Button
                    type="button"
                    onClick={handleAddFamilyToBucket}
                    className="flex-1 h-11 text-xs font-bold rounded-xl border border-gold/40 bg-gold/10 hover:bg-gold/20 text-gold"
                  >
                    <Plus className="h-4 w-4 mr-1" /> Add Family ({selectedFamilyPannas.length}) to Bucket
                  </Button>
                  <Button
                    type="button"
                    onClick={handlePlay}
                    className="flex-1 h-11 text-xs font-bold rounded-xl shadow-lg bg-primary hover:bg-primary/90 text-primary-foreground"
                  >
                    Confirm & Review (₹{totalFamilyPoints})
                  </Button>
                </div>
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

              {/* Action Buttons */}
              {marketClosed ? (
                <Button disabled className="w-full h-11 text-sm font-semibold rounded-xl bg-muted text-muted-foreground">
                  Market Closed for Today
                </Button>
              ) : openClosed && g.closeOnly ? (
                <Button disabled className="w-full h-11 text-sm font-semibold rounded-xl bg-muted text-muted-foreground">
                  {g.label} Closed (Open Timing Passed)
                </Button>
              ) : !selectedNumber && game !== "half_sangam" && game !== "full_sangam" ? (
                <div className="flex gap-2">
                  <Button disabled className="flex-1 h-11 text-xs font-semibold rounded-xl bg-muted text-muted-foreground">
                    Select number & enter amount (₹)
                  </Button>
                  {bucket.length > 0 && (
                    <Button
                      type="button"
                      onClick={() => setIsBucketOpen(true)}
                      className="h-11 px-4 text-xs font-bold rounded-xl bg-gold text-slate-950 hover:bg-gold/90 shadow-sm"
                    >
                      <ShoppingBag className="h-4 w-4 mr-1.5" /> Bucket ({bucket.length})
                    </Button>
                  )}
                </div>
              ) : (
                <div className="flex gap-2">
                  <Button
                    type="button"
                    onClick={handleSingleAddToBucket}
                    className="flex-1 h-11 text-xs font-bold rounded-xl border border-gold/40 bg-gold/10 hover:bg-gold/20 text-gold"
                  >
                    <Plus className="h-4 w-4 mr-1" /> Add to Bucket
                  </Button>
                  <Button
                    type="button"
                    onClick={handlePlay}
                    className="flex-1 h-11 text-xs font-bold rounded-xl shadow-lg bg-primary hover:bg-primary/90 text-primary-foreground"
                  >
                    {bucket.length > 0 ? (
                      `Confirm Bucket (${bucket.length + 1} Plays)`
                    ) : (
                      `Confirm & Review (₹${points})`
                    )}
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* BUCKET ORDER CONFIRMATION SHEET / DRAWER */}
      <Sheet open={isBucketOpen} onOpenChange={setIsBucketOpen}>
        <SheetContent
          side="bottom"
          className="max-h-[85vh] rounded-t-3xl border-t border-border/80 bg-card p-0 shadow-2xl sm:max-w-xl sm:mx-auto overflow-hidden flex flex-col"
        >
          {/* Top handle bar */}
          <div className="w-12 h-1.5 rounded-full bg-muted-foreground/30 mx-auto mt-2.5 mb-1" />

          {/* Sheet Header */}
          <div className="px-5 py-3 border-b flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gold/20 text-gold border border-gold/40">
                <ShoppingBag className="h-5 w-5" />
              </div>
              <div>
                <SheetTitle className="text-base font-bold text-foreground">
                  Order Bucket (Bet Slip)
                </SheetTitle>
                <p className="text-xs text-muted-foreground">
                  {m.name} · {bucket.length} Plays queued
                </p>
              </div>
            </div>

            {bucket.length > 0 && (
              <button
                type="button"
                onClick={clearBucket}
                className="text-xs font-semibold text-destructive hover:underline flex items-center gap-1 px-2 py-1 rounded-md hover:bg-destructive/10 transition-colors"
              >
                <Trash2 className="h-3.5 w-3.5" /> Clear All
              </button>
            )}
          </div>

          {/* Scrollable Items List */}
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2 max-h-[50vh]">
            {bucket.length === 0 ? (
              <div className="py-12 text-center text-muted-foreground space-y-2">
                <ShoppingBag className="mx-auto h-12 w-12 opacity-30 text-gold" />
                <p className="text-sm font-semibold text-foreground">Your bucket is empty</p>
                <p className="text-xs text-muted-foreground max-w-xs mx-auto">
                  Select your numbers and tap <strong>"+ Add to Bucket"</strong> to queue plays here before confirming.
                </p>
              </div>
            ) : (
              bucket.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between rounded-xl border bg-background/50 p-3 shadow-xs hover:border-gold/30 transition-all"
                >
                  <div className="flex items-center gap-3">
                    <span
                      className={`rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                        item.session === "open"
                          ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30"
                          : "bg-blue-500/15 text-blue-600 dark:text-blue-400 border border-blue-500/30"
                      }`}
                    >
                      {item.session}
                    </span>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium text-muted-foreground">
                          {item.gameLabel}
                        </span>
                        <span className="text-base font-black tracking-wide text-foreground">
                          #{item.number}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1 bg-card rounded-lg px-2 py-1 border border-border">
                      <span className="text-xs font-bold text-gold">₹</span>
                      <Input
                        type="number"
                        min={5}
                        step={5}
                        value={item.points}
                        onChange={(e) => updateBucketItemPoints(item.id, Number(e.target.value))}
                        className="w-16 h-7 text-xs font-bold text-center border-0 p-0 focus-visible:ring-0 bg-transparent"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => removeFromBucket(item.id)}
                      className="rounded-lg p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                      title="Remove from bucket"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Footer with Summary and Confirm Button */}
          <div className="border-t bg-card p-4 space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground font-medium">
                Total Plays: <strong className="text-foreground">{bucket.length}</strong>
              </span>
              <span className="font-bold text-base text-foreground">
                Total Amount: <strong className="text-gold text-lg">₹{totalBucketAmount}</strong>
              </span>
            </div>

            <div className="flex items-center justify-between text-xs px-1 pt-1 border-t border-dashed border-border/80">
              <span className="text-muted-foreground flex items-center gap-1.5 font-medium">
                <Printer className="h-3.5 w-3.5 text-gold" /> Auto-print slip on confirm
              </span>
              <PrinterStatusBadge showTextOnMobile={true} />
            </div>

            <Button
              onClick={handleConfirmBucket}
              disabled={busy || bucket.length === 0}
              className="w-full h-12 text-sm font-bold rounded-xl shadow-lg bg-primary hover:bg-primary/90 text-primary-foreground flex items-center justify-center gap-2"
            >
              {busy ? (
                "Placing Orders…"
              ) : (
                <>
                  <CheckCircle2 className="h-5 w-5" />
                  Confirm & Place All Bets (₹{totalBucketAmount})
                </>
              )}
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      {/* 58mm Bluetooth & System Thermal Receipt Modal */}
      <ThermalReceiptModal
        open={isReceiptOpen}
        onOpenChange={setIsReceiptOpen}
        receiptData={receiptData}
      />

      {/* 15 JODI FAMILIES BROWSER MODAL */}
      <Dialog open={isJodiFamilyChartOpen} onOpenChange={setIsJodiFamilyChartOpen}>
        <DialogContent className="max-w-md max-h-[85vh] flex flex-col p-4 bg-card">
          <DialogHeader className="pb-2 border-b">
            <DialogTitle className="flex items-center gap-2 text-base font-bold text-foreground">
              <Table className="h-5 w-5 text-gold" />
              <span>15 Jodi Families Chart (जोड़ी फैमिली)</span>
            </DialogTitle>
            <p className="text-xs text-muted-foreground">
              All 100 jodis grouped into 15 families. Tap any family to load all its jodis instantly.
            </p>
          </DialogHeader>

          <div className="py-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                type="text"
                placeholder="Search any Jodi or Family (e.g. 12, 76, 05)..."
                value={jodiFamilyChartSearch}
                onChange={(e) => setJodiFamilyChartSearch(e.target.value)}
                className="pl-9 text-xs h-9"
              />
              {jodiFamilyChartSearch && (
                <button
                  type="button"
                  onClick={() => setJodiFamilyChartSearch("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto space-y-2 pr-1 divide-y divide-border/60">
            {JODI_FAMILIES_15.filter((fam) => {
              if (!jodiFamilyChartSearch) return true;
              const q = jodiFamilyChartSearch.trim();
              return (
                fam.family.includes(q) ||
                fam.jodis.some((j) => j.includes(q))
              );
            }).map((fam) => (
              <div
                key={fam.family}
                className="pt-2 first:pt-0 flex items-center justify-between gap-3 hover:bg-secondary/60 p-2 rounded-lg transition-colors cursor-pointer"
                onClick={() => {
                  selectJodiFamily(fam);
                  setIsJodiFamilyChartOpen(false);
                }}
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm font-black text-gold">Family {fam.family}</span>
                    <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-bold text-muted-foreground">
                      {fam.count} Jodis
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {fam.jodis.map((j) => (
                      <span
                        key={j}
                        className={`font-mono text-xs px-2 py-0.5 rounded border ${
                          jodiFamilyChartSearch && j.includes(jodiFamilyChartSearch)
                            ? "bg-gold text-slate-950 font-bold border-gold"
                            : "bg-background border-border/70 text-foreground"
                        }`}
                      >
                        {j}
                      </span>
                    ))}
                  </div>
                </div>

                <Button
                  type="button"
                  size="sm"
                  className="shrink-0 h-8 text-xs font-bold bg-primary text-primary-foreground"
                >
                  Select
                </Button>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* 35 PANEL FAMILIES BROWSER MODAL (Reference: matkaguessing.in/panel-family-chart) */}
      <Dialog open={isFamilyChartOpen} onOpenChange={setIsFamilyChartOpen}>
        <DialogContent className="max-w-md max-h-[85vh] flex flex-col p-4 bg-card">
          <DialogHeader className="pb-2 border-b">
            <DialogTitle className="flex items-center gap-2 text-base font-bold text-foreground">
              <Table className="h-5 w-5 text-gold" />
              <span>35 Panel Families Chart (फैमिली पाना)</span>
            </DialogTitle>
            <p className="text-xs text-muted-foreground">
              All 220 pannas grouped into 35 families. Tap any family to load all its pannas instantly.
            </p>
          </DialogHeader>

          <div className="py-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                type="text"
                placeholder="Search any Panna or Family (e.g. 128, 123)..."
                value={familyChartSearch}
                onChange={(e) => setFamilyChartSearch(e.target.value)}
                className="pl-9 text-xs h-9"
              />
              {familyChartSearch && (
                <button
                  type="button"
                  onClick={() => setFamilyChartSearch("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto space-y-2 pr-1 divide-y divide-border/60">
            {PANEL_FAMILIES_35.filter((fam) => {
              if (!familyChartSearch) return true;
              const q = familyChartSearch.trim();
              return (
                fam.family.includes(q) ||
                fam.pannas.some((p) => p.includes(q))
              );
            }).map((fam) => (
              <div
                key={fam.family}
                className="pt-2 first:pt-0 flex items-center justify-between gap-3 hover:bg-secondary/60 p-2 rounded-lg transition-colors cursor-pointer"
                onClick={() => {
                  selectFamily(fam);
                  setIsFamilyChartOpen(false);
                }}
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm font-black text-gold">Family {fam.family}</span>
                    <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-bold text-muted-foreground">
                      {fam.count} Pannas
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {fam.pannas.map((p) => (
                      <span
                        key={p}
                        className={`font-mono text-xs px-1.5 py-0.5 rounded border ${
                          familyChartSearch && p.includes(familyChartSearch)
                            ? "bg-gold text-slate-950 font-bold border-gold"
                            : "bg-background border-border/70 text-foreground"
                        }`}
                      >
                        {p}
                      </span>
                    ))}
                  </div>
                </div>

                <Button
                  type="button"
                  size="sm"
                  className="shrink-0 h-8 text-xs font-bold bg-primary text-primary-foreground"
                >
                  Select
                </Button>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </main>
  );
}
