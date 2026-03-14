import React, { useState, useMemo, useEffect } from 'react';
import { Users, AlertCircle, CheckCircle, Clock, UserCheck, UserX, Plus, Edit, Lock, MessageSquare, Tag, Mic } from 'lucide-react';
import { createClient } from '@supabase/supabase-js';

// Initialize Supabase
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// Module-level drag type tracker
let currentDragType = null;

const TOPIC_OPTIONS = ['AI/ML', 'Payments', 'Lending', 'RegTech', 'Crypto/Web3', 'Banking Infrastructure', 'Embedded Finance', 'Data/Analytics'];

const generateTimeSlots = () => {
  const slots = [];
  const start = new Date('2026-11-15T09:00:00Z');
  for (let i = 0; i < 18; i++) {
    slots.push(new Date(start.getTime() + i * 30 * 60000).toISOString());
  }
  return slots;
};

const TIME_SLOTS = generateTimeSlots();

const formatTime = (isoString) => {
  const date = new Date(isoString);
  return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
};

const calculateEndTime = (startTime, durationMinutes) => {
  return new Date(new Date(startTime).getTime() + durationMinutes * 60000).toISOString();
};

// Session Builder Modal
function SessionBuilderModal({ isOpen, onClose, onSave, editingSession, allSpeakers }) {
  const [title, setTitle] = useState(editingSession?.title || '');
  const [duration, setDuration] = useState(editingSession?.duration_minutes || 30);
  const [sessionType, setSessionType] = useState(editingSession?.type || 'panel');
  const [lockType, setLockType] = useState(editingSession?.lock_type || 'flexible');
  const [topics, setTopics] = useState(editingSession?.topics || []);
  const [selectedSpeakers, setSelectedSpeakers] = useState(editingSession?.speakers || []);

  useEffect(() => {
    if (editingSession) {
      setTitle(editingSession.title || '');
      setDuration(editingSession.duration_minutes || 30);
      setSessionType(editingSession.type || 'panel');
      setLockType(editingSession.lock_type || 'flexible');
      setTopics(editingSession.topics || []);
      setSelectedSpeakers(editingSession.speakers || []);
    }
  }, [editingSession]);

  if (!isOpen) return null;

  const handleSave = () => {
    const speakerNames = selectedSpeakers.map(s => {
      const speaker = allSpeakers.find(sp => sp.id === s.speaker_id);
      return speaker?.name || '';
    }).filter(Boolean);

    const session = {
      id: editingSession?.id || `sess_${Date.now()}`,
      title: title || `Session with ${speakerNames.join(', ')}`,
      duration_minutes: duration,
      type: sessionType,
      lock_type: lockType,
      topics: topics,
      color: topics[0] ? getTopicColor(topics[0]) : 'cyan',
      speakers: selectedSpeakers,
      comments: editingSession?.comments || []
    };
    onSave(session);
    onClose();
  };

  const getTopicColor = (topic) => {
    const colors = { 'AI/ML': 'cyan', 'Payments': 'purple', 'Lending': 'emerald', 'RegTech': 'orange', 'Crypto/Web3': 'pink', 'Banking Infrastructure': 'blue' };
    return colors[topic] || 'cyan';
  };

  const addSpeaker = (speakerId, role = 'speaker') => {
    if (!selectedSpeakers.find(s => s.speaker_id === speakerId)) {
      setSelectedSpeakers([...selectedSpeakers, { speaker_id: speakerId, role }]);
    }
  };

  const removeSpeaker = (speakerId) => {
    setSelectedSpeakers(selectedSpeakers.filter(s => s.speaker_id !== speakerId));
  };

  const toggleRole = (speakerId) => {
    setSelectedSpeakers(selectedSpeakers.map(s => 
      s.speaker_id === speakerId ? { ...s, role: s.role === 'moderator' ? 'speaker' : 'moderator' } : s
    ));
  };

  const toggleTopic = (topic) => {
    setTopics(topics.includes(topic) ? topics.filter(t => t !== topic) : [...topics, topic]);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-slate-900 rounded-lg w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-slate-800">
          <h2 className="text-xl font-bold text-slate-100">{editingSession ? 'Edit Session' : 'Create Session'}</h2>
        </div>

        <div className="p-6 space-y-6">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">Session Title (optional)</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Leave blank for auto-generated title"
              className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-slate-100"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">Duration (minutes)</label>
              <input
                type="number"
                value={duration}
                onChange={(e) => setDuration(Number(e.target.value))}
                className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-slate-100"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">Session Type</label>
              <select
                value={sessionType}
                onChange={(e) => setSessionType(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-slate-100"
              >
                <option value="panel">Panel</option>
                <option value="fireside">Fireside</option>
                <option value="workshop">Workshop</option>
                <option value="keynote">Keynote</option>
                <option value="demo">Demo</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">Session Lock Type</label>
            <div className="space-y-2">
              {['flexible', 'topic-locked', 'locked'].map(type => (
                <label key={type} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    checked={lockType === type}
                    onChange={() => setLockType(type)}
                    className="text-cyan-500"
                  />
                  <span className="text-slate-300 capitalize">{type.replace('-', ' ')}</span>
                  {type === 'locked' && <Lock className="w-4 h-4 text-slate-400" />}
                </label>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">Topics</label>
            <div className="flex flex-wrap gap-2">
              {TOPIC_OPTIONS.map(topic => (
                <button
                  key={topic}
                  onClick={() => toggleTopic(topic)}
                  className={`px-3 py-1 rounded text-sm ${
                    topics.includes(topic) ? 'bg-cyan-500 text-white' : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {topic}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">Speakers</label>
            <div className="bg-slate-800 rounded p-3 max-h-48 overflow-y-auto mb-3">
              {selectedSpeakers.length === 0 ? (
                <p className="text-slate-500 text-sm">No speakers added yet</p>
              ) : (
                <div className="space-y-2">
                  {selectedSpeakers.map(s => {
                    const speaker = allSpeakers.find(sp => sp.id === s.speaker_id);
                    return (
                      <div key={s.speaker_id} className="flex items-center justify-between bg-slate-700 rounded px-3 py-2">
                        <div className="flex items-center gap-2">
                          {s.role === 'moderator' && <Mic className="w-4 h-4 text-cyan-400" />}
                          <span className="text-slate-100">{speaker?.name}</span>
                          {s.role === 'moderator' && <span className="text-xs text-cyan-400">(Moderator)</span>}
                        </div>
                        <div className="flex gap-2">
                          {(sessionType === 'panel' || sessionType === 'fireside') && (
                            <button
                              onClick={() => toggleRole(s.speaker_id)}
                              className="text-xs text-slate-400 hover:text-cyan-400"
                            >
                              {s.role === 'moderator' ? 'Make Speaker' : 'Make Moderator'}
                            </button>
                          )}
                          <button
                            onClick={() => removeSpeaker(s.speaker_id)}
                            className="text-xs text-red-400 hover:text-red-300"
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            <select
              onChange={(e) => e.target.value && addSpeaker(e.target.value)}
              value=""
              className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-slate-100"
            >
              <option value="">+ Add Speaker</option>
              {allSpeakers.filter(sp => !selectedSpeakers.find(s => s.speaker_id === sp.id)).map(speaker => (
                <option key={speaker.id} value={speaker.id}>{speaker.name} - {speaker.company}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="p-6 border-t border-slate-800 flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-slate-400 hover:text-slate-200">
            Cancel
          </button>
          <button onClick={handleSave} className="px-4 py-2 bg-cyan-500 text-white rounded hover:bg-cyan-600">
            {editingSession ? 'Save Changes' : 'Create Session'}
          </button>
        </div>
      </div>
    </div>
  );
}

// Comments Modal
function CommentsModal({ isOpen, onClose, session, onAddComment }) {
  const [newComment, setNewComment] = useState('');
  const [commentType, setCommentType] = useState('general');

  if (!isOpen) return null;

  const handleAdd = () => {
    if (newComment.trim()) {
      onAddComment({
        id: Date.now(),
        text: newComment,
        type: commentType,
        timestamp: new Date().toISOString(),
        author: 'You'
      });
      setNewComment('');
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-slate-900 rounded-lg w-full max-w-lg">
        <div className="p-6 border-b border-slate-800">
          <h2 className="text-xl font-bold text-slate-100">Session Comments</h2>
          <p className="text-sm text-slate-400 mt-1">{session?.title}</p>
        </div>

        <div className="p-6 space-y-4 max-h-96 overflow-y-auto">
          {session?.comments?.length === 0 ? (
            <p className="text-slate-500 text-sm">No comments yet</p>
          ) : (
            session?.comments?.map(comment => (
              <div key={comment.id} className="bg-slate-800 rounded p-3">
                <div className="flex items-center gap-2 mb-2">
                  <span className={`text-xs px-2 py-1 rounded ${
                    comment.type === 'warning' ? 'bg-orange-500/20 text-orange-400' :
                    comment.type === 'note' ? 'bg-blue-500/20 text-blue-400' :
                    'bg-slate-700 text-slate-400'
                  }`}>
                    {comment.type}
                  </span>
                  <span className="text-xs text-slate-500">{new Date(comment.timestamp).toLocaleDateString()}</span>
                </div>
                <p className="text-slate-200 text-sm">{comment.text}</p>
              </div>
            ))
          )}
        </div>

        <div className="p-6 border-t border-slate-800 space-y-3">
          <div className="flex gap-2">
            {['general', 'note', 'warning'].map(type => (
              <button
                key={type}
                onClick={() => setCommentType(type)}
                className={`px-3 py-1 rounded text-xs capitalize ${
                  commentType === type ? 'bg-cyan-500 text-white' : 'bg-slate-800 text-slate-400'
                }`}
              >
                {type}
              </button>
            ))}
          </div>
          <textarea
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            placeholder="Add a comment..."
            className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-slate-100 text-sm"
            rows={3}
          />
          <div className="flex justify-end gap-3">
            <button onClick={onClose} className="px-4 py-2 text-slate-400 hover:text-slate-200">
              Close
            </button>
            <button onClick={handleAdd} className="px-4 py-2 bg-cyan-500 text-white rounded hover:bg-cyan-600">
              Add Comment
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Session Card Component
function SessionCard({ session, speakers, onEdit, onComment, onDragStart, isScheduled, onRemove, slot, speakerConflicts, onAddSpeaker }) {
  const [isDropTarget, setIsDropTarget] = useState(false);
  
  const sessionSpeakers = session.speakers?.map(s => ({
    ...speakers.find(sp => sp.id === s.speaker_id),
    role: s.role
  })) || [];

  const moderator = sessionSpeakers.find(s => s.role === 'moderator');
  const panelists = sessionSpeakers.filter(s => s.role !== 'moderator');
  const needsModerator = (session.type === 'panel' || session.type === 'fireside') && !moderator;

  const sessionConflicts = [];
  if (slot && speakerConflicts) {
    session.speakers?.forEach(s => {
      const conflicts = speakerConflicts.get(s.speaker_id);
      if (conflicts) {
        conflicts.forEach(conflict => {
          if (conflict.slot1_id === slot.id || conflict.slot2_id === slot.id) {
            sessionConflicts.push(conflict);
          }
        });
      }
    });
  }

  const borderColor = {
    cyan: 'border-cyan-500', purple: 'border-purple-500', emerald: 'border-emerald-500',
    orange: 'border-orange-500', pink: 'border-pink-500', blue: 'border-blue-500'
  }[session.color] || 'border-slate-500';

  const handleSpeakerDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDropTarget(false);
    
    const dragType = e.dataTransfer.getData('drag_type');
    if (dragType === 'speaker') {
      const speakerId = e.dataTransfer.getData('speaker_id');
      if (speakerId) {
        const role = needsModerator ? 'moderator' : 'speaker';
        onAddSpeaker?.(session.id, speakerId, role);
      }
    }
  };

  return (
    <div
      draggable
      onDragStart={(e) => {
        currentDragType = 'session';
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('session_id', session.id);
        e.dataTransfer.setData('is_scheduled', isScheduled ? 'true' : 'false');
        e.dataTransfer.setData('drag_type', 'session');
        onDragStart?.(session);
      }}
      onDragOver={(e) => {
        // Only intercept speaker drags, not session drags
        if (currentDragType === 'speaker') {
          e.preventDefault();
          setIsDropTarget(true);
        }
      }}
      onDragLeave={() => setIsDropTarget(false)}
      onDrop={handleSpeakerDrop}
      className={`bg-slate-800 ${sessionConflicts.length > 0 ? 'border-red-500' : borderColor} border-l-4 rounded-lg p-3 cursor-grab active:cursor-grabbing hover:bg-slate-700 transition-all relative group ${
        isDropTarget ? 'ring-2 ring-cyan-500 ring-inset' : ''
      }`}
    >
      <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        {session.lock_type === 'locked' && <Lock className="w-4 h-4 text-slate-400" />}
        {session.comments?.length > 0 && (
          <button onClick={() => onComment(session)} className="flex items-center gap-1 text-xs text-slate-400 hover:text-cyan-400">
            <MessageSquare className="w-4 h-4" />
            {session.comments.length}
          </button>
        )}
        <button onClick={() => onEdit(session)} className="text-slate-400 hover:text-cyan-400">
          <Edit className="w-4 h-4" />
        </button>
        {isScheduled && onRemove && (
          <button onClick={() => onRemove(session.id)} className="text-red-400 hover:text-red-300">
            ×
          </button>
        )}
      </div>

      {isDropTarget && (
        <div className="absolute inset-0 bg-cyan-500/20 border-2 border-cyan-500 rounded-lg flex items-center justify-center pointer-events-none">
          <span className="text-cyan-400 font-semibold text-sm">Drop to add speaker</span>
        </div>
      )}

      <div className="flex items-start gap-2 mb-2 pr-20">
        <Clock className="w-4 h-4 text-slate-400 mt-0.5 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-sm text-slate-100 leading-tight mb-1">{session.title}</h3>
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <span>{session.duration_minutes} min</span>
            <span>•</span>
            <span className="capitalize">{session.type}</span>
            {session.topics?.length > 0 && (
              <>
                <span>•</span>
                <Tag className="w-3 h-3" />
                <span>{session.topics[0]}</span>
              </>
            )}
          </div>
        </div>
      </div>

      {sessionConflicts.length > 0 && (
        <div className="mb-2 bg-red-500/20 border border-red-500/50 rounded p-2">
          <div className="flex items-center gap-1 text-xs text-red-400 font-semibold mb-1">
            <AlertCircle className="w-3 h-3" />
            <span>SPEAKER CONFLICT</span>
          </div>
          {sessionConflicts.map((conflict, i) => (
            <div key={i} className="text-xs text-red-300">
              {conflict.speaker} is also in "{conflict.session1 === session.title ? conflict.session2 : conflict.session1}" at {conflict.time}
            </div>
          ))}
        </div>
      )}

      {needsModerator && (
        <div className="mb-2 flex items-center gap-1 text-xs text-orange-400">
          <AlertCircle className="w-3 h-3" />
          <span>Moderator needed</span>
        </div>
      )}

      <div className="space-y-1">
        {moderator && (
          <div className="flex items-center gap-1 text-xs text-cyan-300">
            <Mic className="w-3 h-3" />
            <span>{moderator.name} (Moderator)</span>
          </div>
        )}
        {panelists.length > 0 && (
          <div className="flex items-center gap-1 text-xs text-slate-300">
            <Users className="w-3 h-3" />
            <span>{panelists.map(s => s.name).join(', ')}</span>
          </div>
        )}
      </div>
    </div>
  );
}

// Main App
export default function NerdConAgendaPlanner() {
  const [speakers, setSpeakers] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [tracks, setTracks] = useState([]);
  const [scheduleSlots, setScheduleSlots] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showSessionBuilder, setShowSessionBuilder] = useState(false);
  const [editingSession, setEditingSession] = useState(null);
  const [showComments, setShowComments] = useState(false);
  const [commentingSession, setCommentingSession] = useState(null);
  const [viewMode, setViewMode] = useState('unscheduled');

  // Load data from Supabase on mount
  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      
      const [speakersRes, sessionsRes, tracksRes, slotsRes] = await Promise.all([
        supabase.from('speakers').select('*'),
        supabase.from('sessions').select('*'),
        supabase.from('tracks').select('*'),
        supabase.from('schedule_slots').select('*')
      ]);

      if (speakersRes.data) setSpeakers(speakersRes.data);
      if (sessionsRes.data) setSessions(sessionsRes.data);
      if (tracksRes.data) setTracks(tracksRes.data);
      if (slotsRes.data) setScheduleSlots(slotsRes.data);

      // If no tracks, create default ones
      if (!tracksRes.data || tracksRes.data.length === 0) {
        await initializeDefaultTracks();
      }
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  const initializeDefaultTracks = async () => {
    const defaultTracks = [
      { id: 't1', name: 'Mainstage', capacity: 500, color: '#06b6d4' },
      { id: 't2', name: 'LoanPro Innovation Demo Stage', capacity: 100, color: '#8b5cf6' },
      { id: 't3', name: 'Plaid Vibe Coding Stage', capacity: 75, color: '#10b981' },
      { id: 't4', name: 'Galileo Podcast Studio', capacity: 50, color: '#f59e0b' }
    ];

    const { data, error } = await supabase.from('tracks').insert(defaultTracks).select();
    if (data) setTracks(data);
  };

  // Calculate speaker conflicts
  const speakerConflicts = useMemo(() => {
    const conflicts = new Map();
    
    scheduleSlots.forEach((slot1, idx) => {
      const session1 = sessions.find(s => s.id === slot1.session_id);
      if (!session1) return;
      
      scheduleSlots.forEach((slot2, idx2) => {
        if (idx >= idx2) return;
        
        const session2 = sessions.find(s => s.id === slot2.session_id);
        if (!session2) return;
        
        const start1 = new Date(slot1.start_time).getTime();
        const end1 = new Date(slot1.end_time).getTime();
        const start2 = new Date(slot2.start_time).getTime();
        const end2 = new Date(slot2.end_time).getTime();
        
        const overlaps = start1 < end2 && start2 < end1;
        if (!overlaps) return;
        
        const speakers1 = session1.speakers?.map(s => s.speaker_id) || [];
        const speakers2 = session2.speakers?.map(s => s.speaker_id) || [];
        const sharedSpeakers = speakers1.filter(id => speakers2.includes(id));
        
        sharedSpeakers.forEach(speakerId => {
          const speaker = speakers.find(s => s.id === speakerId);
          if (!conflicts.has(speakerId)) {
            conflicts.set(speakerId, []);
          }
          conflicts.get(speakerId).push({
            speaker: speaker?.name,
            session1: session1.title,
            session2: session2.title,
            time: formatTime(slot1.start_time),
            slot1_id: slot1.id,
            slot2_id: slot2.id
          });
        });
      });
    });
    
    return conflicts;
  }, [scheduleSlots, sessions, speakers]);

  const assignedSpeakerIds = useMemo(() => {
    const ids = new Set();
    sessions.forEach(session => {
      session.speakers?.forEach(s => ids.add(s.speaker_id));
    });
    return ids;
  }, [sessions]);

  const unassignedSpeakers = speakers.filter(sp => !assignedSpeakerIds.has(sp.id));
  const unscheduledSessions = sessions.filter(s => !scheduleSlots.find(slot => slot.session_id === s.id));

  const handleSaveSession = async (session) => {
    try {
      const { data, error } = await supabase
        .from('sessions')
        .upsert(session)
        .select();

      if (error) throw error;

      // Update local state
      setSessions(prev => {
        const existing = prev.find(s => s.id === session.id);
        return existing ? prev.map(s => s.id === session.id ? data[0] : s) : [...prev, data[0]];
      });

      setEditingSession(null);
    } catch (error) {
      console.error('Error saving session:', error);
      alert('Failed to save session');
    }
  };

  const handleEditSession = (session) => {
    setEditingSession(session);
    setShowSessionBuilder(true);
  };

  const handleAddComment = async (comment) => {
    try {
      const updatedSession = {
        ...commentingSession,
        comments: [...(commentingSession.comments || []), comment]
      };

      const { error } = await supabase
        .from('sessions')
        .update({ comments: updatedSession.comments })
        .eq('id', commentingSession.id);

      if (error) throw error;

      setSessions(prev => prev.map(s => s.id === commentingSession.id ? updatedSession : s));
    } catch (error) {
      console.error('Error adding comment:', error);
    }
  };

  const handleAddSpeakerToSession = async (sessionId, speakerId, role = 'speaker') => {
    try {
      const session = sessions.find(s => s.id === sessionId);
      if (!session) return;

      if (session.speakers?.some(sp => sp.speaker_id === speakerId)) return;
      if (session.lock_type === 'locked') {
        alert('This session is locked and cannot be modified');
        return;
      }

      const updatedSession = {
        ...session,
        speakers: [...(session.speakers || []), { speaker_id: speakerId, role }]
      };

      const { error } = await supabase
        .from('sessions')
        .update({ speakers: updatedSession.speakers })
        .eq('id', sessionId);

      if (error) throw error;

      setSessions(prev => prev.map(s => s.id === sessionId ? updatedSession : s));
    } catch (error) {
      console.error('Error adding speaker:', error);
    }
  };

  const handleDrop = async (sessionId, trackId, time, isRescheduling) => {
    try {
      const session = sessions.find(s => s.id === sessionId);
      if (!session) return;

      if (isRescheduling) {
        await supabase.from('schedule_slots').delete().eq('session_id', sessionId);
      }

      const endTime = calculateEndTime(time, session.duration_minutes);
      const newSlot = {
        id: crypto.randomUUID(),
        session_id: sessionId,
        track_id: trackId,
        start_time: time,
        end_time: endTime
      };

      const { data, error } = await supabase.from('schedule_slots').insert(newSlot).select();
      if (error) throw error;

      setScheduleSlots(prev => [...prev.filter(s => s.session_id !== sessionId), data[0]]);
    } catch (error) {
      console.error('Error scheduling session:', error);
    }
  };

  const handleUnschedule = async (sessionId) => {
    try {
      const { error } = await supabase.from('schedule_slots').delete().eq('session_id', sessionId);
      if (error) throw error;

      setScheduleSlots(prev => prev.filter(s => s.session_id !== sessionId));
    } catch (error) {
      console.error('Error unscheduling:', error);
    }
  };

  if (loading) {
    return (
      <div className="flex h-screen bg-slate-950 items-center justify-center">
        <div className="text-slate-100 text-xl">Loading...</div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-slate-950 text-slate-100 font-sans">
      <div className="w-80 bg-slate-900 border-r border-slate-800 flex flex-col">
        <div className="p-4 border-b border-slate-800">
          <h1 className="text-2xl font-bold bg-gradient-to-r from-cyan-400 to-purple-400 bg-clip-text text-transparent mb-1">
            NerdCon Agenda
          </h1>
          <p className="text-sm text-slate-400">Drag to schedule • Edit anytime</p>
        </div>

        <div className="p-4 border-b border-slate-800 grid grid-cols-2 gap-2">
          <div className="bg-slate-800 rounded-lg p-3">
            <div className="flex items-center gap-2 mb-1">
              <UserCheck className="w-4 h-4 text-green-400" />
              <span className="text-xs text-slate-400">Assigned</span>
            </div>
            <div className="text-2xl font-bold">{assignedSpeakerIds.size}</div>
          </div>
          <div className="bg-slate-800 rounded-lg p-3">
            <div className="flex items-center gap-2 mb-1">
              <UserX className="w-4 h-4 text-orange-400" />
              <span className="text-xs text-slate-400">Unassigned</span>
            </div>
            <div className="text-2xl font-bold">{unassignedSpeakers.length}</div>
          </div>
        </div>

        <div className="p-4 border-b border-slate-800 space-y-2">
          <button
            onClick={() => { setEditingSession(null); setShowSessionBuilder(true); }}
            className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-cyan-500 text-white rounded hover:bg-cyan-600"
          >
            <Plus className="w-4 h-4" />
            Create Session
          </button>
          <div className="flex gap-2">
            <button
              onClick={() => setViewMode('unscheduled')}
              className={`flex-1 px-3 py-2 rounded text-sm font-medium ${
                viewMode === 'unscheduled' ? 'bg-cyan-500 text-white' : 'bg-slate-800 text-slate-400'
              }`}
            >
              Sessions ({unscheduledSessions.length})
            </button>
            <button
              onClick={() => setViewMode('all')}
              className={`flex-1 px-3 py-2 rounded text-sm font-medium ${
                viewMode === 'all' ? 'bg-cyan-500 text-white' : 'bg-slate-800 text-slate-400'
              }`}
            >
              Speakers ({speakers.length})
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {viewMode === 'unscheduled' ? (
            <div className="space-y-2">
              {unscheduledSessions.map(session => (
                <SessionCard
                  key={session.id}
                  session={session}
                  speakers={speakers}
                  onEdit={handleEditSession}
                  onComment={(s) => { setCommentingSession(s); setShowComments(true); }}
                  speakerConflicts={speakerConflicts}
                  onAddSpeaker={handleAddSpeakerToSession}
                />
              ))}
            </div>
          ) : (
            <div className="space-y-1">
              {speakers.map(speaker => {
                const sessionCount = sessions.reduce((count, session) => {
                  return count + (session.speakers?.some(s => s.speaker_id === speaker.id) ? 1 : 0);
                }, 0);
                
                return (
                  <div 
                    key={speaker.id} 
                    draggable
                    onDragStart={(e) => {
                      currentDragType = 'speaker';
                      e.dataTransfer.effectAllowed = 'copy';
                      e.dataTransfer.setData('speaker_id', speaker.id);
                      e.dataTransfer.setData('drag_type', 'speaker');
                    }}
                    className={`p-2 rounded text-sm cursor-grab active:cursor-grabbing hover:ring-2 hover:ring-cyan-500 transition-all ${
                      sessionCount > 0 ? 'bg-green-900/20 border-l-2 border-green-500' : 'bg-slate-800/50 border-l-2 border-orange-500'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="font-medium">{speaker.name}</div>
                      {sessionCount > 0 && (
                        <span className={`text-xs px-2 py-0.5 rounded ${
                          sessionCount >= 3 ? 'bg-orange-500/20 text-orange-400' : 'bg-green-500/20 text-green-400'
                        }`}>
                          {sessionCount} session{sessionCount > 1 ? 's' : ''}
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-slate-400">{speaker.title} • {speaker.company}</div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        <div className="inline-block min-w-full">
          <div className="grid gap-px bg-slate-800" style={{
            gridTemplateColumns: `120px repeat(${tracks.length}, minmax(280px, 1fr))`
          }}>
            <div className="sticky top-0 z-10 bg-slate-900 p-3 font-semibold border-b-2 border-slate-700">Time</div>
            {tracks.map(track => (
              <div key={track.id} className="sticky top-0 z-10 bg-slate-900 p-3 border-b-2 border-slate-700" style={{ borderBottomColor: track.color }}>
                <div className="font-semibold" style={{ color: track.color }}>{track.name}</div>
                <div className="text-xs text-slate-400 mt-1">Capacity: {track.capacity}</div>
              </div>
            ))}
            {TIME_SLOTS.map(time => (
              <React.Fragment key={time}>
                <div className="bg-slate-900 p-3 text-sm text-slate-400 border-r border-slate-800 font-mono">
                  {formatTime(time)}
                </div>
                {tracks.map(track => {
                  const slot = scheduleSlots.find(s => s.track_id === track.id && s.start_time === time);
                  const session = slot ? sessions.find(s => s.id === slot.session_id) : null;
                  return (
                    <div
                      key={`${track.id}-${time}`}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => {
                        e.preventDefault();
                        const sessionId = e.dataTransfer.getData('session_id');
                        const isScheduled = e.dataTransfer.getData('is_scheduled') === 'true';
                        handleDrop(sessionId, track.id, time, isScheduled);
                      }}
                      className="min-h-[100px] bg-slate-900 p-1 border border-slate-800"
                    >
                      {session && (
                        <SessionCard
                          session={session}
                          speakers={speakers}
                          onEdit={handleEditSession}
                          onComment={(s) => { setCommentingSession(s); setShowComments(true); }}
                          isScheduled={true}
                          onRemove={() => handleUnschedule(session.id)}
                          slot={slot}
                          speakerConflicts={speakerConflicts}
                          onAddSpeaker={handleAddSpeakerToSession}
                        />
                      )}
                    </div>
                  );
                })}
              </React.Fragment>
            ))}
          </div>
        </div>
      </div>

      <SessionBuilderModal
        isOpen={showSessionBuilder}
        onClose={() => { setShowSessionBuilder(false); setEditingSession(null); }}
        onSave={handleSaveSession}
        editingSession={editingSession}
        allSpeakers={speakers}
      />

      <CommentsModal
        isOpen={showComments}
        onClose={() => { setShowComments(false); setCommentingSession(null); }}
        session={commentingSession}
        onAddComment={handleAddComment}
      />
    </div>
  );
}
