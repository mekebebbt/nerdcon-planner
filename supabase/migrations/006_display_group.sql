-- Add display_group to stages for public agenda section grouping
-- Values: 'main', 'zone', 'signup'. Default 'zone' so new stages appear somewhere sensible.

ALTER TABLE stages ADD COLUMN IF NOT EXISTS display_group text NOT NULL DEFAULT 'zone'
  CHECK (display_group IN ('main', 'zone', 'signup'));

-- Seed current stages
UPDATE stages SET display_group = 'main'   WHERE id = 'main-stage';
UPDATE stages SET display_group = 'signup' WHERE id = 'roundtables';
-- All others default to 'zone' (Stableverse, Compliance Nerd Corner, The Vault,
-- Agentic Commerce Playground, Podcast Stage, Bootcamp, Meetups, AI Command Center)

-- Recreate public_agenda view to include display_group and stage sort_order
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
  st.display_group,
  st.sort_order AS stage_sort_order,
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
