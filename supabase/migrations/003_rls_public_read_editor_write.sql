-- RLS: public reads, editor-only writes on sessions/speakers/stages
-- Comments use a SECURITY DEFINER function so commenters can post without full UPDATE access

-- Enable RLS on stages (was disabled)
ALTER TABLE public.stages ENABLE ROW LEVEL SECURITY;

-- ── Sessions: public read, editor-only write ──
DROP POLICY IF EXISTS "Allow all on sessions" ON public.sessions;

CREATE POLICY "Anyone can read sessions" ON public.sessions
  FOR SELECT USING (true);

CREATE POLICY "Editors can insert sessions" ON public.sessions
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'editor')
  );

CREATE POLICY "Editors can update sessions" ON public.sessions
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'editor')
  );

CREATE POLICY "Editors can delete sessions" ON public.sessions
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'editor')
  );

-- ── Speakers: public read, editor-only write ──
DROP POLICY IF EXISTS "Allow all on speakers" ON public.speakers;

CREATE POLICY "Anyone can read speakers" ON public.speakers
  FOR SELECT USING (true);

CREATE POLICY "Editors can insert speakers" ON public.speakers
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'editor')
  );

CREATE POLICY "Editors can update speakers" ON public.speakers
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'editor')
  );

CREATE POLICY "Editors can delete speakers" ON public.speakers
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'editor')
  );

-- ── Stages: public read, editor-only write ──
CREATE POLICY "Anyone can read stages" ON public.stages
  FOR SELECT USING (true);

CREATE POLICY "Editors can insert stages" ON public.stages
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'editor')
  );

CREATE POLICY "Editors can update stages" ON public.stages
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'editor')
  );

CREATE POLICY "Editors can delete stages" ON public.stages
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'editor')
  );

-- ── Secure comment function (any authenticated user can post comments) ──
CREATE OR REPLACE FUNCTION public.update_session_comments(session_id text, new_comments jsonb)
RETURNS void AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  UPDATE public.sessions SET comments = new_comments WHERE id = session_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
