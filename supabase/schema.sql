-- =============================================================================
-- Barbell Buddy — Supabase Postgres Schema, RLS, Realtime & Admin RPCs
-- Run this entire script in the Supabase SQL Editor for a fresh project.
-- =============================================================================

create extension if not exists "pgcrypto";

-- 1. Lifters (Users)
create table if not exists public.lifters (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  avatar_color text not null default '#10b981',
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);

-- 2. Admin Config (Salted bcrypt hash for admin PIN verification; never plaintext)
create table if not exists public.admin_config (
  id int primary key default 1 check (id = 1),
  pin_hash text not null
);

-- 3. Exercises
create table if not exists public.exercises (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  category text not null check (category in ('pullup', 'barbell', 'dumbbell', 'bodyweight', 'machine')),
  is_builtin boolean not null default false,
  sort_order int not null default 100,
  created_at timestamptz not null default now()
);

-- 4. Workout Sessions (named by session_date YYYY-MM-DD)
create table if not exists public.workout_sessions (
  id uuid primary key default gen_random_uuid(),
  session_date text not null,
  status text not null default 'active' check (status in ('active', 'completed')),
  created_by uuid references public.lifters(id) on delete set null,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  expires_at timestamptz not null
);

create index if not exists idx_workout_sessions_date on public.workout_sessions(session_date desc, started_at desc);
create index if not exists idx_workout_sessions_status on public.workout_sessions(status, expires_at);

