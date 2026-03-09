import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { HALLS, STAGES, TOPIC_TAGS, FORMAT_TAGS, TOPIC_TAG_COLORS } from "./stages.config.js";

// ─── CONSTANTS ────────────────────────────────────────────────────────────────

const DAYS = [
  { id: 1, label: "Day 1", date: "Nov 19" },
  { id: 2, label: "Day 2", date: "Nov 20" },
];

const TIME_START = 8 * 60 + 45; // 08:45 in minutes
const TIME_END   = 17 * 60 + 30; // 17:30
const SLOT_MINS  = 15;           // snap resolution
const PX_PER_MIN = 4.5;       // morning 08:45–12:30 (~225 min) fills ~one viewport height; sessions/transitions clearly visible

const toMins = (hhmm) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};
const toHHMM = (mins) => {
  const h = Math.floor(mins / 60).toString().padStart(2, "0");
  const m = (mins % 60).toString().padStart(2, "0");
  return `${h}:${m}`;
};
const minsToY = (mins) => (mins - TIME_START) * PX_PER_MIN;
const durationToPx = (mins) => mins * PX_PER_MIN;

const DAY_START_STR = toHHMM(TIME_START);
const DAY_END_STR   = toHHMM(TIME_END);

function hexToRgba(hex, a = 1) {
  const m = hex.match(/^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  if (!m) return hex;
  return `rgba(${parseInt(m[1], 16)}, ${parseInt(m[2], 16)}, ${parseInt(m[3], 16)}, ${a})`;
}

function isLightColor(colorStr) {
  let r = 0, g = 0, b = 0;
  const hex = colorStr.match(/^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  if (hex) {
    r = parseInt(hex[1], 16) / 255; g = parseInt(hex[2], 16) / 255; b = parseInt(hex[3], 16) / 255;
  } else {
    const rgba = colorStr.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    if (rgba) { r = rgba[1] / 255; g = rgba[2] / 255; b = rgba[3] / 255; }
  }
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminance > 0.6;
}

// Derive hall groups and columns from config (single source of truth)
function buildHallGroups(halls, stages) {
  return halls.map(hall => {
    const stageList = stages.filter(s => s.hall === hall.id);
    const columns = stageList.flatMap(stage => {
      const n = stage.maxColumns ?? 1;
      const opacity = stage.colorOpacity ?? 1;
      const color = opacity < 1 ? hexToRgba(stage.color, opacity) : stage.color;
      return Array.from({ length: n }, (_, i) => {
        const id = n > 1 ? `${stage.id}-${i + 1}` : stage.id;
        const short = n > 1 ? (stage.id === "roundtables" ? `RT ${i + 1}` : `${stage.name} ${i + 1}`) : stage.name;
        return { id, name: stage.name, short, openFrom: stage.openFrom, openUntil: stage.openUntil, color };
      });
    });
    return { id: hall.id, name: hall.name, columns };
  });
}

const HALL_GROUPS_WITH_COLUMNS = buildHallGroups(HALLS, STAGES);
const ALL_COLUMNS = HALL_GROUPS_WITH_COLUMNS.flatMap(h => h.columns);

// Hall 1: Main Stage 08:45–12:35, Lunch overlay 12:35–14:00, Roundtables 14:00+
const HALL1_MAIN_STAGE_END = 12 * 60 + 35; // 12:35 (after MC Wrap)
const HALL1_LUNCH_END      = 14 * 60;       // 14:00 (roundtables start)
const HALL1_SPLIT_TIME     = HALL1_LUNCH_END;

// Block types palette — NerdCon: bg #00B97A 30%, text #D6FEFC, border #00B97A
const BLOCK_PALETTE = [
  { type: "stage-open",   label: "Stage Open",     defaultMins: 15,  color: "rgba(0,185,122,0.3)", borderColor: "#00B97A", textColor: "#D6FEFC" },
  { type: "stage-closed", label: "Stage Closed",   defaultMins: 60,  color: "rgba(0,185,122,0.3)", borderColor: "#00B97A", textColor: "#D6FEFC" },
  { type: "transition",   label: "Transition",     defaultMins: 10,  color: "rgba(0,185,122,0.3)", borderColor: "#00B97A", textColor: "#D6FEFC" },
  { type: "lunch",        label: "Lunch",          defaultMins: 90,  color: "rgba(0,185,122,0.3)", borderColor: "#00B97A", textColor: "#D6FEFC" },
  { type: "break",        label: "Break",          defaultMins: 15,  color: "rgba(0,185,122,0.3)", borderColor: "#00B97A", textColor: "#D6FEFC" },
  { type: "wrap-up",      label: "Wrap Up",        defaultMins: 15,  color: "rgba(0,185,122,0.3)", borderColor: "#00B97A", textColor: "#D6FEFC" },
  { type: "happy-hour",   label: "Happy Hour",     defaultMins: 60,  color: "rgba(0,185,122,0.3)", borderColor: "#00B97A", textColor: "#D6FEFC" },
];

// Placeholder structure (muted styling): Main Stage, Side Quest, Startup, Podcast, Roundtables
function buildPlaceholderData() {
  const sessions = [];
  const slots = [];
  const blocks = [];
  let sid = 0, slid = 0, bid = 0;
  const mkSession = (title, durationMins, format, spaceId, dayConstraint = null) => {
    const id = `ph-${++sid}`;
    sessions.push({ id, title, description: "", format, durationMins, track: "Other", speakerIds: [], moderatorId: null, status: "draft", chathamHouse: false, dayConstraint, spaceConstraint: spaceId ? [spaceId] : null, placeholder: true, tags: [], lockStatus: "pencilled", sessionStatus: "placeholder", speakerEmail: null });
    return id;
  };
  const mkSlot = (sessionId, spaceId, day, startTime) => {
    slots.push({ id: `sl-${++slid}`, sessionId, spaceId, day, startTime });
  };
  const mkBlock = (type, label, spaceId, day, startTime, durationMins) => {
    blocks.push({ id: `bl-${++bid}`, type, label, spaceId, day, startTime, durationMins });
  };

  for (const day of [1, 2]) {
    // Main Stage
    mkBlock("stage-open", "Stage Open", "main-stage", day, "08:45", 10);
    if (day === 1) {
      const simon = mkSession("Simon's State of Fintech", 15, "keynote", "main-stage", "day1");
      mkSlot(simon, "main-stage", 1, "08:55");
    }
    const k1 = mkSession("Keynote 1", 30, "keynote", "main-stage");
    const k2 = mkSession("Keynote 2", 30, "keynote", "main-stage");
    const k3 = mkSession("Keynote 3", 30, "keynote", "main-stage");
    const k4 = mkSession("Keynote 4", 30, "keynote", "main-stage");
    const k5 = mkSession("Keynote 5", 30, "keynote", "main-stage");
    const k6 = mkSession("Keynote 6", day === 1 ? 20 : 25, "keynote", "main-stage");
    if (day === 1) {
      // Three test sessions on Main Stage: placeholder, pencilled, confirmed (visually distinct)
      const testPlaceholderId = `ph-${++sid}`;
      sessions.push({ id: testPlaceholderId, title: "Test Placeholder", description: "", format: "keynote", durationMins: 25, track: "Other", speakerIds: [], moderatorId: null, status: "draft", chathamHouse: false, dayConstraint: null, spaceConstraint: ["main-stage"], placeholder: true, tags: [], lockStatus: "pencilled", sessionStatus: "placeholder", speakerEmail: null });
      const testPencilledId = `ph-${++sid}`;
      sessions.push({ id: testPencilledId, title: "Test Pencilled", description: "", format: "keynote", durationMins: 25, track: "Other", speakerIds: [], moderatorId: null, status: "draft", chathamHouse: false, dayConstraint: null, spaceConstraint: ["main-stage"], placeholder: false, tags: [], lockStatus: "pencilled", sessionStatus: "pencilled", speakerEmail: null });
      const testConfirmedId = `ph-${++sid}`;
      sessions.push({ id: testConfirmedId, title: "Test Confirmed", description: "", format: "keynote", durationMins: 25, track: "Other", speakerIds: [], moderatorId: null, status: "draft", chathamHouse: false, dayConstraint: null, spaceConstraint: ["main-stage"], placeholder: false, tags: [], lockStatus: "confirmed", sessionStatus: "confirmed", speakerEmail: null });
      mkSlot(testPlaceholderId, "main-stage", 1, "09:10");
      mkBlock("transition", "Transition", "main-stage", 1, "09:35", 5);
      mkSlot(testPencilledId, "main-stage", 1, "09:45");
      mkBlock("transition", "Transition", "main-stage", 1, "10:10", 5);
      mkSlot(testConfirmedId, "main-stage", 1, "10:20");
      mkBlock("transition", "Transition", "main-stage", 1, "10:45", 5);
      mkSlot(k4, "main-stage", 1, "10:55"); mkBlock("transition", "Transition", "main-stage", 1, "11:25", 5);
      mkSlot(k5, "main-stage", 1, "11:30"); mkBlock("transition", "Transition", "main-stage", 1, "12:00", 5);
      mkSlot(k6, "main-stage", 1, "12:05");
      mkBlock("wrap-up", "MC Wrap", "main-stage", 1, "12:30", 5);
      mkBlock("stage-closed", "Stage Closed", "main-stage", 1, "12:35", 85);
      mkBlock("lunch", "Lunch", "hall-1", 1, "12:35", 85);
    } else {
      mkSlot(k1, "main-stage", 2, "08:55"); mkBlock("transition", "Transition", "main-stage", 2, "09:25", 5);
      mkSlot(k2, "main-stage", 2, "09:30"); mkBlock("transition", "Transition", "main-stage", 2, "10:00", 5);
      mkSlot(k3, "main-stage", 2, "10:05"); mkBlock("transition", "Transition", "main-stage", 2, "10:35", 5);
      mkSlot(k4, "main-stage", 2, "10:40"); mkBlock("transition", "Transition", "main-stage", 2, "11:10", 5);
      mkSlot(k5, "main-stage", 2, "11:15"); mkBlock("transition", "Transition", "main-stage", 2, "11:45", 5);
      mkSlot(k6, "main-stage", 2, "11:50");
      mkBlock("wrap-up", "MC Wrap", "main-stage", 2, "12:30", 5);
      mkBlock("stage-closed", "Stage Closed", "main-stage", 2, "12:35", 85);
      mkBlock("lunch", "Lunch", "hall-1", 2, "12:35", 85);
    }

    // Side Quest: 13:00 Stage Open, 10 x Demo 15 min + 5 min transition, Stage Close
    mkBlock("stage-open", "Stage Open", "side-quest", day, "13:00", 5);
    let t = 13 * 60; // 13:00
    for (let i = 1; i <= 10; i++) {
      const demo = mkSession(`Demo ${i}`, 15, "demo", "side-quest");
      mkSlot(demo, "side-quest", day, toHHMM(t));
      t += 15 + (i < 10 ? 5 : 0);
    }
    mkBlock("stage-closed", "Stage Close", "side-quest", day, toHHMM(t), 5);

    // Startup: 13:00 Stage Open, 6 x Session 30 min + 5 min transition
    mkBlock("stage-open", "Stage Open", "startup", day, "13:00", 5);
    t = 13 * 60;
    for (let i = 1; i <= 6; i++) {
      const s = mkSession(`Session ${i}`, 30, "solo-talk", "startup");
      mkSlot(s, "startup", day, toHHMM(t));
      t += 30 + (i < 6 ? 5 : 0);
    }
    mkBlock("stage-closed", "Stage Close", "startup", day, toHHMM(t), 5);

    // Podcast: 08:45 start, 12 x Podcast 30 min + 10 min transition
    t = 8 * 60 + 45;
    for (let i = 1; i <= 12; i++) {
      const p = mkSession(`Podcast ${i}`, 30, "podcast", "podcast");
      mkSlot(p, "podcast", day, toHHMM(t));
      t += 30 + (i < 12 ? 10 : 0);
    }

    // Roundtables: 14:00 start, 5 columns × 4 slots of 40 min
    for (let col = 1; col <= 5; col++) {
      const spaceId = `roundtables-${col}`;
      t = 14 * 60;
      for (let i = 1; i <= 4; i++) {
        const rt = mkSession(`Roundtable ${(col - 1) * 4 + i}`, 40, "roundtable", spaceId);
        mkSlot(rt, spaceId, day, toHHMM(t));
        t += 40;
      }
    }
  }

  return { sessions, slots, blocks };
}

const _ph = buildPlaceholderData();
const INITIAL_BLOCKS = _ph.blocks;

const TRACK_COLORS = {
  "AI":          { bg: "#451a03", border: "#f59e0b", text: "#fbbf24" },
  "Payments":    { bg: "#1e3a5f", border: "#3b82f6", text: "#60a5fa" },
  "Strategy":    { bg: "#2e1065", border: "#8b5cf6", text: "#a78bfa" },
  "Lending":     { bg: "#500724", border: "#ec4899", text: "#f472b6" },
  "Stablecoins": { bg: "#052e16", border: "#10b981", text: "#34d399" },
  "Sponsor":     { bg: "#1c1917", border: "#57534e", text: "#a8a29e" },
  "Internal":    { bg: "#0f172a", border: "#334155", text: "#64748b" },
  "Other":       { bg: "#1c1917", border: "#44403c", text: "#78716c" },
};

const SESSION_FORMATS = [
  "keynote", "fireside", "panel", "debate", "solo-talk",
  "demo", "bootcamp", "roundtable", "podcast", "vc-session",
  "meetup", "workshop", "startup-pitch", "activation",
];

// ─── BRAND THEME ─────────────────────────────────────────────────────────────
// NerdCon brand: page #061E21, headers #CEFFBE, primary #FFFFFF, subtext #D6FEFC, borders #00B97A, accent1 #0CEBF1, accent2 #FFFBC9
const B = {
  bg:          "#061E21",   // Page/grid background (dark)
  bgCard:      "#0a282c",   // lifted card surface
  bgSidebar:   "#061E21",   // sidebar
  bgDeep:      "#061E21",   // header, closed zones (match bg)
  border:      "#00B97A",   // Borders, outlines, dividers
  borderDim:   "#00B97A40",
  cyan:        "#0CEBF1",   // Accent 1
  cyanDim:     "#0CEBF115",
  yellow:      "#FFFBC9",   // Accent 2
  yellowDim:   "#FFFBC920",
  green:       "#00B97A",
  greenText:   "#CEFFBE",   // Hall headers, section titles
  white:       "#FFFFFF",   // Primary text
  fieldLabel:  "#D6FEFC",   // Subtext, times, durations, field labels
  amber:       "#f59e0b",
  red:         "#ef4444",
  textPrimary: "#FFFFFF",
  textSecond:  "#D6FEFC",
  textDim:     "#D6FEFC80",
};

// ─── INITIAL DATA ─────────────────────────────────────────────────────────────

const INITIAL_SPEAKERS = [
  { id: "sp1",  fullName: "Cristina Junqueira",  company: "Nubank",     title: "Co-Founder",            email: "", source: "outbound", status: "confirmed", ccOwner: "Simon Taylor",  announceWave: 1, announced: false, dayConstraint: null, maxSessions: 2 },
  { id: "sp2",  fullName: "Dennis Yang",         company: "Chime",      title: "CEO",                   email: "", source: "outbound", status: "confirmed", ccOwner: "Simon Taylor",  announceWave: 1, announced: false, dayConstraint: "day1", maxSessions: 2 },
  { id: "sp3",  fullName: "Linda Lacewell",      company: "Valon",      title: "CEO",                   email: "", source: "outbound", status: "confirmed", ccOwner: "Colton Pond",   announceWave: 1, announced: false, dayConstraint: null, maxSessions: 2 },
  { id: "sp4",  fullName: "Rex Salisbury",       company: "Cambrian",   title: "Founder",               email: "", source: "outbound", status: "confirmed", ccOwner: "Simon Taylor",  announceWave: 1, announced: false, dayConstraint: null, maxSessions: 4 },
  { id: "sp5",  fullName: "Tom Callahan",        company: "Figure",     title: "CEO",                   email: "", source: "outbound", status: "confirmed", ccOwner: "Joy Schwartz",  announceWave: 1, announced: false, dayConstraint: null, maxSessions: 2 },
  { id: "sp6",  fullName: "Beatrice Darlison",   company: "Wise",       title: "CTO",                   email: "", source: "outbound", status: "confirmed", ccOwner: "Simon Taylor",  announceWave: 2, announced: false, dayConstraint: null, maxSessions: 2 },
  { id: "sp7",  fullName: "Carlos Faria",        company: "Santander",  title: "Chief AI Officer",      email: "", source: "outbound", status: "confirmed", ccOwner: "Colton Pond",   announceWave: 2, announced: false, dayConstraint: null, maxSessions: 2 },
  { id: "sp8",  fullName: "Sarah Chen",          company: "Venmo",      title: "Fraud Engineering Lead", email: "", source: "outbound", status: "confirmed", ccOwner: "Colton Pond",   announceWave: 2, announced: false, dayConstraint: null, maxSessions: 2 },
  { id: "sp9",  fullName: "Omar Hassan",         company: "Circle",     title: "VP Product",            email: "", source: "outbound", status: "confirmed", ccOwner: "Simon Taylor",  announceWave: 3, announced: false, dayConstraint: null, maxSessions: 2 },
  { id: "sp10", fullName: "Jen Takahashi",       company: "Brex",       title: "Chief Risk Officer",   email: "", source: "outbound", status: "invited",   ccOwner: "Colton Pond",   announceWave: null, announced: false, dayConstraint: null, maxSessions: 2 },
  { id: "sp11", fullName: "Aisha Okonkwo",       company: "Flutterwave", title: "COO",                  email: "", source: "outbound", status: "invited",   ccOwner: "Simon Taylor",  announceWave: null, announced: false, dayConstraint: null, maxSessions: 2 },
  { id: "sp12", fullName: "Simon Taylor",        company: "NerdCon",    title: "Co-Founder",            email: "", source: "outbound", status: "confirmed", ccOwner: null,            announceWave: null, announced: true,  dayConstraint: null, maxSessions: 10 },
];

const INITIAL_SESSIONS = _ph.sessions;
const INITIAL_SLOTS = _ph.slots;

// ─── CLASH DETECTION ──────────────────────────────────────────────────────────

function detectClashes(slots, sessions, speakers, structuralBlocks, spaces) {
  const clashes = [];

  slots.forEach(slot => {
    const session = sessions.find(s => s.id === slot.sessionId);
    if (!session) return;

    const slotStart = toMins(slot.startTime);
    const slotEnd   = slotStart + session.durationMins;
    const space     = spaces && spaces.find(sp => sp.id === slot.spaceId);

    // 1. Space closed at this time (uses editable track hours)
    if (space && space.openFrom != null && space.openUntil != null) {
      const spaceOpen  = toMins(space.openFrom);
      const spaceClose = toMins(space.openUntil);
      if (slotStart < spaceOpen || slotEnd > spaceClose) {
        clashes.push({ slotId: slot.id, severity: "block", rule: "space-closed", message: `${space.short} is closed at this time` });
      }
    }

    // 2. Track occupancy clash
    slots.forEach(other => {
      if (other.id === slot.id) return;
      if (other.spaceId !== slot.spaceId) return;
      if (other.day !== slot.day) return;
      const otherSession = sessions.find(s => s.id === other.sessionId);
      if (!otherSession) return;
      const otherStart = toMins(other.startTime);
      const otherEnd   = otherStart + otherSession.durationMins;
      if (slotStart < otherEnd && slotEnd > otherStart) {
        clashes.push({ slotId: slot.id, severity: "block", rule: "space-occupied", message: `Space already occupied` });
      }
    });

    // 3. Speaker double-booked
    const allSpeakerIds = [...session.speakerIds, session.moderatorId].filter(Boolean);
    allSpeakerIds.forEach(spId => {
      slots.forEach(other => {
        if (other.id === slot.id) return;
        if (other.day !== slot.day) return;
        const otherSession = sessions.find(s => s.id === other.sessionId);
        if (!otherSession) return;
        const otherSpeakers = [...otherSession.speakerIds, otherSession.moderatorId].filter(Boolean);
        if (!otherSpeakers.includes(spId)) return;
        const otherStart = toMins(other.startTime);
        const otherEnd   = otherStart + otherSession.durationMins;
        if (slotStart < otherEnd && slotEnd > otherStart) {
          const speaker = speakers.find(s => s.id === spId);
          clashes.push({ slotId: slot.id, severity: "block", rule: "speaker-clash", message: `${speaker?.fullName || spId} is double-booked` });
        }
      });
    });

    // 4. Day constraint violation
    if (session.dayConstraint && session.dayConstraint !== "either" && session.dayConstraint !== `day${slot.day}`) {
      clashes.push({ slotId: slot.id, severity: "block", rule: "day-constraint", message: `Session constrained to Day ${session.dayConstraint.replace("day","")}` });
    }

    // 5. Speaker day constraint
    allSpeakerIds.forEach(spId => {
      const speaker = speakers.find(s => s.id === spId);
      if (!speaker || !speaker.dayConstraint) return;
      if (speaker.dayConstraint !== `day${slot.day}` && speaker.dayConstraint !== "both") {
        clashes.push({ slotId: slot.id, severity: "block", rule: "speaker-day", message: `${speaker.fullName} not available on Day ${slot.day}` });
      }
    });

    // 6. Warn: unconfirmed speaker
    session.speakerIds.forEach(spId => {
      const speaker = speakers.find(s => s.id === spId);
      if (speaker && speaker.status !== "confirmed") {
        clashes.push({ slotId: slot.id, severity: "warn", rule: "unconfirmed-speaker", message: `${speaker.fullName} not yet confirmed` });
      }
    });
  });

  return clashes;
}

// ─── MAIN APP ─────────────────────────────────────────────────────────────────

export default function NerdConOps() {
  const [mode, setMode]             = useState("view");
  const [activeDay, setActiveDay]   = useState(1);
  const [speakers, setSpeakers]     = useState(INITIAL_SPEAKERS);
  const [sessions, setSessions]     = useState(INITIAL_SESSIONS);
  const [slots, setSlots]           = useState(INITIAL_SLOTS);
  const [blocks, setBlocks]         = useState(INITIAL_BLOCKS); // draggable structural blocks
  const [collapsed, setCollapsed]   = useState(() => Object.fromEntries(HALLS.map(h => [h.id, false])));
  const [dragging, setDragging]     = useState(null);   // { type: "session"|"block", session?, block?, fromSlotId?, isNew? }
  const [hoverCell, setHoverCell]   = useState(null);   // { spaceId, timeMins }
  const [resizing, setResizing]     = useState(null);   // { type: "session"|"block", id, edge: "top"|"bottom", origStartMins, origDurMins, origY }
  const [toast, setToast]           = useState(null);
  const [editingSession, setEditingSession]   = useState(null);
  const [editingBlock, setEditingBlock]       = useState(null);
  const [creatingSession, setCreatingSession] = useState(false);
  const [sidebarTab, setSidebarTab] = useState("unscheduled");
  const gridRef = useRef(null);

  const clashes = detectClashes(slots, sessions, speakers, [], ALL_COLUMNS);

  const showToast = useCallback((msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 2500);
  }, []);

  const getSlotClashes = (slotId) => clashes.filter(c => c.slotId === slotId);

  const scheduledSessionIds = new Set(slots.map(s => s.sessionId));
  const unscheduledSessions = sessions.filter(s =>
    !scheduledSessionIds.has(s.id) && s.status !== "cancelled"
  );

  const totalGridHeight = (TIME_END - TIME_START) * PX_PER_MIN;
  const SNAP = 5;

  // ── DROP ──
  const handleDrop = (spaceId, dropTimeMins) => {
    if (!dragging) return;
    const snapped = Math.round(dropTimeMins / SNAP) * SNAP;

    if (dragging.type === "block") {
      const palette = BLOCK_PALETTE.find(p => p.type === dragging.block.type);
      const newBlock = {
        id: dragging.isNew ? `bl-${Date.now()}` : dragging.block.id,
        type: dragging.block.type,
        label: dragging.block.label || palette?.label || dragging.block.type,
        spaceId,
        day: activeDay,
        startTime: toHHMM(snapped),
        durationMins: dragging.block.durationMins,
      };
      if (dragging.isNew) {
        setBlocks(prev => [...prev, newBlock]);
      } else {
        setBlocks(prev => prev.map(b => b.id === newBlock.id ? newBlock : b));
      }
      setDragging(null); setHoverCell(null);
      return;
    }

    // Session
    const session = dragging.session;
    let newSlots = dragging.fromSlotId
      ? slots.filter(s => s.id !== dragging.fromSlotId)
      : [...slots];
    const newSlot = { id: `sl-${Date.now()}`, sessionId: session.id, spaceId, day: activeDay, startTime: toHHMM(snapped) };
    newSlots = [...newSlots, newSlot];
    const testClashes = detectClashes(newSlots, sessions, speakers, [], ALL_COLUMNS)
      .filter(c => c.slotId === newSlot.id && c.severity === "block");
    if (testClashes.length > 0) {
      showToast(`⚠ ${testClashes[0].message}`, "error");
      setDragging(null); setHoverCell(null);
      return;
    }
    setSlots(newSlots);
    setDragging(null); setHoverCell(null);
  };

  // ── RESIZE ──
  const handleResizeStart = useCallback((e, type, id, edge, startMins, durationMins) => {
    e.stopPropagation(); e.preventDefault();
    setResizing({ type, id, edge, origStartMins: startMins, origDurMins: durationMins, origY: e.clientY });
  }, []);

  useEffect(() => {
    if (!resizing) return;
    const onMove = (e) => {
      const deltaY = e.clientY - resizing.origY;
      const deltaMins = Math.round((deltaY / PX_PER_MIN) / SNAP) * SNAP;
      if (resizing.type === "block") {
        setBlocks(prev => prev.map(b => {
          if (b.id !== resizing.id) return b;
          if (resizing.edge === "bottom") return { ...b, durationMins: Math.max(5, resizing.origDurMins + deltaMins) };
          const newStart = resizing.origStartMins + deltaMins;
          const newDur   = Math.max(5, resizing.origDurMins - deltaMins);
          return { ...b, startTime: toHHMM(newStart), durationMins: newDur };
        }));
      } else {
        // session: top resize moves slot startTime, bottom resize changes session duration
        if (resizing.edge === "bottom") {
          const newDur = Math.max(5, resizing.origDurMins + deltaMins);
          setSessions(ss => ss.map(s => {
            const slot = slots.find(sl => sl.id === resizing.id);
            return (slot && s.id === slot.sessionId) ? { ...s, durationMins: newDur } : s;
          }));
        } else {
          const newStart = resizing.origStartMins + deltaMins;
          const newDur   = Math.max(5, resizing.origDurMins - deltaMins);
          setSlots(prev => prev.map(sl => sl.id === resizing.id ? { ...sl, startTime: toHHMM(newStart) } : sl));
          setSessions(ss => ss.map(s => {
            const slot = slots.find(sl => sl.id === resizing.id);
            return (slot && s.id === slot.sessionId) ? { ...s, durationMins: newDur } : s;
          }));
        }
      }
    };
    const onUp = () => setResizing(null);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup",   onUp);
    return () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
  }, [resizing, slots]);

  const createSession = (data) => {
    const newSession = {
      id: `se-${Date.now()}`, title: data.title, description: data.description || "",
      format: data.format, durationMins: data.durationMins, track: data.track,
      speakerIds: data.speakerIds || [], moderatorId: data.moderatorId || null,
      status: data.status, chathamHouse: data.chathamHouse || false,
      dayConstraint: data.dayConstraint || null, spaceConstraint: data.spaceConstraint || null,
      tags: data.tags || [], lockStatus: data.lockStatus || "pencilled", sessionStatus: data.sessionStatus || "pencilled", speakerEmail: data.speakerEmail ?? null,
    };
    setSessions(prev => [...prev, newSession]);
    setCreatingSession(false);
    showToast(`Session created: ${newSession.title}`, "success");
  };

  const removeBlock = (blockId) => { setBlocks(prev => prev.filter(b => b.id !== blockId)); showToast("Block removed", "success"); };
  const removeSlot  = (slotId)  => { setSlots(prev => prev.filter(s => s.id !== slotId));   showToast("Session removed from agenda", "success"); };

  // Update block duration and shift all subsequent blocks/slots on same stage
  const handleBlockDurationChange = useCallback((block, newDurationMins) => {
    const oldEndMins = toMins(block.startTime) + block.durationMins;
    const delta = newDurationMins - block.durationMins;
    if (delta === 0) return;
    setBlocks(prev => prev.map(b => {
      if (b.id === block.id) return { ...b, durationMins: newDurationMins };
      if (b.spaceId !== block.spaceId || b.day !== block.day) return b;
      const startMins = toMins(b.startTime);
      if (startMins < oldEndMins) return b;
      return { ...b, startTime: toHHMM(startMins + delta) };
    }));
    setSlots(prev => prev.map(sl => {
      if (sl.spaceId !== block.spaceId || sl.day !== block.day) return sl;
      const startMins = toMins(sl.startTime);
      if (startMins < oldEndMins) return sl;
      return { ...sl, startTime: toHHMM(startMins + delta) };
    }));
    setEditingBlock(null);
    showToast("Block updated; subsequent items shifted", "success");
  }, []);

  const toggleGroup = (groupId) => {
    setCollapsed(prev => ({ ...prev, [groupId]: !prev[groupId] }));
  };

  const confirmedCount = speakers.filter(s => s.status === "confirmed").length;
  const scheduledCount = slots.length;
  const clashCount     = clashes.filter(c => c.severity === "block").length;
  const warnCount      = clashes.filter(c => c.severity === "warn").length;

  return (
    <div style={{ fontFamily: "'DM Mono', 'IBM Plex Mono', monospace", background: B.bg, minHeight: "100vh", color: B.textPrimary, overflow: "hidden" }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Mono:wght@300;400;500&family=DM+Sans:wght@400;500;600;700&family=Rajdhani:wght@600;700&display=swap" rel="stylesheet" />

      {/* ── TOP BAR ── */}
      <div style={{ height: 56, background: B.bgDeep, borderBottom: `2px solid ${B.border}`, display: "flex", alignItems: "center", padding: "0 20px", gap: 24, position: "sticky", top: 0, zIndex: 50 }}>
        {/* Logo wordmark */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
          <div style={{ display: "flex", flexDirection: "column", lineHeight: 1 }}>
            <span style={{ fontFamily: "'Rajdhani', 'DM Sans', sans-serif", fontWeight: 700, fontSize: 17, color: B.textPrimary, letterSpacing: "0.05em", textTransform: "uppercase" }}>
              Fintech <span style={{ color: B.cyan }}>Nerd</span>Con
            </span>
            <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, color: B.fieldLabel, letterSpacing: "0.15em", textTransform: "uppercase", marginTop: 1 }}>
              San Diego · Nov 19–20 · Ops
            </span>
          </div>
          <div style={{ width: 1, height: 28, background: B.border, margin: "0 4px" }} />
        </div>

        {/* Mode toggle */}
        <div style={{ display: "flex", background: B.bgDeep, border: `1px solid ${B.border}`, borderRadius: 7, padding: 3, gap: 2 }}>
          {[{ id: "view", label: "View" }, { id: "build", label: "Build" }].map(m => (
            <button key={m.id} onClick={() => setMode(m.id)} style={{
              padding: "5px 14px", borderRadius: 5, border: "none", cursor: "pointer",
              fontFamily: "'DM Mono', monospace", fontSize: 11, fontWeight: 500,
              background: mode === m.id ? B.bgCard : "transparent",
              color: mode === m.id ? B.cyan : B.textDim,
              boxShadow: mode === m.id ? `0 0 8px ${B.cyan}30` : "none",
              transition: "all 0.15s",
            }}>{m.label}</button>
          ))}
        </div>

        {/* Day tabs — active #CEFFBE, inactive #D6FEFC 50% */}
        <div style={{ display: "flex", gap: 2 }}>
          {DAYS.map(d => (
            <button key={d.id} onClick={() => setActiveDay(d.id)} style={{
              padding: "5px 14px", background: "none", border: "none", cursor: "pointer",
              fontFamily: "'DM Mono', monospace", fontSize: 11,
              color: activeDay === d.id ? B.greenText : "#D6FEFC80",
              borderBottom: `2px solid ${activeDay === d.id ? B.greenText : "transparent"}`,
              transition: "all 0.15s",
            }}>{d.label} · {d.date}</button>
          ))}
        </div>

        {/* Stats */}
        <div style={{ display: "flex", gap: 20, marginLeft: "auto", alignItems: "center" }}>
          {[
            { label: "confirmed", value: confirmedCount, valueColor: B.greenText },
            { label: "scheduled", value: scheduledCount, valueColor: B.greenText },
            { label: "clashes",   value: clashCount,     valueColor: clashCount > 0 ? B.red : B.greenText },
            { label: "warnings",  value: warnCount,      valueColor: warnCount > 0 ? B.amber : B.greenText },
          ].map(s => (
            <div key={s.label} style={{ textAlign: "center" }}>
              <div style={{ fontFamily: "'Rajdhani', sans-serif", fontSize: 18, fontWeight: 700, color: s.valueColor, lineHeight: 1 }}>{s.value}</div>
              <div style={{ fontSize: 9, color: B.textSecond, textTransform: "uppercase", letterSpacing: "0.1em", marginTop: 2 }}>{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── MAIN LAYOUT ── */}
      <div style={{ display: "flex", height: "calc(100vh - 52px)" }}>

        {/* ── SIDEBAR (build mode only) ── */}
        {mode === "build" && (
          <div style={{ width: 260, background: B.bgSidebar, borderRight: `1px solid ${B.border}`, display: "flex", flexDirection: "column", flexShrink: 0 }}>
            <div style={{ display: "flex", borderBottom: `1px solid ${B.border}` }}>
              {[
                { id: "unscheduled", label: `Sessions (${unscheduledSessions.length})` },
                { id: "blocks",      label: "Blocks" },
                { id: "health",      label: "Health" },
              ].map(t => (
                <button key={t.id} onClick={() => setSidebarTab(t.id)} style={{
                  flex: 1, padding: "10px 4px", background: "none", border: "none", cursor: "pointer",
                  fontFamily: "'DM Mono', monospace", fontSize: 9,
                  color: sidebarTab === t.id ? B.cyan : B.textDim,
                  borderBottom: `2px solid ${sidebarTab === t.id ? B.cyan : "transparent"}`,
                  transition: "all 0.15s",
                }}>{t.label}</button>
              ))}
            </div>

            {sidebarTab === "unscheduled" && <>
              <button onClick={() => setCreatingSession(true)} style={{
                margin: "10px 10px 4px", padding: "8px 0",
                background: B.cyanDim, border: `1px dashed ${B.green}`,
                borderRadius: 6, color: B.greenText,
                fontFamily: "'DM Mono', monospace", fontSize: 11, cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
              }}
                onMouseEnter={e => { e.currentTarget.style.background = `${B.green}20`; e.currentTarget.style.borderStyle = "solid"; }}
                onMouseLeave={e => { e.currentTarget.style.background = B.cyanDim; e.currentTarget.style.borderStyle = "dashed"; }}
              ><span style={{ fontSize: 14 }}>+</span> New Session</button>
              <div style={{ overflowY: "auto", padding: "6px 10px 10px", flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
                {unscheduledSessions.length === 0
                  ? <div style={{ padding: 20, textAlign: "center", color: B.textDim, fontSize: 12 }}>All sessions scheduled ✓</div>
                  : unscheduledSessions.map(session => (
                    <SidebarSessionCard key={session.id} session={session} speakers={speakers}
                      isDragging={dragging?.session?.id === session.id}
                      onDragStart={() => setDragging({ type: "session", session, fromSlotId: null })}
                      onDragEnd={() => { if (!hoverCell) setDragging(null); }}
                      onClick={() => setEditingSession(session)}
                    />
                  ))
                }
              </div>
            </>}

            {sidebarTab === "blocks" && (
              <div style={{ overflowY: "auto", padding: "10px", flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
                <div style={{ fontSize: 9, color: B.textDim, textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 2 }}>Drag onto grid</div>
                {BLOCK_PALETTE.map(p => (
                  <div key={p.type} draggable
                    onDragStart={() => setDragging({ type: "block", block: { type: p.type, label: p.label, durationMins: p.defaultMins }, isNew: true })}
                    onDragEnd={() => { if (!hoverCell) setDragging(null); }}
                    style={{ padding: "8px 10px", borderRadius: 6, cursor: "grab", background: p.color, border: `1px solid ${p.borderColor}50`, borderLeft: `3px solid ${p.borderColor}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}
                  >
                    <span style={{ fontSize: 11, color: p.textColor, fontFamily: "'DM Mono', monospace", fontWeight: 500 }}>{p.label}</span>
                    <span style={{ fontSize: 10, color: `${p.textColor}70` }}>{p.defaultMins}m</span>
                  </div>
                ))}
                {blocks.filter(b => b.day === activeDay).length > 0 && <>
                  <div style={{ fontSize: 9, color: B.textDim, textTransform: "uppercase", letterSpacing: "0.12em", marginTop: 8, marginBottom: 2 }}>On grid — Day {activeDay}</div>
                  {blocks.filter(b => b.day === activeDay).map(b => {
                    const p = BLOCK_PALETTE.find(x => x.type === b.type) || BLOCK_PALETTE[0];
                    return (
                      <div key={b.id} draggable
                        onDragStart={() => setDragging({ type: "block", block: b, isNew: false })}
                        onDragEnd={() => { if (!hoverCell) setDragging(null); }}
                        style={{ padding: "6px 10px", borderRadius: 6, cursor: "grab", background: p.color, border: `1px solid ${p.borderColor}40`, borderLeft: `3px solid ${p.borderColor}`, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 6 }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 10, color: p.textColor, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{b.label}</div>
                          <div style={{ fontSize: 9, color: `${p.textColor}70`, marginTop: 1 }}>{b.startTime} · {b.durationMins}m</div>
                        </div>
                        <button onClick={() => removeBlock(b.id)} style={{ background: "none", border: "none", color: B.textDim, cursor: "pointer", fontSize: 11, padding: 0 }}>✕</button>
                      </div>
                    );
                  })}
                </>}
              </div>
            )}

            {sidebarTab === "health" && (
              <HealthPanel sessions={sessions} slots={slots} speakers={speakers} clashes={clashes} />
            )}
          </div>
        )}

        {/* ── GRID AREA ── */}
        <div style={{ flex: 1, overflowX: "auto", overflowY: "auto", position: "relative" }} ref={gridRef}>
          <AgendaGrid
            mode={mode}
            day={activeDay}
            sessions={sessions}
            slots={slots}
            speakers={speakers}
            clashes={clashes}
            blocks={blocks}
            collapsed={collapsed}
            dragging={dragging}
            hoverCell={hoverCell}
            resizing={resizing}
            setHoverCell={setHoverCell}
            onDrop={handleDrop}
            onRemoveSlot={removeSlot}
            onRemoveBlock={removeBlock}
            onDragStart={(session, fromSlotId) => setDragging({ type: "session", session, fromSlotId })}
            onDragEnd={() => { if (!hoverCell) setDragging(null); }}
            onBlockDragStart={(block, isNew) => setDragging({ type: "block", block, isNew: !!isNew })}
            onResizeStart={handleResizeStart}
            toggleGroup={toggleGroup}
            totalGridHeight={totalGridHeight}
            onEditSession={setEditingSession}
            onEditBlock={setEditingBlock}
            onLockSession={(session) => setSessions(prev => prev.map(s => s.id === session.id ? { ...s, lockStatus: "confirmed", sessionStatus: "confirmed" } : s))}
            hallGroupsWithColumns={HALL_GROUPS_WITH_COLUMNS}
          />
        </div>
      </div>

      {/* ── TOAST ── */}
      {toast && (
        <div style={{
          position: "fixed", bottom: 20, right: 20,
          padding: "10px 18px", borderRadius: 8,
          background: toast.type === "error" ? "#1c0404" : B.bgCard,
          border: `1px solid ${toast.type === "error" ? "#7f1d1d" : B.cyan}`,
          color: toast.type === "error" ? "#fca5a5" : B.cyan,
          fontFamily: "'DM Mono', monospace", fontSize: 12,
          zIndex: 200, boxShadow: `0 8px 32px rgba(0,0,0,0.5), 0 0 20px ${toast.type === "error" ? "#ef444420" : `${B.cyan}20`}`,
        }}>{toast.msg}</div>
      )}

      {/* ── SESSION CREATE MODAL ── */}
      {creatingSession && (
        <SessionFormModal
          mode="create"
          speakers={speakers}
          onSave={createSession}
          onClose={() => setCreatingSession(false)}
        />
      )}

      {/* ── SESSION EDIT MODAL ── */}
      {editingSession && (
        <SessionFormModal
          mode="edit"
          session={editingSession}
          speakers={speakers}
          currentSpaceId={slots.find(s => s.sessionId === editingSession.id)?.spaceId}
          onSave={(updated) => {
            setSessions(prev => prev.map(s => s.id === updated.id ? updated : s));
            setEditingSession(null);
            showToast("Session updated", "success");
          }}
          onClose={() => setEditingSession(null)}
        />
      )}

      {/* ── BLOCK DURATION EDIT MODAL ── */}
      {editingBlock && (
        <BlockDurationModal
          block={editingBlock}
          onSave={(newDurationMins) => handleBlockDurationChange(editingBlock, newDurationMins)}
          onClose={() => setEditingBlock(null)}
        />
      )}

      <style>{`
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 5px; height: 5px; }
        ::-webkit-scrollbar-track { background: ${B.bg}; }
        ::-webkit-scrollbar-thumb { background: ${B.border}; border-radius: 3px; }
        ::-webkit-scrollbar-thumb:hover { background: ${B.border}; }
        .resize-handle { opacity: 0; transition: opacity 0.15s; }
        .block-item:hover .resize-handle, .session-item:hover .resize-handle { opacity: 1; }
      `}</style>
    </div>
  );
}

// ─── COLUMN HEADER CELL (read-only: config-driven hours) ────────────────────────

function ColumnHeaderCell({ column, SPACE_COL_W }) {
  const openFrom = column.openFrom ?? DAY_START_STR;
  const openUntil = column.openUntil ?? DAY_END_STR;
  const isRgba = column.color.startsWith("rgba");
  const borderTop = isRgba ? column.color.replace(/[\d.]+\)$/, "0.4)") : `${column.color}40`;
  const bg = isRgba ? column.color.replace(/[\d.]+\)$/, "0.08)") : `${column.color}08`;
  return (
    <div style={{ width: SPACE_COL_W, padding: "5px 8px", borderLeft: `1px solid ${B.border}`, borderTop: `1px solid ${borderTop}`, background: bg }}>
      <div style={{ fontSize: 10, fontWeight: 500, color: column.color, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{column.short}</div>
      <div style={{ fontSize: 9, color: B.textSecond, marginTop: 1 }}>{openFrom}–{openUntil}</div>
    </div>
  );
}

// ─── AGENDA GRID ──────────────────────────────────────────────────────────────

function AgendaGrid({ mode, day, sessions, slots, speakers, clashes, blocks, collapsed, dragging, hoverCell, resizing, setHoverCell, onDrop, onRemoveSlot, onRemoveBlock, onDragStart, onDragEnd, onBlockDragStart, onResizeStart, toggleGroup, totalGridHeight, onEditSession, onEditBlock, onLockSession, hallGroupsWithColumns }) {
  const TIME_LABEL_W = 56;
  const SPACE_COL_W  = mode === "view" ? 130 : 150;
  const halls = hallGroupsWithColumns ?? HALL_GROUPS_WITH_COLUMNS;

  const visibleHalls = halls.map(h => ({
    ...h,
    columns: collapsed[h.id] ? [] : h.columns,
    isCollapsed: !!collapsed[h.id],
  }));

  const totalWidth = TIME_LABEL_W + halls.reduce((acc, h) => {
    if (collapsed[h.id]) return acc + 32;
    return acc + h.columns.length * SPACE_COL_W;
  }, 0);

  // Time labels
  const timeLabels = [];
  for (let m = TIME_START; m <= TIME_END; m += 30) {
    timeLabels.push(m);
  }

  // Filter slots for this day
  const daySlots  = slots.filter(s => s.day === day);
  const dayBlocks = blocks.filter(b => b.day === day);

  return (
    <div style={{ position: "relative", minWidth: totalWidth }}>

      {/* ── COLUMN HEADERS ── */}
      <div style={{ display: "flex", position: "sticky", top: 0, zIndex: 30, background: B.bgDeep, borderBottom: `2px solid ${B.border}` }}>
        {/* Time gutter */}
        <div style={{ width: TIME_LABEL_W, flexShrink: 0 }} />

        {/* Hall + column headers */}
        {halls.map((hall, hallIndex) => {
          const isCollapsed = collapsed[hall.id];
          const isHall1 = hall.id === "hall-1";
          const hall1MorningCols = isHall1 ? hall.columns.filter(c => c.id === "main-stage") : [];
          const hall1AfternoonCols = isHall1 ? hall.columns.filter(c => c.id.startsWith("roundtables-")) : [];
          if (isCollapsed) {
            return (
              <div key={hall.id}
                onClick={() => toggleGroup(hall.id)}
                style={{ width: 32, background: B.bgCard, borderLeft: `2px solid ${B.border}`, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}
                title={`Expand ${hall.name}`}>
                <span style={{ fontSize: 9, color: B.textDim, writingMode: "vertical-rl", textTransform: "uppercase", letterSpacing: "0.1em" }}>+{hall.columns.length}</span>
              </div>
            );
          }
          if (isHall1) {
            return (
              <div key={hall.id} style={{ display: "flex", flexDirection: "column", borderLeft: hallIndex === 0 ? `2px solid ${B.border}` : `2px solid ${B.border}` }}>
                <div onClick={() => toggleGroup(hall.id)} style={{ padding: "6px 10px", background: B.bgCard, borderBottom: `1px solid ${B.border}`, cursor: mode === "build" ? "pointer" : "default", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: B.greenText, letterSpacing: "0.05em" }}>{hall.name}</span>
                  {mode === "build" && <span style={{ fontSize: 9, color: B.textSecond }}>−</span>}
                </div>
                {/* Hall 1: Main Stage only in header (roundtable columns have no header row) */}
                {hall1MorningCols.length > 0 && (
                  <div style={{ display: "flex" }}>
                    {hall1MorningCols.map(c => <ColumnHeaderCell key={c.id} column={c} SPACE_COL_W={hall1AfternoonCols.length * SPACE_COL_W} />)}
                  </div>
                )}
              </div>
            );
          }
          return (
            <div key={hall.id} style={{ display: "flex", flexDirection: "column", borderLeft: `2px solid ${B.border}`, marginLeft: hallIndex > 0 ? 0 : 0 }}>
              <div onClick={() => toggleGroup(hall.id)} style={{ padding: "6px 10px", background: B.bgCard, borderBottom: `1px solid ${B.border}`, cursor: mode === "build" ? "pointer" : "default", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: B.greenText, letterSpacing: "0.05em" }}>{hall.name}</span>
                {mode === "build" && <span style={{ fontSize: 9, color: B.textSecond }}>−</span>}
              </div>
              <div style={{ display: "flex" }}>
                {hall.columns.map(column => (
                  <ColumnHeaderCell key={column.id} column={column} SPACE_COL_W={SPACE_COL_W} />
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* ── GRID BODY ── */}
      <div style={{ position: "relative", height: totalGridHeight }}>

        {/* Time labels + horizontal lines */}
        {timeLabels.map(mins => (
          <div key={mins} style={{ position: "absolute", top: minsToY(mins), left: 0, right: 0, display: "flex", alignItems: "flex-start", pointerEvents: "none" }}>
            <div style={{ width: TIME_LABEL_W, flexShrink: 0, paddingRight: 8, textAlign: "right" }}>
              <span style={{ fontSize: 9, color: B.textSecond, fontFamily: "'DM Mono', monospace" }}>{toHHMM(mins)}</span>
            </div>
            <div style={{ flex: 1, borderTop: mins % 60 === 0 ? `1px solid ${B.border}` : `1px dashed ${B.textDim}22`, marginTop: 0 }} />
          </div>
        ))}

        {/* Hall columns + drop zones */}
        <div style={{ position: "absolute", top: 0, left: TIME_LABEL_W, right: 0, bottom: 0, display: "flex" }}>
          {halls.map((hall, hallIndex) => {
            const isCollapsed = collapsed[hall.id];
            if (isCollapsed) return <div key={hall.id} style={{ width: 32, flexShrink: 0, borderLeft: `2px solid ${B.border}` }} />;
            if (hall.id === "hall-1") {
              const hall1MorningCols = hall.columns.filter(c => c.id === "main-stage");
              const hall1AfternoonCols = hall.columns.filter(c => c.id.startsWith("roundtables-"));
              const mainStageEndY = minsToY(HALL1_MAIN_STAGE_END);
              const lunchEndY = minsToY(HALL1_LUNCH_END);
              const morningHeight = mainStageEndY;
              const lunchHeight = lunchEndY - mainStageEndY;
              const afternoonHeight = totalGridHeight - lunchEndY;
              const hall1Width = hall1AfternoonCols.length * SPACE_COL_W;
              const hall1LunchBlocks = dayBlocks.filter(b => b.spaceId === "hall-1");
              return (
                <div key={hall.id} style={{ display: "flex", flexDirection: "column", borderLeft: `2px solid ${B.border}` }}>
                  {/* 08:45–12:35: Main Stage (same width as 5 roundtables) */}
                  <div style={{ height: morningHeight, display: "flex" }}>
                    {hall1MorningCols.map(column => (
                      <SpaceColumn
                        key={column.id}
                        space={column}
                        day={day}
                        mode={mode}
                        width={hall1Width}
                        totalHeight={morningHeight}
                        stripStartMins={TIME_START}
                        stripEndMins={HALL1_MAIN_STAGE_END}
                        sessions={sessions}
                        speakers={speakers}
                        daySlots={daySlots.filter(s => s.spaceId === column.id)}
                        dayBlocks={dayBlocks.filter(b => b.spaceId === column.id)}
                        dragging={dragging}
                        hoverCell={hoverCell}
                        setHoverCell={setHoverCell}
                        onDrop={onDrop}
                        onRemoveSlot={onRemoveSlot}
                        onRemoveBlock={onRemoveBlock}
                        onDragStart={onDragStart}
                        onDragEnd={onDragEnd}
                        onBlockDragStart={onBlockDragStart}
                        onResizeStart={onResizeStart}
                        getSlotClashes={(slotId) => clashes.filter(c => c.slotId === slotId)}
                        onEditSession={onEditSession}
                        onEditBlock={onEditBlock}
                        onLockSession={onLockSession}
                      />
                    ))}
                  </div>
                  {/* 12:35–14:00: Lunch full-width overlay (venue-wide, not a Main Stage session) */}
                  {lunchHeight > 0 && hall1LunchBlocks.map(block => {
                    const p = BLOCK_PALETTE.find(x => x.type === block.type) || BLOCK_PALETTE[0];
                    return (
                      <div
                        key={block.id}
                        style={{
                          height: lunchHeight,
                          width: hall1Width,
                          background: p.color,
                          borderTop: `2px solid ${p.borderColor}`,
                          borderBottom: `1px solid ${p.borderColor}30`,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          flexShrink: 0,
                        }}
                      >
                        <span style={{ fontSize: 11, color: p.textColor, textTransform: "uppercase", letterSpacing: "0.12em", fontWeight: 600, fontFamily: "'DM Mono', monospace" }}>{block.label}</span>
                      </div>
                    );
                  })}
                  {/* From 14:00: Roundtables 1–5 */}
                  <div style={{ height: afternoonHeight, display: "flex" }}>
                    {hall1AfternoonCols.map(column => (
                      <SpaceColumn
                        key={column.id}
                        space={column}
                        day={day}
                        mode={mode}
                        width={SPACE_COL_W}
                        totalHeight={afternoonHeight}
                        stripStartMins={HALL1_SPLIT_TIME}
                        stripEndMins={TIME_END}
                        sessions={sessions}
                        speakers={speakers}
                        daySlots={daySlots.filter(s => s.spaceId === column.id)}
                        dayBlocks={dayBlocks.filter(b => b.spaceId === column.id)}
                        dragging={dragging}
                        hoverCell={hoverCell}
                        setHoverCell={setHoverCell}
                        onDrop={onDrop}
                        onRemoveSlot={onRemoveSlot}
                        onRemoveBlock={onRemoveBlock}
                        onDragStart={onDragStart}
                        onDragEnd={onDragEnd}
                        onBlockDragStart={onBlockDragStart}
                        onResizeStart={onResizeStart}
                        getSlotClashes={(slotId) => clashes.filter(c => c.slotId === slotId)}
                        onEditSession={onEditSession}
                        onEditBlock={onEditBlock}
                        onLockSession={onLockSession}
                      />
                    ))}
                  </div>
                </div>
              );
            }
            return (
              <div key={hall.id} style={{ display: "flex", borderLeft: hallIndex === 0 ? `2px solid ${B.border}` : `4px solid ${B.border}` }}>
                {hall.columns.map(column => (
                  <SpaceColumn
                    key={column.id}
                    space={column}
                    day={day}
                    mode={mode}
                    width={SPACE_COL_W}
                    totalHeight={totalGridHeight}
                    sessions={sessions}
                    speakers={speakers}
                    daySlots={daySlots.filter(s => s.spaceId === column.id)}
                    dayBlocks={dayBlocks.filter(b => b.spaceId === column.id)}
                    dragging={dragging}
                    hoverCell={hoverCell}
                    setHoverCell={setHoverCell}
                    onDrop={onDrop}
                    onRemoveSlot={onRemoveSlot}
                    onRemoveBlock={onRemoveBlock}
                    onDragStart={onDragStart}
                    onDragEnd={onDragEnd}
                    onBlockDragStart={onBlockDragStart}
                    onResizeStart={onResizeStart}
                    getSlotClashes={(slotId) => clashes.filter(c => c.slotId === slotId)}
                    onEditSession={onEditSession}
                    onEditBlock={onEditBlock}
                    onLockSession={onLockSession}
                  />
                ))}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── SPACE COLUMN ─────────────────────────────────────────────────────────────

function SpaceColumn({ space, day, mode, width, totalHeight, stripStartMins, stripEndMins, sessions, speakers, daySlots, dayBlocks, dragging, hoverCell, setHoverCell, onDrop, onRemoveSlot, onRemoveBlock, onDragStart, onDragEnd, onBlockDragStart, onResizeStart, getSlotClashes, onEditSession, onEditBlock, onLockSession }) {
  const isHoveredSpace = hoverCell?.spaceId === space.id;
  const inStrip = (startMins, endMins) => {
    if (stripStartMins == null || stripEndMins == null) return true;
    return endMins > stripStartMins && startMins < stripEndMins;
  };
  const stripOffsetY = stripStartMins != null ? minsToY(stripStartMins) : 0;
  const filteredSlots = stripStartMins != null ? daySlots.filter(slot => {
    const sess = sessions.find(x => x.id === slot.sessionId);
    if (!sess) return false;
    const start = toMins(slot.startTime);
    return inStrip(start, start + sess.durationMins);
  }) : daySlots;
  const filteredBlocks = stripStartMins != null ? dayBlocks.filter(block => {
    const start = toMins(block.startTime);
    return inStrip(start, start + block.durationMins);
  }) : dayBlocks;

  const handleMouseMove = useCallback((e) => {
    if (!dragging || mode !== "build") return;
    const rect = e.currentTarget.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const baseMins = stripStartMins != null ? stripStartMins : TIME_START;
    setHoverCell({ spaceId: space.id, timeMins: baseMins + y / PX_PER_MIN });
  }, [dragging, mode, space.id, stripStartMins, setHoverCell]);

  const handleDrop = (e) => {
    e.preventDefault();
    if (!hoverCell || hoverCell.spaceId !== space.id) return;
    onDrop(space.id, hoverCell.timeMins);
  };

  const SNAP = 5;

  // Inactive regions: before openFrom and after openUntil (track hours), in strip coords when strip is set
  const openMins = space.openFrom != null ? toMins(space.openFrom) : TIME_START;
  const closeMins = space.openUntil != null ? toMins(space.openUntil) : TIME_END;
  const stripY = (mins) => stripStartMins != null ? minsToY(mins) - stripOffsetY : minsToY(mins);
  const topInactiveH = Math.max(0, stripY(openMins));
  const bottomInactiveTop = stripY(closeMins);
  const bottomInactiveH = Math.max(0, totalHeight - bottomInactiveTop);

  return (
    <div
      style={{ width, flexShrink: 0, position: "relative", height: totalHeight, borderLeft: `1px solid ${B.border}`, background: isHoveredSpace && dragging ? `${space.color}08` : "transparent", transition: "background 0.1s" }}
      onDragOver={(e) => { e.preventDefault(); handleMouseMove(e); }}
      onDragLeave={() => { if (hoverCell?.spaceId === space.id) setHoverCell(null); }}
      onDrop={handleDrop}
      onMouseMove={handleMouseMove}
    >
      {/* Inactive regions (track closed outside openFrom–openUntil) */}
      {topInactiveH > 0 && (
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: topInactiveH, background: B.bgDeep, opacity: 0.85, pointerEvents: "none", zIndex: 1 }} />
      )}
      {bottomInactiveH > 0 && (
        <div style={{ position: "absolute", top: bottomInactiveTop, left: 0, right: 0, height: bottomInactiveH, background: B.bgDeep, opacity: 0.85, pointerEvents: "none", zIndex: 1 }} />
      )}
      {/* ── BLOCKS (structural + transitions) ── */}
      {filteredBlocks.map(block => {
        const p = BLOCK_PALETTE.find(x => x.type === block.type) || BLOCK_PALETTE[0];
        const startMinsBlock = toMins(block.startTime);
        const top  = stripY(startMinsBlock);
        const h    = durationToPx(block.durationMins);
        const startMins = startMinsBlock;
        const endMins   = startMins + block.durationMins;
        const isBeingResized = false; // visual only
        return (
          <div
            key={block.id}
            className="block-item"
            draggable={mode === "build"}
            onDragStart={(e) => { e.stopPropagation(); onBlockDragStart(block, false); }}
            onDragEnd={onDragEnd}
            onClick={mode === "build" && onEditBlock ? (e) => { e.stopPropagation(); onEditBlock(block); } : undefined}
            style={{
              position: "absolute", top, left: 0, right: 0, height: h,
              background: p.color,
              borderTop: `2px solid ${p.borderColor}`,
              borderBottom: `1px solid ${p.borderColor}30`,
              display: "flex", flexDirection: "column",
              overflow: "hidden", zIndex: 3,
              cursor: mode === "build" ? "grab" : "default",
            }}
          >
            {/* Content */}
            <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "2px 6px", pointerEvents: "none" }}>
              {h > 20 && (
                <span style={{ fontSize: h > 30 ? 9 : 8, color: p.textColor, textTransform: "uppercase", letterSpacing: "0.12em", fontWeight: 600, fontFamily: "'DM Mono', monospace", textAlign: "center" }}>
                  {block.label}
                  {h > 28 && <span style={{ display: "block", fontSize: 8, opacity: 0.6, marginTop: 1 }}>{toHHMM(startMins)}–{toHHMM(endMins)}</span>}
                </span>
              )}
            </div>
            {/* Resize handles */}
            {mode === "build" && (
              <>
                <div className="resize-handle" onMouseDown={(e) => onResizeStart(e, "block", block.id, "top", startMins, block.durationMins)} onClick={(e) => e.stopPropagation()}
                  style={{ position: "absolute", top: 0, left: 0, right: 0, height: 6, cursor: "ns-resize", background: `${p.borderColor}40`, zIndex: 10 }} />
                <div className="resize-handle" onMouseDown={(e) => onResizeStart(e, "block", block.id, "bottom", startMins, block.durationMins)} onClick={(e) => e.stopPropagation()}
                  style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 6, cursor: "ns-resize", background: `${p.borderColor}40`, zIndex: 10 }} />
                {h > 28 && (
                  <button onClick={(e) => { e.stopPropagation(); onRemoveBlock(block.id); }}
                    style={{ position: "absolute", top: 3, right: 4, background: "none", border: "none", color: `${p.textColor}60`, cursor: "pointer", fontSize: 9, padding: 0, zIndex: 10 }}>✕</button>
                )}
              </>
            )}
          </div>
        );
      })}

      {/* ── SESSION BLOCKS ── */}
      {filteredSlots.map(slot => {
        const session = sessions.find(s => s.id === slot.sessionId);
        if (!session) return null;
        const startMins = toMins(slot.startTime);
        const endMins   = startMins + session.durationMins;
        const top  = stripY(startMins);
        const h    = Math.max(durationToPx(session.durationMins), 22);
        // Single source of truth for card appearance: 'placeholder' | 'pencilled' | 'confirmed'
        const sessionStatus = session.sessionStatus ?? (session.placeholder ? "placeholder" : (session.lockStatus === "confirmed" ? "confirmed" : "pencilled"));
        const isPlaceholder = sessionStatus === "placeholder";
        const isPencilled = sessionStatus === "pencilled";
        const isConfirmed = sessionStatus === "confirmed";
        const tc = TRACK_COLORS[session.track] || TRACK_COLORS["Other"];
        const slotClashes = getSlotClashes(slot.id);
        const hasBlock    = slotClashes.some(c => c.severity === "block");
        const hasWarn     = slotClashes.some(c => c.severity === "warn");
        const stageColor = space.color || tc.border;
        const borderColor = hasBlock ? B.red : hasWarn ? B.amber : isPlaceholder ? "#00B97A40" : stageColor;
        const sessionSpeakers = session.speakerIds.map(id => speakers.find(s => s.id === id)).filter(Boolean);
        const cardBg = hasBlock ? "#1c0404" : sessionStatus === "placeholder" ? "#0d3d3a" : stageColor;
        const cardText = sessionStatus === "placeholder" ? "#D6FEFC" : (isLightColor(stageColor) ? "#0B3135" : "#FFFFFF");
        const cardTextMuted = sessionStatus === "placeholder" ? "#D6FEFC99" : (cardText === "#0B3135" ? "#0B313599" : "#FFFFFF99");
        const confirmedGlow = stageColor.startsWith("rgba") ? `0 0 14px ${stageColor.replace(/[\d.]+\)$/, "0.6)")}` : `0 0 14px ${stageColor}60`;
        const sessionTags = Array.isArray(session.tags) ? session.tags : [];
        const topicTags = sessionTags.filter(t => TOPIC_TAGS.includes(t));
        const formatTags = sessionTags.filter(t => FORMAT_TAGS.includes(t));
        const durMins = session.durationMins;
        const showTopicTags = durMins >= 20;
        const showTopicText = durMins >= 45;
        const showFormatTags = (slot.spaceId === "main-stage" || slot.spaceId === "startup") && formatTags.length > 0;

        return (
          <div
            key={slot.id}
            className="session-item"
            draggable={mode === "build"}
            onDragStart={(e) => { e.stopPropagation(); onDragStart(session, slot.id); }}
            onDragEnd={onDragEnd}
            onClick={() => mode === "build" && onEditSession(session)}
            style={{
              position: "absolute", top, left: 1, right: 1, height: h,
              background: cardBg,
              border: `1px solid ${borderColor}`,
              borderLeft: `3px solid ${borderColor}`,
              borderRadius: 3, overflow: "hidden",
              cursor: mode === "build" ? "grab" : "default",
              zIndex: 5,
              boxShadow: hasBlock ? `0 0 0 1px ${B.red}` : isConfirmed ? confirmedGlow : "none",
              opacity: isPlaceholder ? 0.9 : 1,
            }}
            title={slotClashes.map(c => c.message).join("\n")}
          >
            {/* Pencilled: overlay above background, below content (z-index 5); content at 10 so text stays readable */}
            {sessionStatus === "pencilled" && (
              <div style={{ position: "absolute", inset: 0, background: "rgba(11,49,53,0.55)", pointerEvents: "none", zIndex: 5 }} />
            )}
            {/* Time — top line (above overlay) */}
            <div style={{ position: "relative", zIndex: 10, padding: "4px 6px 0", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: borderColor, fontFamily: "'DM Mono', monospace", letterSpacing: "0.05em" }}>
                {toHHMM(startMins)}–{toHHMM(endMins)}
              </span>
              {hasBlock && <span style={{ fontSize: 9, color: B.red }}>🚫</span>}
              {!hasBlock && hasWarn && <span style={{ fontSize: 9 }}>⚠</span>}
              {mode === "build" && isPencilled && onLockSession && (
                <button onClick={(e) => { e.stopPropagation(); onLockSession(session); }} title="Lock session (confirmed)"
                  style={{ background: "rgba(0,0,0,0.3)", border: "none", cursor: "pointer", fontSize: 10, color: B.greenText, padding: "2px 6px", borderRadius: 3, marginRight: 2 }}>🔒 Lock</button>
              )}
              {mode === "build" && h > 40 && !isPlaceholder && (
                <button onClick={(e) => { e.stopPropagation(); onRemoveSlot(slot.id); }}
                  style={{ background: "none", border: "none", cursor: "pointer", fontSize: 9, color: `${cardText}50`, padding: 0 }}>✕</button>
              )}
            </div>
            {/* Title (all caps), speaker, duration, tags — above overlay (z-index 10) */}
            <div style={{ position: "relative", zIndex: 10, flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", padding: "4px 6px 6px", paddingLeft: session.chathamHouse ? 10 : 6 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: cardText, opacity: sessionStatus === "placeholder" ? 0.5 : 1, lineHeight: 1.25, fontFamily: "'DM Sans', sans-serif", textTransform: "uppercase", letterSpacing: "0.02em", marginBottom: 2 }}>
                {session.title}
              </div>
              {sessionSpeakers.length > 0 && !isPlaceholder && (
                <div style={{ fontSize: 11, color: cardTextMuted, marginBottom: 2 }}>
                  {sessionSpeakers.map(s => s.fullName).join(", ")}
                </div>
              )}
              <div style={{ fontSize: 10, color: cardTextMuted, fontFamily: "'DM Mono', monospace", marginBottom: (showTopicTags || showFormatTags) ? 4 : 0 }}>
                {session.durationMins} min
              </div>
              {(showTopicTags && topicTags.length > 0) && (
                <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 4 }}>
                  {topicTags.slice(0, 8).map(tag => (
                    <span key={tag} style={{ display: "inline-flex", alignItems: "center", gap: 3 }}>
                      <span style={{ width: 6, height: 6, borderRadius: "50%", background: TOPIC_TAG_COLORS[tag] || "#64748b", flexShrink: 0 }} />
                      {showTopicText && <span style={{ fontSize: 9, color: cardText }}>{tag}</span>}
                    </span>
                  ))}
                  {topicTags.length > 8 && <span style={{ fontSize: 8, color: cardTextMuted }}>+{topicTags.length - 8}</span>}
                </div>
              )}
              {showFormatTags && (
                <div style={{ fontSize: 9, fontStyle: "italic", color: cardTextMuted, marginTop: 2 }}>
                  {formatTags.map(t => t.toLowerCase()).join(" · ")}
                </div>
              )}
            </div>
            {session.chathamHouse && <div style={{ position: "absolute", top: 3, left: 5, width: 4, height: 4, borderRadius: "50%", background: "#8b5cf6", zIndex: 10 }} title="Chatham House" />}
            {/* Resize handles (above overlay) */}
            {mode === "build" && (
              <>
                <div className="resize-handle" onMouseDown={(e) => onResizeStart(e, "session", slot.id, "top", startMins, session.durationMins)}
                  style={{ position: "absolute", top: 0, left: 0, right: 0, height: 5, cursor: "ns-resize", background: `${borderColor}30`, zIndex: 10 }} />
                <div className="resize-handle" onMouseDown={(e) => onResizeStart(e, "session", slot.id, "bottom", startMins, session.durationMins)}
                  style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 5, cursor: "ns-resize", background: `${borderColor}30`, zIndex: 10 }} />
              </>
            )}
          </div>
        );
      })}

      {/* ── DROP INDICATOR ── */}
      {isHoveredSpace && dragging && hoverCell && (() => {
        const snapped = Math.round(hoverCell.timeMins / 5) * 5;
        const durMins = dragging.type === "block" ? dragging.block.durationMins : dragging.session?.durationMins || 30;
        return (
          <div style={{
            position: "absolute",
            top: minsToY(snapped),
            left: 2, right: 2,
            height: durationToPx(durMins),
            border: `2px dashed ${B.cyan}`,
            borderRadius: 4,
            background: `${B.cyan}10`,
            pointerEvents: "none",
            zIndex: 6,
          }}>
            <div style={{ position: "absolute", top: 2, left: 4, fontSize: 9, color: B.cyan, fontFamily: "'DM Mono', monospace" }}>
              {toHHMM(snapped)}
            </div>
          </div>
        );
      })()}
    </div>
  );
}

// ─── SIDEBAR SESSION CARD ─────────────────────────────────────────────────────

function SidebarSessionCard({ session, speakers, isDragging, onDragStart, onDragEnd, onClick }) {
  const tc = TRACK_COLORS[session.track] || TRACK_COLORS["Other"];
  const sessionSpeakers = session.speakerIds.map(id => speakers.find(s => s.id === id)).filter(Boolean);

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={onClick}
      style={{
        padding: "8px 10px",
        background: isDragging ? B.bgCard : tc.bg,
        border: `1px solid ${isDragging ? B.cyan : tc.border}`,
        borderLeft: `3px solid ${tc.border}`,
        borderRadius: 6, cursor: "grab",
        opacity: isDragging ? 0.5 : 1,
        transition: "all 0.1s",
      }}
    >
      <div style={{ fontSize: 11, fontWeight: 600, color: tc.text, fontFamily: "'DM Sans', sans-serif", lineHeight: 1.3, marginBottom: 3 }}>{session.title}</div>
      {sessionSpeakers.length > 0 && (
        <div style={{ fontSize: 10, color: B.textSecond }}>{sessionSpeakers.map(s => s.fullName).join(", ")}</div>
      )}
      <div style={{ display: "flex", gap: 5, marginTop: 5, flexWrap: "wrap" }}>
        <Tag color={tc.border + "30"} textColor={tc.text}>{session.track}</Tag>
        <Tag color={B.bgCard} textColor={B.textSecond}>{session.durationMins}m</Tag>
        <Tag color={B.bgCard} textColor={B.textSecond}>{session.format}</Tag>
        {session.status === "draft" && <Tag color="#1a1400" textColor={B.amber}>draft</Tag>}
        {session.chathamHouse && <Tag color="#1a0d35" textColor="#a78bfa">chatham</Tag>}
      </div>
    </div>
  );
}

// ─── HEALTH PANEL ─────────────────────────────────────────────────────────────

function HealthPanel({ sessions, slots, speakers, clashes }) {
  const confirmedSessions  = sessions.filter(s => s.status === "confirmed");
  const scheduledIds       = new Set(slots.map(s => s.sessionId));
  const unscheduled        = confirmedSessions.filter(s => !scheduledIds.has(s.id));
  const unconfirmedOnSched = slots.filter(slot => {
    const sess = sessions.find(s => s.id === slot.sessionId);
    if (!sess) return false;
    return sess.speakerIds.some(id => {
      const sp = speakers.find(s => s.id === id);
      return sp && sp.status !== "confirmed";
    });
  });

  const blocks = clashes.filter(c => c.severity === "block");
  const warns  = clashes.filter(c => c.severity === "warn");

  const items = [
    { icon: "📅", label: "Sessions scheduled",      value: `${slots.length} / ${sessions.filter(s=>s.status!=="cancelled").length}`, ok: true },
    { icon: "🚫", label: "Hard clashes",             value: blocks.length,      ok: blocks.length === 0 },
    { icon: "⚠️", label: "Warnings",                value: warns.length,       ok: warns.length === 0 },
    { icon: "👤", label: "Unconfirmed on schedule",  value: unconfirmedOnSched.length, ok: unconfirmedOnSched.length === 0 },
    { icon: "📋", label: "Confirmed + unscheduled",  value: unscheduled.length, ok: unscheduled.length === 0 },
  ];

  return (
    <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 8 }}>
      {items.map(item => (
        <div key={item.label} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", background: B.bg, border: `1px solid ${item.ok ? B.border : "#3a1010"}`, borderRadius: 6 }}>
          <span style={{ fontSize: 14 }}>{item.icon}</span>
          <span style={{ flex: 1, fontSize: 11, color: B.textSecond }}>{item.label}</span>
          <span style={{ fontSize: 13, fontWeight: 600, color: item.ok ? B.green : B.red, fontFamily: "'Rajdhani', sans-serif" }}>{item.value}</span>
        </div>
      ))}
      {blocks.length > 0 && (
        <div style={{ marginTop: 4 }}>
          <div style={{ fontSize: 10, color: B.textDim, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>Clashes</div>
          {blocks.map((c, i) => (
            <div key={i} style={{ fontSize: 10, color: "#fca5a5", padding: "4px 8px", background: "#1c0404", borderRadius: 4, marginBottom: 3 }}>🚫 {c.message}</div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── BLOCK DURATION MODAL ────────────────────────────────────────────────────

function BlockDurationModal({ block, onSave, onClose }) {
  const [durationInput, setDurationInput] = useState(String(block?.durationMins ?? 5));
  const [error, setError] = useState(null);

  const handleSave = () => {
    const n = parseInt(durationInput, 10);
    if (Number.isNaN(n) || n < 1) {
      setError("Enter a duration of at least 1 minute.");
      return;
    }
    setError(null);
    onSave(n);
    onClose();
  };

  if (!block) return null;
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }} onClick={onClose}>
      <div style={{ background: "#1a1a1a", padding: 20, borderRadius: 8, minWidth: 280, boxShadow: "0 8px 24px rgba(0,0,0,0.4)" }} onClick={e => e.stopPropagation()}>
        <div style={{ marginBottom: 12, fontWeight: 600, color: "#e0e0e0" }}>Edit block: {block.label}</div>
        <div style={{ marginBottom: 8 }}>
          <label style={{ display: "block", fontSize: 12, color: "#999", marginBottom: 4 }}>Duration (minutes)</label>
          <input
            type="number"
            min={1}
            value={durationInput}
            onChange={e => { setDurationInput(e.target.value); setError(null); }}
            style={{ width: "100%", padding: "8px 10px", background: "#2a2a2a", border: "1px solid #444", borderRadius: 4, color: "#fff", fontSize: 14 }}
          />
        </div>
        {error && <div style={{ fontSize: 12, color: "#e57373", marginBottom: 8 }}>{error}</div>}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button type="button" onClick={onClose} style={{ padding: "8px 14px", background: "#333", border: "none", borderRadius: 4, color: "#ccc", cursor: "pointer" }}>Cancel</button>
          <button type="button" onClick={handleSave} style={{ padding: "8px 14px", background: "#4a7c59", border: "none", borderRadius: 4, color: "#fff", cursor: "pointer" }}>Save</button>
        </div>
      </div>
    </div>
  );
}

// ─── SESSION FORM MODAL (create + edit) ──────────────────────────────────────

function SessionFormModal({ mode, session, speakers, currentSpaceId, onSave, onClose }) {
  const isCreate = mode === "create";
  const showFormatTagPicker = currentSpaceId === "main-stage" || currentSpaceId === "startup";
  const [form, setForm] = useState(session ? { ...session, tags: session.tags ?? [], lockStatus: session.lockStatus ?? "pencilled", sessionStatus: session.sessionStatus ?? (session.placeholder ? "placeholder" : (session.lockStatus === "confirmed" ? "confirmed" : "pencilled")) } : {
    title: "", description: "", format: "fireside", durationMins: 30,
    track: "Strategy", speakerIds: [], moderatorId: null,
    status: "confirmed", chathamHouse: false, dayConstraint: null, spaceConstraint: null,
    tags: [], lockStatus: "pencilled", sessionStatus: "pencilled",
  });
  const [speakerSearch, setSpeakerSearch]     = useState("");
  const [moderatorSearch, setModeratorSearch] = useState("");
  const [showSpeakerDrop, setShowSpeakerDrop] = useState(false);
  const [showModDrop, setShowModDrop]         = useState(false);

  const confirmedSpeakers = speakers.filter(s => s.status === "confirmed");

  const filteredForSpeaker = confirmedSpeakers.filter(s =>
    !form.speakerIds.includes(s.id) &&
    (s.fullName.toLowerCase().includes(speakerSearch.toLowerCase()) ||
     s.company.toLowerCase().includes(speakerSearch.toLowerCase()))
  );

  const filteredForMod = confirmedSpeakers.filter(s =>
    s.fullName.toLowerCase().includes(moderatorSearch.toLowerCase()) ||
    s.company.toLowerCase().includes(moderatorSearch.toLowerCase())
  );

  const addSpeaker = (id) => {
    setForm(p => ({ ...p, speakerIds: [...p.speakerIds, id] }));
    setSpeakerSearch("");
    setShowSpeakerDrop(false);
  };

  const removeSpeaker = (id) => setForm(p => ({ ...p, speakerIds: p.speakerIds.filter(s => s !== id) }));

  const toggleTag = (tag) => setForm(p => ({
    ...p,
    tags: p.tags.includes(tag) ? p.tags.filter(t => t !== tag) : [...p.tags, tag],
  }));

  const setModerator = (id) => {
    setForm(p => ({ ...p, moderatorId: id || null }));
    setModeratorSearch(id ? (confirmedSpeakers.find(s => s.id === id)?.fullName || "") : "");
    setShowModDrop(false);
  };

  const canSave = form.title.trim().length > 0;

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(7,16,32,0.9)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }} onClick={onClose}>
      <div style={{ background: B.bgCard, border: `1px solid ${B.border}`, borderTop: `2px solid ${B.cyan}`, borderRadius: 12, padding: 24, width: 520, maxHeight: "88vh", overflowY: "auto", boxShadow: `0 32px 80px rgba(0,0,0,0.7), 0 0 60px ${B.cyan}10` }} onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
          <div style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 700, fontSize: 16, color: B.textPrimary, letterSpacing: "0.03em" }}>
            {isCreate ? "New Session" : "Edit Session"}
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: B.textDim, cursor: "pointer", fontSize: 16, padding: 0 }}>✕</button>
        </div>

        {/* Title */}
        <Field label="Session Title">
          <input
            autoFocus
            value={form.title}
            onChange={e => setForm(p => ({ ...p, title: e.target.value }))}
            placeholder="e.g. The Future of Cross-Border Payments"
            style={inputStyle}
          />
        </Field>

        {/* Description */}
        <Field label="Description / Thesis">
          <textarea
            value={form.description}
            onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
            placeholder="What's the core argument or story? What will the audience take away?"
            rows={3}
            style={{ ...inputStyle, resize: "vertical" }}
          />
        </Field>

        {/* Speakers */}
        <Field label={`Speakers (${form.speakerIds.length})`}>
          {/* Selected speakers */}
          {form.speakerIds.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
              {form.speakerIds.map(id => {
                const sp = speakers.find(s => s.id === id);
                if (!sp) return null;
                const tc = TRACK_COLORS[sp.status === "confirmed" ? "Strategy" : "Other"];
                return (
                  <div key={id} style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 8px 4px 10px", background: B.bg, border: `1px solid ${B.border}`, borderRadius: 20, fontSize: 11, color: B.textSecond }}>
                    <span style={{ color: B.textPrimary, fontFamily: "'DM Sans', sans-serif", fontWeight: 500 }}>{sp.fullName}</span>
                    <span style={{ color: B.textDim }}>·</span>
                    <span>{sp.company}</span>
                    <button onClick={() => removeSpeaker(id)} style={{ background: "none", border: "none", color: B.textDim, cursor: "pointer", fontSize: 12, padding: 0, lineHeight: 1, marginLeft: 2 }}>✕</button>
                  </div>
                );
              })}
            </div>
          )}
          {/* Search input */}
          <div style={{ position: "relative" }}>
            <input
              value={speakerSearch}
              onChange={e => { setSpeakerSearch(e.target.value); setShowSpeakerDrop(true); }}
              onFocus={() => setShowSpeakerDrop(true)}
              placeholder="Search confirmed speakers..."
              style={{ ...inputStyle, paddingLeft: 30 }}
            />
            <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", fontSize: 11, color: "#334155" }}>⌕</span>
            {showSpeakerDrop && filteredForSpeaker.length > 0 && (
              <div style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, background: B.bgCard, border: `1px solid ${B.border}`, borderRadius: 7, zIndex: 10, maxHeight: 180, overflowY: "auto", boxShadow: `0 8px 24px rgba(0,0,0,0.5)` }}>
                {filteredForSpeaker.map(sp => (
                  <div key={sp.id} onClick={() => addSpeaker(sp.id)} style={{ padding: "8px 12px", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: `1px solid ${B.border}` }}
                    onMouseEnter={e => e.currentTarget.style.background = B.bg}
                    onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                    <div>
                      <div style={{ fontSize: 12, color: B.textPrimary, fontFamily: "'DM Sans', sans-serif", fontWeight: 500 }}>{sp.fullName}</div>
                      <div style={{ fontSize: 10, color: B.textSecond }}>{sp.title} · {sp.company}</div>
                    </div>
                    <span style={{ fontSize: 10, padding: "2px 7px", borderRadius: 4, background: `${B.green}20`, color: B.greenText }}>+ add</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Field>

        {/* Moderator */}
        <Field label="Moderator (optional)">
          <div style={{ position: "relative" }}>
            <input
              value={form.moderatorId ? (speakers.find(s => s.id === form.moderatorId)?.fullName || "") : moderatorSearch}
              onChange={e => { setModeratorSearch(e.target.value); setForm(p => ({ ...p, moderatorId: null })); setShowModDrop(true); }}
              onFocus={() => setShowModDrop(true)}
              placeholder="Search for moderator..."
              style={{ ...inputStyle, paddingLeft: 30 }}
            />
            <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", fontSize: 11, color: "#334155" }}>⌕</span>
            {form.moderatorId && (
              <button onClick={() => setModerator(null)} style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: "#475569", cursor: "pointer", fontSize: 12 }}>✕</button>
            )}
            {showModDrop && !form.moderatorId && filteredForMod.length > 0 && (
              <div style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, background: B.bgCard, border: `1px solid ${B.border}`, borderRadius: 7, zIndex: 10, maxHeight: 160, overflowY: "auto", boxShadow: `0 8px 24px rgba(0,0,0,0.5)` }}>
                {filteredForMod.filter(s => moderatorSearch === "" || s.fullName.toLowerCase().includes(moderatorSearch.toLowerCase()) || s.company.toLowerCase().includes(moderatorSearch.toLowerCase())).map(sp => (
                  <div key={sp.id} onClick={() => setModerator(sp.id)} style={{ padding: "8px 12px", cursor: "pointer", borderBottom: `1px solid ${B.border}` }}
                    onMouseEnter={e => e.currentTarget.style.background = B.bg}
                    onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                    <div style={{ fontSize: 12, color: B.textPrimary, fontFamily: "'DM Sans', sans-serif", fontWeight: 500 }}>{sp.fullName}</div>
                    <div style={{ fontSize: 10, color: B.textSecond }}>{sp.title} · {sp.company}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Field>

        {/* Tags — Topic (always) + Format (Main Stage & Startup Stage only) */}
        <Field label="Tags">
          <div style={{ marginBottom: 6 }}>
            <div style={{ fontSize: 10, color: B.textDim, marginBottom: 4 }}>Topic</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {TOPIC_TAGS.map(tag => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => toggleTag(tag)}
                  style={{
                    padding: "4px 8px", borderRadius: 4, border: `1px solid ${form.tags.includes(tag) ? B.cyan : B.border}`,
                    background: form.tags.includes(tag) ? B.cyanDim : B.bg, color: form.tags.includes(tag) ? B.cyan : B.textSecond,
                    fontSize: 10, cursor: "pointer", fontFamily: "'DM Sans', sans-serif",
                  }}>
                  {tag}
                </button>
              ))}
            </div>
          </div>
          {showFormatTagPicker && (
            <div>
              <div style={{ fontSize: 10, color: B.textDim, marginBottom: 4 }}>Format (Main Stage & Startup only)</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {FORMAT_TAGS.map(tag => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => toggleTag(tag)}
                    style={{
                      padding: "4px 8px", borderRadius: 4, border: `1px solid ${form.tags.includes(tag) ? B.cyan : B.border}`,
                      background: form.tags.includes(tag) ? B.cyanDim : B.bg, color: form.tags.includes(tag) ? B.cyan : B.textSecond,
                      fontSize: 10, cursor: "pointer", fontFamily: "'DM Sans', sans-serif",
                    }}>
                    {tag}
                  </button>
                ))}
              </div>
            </div>
          )}
        </Field>

        {/* Format + Track + Status row */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 12 }}>
          {[
            { key: "format", label: "Format",   options: SESSION_FORMATS },
            { key: "track",  label: "Track",    options: Object.keys(TRACK_COLORS) },
            { key: "status", label: "Status",   options: ["idea","draft","confirmed","cancelled"] },
          ].map(f => (
            <Field key={f.key} label={f.label} noMargin>
              <select value={form[f.key] || ""} onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))} style={selectStyle}>
                {f.options.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            </Field>
          ))}
        </div>
        {/* Session status: drives card colour (placeholder / pencilled / confirmed) */}
        {!isCreate && (
          <Field label="Session status">
            <select
              value={form.sessionStatus || (form.placeholder ? "placeholder" : (form.lockStatus === "confirmed" ? "confirmed" : "pencilled"))}
              onChange={e => {
                const v = e.target.value;
                setForm(p => ({ ...p, sessionStatus: v, lockStatus: v === "confirmed" ? "confirmed" : "pencilled", placeholder: v === "placeholder" }));
              }}
              style={selectStyle}>
              <option value="placeholder">Placeholder (grey, no speaker)</option>
              <option value="pencilled">Pencilled (stage colour + overlay)</option>
              <option value="confirmed">Confirmed (full colour, locked)</option>
            </select>
          </Field>
        )}

        {/* Duration + Day constraint row */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
          <Field label="Duration" noMargin>
            <select value={form.durationMins} onChange={e => setForm(p => ({ ...p, durationMins: Number(e.target.value) }))} style={selectStyle}>
              {[15,20,25,30,40,45,60,75,90,120].map(d => <option key={d} value={d}>{d} min</option>)}
            </select>
          </Field>
          <Field label="Day constraint" noMargin>
            <select value={form.dayConstraint || ""} onChange={e => setForm(p => ({ ...p, dayConstraint: e.target.value || null }))} style={selectStyle}>
              <option value="">Either day</option>
              <option value="day1">Day 1 only</option>
              <option value="day2">Day 2 only</option>
            </select>
          </Field>
        </div>

        {/* Chatham House */}
        <label style={{ display: "flex", gap: 9, alignItems: "center", marginBottom: 20, cursor: "pointer", padding: "8px 10px", background: form.chathamHouse ? "#1a0d35" : B.bg, border: `1px solid ${form.chathamHouse ? "#7c3aed" : B.border}`, borderRadius: 6, transition: "all 0.15s" }}>
          <input type="checkbox" checked={form.chathamHouse} onChange={e => setForm(p => ({ ...p, chathamHouse: e.target.checked }))} />
          <div>
            <div style={{ fontSize: 11, color: form.chathamHouse ? "#c4b5fd" : B.textSecond, fontWeight: 500 }}>Chatham House rules</div>
            <div style={{ fontSize: 10, color: B.textDim, marginTop: 1 }}>Session is off the record — description will be hidden publicly</div>
          </div>
        </label>

        {/* Footer */}
        <div style={{ display: "flex", gap: 8, justifyContent: "space-between", alignItems: "center" }}>
          {!isCreate && (
            <div style={{ fontSize: 10, color: B.textDim }}>ID: {form.id}</div>
          )}
          <div style={{ display: "flex", gap: 8, marginLeft: "auto" }}>
            <button onClick={onClose} style={{ padding: "8px 16px", background: "transparent", border: `1px solid ${B.border}`, borderRadius: 6, color: B.textSecond, fontFamily: "'DM Mono', monospace", fontSize: 11, cursor: "pointer" }}>Cancel</button>
            <button
              onClick={() => canSave && onSave(form)}
              disabled={!canSave}
              style={{ padding: "8px 20px", background: canSave ? B.cyanDim : B.bg, border: `1px solid ${canSave ? B.cyan : B.border}`, borderRadius: 6, color: canSave ? B.cyan : B.textDim, fontFamily: "'DM Mono', monospace", fontSize: 11, cursor: canSave ? "pointer" : "not-allowed", transition: "all 0.15s", boxShadow: canSave ? `0 0 12px ${B.cyan}25` : "none" }}>
              {isCreate ? "Create Session" : "Save Changes"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// shared input styles
const inputStyle = {
  width: "100%", background: B.bg, border: `1px solid ${B.border}`,
  borderRadius: 6, padding: "8px 10px", color: B.textPrimary,
  fontFamily: "'DM Mono', monospace", fontSize: 11, outline: "none",
  boxSizing: "border-box",
};
const selectStyle = {
  ...inputStyle, cursor: "pointer",
};

function Field({ label, children, noMargin }) {
  return (
    <div style={{ marginBottom: noMargin ? 0 : 12 }}>
      <label style={{ display: "block", fontSize: 10, color: B.fieldLabel, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>{label}</label>
      {children}
    </div>
  );
}

// ─── UTILS ────────────────────────────────────────────────────────────────────

function Tag({ children, color, textColor }) {
  return (
    <span style={{ fontSize: 9, padding: "2px 6px", borderRadius: 3, background: color, color: textColor, whiteSpace: "nowrap" }}>{children}</span>
  );
}
