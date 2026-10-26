-- SINGLES2027 forms system, part 1 of 2: STRUCTURE (tables, security rules, functions).
-- Apply as a migration. No data is added here.
-- Safe to run again: every step is "if not exists" / "create or replace" / "drop policy if exists".

-- 1. Tables -----------------------------------------------------------------
create table if not exists public.forms (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]{2,60}$'),
  title text not null default '',
  template text not null default 'letter' check (template in ('letter', 'match', 'blush')),
  accent text,
  status text not null default 'open' check (status in ('open', 'closed')),
  is_home boolean not null default false,
  draft jsonb not null,
  published jsonb,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists forms_one_home on public.forms (is_home) where is_home;

create table if not exists public.form_responses (
  id uuid primary key default gen_random_uuid(),
  form_id uuid not null references public.forms (id) on delete cascade,
  answers jsonb not null default '{}'::jsonb,
  labels jsonb not null default '{}'::jsonb,
  files jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists form_responses_form_created on public.form_responses (form_id, created_at desc);

-- 2. Security: anyone may answer an open, published form; only admins see or change anything
alter table public.forms enable row level security;
alter table public.form_responses enable row level security;

grant select, insert, update, delete on public.forms to authenticated;
grant select, insert, update, delete on public.form_responses to authenticated;
grant insert on public.form_responses to anon;
grant all on public.forms, public.form_responses to service_role;

create or replace function public.form_accepts(_form_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.forms where id = _form_id and status = 'open' and published is not null)
$$;

drop policy if exists "Admins manage forms" on public.forms;
create policy "Admins manage forms" on public.forms for all to authenticated
  using (public.has_role(auth.uid(), 'admin')) with check (public.has_role(auth.uid(), 'admin'));

drop policy if exists "Anyone can answer open forms" on public.form_responses;
create policy "Anyone can answer open forms" on public.form_responses for insert to anon, authenticated
  with check (public.form_accepts(form_id));
drop policy if exists "Admins read responses" on public.form_responses;
create policy "Admins read responses" on public.form_responses for select to authenticated
  using (public.has_role(auth.uid(), 'admin'));
drop policy if exists "Admins update responses" on public.form_responses;
create policy "Admins update responses" on public.form_responses for update to authenticated
  using (public.has_role(auth.uid(), 'admin'));
drop policy if exists "Admins delete responses" on public.form_responses;
create policy "Admins delete responses" on public.form_responses for delete to authenticated
  using (public.has_role(auth.uid(), 'admin'));

-- 3. What the public pages may read: only the published version of a form ---
create or replace function public.get_public_form(_slug text)
returns table (id uuid, slug text, template text, accent text, status text, def jsonb)
language sql stable security definer set search_path = public as $$
  select f.id, f.slug, f.template, f.accent, f.status, f.published
  from public.forms f where f.slug = _slug and f.published is not null limit 1
$$;

create or replace function public.get_home_form()
returns table (id uuid, slug text, template text, accent text, status text, def jsonb)
language sql stable security definer set search_path = public as $$
  select f.id, f.slug, f.template, f.accent, f.status, f.published
  from public.forms f where f.is_home and f.published is not null limit 1
$$;

create or replace function public.set_home_form(_form_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.has_role(auth.uid(), 'admin') then
    raise exception 'not allowed';
  end if;
  update public.forms set is_home = false where is_home and id <> _form_id;
  update public.forms set is_home = true where id = _form_id;
end
$$;

revoke all on function public.set_home_form(uuid) from public, anon;
grant execute on function public.set_home_form(uuid) to authenticated;
grant execute on function public.get_public_form(text), public.get_home_form(), public.form_accepts(uuid) to anon, authenticated;
