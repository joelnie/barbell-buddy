-- =============================================================================
-- Barbell Buddy — Migration: Admin Restore Deleted Sessions & Rename Exercises
-- Safe to run multiple times (idempotent) in the Supabase SQL Editor.
-- =============================================================================

-- 1. Soft-delete timestamp on workout_sessions (preserves workout_sets on delete)
alter table public.workout_sessions
  add column if not exists deleted_at timestamptz;

create index if not exists idx_workout_sessions_deleted_at
  on public.workout_sessions(deleted_at);

-- 2. SECURITY DEFINER RPC: Joel (admin) restores a soft-deleted session
create or replace function public.admin_restore_session(
  target_session_id uuid,
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
  select is_admin into actor_is_admin from public.lifters where id = acting_lifter_id;
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

-- 3. SECURITY DEFINER RPC: Joel (admin) renames an exercise (applies across all history)
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
  select is_admin into actor_is_admin from public.lifters where id = acting_lifter_id;
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
      and lower(name) = lower(trimmed_name)
  ) then
    raise exception 'Liike "%" on jo olemassa.', trimmed_name;
  end if;

  update public.exercises
  set name = trimmed_name
  where id = target_exercise_id;

  if not found then
    raise exception 'Liikettä ei löytynyt.';
  end if;
end;
$$;

grant execute on function public.admin_restore_session(uuid, uuid) to authenticated;
grant execute on function public.admin_rename_exercise(uuid, text, uuid) to authenticated;
