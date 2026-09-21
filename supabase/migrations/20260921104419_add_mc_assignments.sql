-- MCs are assigned to a stage for a specific portion of an event day.
-- They are intentionally separate from sessions so the planner timeline and
-- public session feed remain accurate.

CREATE TABLE public.mc_assignments (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  day text NOT NULL CHECK (day IN ('day0', 'day1', 'day2')),
  stage_id text NOT NULL REFERENCES public.stages(id) ON DELETE CASCADE,
  speaker_id text REFERENCES public.speakers(id) ON DELETE SET NULL,
  segment_label text NOT NULL DEFAULT 'Morning',
  start_time time without time zone NOT NULL,
  end_time time without time zone NOT NULL,
  notes text,
  public_visible boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT mc_assignments_time_order CHECK (start_time < end_time)
);

CREATE INDEX mc_assignments_day_stage_time_idx
  ON public.mc_assignments (day, stage_id, start_time);

ALTER TABLE public.mc_assignments ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.mc_assignments TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.mc_assignments TO authenticated;

CREATE POLICY "Anyone can read MC assignments"
  ON public.mc_assignments
  FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Editors can insert MC assignments"
  ON public.mc_assignments
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.profiles
      WHERE profiles.id = (SELECT auth.uid())
        AND profiles.role = 'editor'
    )
  );

CREATE POLICY "Editors can update MC assignments"
  ON public.mc_assignments
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles
      WHERE profiles.id = (SELECT auth.uid())
        AND profiles.role = 'editor'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.profiles
      WHERE profiles.id = (SELECT auth.uid())
        AND profiles.role = 'editor'
    )
  );

CREATE POLICY "Editors can delete MC assignments"
  ON public.mc_assignments
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles
      WHERE profiles.id = (SELECT auth.uid())
        AND profiles.role = 'editor'
    )
  );

CREATE VIEW public.public_mc_assignments
WITH (security_invoker = true)
AS
SELECT
  mc.id,
  mc.day,
  mc.stage_id,
  st.name AS stage_name,
  st.hall_name,
  st.sort_order AS stage_sort_order,
  mc.segment_label,
  mc.start_time,
  mc.end_time,
  mc.public_visible,
  sp.id AS speaker_id,
  sp.name AS speaker_name,
  sp.title AS speaker_title,
  sp.company AS speaker_company,
  sp.headshot_url
FROM public.mc_assignments mc
JOIN public.stages st ON st.id = mc.stage_id
LEFT JOIN public.speakers sp ON sp.id = mc.speaker_id
WHERE mc.public_visible = true;

GRANT SELECT ON public.public_mc_assignments TO anon, authenticated;
