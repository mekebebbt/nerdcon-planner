import React, { useState, useMemo, useEffect, useRef } from 'react';
import { createClient } from '@supabase/supabase-js';
import { v4 as uuidv4 } from 'uuid';
import { TOPIC_TAGS, TOPIC_TAG_COLORS, FORMAT_TAGS } from './stages.config.js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

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
// Helper to normalize speakers from old flat array or new object format
const normalizeSpeakers = (speakers) => {
  if (!speakers || !Array.isArray(speakers)) return [];
  return speakers.map(s => {
    if (typeof s === 'string') return { speaker_id: s, role: 'speaker' };
    return s;
  });
};
const getSpeakerIds = (speakers) => normalizeSpeakers(speakers).map(s => s.speaker_id);
const getSpeakerRole = (speakers, speakerId) => {
  const entry = normalizeSpeakers(speakers).find(s => s.speaker_id === speakerId);
  return entry?.role || 'speaker';
};

function SessionModal({ isOpen, onClose, onSave, onDelete, editingSession, speakers, stages, selectedDay, onSpeakerAdded }) {
  const [title, setTitle] = useState('');
  const [status, setStatus] = useState('placeholder');
  const [format, setFormat] = useState('Panel');
  const [duration, setDuration] = useState(30);
  const [startTime, setStartTime] = useState('09:00');
  const [selectedSpeakers, setSelectedSpeakers] = useState([]);
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
    setSelectedSpeakers(prev => [...prev, { speaker_id: newSpeaker.id, role: 'speaker' }]);
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
      setTopics(editingSession.topics || []);
      setNotes(editingSession.notes || '');
      setDescription(editingSession.description || '');
      setStageId(editingSession.stage_id || (stages[0]?.id || ''));
      setCapacity(editingSession.capacity ?? '');
      setVenue(editingSession.venue || '');
      setHost(editingSession.host || '');
      setInviteOnly(editingSession.invite_only || false);
      if (editingSession.start_time) setStartTime(formatTime24(isoToMinutes(editingSession.start_time)));
    } else {
      setTitle(''); setStatus('placeholder'); setFormat('Panel');
      setDuration(30); setStartTime('09:00'); setSelectedSpeakers([]);
      setTopics([]); setNotes(''); setDescription(''); setStageId(stages[0]?.id || '');
      setCapacity(''); setVenue(''); setHost(''); setInviteOnly(false);
    }
  }, [editingSession, isOpen, stages]);

  if (!isOpen) return null;

  const isDay0 = selectedDay === 'day0';

  const handleSave = () => {
    const [h, m] = startTime.split(':').map(Number);
    const startMins = h * 60 + m;
    const session = {
      ...(editingSession || {}),
      id: editingSession?.id || null,
      title: title || (isDay0 ? 'Activation' : `${format} Session`),
      status: isBlock ? 'block' : status, format: isDay0 ? null : format, duration_minutes: duration,
      speakers: isDay0 ? [] : selectedSpeakers, topics: isDay0 ? [] : topics, notes, description,
      stage_id: isDay0 ? null : stageId, day: selectedDay,
      capacity: capacity === '' ? null : Number(capacity),
      venue: isDay0 ? (venue || null) : (editingSession?.venue || null),
      host: isDay0 ? (host || null) : (editingSession?.host || null),
      invite_only: isDay0 ? inviteOnly : (editingSession?.invite_only || false),
      type: isDay0 ? 'event' : (editingSession?.type || null),
      start_time: minutesToIso(DAYS.find(d => d.id === selectedDay)?.full, startMins),
      end_time: minutesToIso(DAYS.find(d => d.id === selectedDay)?.full, startMins + duration),
    };
    onSave(session);
    onClose();
  };

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
              <div style={{ maxHeight: '200px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {speakers.map(sp => {
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
                          : [...prev, { speaker_id: sp.id, role: 'speaker' }]
                        );
                      }} style={{ accentColor: '#3568FF', flexShrink: 0 }} />
                      <div style={{ flex: 1 }}>
                        <div style={{ color: 'rgb(240,240,240)', fontSize: '13px' }}>{sp.name}</div>
                        <div style={{ color: 'rgba(240,240,240,0.4)', fontSize: '11px' }}>{sp.title} · {sp.company}</div>
                      </div>
                      {isSelected && (
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
                      )}
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
      </div>

      <div style={{ padding: '16px 24px', borderTop: '1px solid rgba(255,255,255,0.06)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          {editingSession && (
            <button onClick={() => { onDelete(editingSession.id); onClose(); }} style={{ background: 'none', border: '1px solid #3a1a1a', borderRadius: '4px', padding: '8px 16px', color: '#f87171', cursor: 'pointer', fontSize: '12px', fontFamily: 'inherit' }}>Delete</button>
          )}
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={onClose} style={{ background: 'none', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '4px', padding: '8px 16px', color: 'rgba(240,240,240,0.4)', cursor: 'pointer', fontSize: '12px', fontFamily: 'inherit' }}>Cancel</button>
          <button onClick={handleSave} style={{ background: '#3568FF', border: 'none', borderRadius: '4px', padding: '8px 20px', color: '#fff', cursor: 'pointer', fontSize: '12px', fontFamily: 'inherit', fontWeight: 'bold' }}>
            {editingSession ? 'Save Changes' : 'Create Session'}
          </button>
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
function BlockSidebarItem({ block, onDragStart }) {
  return (
    <div
      draggable="true"
      onDragStart={(e) => {
        e.dataTransfer.setData('text/plain', `block:${block.id}`);
        e.dataTransfer.effectAllowed = 'move';
        onDragStart({ _isBlock: true, block_type: block.id, defaultDuration: block.defaultDuration, label: block.label, color: block.color });
      }}
      style={{
        background: `${block.color}15`, border: `1px dashed ${block.color}50`,
        borderRadius: '3px', padding: '5px 8px', marginBottom: '4px',
        cursor: 'grab', fontSize: '10px', color: block.color,
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

function SidebarCard({ session, speakers, onClick, onDragStart }) {
  const statusDef = SESSION_STATUSES.find(s => s.id === session.status) || SESSION_STATUSES[0];
  const sessionSpeakers = speakers.filter(sp => getSpeakerIds(session.speakers).includes(sp.id));
  const metaColor = statusDef.textColor;
  return (
    <div draggable="true"
      onDragStart={(e) => { e.dataTransfer.setData('text/plain', session.id); e.dataTransfer.effectAllowed = 'move'; onDragStart(session); }}
      onClick={onClick}
      style={{
        background: statusDef.color,
        border: `${statusDef.borderWidth || '1px'} ${statusDef.borderStyle || 'solid'} ${statusDef.border}`,
        borderRadius: '4px',
        padding: '8px 10px', marginBottom: '6px', cursor: 'grab', transition: 'opacity 0.15s',
      }}
      onMouseEnter={e => e.currentTarget.style.opacity = '0.85'}
      onMouseLeave={e => e.currentTarget.style.opacity = '1'}
    >
      <div style={{ fontSize: '11px', fontWeight: 'bold', color: statusDef.textColor, letterSpacing: '0.05em', lineHeight: 1.3, marginBottom: '4px' }}>{session.title}</div>
      <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ fontSize: '9px', padding: '1px 6px', borderRadius: '3px', background: statusDef.border + '33', color: metaColor, letterSpacing: '0.05em', opacity: 0.7 }}>{session.format || 'TBD'}</span>
        <span style={{ fontSize: '10px', color: metaColor, opacity: 0.6 }}>{session.duration_minutes}m</span>
      </div>
      {sessionSpeakers.length > 0 && <div style={{ fontSize: '10px', color: metaColor, marginTop: '4px', opacity: 0.7 }}>{sessionSpeakers.map(sp => {
        const role = getSpeakerRole(session.speakers, sp.id);
        return role === 'moderator' ? `[MOD] ${sp.name}` : sp.name;
      }).join(', ')}</div>}
    </div>
  );
}

function SidebarPanel({ sessions, speakers, selectedDay, onEdit, onDragStart, isOpen, onToggle }) {
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
            {BLOCK_TYPES.map(b => <BlockSidebarItem key={b.id} block={b} onDragStart={onDragStart} />)}
          </div>
          {/* Unscheduled */}
          <div style={{ marginBottom: '20px' }}>
            <div style={{ fontSize: '10px', color: 'rgba(240,240,240,0.4)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '8px', paddingBottom: '4px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>Unscheduled ({unscheduled.length})</div>
            {unscheduled.length === 0 ? <div style={{ fontSize: '11px', color: 'rgba(240,240,240,0.2)', fontStyle: 'italic', padding: '8px 0' }}>No unscheduled sessions</div>
              : unscheduled.map(s => <SidebarCard key={s.id} session={s} speakers={speakers} onClick={() => onEdit(s)} onDragStart={onDragStart} />)}
          </div>
          {/* Scheduled */}
          <div>
            <div style={{ fontSize: '10px', color: 'rgba(240,240,240,0.4)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '8px', paddingBottom: '4px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>Scheduled — {DAYS.find(d => d.id === selectedDay)?.label} ({scheduled.length})</div>
            {scheduled.length === 0 ? <div style={{ fontSize: '11px', color: 'rgba(240,240,240,0.2)', fontStyle: 'italic', padding: '8px 0' }}>No sessions for this day</div>
              : scheduled.map(s => <SidebarCard key={s.id} session={s} speakers={speakers} onClick={() => onEdit(s)} onDragStart={onDragStart} />)}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Grid Cards ────────────────────────────────────────────────────────────────
function SessionCard({ session, speakers, onClick, style, onDragStart }) {
  const statusDef = SESSION_STATUSES.find(s => s.id === session.status) || SESSION_STATUSES[0];
  const sessionSpeakers = speakers.filter(sp => getSpeakerIds(session.speakers).includes(sp.id));
  const topicColor = session.topics?.[0] ? TOPIC_TAG_COLORS[session.topics[0]] : '#3568FF';
  const startMins = session.start_time ? isoToMinutes(session.start_time) : null;
  const timeLabel = startMins !== null ? `${formatTime24(startMins)}–${formatTime24(startMins + session.duration_minutes)}` : null;
  const metaColor = statusDef.textColor;
  const leftAccent = topicColor;
  const dur = session.duration_minutes || 0;
  const showFormat = dur >= 20;
  const showSpeakers = dur >= 40;
  const showTopics = dur >= 40;
  return (
    <div draggable="true"
      onDragStart={(e) => { e.dataTransfer.setData('text/plain', session.id); e.dataTransfer.effectAllowed = 'move'; if (onDragStart) onDragStart(session); }}
      onClick={onClick} style={{
        margin: '0 2px',
        position: 'relative',
        background: 'rgb(13,13,13)',
        borderTop: '1px solid rgba(255,255,255,0.06)',
        borderRight: '1px solid rgba(255,255,255,0.06)',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        borderLeft: `3px solid ${leftAccent}`,
        borderRadius: '6px', padding: dur < 20 ? '2px 6px' : '6px 8px', cursor: 'grab',
        overflow: 'hidden', boxSizing: 'border-box', transition: 'opacity 0.15s', zIndex: 10,
        ...style
      }}
      onMouseEnter={e => e.currentTarget.style.opacity = '0.85'}
      onMouseLeave={e => e.currentTarget.style.opacity = '1'}
    >
      {timeLabel && <div style={{ fontSize: '11px', letterSpacing: '0.03em', color: metaColor, lineHeight: 1, marginBottom: dur < 20 ? '1px' : '3px', fontWeight: 500 }}>{timeLabel}</div>}
      <div style={{ fontSize: dur < 20 ? '11px' : '13px', fontWeight: 'bold', letterSpacing: '0.04em', color: statusDef.textColor, textTransform: 'uppercase', lineHeight: 1.2, marginBottom: showFormat ? '4px' : 0, whiteSpace: dur < 20 ? 'nowrap' : undefined, overflow: dur < 20 ? 'hidden' : undefined, textOverflow: dur < 20 ? 'ellipsis' : undefined }}>{session.title}</div>
      {showFormat && session.format && <div style={{ marginBottom: '3px' }}><span style={{ fontSize: '11px', padding: '1px 6px', borderRadius: '2px', background: leftAccent + '18', color: metaColor, letterSpacing: '0.04em' }}>{session.format}</span></div>}
      {sessionSpeakers.length > 0 && <div style={{ fontSize: '11px', color: 'rgba(240,240,240,0.4)', lineHeight: 1.3, marginTop: '2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{sessionSpeakers.slice(0, 3).map(s => s.name).join(', ')}{sessionSpeakers.length > 3 ? ` +${sessionSpeakers.length - 3}` : ''}</div>}
      {showTopics && session.topics?.[0] && <div style={{ fontSize: '10px', color: topicColor, marginTop: '3px', opacity: 0.8 }}>{session.topics[0]}{session.topics[1] ? `, ${session.topics[1]}` : ''}</div>}
    </div>
  );
}

function BlockCard({ session, onClick, style, onDragStart }) {
  const blockDef = BLOCK_TYPES.find(b => b.id === session.block_type);
  const color = blockDef?.color || '#6b7280';
  const bgColor = blockDef?.bgColor || '#1a1a1a';
  const stripeColor = blockDef?.stripeColor || color;
  const startMins = session.start_time ? isoToMinutes(session.start_time) : null;
  const timeLabel = startMins !== null ? `${formatTime24(startMins)}–${formatTime24(startMins + session.duration_minutes)}` : null;
  return (
    <div draggable="true"
      onDragStart={(e) => { e.dataTransfer.setData('text/plain', session.id); e.dataTransfer.effectAllowed = 'move'; if (onDragStart) onDragStart(session); }}
      onClick={onClick} style={{
        margin: '0 2px',
        position: 'relative',
        background: `repeating-linear-gradient(45deg, ${bgColor}, ${bgColor} 4px, ${stripeColor}25 4px, ${stripeColor}25 8px)`,
        border: `1px dashed ${color}60`, borderRadius: '3px', padding: '3px 6px',
        cursor: 'grab', overflow: 'hidden', boxSizing: 'border-box', zIndex: 10,
        display: 'flex', flexDirection: 'column', justifyContent: 'center',
        ...style,
      }}
    >
      <div style={{ fontSize: '10px', fontWeight: 'bold', color, textTransform: 'uppercase', letterSpacing: '0.05em', opacity: 0.9, lineHeight: 1.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {timeLabel && <span style={{ color: `${color}99` }}>{timeLabel} · </span>}{session.title}
      </div>
    </div>
  );
}

// ── Slot renderer (absolute positioning) ──────────────────────────────────────
function SlotColumn({ stage, stageSessions, speakers, openFrom, openUntil, colIndex, colWidth, isLastCol, dropError, handleDrop, onDragStart, dragSessionRef, openNewSession, onEditSession }) {
  const gridStart = TIME_SLOTS[0];
  const gridEnd = TIME_SLOTS[TIME_SLOTS.length - 1] + 5;
  const totalHeight = TIME_SLOTS.length * SLOT_HEIGHT;

  return (
    <div style={{ width: `${colWidth}px`, flexShrink: 0, position: 'relative', height: `${totalHeight}px` }}>
      {/* Slot grid cells — drag/drop targets */}
      {TIME_SLOTS.map(mins => {
        const isOpen = mins >= openFrom && mins < openUntil;
        const isClosed = mins < openFrom || mins >= openUntil;
        const isErr = dropError?.stageId === stage.id && dropError?.slotMins === mins && (dropError?.colIndex ?? 0) === colIndex;
        return (
          <div key={mins}
            onClick={() => isOpen && openNewSession(stage.id, mins)}
            onDragOver={isOpen ? e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; } : undefined}
            onDragEnter={isOpen ? e => { e.preventDefault(); e.currentTarget.style.background = 'rgb(18,18,18)'; } : undefined}
            onDragLeave={isOpen ? e => { e.currentTarget.style.background = isOpen ? 'rgb(10,10,10)' : 'rgb(5,5,5)'; } : undefined}
            onDrop={isOpen ? e => { e.preventDefault(); e.currentTarget.style.background = 'rgb(10,10,10)'; handleDrop(stage.id, mins, colIndex); } : undefined}
            style={{
              position: 'absolute', left: 0, right: 0,
              top: `${(mins - gridStart) / 5 * SLOT_HEIGHT}px`,
              height: `${SLOT_HEIGHT}px`,
              background: isErr ? '#3a0a0a' : isClosed ? 'rgb(5,5,5)' : 'rgb(10,10,10)',
              borderBottom: mins % 60 === 0 ? '1px solid rgb(18,18,18)' : mins % 30 === 0 ? '1px solid rgba(255,255,255,0.03)' : 'none',
              borderRight: isLastCol ? '1px solid rgba(255,255,255,0.06)' : '1px dashed rgba(255,255,255,0.03)',
              cursor: isOpen ? 'cell' : 'default',
              outline: isErr ? '1px solid #f87171' : 'none',
            }}
          />
        );
      })}

      {/* Closed region overlays */}
      {openFrom > gridStart && (
        <div style={{
          position: 'absolute', left: 0, right: 0, top: 0,
          height: `${(openFrom - gridStart) / 5 * SLOT_HEIGHT}px`,
          background: 'repeating-linear-gradient(45deg, #111111 0px, #111111 6px, #0e0e0e 6px, #0e0e0e 12px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          overflow: 'hidden', borderBottom: '1px solid #333333', zIndex: 5,
          borderRight: isLastCol ? '1px solid rgba(255,255,255,0.06)' : '1px dashed rgba(255,255,255,0.03)',
        }}>
          <span style={{ fontSize: '11px', color: '#444444', letterSpacing: '0.2em', fontWeight: 'bold', textTransform: 'uppercase', writingMode: 'vertical-rl', whiteSpace: 'nowrap' }}>STAGE CLOSED</span>
        </div>
      )}
      {openUntil < gridEnd && (
        <div style={{
          position: 'absolute', left: 0, right: 0,
          top: `${(openUntil - gridStart) / 5 * SLOT_HEIGHT}px`,
          height: `${(gridEnd - openUntil) / 5 * SLOT_HEIGHT}px`,
          background: 'repeating-linear-gradient(45deg, #111111 0px, #111111 6px, #0e0e0e 6px, #0e0e0e 12px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          overflow: 'hidden', borderTop: '1px solid #333333', zIndex: 5,
          borderRight: isLastCol ? '1px solid rgba(255,255,255,0.06)' : '1px dashed rgba(255,255,255,0.03)',
        }}>
          <span style={{ fontSize: '11px', color: '#444444', letterSpacing: '0.2em', fontWeight: 'bold', textTransform: 'uppercase', writingMode: 'vertical-rl', whiteSpace: 'nowrap' }}>STAGE CLOSED</span>
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
          return <BlockCard key={session.id} session={session} onClick={() => onEditSession(session)} onDragStart={onDragStart} style={cardStyle} />;
        }
        return <SessionCard key={session.id} session={session} speakers={speakers} onClick={() => onEditSession(session)} onDragStart={onDragStart} style={cardStyle} />;
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

function RoundtablesSection({ stage, daySessions, speakers, selectedDay, onDragStart, onEditSession, handleDrop, handleSave, dropError, dragSessionRef, openNewSession }) {
  const maxCols = stage.max_columns || 5;
  const allStageSessions = daySessions.filter(s => s.stage_id === stage.id && s.start_time);

  const RT_CARD_WIDTH = 240;

  return (
    <div style={{ borderTop: `2px solid ${stage.color}`, background: 'rgb(8,8,8)', padding: '16px 0' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px', padding: '0 24px', marginBottom: '16px' }}>
        <div style={{ width: '12px', height: '12px', borderRadius: '2px', background: stage.color, flexShrink: 0 }} />
        <div>
          <div style={{ fontSize: '13px', fontWeight: 'bold', color: stage.color, letterSpacing: '0.1em', textTransform: 'uppercase' }}>{stage.name}</div>
          <div style={{ fontSize: '10px', color: 'rgba(240,240,240,0.4)' }}>4 time blocks · {maxCols} parallel slots each</div>
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
              <span style={{ fontSize: '11px', color: 'rgba(240,240,240,0.3)', fontFamily: 'monospace', letterSpacing: '0.05em' }}>
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
                  const rtMetaColor = session.status === 'confirmed' ? 'rgba(240,240,240,0.7)' : 'rgba(240,240,240,0.4)';
                  const rtLeftAccent = session.status === 'confirmed' ? '#3568FF' : topicColor;
                  return (
                    <div key={colIdx} draggable="true"
                      onDragStart={(e) => { e.dataTransfer.setData('text/plain', session.id); e.dataTransfer.effectAllowed = 'move'; onDragStart(session); }}
                      onClick={() => onEditSession(session)}
                      style={{
                        width: `${RT_CARD_WIDTH}px`, padding: '10px 12px', borderRadius: '4px', cursor: 'grab',
                        background: statusDef.color,
                        borderTop: `1px solid ${statusDef.border}`,
                        borderRight: `1px solid ${statusDef.border}`,
                        borderBottom: `1px solid ${statusDef.border}`,
                        borderLeft: `3px solid ${rtLeftAccent}`,
                        transition: 'opacity 0.15s',
                      }}
                      onMouseEnter={e => e.currentTarget.style.opacity = '0.85'}
                      onMouseLeave={e => e.currentTarget.style.opacity = '1'}
                    >
                      <div style={{ fontSize: '13px', fontWeight: 'bold', color: statusDef.textColor, textTransform: 'uppercase', lineHeight: 1.3, marginBottom: '4px', letterSpacing: '0.04em' }}>{session.title}</div>
                      {session.format && <div style={{ marginBottom: '3px' }}><span style={{ fontSize: '11px', padding: '1px 6px', borderRadius: '2px', background: rtLeftAccent + '18', color: rtMetaColor }}>{session.format}</span></div>}
                      {sessionSpeakers.length > 0 && <div style={{ fontSize: '12px', color: rtMetaColor, lineHeight: 1.3 }}>{sessionSpeakers.map(s => {
                        const role = getSpeakerRole(session.speakers, s.id);
                        return role === 'moderator' ? `[MOD] ${s.name}` : s.name;
                      }).join(', ')}</div>}
                      {session.capacity && <div style={{ fontSize: '9px', color: '#f59e0b', marginTop: '2px' }}>Cap: {session.capacity}</div>}
                      {session.topics?.[0] && <div style={{ fontSize: '9px', color: topicColor, marginTop: '2px', opacity: 0.8 }}>{session.topics[0]}{session.topics[1] ? `, ${session.topics[1]}` : ''}</div>}
                    </div>
                  );
                }
                // Empty slot — droppable
                return (
                  <div key={colIdx}
                    onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }}
                    onDragEnter={e => { e.preventDefault(); e.currentTarget.style.borderColor = stage.color; e.currentTarget.style.background = 'rgb(18,18,18)'; }}
                    onDragLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)'; e.currentTarget.style.background = 'transparent'; }}
                    onDrop={e => { e.preventDefault(); e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)'; e.currentTarget.style.background = 'transparent'; handleDrop(stage.id, block.start, colIdx); }}
                    onClick={() => openNewSession(stage.id, block.start)}
                    style={{
                      width: `${RT_CARD_WIDTH}px`, padding: '10px 12px', borderRadius: '4px',
                      border: '1px dashed rgba(255,255,255,0.06)', cursor: 'cell',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      minHeight: '48px', transition: 'all 0.15s',
                    }}
                  >
                    <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.08)', letterSpacing: '0.05em' }}>Slot {colIdx + 1}</span>
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
function ActivationsList({ sessions, selectedDay, onEdit, onNew }) {
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
          <button onClick={onNew} style={{
            background: '#3568FF', border: 'none', borderRadius: '8px',
            padding: '8px 20px', color: '#fff', cursor: 'pointer',
            fontSize: '12px', fontFamily: "'JetBrains Mono', ui-monospace, monospace",
            fontWeight: 'bold', letterSpacing: '0.05em',
          }}>+ Add Activation</button>
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
    <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', padding: '20px 24px' }}>
      <div style={{ fontSize: '11px', color: 'rgba(240,240,240,0.4)', letterSpacing: '0.15em', textTransform: 'uppercase', marginBottom: '14px' }}>
        Evening Events
      </div>
      <div style={{ display: 'flex', gap: '12px', overflowX: 'auto', paddingBottom: '8px' }}>
        {eveningEvents.map(s => {
          const startMins = s.start_time ? isoToMinutes(s.start_time) : null;
          const endMins = startMins !== null ? startMins + s.duration_minutes : null;
          const timeLabel = startMins !== null ? `${formatTime24(startMins)}–${formatTime24(endMins)}` : '';
          return (
            <div key={s.id} onClick={() => onEdit(s)} style={{
              background: 'rgb(13,13,13)', border: '1px solid rgba(255,255,255,0.06)',
              borderRadius: '8px', padding: '14px 18px', cursor: 'pointer',
              minWidth: '240px', maxWidth: '300px', flexShrink: 0,
              transition: 'border-color 0.15s',
            }}
              onMouseEnter={e => e.currentTarget.style.borderColor = '#3568FF'}
              onMouseLeave={e => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)'}
            >
              {timeLabel && <div style={{ fontSize: '11px', color: '#3568FF', fontFamily: 'monospace', marginBottom: '6px' }}>{timeLabel}</div>}
              <div style={{ fontSize: '13px', fontWeight: 'bold', color: 'rgb(240,240,240)', marginBottom: '4px' }}>{s.title}</div>
              <div style={{ fontSize: '11px', color: 'rgba(240,240,240,0.4)' }}>
                {s.venue && <span>{'\uD83D\uDCCD'} {s.venue}</span>}
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

// ── Main App ──────────────────────────────────────────────────────────────────
export default function NerdConPlanner() {
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
  const [showRegistrations, setShowRegistrations] = useState(false);
  const [showSpeakersModal, setShowSpeakersModal] = useState(false);

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
        day: session.day, start_time: session.start_time, end_time: session.end_time,
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
    setEditingSession(null);
    setShowModal(true);
  };

  const handleDrop = async (stageId, slotMins, colIndex = 0) => {
    const session = dragSessionRef.current;
    if (!session) return;
    dragSessionRef.current = null;
    const dayDate = DAYS.find(d => d.id === selectedDay)?.full;
    if (!dayDate) return;

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
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: 'rgb(5,5,5)', color: 'rgb(240,240,240)', fontFamily: "'JetBrains Mono', ui-monospace, monospace", overflow: 'hidden' }}>
      {/* Top Bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 24px', height: '52px', borderBottom: '1px solid rgba(255,255,255,0.06)', background: 'rgb(8,8,8)', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '12px' }}>
          <span style={{ fontSize: '13px', fontWeight: 400, letterSpacing: '0.1em', color: 'rgb(240,240,240)', fontFamily: "'Press Start 2P', cursive" }}>FINTECH</span>
          <span style={{ fontSize: '13px', fontWeight: 400, letterSpacing: '0.1em', color: 'rgb(240,240,240)', fontFamily: "'Press Start 2P', cursive" }}>NERDCON</span>
          <span style={{ fontSize: '10px', color: 'rgba(240,240,240,0.3)', letterSpacing: '0.1em' }}>SAN DIEGO · NOV 18–20 · OPS</span>
        </div>
        <div style={{ display: 'flex', gap: '4px' }}>
          {DAYS.map(day => (
            <button key={day.id} onClick={() => setSelectedDay(day.id)} style={{
              padding: '6px 20px', borderRadius: '8px', cursor: 'pointer', fontSize: '12px', fontFamily: 'inherit', letterSpacing: '0.05em',
              background: selectedDay === day.id ? '#3568FF' : 'transparent',
              border: `1px solid ${selectedDay === day.id ? '#3568FF' : 'rgba(255,255,255,0.06)'}`,
              color: selectedDay === day.id ? '#fff' : 'rgba(240,240,240,0.4)',
              fontWeight: selectedDay === day.id ? 'bold' : 'normal', transition: 'all 0.15s'
            }}>{day.label} · {day.date}</button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: '24px', alignItems: 'center' }}>
          {[
            { label: 'CONFIRMED', value: confirmedCount, color: '#3568FF' },
            { label: 'SCHEDULED', value: totalScheduled, color: 'rgb(240,240,240)' },
            { label: 'CLASHES', value: clashes, color: clashes > 0 ? '#f87171' : 'rgba(240,240,240,0.2)' },
          ].map(stat => (
            <div key={stat.label} style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '18px', fontWeight: 'bold', color: stat.color, lineHeight: 1 }}>{stat.value}</div>
              <div style={{ fontSize: '9px', color: 'rgba(240,240,240,0.2)', letterSpacing: '0.1em', marginTop: '2px' }}>{stat.label}</div>
            </div>
          ))}
          <button onClick={() => { setEditingSession(null); setShowModal(true); }} style={{ background: '#3568FF', border: 'none', borderRadius: '8px', padding: '0 16px', color: '#fff', cursor: 'pointer', fontSize: '12px', fontFamily: 'inherit', fontWeight: 'bold', letterSpacing: '0.05em', height: '32px' }}>+ NEW</button>
          <button onClick={() => setShowSpeakersModal(true)} style={{ background: 'none', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '8px', padding: '0 12px', color: 'rgba(240,240,240,0.4)', cursor: 'pointer', fontSize: '14px', fontFamily: 'inherit', display: 'flex', alignItems: 'center', height: '32px' }} title="Manage Speakers">{'\uD83C\uDFA4'}</button>
          <button onClick={() => setShowRegistrations(true)} style={{ background: 'none', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '8px', padding: '0 12px', color: 'rgba(240,240,240,0.4)', cursor: 'pointer', fontSize: '14px', fontFamily: 'inherit', display: 'flex', alignItems: 'center', height: '32px' }} title="Registrations">{'\u{1F465}'}</button>
          <button onClick={() => setShowStagesModal(true)} style={{ background: 'none', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '8px', padding: '0 12px', color: 'rgba(240,240,240,0.4)', cursor: 'pointer', fontSize: '14px', fontFamily: 'inherit', display: 'flex', alignItems: 'center', height: '32px' }} title="Manage Stages">{'⚙'}</button>
          <a href="/view" target="_blank" rel="noopener noreferrer" style={{ background: 'none', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '8px', padding: '0 16px', color: 'rgba(240,240,240,0.4)', cursor: 'pointer', fontSize: '11px', fontFamily: 'inherit', letterSpacing: '0.05em', textDecoration: 'none', display: 'flex', alignItems: 'center', height: '32px' }}>VIEW &#8599;</a>
        </div>
      </div>

      {/* Content: Sidebar + Grid */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {selectedDay !== 'day0' && (
          <SidebarPanel sessions={sessions} speakers={speakers} selectedDay={selectedDay}
            onEdit={onEditSession} onDragStart={onDragStart} isOpen={sidebarOpen} onToggle={() => setSidebarOpen(p => !p)} />
        )}

        {loading ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#3568FF' }}>Loading...</div>
        ) : selectedDay === 'day0' ? (
          <ActivationsList sessions={sessions} selectedDay="day0" onEdit={onEditSession} onNew={() => { setEditingSession(null); setShowModal(true); }} />
        ) : (
          <div style={{ flex: 1, overflow: 'auto' }}>
            <div style={{ display: 'inline-flex', flexDirection: 'column', minWidth: '100%' }}>

              {/* ── Sticky header row (hall names + stage names) ── */}
              <div style={{ position: 'sticky', top: 0, zIndex: 30, display: 'flex', background: 'rgb(8,8,8)' }}>
                {/* Corner cell — sticky in both directions */}
                <div style={{ width: `${TIME_COL_WIDTH}px`, flexShrink: 0, position: 'sticky', left: 0, zIndex: 31, background: 'rgb(8,8,8)' }}>
                  <div style={{ height: '52px', borderBottom: '1px solid rgba(255,255,255,0.06)', borderRight: '1px solid rgba(255,255,255,0.06)' }} />
                  <div style={{ height: '44px', borderBottom: '1px solid rgba(255,255,255,0.06)', borderRight: '1px solid rgba(255,255,255,0.06)' }} />
                </div>
                {halls.map(hall => {
                  const hallWidth = hall.stages.reduce((sum, s) => sum + STAGE_COL_WIDTH * (s.max_columns || 1), 0);
                  return (
                    <div key={hall.id} style={{ flexShrink: 0 }}>
                      <div style={{
                        height: '52px', background: 'rgb(8,8,8)', borderBottom: '1px solid rgba(255,255,255,0.06)', borderRight: '1px solid rgba(255,255,255,0.06)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        width: `${hallWidth}px`,
                      }}>
                        <span style={{ fontSize: '11px', color: 'rgba(240,240,240,0.3)', letterSpacing: '0.15em', fontWeight: 'bold' }}>{hall.name.toUpperCase()}</span>
                      </div>
                      <div style={{ display: 'flex' }}>
                        {hall.stages.map(stage => {
                          const maxCols = stage.max_columns || 1;
                          return (
                            <div key={stage.id} style={{ width: `${STAGE_COL_WIDTH * maxCols}px`, height: '44px', padding: '0 8px', borderBottom: '1px solid rgba(255,255,255,0.1)', borderRight: '1px solid rgba(255,255,255,0.06)', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', textAlign: 'center', background: 'rgba(255,255,255,0.08)', boxSizing: 'border-box' }}>
                              <div style={{ fontSize: '11px', color: 'rgb(240,240,240)', fontWeight: 'bold', letterSpacing: '0.05em' }}>{stage.name}</div>
                              <div style={{ fontSize: '9px', color: 'rgba(240,240,240,0.2)' }}>{stage.open_from}–{stage.open_until}{maxCols > 1 ? ` · ${maxCols}col` : ''}</div>
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
                {/* Time column — sticky left */}
                <div style={{ width: `${TIME_COL_WIDTH}px`, flexShrink: 0, position: 'sticky', left: 0, zIndex: 15, background: 'rgb(18,18,18)' }}>
                  {TIME_SLOTS.map(mins => (
                    <div key={mins} style={{ height: `${SLOT_HEIGHT}px`, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', paddingRight: '8px', borderRight: '1px solid rgba(255,255,255,0.08)', borderBottom: mins % 60 === 0 ? '1px solid rgba(255,255,255,0.06)' : mins % 30 === 0 ? '1px solid rgba(255,255,255,0.03)' : 'none' }}>
                      {mins % 30 === 0 && <span style={{ fontSize: '12px', color: mins % 60 === 0 ? 'rgba(240,240,240,0.5)' : 'rgba(240,240,240,0.2)', fontFamily: 'monospace' }}>{formatTime(mins)}</span>}
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
              />
            ))}

            {/* ── Evening Events (Days 1 & 2) ── */}
            <EveningEventsSection sessions={sessions} selectedDay={selectedDay} onEdit={onEditSession} />
          </div>
        )}
      </div>

      <SessionModal isOpen={showModal} onClose={() => { setShowModal(false); setEditingSession(null); }}
        onSave={handleSave} onDelete={handleDelete} editingSession={editingSession} speakers={speakers} stages={stages} selectedDay={selectedDay}
        onSpeakerAdded={(sp) => setSpeakers(prev => [...prev, sp])} />

      <ManageSpeakersModal isOpen={showSpeakersModal} onClose={() => setShowSpeakersModal(false)} speakers={speakers} onSpeakersChange={setSpeakers} />

      <ManageStagesModal isOpen={showStagesModal} onClose={() => setShowStagesModal(false)} stages={stages} onStagesChange={setStages} />

      <RegistrationsModal isOpen={showRegistrations} onClose={() => setShowRegistrations(false)} sessions={sessions} stages={stages} />

      {pendingBlock && <BlockDurationPopup pending={pendingBlock} onConfirm={handleBlockConfirm} onCancel={() => setPendingBlock(null)} />}
    </div>
  );
}
