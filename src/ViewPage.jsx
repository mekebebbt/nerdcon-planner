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
  bg: 'rgb(5, 5, 5)',
  bgCard: 'rgb(13, 13, 13)',
  bgElevated: 'rgb(18, 18, 18)',
  primary: '#3568FF',
  primaryDim: 'rgba(53,104,255,0.15)',
  glow: '0 0 16px rgba(53,104,255,0.45)',
  textPrimary: 'rgb(240, 240, 240)',
  textMuted: 'rgba(240,240,240,0.4)',
  border: 'rgba(255,255,255,0.06)',
};

const FONTS = {
  pixel: "'Press Start 2P', cursive",
  mono: "'JetBrains Mono', ui-monospace, monospace",
  sans: "'DM Sans', ui-sans-serif, system-ui, sans-serif",
};

const isViewableSession = (s) =>
  (s.status === 'confirmed' || s.type === 'event') && s.type !== 'block' && !s.block_type;

// ── Speaker Avatar ─────────────────────────────────────────────────────────────
function SpeakerAvatar({ name, size = 26 }) {
  const initials = name
    ? name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()
    : '?';
  const hue = name
    ? [...name].reduce((acc, c) => acc + c.charCodeAt(0), 0) % 360
    : 200;
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      background: `hsl(${hue}, 50%, 22%)`,
      border: `1.5px solid hsl(${hue}, 55%, 40%)`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.36, fontFamily: FONTS.mono, fontWeight: 600,
      color: `hsl(${hue}, 75%, 80%)`,
      flexShrink: 0, letterSpacing: '-0.02em', userSelect: 'none',
    }}>
      {initials}
    </div>
  );
}

