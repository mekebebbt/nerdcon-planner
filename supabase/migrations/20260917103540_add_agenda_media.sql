alter table public.sessions
  add column if not exists event_image_url text,
  add column if not exists sponsor_logo_url text;

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'agenda-assets',
  'agenda-assets',
  true,
  5242880,
  array['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/svg+xml']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Editors can upload agenda assets" on storage.objects;

create policy "Editors can upload agenda assets"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'agenda-assets'
  and exists (
    select 1
    from public.profiles
    where profiles.id = (select auth.uid())
      and profiles.role = 'editor'
  )
);

create or replace view public.public_agenda
with (security_invoker = true)
as
select
    s.id as session_id,
    s.title,
    s.day,
    s.session_date,
    s.start_time,
    s.end_time,
    s.duration_minutes,
    s.format,
    s.description,
    st.name as stage_name,
    st.hall_name,
    st.display_group,
    st.sort_order as stage_sort_order,
    s.venue,
    s.capacity,
    s.invite_only,
    (
        select jsonb_agg(
            jsonb_build_object(
                'name', sp.name,
                'title', sp.title,
                'company', sp.company,
                'headshot_url', sp.headshot_url,
                'role', seat.value ->> 'role'
            )
            order by sp.name
        )
        from jsonb_array_elements(s.speakers) seat(value)
        join public.speakers sp
          on sp.id = (seat.value ->> 'speaker_id')
        where seat.value ->> 'kind' = 'speaker'
          and seat.value ->> 'status' = 'confirmed'
    ) as speakers,
    s.topics,
    s.xp_value,
    s.sponsor_name,
    s.sponsor_name is not null as sponsored,
    s.stage_config_id,
    s.event_quest_config_id,
    s.event_day_config_id,
    s.event_image_url,
    s.sponsor_logo_url
from public.sessions s
left join public.stages st
  on st.id = s.stage_id
where s.status = 'confirmed'
  and (s.type is null or s.type <> 'block')
  and (
    s.day = 'day0'
    or st.display_group = 'bonus'
    or exists (
      select 1
      from jsonb_array_elements(s.speakers) seat(value)
      join public.speakers sp
        on sp.id = (seat.value ->> 'speaker_id')
      where seat.value ->> 'kind' = 'speaker'
        and seat.value ->> 'status' = 'confirmed'
    )
  );
