-- Part B: Add two new commenters to the profile auto-create trigger
-- colton@fintechnerdcon.com and julie.v.greenberg@gmail.com
-- micky@fintechnerdcon.com remains the ONLY editor.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, email, role, display_name)
  VALUES (
    NEW.id,
    NEW.email,
    CASE
      WHEN NEW.email = 'micky@fintechnerdcon.com' THEN 'editor'
      WHEN NEW.email = 'simon@fintechnerdcon.com' THEN 'commenter'
      WHEN NEW.email = 'mekebeb@protonmail.com' THEN 'commenter'
      WHEN NEW.email = 'colton@fintechnerdcon.com' THEN 'commenter'
      WHEN NEW.email = 'julie.v.greenberg@gmail.com' THEN 'commenter'
      ELSE 'commenter'
    END,
    COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1))
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Part C2: Add 'bonus' to display_group allowed values
-- Drop old constraint, add new one that includes 'bonus'
ALTER TABLE stages DROP CONSTRAINT IF EXISTS stages_display_group_check;
ALTER TABLE stages ADD CONSTRAINT stages_display_group_check
  CHECK (display_group IN ('main', 'zone', 'signup', 'bonus'));

-- Part D: Update public_agenda view to branch filtering by type
-- Content sessions: status=confirmed AND >=1 confirmed speaker (unchanged)
-- Bonus Quests (display_group='bonus'): status=confirmed is sufficient, no speaker requirement
-- Also expose venue field
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
  s.venue,
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
  AND (
    -- Bonus Quests: no speaker requirement
    st.display_group = 'bonus'
    OR
    -- Content sessions: must have at least one confirmed speaker
    EXISTS (
      SELECT 1
      FROM jsonb_array_elements(s.speakers) AS seat
      JOIN public.speakers sp ON sp.id = (seat.value->>'speaker_id')
      WHERE (seat.value->>'kind') = 'speaker'
        AND (seat.value->>'status') = 'confirmed'
    )
  );
