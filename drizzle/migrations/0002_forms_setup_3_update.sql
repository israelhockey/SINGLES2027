-- SINGLES2027 forms system, part 3: UPDATE for the handover features.
-- Apply as a migration, unchanged. It adds no data rows.
-- Safe to run again: every step is "if not exists" / "create or replace" / "drop ... if exists".
--
-- What it adds:
--   forms.history          earlier published versions of a form (for "restore a version")
--   forms.preview_token    secret for the shareable "preview the draft" link
--   form_responses.status  handling status of each sign-up (new / in progress / approved / not relevant)
--   form_responses.notes   a private note on each sign-up (only admins see it)
--   form_responses.updated_at  when an admin last edited a sign-up
--   short_links            tiny links saved for every admin, on every device
--   Auto-close: a form stops taking answers after its closing date or after N answers.

-- 1. New columns ------------------------------------------------------------
alter table public.forms add column if not exists history jsonb not null default '[]'::jsonb;
alter table public.forms add column if not exists preview_token text;

alter table public.form_responses add column if not exists status text not null default 'new';
alter table public.form_responses drop constraint if exists form_responses_status_check;
alter table public.form_responses add constraint form_responses_status_check
  check (status in ('new', 'in_progress', 'approved', 'not_relevant'));
alter table public.form_responses add column if not exists notes text not null default '';
alter table public.form_responses add column if not exists updated_at timestamptz;

-- 2. Admins may add a sign-up by hand, even to a closed form ---------------
drop policy if exists "Admins insert responses" on public.form_responses;
create policy "Admins insert responses" on public.form_responses for insert to authenticated
  with check (public.has_role(auth.uid(), 'admin'));

-- 3. Tiny links, shared by all admins ---------------------------------------
create table if not exists public.short_links (
  id uuid primary key default gen_random_uuid(),
  short_url text not null unique,
  alias text not null,
  target text not null,
  created_at timestamptz not null default now()
);
alter table public.short_links enable row level security;
grant select, insert, update, delete on public.short_links to authenticated;
grant all on public.short_links to service_role;
drop policy if exists "Admins manage short links" on public.short_links;
create policy "Admins manage short links" on public.short_links for all to authenticated
  using (public.has_role(auth.uid(), 'admin')) with check (public.has_role(auth.uid(), 'admin'));

-- 4. Is a form taking answers right now? -----------------------------------
-- Open + published + before its closing date (if set) + under its answer limit (if set).
create or replace function public.form_accepts(_form_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.forms f
    where f.id = _form_id
      and f.status = 'open'
      and f.published is not null
      and case
        when (f.published -> 'settings' ->> 'closeAt') ~ '^\d{4}-\d{2}-\d{2}'
          then now() < (f.published -> 'settings' ->> 'closeAt')::timestamptz
        else true end
      and case
        when jsonb_typeof(f.published -> 'settings' -> 'maxResponses') = 'number'
          then (select count(*) from public.form_responses r where r.form_id = f.id)
               < (f.published -> 'settings' ->> 'maxResponses')::numeric
        else true end
  )
$$;

-- 5. What the public pages read (now also says whether the form is taking answers)
drop function if exists public.get_public_form(text);
create function public.get_public_form(_slug text)
returns table (id uuid, slug text, template text, accent text, status text, def jsonb, accepting boolean)
language sql stable security definer set search_path = public as $$
  select f.id, f.slug, f.template, f.accent, f.status, f.published, public.form_accepts(f.id)
  from public.forms f where f.slug = _slug and f.published is not null limit 1
$$;

drop function if exists public.get_home_form();
create function public.get_home_form()
returns table (id uuid, slug text, template text, accent text, status text, def jsonb, accepting boolean)
language sql stable security definer set search_path = public as $$
  select f.id, f.slug, f.template, f.accent, f.status, f.published, public.form_accepts(f.id)
  from public.forms f where f.is_home and f.published is not null limit 1
$$;

-- 6. Preview link: shows the DRAFT only to someone holding the secret link --
create or replace function public.get_preview_form(_slug text, _token text)
returns table (id uuid, slug text, template text, accent text, status text, def jsonb, accepting boolean)
language sql stable security definer set search_path = public as $$
  select f.id, f.slug, f.template, f.accent, f.status, f.draft, false
  from public.forms f
  where f.slug = _slug
    and f.preview_token is not null
    and length(f.preview_token) >= 16
    and f.preview_token = _token
  limit 1
$$;

grant execute on function public.get_public_form(text), public.get_home_form(),
  public.get_preview_form(text, text), public.form_accepts(uuid) to anon, authenticated;