// ── Identity Modal ─────────────────────────────────────────────────────────────
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
      if (data?.attendee) {
        localStorage.setItem(TOKEN_KEY, data.attendee.token);
        localStorage.setItem(ATTENDEE_KEY, JSON.stringify(data.attendee));
        onIdentified(data.attendee);
        if (data.error) console.warn('Magic link email failed:', data.error);
        setSent(true);
      }
    } catch (err) {
      console.error('Identity error:', err);
      setError(err.message || 'Something went wrong. Please try again.');
    }
    setSending(false);
  };

  const inputStyle = {
    display: 'block', width: '100%', marginTop: '6px', marginBottom: '16px',
    padding: '11px 14px', background: COLORS.bgElevated,
    border: `1px solid ${COLORS.border}`, borderRadius: '8px',
    color: COLORS.textPrimary, fontFamily: FONTS.mono, fontSize: '13px',
    boxSizing: 'border-box', outline: 'none',
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 10000,
      background: 'rgba(0,0,0,0.85)', display: 'flex',
      alignItems: 'center', justifyContent: 'center', padding: '24px',
    }} onClick={onClose}>
      <div style={{
        background: COLORS.bgCard, border: `1px solid ${COLORS.border}`,
        boxShadow: COLORS.glow, borderRadius: '16px',
        padding: '32px', maxWidth: '420px', width: '100%',
      }} onClick={e => e.stopPropagation()}>
        {sent ? (
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '32px', marginBottom: '16px' }}>✉️</div>
            <div style={{ fontFamily: FONTS.mono, fontSize: '16px', fontWeight: 600, color: '#22c55e', marginBottom: '12px' }}>
              Check your email
            </div>
            <p style={{ fontFamily: FONTS.sans, fontSize: '14px', color: COLORS.textMuted, lineHeight: 1.7 }}>
              We sent a magic link to <strong style={{ color: COLORS.textPrimary }}>{email}</strong>.
              Click it to access your quest from any device.
            </p>
            <p style={{ fontFamily: FONTS.sans, fontSize: '13px', color: COLORS.textMuted, marginTop: '12px', lineHeight: 1.6 }}>
              You're already signed in on this device — your quest is ready.
            </p>
            <button onClick={onClose} style={{
              marginTop: '24px', fontFamily: FONTS.mono, fontSize: '13px', fontWeight: 600,
              padding: '12px 28px', background: COLORS.primary, color: '#fff',
              border: 'none', borderRadius: '10px', cursor: 'pointer',
            }}>
              Start my quest →
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <div style={{ fontFamily: FONTS.mono, fontSize: '18px', fontWeight: 700, color: COLORS.textPrimary, marginBottom: '6px' }}>
              Join the quest
            </div>
            <p style={{ fontFamily: FONTS.sans, fontSize: '14px', color: COLORS.textMuted, marginBottom: '24px', lineHeight: 1.6 }}>
              {pendingAction === 'roundtable'
                ? 'Register to join this roundtable and save sessions.'
                : 'Save sessions to your personal quest across devices.'}
            </p>
            {error && (
              <div style={{
                fontFamily: FONTS.sans, fontSize: '13px',
                color: '#f87171', padding: '10px 14px',
                background: 'rgba(248,113,113,0.1)', borderRadius: '8px', marginBottom: '16px',
              }}>{error}</div>
            )}
            <label style={{ fontFamily: FONTS.mono, fontSize: '11px', color: COLORS.textMuted, letterSpacing: '0.04em' }}>
              NAME *
              <input type="text" value={name} onChange={e => setName(e.target.value)} required autoFocus style={inputStyle} placeholder="Your name" />
            </label>
            <label style={{ fontFamily: FONTS.mono, fontSize: '11px', color: COLORS.textMuted, letterSpacing: '0.04em' }}>
              EMAIL *
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} required style={inputStyle} placeholder="you@company.com" />
            </label>
            <label style={{ fontFamily: FONTS.mono, fontSize: '11px', color: COLORS.textMuted, letterSpacing: '0.04em' }}>
              COMPANY
              <input type="text" value={company} onChange={e => setCompany(e.target.value)} style={{ ...inputStyle, marginBottom: '24px' }} placeholder="Optional" />
            </label>
            <button type="submit" disabled={sending || !name.trim() || !email.trim()} style={{
              width: '100%', fontFamily: FONTS.mono, fontSize: '14px', fontWeight: 600,
              padding: '14px', background: sending ? 'rgba(53,104,255,0.5)' : COLORS.primary,
              color: '#fff', border: 'none', borderRadius: '10px',
              cursor: sending ? 'wait' : 'pointer',
            }}>
              {sending ? 'Registering...' : 'Enter the arena →'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

// ── Session Detail Modal ───────────────────────────────────────────────────────
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
        background: COLORS.bgCard, border: `1px solid ${COLORS.border}`,
        borderTop: `3px solid ${topicColor}`,
        boxShadow: `0 0 24px ${topicColor}33`,
        borderRadius: '16px', maxWidth: '640px', width: '100%',
        maxHeight: '90vh', overflowY: 'auto',
      }} onClick={e => e.stopPropagation()}>
        <div style={{ padding: '28px' }}>
          {/* Time + Stage */}
          {(timeLabel || stageName) && (
            <div style={{
              display: 'flex', gap: '16px', alignItems: 'center',
              fontFamily: FONTS.sans, fontSize: '13px',
              color: COLORS.textMuted, marginBottom: '14px', flexWrap: 'wrap',
            }}>
              {timeLabel && <span>🕐 {timeLabel} · {session.duration_minutes}m</span>}
              {stageName && <span style={{ color: COLORS.primary }}>◎ {stageName}</span>}
            </div>
          )}

          {/* Pills */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '16px' }}>
            <span style={{
              fontFamily: FONTS.mono, fontSize: '11px', fontWeight: 600,
              padding: '4px 12px', borderRadius: '20px',
              background: 'rgba(255,255,255,0.07)',
              border: '1px solid rgba(255,255,255,0.12)',
              color: COLORS.textMuted, letterSpacing: '0.04em', textTransform: 'uppercase',
            }}>
              {session.format || 'SESSION'}
            </span>
            {session.topics?.map(t => (
              <span key={t} style={{
                fontFamily: FONTS.mono, fontSize: '11px',
                padding: '4px 12px', borderRadius: '20px',
                background: (TOPIC_TAG_COLORS[t] || COLORS.primary) + '22',
                border: `1px solid ${(TOPIC_TAG_COLORS[t] || COLORS.primary)}44`,
                color: TOPIC_TAG_COLORS[t] || COLORS.primary,
              }}>
                {t}
              </span>
            ))}
          </div>

          {/* Title */}
          <h2 style={{
            fontFamily: FONTS.mono, fontSize: '20px', fontWeight: 700,
            color: COLORS.textPrimary, margin: '0 0 20px',
            lineHeight: 1.35, letterSpacing: '-0.02em',
          }}>
            {session.title}
          </h2>

          {/* Description (public only) */}
          {session.description && (
            <div style={{
              fontFamily: FONTS.sans, fontSize: '14px',
              color: COLORS.textMuted, lineHeight: 1.75,
              marginBottom: '24px', whiteSpace: 'pre-wrap',
              padding: '16px', background: COLORS.bgElevated,
              borderRadius: '10px', border: `1px solid ${COLORS.border}`,
            }}>
              {session.description}
            </div>
          )}

          {/* Speakers */}
          {sessionSpeakers.length > 0 && (
            <div style={{ marginBottom: '24px' }}>
              <div style={{
                fontFamily: FONTS.mono, fontSize: '11px',
                color: COLORS.textMuted, letterSpacing: '0.08em',
                textTransform: 'uppercase', marginBottom: '12px',
              }}>
                SPEAKERS
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {sessionSpeakers.map(({ speaker: sp, role }) => (
                  <div key={sp.id} style={{
                    display: 'flex', alignItems: 'center', gap: '12px',
                    padding: '12px 14px', background: COLORS.bgElevated,
                    borderRadius: '10px', border: `1px solid ${COLORS.border}`,
                  }}>
                    <SpeakerAvatar name={sp.name} size={38} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontFamily: FONTS.mono, fontSize: '14px', fontWeight: 600, color: COLORS.textPrimary, display: 'flex', alignItems: 'center', gap: '8px' }}>
                        {sp.name}
                        {role === 'moderator' && (
                          <span style={{
                            fontSize: '10px', padding: '2px 7px', borderRadius: '6px',
                            background: '#f59e0b22', color: '#f59e0b', fontWeight: 500,
                          }}>MOD</span>
                        )}
                      </div>
                      <div style={{ fontFamily: FONTS.sans, fontSize: '12px', color: COLORS.textMuted, marginTop: '2px' }}>
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
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '24px', fontFamily: FONTS.sans, fontSize: '13px' }}>
              <span style={{ color: COLORS.textMuted }}>
                {registrationCount || 0}{capacity ? `/${capacity}` : ''} registered
              </span>
              {capacity && (
                <div style={{ flex: 1, height: '4px', background: COLORS.border, borderRadius: '2px', overflow: 'hidden', maxWidth: '120px' }}>
                  <div style={{
                    width: `${Math.min(100, ((registrationCount || 0) / capacity) * 100)}%`,
                    height: '100%', background: isFull ? '#f87171' : '#22c55e', transition: 'width 0.3s',
                  }} />
                </div>
              )}
            </div>
          )}

          {/* Actions */}
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <button onClick={() => onToggleBookmark(session.id)} style={{
              fontFamily: FONTS.mono, fontSize: '13px', fontWeight: 600,
              padding: '11px 22px',
              background: isBookmarked ? COLORS.primaryDim : 'transparent',
              color: isBookmarked ? COLORS.primary : COLORS.textMuted,
              border: `1px solid ${isBookmarked ? COLORS.primary : COLORS.border}`,
              borderRadius: '10px', cursor: 'pointer', transition: 'all 0.15s',
            }}>
              {isBookmarked ? '★ Quest saved' : '+ Add to quest'}
            </button>
            {isRoundtable && (
              <button
                onClick={() => !isFull && !isRegistered && onJoinRoundtable(session.id)}
                disabled={isFull && !isRegistered}
                style={{
                  fontFamily: FONTS.mono, fontSize: '13px', fontWeight: 600,
                  padding: '11px 22px',
                  background: isRegistered ? 'rgba(34,197,94,0.15)' : 'transparent',
                  color: isRegistered ? '#22c55e' : isFull ? COLORS.textMuted : '#22c55e',
                  border: `1px solid ${isRegistered ? '#22c55e' : isFull ? COLORS.border : '#22c55e'}`,
                  borderRadius: '10px', cursor: isRegistered || isFull ? 'default' : 'pointer',
                }}>
                {isRegistered ? '✓ Registered' : isFull ? 'Full' : 'Join roundtable'}
              </button>
            )}
          </div>
        </div>

        <div style={{ padding: '14px 28px', borderTop: `1px solid ${COLORS.border}`, display: 'flex', justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{
            fontFamily: FONTS.sans, fontSize: '13px',
            padding: '8px 18px', background: 'none',
            border: `1px solid ${COLORS.border}`, borderRadius: '8px',
            color: COLORS.textMuted, cursor: 'pointer',
          }}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Mission Card ───────────────────────────────────────────────────────────────
function MissionCard({ session, speakerMap, stageMap, bookmarks, onToggleBookmark, isRoundtable, registrationCount, isRegistered, onJoinRoundtable, capacity, onClick }) {
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
  const stageName = session.stage_id && stageMap?.[session.stage_id] ? stageMap[session.stage_id].name : null;
  const isFull = isRoundtable && capacity && registrationCount >= capacity;

  return (
    <div
      onClick={onClick}
      style={{
        background: COLORS.bgCard,
        border: `1px solid ${COLORS.border}`,
        borderLeft: `3px solid ${topicColor}`,
        borderRadius: '12px',
        padding: '16px',
        display: 'flex', flexDirection: 'column', gap: '12px',
        cursor: 'pointer', position: 'relative',
        transition: 'border-color 0.15s, transform 0.15s, box-shadow 0.15s',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.borderColor = COLORS.primary;
        e.currentTarget.style.borderLeftColor = COLORS.primary;
        e.currentTarget.style.transform = 'translateY(-1px)';
        e.currentTarget.style.boxShadow = COLORS.glow;
      }}
      onMouseLeave={e => {
        e.currentTarget.style.borderColor = COLORS.border;
        e.currentTarget.style.borderLeftColor = topicColor;
        e.currentTarget.style.transform = 'translateY(0)';
        e.currentTarget.style.boxShadow = 'none';
      }}
    >
      {/* Top row: badges + quest button */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', flex: 1 }}>
          <span style={{
            fontFamily: FONTS.mono, fontSize: '11px', fontWeight: 600,
            padding: '3px 10px', borderRadius: '20px',
            background: 'rgba(255,255,255,0.06)',
            border: '1px solid rgba(255,255,255,0.1)',
            color: COLORS.textMuted, letterSpacing: '0.04em', textTransform: 'uppercase',
          }}>
            {session.format || 'Session'}
          </span>
          {session.topics?.slice(0, 2).map(t => (
            <span key={t} style={{
              fontFamily: FONTS.mono, fontSize: '10px',
              padding: '3px 9px', borderRadius: '20px',
              background: (TOPIC_TAG_COLORS[t] || COLORS.primary) + '1a',
              border: `1px solid ${(TOPIC_TAG_COLORS[t] || COLORS.primary)}40`,
              color: TOPIC_TAG_COLORS[t] || COLORS.primary,
            }}>
              {t}
            </span>
          ))}
        </div>

        {/* + Quest button */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            if (!isBookmarked) {
              setFlashState('added');
              setTimeout(() => setFlashState(null), 700);
            }
            onToggleBookmark(session.id);
          }}
          title={isBookmarked ? 'Remove from quest' : 'Add to quest'}
          style={{
            width: '30px', height: '30px', borderRadius: '8px', flexShrink: 0,
            background: flashState === 'added'
              ? 'rgba(34,197,94,0.15)'
              : isBookmarked ? COLORS.primaryDim : 'rgba(255,255,255,0.05)',
            border: `1px solid ${
              flashState === 'added' ? '#22c55e'
              : isBookmarked ? COLORS.primary
              : 'rgba(255,255,255,0.1)'
            }`,
            color: flashState === 'added' ? '#22c55e' : isBookmarked ? COLORS.primary : COLORS.textMuted,
            cursor: 'pointer', fontSize: '15px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'all 0.15s', lineHeight: 1,
          }}
        >
          {flashState === 'added' ? '✓' : isBookmarked ? '★' : '+'}
        </button>
      </div>

      {/* Title */}
      <h3 style={{
        fontFamily: FONTS.mono, fontSize: '15px', fontWeight: 600,
        color: COLORS.textPrimary, margin: 0,
        lineHeight: 1.4, letterSpacing: '-0.01em',
      }}>
        {session.title}
      </h3>

      {/* Bottom: location + speaker avatars */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
        {stageName && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            <span style={{ color: COLORS.textMuted, fontSize: '13px' }}>◎</span>
            <span style={{ fontFamily: FONTS.sans, fontSize: '13px', color: COLORS.textMuted }}>{stageName}</span>
          </div>
        )}
        {sessionSpeakers.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '7px', flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center' }}>
              {sessionSpeakers.slice(0, 4).map(({ speaker: sp }, i) => (
                <div key={sp.id} style={{ marginLeft: i > 0 ? '-7px' : 0, zIndex: 4 - i, position: 'relative' }}>
                  <SpeakerAvatar name={sp.name} size={24} />
                </div>
              ))}
            </div>
            <span style={{
              fontFamily: FONTS.sans, fontSize: '13px', color: COLORS.textMuted,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {sessionSpeakers.map(({ speaker: sp, role }) =>
                role === 'moderator' ? `${sp.name} (mod)` : sp.name
              ).join(', ')}
            </span>
          </div>
        )}
      </div>

      {/* Roundtable bar */}
      {isRoundtable && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontFamily: FONTS.sans, fontSize: '12px' }}>
          <span style={{ color: COLORS.textMuted }}>
            {registrationCount || 0}{capacity ? `/${capacity}` : ''} registered
          </span>
          {capacity && (
            <div style={{ height: '3px', background: COLORS.border, borderRadius: '2px', overflow: 'hidden', width: '60px' }}>
              <div style={{
                width: `${Math.min(100, ((registrationCount || 0) / capacity) * 100)}%`,
                height: '100%', background: isFull ? '#f87171' : '#22c55e', transition: 'width 0.3s',
              }} />
            </div>
          )}
          <button
            onClick={(e) => { e.stopPropagation(); if (!isFull && !isRegistered) onJoinRoundtable(session.id); }}
            disabled={isFull && !isRegistered}
            style={{
              fontFamily: FONTS.mono, fontSize: '11px', padding: '3px 10px',
              background: isRegistered ? 'rgba(34,197,94,0.12)' : 'transparent',
              color: isRegistered ? '#22c55e' : isFull ? COLORS.textMuted : '#22c55e',
              border: `1px solid ${isRegistered ? '#22c55e' : isFull ? COLORS.border : '#22c55e55'}`,
              borderRadius: '6px', cursor: isRegistered || isFull ? 'default' : 'pointer',
            }}>
            {isRegistered ? '✓ Registered' : isFull ? 'Full' : 'Join'}
          </button>
        </div>
      )}
    </div>
  );
}

