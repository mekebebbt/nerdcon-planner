-- Public agenda view: confirmed sessions with at least one confirmed speaker
-- Exposes only public-safe fields for external consumption (Framer, mobile app, CSV)

CREATE OR REPLACE VIEW public.public_agenda AS
SELECT
  s.id AS session_id,
  s.title,
  s.day,
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
