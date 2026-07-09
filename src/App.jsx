import React, { useState, useMemo, useEffect, useRef, createContext, useContext } from 'react';
import { createClient } from '@supabase/supabase-js';
import { v4 as uuidv4 } from 'uuid';
import { TOPIC_TAGS, TOPIC_TAG_COLORS, FORMAT_TAGS } from './stages.config.js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

const AuthContext = createContext({ user: null, profile: null, role: 'commenter' });

// ── Build-view design tokens ("dark cockpit, light worktable") ───────────────
const BV = {
  paper: '#F7F5EF', paperLine: '#E5E1D6', paperLineSoft: '#EEEBE2',
  ink: '#1A1A17', inkSoft: '#6B6860', inkFaint: '#9C988D',
  cockpit: '#15161A', cockpitLine: '#2A2C33',
  card: '#ffffff', cardBorder: '#E5E1D6', cardShadow: '0 1px 2px rgba(20,20,15,.04)',
  cardHoverShadow: '0 4px 12px rgba(20,20,15,.12)',
  clash: '#DC2626', open: '#16A34A',
  mono: "'SF Mono',ui-monospace,'Cascadia Code',Menlo,monospace",
  sans: "'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif",
};
const TYPE_SPINE = {
  Keynote: '#C2410C', Panel: '#2563EB', Podcast: '#7C3AED', Workshop: '#0D9488',
  Roundtable: '#CA8A04', 'Fireside Chat': '#DB2777', Demo: '#059669',
  Bootcamp: '#0369A1', Interview: '#9333EA', 'Q&A': '#B45309',
  Rant: '#E63917',
};
const TYPE_TAG_BG = {
  Keynote: '#FDEBE2', Panel: '#E4ECFE', Podcast: '#EEE6FD', Workshop: '#DCF5F1',
  Roundtable: '#FEF3C7', 'Fireside Chat': '#FCE7F3', Demo: '#D1FAE5',
  Bootcamp: '#DBEAFE', Interview: '#EDE9FE', 'Q&A': '#FEF3C7',
  Rant: '#FEE2E2',
};

const DAYS = [
  { id: 'day0', label: 'Day 0', date: 'Nov 18', full: '2026-11-18' },
  { id: 'day1', label: 'Day 1', date: 'Nov 19', full: '2026-11-19' },
  { id: 'day2', label: 'Day 2', date: 'Nov 20', full: '2026-11-20' },
];

const SESSION_STATUSES = [
  { id: 'placeholder', label: 'Placeholder', color: '#080808', border: '#1a1a1a', textColor: '#333333', borderStyle: 'dashed', borderWidth: '1px' },
  { id: 'pencilled', label: 'Pencilled', color: '#1a1200', border: '#d97706', textColor: '#fbbf24', borderStyle: 'solid', borderWidth: '2px' },
  { id: 'confirmed', label: 'Confirmed', color: '#0a0a0a', border: '#3568FF', textColor: '#ffffff', borderStyle: 'solid', borderWidth: '1px' },
];

const BLOCK_TYPES = [
  { id: 'transition', label: 'TRANSITION', defaultDuration: 5, color: '#f59e0b', bgColor: '#2a1a00', stripeColor: '#f59e0b' },
  { id: 'break', label: 'BREAK', defaultDuration: 15, color: '#9ca3af', bgColor: '#1a1a1a', stripeColor: '#6b7280' },
  { id: 'lunch', label: 'LUNCH', defaultDuration: 60, color: '#f59e0b', bgColor: '#2a1800', stripeColor: '#d97706' },
  { id: 'networking', label: 'NETWORKING', defaultDuration: 30, color: '#3b82f6', bgColor: '#0a0f1f', stripeColor: '#3b82f6' },
  { id: 'stage-open', label: 'STAGE OPEN', defaultDuration: 5, color: '#22c55e', bgColor: '#0a1f0a', stripeColor: '#22c55e' },
  { id: 'stage-close', label: 'STAGE CLOSE', defaultDuration: 5, color: '#ef4444', bgColor: '#1f0a0a', stripeColor: '#ef4444' },
];

