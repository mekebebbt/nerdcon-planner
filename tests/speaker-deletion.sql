-- Run in Supabase SQL editor as postgres. All fixtures and changes roll back.
BEGIN;
SELECT set_config('test.speaker_id', gen_random_uuid()::text, true);
SELECT set_config('test.session_id', gen_random_uuid()::text, true);
SELECT set_config('test.editor_id', gen_random_uuid()::text, true);
INSERT INTO auth.users (id, email) VALUES (current_setting('test.editor_id')::uuid, 'speaker-deletion-test@example.invalid');
INSERT INTO public.profiles (id, email, role)
VALUES (current_setting('test.editor_id')::uuid, 'speaker-deletion-test@example.invalid', 'editor')
ON CONFLICT (id) DO UPDATE SET role = 'editor';
INSERT INTO public.speakers (id, name) VALUES (current_setting('test.speaker_id'), 'Disposable deletion fixture');
INSERT INTO public.sessions (id, title, speakers)
VALUES (current_setting('test.session_id'), 'Disposable deletion fixture',
 jsonb_build_array(current_setting('test.speaker_id'),
 jsonb_build_object('speaker_id', current_setting('test.speaker_id'), 'kind', 'speaker', 'role', 'moderator'),
 jsonb_build_object('kind','company','label','Preserved placeholder'), 'unrelated-speaker'));

-- Newer environments have MC assignments; test the real ON DELETE SET NULL FK.
DO $$ BEGIN
  IF to_regclass('public.mc_assignments') IS NOT NULL THEN
    INSERT INTO public.mc_assignments (id, day, stage_id, speaker_id, segment_label, start_time, end_time)
    SELECT current_setting('test.speaker_id'), 'day1', id, current_setting('test.speaker_id'), 'Deletion test', '09:00', '10:00'
    FROM public.stages LIMIT 1;
  END IF;
END $$;

SET LOCAL ROLE anon;
DO $$ BEGIN
  BEGIN
    PERFORM public.delete_planner_speaker(current_setting('test.speaker_id'));
    RAISE EXCEPTION 'FAIL: anonymous RPC was allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  DELETE FROM public.speakers WHERE id = current_setting('test.speaker_id');
  IF FOUND THEN RAISE EXCEPTION 'FAIL: anonymous direct delete was allowed'; END IF;
END $$;

SET LOCAL ROLE authenticated;
DO $$ BEGIN
  BEGIN
    PERFORM public.delete_planner_speaker(current_setting('test.speaker_id'));
    RAISE EXCEPTION 'FAIL: non-editor RPC was allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;

SELECT set_config('request.jwt.claim.sub', current_setting('test.editor_id'), true);
DO $$ DECLARE affected integer; BEGIN
  SELECT count(*) INTO affected FROM public.delete_planner_speaker(current_setting('test.speaker_id'));
  IF affected <> 1 THEN RAISE EXCEPTION 'FAIL: expected one updated session'; END IF;
  IF EXISTS (SELECT 1 FROM public.speakers WHERE id=current_setting('test.speaker_id')) THEN
    RAISE EXCEPTION 'FAIL: speaker still exists';
  END IF;
  IF (SELECT speakers FROM public.sessions WHERE id=current_setting('test.session_id')) IS DISTINCT FROM
    '[{"kind":"company","label":"Preserved placeholder"},"unrelated-speaker"]'::jsonb THEN
    RAISE EXCEPTION 'FAIL: session or remaining participants changed';
  END IF;
  BEGIN
    PERFORM public.delete_planner_speaker(current_setting('test.speaker_id'));
    RAISE EXCEPTION 'FAIL: missing speaker did not raise';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM NOT LIKE 'Speaker no longer exists.%' THEN RAISE; END IF;
  END;
END $$;
RESET ROLE;
DO $$ BEGIN
  IF to_regclass('public.mc_assignments') IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.mc_assignments WHERE id=current_setting('test.speaker_id') AND speaker_id IS NULL) THEN
      RAISE EXCEPTION 'FAIL: MC slot was not preserved with a null speaker';
    END IF;
  END IF;
END $$;
SELECT 'PASS: anonymous and non-editor deletion blocked; editor deletion removes legacy and object references, preserves session/other participants; missing speaker rejected. All fixtures rolled back.' AS result;
ROLLBACK;