// ── Activation Card (Day 0) ────────────────────────────────────────────────────
function ActivationCard({ session, bookmarks, onToggleBookmark, onClick }) {
  const isBookmarked = bookmarks.includes(session.id);
  const [flashState, setFlashState] = useState(null);
  const startMins = session.start_time ? isoToMinutes(session.start_time) : null;
  const endMins = startMins !== null ? startMins + session.duration_minutes : null;
  const timeLabel = startMins !== null ? `${formatTime(startMins)} – ${formatTime(endMins)}` : null;

  return (
    <div onClick={onClick} style={{
      background: COLORS.bgCard, border: `1px solid ${COLORS.border}`,
      borderRadius: '12px', padding: '16px',
      display: 'flex', flexDirection: 'column', gap: '10px',
      cursor: 'pointer', position: 'relative',
      transition: 'border-color 0.15s, transform 0.15s, box-shadow 0.15s',
    }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = COLORS.primary; e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = COLORS.glow; }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = COLORS.border; e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = 'none'; }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
          {timeLabel && (
            <span style={{ fontFamily: FONTS.mono, fontSize: '12px', color: COLORS.primary }}>{timeLabel}</span>
          )}
          {session.invite_only && (
            <span style={{
              fontFamily: FONTS.mono, fontSize: '10px', fontWeight: 600,
              padding: '3px 10px', borderRadius: '20px',
              background: '#f59e0b22', border: '1px solid #f59e0b44', color: '#f59e0b',
              letterSpacing: '0.04em',
            }}>INVITE ONLY</span>
          )}
        </div>
        <button onClick={(e) => {
          e.stopPropagation();
          if (!isBookmarked) { setFlashState('added'); setTimeout(() => setFlashState(null), 700); }
          onToggleBookmark(session.id);
        }} title={isBookmarked ? 'Remove from quest' : 'Add to quest'} style={{
          width: '30px', height: '30px', borderRadius: '8px', flexShrink: 0,
          background: flashState === 'added' ? 'rgba(34,197,94,0.15)' : isBookmarked ? COLORS.primaryDim : 'rgba(255,255,255,0.05)',
          border: `1px solid ${flashState === 'added' ? '#22c55e' : isBookmarked ? COLORS.primary : 'rgba(255,255,255,0.1)'}`,
          color: flashState === 'added' ? '#22c55e' : isBookmarked ? COLORS.primary : COLORS.textMuted,
          cursor: 'pointer', fontSize: '15px', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s', lineHeight: 1,
        }}>
          {flashState === 'added' ? '\u2713' : isBookmarked ? '\u2605' : '+'}
        </button>
      </div>

      <h3 style={{ fontFamily: FONTS.mono, fontSize: '15px', fontWeight: 600, color: COLORS.textPrimary, margin: 0, lineHeight: 1.4 }}>
        {session.title}
      </h3>

      <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap', fontSize: '13px' }}>
        {session.venue && (
          <span style={{ fontFamily: FONTS.sans, color: COLORS.textMuted }}>{'\uD83D\uDCCD'} {session.venue}</span>
        )}
        {session.host && (
          <span style={{ fontFamily: FONTS.sans, color: COLORS.textMuted }}>Hosted by {session.host}</span>
        )}
      </div>

      {session.description && (
        <div style={{ fontFamily: FONTS.sans, fontSize: '13px', color: COLORS.textMuted, lineHeight: 1.6, marginTop: '2px' }}>
          {session.description.length > 120 ? session.description.slice(0, 120) + '...' : session.description}
        </div>
      )}
    </div>
  );
}

