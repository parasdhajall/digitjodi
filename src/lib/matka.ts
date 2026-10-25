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
  jodi: { label: "Jodi", parts: [2], partLabels: ["Jodi"], rate: 90, closeOnly: true },
  single_panna: { label: "Single Panna", parts: [3], partLabels: ["Panna (3 different digits)"], rate: 140, closeOnly: false },
  double_panna: { label: "Double Panna", parts: [3], partLabels: ["Panna (two same digits)"], rate: 280, closeOnly: false },
  triple_panna: { label: "Triple Panna", parts: [3], partLabels: ["Panna (all same digits)"], rate: 600, closeOnly: false },
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
const toMin = (t: string) => { const [h = 0, m = 0] = t.split(":").map(Number); return h * 60 + m; };
export const istHHMM = () => {
  const d = new Date(Date.now() + (new Date().getTimezoneOffset() + 330) * 60000);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};
export type MarketState = "open" | "upcoming" | "closed";
export function marketStatus(m: { active: boolean; open_time: string; close_time: string }) {
  if (!m.active) return { state: "closed" as MarketState, note: "Off" };
  const nowM = toMin(istHHMM());
  const openM = toMin(m.open_time);
  const closeM = toMin(m.close_time);
  const inWindow = closeM <= openM ? !(nowM > closeM && nowM < openM) : nowM >= openM && nowM < closeM;
  if (inWindow) return { state: "open" as MarketState, note: "Open for play" };
  if (closeM > openM && nowM < openM) return { state: "upcoming" as MarketState, note: `Opens ${fmtTime(m.open_time)}` };
  return { state: "closed" as MarketState, note: "Closed for today" };
}
