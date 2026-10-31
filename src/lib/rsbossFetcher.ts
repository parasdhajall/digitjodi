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
  "SRIDEVI DAY": "SRIDEVI",
  "PADMAVATHI": "PADMAVATI",
  "PADMAVATI": "PADMAVATI",
  "PADMAVATHI NIGHT": "PADMAVATI NIGHT",
  "PADMAVATI NIGHT": "PADMAVATI NIGHT",
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

function parseResultEntry(rawName: string, rawVal: string, nowIso: string): MarketLiveResult | null {
  const cleanName = rawName
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();

  const cleanVal = rawVal
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, "")
    .trim();

  if (!cleanVal || cleanVal.includes("Loading") || cleanVal.includes("***")) {
    return null;
  }

  const matchedKey = MARKET_ALIASES[cleanName] || cleanName;

  // Format 1: Full result "123-45-678"
  const fullMatch = cleanVal.match(/^(\d{3})-(\d{2})-(\d{3})$/);
  // Format 2: Half result (open declared, close pending) "123-4" or "123-45"
  const halfMatch = cleanVal.match(/^(\d{3})-(\d{1,2})$/);

  if (fullMatch) {
    return {
      marketName: matchedKey,
      rawResult: cleanVal,
      openPanna: fullMatch[1],
      openDigit: fullMatch[2][0] || null,
      closeDigit: fullMatch[2][1] || null,
      closePanna: fullMatch[3],
      isOpenDeclared: true,
      isCloseDeclared: true,
      updatedAt: nowIso,
    };
  } else if (halfMatch) {
    return {
      marketName: matchedKey,
      rawResult: cleanVal,
      openPanna: halfMatch[1],
      openDigit: halfMatch[2][0] || null,
      closeDigit: null,
      closePanna: null,
      isOpenDeclared: true,
      isCloseDeclared: false,
      updatedAt: nowIso,
    };
  }

  return null;
}

export const fetchRsbossLiveResults = createServerFn({ method: "GET" }).handler(
  async (): Promise<{
    success: boolean;
    source: "dpboss" | "rsboss" | "matkaguessing" | "none";
    results: Record<string, MarketLiveResult>;
    error?: string;
  }> => {
    const results: Record<string, MarketLiveResult> = {};
    const nowIso = new Date().toISOString();

    // 1. PRIMARY SOURCE: https://dpbossnet.me/ (Official & Standard for Indian retail players)
    try {
      const dpbossRes = await fetch("https://dpbossnet.me/", {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        },
        signal: AbortSignal.timeout(8000),
      });

      if (dpbossRes.ok) {
        const html = await dpbossRes.text();

        // Pattern 1: <h4>MARKET</h4> ... <span>RESULT</span>
        const reH4 = /<h4>\s*([^<]+?)\s*<\/h4>\s*<span>\s*([^<]+?)\s*<\/span>/gi;
        let m;
        while ((m = reH4.exec(html)) !== null) {
          const entry = parseResultEntry(m[1], m[2], nowIso);
          if (entry && !results[entry.marketName]) {
            results[entry.marketName] = entry;
          }
        }

        // Pattern 2: <span class="h8">MARKET</span> ... <span class="h9">RESULT</span>
        const reH8 =
          /<span[^>]*class=['"]h8['"][^>]*>\s*([^<]+?)\s*<\/span>\s*<span[^>]*class=['"]h9['"][^>]*>\s*([^<]+?)\s*<\/span>/gi;
        while ((m = reH8.exec(html)) !== null) {
          const entry = parseResultEntry(m[1], m[2], nowIso);
          if (entry && !results[entry.marketName]) {
            results[entry.marketName] = entry;
          }
        }

        if (Object.keys(results).length > 0) {
          return { success: true, source: "dpboss", results };
        }
      }
    } catch (dpErr: any) {
      console.warn("DPBoss.me primary fetch failed, falling back to RSBoss:", dpErr?.message);
    }

    // 2. BACKUP SOURCE 1: https://rsboss.net
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
          const entry = parseResultEntry(m[1], m[2], nowIso);
          if (entry && !results[entry.marketName]) {
            results[entry.marketName] = entry;
          }
        }

        if (Object.keys(results).length > 0) {
          return { success: true, source: "rsboss", results };
        }
      }
    } catch (e: any) {
      console.warn("RSBoss.net fallback failed, trying MatkaGuessing:", e?.message);
    }

    // 3. BACKUP SOURCE 2: https://matkaguessing.in/live.json
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
          const normName = slug.replace(/-/g, " ").toUpperCase();
          const entry = parseResultEntry(normName, rawVal, nowIso);
          if (entry && !results[entry.marketName]) {
            results[entry.marketName] = entry;
          }
        }

        if (Object.keys(results).length > 0) {
          return { success: true, source: "matkaguessing", results };
        }
      }
    } catch (fbErr: any) {
      console.error("MatkaGuessing live fetch also failed:", fbErr?.message);
    }

    return {
      success: Object.keys(results).length > 0,
      source: "none",
      results,
      error: "Could not reach live result providers.",
    };
  }
);
