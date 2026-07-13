# Public Agenda Feed

Read-only, public endpoint for the confirmed NerdCon agenda. Use this to power the Framer website agenda page, a mobile app, or a CSV export.

## Endpoint

```
GET https://nrlonrxyvlfymwjjdvhh.supabase.co/rest/v1/public_agenda?select=*&order=day,start_time
```

### Required headers

| Header          | Value |
|-----------------|-------|
| `apikey`        | `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5ybG9ucnh5dmxmeW13ampkdmhoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMwNjIwMzMsImV4cCI6MjA4ODYzODAzM30.yDN5RhcuQ81nzfCscbfKrmGl9WkfusEdbmzM51pBni8` |
| `Authorization` | `Bearer <same key>` |

This is the Supabase **anon** key — safe to use client-side. It grants read-only access; writes are blocked.

## Fields returned

| Field             | Type      | Description |
|-------------------|-----------|-------------|
| `session_id`      | `text`    | Unique session ID |
| `title`           | `text`    | Session title |
| `day`             | `text`    | `day0`, `day1`, or `day2` |
| `start_time`      | `timestamptz` | ISO 8601 start time |
| `end_time`        | `timestamptz` | ISO 8601 end time |
| `duration_minutes`| `integer` | Duration in minutes |
| `format`          | `text`    | e.g. Keynote, Panel, Fireside Chat, Workshop |
| `description`     | `text`    | Public description (may be empty) |
| `stage_name`      | `text`    | Stage name (e.g. Main Quest, Bootcamp) |
| `hall_name`       | `text`    | Hall name (e.g. Hall 1, Hall 2) |
| `display_group`   | `text`    | Stage grouping for public layout: `main`, `zone`, or `signup` (see below) |
| `stage_sort_order`| `integer` | Stage display order within its group |
| `session_date`    | `date`    | Session date (e.g. `2026-11-19`) |
| `capacity`        | `integer` | Seat capacity (null if unlimited) |
| `invite_only`     | `boolean` | Whether the session is invite-only |
| `speakers`        | `jsonb`   | Array of confirmed speakers (see below), or `null` |

### Speaker object

Each entry in the `speakers` array:

| Field         | Type   | Description |
|---------------|--------|-------------|
| `name`        | `text` | Speaker full name |
| `title`       | `text` | Job title |
| `company`     | `text` | Company name |
| `headshot_url`| `text` | Headshot image URL (may be null) |
| `role`        | `text` | `speaker` or `moderator` |

## Filtering rules

A session appears in this feed **only** if:
1. Session status is `confirmed`
2. Session is not a block/transition/hold
3. Session has **at least one** confirmed, real speaker (kind=speaker, status=confirmed)

Provisional speakers, company placeholders, and guest placeholders are excluded from the speakers array.

## Example response

```json
[
  {
    "session_id": "ebf85e88-7b51-4ef7-ace2-a42f5a9f3d52",
    "title": "Simon's State of Fintech",
    "day": "day1",
    "start_time": "2026-11-19T08:45:00+00:00",
    "end_time": "2026-11-19T09:05:00+00:00",
    "duration_minutes": 20,
    "format": "Keynote",
    "description": "",
    "session_date": "2026-11-19",
    "stage_name": "Main Quest",
    "hall_name": "Hall 1",
    "display_group": "main",
    "stage_sort_order": 1,
    "capacity": null,
    "invite_only": false,
    "speakers": [
      {
        "name": "Simon Taylor",
        "title": "Founder",
        "company": "NerdCon",
        "headshot_url": null,
        "role": "speaker"
      }
    ]
  }
]
```

## Display groups (public agenda sections)

The `display_group` field on each stage controls which section a session appears in on the public website. Set it in the planner — adding a new stage and setting its group will make it appear in the right section with zero code changes.

| Value    | Section           | Layout | Description |
|----------|-------------------|--------|-------------|
| `main`   | Main Stage        | Single chronological stream | Shared morning sessions on the Main Quest stage |
| `zone`   | Content Zones     | Responsive side-by-side grid, one card per stage | Parallel tracks (Stableverse, The Vault, Bootcamp, etc.) |
| `signup` | Sign-up Experiences | Grouped by time block | Capped sessions like Roundtables — shows capacity and "Reserve a seat" CTA |

Default is `zone`, so new stages appear in Content Zones unless explicitly set otherwise.

### Current stage assignments

| Stage | display_group |
|-------|---------------|
| Main Quest | `main` |
| AI Command Center, Stableverse, Compliance Nerd Corner, The Vault, Agentic Commerce Playground, Bootcamp, Podcast Stage, Meetups | `zone` |
| Roundtables | `signup` |

## CSV export

One-command export to CSV (requires `curl` and `jq`):

```bash
curl -s "https://nrlonrxyvlfymwjjdvhh.supabase.co/rest/v1/public_agenda?select=session_id,title,day,start_time,end_time,duration_minutes,format,stage_name,hall_name,capacity,invite_only&order=day,start_time" \
  -H "apikey: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5ybG9ucnh5dmxmeW13ampkdmhoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMwNjIwMzMsImV4cCI6MjA4ODYzODAzM30.yDN5RhcuQ81nzfCscbfKrmGl9WkfusEdbmzM51pBni8" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5ybG9ucnh5dmxmeW13ampkdmhoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMwNjIwMzMsImV4cCI6MjA4ODYzODAzM30.yDN5RhcuQ81nzfCscbfKrmGl9WkfusEdbmzM51pBni8" \
  -H "Accept: text/csv"
```

Or with the Supabase CSV accept header — Supabase returns CSV directly when you set `Accept: text/csv`.
