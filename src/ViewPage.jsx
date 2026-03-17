import React, { useState, useEffect, useMemo } from 'react';
import { createClient } from '@supabase/supabase-js';
import { TOPIC_TAGS, TOPIC_TAG_COLORS } from './stages.config.js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

const DAYS = [
  { id: 'day0', label: 'Day 0', date: 'Nov 18', full: '2026-11-18' },
  { id: 'day1', label: 'Day 1', date: 'Nov 19', full: '2026-11-19' },
  { id: 'day2', label: 'Day 2', date: 'Nov 20', full: '2026-11-20' },
];

const formatTime = (minutes) => {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const ampm = h >= 12 ? 'PM' : 'AM';
  const displayH = h > 12 ? h - 12 : h === 0 ? 12 : h;
  return `${displayH}:${m.toString().padStart(2, '0')} ${ampm}`;
};

const isoToMinutes = (iso) => {
  const time = iso.split('T')[1].substring(0, 5);
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
};

const BOOKMARKS_KEY = 'nerdcon-bookmarks';

const COLORS = {
  bg: '#020808',
  bgCard: '#0a1212',
  primary: '#0CEBF1',
  primaryDim: '#0CEBF133',
  accent: '#FFFBC9',
  accentDim: '#FFFBC933',
  textPrimary: '#e0f0f0',
  textMuted: '#4a6a6a',
  textDark: '#001a1a',
  border: '#0a2a2a',
  borderLight: '#1a3a3a',
};

const FONTS = {
  pixel: "'Press Start 2P', cursive",
  mono: "'Space Mono', monospace",
};