-- 5. Session Participants (many-to-many join)
create table if not exists public.session_participants (
  session_id uuid not null references public.workout_sessions(id) on delete cascade,
  lifter_id uuid not null references public.lifters(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (session_id, lifter_id)
);

create index if not exists idx_session_participants_lifter on public.session_participants(lifter_id);

-- 6. Workout Sets
create table if not exists public.workout_sets (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.workout_sessions(id) on delete cascade,
  lifter_id uuid not null references public.lifters(id) on delete cascade,
  exercise_id uuid not null references public.exercises(id) on delete cascade,
  pullup_mode text check (pullup_mode in ('assisted', 'bodyweight', 'weighted')),
  weight_kg numeric(6,2),
  reps int not null check (reps > 0 and reps <= 999),
  logged_by uuid references public.lifters(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint valid_pullup_weight check (
    (pullup_mode in ('assisted', 'bodyweight') and weight_kg is null)
    or (pullup_mode = 'weighted' and weight_kg is not null and weight_kg >= 0)
    or (pullup_mode is null and (weight_kg is null or weight_kg >= 0))
  )
);

create index if not exists idx_workout_sets_session on public.workout_sets(session_id, created_at asc);
create index if not exists idx_workout_sets_lifter_exercise on public.workout_sets(lifter_id, exercise_id, created_at desc);

-- =============================================================================
-- Seed Data: Julie, Joel (Admin), Leevi + 5 Starter Exercises + Salted PIN Hash
-- =============================================================================

insert into public.lifters (name, avatar_color, is_admin)
values
  ('Julie', '#f43f5e', false),
  ('Joel', '#10b981', true),
  ('Leevi', '#3b82f6', false)
on conflict (name) do nothing;

insert into public.admin_config (id, pin_hash)
values (1, '$2a$10$cWJRkj1RiRAB2at9tyuMMeLSuRFJvMdlfYw9kOuBGUDvLoY8KvJB.')
on conflict (id) do nothing;

insert into public.exercises (name, category, is_builtin, sort_order)
values
  ('Leuanveto', 'pullup', true, 1),
  ('Penkkipunnerrus', 'barbell', true, 2),
  ('Vinopenkki käsipainoilla', 'dumbbell', true, 3),
  ('Maastaveto', 'barbell', true, 4),
  ('Kyykky', 'barbell', true, 5)
on conflict (name) do nothing;

-- =============================================================================
-- Row Level Security (RLS)
-- =============================================================================

alter table public.lifters enable row level security;
alter table public.admin_config enable row level security;
alter table public.exercises enable row level security;
alter table public.workout_sessions enable row level security;
alter table public.session_participants enable row level security;
alter table public.workout_sets enable row level security;

-- Lifters: everyone authenticated can read and add; deletion only via admin RPC
drop policy if exists "lifters_select_authenticated" on public.lifters;
create policy "lifters_select_authenticated" on public.lifters
  for select to authenticated using (true);

drop policy if exists "lifters_insert_authenticated" on public.lifters;
create policy "lifters_insert_authenticated" on public.lifters
  for insert to authenticated with check (is_admin = false);

-- Exercises: everyone authenticated can read and add; deletion only via admin RPC
drop policy if exists "exercises_select_authenticated" on public.exercises;
create policy "exercises_select_authenticated" on public.exercises
  for select to authenticated using (true);

drop policy if exists "exercises_insert_authenticated" on public.exercises;
create policy "exercises_insert_authenticated" on public.exercises
  for insert to authenticated with check (true);

-- Workout Sessions: authenticated crew can read, create, and complete sessions
drop policy if exists "sessions_select_authenticated" on public.workout_sessions;
create policy "sessions_select_authenticated" on public.workout_sessions
  for select to authenticated using (true);

drop policy if exists "sessions_insert_authenticated" on public.workout_sessions;
create policy "sessions_insert_authenticated" on public.workout_sessions
  for insert to authenticated with check (true);

drop policy if exists "sessions_update_authenticated" on public.workout_sessions;
create policy "sessions_update_authenticated" on public.workout_sessions
  for update to authenticated using (true) with check (true);

-- Session Participants
drop policy if exists "participants_select_authenticated" on public.session_participants;
create policy "participants_select_authenticated" on public.session_participants
  for select to authenticated using (true);

drop policy if exists "participants_insert_authenticated" on public.session_participants;
create policy "participants_insert_authenticated" on public.session_participants
  for insert to authenticated with check (true);

-- Workout Sets: crew can read, add, edit, and delete sets
drop policy if exists "sets_select_authenticated" on public.workout_sets;
create policy "sets_select_authenticated" on public.workout_sets
  for select to authenticated using (true);

drop policy if exists "sets_insert_authenticated" on public.workout_sets;
create policy "sets_insert_authenticated" on public.workout_sets
  for insert to authenticated with check (true);

drop policy if exists "sets_update_authenticated" on public.workout_sets;
create policy "sets_update_authenticated" on public.workout_sets
  for update to authenticated using (true) with check (true);

drop policy if exists "sets_delete_authenticated" on public.workout_sets;
create policy "sets_delete_authenticated" on public.workout_sets
  for delete to authenticated using (true);

-- =============================================================================
-- SECURITY DEFINER Admin RPCs (PIN verification & Joel-only deletions)
-- =============================================================================

create or replace function public.verify_admin_pin(pin_input text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  stored_hash text;
begin
  select pin_hash into stored_hash from public.admin_config where id = 1;
  if stored_hash is null then
    return false;
  end if;
  return extensions.crypt(pin_input, stored_hash) = stored_hash;
exception
  when undefined_function then
    return public.crypt(pin_input, stored_hash) = stored_hash;
end;
$$;

create or replace function public.admin_delete_lifter(target_lifter_id uuid, acting_lifter_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_is_admin boolean;
  target_is_admin boolean;
begin
  select is_admin into actor_is_admin from public.lifters where id = acting_lifter_id;
  if coalesce(actor_is_admin, false) is not true then
    raise exception 'Vain Joel (ylläpitäjä) voi poistaa käyttäjiä.';
  end if;

  if target_lifter_id = acting_lifter_id then
    raise exception 'Ylläpitäjä ei voi poistaa omaa käyttäjätiliään.';
  end if;

  select is_admin into target_is_admin from public.lifters where id = target_lifter_id;
  if coalesce(target_is_admin, false) is true then
    raise exception 'Ylläpitäjää ei voi poistaa.';
  end if;

  delete from public.lifters where id = target_lifter_id;
end;
$$;

create or replace function public.admin_delete_exercise(target_exercise_id uuid, acting_lifter_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_is_admin boolean;
begin
  select is_admin into actor_is_admin from public.lifters where id = acting_lifter_id;
  if coalesce(actor_is_admin, false) is not true then
    raise exception 'Vain Joel (ylläpitäjä) voi poistaa liikkeitä.';
  end if;

  delete from public.exercises where id = target_exercise_id;
end;
$$;

grant execute on function public.verify_admin_pin(text) to authenticated;
grant execute on function public.admin_delete_lifter(uuid, uuid) to authenticated;
grant execute on function public.admin_delete_exercise(uuid, uuid) to authenticated;

-- =============================================================================
-- Supabase Realtime Publication
-- =============================================================================

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'lifters'
  ) then
    alter publication supabase_realtime add table public.lifters;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'exercises'
  ) then
    alter publication supabase_realtime add table public.exercises;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'workout_sessions'
  ) then
    alter publication supabase_realtime add table public.workout_sessions;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'session_participants'
  ) then
    alter publication supabase_realtime add table public.session_participants;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'workout_sets'
  ) then
    alter publication supabase_realtime add table public.workout_sets;
  end if;
end $$;
