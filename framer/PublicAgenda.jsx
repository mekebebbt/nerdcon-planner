// Framer Code Component: PublicAgenda
// Structured public agenda driven by the public_agenda feed.
// Sections (main/zone/signup) come from display_group in the data.

import React, { useState, useEffect, useMemo } from "react"

const SUPABASE_URL = "https://nrlonrxyvlfymwjjdvhh.supabase.co"
const SUPABASE_ANON_KEY =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5ybG9ucnh5dmxmeW13ampkdmhoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMwNjIwMzMsImV4cCI6MjA4ODYzODAzM30.yDN5RhcuQ81nzfCscbfKrmGl9WkfusEdbmzM51pBni8"

const DAY_LABELS = {
    day0: { short: "Day 0", date: "Wed · Nov 18" },
    day1: { short: "Day 1", date: "Thu · Nov 19" },
    day2: { short: "Day 2", date: "Fri · Nov 20" },
}

function formatTime(iso) {
    if (!iso) return ""
    const d = new Date(iso)
    return d.toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
        timeZone: "America/Los_Angeles",
    })
}

function initials(name) {
    return name
        .split(" ")
        .map((w) => w[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
}

function SessionCard({ session, isSignup }) {
    const [open, setOpen] = useState(false)
    const timeLabel =
        session.start_time && session.end_time
            ? `${formatTime(session.start_time)} – ${formatTime(session.end_time)}`
            : ""

    return (
        <div
            className={`pa-session ${open ? "pa-session--open" : ""}`}
            onClick={() => setOpen(!open)}
        >
            <span className="pa-session__chevron">{open ? "▴" : "▾"}</span>
            {timeLabel && (
                <div className="pa-session__time">{timeLabel}</div>
            )}
            <div className="pa-session__title">{session.title}</div>
            {session.speakers?.length > 0 && (
                <div className="pa-session__speakers-preview">
                    {session.speakers.map((sp) => sp.name).join(", ")}
                </div>
            )}
            <div className="pa-session__tags">
                {session.format && (
                    <span className="pa-session__format">{session.format}</span>
                )}
                {isSignup && session.capacity && (
                    <span className="pa-session__capacity">
                        Cap {session.capacity}
                    </span>
                )}
            </div>

            {open && (
                <div className="pa-session__detail">
                    <div className="pa-session__detail-inner">
                        {session.description && (
                            <p className="pa-session__description">
                                {session.description}
                            </p>
                        )}
                        {session.speakers?.length > 0 && (
                            <div className="pa-session__speakers-list">
                                {session.speakers.map((sp, i) => (
                                    <div
                                        key={i}
                                        className="pa-session__speaker"
                                    >
                                        <div className="pa-session__speaker-avatar">
                                            {sp.headshot_url ? (
                                                <img
                                                    src={sp.headshot_url}
                                                    alt={sp.name}
                                                />
                                            ) : (
                                                initials(sp.name)
                                            )}
                                        </div>
                                        <div>
                                            <div className="pa-session__speaker-name">
                                                {sp.name}
                                                {sp.role === "moderator" &&
                                                    " (mod)"}
                                            </div>
                                            <div className="pa-session__speaker-role">
                                                {[sp.title, sp.company]
                                                    .filter(Boolean)
                                                    .join(" · ")}
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                        <div className="pa-session__meta">
                            {session.stage_name && (
                                <span>
                                    <b>Stage:</b> {session.stage_name}
                                </span>
                            )}
                            {session.format && (
                                <span>
                                    <b>Format:</b> {session.format}
                                </span>
                            )}
                            <span>
                                <b>Length:</b> {session.duration_minutes} min
                            </span>
                            {session.capacity && (
                                <span>
                                    <b>Capacity:</b> {session.capacity}
                                </span>
                            )}
                        </div>
                        <span className="pa-session__cta">
                            {isSignup ? "Reserve a seat" : "Add to my agenda"}
                        </span>
                    </div>
                </div>
            )}
        </div>
    )
}

export default function PublicAgenda({ supabaseUrl, supabaseAnonKey }) {
    const [sessions, setSessions] = useState([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState(null)
    const [selectedDay, setSelectedDay] = useState(null)
    const [formatFilter, setFormatFilter] = useState(null)

    const url = supabaseUrl || SUPABASE_URL
    const key = supabaseAnonKey || SUPABASE_ANON_KEY

    useEffect(() => {
        fetch(
            `${url}/rest/v1/public_agenda?select=*&order=day,start_time`,
            {
                headers: {
                    apikey: key,
                    Authorization: `Bearer ${key}`,
                },
            }
        )
            .then((r) => {
                if (!r.ok) throw new Error(`HTTP ${r.status}`)
                return r.json()
            })
            .then((data) => {
                setSessions(data)
                const days = [...new Set(data.map((s) => s.day))].sort()
                if (days.length > 0 && !selectedDay) setSelectedDay(days[0])
                setLoading(false)
            })
            .catch((e) => {
                setError(e.message)
                setLoading(false)
            })
    }, [url, key])

    const days = useMemo(
        () => [...new Set(sessions.map((s) => s.day))].sort(),
        [sessions]
    )

    const formats = useMemo(
        () =>
            [
                ...new Set(
                    sessions.map((s) => s.format).filter(Boolean)
                ),
            ].sort(),
        [sessions]
    )

    const daySessions = useMemo(() => {
        let filtered = sessions.filter((s) => s.day === selectedDay)
        if (formatFilter)
            filtered = filtered.filter((s) => s.format === formatFilter)
        return filtered
    }, [sessions, selectedDay, formatFilter])

    const mainSessions = useMemo(
        () =>
            daySessions
                .filter((s) => s.display_group === "main")
                .sort((a, b) => (a.start_time || "").localeCompare(b.start_time || "")),
        [daySessions]
    )

    const zoneStages = useMemo(() => {
        const zones = daySessions.filter((s) => s.display_group === "zone")
        const grouped = {}
        for (const s of zones) {
            const key = s.stage_name || "Other"
            if (!grouped[key])
                grouped[key] = { sessions: [], sort: s.stage_sort_order || 99 }
            grouped[key].sessions.push(s)
        }
        return Object.entries(grouped)
            .sort(([, a], [, b]) => a.sort - b.sort)
            .map(([name, { sessions }]) => ({
                name,
                sessions: sessions.sort((a, b) =>
                    (a.start_time || "").localeCompare(b.start_time || "")
                ),
            }))
    }, [daySessions])

    const signupSessions = useMemo(() => {
        const signups = daySessions
            .filter((s) => s.display_group === "signup")
            .sort((a, b) => (a.start_time || "").localeCompare(b.start_time || ""))

        const blocks = {}
        for (const s of signups) {
            const blockKey = s.start_time
                ? formatTime(s.start_time).replace(/:00/g, "")
                : "TBD"
            if (!blocks[blockKey]) blocks[blockKey] = { time: s.start_time, sessions: [] }
            blocks[blockKey].sessions.push(s)
        }
        return Object.values(blocks).sort((a, b) =>
            (a.time || "").localeCompare(b.time || "")
        )
    }, [daySessions])

    // Sessions with no display_group or null — treat as zone
    const ungroupedSessions = useMemo(
        () =>
            daySessions.filter(
                (s) =>
                    !s.display_group ||
                    !["main", "zone", "signup"].includes(s.display_group)
            ),
        [daySessions]
    )

    if (loading) {
        return (
            <div className="pa">
                <p className="pa__loading">Loading agenda…</p>
            </div>
        )
    }

    if (error) {
        return (
            <div className="pa">
                <p className="pa__error">Failed to load agenda: {error}</p>
            </div>
        )
    }

    if (sessions.length === 0) {
        return (
            <div className="pa">
                <p className="pa__empty">
                    No confirmed sessions yet. Check back soon.
                </p>
            </div>
        )
    }

    const hasMain = mainSessions.length > 0
    const hasZones = zoneStages.length > 0
    const hasSignups = signupSessions.length > 0

    return (
        <div className="pa">
            <style>{`
                .pa { font-family: inherit; max-width: 1160px; margin: 0 auto; padding: 0 20px 80px; }

                .pa__day-tabs { display: flex; gap: 8px; justify-content: center; padding: 14px 0; flex-wrap: wrap; }
                .pa__day-tab { background: transparent; border: 1px solid #e4e4e4; border-radius: 10px; padding: 10px 20px; cursor: pointer; text-align: center; min-width: 120px; font-family: inherit; }
                .pa__day-tab:hover { border-color: #999; }
                .pa__day-tab--active { background: #1a1a1a; color: #fff; border-color: #1a1a1a; }
                .pa__day-tab-date { font-size: 11px; letter-spacing: 1px; text-transform: uppercase; opacity: 0.7; }
                .pa__day-tab-label { font-size: 16px; font-weight: 700; margin-top: 2px; }

                .pa__filters { display: flex; gap: 8px; justify-content: center; padding: 14px 0 0; flex-wrap: wrap; }
                .pa__filter { font-size: 12px; padding: 6px 12px; border-radius: 20px; border: 1px solid #e4e4e4; background: transparent; cursor: pointer; color: #666; font-family: inherit; }
                .pa__filter:hover { border-color: #999; }
                .pa__filter--active { background: #1a1a1a; color: #fff; border-color: #1a1a1a; }

                .pa__section { margin-top: 34px; }
                .pa__section-header { margin-bottom: 16px; }
                .pa__section-title { font-size: 20px; font-weight: 700; letter-spacing: -0.3px; }
                .pa__section-sub { font-size: 13px; color: #666; margin-top: 4px; }

                .pa__stream { display: flex; flex-direction: column; gap: 10px; }

                .pa__zones { display: grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); gap: 16px; }
                .pa__zone { border: 1px solid #e4e4e4; border-radius: 12px; overflow: hidden; align-self: start; }
                .pa__zone-header { padding: 12px 14px; border-bottom: 1px solid #e4e4e4; border-left: 4px solid #2563eb; }
                .pa__zone-name { font-weight: 700; font-size: 14px; }
                .pa__zone-body { padding: 8px; }

                .pa__time-block { margin-bottom: 20px; }
                .pa__time-block-label { font-size: 14px; font-weight: 700; margin-bottom: 8px; padding-bottom: 4px; border-bottom: 1px solid #e4e4e4; }
                .pa__time-block-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 10px; }

                .pa-session { padding: 11px 12px; border-radius: 8px; cursor: pointer; position: relative; border: 1px solid #e4e4e4; }
                .pa-session:hover { border-color: #2563eb; }
                .pa__stream .pa-session { border: 1px solid #e4e4e4; }
                .pa__zone-body .pa-session { border: none; border-radius: 0; }
                .pa__zone-body .pa-session + .pa-session { border-top: 1px solid #e4e4e4; }
                .pa-session__chevron { position: absolute; top: 12px; right: 12px; color: #999; font-size: 11px; }
                .pa-session__time { font-size: 12px; color: #999; font-variant-numeric: tabular-nums; }
                .pa-session__title { font-size: 14.5px; font-weight: 650; margin: 3px 0 5px; letter-spacing: -0.1px; line-height: 1.25; }
                .pa__stream .pa-session__title { font-size: 16px; }
                .pa-session__speakers-preview { font-size: 12px; color: #666; margin-top: 4px; }
                .pa-session__tags { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 6px; }
                .pa-session__format { display: inline-block; font-size: 10px; letter-spacing: 0.4px; text-transform: uppercase; background: #f0f0f0; color: #666; padding: 2px 7px; border-radius: 4px; font-weight: 600; }
                .pa-session__capacity { display: inline-block; font-size: 10px; letter-spacing: 0.4px; background: #fef3c7; color: #92400e; padding: 2px 7px; border-radius: 4px; font-weight: 600; }

                .pa-session__detail { margin-top: 10px; border-top: 1px solid #e4e4e4; padding-top: 10px; }
                .pa-session__detail-inner {}
                .pa-session__description { font-size: 13px; color: #333; line-height: 1.55; margin-bottom: 12px; }
                .pa-session__speakers-list { display: flex; flex-direction: column; gap: 8px; margin-bottom: 10px; }
                .pa-session__speaker { display: flex; align-items: center; gap: 10px; }
                .pa-session__speaker-avatar { width: 34px; height: 34px; border-radius: 50%; background: #e6e6e6; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 700; color: #888; overflow: hidden; flex-shrink: 0; }
                .pa-session__speaker-avatar img { width: 100%; height: 100%; object-fit: cover; }
                .pa-session__speaker-name { font-size: 13px; font-weight: 650; }
                .pa-session__speaker-role { font-size: 11.5px; color: #666; }
                .pa-session__meta { display: flex; gap: 16px; font-size: 12px; color: #666; margin-top: 10px; flex-wrap: wrap; }
                .pa-session__meta b { color: #1a1a1a; font-weight: 600; }
                .pa-session__cta { display: inline-block; font-size: 12px; font-weight: 600; background: #1a1a1a; color: #fff; padding: 8px 14px; border-radius: 7px; margin-top: 12px; cursor: pointer; }
                .pa-session__cta:hover { opacity: 0.85; }

                .pa__loading, .pa__error, .pa__empty { text-align: center; padding: 40px 0; color: #666; }
            `}</style>

            {/* Day tabs */}
            <div className="pa__day-tabs">
                {days.map((day) => {
                    const label = DAY_LABELS[day] || {
                        short: day,
                        date: "",
                    }
                    return (
                        <button
                            key={day}
                            className={`pa__day-tab ${selectedDay === day ? "pa__day-tab--active" : ""}`}
                            onClick={() => setSelectedDay(day)}
                        >
                            <div className="pa__day-tab-date">
                                {label.date}
                            </div>
                            <div className="pa__day-tab-label">
                                {label.short}
                            </div>
                        </button>
                    )
                })}
            </div>

            {/* Format filters */}
            <div className="pa__filters">
                <button
                    className={`pa__filter ${!formatFilter ? "pa__filter--active" : ""}`}
                    onClick={() => setFormatFilter(null)}
                >
                    All formats
                </button>
                {formats.map((f) => (
                    <button
                        key={f}
                        className={`pa__filter ${formatFilter === f ? "pa__filter--active" : ""}`}
                        onClick={() =>
                            setFormatFilter(formatFilter === f ? null : f)
                        }
                    >
                        {f}s
                    </button>
                ))}
            </div>

            {/* MAIN section */}
            {hasMain && (
                <div className="pa__section">
                    <div className="pa__section-header">
                        <h2 className="pa__section-title">
                            Main Stage
                        </h2>
                        <p className="pa__section-sub">
                            Everyone together — the day opens on the Main Quest
                            stage.
                        </p>
                    </div>
                    <div className="pa__stream">
                        {mainSessions.map((s) => (
                            <SessionCard key={s.session_id} session={s} />
                        ))}
                    </div>
                </div>
            )}

            {/* ZONES section */}
            {hasZones && (
                <div className="pa__section">
                    <div className="pa__section-header">
                        <h2 className="pa__section-title">
                            Content Zones
                        </h2>
                        <p className="pa__section-sub">
                            Parallel tracks — pick your path.
                        </p>
                    </div>
                    <div className="pa__zones">
                        {zoneStages.map((zone, i) => (
                            <div key={zone.name} className="pa__zone">
                                <div className="pa__zone-header">
                                    <div className="pa__zone-name">
                                        {zone.name}
                                    </div>
                                </div>
                                <div className="pa__zone-body">
                                    {zone.sessions.map((s) => (
                                        <SessionCard
                                            key={s.session_id}
                                            session={s}
                                        />
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* SIGN-UP section */}
            {hasSignups && (
                <div className="pa__section">
                    <div className="pa__section-header">
                        <h2 className="pa__section-title">
                            Sign-up Experiences
                        </h2>
                        <p className="pa__section-sub">
                            Capped sessions — reserve your seat in advance.
                        </p>
                    </div>
                    {signupSessions.map((block) => (
                        <div
                            key={block.time}
                            className="pa__time-block"
                        >
                            <div className="pa__time-block-label">
                                {block.time
                                    ? formatTime(block.time)
                                    : "Time TBD"}
                            </div>
                            <div className="pa__time-block-grid">
                                {block.sessions.map((s) => (
                                    <SessionCard
                                        key={s.session_id}
                                        session={s}
                                        isSignup
                                    />
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Ungrouped fallback */}
            {ungroupedSessions.length > 0 && (
                <div className="pa__section">
                    <div className="pa__section-header">
                        <h2 className="pa__section-title">Other</h2>
                    </div>
                    <div className="pa__stream">
                        {ungroupedSessions.map((s) => (
                            <SessionCard key={s.session_id} session={s} />
                        ))}
                    </div>
                </div>
            )}
        </div>
    )
}

// Framer property controls
if (typeof addPropertyControls !== "undefined") {
    addPropertyControls(PublicAgenda, {
        supabaseUrl: {
            type: "string",
            title: "Supabase URL",
            defaultValue: SUPABASE_URL,
        },
        supabaseAnonKey: {
            type: "string",
            title: "Supabase Anon Key",
            defaultValue: SUPABASE_ANON_KEY,
        },
    })
}
