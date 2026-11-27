-- =============================================================================
-- Barbell Buddy — Supabase Postgres Schema, RLS, Realtime & Admin RPCs
-- Run this entire script in the Supabase SQL Editor for a fresh project.
-- =============================================================================

create extension if not exists "pgcrypto";

-- 1. Lifters (Users)
create table if not exists public.lifters (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  avatar_color text not null default '#10b981',
  is_admin boolean not null default false,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

alter table public.lifters
  add column if not exists deleted_at timestamptz;

-- 2. Admin Config (Salted bcrypt hash for admin PIN verification; never plaintext)
create table if not exists public.admin_config (
  id int primary key default 1 check (id = 1),
  pin_hash text not null
);

-- 3. Exercises
create table if not exists public.exercises (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text not null check (category in ('pullup', 'barbell', 'dumbbell', 'dumbbell_single', 'bodyweight', 'machine')),
  is_builtin boolean not null default false,
  sort_order int not null default 100,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

alter table public.exercises
  add column if not exists deleted_at timestamptz;

do $$
declare
  con record;
begin
  for con in
    select c.conname
    from pg_constraint c
    join pg_class t on c.conrelid = t.oid
    join pg_namespace n on t.relnamespace = n.oid
    where n.nspname = 'public'
      and t.relname = 'exercises'
      and c.contype = 'c'
      and pg_get_constraintdef(c.oid) ilike '%category%'
  loop
    execute format('alter table public.exercises drop constraint %I', con.conname);
  end loop;

  for con in
    select c.conname, t.relname
    from pg_constraint c
    join pg_class t on c.conrelid = t.oid
    join pg_namespace n on t.relnamespace = n.oid
    where n.nspname = 'public'
      and t.relname in ('lifters', 'exercises')
      and c.contype = 'u'
  loop
    execute format('alter table public.%I drop constraint %I', con.relname, con.conname);
  end loop;
end $$;

alter table public.exercises
  add constraint exercises_category_check
  check (category in ('pullup', 'barbell', 'dumbbell', 'dumbbell_single', 'bodyweight', 'machine'));

create unique index if not exists idx_lifters_active_name_unique
  on public.lifters (lower(btrim(name)))
  where deleted_at is null;

create unique index if not exists idx_exercises_active_name_unique
  on public.exercises (lower(btrim(name)))
  where deleted_at is null;

-- 4. Workout Sessions (named by session_date YYYY-MM-DD)
create table if not exists public.workout_sessions (
  id uuid primary key default gen_random_uuid(),
  session_date text not null,
  status text not null default 'active' check (status in ('active', 'completed')),
  created_by uuid references public.lifters(id) on delete set null,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  expires_at timestamptz not null,
  deleted_at timestamptz
);

alter table public.workout_sessions
  add column if not exists deleted_at timestamptz;

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
  reps int not null check (reps > 0 and reps <= 20),
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
-- Seed Data: Julie, Joel (Admin), Leevi, Tuomas + 5 Starter Exercises + PIN Hash
-- =============================================================================

insert into public.lifters (name, avatar_color, is_admin)
values
  ('Julie', '#ec4899', false),
  ('Joel', '#10b981', true),
  ('Leevi', '#3b82f6', false),
  ('Tuomas', '#f59e0b', false)
on conflict ((lower(btrim(name)))) where deleted_at is null do update
  set avatar_color = excluded.avatar_color
  where lower(btrim(public.lifters.name)) = 'julie';

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
on conflict ((lower(btrim(name)))) where deleted_at is null do nothing;

update public.exercises
set category = 'dumbbell_single'
where lower(btrim(name)) = 'yliveto';

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

drop policy if exists "lifters_update_authenticated" on public.lifters;
create policy "lifters_update_authenticated" on public.lifters
  for update to authenticated using (true) with check (is_admin = false);

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

drop policy if exists "sessions_delete_authenticated" on public.workout_sessions;
create policy "sessions_delete_authenticated" on public.workout_sessions
  for delete to authenticated using (true);

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
  select is_admin into actor_is_admin
  from public.lifters
  where id = acting_lifter_id and deleted_at is null;

  if coalesce(actor_is_admin, false) is not true then
    raise exception 'Vain Joel (ylläpitäjä) voi poistaa käyttäjiä.';
  end if;

  if target_lifter_id = acting_lifter_id then
    raise exception 'Ylläpitäjä ei voi poistaa omaa käyttäjätiliään.';
  end if;

  select is_admin into target_is_admin
  from public.lifters
  where id = target_lifter_id and deleted_at is null;

  if target_is_admin is null then
    raise exception 'Käyttäjää ei löytynyt.';
  end if;

  if coalesce(target_is_admin, false) is true then
    raise exception 'Ylläpitäjää ei voi poistaa.';
  end if;

  update public.lifters
  set deleted_at = now()
  where id = target_lifter_id and deleted_at is null;
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
  select is_admin into actor_is_admin
  from public.lifters
  where id = acting_lifter_id and deleted_at is null;

  if coalesce(actor_is_admin, false) is not true then
    raise exception 'Vain Joel (ylläpitäjä) voi poistaa liikkeitä.';
  end if;

  update public.exercises
  set deleted_at = now()
  where id = target_exercise_id and deleted_at is null;

  if not found then
    raise exception 'Liikettä ei löytynyt.';
  end if;
end;
$$;

create or replace function public.admin_restore_session(target_session_id uuid, acting_lifter_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_is_admin boolean;
begin
  select is_admin into actor_is_admin
  from public.lifters
  where id = acting_lifter_id and deleted_at is null;

  if coalesce(actor_is_admin, false) is not true then
    raise exception 'Vain Joel (ylläpitäjä) voi palauttaa poistettuja treenejä.';
  end if;

  update public.workout_sessions
  set deleted_at = null,
      status = 'completed',
      ended_at = coalesce(ended_at, now())
  where id = target_session_id;

  if not found then
    raise exception 'Treeniä ei löytynyt.';
  end if;
end;
$$;

create or replace function public.admin_rename_exercise(
  target_exercise_id uuid,
  new_name text,
  acting_lifter_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_is_admin boolean;
  trimmed_name text;
begin
  select is_admin into actor_is_admin
  from public.lifters
  where id = acting_lifter_id and deleted_at is null;

  if coalesce(actor_is_admin, false) is not true then
    raise exception 'Vain Joel (ylläpitäjä) voi muokata liikkeiden nimiä.';
  end if;

  trimmed_name := btrim(coalesce(new_name, ''));
  if trimmed_name = '' then
    raise exception 'Anna liikkeen nimi.';
  end if;

  if exists (
    select 1
    from public.exercises
    where id <> target_exercise_id
      and deleted_at is null
      and lower(btrim(name)) = lower(trimmed_name)
  ) then
    raise exception 'Liike "%" on jo olemassa.', trimmed_name;
  end if;

  update public.exercises
  set name = trimmed_name
  where id = target_exercise_id and deleted_at is null;

  if not found then
    raise exception 'Liikettä ei löytynyt.';
  end if;
end;
$$;

create or replace function public.add_or_restore_lifter(
  new_name text,
  new_avatar_color text default '#10b981'
)
returns public.lifters
language plpgsql
security definer
set search_path = public
as $$
declare
  v_trimmed text;
  v_color text;
  v_row public.lifters;
begin
  v_trimmed := btrim(coalesce(new_name, ''));
  if v_trimmed = '' then
    raise exception 'Anna uuden käyttäjän nimi.';
  end if;

  v_color := coalesce(nullif(btrim(new_avatar_color), ''), '#10b981');

  if exists (
    select 1
    from public.lifters
    where deleted_at is null
      and lower(btrim(name)) = lower(v_trimmed)
  ) then
    raise exception 'Käyttäjä nimeltä "%" on jo olemassa.', v_trimmed;
  end if;

  select *
  into v_row
  from public.lifters
  where deleted_at is not null
    and lower(btrim(name)) = lower(v_trimmed)
  order by deleted_at desc nulls last
  limit 1;

  if found then
    update public.lifters
    set deleted_at = null,
        name = v_trimmed,
        avatar_color = v_color
    where id = v_row.id
    returning * into v_row;
    return v_row;
  end if;

  insert into public.lifters (name, avatar_color, is_admin, deleted_at)
  values (v_trimmed, v_color, false, null)
  returning * into v_row;

  return v_row;
end;
$$;

create or replace function public.add_or_restore_exercise(
  new_name text,
  new_category text
)
returns public.exercises
language plpgsql
security definer
set search_path = public
as $$
declare
  v_trimmed text;
  v_cat text;
  v_max_sort int;
  v_row public.exercises;
begin
  v_trimmed := btrim(coalesce(new_name, ''));
  if v_trimmed = '' then
    raise exception 'Anna liikkeen nimi.';
  end if;

  v_cat := btrim(coalesce(new_category, ''));
  if v_cat not in ('pullup', 'barbell', 'dumbbell', 'dumbbell_single', 'bodyweight', 'machine') then
    raise exception 'Virheellinen liikkeen kategoria.';
  end if;

  if exists (
    select 1
    from public.exercises
    where deleted_at is null
      and lower(btrim(name)) = lower(v_trimmed)
  ) then
    raise exception 'Liike "%" on jo olemassa.', v_trimmed;
  end if;

  select *
  into v_row
  from public.exercises
  where deleted_at is not null
    and lower(btrim(name)) = lower(v_trimmed)
    and category = v_cat
  order by deleted_at desc nulls last
  limit 1;

  if found then
    update public.exercises
    set deleted_at = null,
        name = v_trimmed
    where id = v_row.id
    returning * into v_row;
    return v_row;
  end if;

  select coalesce(max(sort_order), 0) into v_max_sort from public.exercises;

  insert into public.exercises (name, category, is_builtin, sort_order, deleted_at)
  values (v_trimmed, v_cat, false, v_max_sort + 1, null)
  returning * into v_row;

  return v_row;
end;
$$;

grant execute on function public.verify_admin_pin(text) to authenticated;
grant execute on function public.admin_delete_lifter(uuid, uuid) to authenticated;
grant execute on function public.admin_delete_exercise(uuid, uuid) to authenticated;
grant execute on function public.admin_restore_session(uuid, uuid) to authenticated;
grant execute on function public.admin_rename_exercise(uuid, text, uuid) to authenticated;
grant execute on function public.add_or_restore_lifter(text, text) to authenticated;
grant execute on function public.add_or_restore_exercise(text, text) to authenticated;

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
