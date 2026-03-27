-- Attendee identity tables for NerdCon View page
-- Run this in the Supabase SQL Editor

CREATE TABLE IF NOT EXISTS attendees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  email text UNIQUE NOT NULL,
  company text,
  token text UNIQUE DEFAULT gen_random_uuid()::text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS quest_saves (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  attendee_id uuid REFERENCES attendees(id) ON DELETE CASCADE,
  session_id text NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE(attendee_id, session_id)
);

CREATE TABLE IF NOT EXISTS roundtable_registrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  attendee_id uuid REFERENCES attendees(id) ON DELETE CASCADE,
  session_id text NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE(attendee_id, session_id)
);

-- Enable RLS but allow anon access (public attendee system)
ALTER TABLE attendees ENABLE ROW LEVEL SECURITY;
ALTER TABLE quest_saves ENABLE ROW LEVEL SECURITY;
ALTER TABLE roundtable_registrations ENABLE ROW LEVEL SECURITY;

-- Policies: allow all operations via anon key (this is a public event app)
CREATE POLICY "Allow all on attendees" ON attendees FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on quest_saves" ON quest_saves FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on roundtable_registrations" ON roundtable_registrations FOR ALL USING (true) WITH CHECK (true);
