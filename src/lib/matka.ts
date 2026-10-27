export const pannaDigit = (p?: string | null) =>
  p && /^\d{3}$/.test(p) ? String(p.split("").reduce((a, c) => a + +c, 0) % 10) : null;

export function resultLabel(open?: string | null, close?: string | null) {
  const od = pannaDigit(open);
  const cd = pannaDigit(close);
  return `${open ?? "***"}-${od ?? "*"}${cd ?? "*"}-${close ?? "***"}`;
}

// parts: digit-length of each piece; pieces are joined with "-".
// closeOnly: game is decided at close and must be played before the open result.
export const GAMES = {
  single: { label: "Single Digit", parts: [1], partLabels: ["Digit"], rate: 9, closeOnly: false },
  ank_bulk: { label: "Ank Bulk", parts: [1], partLabels: ["Digit"], rate: 9, closeOnly: false, isBulk: true },
  jodi: { label: "Jodi", parts: [2], partLabels: ["Jodi"], rate: 90, closeOnly: true },
  jodi_bulk: { label: "Jodi Bulk", parts: [2], partLabels: ["Jodi"], rate: 90, closeOnly: true, isBulk: true },
  single_panna: { label: "Single Panna", parts: [3], partLabels: ["Panna (3 different digits)"], rate: 140, closeOnly: false },
  double_panna: { label: "Double Panna", parts: [3], partLabels: ["Panna (two same digits)"], rate: 280, closeOnly: false },
  triple_panna: { label: "Triple Panna", parts: [3], partLabels: ["Panna (all same digits)"], rate: 600, closeOnly: false },
  family_panna: { label: "Family Panna", parts: [3], partLabels: ["Panna"], rate: 140, closeOnly: false, isBulk: true },
  half_sangam: { label: "Half Sangam", parts: [1, 3], partLabels: ["Open digit", "Close panna"], rate: 1000, closeOnly: true },
  full_sangam: { label: "Full Sangam", parts: [3, 3], partLabels: ["Open panna", "Close panna"], rate: 10000, closeOnly: true },
  panna: { label: "Panna", parts: [3], partLabels: ["Panna"], rate: 140, closeOnly: false, legacy: true },
} as const;
export type GameType = keyof typeof GAMES;
export const PLAYABLE = (Object.keys(GAMES) as GameType[]).filter((k) => !("legacy" in GAMES[k]));

export const gameLabel = (g: string) => GAMES[g as GameType]?.label ?? g;

export const fmtTime = (t: string) => {
  const [h = 0, m = 0] = t.split(":").map(Number);
  const ap = h >= 12 ? "PM" : "AM";
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${ap}`;
};

// All play times are shown in Indian time (IST), no matter the device's timezone.
const istDateTime = new Intl.DateTimeFormat("en-IN", {
  timeZone: "Asia/Kolkata", day: "2-digit", month: "short", hour: "numeric", minute: "2-digit", hour12: true,
});
export const fmtIST = (iso: string) => istDateTime.format(new Date(iso));

// Markets auto open and close on their own times, in IST (India time).
export const istHHMM = () => {
  const d = new Date(Date.now() + (new Date().getTimezoneOffset() + 330) * 60000);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};
export const toMin = (t: string) => { const [h = 0, m = 0] = t.split(":").map(Number); return h * 60 + m; };

export function isOpenPast(m: { open_time: string; close_time: string; open_panna?: string | null }) {
  if (m.open_panna) return true;
  const nowM = toMin(istHHMM());
  const openM = toMin(m.open_time);
  const closeM = toMin(m.close_time);
  return closeM > openM ? nowM >= openM : (nowM >= openM || nowM < closeM);
}

export function isClosePast(m: { open_time: string; close_time: string; close_panna?: string | null }) {
  if (m.close_panna) return true;
  const nowM = toMin(istHHMM());
  const openM = toMin(m.open_time);
  const closeM = toMin(m.close_time);
  return closeM > openM ? nowM >= closeM : (nowM >= closeM && nowM < openM);
}

export type MarketState = "open" | "closed";
export function marketStatus(m: { active: boolean; open_time: string; close_time: string; open_panna?: string | null; close_panna?: string | null }) {
  if (!m.active) return { state: "closed" as MarketState, note: "Closed (Off)" };
  if (isClosePast(m)) {
    return { state: "closed" as MarketState, note: "Closed for today" };
  }

  // If open time has passed or open result declared -> Close session is running
  if (isOpenPast(m)) {
    return { state: "open" as MarketState, note: "Open (Close Session)" };
  }

  // Before open time -> Market is running live for Open & Jodi/Sangam
  return { state: "open" as MarketState, note: "Open for Play" };
}

// Check whether market's open session time has actually arrived today in IST
export function canMarketDeclareOpen(m: { open_time: string; close_time: string }) {
  const nowM = toMin(istHHMM());
  const oM = toMin(m.open_time);
  const cM = toMin(m.close_time);
  if (cM > oM) {
    return nowM >= oM;
  } else {
    // Overnight market (e.g. 21:40 to 00:05)
    return nowM >= oM || nowM < cM;
  }
}

// Check whether market's close session time has actually arrived today in IST
export function canMarketDeclareClose(m: { open_time: string; close_time: string; open_panna?: string | null }) {
  if (!m.open_panna) return false; // Open result must be declared before close
  const nowM = toMin(istHHMM());
  const oM = toMin(m.open_time);
  const cM = toMin(m.close_time);
  if (cM > oM) {
    return nowM >= cM;
  } else {
    // Overnight market: close is after midnight (e.g. 00:05)
    return nowM >= cM && nowM < oM;
  }
}