const parseTime = (timeStr) => { const [h, m] = timeStr.split(':').map(Number); return h * 60 + m; };
const formatTime = (minutes) => { const h = Math.floor(minutes / 60); const m = minutes % 60; const ampm = h >= 12 ? 'PM' : 'AM'; const displayH = h > 12 ? h - 12 : h === 0 ? 12 : h; return `${displayH}:${m.toString().padStart(2, '0')} ${ampm}`; };
const formatTime24 = (minutes) => { const h = Math.floor(minutes / 60); const m = minutes % 60; return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`; };
const minutesToIso = (day, minutes) => `${day}T${formatTime24(minutes)}:00+00:00`;
const isoToMinutes = (iso) => { const time = iso.split('T')[1].substring(0, 5); const [h, m] = time.split(':').map(Number); return h * 60 + m; };

const generateTimeSlots = () => { const slots = []; for (let m = 8 * 60 + 30; m <= 18 * 60; m += 5) slots.push(m); return slots; };
const TIME_SLOTS = generateTimeSlots();
const SLOT_HEIGHT = 20;
const TIME_COL_WIDTH = 72;
const STAGE_COL_WIDTH = 280;
const SIDEBAR_WIDTH = 280;

function checkOverlap(sessions, stageId, day, startMins, durationMins, excludeId, colIndex) {
  return sessions.some(s => {
    if (s.id === excludeId || s.stage_id !== stageId || s.day !== day || !s.start_time) return false;
    if (colIndex !== undefined && (s.column_index || 0) !== colIndex) return false;
    const sStart = isoToMinutes(s.start_time);
    const sEnd = sStart + s.duration_minutes;
    return startMins < sEnd && sStart < (startMins + durationMins);
  });
}

// ── Modal shell (reused) ──────────────────────────────────────────────────────
const ModalShell = ({ children, onClose, title, width = '640px' }) => (
  <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '16px' }}>
    <div style={{ background: 'rgb(13,13,13)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px', boxShadow: '0 0 20px rgba(53,104,255,0.3)', width: '100%', maxWidth: width, maxHeight: '90vh', overflowY: 'auto', fontFamily: "'JetBrains Mono', ui-monospace, monospace" }}>
      <div style={{ padding: '20px 24px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ margin: 0, color: '#3568FF', fontSize: '16px', letterSpacing: '0.1em', textTransform: 'uppercase' }}>{title}</h2>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'rgba(240,240,240,0.4)', cursor: 'pointer', fontSize: '20px' }}>×</button>
      </div>
      {children}
    </div>
  </div>
);

const inputStyle = { width: '100%', background: 'rgb(18,18,18)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '4px', padding: '8px 12px', color: 'rgb(240,240,240)', fontSize: '14px', boxSizing: 'border-box', fontFamily: "'JetBrains Mono', ui-monospace, monospace" };
const labelStyle = { display: 'block', color: 'rgba(240,240,240,0.4)', fontSize: '11px', letterSpacing: '0.1em', marginBottom: '6px', textTransform: 'uppercase' };

// ── Session Modal ─────────────────────────────────────────────────────────────
// Helper to normalize speakers from old flat array or new participant model
const normalizeSpeakers = (speakers) => {
  if (!speakers || !Array.isArray(speakers)) return [];
  return speakers.map(s => {
    if (typeof s === 'string') return { speaker_id: s, role: 'speaker', kind: 'speaker', status: 'confirmed' };
    return { kind: 'speaker', status: 'confirmed', role: s.role || 'speaker', ...s };
  });
};
const getSpeakerIds = (speakers) => normalizeSpeakers(speakers).filter(s => s.kind === 'speaker' && s.speaker_id).map(s => s.speaker_id);
const getSpeakerRole = (speakers, speakerId) => {
  const entry = normalizeSpeakers(speakers).find(s => s.speaker_id === speakerId);
  return entry?.role || 'speaker';
};
const getSeatDisplay = (sessionSpeakers, speakersArr, allSpeakers) => {
  const normalized = normalizeSpeakers(speakersArr);
  const seats = [];
  for (const entry of normalized) {
    if (entry.kind === 'speaker' && entry.speaker_id) {
      const sp = allSpeakers.find(s => s.id === entry.speaker_id);
      if (!sp) continue;
      const prefix = entry.role === 'moderator' ? '[MOD] ' : '';
      const suffix = entry.status === 'provisional' ? ' (TBC)' : '';
      seats.push({ text: `${prefix}${sp.name}${suffix}`, provisional: entry.status === 'provisional', kind: 'speaker' });
    } else if (entry.kind === 'company') {
      seats.push({ text: entry.label || 'Company TBD', provisional: true, kind: 'company' });
    } else if (entry.kind === 'guest') {
      seats.push({ text: entry.label || 'Guest TBD', provisional: true, kind: 'guest' });
    }
  }
  return seats;
};

function SessionModal({ isOpen, onClose, onSave, onDelete, editingSession, speakers, stages, selectedDay, onSpeakerAdded, clashInfo, isIgnored, onToggleIgnore, readOnly, onCommentsChange, prefillStageId, prefillTimeMins }) {
  const { user: authUser, profile, role } = useContext(AuthContext);
  const [title, setTitle] = useState('');
  const [status, setStatus] = useState('placeholder');
  const [format, setFormat] = useState('Panel');
  const [duration, setDuration] = useState(30);
  const [startTime, setStartTime] = useState('09:00');
  const [selectedSpeakers, setSelectedSpeakers] = useState([]);
  const [speakerSearch, setSpeakerSearch] = useState('');
  const [topics, setTopics] = useState([]);
  const [notes, setNotes] = useState('');
  const [description, setDescription] = useState('');
  const [stageId, setStageId] = useState('');
  const [capacity, setCapacity] = useState('');
  const [venue, setVenue] = useState('');
  const [host, setHost] = useState('');
  const [inviteOnly, setInviteOnly] = useState(false);
  const [newSpkName, setNewSpkName] = useState('');
  const [newSpkTitle, setNewSpkTitle] = useState('');
  const [newSpkCompany, setNewSpkCompany] = useState('');
  const [addingSpk, setAddingSpk] = useState(false);
  const [showAddSpk, setShowAddSpk] = useState(false);
  const [companyInput, setCompanyInput] = useState('');
  const [guestInput, setGuestInput] = useState('');
  const [showAddPlaceholder, setShowAddPlaceholder] = useState(false);
  const [sessionDate, setSessionDate] = useState('');
  const [commentText, setCommentText] = useState('');
  const [comments, setComments] = useState([]);
  const [postingComment, setPostingComment] = useState(false);
  const commentInputRef = useRef(null);

  const handleAddSpeaker = async () => {
    if (!newSpkName.trim() || addingSpk) return;
    setAddingSpk(true);
    const { data, error } = await supabase.from('speakers').insert({
      id: uuidv4(),
      name: newSpkName.trim(),
      title: newSpkTitle.trim() || null,
      company: newSpkCompany.trim() || null,
      created_at: new Date().toISOString(),
    }).select();
    if (error) { alert(error.message); setAddingSpk(false); return; }
    const newSpeaker = data[0];
    if (onSpeakerAdded) onSpeakerAdded(newSpeaker);
    setSelectedSpeakers(prev => [...prev, { speaker_id: newSpeaker.id, role: 'speaker', kind: 'speaker', status: 'confirmed' }]);
    setNewSpkName(''); setNewSpkTitle(''); setNewSpkCompany('');
    setAddingSpk(false);
  };

  const isBlock = editingSession?.type === 'block';

  useEffect(() => {
    if (editingSession) {
      setTitle(editingSession.title || '');
      setStatus(editingSession.status || 'placeholder');
      setFormat(editingSession.format || 'Panel');
      setDuration(editingSession.duration_minutes || 30);
      setSelectedSpeakers(normalizeSpeakers(editingSession.speakers));
      setSpeakerSearch(''); setCompanyInput(''); setGuestInput(''); setShowAddPlaceholder(false);
      setTopics(editingSession.topics || []);
      setNotes(editingSession.notes || '');
      setDescription(editingSession.description || '');
      setStageId(editingSession.stage_id || (stages[0]?.id || ''));
      setCapacity(editingSession.capacity ?? '');
      setVenue(editingSession.venue || '');
      setHost(editingSession.host || '');
      setInviteOnly(editingSession.invite_only || false);
      setSessionDate(editingSession.session_date || DAYS.find(d => d.id === editingSession.day)?.full || '');
      setComments(editingSession.comments || []);
      setCommentText('');
      if (editingSession.start_time) setStartTime(formatTime24(isoToMinutes(editingSession.start_time)));
    } else {
      setTitle(''); setStatus('placeholder'); setFormat('Panel');
      setDuration(30);
      setStartTime(prefillTimeMins != null ? formatTime24(prefillTimeMins) : '09:00');
      setSelectedSpeakers([]); setSpeakerSearch('');
      setCompanyInput(''); setGuestInput(''); setShowAddPlaceholder(false);
      setTopics([]); setNotes(''); setDescription('');
      setStageId(prefillStageId || stages[0]?.id || '');
      setSessionDate(DAYS.find(d => d.id === selectedDay)?.full || '');
      setCapacity(''); setVenue(''); setHost(''); setInviteOnly(false);
      setComments([]); setCommentText('');
    }
  }, [editingSession, isOpen, stages, prefillStageId, prefillTimeMins]);

  const handlePostComment = async () => {
    if (!commentText.trim() || !editingSession?.id || postingComment) return;
    setPostingComment(true);
    const newComment = {
      id: uuidv4(),
      author_email: authUser?.email || '',
      author_name: profile?.display_name || authUser?.email?.split('@')[0] || 'Unknown',
      role: role,
      text: commentText.trim(),
      created_at: new Date().toISOString(),
    };
    const updated = [...comments, newComment];
    const { error } = await supabase.rpc('update_session_comments', { session_id: editingSession.id, new_comments: updated });
    if (error) { alert('Failed to post comment: ' + error.message); setPostingComment(false); return; }
    setComments(updated);
    setCommentText('');
    setPostingComment(false);
    if (onCommentsChange) onCommentsChange(editingSession.id, updated);
  };

  const handleDeleteComment = async (commentId) => {
    if (!editingSession?.id) return;
    const updated = comments.filter(c => c.id !== commentId);
    const { error } = await supabase.rpc('update_session_comments', { session_id: editingSession.id, new_comments: updated });
    if (error) { alert('Failed to delete comment: ' + error.message); return; }
    setComments(updated);
    if (onCommentsChange) onCommentsChange(editingSession.id, updated);
  };

  if (!isOpen) return null;

  const isDay0 = selectedDay === 'day0';

  const handleSave = () => {
    const [h, m] = startTime.split(':').map(Number);
    const startMins = h * 60 + m;
    const dateForIso = sessionDate || DAYS.find(d => d.id === selectedDay)?.full;
    const derivedDay = DAYS.find(d => d.full === sessionDate)?.id || selectedDay;
    const session = {
      ...(editingSession || {}),
      id: editingSession?.id || null,
      title: title || (isDay0 ? 'Activation' : `${format} Session`),
      status: isBlock ? 'block' : status, format: isDay0 ? null : format, duration_minutes: duration,
      speakers: isDay0 ? [] : selectedSpeakers, topics: isDay0 ? [] : topics, notes, description,
      stage_id: isDay0 ? null : stageId, day: derivedDay,
      session_date: sessionDate || null,
      capacity: capacity === '' ? null : Number(capacity),
      venue: isDay0 ? (venue || null) : (editingSession?.venue || null),
      host: isDay0 ? (host || null) : (editingSession?.host || null),
      invite_only: isDay0 ? inviteOnly : (editingSession?.invite_only || false),
      type: isDay0 ? 'event' : (editingSession?.type || null),
      start_time: minutesToIso(dateForIso, startMins),
      end_time: minutesToIso(dateForIso, startMins + duration),
    };
    onSave(session);
    onClose();
  };

  if (readOnly && editingSession) {
    const statusDef = SESSION_STATUSES.find(s => s.id === editingSession.status) || SESSION_STATUSES[0];
    const seats = getSeatDisplay(null, editingSession.speakers, speakers);
    const stageName = stages.find(s => s.id === editingSession.stage_id)?.name;
    const spineColor = TYPE_SPINE[editingSession.format] || BV.inkFaint;
    const startMins = editingSession.start_time ? isoToMinutes(editingSession.start_time) : null;
    const endMins = startMins !== null ? startMins + (editingSession.duration_minutes || 0) : null;
    const timeStr = startMins !== null ? `${formatTime24(startMins)}–${formatTime24(endMins)}` : null;
    return (
      <ModalShell onClose={onClose} title={editingSession.title || 'Session'} width="540px">
        <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {/* Summary bar */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
            {editingSession.format && <span style={{ fontFamily: BV.mono, fontSize: '9px', letterSpacing: '0.5px', textTransform: 'uppercase', padding: '2px 8px', borderRadius: '3px', fontWeight: 600, background: TYPE_TAG_BG[editingSession.format] || 'rgba(255,255,255,0.06)', color: spineColor }}>{editingSession.format}</span>}
            <span style={{ fontFamily: BV.mono, fontSize: '9px', letterSpacing: '0.5px', padding: '2px 8px', borderRadius: '3px', background: statusDef.color, color: statusDef.textColor, border: `1px solid ${statusDef.border}` }}>{statusDef.label}</span>
            {timeStr && <span style={{ fontFamily: BV.mono, fontSize: '10px', color: 'rgba(240,240,240,0.5)' }}>{timeStr}</span>}
            {stageName && <span style={{ fontFamily: BV.mono, fontSize: '10px', color: 'rgba(240,240,240,0.35)' }}>{stageName}</span>}
          </div>
          {/* Speakers */}
          {seats.length > 0 && (
            <div style={{ fontSize: '12px', color: 'rgba(240,240,240,0.6)', lineHeight: 1.5 }}>
              {seats.map((s, i) => <span key={i} style={{
                ...(s.provisional ? { opacity: 0.7, fontStyle: 'italic' } : {}),
                ...(s.kind !== 'speaker' ? { fontStyle: 'italic' } : {}),
              }}>{i > 0 ? ', ' : ''}{s.text}</span>)}
            </div>
          )}
          {/* Topics */}
          {editingSession.topics?.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
              {editingSession.topics.map(t => <span key={t} style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '12px', background: (TOPIC_TAG_COLORS[t] || '#3568FF') + '22', color: TOPIC_TAG_COLORS[t] || '#3568FF', border: `1px solid ${(TOPIC_TAG_COLORS[t] || '#3568FF')}44` }}>{t}</span>)}
            </div>
          )}
          {/* Description */}
          {editingSession.description && (
            <div style={{ fontSize: '12px', color: 'rgba(240,240,240,0.5)', lineHeight: 1.5, borderLeft: '2px solid rgba(255,255,255,0.08)', paddingLeft: '12px' }}>{editingSession.description}</div>
          )}
          {/* Notes */}
          {editingSession.notes && (
            <div>
              <div style={{ fontSize: '9px', color: 'rgba(240,240,240,0.3)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '4px' }}>Internal Notes</div>
              <div style={{ fontSize: '11px', color: 'rgba(240,240,240,0.4)', lineHeight: 1.5, fontStyle: 'italic' }}>{editingSession.notes}</div>
            </div>
          )}
        </div>

        {/* Comment Thread */}
        <div style={{ padding: '16px 24px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          <div style={{ marginBottom: '12px' }}>
            <span style={{ fontSize: '11px', color: 'rgba(240,240,240,0.4)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
              Comments {comments.length > 0 && `(${comments.length})`}
            </span>
          </div>

          {comments.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '12px', maxHeight: '300px', overflowY: 'auto' }}>
              {comments.map(c => {
                const isOwn = c.author_email === authUser?.email;
                const isEditorComment = c.role === 'editor';
                const timeAgo = (() => {
                  const diff = Date.now() - new Date(c.created_at).getTime();
                  const mins = Math.floor(diff / 60000);
                  if (mins < 1) return 'just now';
                  if (mins < 60) return `${mins}m ago`;
                  const hrs = Math.floor(mins / 60);
                  if (hrs < 24) return `${hrs}h ago`;
                  return `${Math.floor(hrs / 24)}d ago`;
                })();
                return (
                  <div key={c.id} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '6px', padding: '8px 12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                      <span style={{ fontSize: '11px', fontWeight: 600, color: isEditorComment ? '#22c55e' : '#eab308' }}>{c.author_name}</span>
                      <span style={{ fontSize: '8px', letterSpacing: '0.5px', fontWeight: 700, padding: '1px 5px', borderRadius: '3px', background: isEditorComment ? 'rgba(34,197,94,0.12)' : 'rgba(234,179,8,0.12)', color: isEditorComment ? '#22c55e' : '#eab308' }}>{isEditorComment ? 'EDITOR' : 'COMMENTER'}</span>
                      <span style={{ fontSize: '9px', color: 'rgba(240,240,240,0.25)', marginLeft: 'auto' }}>{timeAgo}</span>
                      {isOwn && <button onClick={() => handleDeleteComment(c.id)} style={{ background: 'none', border: 'none', color: 'rgba(240,240,240,0.2)', cursor: 'pointer', fontSize: '12px', padding: '0 2px', lineHeight: 1 }} title="Delete comment">&times;</button>}
                    </div>
                    <div style={{ fontSize: '12px', color: 'rgba(240,240,240,0.7)', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{c.text}</div>
                  </div>
                );
              })}
            </div>
          )}

          <div style={{ display: 'flex', gap: '8px' }}>
            <input ref={commentInputRef} value={commentText} onChange={e => setCommentText(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handlePostComment(); } }}
              placeholder="Add a comment..." style={{ ...inputStyle, flex: 1, fontSize: '12px', padding: '8px 10px' }} />
            <button onClick={handlePostComment} disabled={!commentText.trim() || postingComment} style={{
              background: commentText.trim() ? '#3568FF' : 'rgba(255,255,255,0.05)', border: 'none', borderRadius: '4px', padding: '8px 14px',
              color: commentText.trim() ? '#fff' : 'rgba(240,240,240,0.2)', cursor: commentText.trim() ? 'pointer' : 'default',
              fontSize: '11px', fontFamily: 'inherit', fontWeight: 600, letterSpacing: '0.03em', transition: 'all .12s',
            }}>{postingComment ? '...' : 'Post'}</button>
          </div>
        </div>

        <div style={{ padding: '12px 24px', borderTop: '1px solid rgba(255,255,255,0.06)', display: 'flex', justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ background: 'none', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '4px', padding: '8px 16px', color: 'rgba(240,240,240,0.4)', cursor: 'pointer', fontSize: '12px', fontFamily: 'inherit' }}>Close</button>
        </div>
      </ModalShell>
    );
  }

  return (
    <ModalShell onClose={onClose} title={editingSession ? (isBlock ? 'Edit Block' : isDay0 ? 'Edit Activation' : 'Edit Session') : (isDay0 ? 'New Activation' : 'New Session')}>
      <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
        <div>
          <label style={labelStyle}>Title</label>
          <input value={title} onChange={e => setTitle(e.target.value)} placeholder={isDay0 ? "Activation name" : "Leave blank for auto title"} style={inputStyle} />
        </div>

        {!isBlock && !isDay0 && (
          <div>
            <label style={labelStyle}>Status</label>
            <div style={{ display: 'flex', gap: '8px' }}>
              {SESSION_STATUSES.map(s => (
                <button key={s.id} onClick={() => setStatus(s.id)} style={{
                  flex: 1, padding: '8px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', fontFamily: 'inherit',
                  background: status === s.id ? s.color : 'rgb(18,18,18)',
                  border: `1px solid ${status === s.id ? s.border : 'rgba(255,255,255,0.08)'}`,
                  color: status === s.id ? s.textColor : 'rgba(240,240,240,0.4)', letterSpacing: '0.05em'
                }}>{s.label}</button>
              ))}
            </div>
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
          {!isBlock && !isDay0 && (
            <div>
              <label style={labelStyle}>Format</label>
              <select value={format} onChange={e => setFormat(e.target.value)} style={inputStyle}>
                {FORMAT_TAGS.map(f => <option key={f}>{f}</option>)}
              </select>
            </div>
          )}
          <div>
            <label style={labelStyle}>Start Time</label>
            <input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Duration (min)</label>
            <input type="number" value={duration} min={0} step={5} onChange={e => setDuration(Number(e.target.value))} style={inputStyle} />
          </div>
          {!isBlock && !isDay0 && (
            <div>
              <label style={labelStyle}>Capacity</label>
              <input type="number" value={capacity} min={0} placeholder="—" onChange={e => setCapacity(e.target.value === '' ? '' : Number(e.target.value))} style={inputStyle} />
            </div>
          )}
        </div>

        {isDay0 && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <div>
                <label style={labelStyle}>Venue</label>
                <input value={venue} onChange={e => setVenue(e.target.value)} placeholder="e.g. Rooftop Bar, Pool Deck" style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Host</label>
                <input value={host} onChange={e => setHost(e.target.value)} placeholder="e.g. Company name" style={inputStyle} />
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <input type="checkbox" checked={inviteOnly} onChange={e => setInviteOnly(e.target.checked)} style={{ accentColor: '#f59e0b', width: '16px', height: '16px' }} />
              <label style={{ ...labelStyle, marginBottom: 0 }}>Invite Only</label>
            </div>
          </>
        )}

        {!isDay0 && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div>
              <label style={labelStyle}>Stage</label>
              <select value={stageId} onChange={e => setStageId(e.target.value)} style={inputStyle}>
                {stages.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Date</label>
              <select value={sessionDate} onChange={e => setSessionDate(e.target.value)} style={inputStyle}>
                {DAYS.map(d => <option key={d.id} value={d.full}>{d.label} — {d.date}</option>)}
              </select>
            </div>
          </div>
        )}

        {!isBlock && !isDay0 && (
          <>
            <div>
              <label style={labelStyle}>Topics</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {TOPIC_TAGS.map(t => (
                  <button key={t} onClick={() => setTopics(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t])} style={{
                    padding: '4px 10px', borderRadius: '20px', cursor: 'pointer', fontSize: '11px', fontFamily: 'inherit',
                    background: topics.includes(t) ? (TOPIC_TAG_COLORS[t] || '#3568FF') + '33' : 'rgb(18,18,18)',
                    border: `1px solid ${topics.includes(t) ? (TOPIC_TAG_COLORS[t] || '#3568FF') : 'rgba(255,255,255,0.08)'}`,
                    color: topics.includes(t) ? (TOPIC_TAG_COLORS[t] || '#3568FF') : 'rgba(240,240,240,0.4)',
                  }}>{t}</button>
                ))}
              </div>
            </div>
            <div>
              <label style={labelStyle}>Speakers</label>
              <input type="text" placeholder="Search speakers…" value={speakerSearch} onChange={e => setSpeakerSearch(e.target.value)}
                style={{ ...inputStyle, marginBottom: '8px', fontSize: '12px', padding: '6px 10px' }} />
              <div style={{ maxHeight: '200px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {speakers.filter(sp => {
                  if (!speakerSearch.trim()) return true;
                  const q = speakerSearch.toLowerCase();
                  return (sp.name || '').toLowerCase().includes(q) || (sp.title || '').toLowerCase().includes(q) || (sp.company || '').toLowerCase().includes(q);
                }).map(sp => {
                  const entry = selectedSpeakers.find(s => s.speaker_id === sp.id);
                  const isSelected = !!entry;
                  return (
                    <div key={sp.id} style={{
                      display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 10px',
                      background: isSelected ? 'rgba(53,104,255,0.1)' : 'rgb(18,18,18)',
                      border: `1px solid ${isSelected ? '#3568FF' : 'rgba(255,255,255,0.08)'}`,
                      borderRadius: '4px', cursor: 'pointer'
                    }}>
                      <input type="checkbox" checked={isSelected} onChange={() => {
                        setSelectedSpeakers(prev => isSelected
                          ? prev.filter(s => s.speaker_id !== sp.id)
                          : [...prev, { speaker_id: sp.id, role: 'speaker', kind: 'speaker', status: 'confirmed' }]
                        );
                      }} style={{ accentColor: '#3568FF', flexShrink: 0 }} />
                      <div style={{ flex: 1 }}>
                        <div style={{ color: 'rgb(240,240,240)', fontSize: '13px' }}>{sp.name}</div>
                        <div style={{ color: 'rgba(240,240,240,0.4)', fontSize: '11px' }}>{sp.title} · {sp.company}</div>
                      </div>
                      {isSelected && (<>
                        <button onClick={(e) => {
                          e.stopPropagation();
                          setSelectedSpeakers(prev => prev.map(s =>
                            s.speaker_id === sp.id ? { ...s, status: s.status === 'confirmed' ? 'provisional' : 'confirmed' } : s
                          ));
                        }} style={{
                          background: entry.status === 'provisional' ? 'rgba(234,179,8,0.15)' : 'rgba(34,197,94,0.15)',
                          border: `1px solid ${entry.status === 'provisional' ? '#eab308' : '#22c55e'}`,
                          borderRadius: '3px', padding: '2px 6px', cursor: 'pointer', fontSize: '8px',
                          color: entry.status === 'provisional' ? '#eab308' : '#22c55e',
                          letterSpacing: '0.05em', fontFamily: 'inherit', flexShrink: 0,
                        }}>
                          {entry.status === 'provisional' ? 'TBC' : 'OK'}
                        </button>
                        <button onClick={(e) => {
                          e.stopPropagation();
                          setSelectedSpeakers(prev => prev.map(s =>
                            s.speaker_id === sp.id ? { ...s, role: s.role === 'moderator' ? 'speaker' : 'moderator' } : s
                          ));
                        }} style={{
                          background: entry.role === 'moderator' ? '#f59e0b33' : 'rgb(18,18,18)',
                          border: `1px solid ${entry.role === 'moderator' ? '#f59e0b' : 'rgba(255,255,255,0.08)'}`,
                          borderRadius: '3px', padding: '2px 8px', cursor: 'pointer', fontSize: '9px',
                          color: entry.role === 'moderator' ? '#f59e0b' : 'rgba(240,240,240,0.4)',
                          letterSpacing: '0.05em', fontFamily: 'inherit', flexShrink: 0,
                        }}>
                          {entry.role === 'moderator' ? 'MOD' : 'SPK'}
                        </button>
                      </>)}
                    </div>
                  );
                })}
              </div>
              {/* Collapsible Add Speaker Form */}
              <button onClick={() => setShowAddSpk(prev => !prev)} style={{
                marginTop: '10px', background: 'none', border: `1px dashed rgba(255,255,255,0.08)`, borderRadius: '6px',
                padding: '8px 12px', cursor: 'pointer', fontSize: '11px', fontFamily: 'inherit',
                color: 'rgba(240,240,240,0.4)', letterSpacing: '0.05em', textTransform: 'uppercase', width: '100%', textAlign: 'left',
              }}>
                {showAddSpk ? '▾' : '▸'} Add new speaker
              </button>
              {showAddSpk && (
                <div style={{ marginTop: '6px', padding: '10px', background: 'rgb(13,13,13)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '6px' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '6px' }}>
                    <input value={newSpkName} onChange={e => setNewSpkName(e.target.value)} placeholder="Name *" style={inputStyle} />
                    <input value={newSpkTitle} onChange={e => setNewSpkTitle(e.target.value)} placeholder="Title" style={inputStyle} />
                    <input value={newSpkCompany} onChange={e => setNewSpkCompany(e.target.value)} placeholder="Company" style={inputStyle} />
                  </div>
                  <button onClick={handleAddSpeaker} disabled={!newSpkName.trim() || addingSpk} style={{
                    marginTop: '8px', background: newSpkName.trim() ? '#3568FF' : 'rgba(255,255,255,0.06)', border: 'none', borderRadius: '4px',
                    padding: '6px 16px', color: newSpkName.trim() ? '#fff' : 'rgba(240,240,240,0.4)', cursor: newSpkName.trim() ? 'pointer' : 'default',
                    fontSize: '11px', fontFamily: 'inherit', fontWeight: 600, letterSpacing: '0.03em',
                  }}>{addingSpk ? 'Adding…' : 'Add Speaker'}</button>
                </div>
              )}
              {/* Collapsible Add Placeholder Form */}
              <button onClick={() => setShowAddPlaceholder(prev => !prev)} style={{
                marginTop: '6px', background: 'none', border: `1px dashed rgba(255,255,255,0.08)`, borderRadius: '6px',
                padding: '8px 12px', cursor: 'pointer', fontSize: '11px', fontFamily: 'inherit',
                color: 'rgba(240,240,240,0.4)', letterSpacing: '0.05em', textTransform: 'uppercase', width: '100%', textAlign: 'left',
              }}>
                {showAddPlaceholder ? '▾' : '▸'} Add placeholder seat
              </button>
              {showAddPlaceholder && (
                <div style={{ marginTop: '6px', padding: '10px', background: 'rgb(13,13,13)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '6px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <input value={companyInput} onChange={e => setCompanyInput(e.target.value)} placeholder="Company name" style={{ ...inputStyle, flex: 1 }}
                      onKeyDown={e => { if (e.key === 'Enter' && companyInput.trim()) {
                        setSelectedSpeakers(prev => [...prev, { kind: 'company', label: companyInput.trim(), status: 'provisional', role: 'speaker' }]);
                        setCompanyInput('');
                      }}} />
                    <button onClick={() => { if (companyInput.trim()) {
                      setSelectedSpeakers(prev => [...prev, { kind: 'company', label: companyInput.trim(), status: 'provisional', role: 'speaker' }]);
                      setCompanyInput('');
                    }}} disabled={!companyInput.trim()} style={{
                      background: companyInput.trim() ? '#7C3AED' : 'rgba(255,255,255,0.06)', border: 'none', borderRadius: '4px',
                      padding: '6px 12px', color: companyInput.trim() ? '#fff' : 'rgba(240,240,240,0.4)', cursor: companyInput.trim() ? 'pointer' : 'default',
                      fontSize: '10px', fontFamily: 'inherit', fontWeight: 600, letterSpacing: '0.03em', whiteSpace: 'nowrap',
                    }}>+ Company</button>
                  </div>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <input value={guestInput} onChange={e => setGuestInput(e.target.value)} placeholder="Guest description" style={{ ...inputStyle, flex: 1 }}
                      onKeyDown={e => { if (e.key === 'Enter' && guestInput.trim()) {
                        setSelectedSpeakers(prev => [...prev, { kind: 'guest', label: guestInput.trim(), status: 'provisional', role: 'speaker' }]);
                        setGuestInput('');
                      }}} />
                    <button onClick={() => { if (guestInput.trim()) {
                      setSelectedSpeakers(prev => [...prev, { kind: 'guest', label: guestInput.trim(), status: 'provisional', role: 'speaker' }]);
                      setGuestInput('');
                    }}} disabled={!guestInput.trim()} style={{
                      background: guestInput.trim() ? '#0D9488' : 'rgba(255,255,255,0.06)', border: 'none', borderRadius: '4px',
                      padding: '6px 12px', color: guestInput.trim() ? '#fff' : 'rgba(240,240,240,0.4)', cursor: guestInput.trim() ? 'pointer' : 'default',
                      fontSize: '10px', fontFamily: 'inherit', fontWeight: 600, letterSpacing: '0.03em', whiteSpace: 'nowrap',
                    }}>+ Guest</button>
                  </div>
                </div>
              )}
              {/* Placeholder seats list */}
              {selectedSpeakers.filter(s => s.kind === 'company' || s.kind === 'guest').length > 0 && (
                <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <div style={{ fontSize: '10px', color: 'rgba(240,240,240,0.3)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: '2px' }}>Placeholder Seats</div>
                  {selectedSpeakers.map((seat, idx) => {
                    if (seat.kind !== 'company' && seat.kind !== 'guest') return null;
                    const kindColor = seat.kind === 'company' ? '#7C3AED' : '#0D9488';
                    return (
                      <div key={`ph-${idx}`} style={{
                        display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 10px',
                        background: 'rgba(255,255,255,0.03)', border: `1px solid ${kindColor}33`,
                        borderRadius: '4px',
                      }}>
                        <span style={{ fontSize: '9px', color: kindColor, letterSpacing: '0.06em', fontWeight: 600, textTransform: 'uppercase', flexShrink: 0 }}>
                          {seat.kind === 'company' ? 'CO' : 'GST'}
                        </span>
                        <span style={{ flex: 1, fontSize: '12px', color: 'rgb(220,220,220)', fontStyle: 'italic' }}>{seat.label}</span>
                        <button onClick={() => setSelectedSpeakers(prev => prev.map((s, i) =>
                          i === idx ? { ...s, status: s.status === 'confirmed' ? 'provisional' : 'confirmed' } : s
                        ))} style={{
                          background: seat.status === 'provisional' ? 'rgba(234,179,8,0.15)' : 'rgba(34,197,94,0.15)',
                          border: `1px solid ${seat.status === 'provisional' ? '#eab308' : '#22c55e'}`,
                          borderRadius: '3px', padding: '2px 6px', cursor: 'pointer', fontSize: '8px',
                          color: seat.status === 'provisional' ? '#eab308' : '#22c55e',
                          letterSpacing: '0.05em', fontFamily: 'inherit', flexShrink: 0,
                        }}>
                          {seat.status === 'provisional' ? 'TBC' : 'OK'}
                        </button>
                        <button onClick={() => setSelectedSpeakers(prev => prev.filter((_, i) => i !== idx))} style={{
                          background: 'none', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '3px',
                          padding: '2px 6px', cursor: 'pointer', fontSize: '10px', color: 'rgba(240,240,240,0.3)', fontFamily: 'inherit',
                        }}>×</button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        )}

        {!isBlock && (
          <div>
            <label style={labelStyle}>Description (public)</label>
            <textarea value={description} onChange={e => setDescription(e.target.value)} rows={4} placeholder="Public description shown to attendees..." style={{ ...inputStyle, resize: 'vertical' }} />
          </div>
        )}

        <div>
          <label style={labelStyle}>Notes (internal)</label>
          <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} placeholder="Internal notes (not shown to attendees)..." style={{ ...inputStyle, resize: 'vertical' }} />
        </div>

        {/* Speaker clash warning */}
        {editingSession && clashInfo && (
          <div style={{
            padding: '10px 14px', borderRadius: '6px',
            background: isIgnored ? 'rgba(255,255,255,0.04)' : clashInfo?.tier === 'hard' ? 'rgba(239,68,68,0.1)' : 'rgba(234,179,8,0.08)',
            border: `1px solid ${isIgnored ? 'rgba(255,255,255,0.08)' : '#ef4444'}`,
            display: 'flex', alignItems: 'center', gap: '10px',
          }}>
            <span style={{ fontSize: '14px' }}>{isIgnored ? '🔇' : '⚠️'}</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '11px', fontWeight: 'bold', color: isIgnored ? 'rgba(240,240,240,0.4)' : clashInfo?.tier === 'hard' ? '#f87171' : '#eab308', letterSpacing: '0.05em', textDecoration: isIgnored ? 'line-through' : 'none' }}>
                {clashInfo?.tier === 'hard' ? 'HARD' : 'SOFT'} CLASH: {[...clashInfo.names].join(', ')}
              </div>
              <div style={{ fontSize: '10px', color: 'rgba(240,240,240,0.3)', marginTop: '2px' }}>
                {isIgnored ? 'Marked as intentional double-book' : clashInfo?.tier === 'hard' ? 'Confirmed speakers double-booked on overlapping sessions' : 'Provisional speakers overlap (not yet confirmed)'}
              </div>
            </div>
            <button onClick={() => onToggleIgnore(editingSession.id)} style={{
              background: 'none', border: `1px solid ${isIgnored ? '#22c55e' : 'rgba(255,255,255,0.12)'}`,
              borderRadius: '4px', padding: '4px 10px', cursor: 'pointer',
              fontSize: '10px', fontFamily: 'inherit', letterSpacing: '0.03em',
              color: isIgnored ? '#22c55e' : 'rgba(240,240,240,0.5)',
            }}>
              {isIgnored ? 'UNIGNORE' : 'IGNORE'}
            </button>
          </div>
        )}
      </div>

      {/* ── Comment Thread ── */}
      {editingSession && (
        <div style={{ padding: '16px 24px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
            <span style={{ fontSize: '11px', color: 'rgba(240,240,240,0.4)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
              Comments {comments.length > 0 && `(${comments.length})`}
            </span>
          </div>

          {comments.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '12px', maxHeight: '240px', overflowY: 'auto' }}>
              {comments.map(c => {
                const isOwn = c.author_email === authUser?.email;
                const isEditorComment = c.role === 'editor';
                const timeAgo = (() => {
                  const diff = Date.now() - new Date(c.created_at).getTime();
                  const mins = Math.floor(diff / 60000);
                  if (mins < 1) return 'just now';
                  if (mins < 60) return `${mins}m ago`;
                  const hrs = Math.floor(mins / 60);
                  if (hrs < 24) return `${hrs}h ago`;
                  const days = Math.floor(hrs / 24);
                  return `${days}d ago`;
                })();
                return (
                  <div key={c.id} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '6px', padding: '8px 12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                      <span style={{ fontSize: '11px', fontWeight: 600, color: isEditorComment ? '#22c55e' : '#eab308' }}>
                        {c.author_name}
                      </span>
                      <span style={{
                        fontSize: '8px', letterSpacing: '0.5px', fontWeight: 700,
                        padding: '1px 5px', borderRadius: '3px',
                        background: isEditorComment ? 'rgba(34,197,94,0.12)' : 'rgba(234,179,8,0.12)',
                        color: isEditorComment ? '#22c55e' : '#eab308',
                      }}>
                        {isEditorComment ? 'EDITOR' : 'COMMENTER'}
                      </span>
                      <span style={{ fontSize: '9px', color: 'rgba(240,240,240,0.25)', marginLeft: 'auto' }}>{timeAgo}</span>
                      {isOwn && (
                        <button onClick={() => handleDeleteComment(c.id)} style={{
                          background: 'none', border: 'none', color: 'rgba(240,240,240,0.2)', cursor: 'pointer',
                          fontSize: '12px', padding: '0 2px', lineHeight: 1,
                        }} title="Delete comment">&times;</button>
                      )}
                    </div>
                    <div style={{ fontSize: '12px', color: 'rgba(240,240,240,0.7)', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{c.text}</div>
                  </div>
                );
              })}
            </div>
          )}

          <div style={{ display: 'flex', gap: '8px' }}>
            <input
              ref={commentInputRef}
              value={commentText}
              onChange={e => setCommentText(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handlePostComment(); } }}
              placeholder="Add a comment..."
              style={{ ...inputStyle, flex: 1, fontSize: '12px', padding: '8px 10px' }}
            />
            <button
              onClick={handlePostComment}
              disabled={!commentText.trim() || postingComment}
              style={{
                background: commentText.trim() ? '#3568FF' : 'rgba(255,255,255,0.05)',
                border: 'none', borderRadius: '4px', padding: '8px 14px',
                color: commentText.trim() ? '#fff' : 'rgba(240,240,240,0.2)',
                cursor: commentText.trim() ? 'pointer' : 'default',
                fontSize: '11px', fontFamily: 'inherit', fontWeight: 600, letterSpacing: '0.03em',
                transition: 'all .12s',
              }}
            >
              {postingComment ? '...' : 'Post'}
            </button>
          </div>
        </div>
      )}

      <div style={{ padding: '16px 24px', borderTop: '1px solid rgba(255,255,255,0.06)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          {editingSession && !readOnly && (
            <button onClick={() => { onDelete(editingSession.id); onClose(); }} style={{ background: 'none', border: '1px solid #3a1a1a', borderRadius: '4px', padding: '8px 16px', color: '#f87171', cursor: 'pointer', fontSize: '12px', fontFamily: 'inherit' }}>Delete</button>
          )}
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={onClose} style={{ background: 'none', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '4px', padding: '8px 16px', color: 'rgba(240,240,240,0.4)', cursor: 'pointer', fontSize: '12px', fontFamily: 'inherit' }}>{readOnly ? 'Close' : 'Cancel'}</button>
          {!readOnly && <button onClick={handleSave} style={{ background: '#3568FF', border: 'none', borderRadius: '4px', padding: '8px 20px', color: '#fff', cursor: 'pointer', fontSize: '12px', fontFamily: 'inherit', fontWeight: 'bold' }}>
            {editingSession ? 'Save Changes' : 'Create Session'}
          </button>}
        </div>
      </div>
    </ModalShell>
  );
}

// ── Manage Stages Modal ───────────────────────────────────────────────────────
function ManageStagesModal({ isOpen, onClose, stages, onStagesChange }) {
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({});
  const [addMode, setAddMode] = useState(false);
  const [newStage, setNewStage] = useState({ name: '', hall_id: 'hall-1', hall_name: 'Hall 1', open_from: '09:00', open_until: '17:00', color: '#3568FF', max_columns: 1 });
  const dragIdx = useRef(null);

  const existingHalls = useMemo(() => {
    const h = {};
    stages.forEach(s => { h[s.hall_id] = s.hall_name; });
    return Object.entries(h);
  }, [stages]);

  if (!isOpen) return null;

  const saveEdit = async () => {
    const { error } = await supabase.from('stages').update(form).eq('id', editingId);
    if (error) { alert(error.message); return; }
    onStagesChange(stages.map(s => s.id === editingId ? { ...s, ...form } : s));
    setEditingId(null);
  };

  const deleteStage = async (id) => {
    const { error } = await supabase.from('stages').delete().eq('id', id);
    if (error) { alert(error.message); return; }
    onStagesChange(stages.filter(s => s.id !== id));
  };

  const addStage = async () => {
    const id = newStage.name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    if (!id || !newStage.name) return;
    const payload = { id, ...newStage, sort_order: stages.length + 1 };
    const { data, error } = await supabase.from('stages').insert(payload).select();
    if (error) { alert(error.message); return; }
    onStagesChange([...stages, data[0]]);
    setAddMode(false);
    setNewStage({ name: '', hall_id: 'hall-1', hall_name: 'Hall 1', open_from: '09:00', open_until: '17:00', color: '#3568FF', max_columns: 1 });
  };

  const handleReorderDrop = async (targetIdx) => {
    const fromIdx = dragIdx.current;
    if (fromIdx === null || fromIdx === targetIdx) return;
    const reordered = [...stages];
    const [moved] = reordered.splice(fromIdx, 1);
    reordered.splice(targetIdx, 0, moved);
    const updated = reordered.map((s, i) => ({ ...s, sort_order: i + 1 }));
    onStagesChange(updated);
    for (const s of updated) {
      await supabase.from('stages').update({ sort_order: s.sort_order }).eq('id', s.id);
    }
  };

  const hallSelect = (value, onChange) => (
    <select value={value} onChange={e => {
      const hall = existingHalls.find(([id]) => id === e.target.value);
      onChange(e.target.value, hall ? hall[1] : e.target.value);
    }} style={inputStyle}>
      {existingHalls.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
    </select>
  );

  const stageForm = (data, setData) => (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', padding: '8px 0' }}>
      <div>
        <label style={labelStyle}>Name</label>
        <input value={data.name} onChange={e => setData({ ...data, name: e.target.value })} style={inputStyle} />
      </div>
      <div>
        <label style={labelStyle}>Hall</label>
        {hallSelect(data.hall_id, (id, name) => setData({ ...data, hall_id: id, hall_name: name }))}
      </div>
      <div>
        <label style={labelStyle}>Opens</label>
        <input type="time" value={data.open_from} onChange={e => setData({ ...data, open_from: e.target.value })} style={inputStyle} />
      </div>
      <div>
        <label style={labelStyle}>Closes</label>
        <input type="time" value={data.open_until} onChange={e => setData({ ...data, open_until: e.target.value })} style={inputStyle} />
      </div>
      <div>
        <label style={labelStyle}>Color</label>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <input type="color" value={data.color} onChange={e => setData({ ...data, color: e.target.value })} style={{ width: '36px', height: '36px', border: 'none', background: 'none', cursor: 'pointer' }} />
          <input value={data.color} onChange={e => setData({ ...data, color: e.target.value })} style={{ ...inputStyle, flex: 1 }} />
        </div>
      </div>
      <div>
        <label style={labelStyle}>Max Columns</label>
        <input type="number" value={data.max_columns} min={1} max={10} onChange={e => setData({ ...data, max_columns: Number(e.target.value) })} style={inputStyle} />
      </div>
    </div>
  );

  return (
    <ModalShell onClose={onClose} title="Manage Stages" width="720px">
      <div style={{ padding: '16px 24px' }}>
        {stages.map((stage, idx) => (
          <div
            key={stage.id}
            draggable="true"
            onDragStart={() => { dragIdx.current = idx; }}
            onDragOver={e => e.preventDefault()}
            onDrop={() => handleReorderDrop(idx)}
            style={{
              border: '1px solid rgba(255,255,255,0.08)', borderRadius: '4px', marginBottom: '8px',
              background: 'rgb(18,18,18)', padding: '10px 12px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ cursor: 'grab', color: 'rgba(240,240,240,0.4)', fontSize: '14px' }}>☰</span>
              <div style={{ width: '12px', height: '12px', borderRadius: '2px', background: stage.color, flexShrink: 0 }} />
              <span style={{ flex: 1, color: 'rgb(240,240,240)', fontSize: '13px', fontWeight: 'bold' }}>{stage.name}</span>
              <span style={{ color: 'rgba(240,240,240,0.4)', fontSize: '10px' }}>{stage.hall_name}</span>
              <span style={{ color: 'rgba(240,240,240,0.4)', fontSize: '10px' }}>{stage.open_from}–{stage.open_until}</span>
              {stage.max_columns > 1 && <span style={{ color: 'rgba(240,240,240,0.4)', fontSize: '10px' }}>{stage.max_columns}col</span>}
              <button onClick={() => { setEditingId(stage.id); setForm({ name: stage.name, hall_id: stage.hall_id, hall_name: stage.hall_name, open_from: stage.open_from, open_until: stage.open_until, color: stage.color, max_columns: stage.max_columns }); }} style={{ background: 'none', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '3px', padding: '3px 8px', color: '#3568FF', cursor: 'pointer', fontSize: '10px', fontFamily: 'inherit' }}>Edit</button>
              <button onClick={() => deleteStage(stage.id)} style={{ background: 'none', border: '1px solid #3a1a1a', borderRadius: '3px', padding: '3px 8px', color: '#f87171', cursor: 'pointer', fontSize: '10px', fontFamily: 'inherit' }}>×</button>
            </div>
            {editingId === stage.id && (
              <div style={{ marginTop: '10px', borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '10px' }}>
                {stageForm(form, setForm)}
                <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '8px' }}>
                  <button onClick={() => setEditingId(null)} style={{ background: 'none', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '4px', padding: '6px 12px', color: 'rgba(240,240,240,0.4)', cursor: 'pointer', fontSize: '11px', fontFamily: 'inherit' }}>Cancel</button>
                  <button onClick={saveEdit} style={{ background: '#3568FF', border: 'none', borderRadius: '4px', padding: '6px 12px', color: '#fff', cursor: 'pointer', fontSize: '11px', fontFamily: 'inherit', fontWeight: 'bold' }}>Save</button>
                </div>
              </div>
            )}
          </div>
        ))}

        {addMode ? (
          <div style={{ border: '1px solid #3568FF', borderRadius: '4px', padding: '12px', background: 'rgb(18,18,18)' }}>
            {stageForm(newStage, setNewStage)}
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '8px' }}>
              <button onClick={() => setAddMode(false)} style={{ background: 'none', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '4px', padding: '6px 12px', color: 'rgba(240,240,240,0.4)', cursor: 'pointer', fontSize: '11px', fontFamily: 'inherit' }}>Cancel</button>
              <button onClick={addStage} style={{ background: '#3568FF', border: 'none', borderRadius: '4px', padding: '6px 12px', color: '#fff', cursor: 'pointer', fontSize: '11px', fontFamily: 'inherit', fontWeight: 'bold' }}>Add Stage</button>
            </div>
          </div>
        ) : (
          <button onClick={() => setAddMode(true)} style={{ width: '100%', padding: '10px', background: 'none', border: '1px dashed rgba(255,255,255,0.08)', borderRadius: '4px', color: '#3568FF', cursor: 'pointer', fontSize: '12px', fontFamily: 'inherit', marginTop: '4px' }}>+ Add Stage</button>
        )}
      </div>
    </ModalShell>
  );
}

// ── Block Duration Popup ──────────────────────────────────────────────────────
function BlockDurationPopup({ pending, onConfirm, onCancel }) {
  const [duration, setDuration] = useState(pending.defaultDuration);
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1001, padding: '16px' }}>
      <div style={{ background: 'rgb(13,13,13)', border: `1px solid ${pending.color}`, borderRadius: '8px', padding: '24px', width: '280px', fontFamily: "'JetBrains Mono', ui-monospace, monospace" }}>
        <div style={{ fontSize: '13px', fontWeight: 'bold', color: pending.color, letterSpacing: '0.1em', marginBottom: '16px', textTransform: 'uppercase' }}>{pending.label}</div>
        <label style={labelStyle}>Duration (minutes)</label>
        <input type="number" value={duration} min={0} step={5} onChange={e => setDuration(Number(e.target.value))} style={inputStyle} autoFocus />
        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '16px' }}>
          <button onClick={onCancel} style={{ background: 'none', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '4px', padding: '8px 14px', color: 'rgba(240,240,240,0.4)', cursor: 'pointer', fontSize: '12px', fontFamily: 'inherit' }}>Cancel</button>
          <button onClick={() => onConfirm(duration)} style={{ background: pending.color, border: 'none', borderRadius: '4px', padding: '8px 14px', color: '#fff', cursor: 'pointer', fontSize: '12px', fontFamily: 'inherit', fontWeight: 'bold' }}>Add Block</button>
        </div>
      </div>
    </div>
  );
}

// ── Sidebar Components ────────────────────────────────────────────────────────
function BlockSidebarItem({ block, onDragStart, isEditor }) {
  return (
    <div
      draggable={isEditor ? "true" : "false"}
      onDragStart={isEditor ? (e) => {
        e.dataTransfer.setData('text/plain', `block:${block.id}`);
        e.dataTransfer.effectAllowed = 'move';
        onDragStart({ _isBlock: true, block_type: block.id, defaultDuration: block.defaultDuration, label: block.label, color: block.color });
      } : undefined}
      style={{
        background: `${block.color}15`, border: `1px dashed ${block.color}50`,
        borderRadius: '3px', padding: '5px 8px', marginBottom: '4px',
        cursor: isEditor ? 'grab' : 'default', fontSize: '10px', color: block.color,
        fontWeight: 'bold', letterSpacing: '0.05em', transition: 'opacity 0.15s',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}
      onMouseEnter={e => e.currentTarget.style.opacity = '0.8'}
      onMouseLeave={e => e.currentTarget.style.opacity = '1'}
    >
      {block.label}
      <span style={{ color: 'rgba(240,240,240,0.4)', fontWeight: 'normal' }}>
        {block.defaultDuration > 0 ? `${block.defaultDuration}m` : 'marker'}
      </span>
    </div>
  );
}

function SidebarCard({ session, speakers, onClick, onDragStart, isEditor }) {
  const statusDef = SESSION_STATUSES.find(s => s.id === session.status) || SESSION_STATUSES[0];
  const sessionSpeakers = speakers.filter(sp => getSpeakerIds(session.speakers).includes(sp.id));
  const metaColor = statusDef.textColor;
  return (
    <div draggable={isEditor ? "true" : "false"}
      onDragStart={isEditor ? (e) => { e.dataTransfer.setData('text/plain', session.id); e.dataTransfer.effectAllowed = 'move'; onDragStart(session); } : undefined}
      onClick={onClick}
      style={{
        background: statusDef.color,
        border: `${statusDef.borderWidth || '1px'} ${statusDef.borderStyle || 'solid'} ${statusDef.border}`,
        borderRadius: '4px',
        padding: '8px 10px', marginBottom: '6px', cursor: isEditor ? 'grab' : 'pointer', transition: 'opacity 0.15s',
      }}
      onMouseEnter={e => e.currentTarget.style.opacity = '0.85'}
      onMouseLeave={e => e.currentTarget.style.opacity = '1'}
    >
      <div style={{ fontSize: '11px', fontWeight: 'bold', color: statusDef.textColor, letterSpacing: '0.05em', lineHeight: 1.3, marginBottom: '4px' }}>{session.title}</div>
      <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ fontSize: '9px', padding: '1px 6px', borderRadius: '3px', background: statusDef.border + '33', color: metaColor, letterSpacing: '0.05em', opacity: 0.7 }}>{session.format || 'TBD'}</span>
        <span style={{ fontSize: '10px', color: metaColor, opacity: 0.6 }}>{session.duration_minutes}m</span>
      </div>
      {(() => { const seats = getSeatDisplay(sessionSpeakers, session.speakers, speakers); return seats.length > 0 && (
        <div style={{ fontSize: '10px', color: metaColor, marginTop: '4px', opacity: 0.7 }}>
          {seats.map((s, i) => <span key={i} style={{
            ...(s.provisional ? { opacity: 0.7, fontStyle: 'italic' } : {}),
            ...(s.kind !== 'speaker' ? { fontStyle: 'italic' } : {}),
          }}>{i > 0 ? ', ' : ''}{s.text}</span>)}
        </div>
      ); })()}
    </div>
  );
}

function SidebarPanel({ sessions, speakers, selectedDay, onEdit, onDragStart, isOpen, onToggle, isEditor }) {
  const unscheduled = sessions.filter(s => (!s.stage_id || !s.day) && s.type !== 'block');
  const scheduled = sessions.filter(s => s.stage_id && s.day && s.day === selectedDay && s.type !== 'block');

  return (
    <div style={{ width: isOpen ? `${SIDEBAR_WIDTH}px` : '28px', flexShrink: 0, background: 'rgb(8,8,8)', borderRight: '1px solid rgba(255,255,255,0.06)', display: 'flex', flexDirection: 'column', transition: 'width 0.2s ease', overflow: 'hidden' }}>
      <div style={{ padding: '12px 0', display: 'flex', justifyContent: isOpen ? 'space-between' : 'center', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.06)', flexShrink: 0, minWidth: isOpen ? `${SIDEBAR_WIDTH}px` : '28px' }}>
        {isOpen && <span style={{ fontSize: '11px', color: '#3568FF', letterSpacing: '0.15em', fontWeight: 'bold', textTransform: 'uppercase', paddingLeft: '16px', whiteSpace: 'nowrap' }}>Sessions</span>}
        <button onClick={onToggle} style={{ background: 'none', border: 'none', color: '#3568FF', cursor: 'pointer', fontSize: '14px', padding: '4px 8px', fontFamily: 'inherit' }}>{isOpen ? '◂' : '▸'}</button>
      </div>
      {isOpen && (
        <div style={{ flex: 1, overflowY: 'auto', padding: '12px', minWidth: `${SIDEBAR_WIDTH}px` }}>
          {/* Blocks */}
          <div style={{ marginBottom: '20px' }}>
            <div style={{ fontSize: '10px', color: 'rgba(240,240,240,0.4)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '8px', paddingBottom: '4px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>Blocks</div>
            {isEditor && BLOCK_TYPES.map(b => <BlockSidebarItem key={b.id} block={b} onDragStart={onDragStart} isEditor={isEditor} />)}
          </div>
          {/* Unscheduled */}
          <div style={{ marginBottom: '20px' }}>
            <div style={{ fontSize: '10px', color: 'rgba(240,240,240,0.4)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '8px', paddingBottom: '4px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>Unscheduled ({unscheduled.length})</div>
            {unscheduled.length === 0 ? <div style={{ fontSize: '11px', color: 'rgba(240,240,240,0.2)', fontStyle: 'italic', padding: '8px 0' }}>No unscheduled sessions</div>
              : unscheduled.map(s => <SidebarCard key={s.id} session={s} speakers={speakers} onClick={() => onEdit(s)} onDragStart={onDragStart} isEditor={isEditor} />)}
          </div>
          {/* Scheduled */}
          <div>
            <div style={{ fontSize: '10px', color: 'rgba(240,240,240,0.4)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '8px', paddingBottom: '4px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>Scheduled — {DAYS.find(d => d.id === selectedDay)?.label} ({scheduled.length})</div>
            {scheduled.length === 0 ? <div style={{ fontSize: '11px', color: 'rgba(240,240,240,0.2)', fontStyle: 'italic', padding: '8px 0' }}>No sessions for this day</div>
              : scheduled.map(s => <SidebarCard key={s.id} session={s} speakers={speakers} onClick={() => onEdit(s)} onDragStart={onDragStart} isEditor={isEditor} />)}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Grid Cards ────────────────────────────────────────────────────────────────
function SessionCard({ session, speakers, onClick, style, onDragStart, clashInfo, isClashIgnored, isEditor }) {
  const sessionSpeakers = speakers.filter(sp => getSpeakerIds(session.speakers).includes(sp.id));
  const startMins = session.start_time ? isoToMinutes(session.start_time) : null;
  const timeLabel = startMins !== null ? `${formatTime24(startMins)}–${formatTime24(startMins + session.duration_minutes)}` : null;
  const dur = session.duration_minutes || 0;
  const spineColor = TYPE_SPINE[session.format] || BV.inkFaint;
  const tagBg = TYPE_TAG_BG[session.format] || BV.paperLineSoft;
  const hasActiveClash = clashInfo && !isClashIgnored;
  const [showClashTooltip, setShowClashTooltip] = useState(false);
  const mouseDownPos = useRef(null);
  const didDrag = useRef(false);

  const isPlaceholder = session.status === 'placeholder';
  const isPencilled = session.status === 'pencilled';
  const borderStyle = isPlaceholder ? 'dashed' : 'solid';
  const borderColor = isPlaceholder ? BV.paperLine : isPencilled ? '#d97706' : BV.cardBorder;
  const cardBg = isPlaceholder
    ? `repeating-linear-gradient(45deg,${BV.card},${BV.card} 7px,#F4F2EA 7px,#F4F2EA 14px)`
    : BV.card;
  const titleColor = isPlaceholder ? BV.inkSoft : BV.ink;

  return (
    <div draggable={isEditor ? "true" : "false"}
      onDragStart={isEditor ? (e) => { didDrag.current = true; e.dataTransfer.setData('text/plain', session.id); e.dataTransfer.effectAllowed = 'move'; if (onDragStart) onDragStart(session); } : undefined}
      onMouseDown={(e) => { mouseDownPos.current = { x: e.clientX, y: e.clientY }; didDrag.current = false; }}
      onClick={(e) => { if (didDrag.current) { didDrag.current = false; return; } if (mouseDownPos.current) { const dx = e.clientX - mouseDownPos.current.x; const dy = e.clientY - mouseDownPos.current.y; if (Math.abs(dx) + Math.abs(dy) > 5) return; } onClick(); }}
      style={{
        margin: '0 5px',
        position: 'relative',
        background: cardBg,
        border: `1px ${borderStyle} ${borderColor}`,
        borderLeftWidth: '4px', borderLeftStyle: 'solid', borderLeftColor: spineColor,
        borderRadius: '7px', padding: dur < 20 ? '2px 7px' : '7px 9px', cursor: isEditor ? 'grab' : 'pointer',
        overflow: 'visible', boxSizing: 'border-box',
        boxShadow: hasActiveClash ? `0 0 0 2px ${BV.clash}33, ${BV.cardShadow}` : BV.cardShadow,
        transition: 'box-shadow .12s, transform .06s', zIndex: 10,
        fontFamily: BV.sans,
        ...style
      }}
      onMouseEnter={e => { e.currentTarget.style.boxShadow = hasActiveClash ? `0 0 0 2px ${BV.clash}33, ${BV.cardHoverShadow}` : BV.cardHoverShadow; e.currentTarget.style.transform = 'translateY(-1px)'; }}
      onMouseLeave={e => { e.currentTarget.style.boxShadow = hasActiveClash ? `0 0 0 2px ${BV.clash}33, ${BV.cardShadow}` : BV.cardShadow; e.currentTarget.style.transform = 'none'; }}
    >
      {/* Clash badge */}
      {clashInfo && (
        <div
          onMouseEnter={() => setShowClashTooltip(true)}
          onMouseLeave={() => setShowClashTooltip(false)}
          style={{
            position: 'absolute', top: '6px', right: '7px', zIndex: 20,
            fontFamily: BV.mono, fontSize: '7.5px', fontWeight: 700, letterSpacing: '0.5px',
            padding: '1.5px 4px', borderRadius: '3px',
            background: isClashIgnored ? BV.paperLineSoft : clashInfo?.tier === 'hard' ? '#FEE2E2' : '#FEF9C3',
            color: isClashIgnored ? BV.inkFaint : clashInfo?.tier === 'hard' ? BV.clash : '#a16207',
            textDecoration: isClashIgnored ? 'line-through' : 'none',
            cursor: 'default',
          }}
        >
          {clashInfo?.tier === 'hard' ? '⚠ CLASH' : '⚠ SOFT'}
          {showClashTooltip && (
            <div style={{
              position: 'absolute', top: '100%', right: 0, marginTop: '4px',
              background: BV.cockpit, border: `1px solid ${BV.cockpitLine}`,
              borderRadius: '4px', padding: '6px 10px', whiteSpace: 'nowrap',
              fontSize: '10px', color: '#D4D6DC', fontWeight: 'normal',
              textDecoration: 'none', zIndex: 30,
              boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
            }}>
              {isClashIgnored ? '(ignored) ' : ''}{clashInfo?.tier === 'hard' ? 'HARD: ' : 'SOFT: '}{[...(clashInfo?.names || [])].join(', ')}
            </div>
          )}
        </div>
      )}
      {timeLabel && <div style={{ fontFamily: BV.mono, fontSize: '9.5px', letterSpacing: '0.3px', color: BV.inkSoft, lineHeight: 1, marginBottom: dur < 20 ? '1px' : '2px' }}>{timeLabel}</div>}
      <div style={{ fontSize: dur < 20 ? '11px' : '12.5px', fontWeight: 650, letterSpacing: '-0.15px', color: titleColor, lineHeight: 1.18, marginBottom: '2px', whiteSpace: dur < 20 ? 'nowrap' : undefined, overflow: dur < 20 ? 'hidden' : undefined, textOverflow: dur < 20 ? 'ellipsis' : undefined }}>{session.title}</div>
      {(() => { const seats = getSeatDisplay(sessionSpeakers, session.speakers, speakers); return seats.length > 0 && (
        <div style={{ fontSize: '10.5px', color: BV.inkSoft, lineHeight: 1.35 }}>
          {seats.map((s, i) => <span key={i} style={{
            ...(s.provisional ? { opacity: 0.6, fontStyle: 'italic' } : {}),
            ...(s.kind !== 'speaker' ? { fontStyle: 'italic' } : {}),
          }}>{i > 0 ? ', ' : ''}{s.text}</span>)}
        </div>
      ); })()}
      {dur >= 20 && <div style={{ marginTop: '4px', display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap' }}>
        {session.format && <span style={{ fontFamily: BV.mono, fontSize: '8px', letterSpacing: '0.6px', textTransform: 'uppercase', padding: '1.5px 5px', borderRadius: '3px', fontWeight: 600, background: tagBg, color: spineColor }}>{session.format}</span>}
        {session.comments?.length > 0 && <span style={{ fontFamily: BV.mono, fontSize: '8px', letterSpacing: '0.3px', padding: '1.5px 5px', borderRadius: '3px', fontWeight: 600, background: '#EFF6FF', color: '#3568FF' }}>{session.comments.length} {session.comments.length === 1 ? 'comment' : 'comments'}</span>}
      </div>}
    </div>
  );
}

function BlockCard({ session, onClick, style, onDragStart, isEditor }) {
  const blockDef = BLOCK_TYPES.find(b => b.id === session.block_type);
  const isMarker = session.block_type === 'stage-open' || session.block_type === 'stage-close';
  const startMins = session.start_time ? isoToMinutes(session.start_time) : null;
  const timeLabel = startMins !== null ? formatTime24(startMins) : null;
  const mouseDownPos = useRef(null);
  const didDrag = useRef(false);
  const handleMouseDown = (e) => { mouseDownPos.current = { x: e.clientX, y: e.clientY }; didDrag.current = false; };
  const handleClick = () => { if (didDrag.current) { didDrag.current = false; return; } onClick(); };

  if (isMarker) {
    const isOpen = session.block_type === 'stage-open';
    return (
      <div draggable={isEditor ? "true" : "false"}
        onDragStart={isEditor ? (e) => { didDrag.current = true; e.dataTransfer.setData('text/plain', session.id); e.dataTransfer.effectAllowed = 'move'; if (onDragStart) onDragStart(session); } : undefined}
        onMouseDown={handleMouseDown} onClick={handleClick} style={{
          margin: '0 5px', position: 'absolute', left: 0, right: 0,
          height: '18px', borderRadius: '4px', cursor: isEditor ? 'grab' : 'pointer',
          background: isOpen ? '#DCFCE7' : '#FEE2E2',
          color: isOpen ? BV.open : BV.clash,
          fontFamily: BV.mono, fontSize: '8px', letterSpacing: '0.5px', fontWeight: 600,
          display: 'flex', alignItems: 'center', paddingLeft: '7px', zIndex: 10,
          ...style,
        }}
      >
        {isOpen ? '▶ STAGE OPEN' : '◼ STAGE CLOSE'}
      </div>
    );
  }

  return (
    <div draggable={isEditor ? "true" : "false"}
      onDragStart={isEditor ? (e) => { didDrag.current = true; e.dataTransfer.setData('text/plain', session.id); e.dataTransfer.effectAllowed = 'move'; if (onDragStart) onDragStart(session); } : undefined}
      onMouseDown={handleMouseDown} onClick={handleClick} style={{
        margin: '0 5px', position: 'relative',
        height: '9px', borderRadius: '3px',
        background: `repeating-linear-gradient(45deg,#F0EEE5,#F0EEE5 4px,#E8E5DB 4px,#E8E5DB 8px)`,
        display: 'flex', alignItems: 'center',
        cursor: isEditor ? 'grab' : 'pointer', overflow: 'hidden', boxSizing: 'border-box', zIndex: 10,
        ...style,
      }}
    >
      <span style={{ fontFamily: BV.mono, fontSize: '7px', color: BV.inkFaint, paddingLeft: '5px', letterSpacing: '0.4px', whiteSpace: 'nowrap' }}>
        {timeLabel && `${timeLabel} `}{session.title.toLowerCase()}
      </span>
    </div>
  );
}

// ── Slot renderer (absolute positioning) ──────────────────────────────────────
function SlotColumn({ stage, stageSessions, speakers, openFrom, openUntil, colIndex, colWidth, isLastCol, dropError, handleDrop, onDragStart, dragSessionRef, openNewSession, onEditSession, speakerClashes, ignoredClashes, isEditor }) {
  const gridStart = TIME_SLOTS[0];
  const gridEnd = TIME_SLOTS[TIME_SLOTS.length - 1] + 5;
  const totalHeight = TIME_SLOTS.length * SLOT_HEIGHT;
  const colRef = useRef(null);

  const yToMins = (clientY) => {
    if (!colRef.current) return gridStart;
    const rect = colRef.current.getBoundingClientRect();
    const offsetY = clientY - rect.top;
    const rawMins = gridStart + (offsetY / SLOT_HEIGHT) * 5;
    return Math.round(rawMins / 5) * 5;
  };

  const handleColumnDrop = (e) => {
    if (!isEditor) return;
    e.preventDefault();
    const mins = yToMins(e.clientY);
    const clamped = Math.max(gridStart, Math.min(mins, gridEnd - 5));
    handleDrop(stage.id, clamped, colIndex);
  };

  return (
    <div ref={colRef} style={{ width: `${colWidth}px`, flexShrink: 0, position: 'relative', height: `${totalHeight}px` }}
      onDragOver={isEditor ? e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; } : undefined}
      onDrop={isEditor ? handleColumnDrop : undefined}
    >
      {/* Slot grid cells — visual grid + click-to-add targets */}
      {TIME_SLOTS.map(mins => {
        const isOpen = mins >= openFrom && mins < openUntil;
        const isClosed = mins < openFrom || mins >= openUntil;
        const isErr = dropError?.stageId === stage.id && dropError?.slotMins === mins && (dropError?.colIndex ?? 0) === colIndex;
        return (
          <div key={mins}
            onClick={() => isOpen && isEditor && openNewSession(stage.id, mins)}
            style={{
              position: 'absolute', left: 0, right: 0,
              top: `${(mins - gridStart) / 5 * SLOT_HEIGHT}px`,
              height: `${SLOT_HEIGHT}px`,
              background: isErr ? '#FEE2E2' : BV.paper,
              borderBottom: mins % 60 === 0 ? `1px solid ${BV.paperLine}` : mins % 30 === 0 ? `1px solid ${BV.paperLineSoft}` : 'none',
              borderRight: isLastCol ? `1px solid ${BV.paperLine}` : `1px solid ${BV.paperLineSoft}`,
              cursor: isOpen && isEditor ? 'cell' : 'default',
              outline: isErr ? `1px solid ${BV.clash}` : 'none',
            }}
          />
        );
      })}

      {/* Closed region overlays */}
      {openFrom > gridStart && (
        <div style={{
          position: 'absolute', left: 0, right: 0, top: 0,
          height: `${(openFrom - gridStart) / 5 * SLOT_HEIGHT}px`,
          background: `repeating-linear-gradient(45deg, transparent, transparent 9px, #EFEDE4 9px, #EFEDE4 10px)`,
          backgroundColor: BV.paper,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          overflow: 'hidden', borderBottom: `1px solid ${BV.paperLine}`, zIndex: 5,
          borderRight: isLastCol ? `1px solid ${BV.paperLine}` : `1px solid ${BV.paperLineSoft}`,
        }}>
          <span style={{ fontSize: '10px', color: BV.inkFaint, letterSpacing: '0.2em', fontWeight: 'bold', textTransform: 'uppercase', writingMode: 'vertical-rl', whiteSpace: 'nowrap', opacity: 0.5 }}>CLOSED</span>
        </div>
      )}
      {openUntil < gridEnd && (
        <div style={{
          position: 'absolute', left: 0, right: 0,
          top: `${(openUntil - gridStart) / 5 * SLOT_HEIGHT}px`,
          height: `${(gridEnd - openUntil) / 5 * SLOT_HEIGHT}px`,
          background: `repeating-linear-gradient(45deg, transparent, transparent 9px, #EFEDE4 9px, #EFEDE4 10px)`,
          backgroundColor: BV.paper,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          overflow: 'hidden', borderTop: `1px solid ${BV.paperLine}`, zIndex: 5,
          borderRight: isLastCol ? `1px solid ${BV.paperLine}` : `1px solid ${BV.paperLineSoft}`,
        }}>
          <span style={{ fontSize: '10px', color: BV.inkFaint, letterSpacing: '0.2em', fontWeight: 'bold', textTransform: 'uppercase', writingMode: 'vertical-rl', whiteSpace: 'nowrap', opacity: 0.5 }}>CLOSED</span>
        </div>
      )}

      {/* Session and block cards — absolute positioned */}
      {stageSessions.filter(s => {
        const sm = isoToMinutes(s.start_time);
        return sm >= gridStart && sm < gridEnd;
      }).map(session => {
        const startMins = isoToMinutes(session.start_time);
        const slotH = (session.duration_minutes / 5) * SLOT_HEIGHT;
        const top = (startMins - gridStart) / 5 * SLOT_HEIGHT;
        const cardStyle = {
          position: 'absolute', left: 0, right: 0,
          top: `${top}px`, height: `${slotH}px`,
          overflow: 'hidden', zIndex: 10,
        };
        if (session.type === 'block') {
          return <BlockCard key={session.id} session={session} onClick={() => onEditSession(session)} onDragStart={onDragStart} style={cardStyle} isEditor={isEditor} />;
        }
        return <SessionCard key={session.id} session={session} speakers={speakers} onClick={() => onEditSession(session)} onDragStart={onDragStart} style={cardStyle} clashInfo={speakerClashes?.[session.id]} isClashIgnored={ignoredClashes?.has(session.id)} isEditor={isEditor} />;
      })}
    </div>
  );
}

// ── Roundtables Section ───────────────────────────────────────────────────────
const RT_TIME_BLOCKS = [
  { start: 14 * 60, end: 14 * 60 + 40, label: 'Block 1' },
  { start: 14 * 60 + 45, end: 15 * 60 + 25, label: 'Block 2' },
  { start: 15 * 60 + 30, end: 16 * 60 + 10, label: 'Block 3' },
  { start: 16 * 60 + 15, end: 16 * 60 + 55, label: 'Block 4' },
];

function RoundtablesSection({ stage, daySessions, speakers, selectedDay, onDragStart, onEditSession, handleDrop, handleSave, dropError, dragSessionRef, openNewSession, isEditor }) {
  const maxCols = stage.max_columns || 5;
  const allStageSessions = daySessions.filter(s => s.stage_id === stage.id && s.start_time);

  const RT_CARD_WIDTH = 240;

  return (
    <div style={{ borderTop: `2px solid ${stage.color}`, background: '#fff', padding: '16px 0' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px', padding: '0 24px', marginBottom: '16px' }}>
        <div style={{ width: '12px', height: '12px', borderRadius: '2px', background: stage.color, flexShrink: 0 }} />
        <div>
          <div style={{ fontSize: '13px', fontWeight: 'bold', color: stage.color, letterSpacing: '0.1em', textTransform: 'uppercase', fontFamily: BV.sans }}>{stage.name}</div>
          <div style={{ fontSize: '10px', color: BV.inkFaint }}>4 time blocks · {maxCols} parallel slots each</div>
        </div>
      </div>

      {/* Fixed time blocks */}
      {RT_TIME_BLOCKS.map((block, blockIdx) => {
        const blockDuration = block.end - block.start;
        const blockSessions = allStageSessions.filter(s => {
          const mins = isoToMinutes(s.start_time);
          return mins >= block.start && mins < block.end;
        });

        return (
          <div key={blockIdx} style={{ padding: '8px 24px', marginBottom: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px', marginBottom: '8px' }}>
              <span style={{ fontSize: '11px', fontWeight: 'bold', color: stage.color, letterSpacing: '0.08em' }}>{block.label}</span>
              <span style={{ fontSize: '11px', color: BV.inkFaint, fontFamily: BV.mono, letterSpacing: '0.05em' }}>
                {formatTime24(block.start)}–{formatTime24(block.end)} · {blockDuration}m
              </span>
            </div>
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              {Array.from({ length: maxCols }, (_, colIdx) => {
                const session = blockSessions.find(s => (s.column_index || 0) === colIdx);
                if (session) {
                  const statusDef = SESSION_STATUSES.find(st => st.id === session.status) || SESSION_STATUSES[0];
                  const sessionSpeakers = speakers.filter(sp => getSpeakerIds(session.speakers).includes(sp.id));
                  const topicColor = session.topics?.[0] ? TOPIC_TAG_COLORS[session.topics[0]] : stage.color;
                  if (session.type === 'block') {
                    const blockDef = BLOCK_TYPES.find(b => b.id === session.block_type);
                    const bColor = blockDef?.color || '#6b7280';
                    const bBg = blockDef?.bgColor || '#1a1a1a';
                    const bStripe = blockDef?.stripeColor || bColor;
                    return (
                      <div key={colIdx} draggable="true"
                        onDragStart={(e) => { e.dataTransfer.setData('text/plain', session.id); e.dataTransfer.effectAllowed = 'move'; onDragStart(session); }}
                        onClick={() => onEditSession(session)}
                        style={{
                          width: `${RT_CARD_WIDTH}px`, padding: '10px 12px', borderRadius: '4px', cursor: 'grab',
                          background: `repeating-linear-gradient(45deg, ${bBg}, ${bBg} 4px, ${bStripe}25 4px, ${bStripe}25 8px)`,
                          border: `1px dashed ${bColor}60`,
                        }}
                      >
                        <div style={{ fontSize: '10px', fontWeight: 'bold', color: bColor, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                          {session.title}{session.duration_minutes > 0 ? ` · ${session.duration_minutes}m` : ''}
                        </div>
                      </div>
                    );
                  }
                  const spineColor = TYPE_SPINE[session.format] || BV.inkFaint;
                  const isPlaceholderRT = session.status === 'placeholder';
                  const isPencilledRT = session.status === 'pencilled';
                  const rtBorderColor = isPlaceholderRT ? BV.paperLine : isPencilledRT ? '#d97706' : BV.cardBorder;
                  const rtBorderStyle = isPlaceholderRT ? 'dashed' : 'solid';
                  return (
                    <div key={colIdx} draggable={isEditor ? "true" : "false"}
                      onDragStart={isEditor ? (e) => { e.dataTransfer.setData('text/plain', session.id); e.dataTransfer.effectAllowed = 'move'; onDragStart(session); } : undefined}
                      onClick={() => onEditSession(session)}
                      style={{
                        width: `${RT_CARD_WIDTH}px`, padding: '10px 12px', borderRadius: '7px', cursor: isEditor ? 'grab' : 'pointer',
                        background: isPlaceholderRT ? `repeating-linear-gradient(45deg,${BV.card},${BV.card} 7px,#F4F2EA 7px,#F4F2EA 14px)` : BV.card,
                        border: `1px ${rtBorderStyle} ${rtBorderColor}`,
                        borderLeft: `4px solid ${spineColor}`,
                        boxShadow: BV.cardShadow,
                        transition: 'box-shadow .12s, transform .06s',
                      }}
                      onMouseEnter={e => { e.currentTarget.style.boxShadow = BV.cardHoverShadow; e.currentTarget.style.transform = 'translateY(-1px)'; }}
                      onMouseLeave={e => { e.currentTarget.style.boxShadow = BV.cardShadow; e.currentTarget.style.transform = 'none'; }}
                    >
                      <div style={{ fontSize: '12.5px', fontWeight: 650, color: isPlaceholderRT ? BV.inkSoft : BV.ink, lineHeight: 1.3, marginBottom: '4px', letterSpacing: '-0.15px' }}>{session.title}</div>
                      {session.format && <div style={{ marginBottom: '3px' }}><span style={{ fontFamily: BV.mono, fontSize: '8px', letterSpacing: '0.6px', textTransform: 'uppercase', padding: '1.5px 5px', borderRadius: '3px', fontWeight: 600, background: TYPE_TAG_BG[session.format] || BV.paperLineSoft, color: spineColor }}>{session.format}</span></div>}
                      {(() => { const seats = getSeatDisplay(sessionSpeakers, session.speakers, speakers); return seats.length > 0 && (
                        <div style={{ fontSize: '10.5px', color: BV.inkSoft, lineHeight: 1.3 }}>
                          {seats.map((s, i) => <span key={i} style={{
                            ...(s.provisional ? { opacity: 0.6, fontStyle: 'italic' } : {}),
                            ...(s.kind !== 'speaker' ? { fontStyle: 'italic' } : {}),
                          }}>{i > 0 ? ', ' : ''}{s.text}</span>)}
                        </div>
                      ); })()}
                      {session.capacity && <div style={{ fontFamily: BV.mono, fontSize: '9px', color: BV.inkFaint, marginTop: '2px' }}>Cap: {session.capacity}</div>}
                      {session.topics?.[0] && <div style={{ fontSize: '9px', color: topicColor, marginTop: '2px', opacity: 0.8 }}>{session.topics[0]}{session.topics[1] ? `, ${session.topics[1]}` : ''}</div>}
                    </div>
                  );
                }
                // Empty slot — droppable
                return (
                  <div key={colIdx}
                    onDragOver={isEditor ? e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; } : undefined}
                    onDragEnter={isEditor ? e => { e.preventDefault(); e.currentTarget.style.borderColor = stage.color; e.currentTarget.style.background = BV.paperLineSoft; } : undefined}
                    onDragLeave={isEditor ? e => { e.currentTarget.style.borderColor = BV.paperLine; e.currentTarget.style.background = 'transparent'; } : undefined}
                    onDrop={isEditor ? e => { e.preventDefault(); e.currentTarget.style.borderColor = BV.paperLine; e.currentTarget.style.background = 'transparent'; handleDrop(stage.id, block.start, colIdx); } : undefined}
                    onClick={isEditor ? () => openNewSession(stage.id, block.start) : undefined}
                    style={{
                      width: `${RT_CARD_WIDTH}px`, padding: '10px 12px', borderRadius: '4px',
                      border: `1px dashed ${BV.paperLine}`, cursor: isEditor ? 'cell' : 'default',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      minHeight: '48px', transition: 'all 0.15s',
                    }}
                  >
                    <span style={{ fontSize: '10px', color: BV.inkFaint, letterSpacing: '0.05em', opacity: 0.4 }}>Slot {colIdx + 1}</span>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Registrations Modal ───────────────────────────────────────────────────────
function RegistrationsModal({ isOpen, onClose, sessions, stages }) {
  const [attendees, setAttendees] = useState([]);
  const [rtRegistrations, setRtRegistrations] = useState([]);
  const [questSaves, setQuestSaves] = useState([]);
  const [loadingReg, setLoadingReg] = useState(false);
  const [expandedSession, setExpandedSession] = useState(null);
  const [expandedAttendees, setExpandedAttendees] = useState([]);

  useEffect(() => {
    if (!isOpen) return;
    setLoadingReg(true);
    Promise.all([
      supabase.from('attendees').select('*').order('created_at', { ascending: false }),
      supabase.from('roundtable_registrations').select('*'),
      supabase.from('quest_saves').select('*'),
    ]).then(([aRes, rtRes, qRes]) => {
      if (aRes.data) setAttendees(aRes.data);
      if (rtRes.data) setRtRegistrations(rtRes.data);
      if (qRes.data) setQuestSaves(qRes.data);
      setLoadingReg(false);
    });
  }, [isOpen]);

  const expandRoundtable = async (sessionId) => {
    if (expandedSession === sessionId) {
      setExpandedSession(null);
      return;
    }
    setExpandedSession(sessionId);
    const regs = rtRegistrations.filter(r => r.session_id === sessionId);
    const attendeeIds = regs.map(r => r.attendee_id);
    const matched = attendees.filter(a => attendeeIds.includes(a.id)).map(a => {
      const reg = regs.find(r => r.attendee_id === a.id);
      return { ...a, registered_at: reg?.created_at };
    });
    setExpandedAttendees(matched);
  };

  if (!isOpen) return null;

  // Roundtable sessions (from multi-column stages)
  const roundtableStageIds = new Set(stages.filter(s => (s.max_columns || 1) > 1).map(s => s.id));
  const roundtableSessions = sessions.filter(s =>
    roundtableStageIds.has(s.stage_id) && s.status === 'confirmed' && s.type !== 'block'
  );

  const rtCountMap = {};
  rtRegistrations.forEach(r => {
    rtCountMap[r.session_id] = (rtCountMap[r.session_id] || 0) + 1;
  });

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      background: 'rgba(0,0,0,0.8)', display: 'flex',
      alignItems: 'center', justifyContent: 'center', padding: '24px',
    }} onClick={onClose}>
      <div style={{
        background: 'rgb(5,5,5)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '4px',
        width: '640px', maxWidth: '100%', maxHeight: '80vh', overflow: 'auto',
        padding: '24px',
      }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h2 style={{ fontSize: '14px', color: '#3568FF', margin: 0, letterSpacing: '0.1em' }}>REGISTRATIONS</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'rgba(240,240,240,0.4)', cursor: 'pointer', fontSize: '18px' }}>&times;</button>
        </div>

        {loadingReg ? (
          <div style={{ color: 'rgba(240,240,240,0.4)', textAlign: 'center', padding: '40px 0' }}>Loading...</div>
        ) : (
          <>
            {/* Summary stats */}
            <div style={{ display: 'flex', gap: '24px', marginBottom: '24px', padding: '16px', background: 'rgb(13,13,13)', borderRadius: '4px' }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#3568FF' }}>{attendees.length}</div>
                <div style={{ fontSize: '9px', color: 'rgba(240,240,240,0.4)', letterSpacing: '0.1em', marginTop: '4px' }}>ATTENDEES</div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#22c55e' }}>{rtRegistrations.length}</div>
                <div style={{ fontSize: '9px', color: 'rgba(240,240,240,0.4)', letterSpacing: '0.1em', marginTop: '4px' }}>RT SIGNUPS</div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#FFFBC9' }}>{questSaves.length}</div>
                <div style={{ fontSize: '9px', color: 'rgba(240,240,240,0.4)', letterSpacing: '0.1em', marginTop: '4px' }}>QUEST SAVES</div>
              </div>
            </div>

            {/* Roundtable sessions with registration counts */}
            <h3 style={{ fontSize: '11px', color: 'rgb(240,240,240)', margin: '0 0 12px', letterSpacing: '0.1em' }}>ROUNDTABLE REGISTRATIONS</h3>
            {roundtableSessions.length === 0 ? (
              <div style={{ color: 'rgba(240,240,240,0.4)', fontSize: '12px', marginBottom: '24px' }}>No roundtable sessions found.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: '24px' }}>
                {roundtableSessions.map(s => {
                  const count = rtCountMap[s.id] || 0;
                  const cap = s.capacity;
                  const pct = cap ? Math.min(100, (count / cap) * 100) : 0;
                  const isExpanded = expandedSession === s.id;
                  return (
                    <div key={s.id}>
                      <div
                        onClick={() => expandRoundtable(s.id)}
                        style={{
                          display: 'flex', alignItems: 'center', gap: '12px',
                          padding: '10px 12px', background: 'rgb(13,13,13)',
                          borderRadius: '4px', cursor: 'pointer',
                          border: isExpanded ? '1px solid #3568FF' : '1px solid transparent',
                          transition: 'border-color 0.15s',
                        }}
                      >
                        <span style={{ flex: 1, fontSize: '12px', color: 'rgb(240,240,240)' }}>{s.title}</span>
                        <span style={{ fontSize: '11px', color: count >= (cap || Infinity) ? '#f87171' : '#22c55e', fontWeight: 'bold' }}>
                          {count}{cap ? `/${cap}` : ''}
                        </span>
                        {cap && (
                          <div style={{ width: '60px', height: '4px', background: 'rgba(255,255,255,0.06)', borderRadius: '2px', overflow: 'hidden' }}>
                            <div style={{ width: `${pct}%`, height: '100%', background: pct >= 100 ? '#f87171' : '#22c55e' }} />
                          </div>
                        )}
                        <span style={{ fontSize: '10px', color: 'rgba(240,240,240,0.4)' }}>{isExpanded ? '\u25B2' : '\u25BC'}</span>
                      </div>
                      {isExpanded && (
                        <div style={{ padding: '8px 12px 8px 24px', background: 'rgba(255,255,255,0.03)', borderRadius: '0 0 4px 4px' }}>
                          {expandedAttendees.length === 0 ? (
                            <div style={{ fontSize: '11px', color: 'rgba(240,240,240,0.4)' }}>No registrations yet.</div>
                          ) : (
                            <table style={{ width: '100%', fontSize: '11px', borderCollapse: 'collapse' }}>
                              <thead>
                                <tr style={{ color: 'rgba(240,240,240,0.4)' }}>
                                  <th style={{ textAlign: 'left', padding: '4px 8px', fontWeight: 'normal', letterSpacing: '0.05em' }}>NAME</th>
                                  <th style={{ textAlign: 'left', padding: '4px 8px', fontWeight: 'normal', letterSpacing: '0.05em' }}>EMAIL</th>
                                  <th style={{ textAlign: 'left', padding: '4px 8px', fontWeight: 'normal', letterSpacing: '0.05em' }}>COMPANY</th>
                                  <th style={{ textAlign: 'left', padding: '4px 8px', fontWeight: 'normal', letterSpacing: '0.05em' }}>REGISTERED</th>
                                </tr>
                              </thead>
                              <tbody>
                                {expandedAttendees.map(a => (
                                  <tr key={a.id}>
                                    <td style={{ padding: '4px 8px', color: '#FFFBC9' }}>{a.name}</td>
                                    <td style={{ padding: '4px 8px', color: 'rgb(240,240,240)' }}>{a.email}</td>
                                    <td style={{ padding: '4px 8px', color: 'rgba(240,240,240,0.4)' }}>{a.company || '—'}</td>
                                    <td style={{ padding: '4px 8px', color: 'rgba(240,240,240,0.4)' }}>
                                      {a.registered_at ? new Date(a.registered_at).toLocaleDateString() : '—'}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Recent attendees list */}
            <h3 style={{ fontSize: '11px', color: 'rgb(240,240,240)', margin: '0 0 12px', letterSpacing: '0.1em' }}>RECENT ATTENDEES</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
              {attendees.slice(0, 50).map(a => (
                <div key={a.id} style={{
                  display: 'flex', gap: '12px', padding: '6px 12px',
                  fontSize: '11px', background: 'rgb(13,13,13)', borderRadius: '2px',
                }}>
                  <span style={{ color: '#FFFBC9', minWidth: '120px' }}>{a.name}</span>
                  <span style={{ color: 'rgb(240,240,240)', flex: 1 }}>{a.email}</span>
                  <span style={{ color: 'rgba(240,240,240,0.4)' }}>{a.company || ''}</span>
                  <span style={{ color: 'rgba(240,240,240,0.2)', fontSize: '10px' }}>
                    {new Date(a.created_at).toLocaleDateString()}
                  </span>
                </div>
              ))}
              {attendees.length > 50 && (
                <div style={{ fontSize: '10px', color: 'rgba(240,240,240,0.4)', padding: '8px 12px' }}>
                  + {attendees.length - 50} more attendees
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── Manage Speakers Modal ─────────────────────────────────────────────────────
function ManageSpeakersModal({ isOpen, onClose, speakers, onSpeakersChange }) {
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);

  if (!isOpen) return null;

  const startEdit = (sp) => {
    setEditingId(sp.id);
    setForm({ name: sp.name || '', title: sp.title || '', company: sp.company || '', linkedin: sp.linkedin || '' });
  };

  const cancelEdit = () => { setEditingId(null); setForm({}); };

  const saveEdit = async () => {
    if (!form.name?.trim()) return;
    setSaving(true);
    const updates = { name: form.name.trim(), title: form.title.trim() || null, company: form.company.trim() || null, linkedin: form.linkedin.trim() || null };
    const { error } = await supabase.from('speakers').update(updates).eq('id', editingId);
    if (error) { alert(error.message); setSaving(false); return; }
    onSpeakersChange(speakers.map(s => s.id === editingId ? { ...s, ...updates } : s));
    setEditingId(null);
    setForm({});
    setSaving(false);
  };

  const sorted = [...speakers].sort((a, b) => (a.name || '').localeCompare(b.name || ''));

  return (
    <ModalShell onClose={onClose} title="Speakers" width="640px">
      <div style={{ padding: '16px 24px', maxHeight: '60vh', overflowY: 'auto' }}>
        {sorted.length === 0 ? (
          <div style={{ color: 'rgba(240,240,240,0.4)', fontSize: '12px', textAlign: 'center', padding: '24px 0' }}>No speakers yet.</div>
        ) : sorted.map(sp => (
          <div key={sp.id} style={{ border: '1px solid rgba(255,255,255,0.08)', borderRadius: '4px', marginBottom: '6px', background: 'rgb(18,18,18)', padding: '10px 12px' }}>
            {editingId === sp.id ? (
              <div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '8px' }}>
                  <div>
                    <label style={labelStyle}>Name *</label>
                    <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} style={inputStyle} />
                  </div>
                  <div>
                    <label style={labelStyle}>Title</label>
                    <input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} style={inputStyle} />
                  </div>
                  <div>
                    <label style={labelStyle}>Company</label>
                    <input value={form.company} onChange={e => setForm({ ...form, company: e.target.value })} style={inputStyle} />
                  </div>
                  <div>
                    <label style={labelStyle}>LinkedIn</label>
                    <input value={form.linkedin} onChange={e => setForm({ ...form, linkedin: e.target.value })} placeholder="https://linkedin.com/in/..." style={inputStyle} />
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                  <button onClick={cancelEdit} style={{ background: 'none', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '4px', padding: '6px 12px', color: 'rgba(240,240,240,0.4)', cursor: 'pointer', fontSize: '11px', fontFamily: 'inherit' }}>Cancel</button>
                  <button onClick={saveEdit} disabled={saving || !form.name?.trim()} style={{ background: '#3568FF', border: 'none', borderRadius: '4px', padding: '6px 12px', color: '#fff', cursor: saving ? 'wait' : 'pointer', fontSize: '11px', fontFamily: 'inherit', fontWeight: 'bold' }}>{saving ? 'Saving…' : 'Save'}</button>
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '13px', color: 'rgb(240,240,240)', fontWeight: 'bold' }}>{sp.name}</div>
                  <div style={{ fontSize: '11px', color: 'rgba(240,240,240,0.4)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {[sp.title, sp.company].filter(Boolean).join(' · ') || '—'}
                  </div>
                </div>
                <button onClick={() => startEdit(sp)} style={{ background: 'none', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '3px', padding: '3px 8px', color: '#3568FF', cursor: 'pointer', fontSize: '10px', fontFamily: 'inherit', flexShrink: 0 }}>Edit</button>
              </div>
            )}
          </div>
        ))}
      </div>
    </ModalShell>
  );
}

// ── Day 0 Activations List ────────────────────────────────────────────────────
function ActivationsList({ sessions, selectedDay, onEdit, onNew, isEditor }) {
  const activations = sessions
    .filter(s => s.day === selectedDay && s.type === 'event')
    .sort((a, b) => {
      if (!a.start_time) return 1;
      if (!b.start_time) return -1;
      return isoToMinutes(a.start_time) - isoToMinutes(b.start_time);
    });

  return (
    <div style={{ flex: 1, overflow: 'auto', padding: '24px' }}>
      <div style={{ maxWidth: '720px', margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
          <div style={{ fontSize: '12px', color: 'rgba(240,240,240,0.4)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
            Activations · Day 0 ({activations.length})
          </div>
          {isEditor && <button onClick={onNew} style={{
            background: '#3568FF', border: 'none', borderRadius: '8px',
            padding: '8px 20px', color: '#fff', cursor: 'pointer',
            fontSize: '12px', fontFamily: "'JetBrains Mono', ui-monospace, monospace",
            fontWeight: 'bold', letterSpacing: '0.05em',
          }}>+ Add Activation</button>}
        </div>

        {activations.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 0', color: 'rgba(240,240,240,0.2)', fontSize: '13px' }}>
            No activations yet. Add your first Day 0 event.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {activations.map(s => {
              const startMins = s.start_time ? isoToMinutes(s.start_time) : null;
              const endMins = startMins !== null ? startMins + s.duration_minutes : null;
              const timeLabel = startMins !== null ? `${formatTime24(startMins)}–${formatTime24(endMins)}` : '—';
              return (
                <div key={s.id} onClick={() => onEdit(s)} style={{
                  background: 'rgb(13,13,13)', border: '1px solid rgba(255,255,255,0.06)',
                  borderRadius: '8px', padding: '14px 18px', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: '16px',
                  transition: 'border-color 0.15s',
                }}
                  onMouseEnter={e => e.currentTarget.style.borderColor = '#3568FF'}
                  onMouseLeave={e => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)'}
                >
                  <div style={{ fontSize: '13px', color: '#3568FF', fontFamily: 'monospace', letterSpacing: '0.03em', minWidth: '110px', flexShrink: 0 }}>
                    {timeLabel}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '14px', fontWeight: 'bold', color: 'rgb(240,240,240)', letterSpacing: '0.03em', marginBottom: '3px' }}>{s.title}</div>
                    <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', fontSize: '12px', color: 'rgba(240,240,240,0.4)' }}>
                      {s.venue && <span>{'\uD83D\uDCCD'} {s.venue}</span>}
                      {s.host && <span>Hosted by {s.host}</span>}
                    </div>
                  </div>
                  {s.invite_only && (
                    <span style={{
                      fontSize: '10px', padding: '3px 10px', borderRadius: '20px',
                      background: '#f59e0b22', border: '1px solid #f59e0b44',
                      color: '#f59e0b', letterSpacing: '0.05em', fontWeight: 600, flexShrink: 0,
                    }}>INVITE ONLY</span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Evening Events Section ────────────────────────────────────────────────────
function EveningEventsSection({ sessions, selectedDay, onEdit }) {
  const eveningEvents = sessions.filter(s => s.day === selectedDay && s.type === 'event');
  if (eveningEvents.length === 0) return null;

  eveningEvents.sort((a, b) => {
    if (!a.start_time) return 1;
    if (!b.start_time) return -1;
    return isoToMinutes(a.start_time) - isoToMinutes(b.start_time);
  });

  return (
    <div style={{ borderTop: `1px solid ${BV.paperLine}`, padding: '20px 24px', background: '#fff' }}>
      <div style={{ fontFamily: BV.mono, fontSize: '10px', color: BV.inkFaint, letterSpacing: '2px', textTransform: 'uppercase', marginBottom: '14px' }}>
        Evening Events
      </div>
      <div style={{ display: 'flex', gap: '12px', overflowX: 'auto', paddingBottom: '8px' }}>
        {eveningEvents.map(s => {
          const startMins = s.start_time ? isoToMinutes(s.start_time) : null;
          const endMins = startMins !== null ? startMins + s.duration_minutes : null;
          const timeLabel = startMins !== null ? `${formatTime24(startMins)}–${formatTime24(endMins)}` : '';
          return (
            <div key={s.id} onClick={() => onEdit(s)} style={{
              background: BV.card, border: `1px solid ${BV.cardBorder}`,
              borderRadius: '8px', padding: '14px 18px', cursor: 'pointer',
              minWidth: '240px', maxWidth: '300px', flexShrink: 0,
              boxShadow: BV.cardShadow, transition: 'box-shadow .15s, transform .06s',
            }}
              onMouseEnter={e => { e.currentTarget.style.boxShadow = BV.cardHoverShadow; e.currentTarget.style.transform = 'translateY(-1px)'; }}
              onMouseLeave={e => { e.currentTarget.style.boxShadow = BV.cardShadow; e.currentTarget.style.transform = 'none'; }}
            >
              {timeLabel && <div style={{ fontFamily: BV.mono, fontSize: '11px', color: '#2563EB', marginBottom: '6px' }}>{timeLabel}</div>}
              <div style={{ fontSize: '13px', fontWeight: 'bold', color: BV.ink, marginBottom: '4px' }}>{s.title}</div>
              <div style={{ fontSize: '11px', color: BV.inkSoft }}>
                {s.venue && <span>{s.venue}</span>}
                {s.venue && s.host && <span> · </span>}
                {s.host && <span>{s.host}</span>}
              </div>
              {s.invite_only && (
                <span style={{
                  display: 'inline-block', marginTop: '6px',
                  fontSize: '9px', padding: '2px 8px', borderRadius: '20px',
                  background: '#f59e0b22', border: '1px solid #f59e0b44',
                  color: '#f59e0b', letterSpacing: '0.05em', fontWeight: 600,
                }}>INVITE ONLY</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Capacity Rail ────────────────────────────────────────────────────────────
function CapacityRail({ stages, daySessions, selectedDay }) {
  const mainStages = stages.filter(s => (s.max_columns || 1) === 1);
  if (mainStages.length === 0) return null;

  const caps = mainStages.map(stage => {
    const openFrom = parseTime(stage.open_from);
    const openUntil = parseTime(stage.open_until);
    const windowMins = openUntil - openFrom;
    const stageSessions = daySessions.filter(s => s.stage_id === stage.id && s.start_time && s.type !== 'block');
    const usedMins = stageSessions.reduce((sum, s) => sum + (s.duration_minutes || 0), 0);
    const pct = windowMins > 0 ? Math.round((usedMins / windowMins) * 100) : 0;
    const slotsLeft = windowMins > 0 ? Math.floor((windowMins - usedMins) / 30) : 0;
    return { stage, pct: Math.min(pct, 100), slotsLeft: Math.max(slotsLeft, 0) };
  });

  return (
    <div style={{
      background: '#fff', borderBottom: `1px solid ${BV.paperLine}`,
      display: 'flex', alignItems: 'center', gap: '28px', padding: '9px 20px',
      position: 'sticky', top: '52px', zIndex: 40, overflowX: 'auto', flexShrink: 0,
    }}>
      <span style={{ fontFamily: BV.mono, fontSize: '10px', letterSpacing: '1px', color: BV.inkFaint, whiteSpace: 'nowrap' }}>
        CAPACITY · {DAYS.find(d => d.id === selectedDay)?.label?.toUpperCase()}
      </span>
      {caps.map(({ stage, pct, slotsLeft }) => {
        const fillColor = pct > 90 ? BV.clash : pct >= 70 ? '#C2410C' : BV.open;
        const tier = pct > 90 ? 'full' : pct >= 70 ? 'tight' : '';
        return (
          <div key={stage.id} style={{ display: 'flex', alignItems: 'center', gap: '9px', whiteSpace: 'nowrap' }}>
            <span style={{ fontSize: '12px', fontWeight: 600, width: '118px', textAlign: 'right', color: BV.ink }}>{stage.name}</span>
            <div style={{ width: '150px', height: '9px', background: BV.paperLine, borderRadius: '5px', overflow: 'hidden', position: 'relative' }}>
              <div style={{ height: '100%', borderRadius: '5px', width: `${pct}%`, background: fillColor }} />
            </div>
            <span style={{
              fontFamily: BV.mono, fontSize: '11px', width: '80px',
              color: tier === 'full' ? BV.clash : tier === 'tight' ? '#C2410C' : BV.inkSoft,
              fontWeight: tier ? 700 : 400,
            }}>
              {pct}% · {slotsLeft} slot{slotsLeft !== 1 ? 's' : ''}
            </span>
          </div>
        );
      })}
      <div style={{ display: 'flex', gap: '14px', alignItems: 'center', marginLeft: 'auto' }}>
        {['Keynote', 'Panel', 'Podcast', 'Workshop'].map(t => (
          <span key={t} style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '10px', color: BV.inkSoft }}>
            <span style={{ width: '10px', height: '10px', borderRadius: '3px', display: 'inline-block', background: TYPE_SPINE[t] }} />
            {t}
          </span>
        ))}
      </div>
    </div>
  );
}

// ── Login Screen ─────────────────────────────────────────────────────────────
function LoginScreen() {
  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState(null);

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!email.trim() || sending) return;
    setSending(true);
    setError(null);
    const { error: authError } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: window.location.origin },
    });
    if (authError) {
      setError(authError.message);
      setSending(false);
    } else {
      setSent(true);
      setSending(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: BV.cockpit, fontFamily: BV.sans,
    }}>
      <div style={{
        width: '380px', padding: '40px', borderRadius: '12px',
        background: '#1a1b1f', border: `1px solid ${BV.cockpitLine}`,
        boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
      }}>
        <div style={{ marginBottom: '32px', textAlign: 'center' }}>
          <div style={{ fontFamily: BV.mono, fontSize: '14px', fontWeight: 800, letterSpacing: '2px', color: '#fff', marginBottom: '4px' }}>
            FINTECH NERDCON<span style={{ color: '#E63917' }}>.</span>
          </div>
          <div style={{ fontFamily: BV.mono, fontSize: '10px', letterSpacing: '1px', color: BV.inkFaint }}>BUILD VIEW</div>
        </div>

        {sent ? (
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '32px', marginBottom: '12px' }}>📬</div>
            <div style={{ fontSize: '14px', color: '#d4d6dc', marginBottom: '8px' }}>Check your email</div>
            <div style={{ fontSize: '12px', color: BV.inkFaint, lineHeight: 1.5 }}>
              We sent a magic link to <strong style={{ color: '#fff' }}>{email}</strong>.
              Click it to sign in. Check spam if you don't see it.
            </div>
            <button onClick={() => { setSent(false); setEmail(''); }} style={{
              marginTop: '20px', background: 'none', border: `1px solid ${BV.cockpitLine}`,
              borderRadius: '6px', padding: '8px 16px', cursor: 'pointer',
              fontSize: '11px', color: BV.inkFaint, fontFamily: BV.mono, letterSpacing: '0.5px',
            }}>Try a different email</button>
          </div>
        ) : (
          <form onSubmit={handleLogin}>
            <label style={{ display: 'block', fontSize: '10px', letterSpacing: '0.8px', color: BV.inkFaint, marginBottom: '6px', fontFamily: BV.mono }}>EMAIL</label>
            <input
              type="email" value={email} onChange={e => setEmail(e.target.value)}
              placeholder="you@example.com" autoFocus required
              style={{
                width: '100%', padding: '12px 14px', fontSize: '14px', fontFamily: BV.sans,
                background: BV.cockpit, border: `1px solid ${BV.cockpitLine}`, borderRadius: '6px',
                color: '#fff', outline: 'none', boxSizing: 'border-box',
              }}
              onFocus={e => e.target.style.borderColor = '#3568FF'}
              onBlur={e => e.target.style.borderColor = BV.cockpitLine}
            />
            {error && <div style={{ fontSize: '11px', color: '#f87171', marginTop: '8px' }}>{error}</div>}
            <button type="submit" disabled={!email.trim() || sending} style={{
              width: '100%', marginTop: '16px', padding: '12px', fontSize: '13px', fontWeight: 600,
              fontFamily: BV.sans, letterSpacing: '0.3px',
              background: email.trim() ? '#3568FF' : '#2a2c33', border: 'none', borderRadius: '6px',
              color: email.trim() ? '#fff' : BV.inkFaint, cursor: email.trim() ? 'pointer' : 'default',
            }}>
              {sending ? 'Sending…' : 'Send magic link'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

// ── Auth Wrapper ─────────────────────────────────────────────────────────────
export default function App() {
  const [authUser, setAuthUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setAuthUser(session?.user ?? null);
      if (session?.user) loadProfile(session.user.id);
      else setAuthLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setAuthUser(session?.user ?? null);
      if (session?.user) loadProfile(session.user.id);
      else { setProfile(null); setAuthLoading(false); }
    });
    return () => subscription.unsubscribe();
  }, []);

  const loadProfile = async (userId) => {
    const { data } = await supabase.from('profiles').select('*').eq('id', userId).single();
    setProfile(data);
    setAuthLoading(false);
  };

  if (authLoading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: BV.cockpit }}>
        <div style={{ fontFamily: BV.mono, fontSize: '12px', color: BV.inkFaint, letterSpacing: '1px' }}>LOADING…</div>
      </div>
    );
  }

  if (!authUser) return <LoginScreen />;

  const role = profile?.role || 'commenter';

  return (
    <AuthContext.Provider value={{ user: authUser, profile, role }}>
      <NerdConPlanner />
    </AuthContext.Provider>
  );
}

// ── Main App ──────────────────────────────────────────────────────────────────
function NerdConPlanner() {
  const { user: authUser, profile, role } = useContext(AuthContext);
  const isEditor = role === 'editor';
  const [sessions, setSessions] = useState([]);
  const [speakers, setSpeakers] = useState([]);
  const [stages, setStages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedDay, setSelectedDay] = useState('day1');
  const [showModal, setShowModal] = useState(false);
  const [editingSession, setEditingSession] = useState(null);
  const [showStagesModal, setShowStagesModal] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const dragSessionRef = useRef(null);
  const [dropError, setDropError] = useState(null);
  const [pendingBlock, setPendingBlock] = useState(null);
  const [prefillStageId, setPrefillStageId] = useState(null);
  const [prefillTimeMins, setPrefillTimeMins] = useState(null);
  const [showRegistrations, setShowRegistrations] = useState(false);
  const [showSpeakersModal, setShowSpeakersModal] = useState(false);
  const [ignoredClashes, setIgnoredClashes] = useState(() => {
    try { return new Set(JSON.parse(localStorage.getItem('nerdcon-ignored-clashes') || '[]')); }
    catch { return new Set(); }
  });
  const toggleIgnoreClash = (sessionId) => {
    setIgnoredClashes(prev => {
      const next = new Set(prev);
      if (next.has(sessionId)) next.delete(sessionId); else next.add(sessionId);
      localStorage.setItem('nerdcon-ignored-clashes', JSON.stringify([...next]));
      return next;
    });
  };

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      // Clean up obsolete stage-closed blocks (stage-open/close are valid operational markers)
      await supabase.from('sessions').delete().in('block_type', ['stage-closed']);

      const [sessRes, spRes, stRes] = await Promise.all([
        supabase.from('sessions').select('*'),
        supabase.from('speakers').select('*'),
        supabase.from('stages').select('*').order('sort_order'),
      ]);
      if (sessRes.data) setSessions(sessRes.data);
      if (spRes.data) setSpeakers(spRes.data);
      if (stRes.data) setStages(stRes.data);
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  const handleSave = async (session) => {
    try {
      const payload = {
        title: session.title, status: session.status, format: session.format,
        duration_minutes: session.duration_minutes, speakers: session.speakers,
        topics: session.topics, notes: session.notes, description: session.description,
        stage_id: session.stage_id,
        day: session.day, session_date: session.session_date || (DAYS.find(d => d.id === session.day)?.full || null),
        start_time: session.start_time, end_time: session.end_time,
        column_index: session.column_index || 0,
        type: session.type || null, block_type: session.block_type || null,
        venue: session.venue || null, host: session.host || null,
        invite_only: session.invite_only || false,
      };
      if (session.capacity !== null && session.capacity !== undefined) payload.capacity = session.capacity;
      payload.id = session.id || crypto.randomUUID();
      const { data, error } = await supabase.from('sessions').upsert(payload).select();
      if (error) throw error;
      setSessions(prev => {
        const saved = data[0];
        const exists = prev.find(s => s.id === saved.id);
        return exists ? prev.map(s => s.id === saved.id ? saved : s) : [...prev, saved];
      });
    } catch (e) { console.error('Save error:', e); alert(`Failed to save: ${e.message || JSON.stringify(e)}`); }
  };

  const handleDelete = async (id) => {
    try {
      await supabase.from('sessions').delete().eq('id', id);
      setSessions(prev => prev.filter(s => s.id !== id));
    } catch (e) { console.error(e); }
  };

  const openNewSession = (stageId, timeMins) => {
    if (!isEditor) return;
    setPrefillStageId(stageId || null);
    setPrefillTimeMins(timeMins != null ? timeMins : null);
    setEditingSession(null);
    setShowModal(true);
  };

  const handleDrop = async (stageId, slotMins, colIndex = 0) => {
    if (!isEditor) return;
    const session = dragSessionRef.current;
    if (!session) return;
    dragSessionRef.current = null;
    const dayDate = DAYS.find(d => d.id === selectedDay)?.full;
    if (!dayDate) return;

    // Closed-hours rejection
    const targetStage = stages.find(st => st.id === stageId);
    if (targetStage) {
      const stageOpen = parseTime(targetStage.open_from || '08:30');
      const stageClose = parseTime(targetStage.open_until || '18:00');
      if (slotMins < stageOpen || slotMins >= stageClose) {
        setDropError({ stageId, slotMins, colIndex });
        setTimeout(() => setDropError(null), 1200);
        return;
      }
    }

    // Block drop — show duration popup
    if (session._isBlock) {
      setPendingBlock({ stageId, slotMins, colIndex, blockType: session.block_type, defaultDuration: session.defaultDuration, label: session.label, color: session.color });
      return;
    }

    // Overlap check
    if (checkOverlap(sessions, stageId, selectedDay, slotMins, session.duration_minutes, session.id, colIndex)) {
      setDropError({ stageId, slotMins, colIndex });
      setTimeout(() => setDropError(null), 800);
      return;
    }

    await handleSave({
      ...session, stage_id: stageId, day: selectedDay, column_index: colIndex,
      start_time: minutesToIso(dayDate, slotMins),
      end_time: minutesToIso(dayDate, slotMins + session.duration_minutes),
    });
  };

  const handleBlockConfirm = async (duration) => {
    if (!pendingBlock) return;
    const { stageId, slotMins, colIndex, blockType, label } = pendingBlock;
    const dayDate = DAYS.find(d => d.id === selectedDay)?.full;
    await handleSave({
      id: null, title: label, type: 'block', block_type: blockType,
      status: 'block', format: null, duration_minutes: duration,
      speakers: [], topics: [], notes: null,
      stage_id: stageId, day: selectedDay, column_index: colIndex,
      start_time: minutesToIso(dayDate, slotMins),
      end_time: minutesToIso(dayDate, slotMins + duration),
    });
    setPendingBlock(null);
  };

  const onDragStart = (session) => { dragSessionRef.current = session; };

  const daySessions = sessions.filter(s => s.day === selectedDay);
  const confirmedCount = sessions.filter(s => s.status === 'confirmed' && s.type !== 'block').length;
  const totalScheduled = sessions.filter(s => s.stage_id && s.day && s.type !== 'block').length;
  const clashes = useMemo(() => {
    let count = 0;
    daySessions.forEach((s1, i) => {
      daySessions.forEach((s2, j) => {
        if (i >= j || s1.stage_id !== s2.stage_id || !s1.start_time || !s2.start_time) return;
        if ((s1.column_index || 0) !== (s2.column_index || 0)) return;
        const s1Start = isoToMinutes(s1.start_time);
        const s1End = s1Start + s1.duration_minutes;
        const s2Start = isoToMinutes(s2.start_time);
        const s2End = s2Start + s2.duration_minutes;
        if (s1Start < s2End && s2Start < s1End) count++;
      });
    });
    return count;
  }, [daySessions]);

  const speakerClashes = useMemo(() => {
    const clashMap = {};
    const list = daySessions.filter(s => s.start_time && s.type !== 'block');
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i], b = list[j];
        const aPencilledOrConfirmed = a.status === 'pencilled' || a.status === 'confirmed';
        const bPencilledOrConfirmed = b.status === 'pencilled' || b.status === 'confirmed';
        if (!aPencilledOrConfirmed && !bPencilledOrConfirmed) continue;
        const aStart = isoToMinutes(a.start_time), aEnd = aStart + a.duration_minutes;
        const bStart = isoToMinutes(b.start_time), bEnd = bStart + b.duration_minutes;
        if (!(aStart < bEnd && bStart < aEnd)) continue;
        const aNorm = normalizeSpeakers(a.speakers);
        const bNorm = normalizeSpeakers(b.speakers);
        const aRealIds = aNorm.filter(s => s.kind === 'speaker' && s.speaker_id).map(s => ({ id: s.speaker_id, status: s.status || 'confirmed' }));
        const bRealIds = bNorm.filter(s => s.kind === 'speaker' && s.speaker_id).map(s => ({ id: s.speaker_id, status: s.status || 'confirmed' }));
        for (const aEntry of aRealIds) {
          const bEntry = bRealIds.find(e => e.id === aEntry.id);
          if (!bEntry) continue;
          const tier = (aEntry.status === 'confirmed' && bEntry.status === 'confirmed') ? 'hard' : 'soft';
          const name = speakers.find(sp => sp.id === aEntry.id)?.name || 'Speaker';
          for (const sid of [a.id, b.id]) {
            if (!clashMap[sid]) clashMap[sid] = { names: new Set(), tier: 'soft' };
            clashMap[sid].names.add(name);
            if (tier === 'hard') clashMap[sid].tier = 'hard';
          }
        }
      }
    }
    return clashMap;
  }, [daySessions, speakers]);

  const speakerClashCount = useMemo(() => {
    return Object.keys(speakerClashes).filter(id => !ignoredClashes.has(id)).length;
  }, [speakerClashes, ignoredClashes]);

  const halls = useMemo(() => {
    const map = {};
    stages.filter(s => (s.max_columns || 1) === 1).forEach(s => {
      if (!map[s.hall_id]) map[s.hall_id] = { id: s.hall_id, name: s.hall_name, stages: [] };
      map[s.hall_id].stages.push(s);
    });
    return Object.values(map).filter(h => h.stages.length > 0);
  }, [stages]);

  const roundtableStages = useMemo(() => stages.filter(s => (s.max_columns || 1) > 1), [stages]);

  const onEditSession = (s) => { setEditingSession(s); setShowModal(true); };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: BV.paper, color: BV.ink, fontFamily: BV.sans, overflow: 'hidden' }}>
      {/* Top Bar — dark cockpit */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '24px', padding: '0 20px', height: '60px', borderBottom: `1px solid ${BV.cockpitLine}`, background: BV.cockpit, flexShrink: 0 }}>
        <div style={{ fontFamily: BV.mono, fontWeight: 700, letterSpacing: '1px', fontSize: '15px', whiteSpace: 'nowrap', color: '#fff' }}>
          FINTECH NERDCON<span style={{ color: TYPE_SPINE.Keynote }}>.</span>
        </div>
        <div style={{ fontFamily: BV.mono, fontSize: '10px', lineHeight: 1.4, color: '#8A8D96', letterSpacing: '0.5px' }}>
          SAN DIEGO<br />NOV 18–20 · OPS
        </div>
        <div style={{ display: 'flex', gap: '6px' }}>
          {DAYS.map(day => (
            <button key={day.id} onClick={() => setSelectedDay(day.id)} style={{
              padding: '7px 14px', borderRadius: '7px', cursor: 'pointer', fontFamily: BV.mono,
              fontSize: '11px', lineHeight: 1.3, textAlign: 'left', transition: '.12s',
              background: selectedDay === day.id ? '#2563EB' : 'transparent',
              border: `1px solid ${selectedDay === day.id ? '#2563EB' : BV.cockpitLine}`,
              color: selectedDay === day.id ? '#fff' : '#B7BAC2',
            }}><b style={{ display: 'block', fontSize: '12px' }}>{day.label}</b>{day.date}</button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: '18px', marginLeft: '4px' }}>
          {[
            { label: 'CONFIRMED', value: confirmedCount, color: '#60A5FA' },
            { label: 'SCHEDULED', value: totalScheduled, color: '#fff' },
            { label: 'CLASHES', value: clashes + speakerClashCount, color: (clashes + speakerClashCount) > 0 ? BV.clash : '#8A8D96' },
          ].map(stat => (
            <div key={stat.label} style={{ textAlign: 'center', fontFamily: BV.mono }}>
              <div style={{ fontSize: '18px', fontWeight: 700, color: stat.color, lineHeight: 1 }}>{stat.value}</div>
              <div style={{ fontSize: '8.5px', letterSpacing: '1px', color: '#8A8D96', marginTop: '3px' }}>{stat.label}</div>
            </div>
          ))}
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px', alignItems: 'center' }}>
          {isEditor && <button onClick={() => setShowSpeakersModal(true)} style={{ background: 'transparent', border: `1px solid ${BV.cockpitLine}`, color: '#D4D6DC', borderRadius: '7px', padding: '8px 13px', cursor: 'pointer', fontFamily: BV.mono, fontSize: '11px', letterSpacing: '0.5px', transition: '.12s', display: 'flex', gap: '6px', alignItems: 'center' }}>SPEAKERS</button>}
          {isEditor && <button onClick={() => setShowRegistrations(true)} style={{ background: 'transparent', border: `1px solid ${BV.cockpitLine}`, color: '#D4D6DC', borderRadius: '7px', padding: '8px 13px', cursor: 'pointer', fontFamily: BV.mono, fontSize: '11px', letterSpacing: '0.5px', transition: '.12s', display: 'flex', gap: '6px', alignItems: 'center' }}>SIGNUPS</button>}
          {isEditor && <button onClick={() => setShowStagesModal(true)} style={{ background: 'transparent', border: `1px solid ${BV.cockpitLine}`, color: '#D4D6DC', borderRadius: '7px', padding: '8px 13px', cursor: 'pointer', fontFamily: BV.mono, fontSize: '11px', letterSpacing: '0.5px', transition: '.12s', display: 'flex', gap: '6px', alignItems: 'center' }}>STAGES</button>}
          {isEditor && <button onClick={() => { setEditingSession(null); setShowModal(true); }} style={{ background: '#2563EB', border: '1px solid #2563EB', color: '#fff', borderRadius: '7px', padding: '8px 13px', cursor: 'pointer', fontFamily: BV.mono, fontSize: '11px', letterSpacing: '0.5px', fontWeight: 600, display: 'flex', gap: '6px', alignItems: 'center' }}>+ NEW SESSION</button>}
          <a href="/view" target="_blank" rel="noopener noreferrer" style={{ background: 'transparent', border: `1px solid ${BV.cockpitLine}`, color: '#D4D6DC', borderRadius: '7px', padding: '8px 13px', fontFamily: BV.mono, fontSize: '11px', letterSpacing: '0.5px', textDecoration: 'none', display: 'flex', gap: '6px', alignItems: 'center' }}>VIEW</a>
          <div style={{ width: '1px', height: '20px', background: BV.cockpitLine, margin: '0 4px' }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontFamily: BV.mono, fontSize: '9px', color: BV.inkFaint, letterSpacing: '0.5px' }}>
              {profile?.display_name || authUser?.email?.split('@')[0]} <span style={{ color: isEditor ? '#22c55e' : '#eab308', fontWeight: 600 }}>{isEditor ? 'EDITOR' : 'VIEW'}</span>
            </span>
            <button onClick={() => supabase.auth.signOut()} style={{
              background: 'none', border: `1px solid ${BV.cockpitLine}`, borderRadius: '5px',
              padding: '4px 10px', cursor: 'pointer', fontFamily: BV.mono, fontSize: '9px',
              color: BV.inkFaint, letterSpacing: '0.5px',
            }}>OUT</button>
          </div>
        </div>
      </div>

      {/* Capacity Rail */}
      <CapacityRail stages={stages} daySessions={daySessions} selectedDay={selectedDay} />

      {/* Content: Sidebar + Grid */}
      {/* Content: Sidebar + Grid */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {selectedDay !== 'day0' && (
          <SidebarPanel sessions={sessions} speakers={speakers} selectedDay={selectedDay}
            onEdit={onEditSession} onDragStart={onDragStart} isOpen={sidebarOpen} onToggle={() => setSidebarOpen(p => !p)} isEditor={isEditor} />
        )}

        {loading ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#3568FF' }}>Loading...</div>
        ) : selectedDay === 'day0' ? (
          <ActivationsList sessions={sessions} selectedDay="day0" onEdit={onEditSession} onNew={() => { setEditingSession(null); setShowModal(true); }} isEditor={isEditor} />
        ) : (
          <div style={{ flex: 1, overflow: 'auto' }}>
            <div style={{ display: 'inline-flex', flexDirection: 'column', minWidth: '100%' }}>

              {/* ── Sticky header row (hall names + stage names) ── */}
              <div style={{ position: 'sticky', top: 0, zIndex: 30, display: 'flex', background: '#fff' }}>
                {/* Corner cell — sticky in both directions */}
                <div style={{ width: `${TIME_COL_WIDTH}px`, flexShrink: 0, position: 'sticky', left: 0, zIndex: 31, background: BV.paper }}>
                  <div style={{ height: '30px', borderBottom: `1px solid ${BV.paperLine}`, borderRight: `1px solid ${BV.paperLine}` }} />
                  <div style={{ height: '44px', borderBottom: `1px solid ${BV.paperLine}`, borderRight: `1px solid ${BV.paperLine}` }} />
                </div>
                {halls.map(hall => {
                  const hallWidth = hall.stages.reduce((sum, s) => sum + STAGE_COL_WIDTH * (s.max_columns || 1), 0);
                  return (
                    <div key={hall.id} style={{ flexShrink: 0 }}>
                      <div style={{
                        height: '30px', background: '#fff', borderBottom: `1px solid ${BV.paperLine}`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        width: `${hallWidth}px`,
                      }}>
                        <span style={{ fontFamily: BV.mono, fontSize: '10px', color: BV.inkFaint, letterSpacing: '2px' }}>{hall.name.toUpperCase()}</span>
                      </div>
                      <div style={{ display: 'flex' }}>
                        {hall.stages.map(stage => {
                          const maxCols = stage.max_columns || 1;
                          const isClosed = false;
                          const openFrom = parseTime(stage.open_from);
                          const openUntil = parseTime(stage.open_until);
                          const windowMins = openUntil - openFrom;
                          const stSessions = daySessions.filter(s => s.stage_id === stage.id && s.start_time && s.type !== 'block');
                          const usedMins = stSessions.reduce((sum, s) => sum + (s.duration_minutes || 0), 0);
                          const occPct = windowMins > 0 ? Math.round((usedMins / windowMins) * 100) : 0;
                          const occColor = occPct > 90 ? BV.clash : occPct >= 70 ? '#C2410C' : BV.open;
                          return (
                            <div key={stage.id} style={{
                              width: `${STAGE_COL_WIDTH * maxCols}px`, padding: '10px 12px',
                              borderBottom: `1px solid ${BV.paperLine}`, borderLeft: `1px solid ${BV.paperLineSoft}`,
                              background: isClosed ? `repeating-linear-gradient(45deg,#FBFAF6,#FBFAF6 6px,#F2F0E8 6px,#F2F0E8 12px)` : '#fff',
                              boxSizing: 'border-box',
                            }}>
                              <div style={{ fontSize: '13px', fontWeight: 700, letterSpacing: '-0.1px', color: BV.ink }}>{stage.name}</div>
                              <div style={{ fontFamily: BV.mono, fontSize: '10px', color: BV.inkFaint, marginTop: '2px' }}>{stage.open_from}–{stage.open_until}{maxCols > 1 ? ` · ${maxCols}col` : ''}</div>
                              {maxCols === 1 && <div style={{ fontFamily: BV.mono, fontSize: '9px', color: occColor, marginTop: '3px', letterSpacing: '0.5px' }}>● {occPct}% full</div>}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* ── Body (time column + slot columns) ── */}
              <div style={{ display: 'flex' }}>
                {/* Time column — sticky left, light paper */}
                <div style={{ width: `${TIME_COL_WIDTH}px`, flexShrink: 0, position: 'sticky', left: 0, zIndex: 15, background: BV.paper }}>
                  {TIME_SLOTS.map(mins => (
                    <div key={mins} style={{ height: `${SLOT_HEIGHT}px`, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', paddingRight: '8px', borderRight: `1px solid ${BV.paperLine}`, borderBottom: mins % 60 === 0 ? `1px solid ${BV.paperLine}` : mins % 30 === 0 ? `1px solid ${BV.paperLineSoft}` : 'none' }}>
                      {mins % 30 === 0 && <span style={{ fontFamily: BV.mono, fontSize: '10px', color: mins % 60 === 0 ? BV.inkSoft : BV.inkFaint }}>{formatTime(mins)}</span>}
                    </div>
                  ))}
                </div>

                {/* Stage slot columns */}
                {halls.map(hall => (
                  <div key={hall.id} style={{ display: 'flex', flexShrink: 0 }}>
                    {hall.stages.map(stage => {
                      const maxCols = stage.max_columns || 1;
                      const allStageSessions = daySessions.filter(s => s.stage_id === stage.id && s.start_time);
                      const openFrom = parseTime(stage.open_from);
                      const openUntil = parseTime(stage.open_until);
                      return (
                        <div key={stage.id} style={{ display: 'flex', flexShrink: 0 }}>
                          {Array.from({ length: maxCols }, (_, colIdx) => {
                            const colSessions = allStageSessions.filter(s => (s.column_index || 0) === colIdx);
                            return (
                              <SlotColumn
                                key={colIdx}
                                stage={stage}
                                stageSessions={colSessions}
                                speakers={speakers}
                                openFrom={openFrom}
                                openUntil={openUntil}
                                colIndex={colIdx}
                                colWidth={STAGE_COL_WIDTH}
                                isLastCol={colIdx === maxCols - 1}
                                dropError={dropError}
                                handleDrop={handleDrop}
                                onDragStart={onDragStart}
                                dragSessionRef={dragSessionRef}
                                openNewSession={openNewSession}
                                onEditSession={onEditSession}
                                speakerClashes={speakerClashes}
                                ignoredClashes={ignoredClashes}
                                isEditor={isEditor}
                              />
                            );
                          })}
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>

            </div>

            {/* ── Roundtables Section (below main grid) ── */}
            {roundtableStages.map(stage => (
              <RoundtablesSection
                key={stage.id}
                stage={stage}
                daySessions={daySessions}
                speakers={speakers}
                selectedDay={selectedDay}
                onDragStart={onDragStart}
                onEditSession={onEditSession}
                handleDrop={handleDrop}
                handleSave={handleSave}
                dropError={dropError}
                dragSessionRef={dragSessionRef}
                openNewSession={openNewSession}
                isEditor={isEditor}
              />
            ))}

            {/* ── Evening Events (Days 1 & 2) ── */}
            <EveningEventsSection sessions={sessions} selectedDay={selectedDay} onEdit={onEditSession} />
          </div>
        )}
      </div>

      <SessionModal isOpen={showModal} onClose={() => { setShowModal(false); setEditingSession(null); setPrefillStageId(null); setPrefillTimeMins(null); }}
        onSave={handleSave} onDelete={handleDelete} editingSession={editingSession} speakers={speakers} stages={stages} selectedDay={selectedDay}
        onSpeakerAdded={(sp) => setSpeakers(prev => [...prev, sp])}
        clashInfo={editingSession ? speakerClashes[editingSession.id] : null}
        isIgnored={editingSession ? ignoredClashes.has(editingSession.id) : false}
        onToggleIgnore={toggleIgnoreClash} readOnly={!isEditor}
        prefillStageId={prefillStageId} prefillTimeMins={prefillTimeMins}
        onCommentsChange={(sessionId, updated) => setSessions(prev => prev.map(s => s.id === sessionId ? { ...s, comments: updated } : s))} />

      <ManageSpeakersModal isOpen={showSpeakersModal} onClose={() => setShowSpeakersModal(false)} speakers={speakers} onSpeakersChange={setSpeakers} />

      <ManageStagesModal isOpen={showStagesModal} onClose={() => setShowStagesModal(false)} stages={stages} onStagesChange={setStages} />

      <RegistrationsModal isOpen={showRegistrations} onClose={() => setShowRegistrations(false)} sessions={sessions} stages={stages} />

      {pendingBlock && <BlockDurationPopup pending={pendingBlock} onConfirm={handleBlockConfirm} onCancel={() => setPendingBlock(null)} />}
    </div>
  );
}
