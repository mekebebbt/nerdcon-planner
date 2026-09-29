-- Keep deletion editor-only even where a legacy permissive ALL policy exists.
CREATE POLICY "Require editor for speaker deletion"
ON public.speakers AS RESTRICTIVE FOR DELETE TO public
USING (EXISTS (
  SELECT 1 FROM public.profiles
  WHERE id = (SELECT auth.uid()) AND role = 'editor'
));

-- Session participants are JSON, not foreign keys. Remove their references and
-- the speaker in one transaction so a failed deletion cannot leave partial work.
CREATE FUNCTION public.delete_planner_speaker(target_speaker_id text)
RETURNS SETOF public.sessions
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = (SELECT auth.uid()) AND role = 'editor'
  ) THEN
    RAISE EXCEPTION 'Only editors can delete speakers.' USING ERRCODE = '42501';
  END IF;

  PERFORM 1 FROM public.speakers WHERE id = target_speaker_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Speaker no longer exists. Refresh the speaker list.';
  END IF;

  RETURN QUERY
  UPDATE public.sessions AS session
  SET speakers = (
    SELECT COALESCE(jsonb_agg(participant ORDER BY position), '[]'::jsonb)
    FROM jsonb_array_elements(session.speakers) WITH ORDINALITY AS entries(participant, position)
    WHERE COALESCE(participant ->> 'speaker_id', participant #>> '{}') IS DISTINCT FROM target_speaker_id
  )
  WHERE EXISTS (
    SELECT 1 FROM jsonb_array_elements(session.speakers) AS entries(participant)
    WHERE COALESCE(participant ->> 'speaker_id', participant #>> '{}') = target_speaker_id
  )
  RETURNING session.*;

  IF EXISTS (
    SELECT 1 FROM public.sessions AS session,
    LATERAL jsonb_array_elements(session.speakers) AS entries(participant)
    WHERE COALESCE(participant ->> 'speaker_id', participant #>> '{}') = target_speaker_id
  ) THEN
    RAISE EXCEPTION 'Could not remove all session assignments. Speaker was not deleted.';
  END IF;

  -- Existing MC foreign key uses ON DELETE SET NULL, preserving the MC slot.
  DELETE FROM public.speakers WHERE id = target_speaker_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Speaker could not be deleted. Check your editor permissions.';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_planner_speaker(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_planner_speaker(text) TO authenticated;
