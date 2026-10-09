alter table public.sessions
  add column if not exists signup_url text
  constraint sessions_signup_url_http_check
  check (signup_url is null or signup_url ~* '^https?://');

comment on column public.sessions.signup_url is
  'Optional external registration URL shown as the Day 0 Sign up action.';

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
    s.sponsor_logo_url,
    s.signup_url
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