// ── Evening Events Section (View) ─────────────────────────────────────────────
function ViewEveningEvents({ sessions, selectedDay, bookmarks, onToggleBookmark, onClick }) {
  const eveningEvents = sessions.filter(s => s.day === selectedDay && s.type === 'event');
  if (eveningEvents.length === 0) return null;

  eveningEvents.sort((a, b) => {
    if (!a.start_time) return 1;
    if (!b.start_time) return -1;
    return isoToMinutes(a.start_time) - isoToMinutes(b.start_time);
  });

  return (
    <div style={{ marginTop: '32px', paddingTop: '24px', borderTop: `1px solid ${COLORS.border}` }}>
      <div style={{ fontFamily: FONTS.mono, fontSize: '12px', color: COLORS.textMuted, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '16px' }}>
        Evening Events
      </div>
      <div style={{ display: 'flex', gap: '14px', overflowX: 'auto', paddingBottom: '8px' }}>
        {eveningEvents.map(s => {
          const startMins = s.start_time ? isoToMinutes(s.start_time) : null;
          const endMins = startMins !== null ? startMins + s.duration_minutes : null;
          const timeLabel = startMins !== null ? `${formatTime(startMins)} – ${formatTime(endMins)}` : null;
          const isBookmarked = bookmarks.includes(s.id);
          return (
            <div key={s.id} onClick={() => onClick(s)} style={{
              background: COLORS.bgCard, border: `1px solid ${COLORS.border}`,
              borderRadius: '12px', padding: '16px', minWidth: '260px', maxWidth: '320px', flexShrink: 0,
              cursor: 'pointer', transition: 'border-color 0.15s, box-shadow 0.15s',
            }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = COLORS.primary; e.currentTarget.style.boxShadow = COLORS.glow; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = COLORS.border; e.currentTarget.style.boxShadow = 'none'; }}
            >
              {timeLabel && <div style={{ fontFamily: FONTS.mono, fontSize: '11px', color: COLORS.primary, marginBottom: '8px' }}>{timeLabel}</div>}
              <div style={{ fontFamily: FONTS.mono, fontSize: '14px', fontWeight: 600, color: COLORS.textPrimary, marginBottom: '6px' }}>{s.title}</div>
              <div style={{ fontFamily: FONTS.sans, fontSize: '12px', color: COLORS.textMuted }}>
                {s.venue && <span>{'\uD83D\uDCCD'} {s.venue}</span>}
                {s.venue && s.host && <span> · </span>}
                {s.host && <span>{s.host}</span>}
              </div>
              {s.invite_only && (
                <span style={{
                  display: 'inline-block', marginTop: '8px',
                  fontFamily: FONTS.mono, fontSize: '10px', fontWeight: 600,
                  padding: '3px 10px', borderRadius: '20px',
                  background: '#f59e0b22', border: '1px solid #f59e0b44', color: '#f59e0b',
                }}>INVITE ONLY</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── View Page ──────────────────────────────────────────────────────────────────
export default function ViewPage() {
  const [sessions, setSessions] = useState([]);
  const [speakers, setSpeakers] = useState([]);
  const [stages, setStages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedDay, setSelectedDay] = useState('day1');
  const [activeTopics, setActiveTopics] = useState([]);
  const [showBookmarksOnly, setShowBookmarksOnly] = useState(false);
  const [selectedSession, setSelectedSession] = useState(null);
  const [attendee, setAttendee] = useState(null);
  const [showIdentityModal, setShowIdentityModal] = useState(false);
  const [pendingAction, setPendingAction] = useState(null);
  const [questSaves, setQuestSaves] = useState([]);
  const [rtRegistrations, setRtRegistrations] = useState([]);
  const [myRtRegistrations, setMyRtRegistrations] = useState([]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token');
    if (token) {
      supabase.from('attendees').select('*').eq('token', token).single()
        .then(({ data, error }) => {
          if (data && !error) {
            localStorage.setItem(TOKEN_KEY, data.token);
            localStorage.setItem(ATTENDEE_KEY, JSON.stringify(data));
            setAttendee(data);
          }
          window.history.replaceState({}, '', '/view');
        });
    } else {
      const storedToken = localStorage.getItem(TOKEN_KEY);
      const storedAttendee = localStorage.getItem(ATTENDEE_KEY);
      if (storedToken && storedAttendee) {
        try {
          setAttendee(JSON.parse(storedAttendee));
          supabase.from('attendees').select('*').eq('token', storedToken).single()
            .then(({ data, error }) => {
              if (data && !error) { setAttendee(data); localStorage.setItem(ATTENDEE_KEY, JSON.stringify(data)); }
              else { localStorage.removeItem(TOKEN_KEY); localStorage.removeItem(ATTENDEE_KEY); setAttendee(null); }
            });
        } catch { localStorage.removeItem(TOKEN_KEY); localStorage.removeItem(ATTENDEE_KEY); }
      }
    }
  }, []);

  useEffect(() => {
    if (!attendee) { setQuestSaves([]); setMyRtRegistrations([]); return; }
    supabase.from('quest_saves').select('session_id').eq('attendee_id', attendee.id)
      .then(({ data }) => { if (data) setQuestSaves(data.map(d => d.session_id)); });
    supabase.from('roundtable_registrations').select('session_id').eq('attendee_id', attendee.id)
      .then(({ data }) => { if (data) setMyRtRegistrations(data.map(d => d.session_id)); });
  }, [attendee]);

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
        if (sessRes.data) setSessions(sessRes.data.filter(isViewableSession));
        if (spkRes.data) setSpeakers(spkRes.data);
        if (stgRes.data) setStages(stgRes.data);
        if (rtRegRes.data) setRtRegistrations(rtRegRes.data);
      } catch (e) { console.error('ViewPage fetch error:', e); }
      setLoading(false);
    };
    fetchData();
  }, []);

  const rtCountMap = useMemo(() => {
    const map = {};
    rtRegistrations.forEach(r => { map[r.session_id] = (map[r.session_id] || 0) + 1; });
    return map;
  }, [rtRegistrations]);

  const roundtableStageIds = useMemo(() =>
    new Set(stages.filter(s => (s.max_columns || 1) > 1).map(s => s.id)), [stages]);

  const speakerMap = useMemo(() => {
    const map = {}; speakers.forEach(sp => { map[sp.id] = sp; }); return map;
  }, [speakers]);

  const stageMap = useMemo(() => {
    const map = {}; stages.forEach(st => { map[st.id] = st; }); return map;
  }, [stages]);

  const day0Activations = useMemo(() => {
    let filtered = sessions.filter(s => s.day === 'day0' && s.type === 'event');
    if (showBookmarksOnly) filtered = filtered.filter(s => questSaves.includes(s.id));
    filtered.sort((a, b) => {
      if (!a.start_time) return 1;
      if (!b.start_time) return -1;
      return isoToMinutes(a.start_time) - isoToMinutes(b.start_time);
    });
    return filtered;
  }, [sessions, showBookmarksOnly, questSaves]);

  const sessionsByStage = useMemo(() => {
    let filtered = sessions.filter(s => s.day === selectedDay && s.start_time && s.type !== 'event');
    if (activeTopics.length > 0) filtered = filtered.filter(s => s.topics?.some(t => activeTopics.includes(t)));
    if (showBookmarksOnly) filtered = filtered.filter(s => questSaves.includes(s.id));
    filtered.sort((a, b) => isoToMinutes(a.start_time) - isoToMinutes(b.start_time));
    const byStage = {};
    filtered.forEach(s => { if (!byStage[s.stage_id]) byStage[s.stage_id] = []; byStage[s.stage_id].push(s); });
    return stages.filter(st => byStage[st.id]?.length > 0).map(st => ({ stage: st, sessions: byStage[st.id] }));
  }, [sessions, stages, selectedDay, activeTopics, showBookmarksOnly, questSaves]);

  const requireIdentity = useCallback((actionType, sessionId) => {
    if (attendee) return true;
    setPendingAction({ type: actionType, sessionId });
    setShowIdentityModal(true);
    return false;
  }, [attendee]);

  const toggleQuestSave = useCallback(async (sessionId) => {
    if (!requireIdentity('quest', sessionId)) return;
    const isSaved = questSaves.includes(sessionId);
    if (isSaved) {
      setQuestSaves(prev => prev.filter(id => id !== sessionId));
      await supabase.from('quest_saves').delete().eq('attendee_id', attendee.id).eq('session_id', sessionId);
    } else {
      setQuestSaves(prev => [...prev, sessionId]);
      await supabase.from('quest_saves').upsert({ attendee_id: attendee.id, session_id: sessionId }, { onConflict: 'attendee_id,session_id' });
    }
  }, [attendee, questSaves, requireIdentity]);

  const joinRoundtable = useCallback(async (sessionId) => {
    if (!requireIdentity('roundtable', sessionId)) return;
    if (myRtRegistrations.includes(sessionId)) return;
    setMyRtRegistrations(prev => [...prev, sessionId]);
    setRtRegistrations(prev => [...prev, { session_id: sessionId }]);
    const { error } = await supabase.from('roundtable_registrations')
      .upsert({ attendee_id: attendee.id, session_id: sessionId }, { onConflict: 'attendee_id,session_id' });
    if (error) { console.error('RT reg error:', error); setMyRtRegistrations(prev => prev.filter(id => id !== sessionId)); }
  }, [attendee, myRtRegistrations, requireIdentity]);

  const handleIdentified = useCallback((newAttendee) => {
    setAttendee(newAttendee);
    if (pendingAction) {
      setTimeout(() => {
        if (pendingAction.type === 'quest') {
          setQuestSaves(prev => [...prev, pendingAction.sessionId]);
          supabase.from('quest_saves').upsert({ attendee_id: newAttendee.id, session_id: pendingAction.sessionId }, { onConflict: 'attendee_id,session_id' });
        } else if (pendingAction.type === 'roundtable') {
          setMyRtRegistrations(prev => [...prev, pendingAction.sessionId]);
          setRtRegistrations(prev => [...prev, { session_id: pendingAction.sessionId }]);
          supabase.from('roundtable_registrations').upsert({ attendee_id: newAttendee.id, session_id: pendingAction.sessionId }, { onConflict: 'attendee_id,session_id' });
        }
        setPendingAction(null);
      }, 100);
    }
  }, [pendingAction]);

  const toggleTopic = (tag) => setActiveTopics(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]);

  return (
    <div style={{ minHeight: '100vh', background: COLORS.bg, color: COLORS.textPrimary, fontFamily: FONTS.sans }}>

      <IdentityModal
        isOpen={showIdentityModal}
        onClose={() => { setShowIdentityModal(false); setPendingAction(null); }}
        onIdentified={handleIdentified}
        pendingAction={pendingAction?.type}
      />

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
        background: COLORS.bgCard, borderBottom: `1px solid ${COLORS.border}`,
        padding: '18px 28px', position: 'sticky', top: 0, zIndex: 100,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '16px', position: 'relative' }}>
          <div style={{ textAlign: 'center' }}>
            <h1 style={{ fontFamily: FONTS.pixel, fontSize: '16px', fontWeight: 400, color: COLORS.textPrimary, margin: 0, letterSpacing: '0.02em' }}>
              Fintech NerdCon
            </h1>
            <div style={{ fontFamily: FONTS.sans, fontSize: '13px', color: COLORS.textMuted, marginTop: '6px' }}>
              San Diego · Nov 18–20, 2026
            </div>
          </div>
          <div style={{ position: 'absolute', right: 0, display: 'flex', alignItems: 'center', gap: '10px' }}>
            {attendee && (
              <div style={{ fontFamily: FONTS.sans, fontSize: '13px', color: COLORS.textMuted, padding: '6px 14px', border: `1px solid ${COLORS.border}`, borderRadius: '8px' }}>
                <span style={{ color: COLORS.textPrimary, fontWeight: 500 }}>{attendee.name}</span>
                {attendee.company && <span> · {attendee.company}</span>}
              </div>
            )}
            <button
              onClick={() => {
                if (!attendee && !showBookmarksOnly) { requireIdentity('quest', null); return; }
                setShowBookmarksOnly(prev => !prev);
              }}
              style={{
                fontFamily: FONTS.mono, fontSize: '12px', fontWeight: 600,
                padding: '8px 18px',
                background: showBookmarksOnly ? COLORS.primaryDim : 'transparent',
                color: showBookmarksOnly ? COLORS.primary : COLORS.textMuted,
                border: `1px solid ${showBookmarksOnly ? COLORS.primary : COLORS.border}`,
                borderRadius: '8px', cursor: 'pointer', transition: 'all 0.15s',
              }}
            >
              {showBookmarksOnly ? '← All sessions' : `My quest (${questSaves.length})`}
            </button>
          </div>
        </div>

        {/* Day tabs */}
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', justifyContent: 'center' }}>
          {DAYS.map((day, i) => (
            <button key={day.id} onClick={() => setSelectedDay(day.id)} style={{
              fontFamily: FONTS.pixel, fontSize: '10px', fontWeight: 400,
              padding: '10px 20px',
              background: selectedDay === day.id ? COLORS.primary : 'transparent',
              color: selectedDay === day.id ? '#fff' : COLORS.textMuted,
              border: `1px solid ${selectedDay === day.id ? COLORS.primary : COLORS.border}`,
              borderRadius: '8px', cursor: 'pointer', transition: 'all 0.2s',
            }}>
              LVL {i} · {day.date}
            </button>
          ))}
        </div>
      </div>

      {/* ── Topic filter bar ─────────────────────────────────────────────── */}
      <div style={{
        padding: '12px 28px', display: 'flex', flexWrap: 'wrap', gap: '6px',
        borderBottom: `1px solid ${COLORS.border}`, background: 'rgb(8, 8, 8)',
      }}>
        {TOPIC_TAGS.map(tag => {
          const isActive = activeTopics.includes(tag);
          const tagColor = TOPIC_TAG_COLORS[tag] || COLORS.primary;
          return (
            <button key={tag} onClick={() => toggleTopic(tag)} style={{
              fontFamily: FONTS.mono, fontSize: '11px',
              padding: '4px 12px', borderRadius: '20px', cursor: 'pointer',
              background: isActive ? tagColor + '22' : 'transparent',
              border: `1px solid ${isActive ? tagColor : COLORS.border}`,
              color: isActive ? tagColor : COLORS.textMuted,
              transition: 'all 0.15s',
            }}>
              {tag}
            </button>
          );
        })}
        {activeTopics.length > 0 && (
          <button onClick={() => setActiveTopics([])} style={{
            fontFamily: FONTS.mono, fontSize: '11px',
            padding: '4px 12px', borderRadius: '20px', cursor: 'pointer',
            background: 'transparent', border: '1px solid #f87171', color: '#f87171',
          }}>
            Clear
          </button>
        )}
      </div>

      {/* ── Stage columns ─────────────────────────────────────────────────── */}
      <main style={{ padding: '24px 28px', width: '100%', boxSizing: 'border-box', overflowX: 'auto' }}>
        {loading ? (
          <div style={{
            fontFamily: FONTS.mono, fontSize: '14px', fontWeight: 600,
            color: COLORS.primary, textAlign: 'center', padding: '80px 0',
            animation: 'pulse 1.5s infinite',
          }}>
            Loading sessions...
          </div>
        ) : selectedDay === 'day0' ? (
          /* Day 0 — single vertical activation list */
          <div style={{ maxWidth: '640px', margin: '0 auto' }}>
            {day0Activations.length === 0 ? (
              <div style={{ fontFamily: FONTS.sans, fontSize: '15px', color: COLORS.textMuted, textAlign: 'center', padding: '80px 0', lineHeight: 2 }}>
                {showBookmarksOnly ? 'No activations saved to your quest yet.' : 'No activations scheduled for Day 0.'}
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div style={{
                  fontFamily: FONTS.mono, fontSize: '12px', color: COLORS.textMuted,
                  letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '6px',
                }}>
                  Activations ({day0Activations.length})
                </div>
                {day0Activations.map(s => (
                  <ActivationCard
                    key={s.id}
                    session={s}
                    bookmarks={questSaves}
                    onToggleBookmark={toggleQuestSave}
                    onClick={() => setSelectedSession(s)}
                  />
                ))}
              </div>
            )}
          </div>
        ) : sessionsByStage.length === 0 ? (
          <div style={{ fontFamily: FONTS.sans, fontSize: '15px', color: COLORS.textMuted, textAlign: 'center', padding: '80px 0', lineHeight: 2 }}>
            {showBookmarksOnly ? 'No sessions saved to your quest yet.' : 'No sessions scheduled.'}
          </div>
        ) : (
          <>
            <div className="view-stage-columns" style={{ display: 'flex', gap: '20px', alignItems: 'flex-start' }}>
              {sessionsByStage.map(({ stage, sessions: stageSessions }) => (
                <div key={stage.id} className="view-stage-column" style={{ width: '340px', minWidth: '340px', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {/* Stage header card */}
                  <div style={{
                    padding: '13px 16px', background: COLORS.bgCard,
                    border: `1px solid ${COLORS.border}`,
                    borderTop: `3px solid ${stage.color || COLORS.primary}`,
                    borderRadius: '12px',
                  }}>
                    <div style={{ fontFamily: FONTS.mono, fontSize: '13px', fontWeight: 700, color: stage.color || COLORS.primary, letterSpacing: '-0.01em' }}>
                      {stage.name}
                    </div>
                    <div style={{ fontFamily: FONTS.sans, fontSize: '12px', color: COLORS.textMuted, marginTop: '4px' }}>
                      {stageSessions.length} {stageSessions.length === 1 ? 'session' : 'sessions'}
                    </div>
                  </div>

                  {stageSessions.map(s => (
                    <MissionCard
                      key={s.id}
                      session={s}
                      speakerMap={speakerMap}
                      stageMap={stageMap}
                      bookmarks={questSaves}
                      onToggleBookmark={toggleQuestSave}
                      isRoundtable={roundtableStageIds.has(s.stage_id)}
                      registrationCount={rtCountMap[s.id] || 0}
                      isRegistered={myRtRegistrations.includes(s.id)}
                      onJoinRoundtable={joinRoundtable}
                      capacity={s.capacity}
                      onClick={() => setSelectedSession(s)}
                    />
                  ))}
                </div>
              ))}
            </div>

            {/* Evening Events for Days 1 & 2 */}
            <ViewEveningEvents
              sessions={sessions}
              selectedDay={selectedDay}
              bookmarks={questSaves}
              onToggleBookmark={toggleQuestSave}
              onClick={(s) => setSelectedSession(s)}
            />
          </>
        )}
      </main>

      <style>{`
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
        @media (max-width: 720px) {
          .view-stage-columns { flex-direction: column !important; }
          .view-stage-column { width: 100% !important; min-width: 0 !important; }
        }
      `}</style>
    </div>
  );
}
