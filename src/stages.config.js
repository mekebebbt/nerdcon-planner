/**
 * Single source of truth for stages and locations.
 * Add, remove, or edit stages here — no app logic changes required.
 */

export const HALLS = [
  { id: "hall-1", name: "Hall 1" },
  { id: "hall-2", name: "Hall 2" },
];

export const STAGES = [
  // Hall 1
  { id: "main-stage", name: "Main Stage", hall: "hall-1", openFrom: "08:45", openUntil: "12:30", color: "#0CEBF1", maxColumns: 1 },
  { id: "roundtables", name: "Roundtables", hall: "hall-1", openFrom: "14:00", openUntil: "16:40", color: "#0CEBF1", colorOpacity: 0.75, maxColumns: 5 },
  // Hall 2
  { id: "podcast", name: "Podcast Stage", hall: "hall-2", openFrom: "08:45", openUntil: "17:00", color: "#0CEBF1", maxColumns: 1 },
  { id: "side-quest", name: "Side Quest Stage", hall: "hall-2", openFrom: "13:00", openUntil: "17:00", color: "#00B97A", maxColumns: 1 },
  { id: "startup", name: "Startup Stage", hall: "hall-2", openFrom: "13:00", openUntil: "17:00", color: "#FFFBC9", maxColumns: 1 },
  { id: "bootcamp", name: "Bootcamp", hall: "hall-2", openFrom: "13:00", openUntil: "17:00", color: "#5EEAD4", maxColumns: 1 },
  { id: "vc-hours", name: "VC Office Hours", hall: "hall-2", openFrom: "13:00", openUntil: "17:00", color: "#99F6E4", maxColumns: 1 },
  { id: "meetups", name: "Meetups", hall: "hall-2", openFrom: "13:00", openUntil: "17:00", color: "#CEFFBE", colorOpacity: 0.7, maxColumns: 1 },
];

export const TOPIC_TAGS = [
  "AI", "Payments", "Banking", "Lending", "Stablecoins", "Crypto", "Blockchain",
  "Embedded Finance", "Open Banking", "RegTech", "Compliance", "Fraud & Risk",
  "Credit", "Insurance", "Wealth Management", "Digital Assets", "Cross-Border",
  "Emerging Markets", "B2B Fintech", "Consumer Fintech", "Infrastructure",
  "Data & Analytics", "Policy & Regulation", "Investment & VC",
];

/** Hex colour for each topic tag (for dots/pills on session cards). */
export const TOPIC_TAG_COLORS = {
  "AI": "#3b82f6",
  "Payments": "#10b981",
  "Banking": "#f59e0b",
  "Lending": "#f97316",
  "Stablecoins": "#8b5cf6",
  "Crypto": "#7c3aed",
  "Blockchain": "#6366f1",
  "Embedded Finance": "#14b8a6",
  "Open Banking": "#06b6d4",
  "RegTech": "#ef4444",
  "Compliance": "#f43f5e",
  "Fraud & Risk": "#dc2626",
  "Credit": "#eab308",
  "Insurance": "#84cc16",
  "Wealth Management": "#d97706",
  "Digital Assets": "#ec4899",
  "Cross-Border": "#0ea5e9",
  "Emerging Markets": "#22c55e",
  "B2B Fintech": "#64748b",
  "Consumer Fintech": "#d946ef",
  "Infrastructure": "#71717a",
  "Data & Analytics": "#2563eb",
  "Policy & Regulation": "#ea580c",
  "Investment & VC": "#b45309",
};

export const FORMAT_TAGS = [
  "Keynote", "Fireside", "Panel", "Debate", "Rant", "Failure Therapy",
];
