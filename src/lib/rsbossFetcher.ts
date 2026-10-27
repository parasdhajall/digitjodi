import { createServerFn } from "@tanstack/react-start";

export interface MarketLiveResult {
  marketName: string;
  rawResult: string;
  openPanna: string | null;
  openDigit: string | null;
  closeDigit: string | null;
  closePanna: string | null;
  isOpenDeclared: boolean;
  isCloseDeclared: boolean;
  updatedAt: string;
}

// Normalized market name alias map to match user's database market names
const MARKET_ALIASES: Record<string, string> = {
  "MILAN MORNING": "MILAN MORNING",
  "KALYAN MORNING": "KALYAN MORNING",
  "SRIDEVI": "SRIDEVI",
  "TIME BAZAR": "TIME BAZAR",
  "MADHUR DAY": "MADHUR DAY",
  "MILAN DAY": "MILAN DAY",
  "RAJDHANI DAY": "RAJDHANI DAY",
  "KALYAN": "KALYAN",
  "SRIDEVI NIGHT": "SRIDEVI NIGHT",
  "MADHUR NIGHT": "MADHUR NIGHT",
  "MILAN NIGHT": "MILAN NIGHT",
  "KALYAN NIGHT": "KALYAN NIGHT",
  "RAJDHANI NIGHT": "RAJDHANI NIGHT",
  "MAIN BAZAR": "MAIN BAZAR",
};

export const fetchRsbossLiveResults = createServerFn({ method: "GET" }).handler(
  async (): Promise<{
    success: boolean;
    source: "rsboss" | "matkaguessing" | "none";
    results: Record<string, MarketLiveResult>;
    error?: string;
  }> => {
    const results: Record<string, MarketLiveResult> = {};
    const nowIso = new Date().toISOString();

    // 1. Try Primary Source: https://rsboss.net
    try {
      const res = await fetch("https://rsboss.net", {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        },
        signal: AbortSignal.timeout(8000),
      });

      if (res.ok) {
        const html = await res.text();
        const re =
          /class=['"]market_name['"][^>]*>([\s\S]*?)<\/span>[\s\S]*?class=['"]market_result['"][^>]*>([\s\S]*?)<\/span>/gi;
        let m;

        while ((m = re.exec(html)) !== null) {
          const rawName = m[1]
            .replace(/<[^>]+>/g, "")
            .replace(/&amp;/g, "&")
            .replace(/\s+/g, " ")
            .trim()
            .toUpperCase();
          const rawVal = m[2]
            .replace(/<!--[\s\S]*?-->/g, "")
            .replace(/<[^>]+>/g, "")
            .replace(/\s+/g, "")
            .trim();

          if (!rawVal || rawVal.includes("Loading") || rawVal.includes("***")) {
            continue;
          }

          const matchedKey = MARKET_ALIASES[rawName] || rawName;

          // Check format: either "123-45-678" or "123-4"
          const fullMatch = rawVal.match(/^(\d{3})-(\d{2})-(\d{3})$/);
          const halfMatch = rawVal.match(/^(\d{3})-(\d{1,2})$/);

          if (fullMatch) {
            results[matchedKey] = {
              marketName: matchedKey,
              rawResult: rawVal,
              openPanna: fullMatch[1],
              openDigit: fullMatch[2][0] || null,
              closeDigit: fullMatch[2][1] || null,
              closePanna: fullMatch[3],
              isOpenDeclared: true,
              isCloseDeclared: true,
              updatedAt: nowIso,
            };
          } else if (halfMatch) {
            results[matchedKey] = {
              marketName: matchedKey,
              rawResult: rawVal,
              openPanna: halfMatch[1],
              openDigit: halfMatch[2][0] || null,
              closeDigit: null,
              closePanna: null,
              isOpenDeclared: true,
              isCloseDeclared: false,
              updatedAt: nowIso,
            };
          }
        }

        if (Object.keys(results).length > 0) {
          return { success: true, source: "rsboss", results };
        }
      }
    } catch (e: any) {
      console.warn("RSBoss.net fetch failed, trying fallback:", e?.message);
    }

    // 2. Fallback Source: https://matkaguessing.in/live.json
    try {
      const fbRes = await fetch("https://matkaguessing.in/live.json", {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(5000),
      });

      if (fbRes.ok) {
        const json = await fbRes.json();
        const marketsObj = json.markets || {};

        for (const [slug, rawVal] of Object.entries(marketsObj) as [string, string][]) {
          if (!rawVal || typeof rawVal !== "string" || rawVal.includes("***")) continue;

          // Normalize slug to upper name e.g. "kalyan" -> "KALYAN"
          const normName = slug.replace(/-/g, " ").toUpperCase();
          const matchedKey = MARKET_ALIASES[normName] || normName;

          const fullMatch = rawVal.match(/^(\d{3})-(\d{2})-(\d{3})$/);
          const halfMatch = rawVal.match(/^(\d{3})-(\d{1,2})$/);

          if (fullMatch && !results[matchedKey]) {
            results[matchedKey] = {
              marketName: matchedKey,
              rawResult: rawVal,
              openPanna: fullMatch[1],
              openDigit: fullMatch[2][0] || null,
              closeDigit: fullMatch[2][1] || null,
              closePanna: fullMatch[3],
              isOpenDeclared: true,
              isCloseDeclared: true,
              updatedAt: nowIso,
            };
          } else if (halfMatch && !results[matchedKey]) {
            results[matchedKey] = {
              marketName: matchedKey,
              rawResult: rawVal,
              openPanna: halfMatch[1],
              openDigit: halfMatch[2][0] || null,
              closeDigit: null,
              closePanna: null,
              isOpenDeclared: true,
              isCloseDeclared: false,
              updatedAt: nowIso,
            };
          }
        }

        return { success: true, source: "matkaguessing", results };
      }
    } catch (fbErr: any) {
      console.error("Fallback live fetch also failed:", fbErr?.message);
    }

    return {
      success: Object.keys(results).length > 0,
      source: "none",
      results,
      error: "Could not reach live result providers.",
    };
  }
);
