create type public.app_role as enum ('admin', 'user');
create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  role app_role not null,
  unique (user_id, role)
);
grant select on public.user_roles to authenticated;
grant all on public.user_roles to service_role;
alter table public.user_roles enable row level security;
create or replace function public.has_role(_user_id uuid, _role app_role)
returns boolean language sql stable security definer set search_path = public
as $$ select exists (select 1 from public.user_roles where user_id = _user_id and role = _role) $$;
create policy "Users read own roles" on public.user_roles for select to authenticated using (user_id = auth.uid());

create table public.applications (
  id uuid primary key default gen_random_uuid(),
  first_name text not null default '',
  last_name text not null default '',
  phone text not null default '',
  email text not null default '',
  city text not null default '',
  community_name text not null default '',
  business_name text not null default '',
  company_id text not null default '',
  founded integer,
  age_range text not null default '',
  purpose text not null default '',
  audience jsonb not null default '[]'::jsonb,
  event_types jsonb not null default '[]'::jsonb,
  events_count numeric,
  attendance numeric,
  fb_group numeric,
  fb_page numeric,
  instagram numeric,
  whatsapp numeric,
  newsletter numeric,
  open_rate numeric,
  click_rate numeric,
  total_exposure numeric,
  partners jsonb not null default '[]'::jsonb,
  logo1_path text,
  logo2_path text,
  created_at timestamptz not null default now()
);
grant insert on public.applications to anon;
grant select, insert, update, delete on public.applications to authenticated;
grant all on public.applications to service_role;
alter table public.applications enable row level security;
create policy "Anyone can submit" on public.applications for insert to anon, authenticated with check (true);
create policy "Admins read" on public.applications for select to authenticated using (public.has_role(auth.uid(), 'admin'));
create policy "Admins update" on public.applications for update to authenticated using (public.has_role(auth.uid(), 'admin'));
create policy "Admins delete" on public.applications for delete to authenticated using (public.has_role(auth.uid(), 'admin'));

create policy "Anyone can upload logos" on storage.objects for insert to anon, authenticated with check (bucket_id = 'logos');
create policy "Admins read logos" on storage.objects for select to authenticated using (bucket_id = 'logos' and public.has_role(auth.uid(), 'admin'));
create policy "Admins update logos" on storage.objects for update to authenticated using (bucket_id = 'logos' and public.has_role(auth.uid(), 'admin'));
create policy "Admins delete logos" on storage.objects for delete to authenticated using (bucket_id = 'logos' and public.has_role(auth.uid(), 'admin'));