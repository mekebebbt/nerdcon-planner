// Framer Code Component: AgendaFeed
// Drop this into your Framer project as a Code Component.
// Set SUPABASE_URL and SUPABASE_ANON_KEY below, or pass them as props.

import React, { useState, useEffect } from "react"

const SUPABASE_URL = "https://nrlonrxyvlfymwjjdvhh.supabase.co"
const SUPABASE_ANON_KEY =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5ybG9ucnh5dmxmeW13ampkdmhoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMwNjIwMzMsImV4cCI6MjA4ODYzODAzM30.yDN5RhcuQ81nzfCscbfKrmGl9WkfusEdbmzM51pBni8"

const DAY_LABELS = {
    day0: "Day 0 — Nov 18",
    day1: "Day 1 — Nov 19",
    day2: "Day 2 — Nov 20",
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

export default function AgendaFeed({ supabaseUrl, supabaseAnonKey }) {
    const [sessions, setSessions] = useState([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState(null)

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
                setLoading(false)
            })
            .catch((e) => {
                setError(e.message)
                setLoading(false)
            })
    }, [url, key])

    if (loading) {
        return (
            <div className="agenda-feed agenda-feed--loading">
                <p>Loading agenda…</p>
            </div>
        )
    }

    if (error) {
        return (
            <div className="agenda-feed agenda-feed--error">
                <p>Failed to load agenda: {error}</p>
            </div>
        )
    }

    if (sessions.length === 0) {
        return (
            <div className="agenda-feed agenda-feed--empty">
                <p>No confirmed sessions yet. Check back soon.</p>
            </div>
        )
    }

    // Group by day, then by stage
    const grouped = {}
    for (const s of sessions) {
        const day = s.day || "other"
        if (!grouped[day]) grouped[day] = {}
        const stage = s.stage_name || "TBD"
        if (!grouped[day][stage]) grouped[day][stage] = []
        grouped[day][stage].push(s)
    }

    return (
        <div className="agenda-feed">
            <style>{`
                .agenda-feed {
                    font-family: inherit;
                    max-width: 800px;
                    margin: 0 auto;
                }
                .agenda-day {
                    margin-bottom: 2rem;
                }
                .agenda-day__title {
                    font-size: 1.25rem;
                    font-weight: 700;
                    margin-bottom: 1rem;
                    padding-bottom: 0.5rem;
                    border-bottom: 2px solid currentColor;
                    opacity: 0.9;
                }
                .agenda-stage {
                    margin-bottom: 1.5rem;
                }
                .agenda-stage__name {
                    font-size: 0.75rem;
                    font-weight: 600;
                    text-transform: uppercase;
                    letter-spacing: 0.08em;
                    opacity: 0.5;
                    margin-bottom: 0.5rem;
                }
                .agenda-session {
                    padding: 0.75rem 0;
                    border-bottom: 1px solid rgba(128, 128, 128, 0.15);
                }
                .agenda-session:last-child {
                    border-bottom: none;
                }
                .agenda-session__time {
                    font-size: 0.8rem;
                    opacity: 0.5;
                    margin-bottom: 0.15rem;
                }
                .agenda-session__title {
                    font-size: 1rem;
                    font-weight: 600;
                    margin-bottom: 0.25rem;
                }
                .agenda-session__format {
                    display: inline-block;
                    font-size: 0.65rem;
                    font-weight: 600;
                    text-transform: uppercase;
                    letter-spacing: 0.06em;
                    opacity: 0.6;
                    margin-bottom: 0.25rem;
                }
                .agenda-session__speakers {
                    font-size: 0.85rem;
                    opacity: 0.7;
                }
                .agenda-session__description {
                    font-size: 0.85rem;
                    opacity: 0.6;
                    margin-top: 0.35rem;
                    line-height: 1.5;
                }
                .agenda-session__moderator {
                    font-style: italic;
                }
            `}</style>

            {Object.entries(grouped)
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([day, stages]) => (
                    <div key={day} className="agenda-day">
                        <h2 className="agenda-day__title">
                            {DAY_LABELS[day] || day}
                        </h2>
                        {Object.entries(stages).map(([stageName, items]) => (
                            <div key={stageName} className="agenda-stage">
                                <div className="agenda-stage__name">
                                    {stageName}
                                    {items[0]?.hall_name &&
                                        ` · ${items[0].hall_name}`}
                                </div>
                                {items.map((s) => (
                                    <div
                                        key={s.session_id}
                                        className="agenda-session"
                                    >
                                        <div className="agenda-session__time">
                                            {formatTime(s.start_time)}
                                            {s.end_time &&
                                                ` – ${formatTime(s.end_time)}`}
                                        </div>
                                        <div className="agenda-session__title">
                                            {s.title}
                                        </div>
                                        {s.format && (
                                            <span className="agenda-session__format">
                                                {s.format}
                                            </span>
                                        )}
                                        {s.speakers?.length > 0 && (
                                            <div className="agenda-session__speakers">
                                                {s.speakers.map((sp, i) => (
                                                    <span key={i}>
                                                        {i > 0 && ", "}
                                                        <span
                                                            className={
                                                                sp.role ===
                                                                "moderator"
                                                                    ? "agenda-session__moderator"
                                                                    : ""
                                                            }
                                                        >
                                                            {sp.name}
                                                            {sp.role ===
                                                                "moderator" &&
                                                                " (mod)"}
                                                        </span>
                                                        {sp.company && (
                                                            <span
                                                                style={{
                                                                    opacity: 0.6,
                                                                }}
                                                            >
                                                                {" "}
                                                                · {sp.company}
                                                            </span>
                                                        )}
                                                    </span>
                                                ))}
                                            </div>
                                        )}
                                        {s.description && (
                                            <div className="agenda-session__description">
                                                {s.description}
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        ))}
                    </div>
                ))}
        </div>
    )
}

// Framer property controls (optional — lets you override via Framer UI)
if (typeof addPropertyControls !== "undefined") {
    addPropertyControls(AgendaFeed, {
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
