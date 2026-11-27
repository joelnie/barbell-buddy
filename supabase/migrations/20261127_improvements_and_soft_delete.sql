-- =============================================================================
-- Barbell Buddy — Migration: Single-Dumbbell Category (Käsipaino x1), Yliveto
-- Update & Soft-Delete / Auto-Restore for Lifters and Exercises
-- Safe to run multiple times (idempotent) in the Supabase SQL Editor.
-- =============================================================================

-- 1. Expand exercises.category check constraint to support 'dumbbell_single'
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
end $$;

alter table public.exercises
  add constraint exercises_category_check
  check (category in ('pullup', 'barbell', 'dumbbell', 'dumbbell_single', 'bodyweight', 'machine'));

-- 2. Switch "Yliveto" exercise to Käsipaino (x1) ('dumbbell_single')
update public.exercises
set category = 'dumbbell_single'
where lower(btrim(name)) = 'yliveto';

-- 3. Add soft-delete columns on lifters and exercises & replace table-level
--    unique constraints with partial active-only case-insensitive unique indexes
alter table public.lifters
  add column if not exists deleted_at timestamptz;

alter table public.exercises
  add column if not exists deleted_at timestamptz;

do $$
declare
  con record;
begin
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

create unique index if not exists idx_lifters_active_name_unique
  on public.lifters (lower(btrim(name)))
  where deleted_at is null;

create unique index if not exists idx_exercises_active_name_unique
  on public.exercises (lower(btrim(name)))
  where deleted_at is null;

create index if not exists idx_lifters_deleted_at
  on public.lifters(deleted_at);

create index if not exists idx_exercises_deleted_at
  on public.exercises(deleted_at);

-- 4. Update admin deletion RPCs to soft-delete (preserving all historical sets)
create or replace function public.admin_delete_lifter(
  target_lifter_id uuid,
  acting_lifter_id uuid
)
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

create or replace function public.admin_delete_exercise(
  target_exercise_id uuid,
  acting_lifter_id uuid
)
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

-- 5. Update admin_rename_exercise to check duplicates only among active exercises
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

-- 6. RPCs to add OR automatically restore a soft-deleted lifter / exercise
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

grant execute on function public.admin_delete_lifter(uuid, uuid) to authenticated;
grant execute on function public.admin_delete_exercise(uuid, uuid) to authenticated;
grant execute on function public.admin_rename_exercise(uuid, text, uuid) to authenticated;
grant execute on function public.add_or_restore_lifter(text, text) to authenticated;
grant execute on function public.add_or_restore_exercise(text, text) to authenticated;
