import React, { useState, useEffect, useMemo, useCallback } from 'react';
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

const TOKEN_KEY = 'nerdcon-attendee-token';
const ATTENDEE_KEY = 'nerdcon-attendee';

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

// Returns true only for real attendee-facing sessions
const isViewableSession = (s) =>
  s.status === 'confirmed' && s.type !== 'block' && !s.block_type;

// ── Identity Modal ────────────────────────────────────────────────────────────
function IdentityModal({ isOpen, onClose, onIdentified, pendingAction }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [company, setCompany] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState(null);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim() || !email.trim()) return;
    setSending(true);
    setError(null);

    try {
      const { data, error: fnError } = await supabase.functions.invoke('send-magic-link', {
        body: { name: name.trim(), email: email.trim().toLowerCase(), company: company.trim() || null },
      });

      if (fnError) throw fnError;
      if (data?.error && !data?.attendee) throw new Error(data.error);

      // Even if email failed, we got the attendee record
      if (data?.attendee) {
        // Store token immediately so they can use the app
        localStorage.setItem(TOKEN_KEY, data.attendee.token);
        localStorage.setItem(ATTENDEE_KEY, JSON.stringify(data.attendee));
        onIdentified(data.attendee);

        if (data.emailSent) {
          setSent(true);
        } else {
          // Email failed but attendee created — log the error, proceed anyway
          if (data.error) console.warn('Magic link email failed:', data.error);
          setSent(true); // Still show confirmation — they're signed in on this device
        }
      }
    } catch (err) {
      console.error('Identity error:', err);
      setError(err.message || 'Something went wrong. Please try again.');
    }
    setSending(false);
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 10000,
      background: 'rgba(0,0,0,0.85)', display: 'flex',
      alignItems: 'center', justifyContent: 'center', padding: '24px',
    }} onClick={onClose}>
      <div style={{
        background: COLORS.bg, border: `2px solid ${COLORS.primary}`,
        borderRadius: '4px', padding: '32px', maxWidth: '420px', width: '100%',
      }} onClick={e => e.stopPropagation()}>
        {sent ? (
          // Confirmation screen
          <div style={{ textAlign: 'center' }}>
            <div style={{
              fontFamily: FONTS.pixel, fontSize: '14px',
              color: '#22c55e', marginBottom: '16px',
            }}>CHECK YOUR EMAIL</div>
            <p style={{
              fontFamily: FONTS.mono, fontSize: '12px',
              color: COLORS.textPrimary, lineHeight: 1.8,
            }}>
              We sent a magic link to <strong style={{ color: COLORS.accent }}>{email}</strong>.
              Click it to access your quest from any device.
            </p>
            <p style={{
              fontFamily: FONTS.mono, fontSize: '11px',
              color: COLORS.textMuted, marginTop: '16px', lineHeight: 1.6,
            }}>
              You're already signed in on this device — your quest is ready to go.
            </p>
            <button
              onClick={onClose}
              style={{
                fontFamily: FONTS.pixel, fontSize: '10px',
                padding: '12px 24px', marginTop: '24px',
                background: COLORS.primary, color: COLORS.textDark,
                border: 'none', borderRadius: '2px', cursor: 'pointer',
                letterSpacing: '0.05em',
              }}
            >
              START MY QUEST
            </button>
          </div>
        ) : (
          // Registration form
          <form onSubmit={handleSubmit}>
            <div style={{
              fontFamily: FONTS.pixel, fontSize: '12px',
              color: COLORS.primary, marginBottom: '8px',
              letterSpacing: '0.1em',
            }}>
              IDENTIFY YOURSELF
            </div>
            <p style={{
              fontFamily: FONTS.mono, fontSize: '11px',
              color: COLORS.textMuted, marginBottom: '24px', lineHeight: 1.6,
            }}>
              {pendingAction === 'roundtable'
                ? 'Register to join this roundtable and save sessions to your quest.'
                : 'Sign in to save sessions to your quest across devices.'}
            </p>

            {error && (
              <div style={{
                fontFamily: FONTS.mono, fontSize: '11px',
                color: '#f87171', padding: '8px 12px',
                background: '#1f0a0a', borderRadius: '2px',
                marginBottom: '16px',
              }}>{error}</div>
            )}

            <label style={{ fontFamily: FONTS.mono, fontSize: '10px', color: COLORS.textMuted, letterSpacing: '0.05em' }}>
              NAME *
              <input
                type="text" value={name} onChange={e => setName(e.target.value)}
                required autoFocus
                style={{
                  display: 'block', width: '100%', marginTop: '6px', marginBottom: '16px',
                  padding: '10px 12px', background: COLORS.bgCard,
                  border: `1px solid ${COLORS.border}`, borderRadius: '2px',
                  color: COLORS.textPrimary, fontFamily: FONTS.mono, fontSize: '13px',
                  boxSizing: 'border-box',
                }}
                placeholder="Your name"
              />
            </label>

            <label style={{ fontFamily: FONTS.mono, fontSize: '10px', color: COLORS.textMuted, letterSpacing: '0.05em' }}>
              EMAIL *
              <input
                type="email" value={email} onChange={e => setEmail(e.target.value)}
                required
                style={{
                  display: 'block', width: '100%', marginTop: '6px', marginBottom: '16px',
                  padding: '10px 12px', background: COLORS.bgCard,
                  border: `1px solid ${COLORS.border}`, borderRadius: '2px',
                  color: COLORS.textPrimary, fontFamily: FONTS.mono, fontSize: '13px',
                  boxSizing: 'border-box',
                }}
                placeholder="you@company.com"
              />
            </label>

            <label style={{ fontFamily: FONTS.mono, fontSize: '10px', color: COLORS.textMuted, letterSpacing: '0.05em' }}>
              COMPANY
              <input
                type="text" value={company} onChange={e => setCompany(e.target.value)}
                style={{
                  display: 'block', width: '100%', marginTop: '6px', marginBottom: '24px',
                  padding: '10px 12px', background: COLORS.bgCard,
                  border: `1px solid ${COLORS.border}`, borderRadius: '2px',
                  color: COLORS.textPrimary, fontFamily: FONTS.mono, fontSize: '13px',
                  boxSizing: 'border-box',
                }}
                placeholder="Optional"
              />
            </label>

            <button
              type="submit" disabled={sending || !name.trim() || !email.trim()}
              style={{
                width: '100%', fontFamily: FONTS.pixel, fontSize: '10px',
                padding: '14px', background: sending ? COLORS.textMuted : COLORS.primary,
                color: COLORS.textDark, border: 'none', borderRadius: '2px',
                cursor: sending ? 'wait' : 'pointer', letterSpacing: '0.05em',
              }}
            >
              {sending ? 'REGISTERING...' : 'ENTER THE ARENA'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

// ── Session Detail Modal ──────────────────────────────────────────────────────
function SessionDetailModal({ session, speakerMap, stageMap, bookmarks, onToggleBookmark, isRoundtable, registrationCount, isRegistered, onJoinRoundtable, capacity, onClose }) {
  if (!session) return null;

  const isBookmarked = bookmarks.includes(session.id);
  const sessionSpeakers = (session.speakers || [])
    .map(s => {
      if (typeof s === 'string') return { speaker: speakerMap[s], role: 'speaker' };
      return { speaker: speakerMap[s.speaker_id], role: s.role || 'speaker' };
    })
    .filter(e => e.speaker);
  const primaryTopic = session.topics?.[0];
  const topicColor = primaryTopic ? TOPIC_TAG_COLORS[primaryTopic] : COLORS.primary;
  const startMins = session.start_time ? isoToMinutes(session.start_time) : null;
  const endMins = startMins !== null ? startMins + session.duration_minutes : null;
  const timeLabel = startMins !== null ? `${formatTime(startMins)} – ${formatTime(endMins)}` : null;
  const stageName = session.stage_id && stageMap[session.stage_id] ? stageMap[session.stage_id].name : null;
  const isFull = isRoundtable && capacity && registrationCount >= capacity;

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 10000,
      background: 'rgba(0,0,0,0.85)', display: 'flex',
      alignItems: 'center', justifyContent: 'center', padding: '24px',
    }} onClick={onClose}>
      <div style={{
        background: COLORS.bg, border: `2px solid ${topicColor}`,
        borderRadius: '4px', maxWidth: '640px', width: '100%',
        maxHeight: '90vh', overflowY: 'auto',
      }} onClick={e => e.stopPropagation()}>
        {/* Header accent bar */}
        <div style={{ height: '3px', background: topicColor }} />

        <div style={{ padding: '28px 28px 24px' }}>
          {/* Time + Stage */}
          {(timeLabel || stageName) && (
            <div style={{
              fontFamily: FONTS.mono, fontSize: '11px',
              color: COLORS.textMuted, letterSpacing: '0.05em',
              marginBottom: '12px', display: 'flex', gap: '8px', flexWrap: 'wrap',
            }}>
              {timeLabel && <span>{timeLabel} · {session.duration_minutes}m</span>}
              {stageName && <span style={{ color: COLORS.primary }}>📍 {stageName}</span>}
            </div>
          )}

          {/* Title */}
          <h2 style={{
            fontFamily: FONTS.pixel, fontSize: '14px',
            color: COLORS.textPrimary, margin: '0 0 16px',
            lineHeight: 1.6, letterSpacing: '0.05em',
            textTransform: 'uppercase',
          }}>
            {session.title}
          </h2>

          {/* Format + Topics row */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '16px' }}>
            <span style={{
              fontFamily: FONTS.mono, fontSize: '10px',
              padding: '3px 10px', borderRadius: '2px',
              background: COLORS.primaryDim, color: COLORS.primary,
              letterSpacing: '0.05em', textTransform: 'uppercase',
            }}>
              {session.format || 'SESSION'}
            </span>
            {session.topics?.map(t => (
              <span key={t} style={{
                fontFamily: FONTS.mono, fontSize: '10px',
                padding: '3px 10px', borderRadius: '2px',
                background: (TOPIC_TAG_COLORS[t] || COLORS.primary) + '22',
                color: TOPIC_TAG_COLORS[t] || COLORS.primary,
              }}>
                {t}
              </span>
            ))}
          </div>

          {/* Description */}
          {session.description && (
            <div style={{
              fontFamily: FONTS.mono, fontSize: '13px',
              color: COLORS.textPrimary, lineHeight: 1.8,
              marginBottom: '20px', whiteSpace: 'pre-wrap',
              padding: '16px', background: COLORS.bgCard,
              borderRadius: '4px', border: `1px solid ${COLORS.border}`,
            }}>
              {session.description}
            </div>
          )}

          {/* Speakers */}
          {sessionSpeakers.length > 0 && (
            <div style={{ marginBottom: '20px' }}>
              <div style={{
                fontFamily: FONTS.pixel, fontSize: '8px',
                color: COLORS.textMuted, letterSpacing: '0.1em',
                marginBottom: '10px',
              }}>
                SPEAKERS
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {sessionSpeakers.map(({ speaker: sp, role }) => (
                  <div key={sp.id} style={{
                    display: 'flex', alignItems: 'center', gap: '10px',
                    padding: '10px 12px', background: COLORS.bgCard,
                    borderRadius: '4px', border: `1px solid ${COLORS.border}`,
                  }}>
                    {role === 'moderator' && (
                      <span style={{
                        fontSize: '8px', padding: '2px 6px', borderRadius: '2px',
                        background: '#f59e0b33', color: '#f59e0b',
                        fontFamily: FONTS.pixel, letterSpacing: '0.05em',
                        flexShrink: 0,
                      }}>🎙 MOD</span>
                    )}
                    <div>
                      <div style={{ fontFamily: FONTS.mono, fontSize: '13px', color: COLORS.accent }}>{sp.name}</div>
                      <div style={{ fontFamily: FONTS.mono, fontSize: '11px', color: COLORS.textMuted, marginTop: '2px' }}>
                        {sp.title}{sp.company ? ` · ${sp.company}` : ''}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Roundtable capacity */}
          {isRoundtable && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px',
              fontFamily: FONTS.mono, fontSize: '12px',
            }}>
              <span style={{ color: COLORS.textMuted }}>
                {registrationCount || 0}{capacity ? `/${capacity}` : ''} registered
              </span>
              {capacity && (
                <div style={{
                  flex: 1, height: '6px', background: COLORS.border, borderRadius: '3px',
                  overflow: 'hidden', maxWidth: '120px',
                }}>
                  <div style={{
                    width: `${Math.min(100, ((registrationCount || 0) / capacity) * 100)}%`,
                    height: '100%',
                    background: isFull ? '#f87171' : '#22c55e',
                    transition: 'width 0.3s',
                  }} />
                </div>
              )}
            </div>
          )}

          {/* Action buttons */}
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <button
              onClick={() => onToggleBookmark(session.id)}
              style={{
                fontFamily: FONTS.pixel, fontSize: '9px',
                padding: '12px 20px',
                background: isBookmarked ? COLORS.accent : 'transparent',
                color: isBookmarked ? COLORS.textDark : COLORS.accent,
                border: `1px solid ${COLORS.accent}`,
                borderRadius: '2px', cursor: 'pointer',
                letterSpacing: '0.05em',
              }}
            >
              {isBookmarked ? 'QUEST SAVED \u2605' : 'ADD TO MY QUEST'}
            </button>

            {isRoundtable && (
              <button
                onClick={() => !isFull && !isRegistered && onJoinRoundtable(session.id)}
                disabled={isFull && !isRegistered}
                style={{
                  fontFamily: FONTS.pixel, fontSize: '9px',
                  padding: '12px 20px',
                  background: isRegistered ? '#22c55e' : isFull ? '#1a1a1a' : 'transparent',
                  color: isRegistered ? '#fff' : isFull ? '#4a4a4a' : '#22c55e',
                  border: `1px solid ${isRegistered ? '#22c55e' : isFull ? '#2a2a2a' : '#22c55e'}`,
                  borderRadius: '2px',
                  cursor: isRegistered || isFull ? 'default' : 'pointer',
                  letterSpacing: '0.05em',
                }}
              >
                {isRegistered ? 'REGISTERED \u2605' : isFull ? 'FULL' : 'JOIN ROUNDTABLE'}
              </button>
            )}
          </div>
        </div>

        {/* Close button */}
        <div style={{
          padding: '12px 28px', borderTop: `1px solid ${COLORS.border}`,
          display: 'flex', justifyContent: 'flex-end',
        }}>
          <button onClick={onClose} style={{
            fontFamily: FONTS.mono, fontSize: '11px',
            padding: '8px 16px', background: 'none',
            border: `1px solid ${COLORS.border}`, borderRadius: '2px',
            color: COLORS.textMuted, cursor: 'pointer', letterSpacing: '0.05em',
          }}>
            CLOSE
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Mission Card ──────────────────────────────────────────────────────────────
function MissionCard({ session, speakerMap, bookmarks, onToggleBookmark, isRoundtable, registrationCount, isRegistered, onJoinRoundtable, capacity, onClick }) {
  const isBookmarked = bookmarks.includes(session.id);
  const [flashState, setFlashState] = useState(null);
  const sessionSpeakers = (session.speakers || [])
    .map(s => {
      if (typeof s === 'string') return { speaker: speakerMap[s], role: 'speaker' };
      return { speaker: speakerMap[s.speaker_id], role: s.role || 'speaker' };
    })
    .filter(e => e.speaker);
  const primaryTopic = session.topics?.[0];
  const topicColor = primaryTopic ? TOPIC_TAG_COLORS[primaryTopic] : COLORS.primary;
  const startMins = session.start_time ? isoToMinutes(session.start_time) : null;
  const endMins = startMins !== null ? startMins + session.duration_minutes : null;
  const timeLabel = startMins !== null ? `${formatTime(startMins)} – ${formatTime(endMins)}` : null;

  const isFull = isRoundtable && capacity && registrationCount >= capacity;

  const descTooltip = session.description ? session.description.substring(0, 120) + (session.description.length > 120 ? '...' : '') : null;

  return (
    <div
      onClick={onClick}
      title={descTooltip || undefined}
      style={{
        background: COLORS.bgCard,
        borderTop: `1px solid ${COLORS.border}`,
        borderRight: `1px solid ${COLORS.border}`,
        borderBottom: `1px solid ${COLORS.border}`,
        borderLeft: `3px solid ${topicColor}`,
        borderRadius: '4px',
        padding: '14px',
        display: 'flex',
        flexDirection: 'column',
        gap: '6px',
        transition: 'border-color 0.15s, transform 0.15s',
        cursor: 'pointer',
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
      {/* Time range */}
      {timeLabel && (
        <div style={{
          fontFamily: FONTS.mono, fontSize: '10px',
          color: COLORS.textMuted, letterSpacing: '0.05em',
        }}>
          {timeLabel} · {session.duration_minutes}m
        </div>
      )}

      {/* Title */}
      <h3 style={{
        fontFamily: FONTS.pixel, fontSize: '10px',
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '2px' }}>
          {sessionSpeakers.map(({ speaker: sp, role }) => (
            <div key={sp.id} style={{ fontFamily: FONTS.mono, fontSize: '11px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              {role === 'moderator' && (
                <span style={{
                  fontSize: '8px', padding: '1px 5px', borderRadius: '2px',
                  background: '#f59e0b33', color: '#f59e0b',
                  fontFamily: FONTS.pixel, letterSpacing: '0.05em',
                  display: 'inline-flex', alignItems: 'center', gap: '3px',
                }}>🎙 MOD</span>
              )}
              <span style={{ color: COLORS.accent }}>{sp.name}</span>
              <span style={{ color: COLORS.textMuted, fontSize: '10px' }}>
                {' · '}{sp.title}, {sp.company}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Roundtable capacity + registration */}
      {isRoundtable && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px',
          fontFamily: FONTS.mono, fontSize: '10px',
        }}>
          <span style={{ color: COLORS.textMuted }}>
            {registrationCount || 0}{capacity ? `/${capacity}` : ''} registered
          </span>
          {capacity && (
            <div style={{
              flex: 1, height: '4px', background: COLORS.border, borderRadius: '2px',
              overflow: 'hidden', maxWidth: '80px',
            }}>
              <div style={{
                width: `${Math.min(100, ((registrationCount || 0) / capacity) * 100)}%`,
                height: '100%',
                background: isFull ? '#f87171' : '#22c55e',
                transition: 'width 0.3s',
              }} />
            </div>
          )}
        </div>
      )}

      {/* Action buttons */}
      <div style={{ display: 'flex', gap: '8px', marginTop: '4px', flexWrap: 'wrap' }}>
        {/* Quest button */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            if (!isBookmarked) {
              setFlashState('added');
              setTimeout(() => setFlashState(null), 700);
            }
            onToggleBookmark(session.id);
          }}
          style={{
            fontFamily: FONTS.pixel, fontSize: '8px',
            padding: '8px 12px',
            background: flashState === 'added' ? '#22c55e' : isBookmarked ? COLORS.accent : 'transparent',
            color: flashState === 'added' ? '#fff' : isBookmarked ? COLORS.textDark : COLORS.accent,
            border: `1px solid ${flashState === 'added' ? '#22c55e' : COLORS.accent}`,
            borderRadius: '2px', cursor: 'pointer',
            letterSpacing: '0.05em', transition: 'all 0.15s',
            transform: flashState === 'added' ? 'scale(1.05)' : 'scale(1)',
          }}
        >
          {flashState === 'added' ? 'QUEST ADDED +' : isBookmarked ? 'QUEST SAVED \u2605' : 'ADD TO MY QUEST'}
        </button>

        {/* Roundtable join button */}
        {isRoundtable && (
          <button
            onClick={(e) => { e.stopPropagation(); if (!isFull && !isRegistered) onJoinRoundtable(session.id); }}
            disabled={isFull && !isRegistered}
            style={{
              fontFamily: FONTS.pixel, fontSize: '8px',
              padding: '8px 12px',
              background: isRegistered ? '#22c55e' : isFull ? '#1a1a1a' : 'transparent',
              color: isRegistered ? '#fff' : isFull ? '#4a4a4a' : '#22c55e',
              border: `1px solid ${isRegistered ? '#22c55e' : isFull ? '#2a2a2a' : '#22c55e'}`,
              borderRadius: '2px',
              cursor: isRegistered || isFull ? 'default' : 'pointer',
              letterSpacing: '0.05em', transition: 'all 0.15s',
            }}
          >
            {isRegistered ? 'REGISTERED \u2605' : isFull ? 'FULL' : 'JOIN ROUNDTABLE'}
          </button>
        )}
      </div>
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
  const [showBookmarksOnly, setShowBookmarksOnly] = useState(false);
  const [selectedSession, setSelectedSession] = useState(null);

  // Attendee identity state
  const [attendee, setAttendee] = useState(null);
  const [showIdentityModal, setShowIdentityModal] = useState(false);
  const [pendingAction, setPendingAction] = useState(null); // { type: 'quest'|'roundtable', sessionId }

  // Quest saves (Supabase-backed when identified)
  const [questSaves, setQuestSaves] = useState([]);

  // Roundtable registrations
  const [rtRegistrations, setRtRegistrations] = useState([]); // all registrations (for counts)
  const [myRtRegistrations, setMyRtRegistrations] = useState([]); // current attendee's registrations

  // ── Magic link token detection ──────────────────────────────────────────────
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token');

    if (token) {
      // Look up attendee by token
      supabase.from('attendees').select('*').eq('token', token).single()
        .then(({ data, error }) => {
          if (data && !error) {
            localStorage.setItem(TOKEN_KEY, data.token);
            localStorage.setItem(ATTENDEE_KEY, JSON.stringify(data));
            setAttendee(data);
          }
          // Clean URL
          window.history.replaceState({}, '', '/view');
        });
    } else {
      // Check localStorage for existing identity
      const storedToken = localStorage.getItem(TOKEN_KEY);
      const storedAttendee = localStorage.getItem(ATTENDEE_KEY);
      if (storedToken && storedAttendee) {
        try {
          const parsed = JSON.parse(storedAttendee);
          setAttendee(parsed);
          // Verify token is still valid
          supabase.from('attendees').select('*').eq('token', storedToken).single()
            .then(({ data, error }) => {
              if (data && !error) {
                setAttendee(data);
                localStorage.setItem(ATTENDEE_KEY, JSON.stringify(data));
              } else {
                // Token invalidated — clear
                localStorage.removeItem(TOKEN_KEY);
                localStorage.removeItem(ATTENDEE_KEY);
                setAttendee(null);
              }
            });
        } catch {
          localStorage.removeItem(TOKEN_KEY);
          localStorage.removeItem(ATTENDEE_KEY);
        }
      }
    }
  }, []);

  // ── Load quest saves when attendee is identified ────────────────────────────
  useEffect(() => {
    if (!attendee) {
      setQuestSaves([]);
      setMyRtRegistrations([]);
      return;
    }

    // Load quest saves
    supabase.from('quest_saves').select('session_id').eq('attendee_id', attendee.id)
      .then(({ data }) => {
        if (data) setQuestSaves(data.map(d => d.session_id));
      });

    // Load my roundtable registrations
    supabase.from('roundtable_registrations').select('session_id').eq('attendee_id', attendee.id)
      .then(({ data }) => {
        if (data) setMyRtRegistrations(data.map(d => d.session_id));
      });
  }, [attendee]);

  // ── Fetch main data ─────────────────────────────────────────────────────────
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const [sessRes, spkRes, stgRes, rtRegRes] = await Promise.all([
          supabase.from('sessions').select('*'),
          supabase.from('speakers').select('*'),
          supabase.from('stages').select('*').order('sort_order'),
          supabase.from('roundtable_registrations').select('session_id'),
        ]);
        if (sessRes.data) {
          const viewable = sessRes.data.filter(isViewableSession);
          setSessions(viewable);
        }
        if (spkRes.data) setSpeakers(spkRes.data);
        if (stgRes.data) setStages(stgRes.data);
        if (rtRegRes.data) setRtRegistrations(rtRegRes.data);
      } catch (e) {
        console.error('ViewPage fetch error:', e);
      }
      setLoading(false);
    };
    fetchData();
  }, []);

  // ── Computed: registration counts per session ───────────────────────────────
  const rtCountMap = useMemo(() => {
    const map = {};
    rtRegistrations.forEach(r => {
      map[r.session_id] = (map[r.session_id] || 0) + 1;
    });
    return map;
  }, [rtRegistrations]);

  // ── Roundtable stage detection ──────────────────────────────────────────────
  const roundtableStageIds = useMemo(() => {
    return new Set(stages.filter(s => (s.max_columns || 1) > 1).map(s => s.id));
  }, [stages]);

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

  // Group sessions by stage
  const sessionsByStage = useMemo(() => {
    let filtered = sessions.filter(s => s.day === selectedDay && s.start_time);

    if (activeTopics.length > 0) {
      filtered = filtered.filter(s =>
        s.topics?.some(t => activeTopics.includes(t))
      );
    }

    if (showBookmarksOnly) {
      filtered = filtered.filter(s => questSaves.includes(s.id));
    }

    filtered.sort((a, b) => isoToMinutes(a.start_time) - isoToMinutes(b.start_time));

    const byStage = {};
    filtered.forEach(s => {
      if (!byStage[s.stage_id]) byStage[s.stage_id] = [];
      byStage[s.stage_id].push(s);
    });

    return stages
      .filter(st => byStage[st.id]?.length > 0)
      .map(st => ({ stage: st, sessions: byStage[st.id] }));
  }, [sessions, stages, selectedDay, activeTopics, showBookmarksOnly, questSaves]);

  // ── Require identity helper ─────────────────────────────────────────────────
  const requireIdentity = useCallback((actionType, sessionId) => {
    if (attendee) return true;
    setPendingAction({ type: actionType, sessionId });
    setShowIdentityModal(true);
    return false;
  }, [attendee]);

  // ── Toggle quest save ───────────────────────────────────────────────────────
  const toggleQuestSave = useCallback(async (sessionId) => {
    if (!requireIdentity('quest', sessionId)) return;

    const isSaved = questSaves.includes(sessionId);
    if (isSaved) {
      // Remove
      setQuestSaves(prev => prev.filter(id => id !== sessionId));
      await supabase.from('quest_saves')
        .delete()
        .eq('attendee_id', attendee.id)
        .eq('session_id', sessionId);
    } else {
      // Add
      setQuestSaves(prev => [...prev, sessionId]);
      await supabase.from('quest_saves')
        .upsert({ attendee_id: attendee.id, session_id: sessionId }, { onConflict: 'attendee_id,session_id' });
    }
  }, [attendee, questSaves, requireIdentity]);

  // ── Join roundtable ─────────────────────────────────────────────────────────
  const joinRoundtable = useCallback(async (sessionId) => {
    if (!requireIdentity('roundtable', sessionId)) return;

    // Already registered?
    if (myRtRegistrations.includes(sessionId)) return;

    // Optimistic update
    setMyRtRegistrations(prev => [...prev, sessionId]);
    setRtRegistrations(prev => [...prev, { session_id: sessionId }]);

    const { error } = await supabase.from('roundtable_registrations')
      .upsert(
        { attendee_id: attendee.id, session_id: sessionId },
        { onConflict: 'attendee_id,session_id' }
      );

    if (error) {
      console.error('Roundtable registration error:', error);
      // Rollback
      setMyRtRegistrations(prev => prev.filter(id => id !== sessionId));
      setRtRegistrations(prev => prev.filter(r => !(r.session_id === sessionId && prev.indexOf(r) === prev.length - 1)));
    }
  }, [attendee, myRtRegistrations, requireIdentity]);

  // ── Handle identity confirmed (from modal) ─────────────────────────────────
  const handleIdentified = useCallback((newAttendee) => {
    setAttendee(newAttendee);
    // Execute pending action after a tick
    if (pendingAction) {
      setTimeout(() => {
        if (pendingAction.type === 'quest') {
          // Need to save directly since attendee state may not be updated yet in toggleQuestSave
          setQuestSaves(prev => [...prev, pendingAction.sessionId]);
          supabase.from('quest_saves')
            .upsert({ attendee_id: newAttendee.id, session_id: pendingAction.sessionId }, { onConflict: 'attendee_id,session_id' });
        } else if (pendingAction.type === 'roundtable') {
          setMyRtRegistrations(prev => [...prev, pendingAction.sessionId]);
          setRtRegistrations(prev => [...prev, { session_id: pendingAction.sessionId }]);
          supabase.from('roundtable_registrations')
            .upsert({ attendee_id: newAttendee.id, session_id: pendingAction.sessionId }, { onConflict: 'attendee_id,session_id' });
        }
        setPendingAction(null);
      }, 100);
    }
  }, [pendingAction]);

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

      {/* Identity Modal */}
      <IdentityModal
        isOpen={showIdentityModal}
        onClose={() => { setShowIdentityModal(false); setPendingAction(null); }}
        onIdentified={handleIdentified}
        pendingAction={pendingAction?.type}
      />

      {/* Session Detail Modal */}
      {selectedSession && (
        <SessionDetailModal
          session={selectedSession}
          speakerMap={speakerMap}
          stageMap={stageMap}
          bookmarks={questSaves}
          onToggleBookmark={toggleQuestSave}
          isRoundtable={roundtableStageIds.has(selectedSession.stage_id)}
          registrationCount={rtCountMap[selectedSession.id] || 0}
          isRegistered={myRtRegistrations.includes(selectedSession.id)}
          onJoinRoundtable={joinRoundtable}
          capacity={selectedSession.capacity}
          onClose={() => setSelectedSession(null)}
        />
      )}

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

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            {/* Attendee badge */}
            {attendee && (
              <div style={{
                fontFamily: FONTS.mono, fontSize: '10px',
                color: COLORS.textMuted, padding: '6px 12px',
                border: `1px solid ${COLORS.border}`, borderRadius: '2px',
              }}>
                <span style={{ color: COLORS.accent }}>{attendee.name}</span>
                {attendee.company && <span> · {attendee.company}</span>}
              </div>
            )}

            {/* MY QUEST toggle */}
            <button
              onClick={() => {
                if (!attendee && !showBookmarksOnly) {
                  // If not identified and trying to see quest, prompt identity
                  requireIdentity('quest', null);
                  return;
                }
                setShowBookmarksOnly(prev => !prev);
              }}
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
              {showBookmarksOnly ? '\u25C0 ALL MISSIONS' : `MY QUEST (${questSaves.length})`}
            </button>
          </div>
        </div>

        {/* Day tabs */}
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

      {/* ── Main Content — Stage Columns ─────────────────────────────── */}
      <main style={{
        padding: '24px',
        width: '100%',
        boxSizing: 'border-box',
        overflowX: 'auto',
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
        ) : sessionsByStage.length === 0 ? (
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
          <div className="view-stage-columns" style={{
            display: 'flex',
            gap: '20px',
            alignItems: 'flex-start',
          }}>
            {sessionsByStage.map(({ stage, sessions: stageSessions }) => {
              const isRoundtableStage = roundtableStageIds.has(stage.id);
              return (
                <div key={stage.id} className="view-stage-column" style={{
                  width: '320px',
                  minWidth: '320px',
                  flexShrink: 0,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '12px',
                }}>
                  {/* Stage header */}
                  <div style={{
                    padding: '12px 14px',
                    background: (stage.color || COLORS.primary) + '15',
                    borderTop: `3px solid ${stage.color || COLORS.primary}`,
                    borderBottom: `1px solid ${COLORS.border}`,
                    borderLeft: 'none',
                    borderRight: 'none',
                    borderRadius: 0,
                  }}>
                    <div style={{
                      fontFamily: FONTS.pixel, fontSize: '11px',
                      color: stage.color || COLORS.primary,
                      letterSpacing: '0.1em', textTransform: 'uppercase',
                      lineHeight: 1.4,
                    }}>
                      {stage.name}
                    </div>
                    <div style={{
                      fontFamily: FONTS.mono, fontSize: '10px',
                      color: COLORS.textMuted, marginTop: '6px',
                    }}>
                      {stageSessions.length} {stageSessions.length === 1 ? 'session' : 'sessions'}
                    </div>
                  </div>

                  {/* Session cards */}
                  {stageSessions.map(s => (
                    <MissionCard
                      key={s.id}
                      session={s}
                      speakerMap={speakerMap}
                      bookmarks={questSaves}
                      onToggleBookmark={toggleQuestSave}
                      isRoundtable={isRoundtableStage}
                      registrationCount={rtCountMap[s.id] || 0}
                      isRegistered={myRtRegistrations.includes(s.id)}
                      onJoinRoundtable={joinRoundtable}
                      capacity={s.capacity}
                      onClick={() => setSelectedSession(s)}
                    />
                  ))}
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* ── Mobile stacking ──────────────────────────────────────────── */}
      <style>{`
        @media (max-width: 720px) {
          .view-stage-columns {
            flex-direction: column !important;
          }
          .view-stage-column {
            width: 100% !important;
            min-width: 0 !important;
          }
        }
      `}</style>
    </div>
  );
}
