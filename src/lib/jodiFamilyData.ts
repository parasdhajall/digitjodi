export interface JodiFamily {
  family: string;
  jodis: string[];
  count: number;
}

// 15 Canonical Jodi Families covering all 100 Jodis (00-99)
// 5 Red/Half-Red Families (4 Jodis each) + 10 Standard Families (8 Jodis each) = 100 Jodis
export const JODI_FAMILIES_15: JodiFamily[] = [
  { family: "00", jodis: ["00", "05", "50", "55"], count: 4 },
  { family: "01", jodis: ["01", "06", "10", "15", "51", "56", "60", "65"], count: 8 },
  { family: "02", jodis: ["02", "07", "20", "25", "52", "57", "70", "75"], count: 8 },
  { family: "03", jodis: ["03", "08", "30", "35", "53", "58", "80", "85"], count: 8 },
  { family: "04", jodis: ["04", "09", "40", "45", "54", "59", "90", "95"], count: 8 },
  { family: "11", jodis: ["11", "16", "61", "66"], count: 4 },
  { family: "12", jodis: ["12", "17", "21", "26", "62", "67", "71", "76"], count: 8 },
  { family: "13", jodis: ["13", "18", "31", "36", "63", "68", "81", "86"], count: 8 },
  { family: "14", jodis: ["14", "19", "41", "46", "64", "69", "91", "96"], count: 8 },
  { family: "22", jodis: ["22", "27", "72", "77"], count: 4 },
  { family: "23", jodis: ["23", "28", "32", "37", "73", "78", "82", "87"], count: 8 },
  { family: "24", jodis: ["24", "29", "42", "47", "74", "79", "92", "97"], count: 8 },
  { family: "33", jodis: ["33", "38", "83", "88"], count: 4 },
  { family: "34", jodis: ["34", "39", "43", "48", "84", "89", "93", "98"], count: 8 },
  { family: "44", jodis: ["44", "49", "94", "99"], count: 4 },
];

export const JODI_TO_FAMILY_MAP = new Map<string, JodiFamily>();
for (const fam of JODI_FAMILIES_15) {
  for (const j of fam.jodis) {
    JODI_TO_FAMILY_MAP.set(j, fam);
  }
}

/**
 * Returns the JodiFamily for any 2-digit number (e.g. "76" -> Family "12").
 */
export function findFamilyByJodi(input: string): JodiFamily | null {
  if (!input) return null;
  const clean = input.replace(/\D/g, "").slice(0, 2);
  if (clean.length < 2) return null;
  return JODI_TO_FAMILY_MAP.get(clean) ?? null;
}

