-- Add session_date column and keep day in sync via trigger
-- Backward-compatible: day column remains, all existing code keeps working

-- 1. Add the column
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS session_date date;

-- 2. Backfill from existing day strings
UPDATE sessions SET session_date = CASE
  WHEN day = 'day0' THEN '2026-11-18'::date
  WHEN day = 'day1' THEN '2026-11-19'::date
  WHEN day = 'day2' THEN '2026-11-20'::date
  ELSE NULL
END
WHERE session_date IS NULL;

-- 3. Trigger: keep day in sync when session_date changes
CREATE OR REPLACE FUNCTION sync_day_from_date()
RETURNS trigger AS $$
BEGIN
  IF NEW.session_date IS NOT NULL THEN
    NEW.day := CASE
      WHEN NEW.session_date = '2026-11-18' THEN 'day0'
      WHEN NEW.session_date = '2026-11-19' THEN 'day1'
      WHEN NEW.session_date = '2026-11-20' THEN 'day2'
      ELSE 'day' || (NEW.session_date - '2026-11-18'::date)
    END;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS sync_session_day ON sessions;
CREATE TRIGGER sync_session_day
  BEFORE INSERT OR UPDATE ON sessions
  FOR EACH ROW EXECUTE FUNCTION sync_day_from_date();

-- 4. Add session_date to public_agenda view (additive, does not remove any existing fields)
-- DROP + CREATE required because adding a column to an existing view shifts positions
DROP VIEW IF EXISTS public.public_agenda;
CREATE VIEW public.public_agenda AS
SELECT
  s.id AS session_id,
  s.title,
  s.day,
  s.session_date,
  s.start_time,
  s.end_time,
  s.duration_minutes,
  s.format,
  s.description,
  st.name AS stage_name,
  st.hall_name,
  s.capacity,
  s.invite_only,
  (
    SELECT jsonb_agg(
      jsonb_build_object(
        'name', sp.name,
        'title', sp.title,
        'company', sp.company,
        'headshot_url', sp.headshot_url,
        'role', seat.value->>'role'
      )
      ORDER BY sp.name
    )
    FROM jsonb_array_elements(s.speakers) AS seat
    JOIN public.speakers sp ON sp.id = (seat.value->>'speaker_id')
    WHERE (seat.value->>'kind') = 'speaker'
      AND (seat.value->>'status') = 'confirmed'
  ) AS speakers
FROM public.sessions s
LEFT JOIN public.stages st ON st.id = s.stage_id
WHERE s.status = 'confirmed'
  AND (s.type IS NULL OR s.type != 'block')
  AND EXISTS (
    SELECT 1
    FROM jsonb_array_elements(s.speakers) AS seat
    JOIN public.speakers sp ON sp.id = (seat.value->>'speaker_id')
    WHERE (seat.value->>'kind') = 'speaker'
      AND (seat.value->>'status') = 'confirmed'
  );