const loadBookmarks = () => {
  try {
    const stored = localStorage.getItem(BOOKMARKS_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
};

const saveBookmarks = (ids) => {
  localStorage.setItem(BOOKMARKS_KEY, JSON.stringify(ids));
};

// ── Mission Card ──────────────────────────────────────────────────────────────
function MissionCard({ session, speakerMap, stageMap, bookmarks, onToggleBookmark }) {
  const isBookmarked = bookmarks.includes(session.id);
  const [flashState, setFlashState] = useState(null); // 'added' for brief flash
  const stage = stageMap[session.stage_id];
  const sessionSpeakers = (session.speakers || [])
    .map(s => {
      if (typeof s === 'string') return { speaker: speakerMap[s], role: 'speaker' };
      return { speaker: speakerMap[s.speaker_id], role: s.role || 'speaker' };
    })
    .filter(e => e.speaker);
  const primaryTopic = session.topics?.[0];
  const topicColor = primaryTopic ? TOPIC_TAG_COLORS[primaryTopic] : COLORS.primary;

  return (
    <div
      style={{
        background: COLORS.bgCard,
        border: `1px solid ${COLORS.border}`,
        borderLeft: `3px solid ${topicColor}`,
        borderRadius: '4px',
        padding: '16px',
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        transition: 'border-color 0.15s, transform 0.15s',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.borderColor = COLORS.primary;
        e.currentTarget.style.transform = 'translateY(-2px)';
      }}
      onMouseLeave={e => {
        e.currentTarget.style.borderColor = COLORS.border;
        e.currentTarget.style.borderLeftColor = topicColor;
        e.currentTarget.style.transform = 'translateY(0)';
      }}
    >
      {/* Stage + Duration */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{
          fontFamily: FONTS.mono, fontSize: '10px',
          color: stage?.color || COLORS.primary,
          letterSpacing: '0.1em', textTransform: 'uppercase',
        }}>
          {stage?.name || 'TBD'}
        </span>
        <span style={{ fontFamily: FONTS.mono, fontSize: '10px', color: COLORS.textMuted }}>
          {session.duration_minutes} MIN
        </span>
      </div>

      {/* Title */}
      <h3 style={{
        fontFamily: FONTS.pixel, fontSize: '11px',
        color: COLORS.textPrimary, margin: 0,
        lineHeight: 1.6, letterSpacing: '0.05em',
        textTransform: 'uppercase',
      }}>
        {session.title}
      </h3>

      {/* Format badge */}
      <div>
        <span style={{
          fontFamily: FONTS.mono, fontSize: '9px',
          padding: '2px 8px', borderRadius: '2px',
          background: COLORS.primaryDim, color: COLORS.primary,
          letterSpacing: '0.05em', textTransform: 'uppercase',
        }}>
          {session.format || 'SESSION'}
        </span>
      </div>

      {/* Topics */}
      {session.topics?.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
          {session.topics.map(t => (
            <span key={t} style={{
              fontFamily: FONTS.mono, fontSize: '9px',
              padding: '1px 6px', borderRadius: '2px',
              background: (TOPIC_TAG_COLORS[t] || COLORS.primary) + '22',
              color: TOPIC_TAG_COLORS[t] || COLORS.primary,
            }}>
              {t}
            </span>
          ))}
        </div>
      )}

      {/* Speakers */}
      {sessionSpeakers.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '4px' }}>
          {sessionSpeakers.map(({ speaker: sp, role }) => (
            <div key={sp.id} style={{ fontFamily: FONTS.mono, fontSize: '11px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              {role === 'moderator' && (
                <span style={{
                  fontSize: '8px', padding: '1px 5px', borderRadius: '2px',
                  background: '#f59e0b33', color: '#f59e0b',
                  fontFamily: FONTS.pixel, letterSpacing: '0.05em',
                }}>MOD</span>
              )}
              <span style={{ color: COLORS.accent }}>{sp.name}</span>
              <span style={{ color: COLORS.textMuted, fontSize: '10px' }}>
                {' · '}{sp.title}, {sp.company}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Quest button */}
      <button
        onClick={() => {
          if (!isBookmarked) {
            setFlashState('added');
            setTimeout(() => setFlashState(null), 700);
          }
          onToggleBookmark(session.id);
        }}
        style={{
          fontFamily: FONTS.pixel, fontSize: '8px',
          padding: '8px 12px', marginTop: '4px',
          background: flashState === 'added' ? '#22c55e' : isBookmarked ? COLORS.accent : 'transparent',
          color: flashState === 'added' ? '#fff' : isBookmarked ? COLORS.textDark : COLORS.accent,
          border: `1px solid ${flashState === 'added' ? '#22c55e' : COLORS.accent}`,
          borderRadius: '2px', cursor: 'pointer',
          letterSpacing: '0.05em', transition: 'all 0.15s',
          alignSelf: 'flex-start',
          transform: flashState === 'added' ? 'scale(1.05)' : 'scale(1)',
        }}
      >
        {flashState === 'added' ? 'QUEST ADDED +' : isBookmarked ? 'QUEST SAVED \u2605' : 'ADD TO MY QUEST'}
      </button>
    </div>
  );
}

// ── View Page ─────────────────────────────────────────────────────────────────
export default function ViewPage() {
  const [sessions, setSessions] = useState([]);
  const [speakers, setSpeakers] = useState([]);
  const [stages, setStages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedDay, setSelectedDay] = useState('day1');
  const [activeTopics, setActiveTopics] = useState([]);
  const [bookmarks, setBookmarks] = useState(loadBookmarks);
  const [showBookmarksOnly, setShowBookmarksOnly] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const [sessRes, spkRes, stgRes] = await Promise.all([
          supabase.from('sessions').select('*').eq('status', 'confirmed'),
          supabase.from('speakers').select('*'),
          supabase.from('stages').select('*').order('sort_order'),
        ]);
        if (sessRes.data) setSessions(sessRes.data);
        if (spkRes.data) setSpeakers(spkRes.data);
        if (stgRes.data) setStages(stgRes.data);
      } catch (e) {
        console.error('ViewPage fetch error:', e);
      }
      setLoading(false);
    };
    fetchData();
  }, []);

  const speakerMap = useMemo(() => {
    const map = {};
    speakers.forEach(sp => { map[sp.id] = sp; });
    return map;
  }, [speakers]);

  const stageMap = useMemo(() => {
    const map = {};
    stages.forEach(st => { map[st.id] = st; });
    return map;
  }, [stages]);

  const groupedByTimeSlot = useMemo(() => {
    let filtered = sessions.filter(s => s.day === selectedDay && s.start_time);

    if (activeTopics.length > 0) {
      filtered = filtered.filter(s =>
        s.topics?.some(t => activeTopics.includes(t))
      );
    }

    if (showBookmarksOnly) {
      filtered = filtered.filter(s => bookmarks.includes(s.id));
    }

    filtered.sort((a, b) => isoToMinutes(a.start_time) - isoToMinutes(b.start_time));

    const groups = {};
    filtered.forEach(s => {
      const slotKey = isoToMinutes(s.start_time);
      if (!groups[slotKey]) groups[slotKey] = [];
      groups[slotKey].push(s);
    });

    return Object.entries(groups)
      .sort(([a], [b]) => Number(a) - Number(b))
      .map(([mins, slotSessions]) => ({
        time: formatTime(Number(mins)),
        minutes: Number(mins),
        sessions: slotSessions,
      }));
  }, [sessions, selectedDay, activeTopics, showBookmarksOnly, bookmarks]);

  const toggleBookmark = (sessionId) => {
    setBookmarks(prev => {
      const next = prev.includes(sessionId)
        ? prev.filter(id => id !== sessionId)
        : [...prev, sessionId];
      saveBookmarks(next);
      return next;
    });
  };

  const toggleTopic = (tag) => {
    setActiveTopics(prev =>
      prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
    );
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: COLORS.bg,
      color: COLORS.textPrimary,
      fontFamily: FONTS.mono,
    }}>
      {/* Scanline overlay */}
      <div style={{
        position: 'fixed', inset: 0,
        pointerEvents: 'none', zIndex: 9999,
        background: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.03) 2px, rgba(0,0,0,0.03) 4px)',
        mixBlendMode: 'multiply',
      }} />

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div style={{
        background: COLORS.bg,
        borderBottom: `2px solid ${COLORS.primary}`,
        padding: '16px 24px',
        position: 'sticky', top: 0, zIndex: 100,
      }}>
        {/* Title row */}
        <div style={{
          display: 'flex', justifyContent: 'space-between',
          alignItems: 'center', marginBottom: '16px',
          flexWrap: 'wrap', gap: '12px',
        }}>
          <div>
            <h1 style={{
              fontFamily: FONTS.pixel, fontSize: '16px',
              color: COLORS.primary, margin: 0, letterSpacing: '0.1em',
            }}>
              FINTECH NERDCON
            </h1>
            <div style={{
              fontFamily: FONTS.mono, fontSize: '11px',
              color: COLORS.textMuted, marginTop: '4px', letterSpacing: '0.05em',
            }}>
              SAN DIEGO &middot; NOV 18-20, 2026
            </div>
          </div>

          {/* MY QUEST toggle */}
          <button
            onClick={() => setShowBookmarksOnly(prev => !prev)}
            style={{
              fontFamily: FONTS.pixel, fontSize: '10px',
              padding: '8px 16px',
              background: showBookmarksOnly ? COLORS.accent : 'transparent',
              color: showBookmarksOnly ? COLORS.textDark : COLORS.accent,
              border: `2px solid ${COLORS.accent}`,
              borderRadius: '2px', cursor: 'pointer',
              letterSpacing: '0.05em', transition: 'all 0.15s',
            }}
          >
            {showBookmarksOnly ? '\u25C0 ALL MISSIONS' : `MY QUEST (${bookmarks.length})`}
          </button>
        </div>

        {/* Day tabs — Level selectors */}
        <div style={{
          display: 'flex', gap: '8px',
          justifyContent: 'center', flexWrap: 'wrap',
        }}>
          {DAYS.map((day, i) => (
            <button
              key={day.id}
              onClick={() => setSelectedDay(day.id)}
              style={{
                fontFamily: FONTS.pixel, fontSize: '11px',
                padding: '12px 24px',
                background: selectedDay === day.id ? COLORS.primary : 'transparent',
                color: selectedDay === day.id ? COLORS.textDark : COLORS.textMuted,
                border: `2px solid ${selectedDay === day.id ? COLORS.primary : COLORS.border}`,
                borderRadius: '2px', cursor: 'pointer',
                letterSpacing: '0.1em', transition: 'all 0.2s',
                minWidth: '140px', textAlign: 'center',
              }}
            >
              <div>LVL {i}</div>
              <div style={{
                fontFamily: FONTS.mono, fontSize: '10px',
                marginTop: '4px', opacity: 0.8,
              }}>
                {day.date}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* ── Topic Filter Bar ───────────────────────────────────────────── */}
      <div style={{
        padding: '12px 24px',
        display: 'flex', flexWrap: 'wrap', gap: '6px',
        borderBottom: `1px solid ${COLORS.border}`,
        background: '#010606',
      }}>
        {TOPIC_TAGS.map(tag => {
          const isActive = activeTopics.includes(tag);
          const tagColor = TOPIC_TAG_COLORS[tag] || COLORS.primary;
          return (
            <button
              key={tag}
              onClick={() => toggleTopic(tag)}
              style={{
                fontFamily: FONTS.mono, fontSize: '10px',
                padding: '4px 10px', borderRadius: '2px',
                cursor: 'pointer',
                background: isActive ? tagColor + '33' : 'transparent',
                border: `1px solid ${isActive ? tagColor : COLORS.borderLight}`,
                color: isActive ? tagColor : COLORS.textMuted,
                letterSpacing: '0.03em', transition: 'all 0.15s',
              }}
            >
              {tag}
            </button>
          );
        })}
        {activeTopics.length > 0 && (
          <button
            onClick={() => setActiveTopics([])}
            style={{
              fontFamily: FONTS.mono, fontSize: '10px',
              padding: '4px 10px', borderRadius: '2px',
              cursor: 'pointer', background: 'transparent',
              border: '1px solid #f87171', color: '#f87171',
              letterSpacing: '0.03em',
            }}
          >
            CLEAR
          </button>
        )}
      </div>

      {/* ── Main Content ───────────────────────────────────────────────── */}
      <main style={{
        padding: '24px',
        maxWidth: '1200px',
        margin: '0 auto',
        width: '100%',
        boxSizing: 'border-box',
      }}>
        {loading ? (
          <div style={{
            fontFamily: FONTS.pixel, fontSize: '14px',
            color: COLORS.primary, textAlign: 'center',
            padding: '80px 0',
            animation: 'pulse 1.5s infinite',
          }}>
            LOADING MISSIONS...
          </div>
        ) : groupedByTimeSlot.length === 0 ? (
          <div style={{
            fontFamily: FONTS.pixel, fontSize: '12px',
            color: COLORS.textMuted, textAlign: 'center',
            padding: '80px 0', lineHeight: 2,
          }}>
            {showBookmarksOnly
              ? 'NO QUESTS ACCEPTED YET'
              : 'NO MISSIONS SCHEDULED'}
          </div>
        ) : (
          groupedByTimeSlot.map(slot => (
            <div key={slot.minutes} style={{ marginBottom: '32px' }}>
              {/* Time slot header */}
              <div style={{
                fontFamily: FONTS.pixel, fontSize: '12px',
                color: COLORS.primary, marginBottom: '12px',
                paddingBottom: '8px',
                borderBottom: `1px solid ${COLORS.border}`,
                letterSpacing: '0.1em',
              }}>
                &gt; {slot.time}
              </div>

              {/* Responsive card grid */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
                gap: '16px',
              }}>
                {slot.sessions.map(s => (
                  <MissionCard
                    key={s.id}
                    session={s}
                    speakerMap={speakerMap}
                    stageMap={stageMap}
                    bookmarks={bookmarks}
                    onToggleBookmark={toggleBookmark}
                  />
                ))}
              </div>
            </div>
          ))
        )}
      </main>
    </div>
  );
}
