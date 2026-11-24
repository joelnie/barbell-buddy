import { createClient, type RealtimeChannel, type SupabaseClient } from '@supabase/supabase-js';
import type {
  AddSetInput,
  CreateSessionInput,
  DataStore,
  Exercise,
  ExerciseCategory,
  Lifter,
  PullupMode,
  StoreSnapshot,
  UpdateSetPatch,
  WorkoutSession,
  WorkoutSet,
} from '../types/models';
import { verifyAdminPinHash } from './adminAuth';
import { computeSessionExpiryIso, formatLocalDate, isSessionActiveAt } from './dates';
import { normalizeAndValidateSet } from './metrics';

interface LifterRow {
  id: string;
  name: string;
  avatar_color: string;
  is_admin: boolean;
  created_at: string;
}

interface ExerciseRow {
  id: string;
  name: string;
  category: ExerciseCategory;
  is_builtin: boolean;
  sort_order: number;
  created_at: string;
}

interface SessionRow {
  id: string;
  session_date: string;
  status: 'active' | 'completed';
  created_by: string | null;
  started_at: string;
  ended_at: string | null;
  expires_at: string;
}

interface ParticipantRow {
  session_id: string;
  lifter_id: string;
}

interface SetRow {
  id: string;
  session_id: string;
  lifter_id: string;
  exercise_id: string;
  pullup_mode: PullupMode | null;
  weight_kg: number | string | null;
  reps: number;
  logged_by: string | null;
  created_at: string;
}

export class SupabaseRealtimeStore implements DataStore {
  private readonly client: SupabaseClient;
  private readonly defaultCrewEmail: string;
  private channel: RealtimeChannel | null = null;
  private listeners = new Set<() => void>();
  private snapshot: StoreSnapshot;
  private refreshTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(url: string, anonKey: string, crewEmail = 'crew@barbellbuddy.app') {
    this.client = createClient(url, anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
      },
    });
    this.defaultCrewEmail = crewEmail;
    this.snapshot = {
      lifters: [],
      exercises: [],
      sessions: [],
      sets: [],
      syncStatus: 'syncing',
      mode: 'supabase',
      authRequired: false,
      crewEmail,
    };
  }

  getSnapshot(): StoreSnapshot {
    return this.snapshot;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private updateSnapshot(partial: Partial<StoreSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...partial };
    for (const listener of this.listeners) {
      listener();
    }
  }

  async initialize(): Promise<void> {
    const { data } = await this.client.auth.getSession();
    if (!data.session) {
      this.updateSnapshot({ authRequired: true, syncStatus: 'offline' });
      return;
    }

    this.updateSnapshot({ authRequired: false, syncStatus: 'syncing' });
    await this.refresh();
    this.attachRealtime();
  }

  async signInCrew(password: string, emailOverride?: string): Promise<void> {
    const email = (emailOverride?.trim() || this.defaultCrewEmail).trim();
    const { error } = await this.client.auth.signInWithPassword({
      email,
      password,
    });
    if (error) {
      throw new Error(error.message || 'Invalid crew passcode.');
    }
    this.updateSnapshot({ authRequired: false, syncStatus: 'syncing', crewEmail: email });
    await this.refresh();
    this.attachRealtime();
  }

  async signOutCrew(): Promise<void> {
    if (this.channel) {
      await this.client.removeChannel(this.channel);
      this.channel = null;
    }
    await this.client.auth.signOut();
    this.updateSnapshot({
      lifters: [],
      exercises: [],
      sessions: [],
      sets: [],
      authRequired: true,
      syncStatus: 'offline',
    });
  }

  private attachRealtime(): void {
    if (this.channel) return;

    const scheduleRefresh = () => {
      if (this.refreshTimer) clearTimeout(this.refreshTimer);
      this.refreshTimer = setTimeout(() => {
        void this.refresh();
      }, 80);
    };

    this.channel = this.client
      .channel('barbell-buddy-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'lifters' }, scheduleRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'exercises' }, scheduleRefresh)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'workout_sessions' },
        scheduleRefresh,
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'session_participants' },
        scheduleRefresh,
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'workout_sets' },
        scheduleRefresh,
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          this.updateSnapshot({ syncStatus: 'synced' });
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          this.updateSnapshot({ syncStatus: 'offline' });
        }
      });
  }

  async refresh(now: Date = new Date()): Promise<void> {
    if (this.snapshot.authRequired) return;

    const [liftersRes, exercisesRes, sessionsRes, participantsRes, setsRes] = await Promise.all([
      this.client.from('lifters').select('*').order('created_at', { ascending: true }),
      this.client.from('exercises').select('*').order('sort_order', { ascending: true }),
      this.client
        .from('workout_sessions')
        .select('*')
        .order('session_date', { ascending: false })
        .order('started_at', { ascending: false }),
      this.client.from('session_participants').select('session_id, lifter_id'),
      this.client.from('workout_sets').select('*').order('created_at', { ascending: true }),
    ]);

    if (
      liftersRes.error ||
      exercisesRes.error ||
      sessionsRes.error ||
      participantsRes.error ||
      setsRes.error
    ) {
      this.updateSnapshot({ syncStatus: 'offline' });
      return;
    }

    const participantsBySession = new Map<string, string[]>();
    for (const row of (participantsRes.data ?? []) as ParticipantRow[]) {
      const list = participantsBySession.get(row.session_id) ?? [];
      list.push(row.lifter_id);
      participantsBySession.set(row.session_id, list);
    }

    const lifters: Lifter[] = ((liftersRes.data ?? []) as LifterRow[]).map((r) => ({
      id: r.id,
      name: r.name,
      avatarColor: r.avatar_color,
      isAdmin: r.is_admin,
      createdAt: r.created_at,
    }));

    const exercises: Exercise[] = ((exercisesRes.data ?? []) as ExerciseRow[]).map((r) => ({
      id: r.id,
      name: r.name,
      category: r.category,
      isBuiltin: r.is_builtin,
      sortOrder: r.sort_order,
      createdAt: r.created_at,
    }));

    const sessions: WorkoutSession[] = ((sessionsRes.data ?? []) as SessionRow[]).map((r) => ({
      id: r.id,
      sessionDate: r.session_date,
      status: r.status,
      createdBy: r.created_by,
      participantIds: participantsBySession.get(r.id) ?? [],
      startedAt: r.started_at,
      endedAt: r.ended_at,
      expiresAt: r.expires_at,
    }));

    const sets: WorkoutSet[] = ((setsRes.data ?? []) as SetRow[]).map((r) => ({
      id: r.id,
      sessionId: r.session_id,
      lifterId: r.lifter_id,
      exerciseId: r.exercise_id,
      pullupMode: r.pullup_mode,
      weightKg: r.weight_kg === null ? null : Number(r.weight_kg),
      reps: r.reps,
      loggedBy: r.logged_by,
      createdAt: r.created_at,
    }));

    this.updateSnapshot({
      lifters,
      exercises,
      sessions,
      sets,
      syncStatus: 'synced',
    });

    await this.sweepExpiredSessions(now);
  }

  async sweepExpiredSessions(now: Date = new Date()): Promise<number> {
    const expired = this.snapshot.sessions.filter(
      (s) => s.status === 'active' && !isSessionActiveAt(s, now),
    );
    if (expired.length === 0) return 0;

    await Promise.all(
      expired.map((s) =>
        this.client
          .from('workout_sessions')
          .update({ status: 'completed', ended_at: s.endedAt ?? s.expiresAt })
          .eq('id', s.id)
          .eq('status', 'active'),
      ),
    );

    const expiredIds = new Set(expired.map((s) => s.id));
    this.updateSnapshot({
      sessions: this.snapshot.sessions.map((s) =>
        expiredIds.has(s.id)
          ? { ...s, status: 'completed', endedAt: s.endedAt ?? s.expiresAt }
          : s,
      ),
    });

    return expired.length;
  }

  async createSession(input: CreateSessionInput): Promise<WorkoutSession> {
    const now = input.now ?? new Date();
    await this.sweepExpiredSessions(now);

    const uniqueParticipants = Array.from(new Set(input.participantIds.filter(Boolean)));
    if (uniqueParticipants.length === 0) {
      throw new Error('Select at least one lifter for the session.');
    }

    for (const pid of uniqueParticipants) {
      const conflict = this.snapshot.sessions.find(
        (s) => isSessionActiveAt(s, now) && s.participantIds.includes(pid),
      );
      if (conflict) {
        const lifterName = this.snapshot.lifters.find((l) => l.id === pid)?.name ?? 'Lifter';
        throw new Error(`${lifterName} is already in an active session.`);
      }
    }

    const sessionDate = input.sessionDate ?? formatLocalDate(now);
    const expiresAt = computeSessionExpiryIso(sessionDate);

    const { data, error } = await this.client
      .from('workout_sessions')
      .insert({
        session_date: sessionDate,
        status: 'active',
        created_by: input.createdBy,
        started_at: now.toISOString(),
        expires_at: expiresAt,
      })
      .select('*')
      .single();

    if (error || !data) {
      throw new Error(error?.message ?? 'Could not create session.');
    }

    const row = data as SessionRow;
    const { error: partError } = await this.client.from('session_participants').insert(
      uniqueParticipants.map((lifterId) => ({
        session_id: row.id,
        lifter_id: lifterId,
      })),
    );

    if (partError) {
      throw new Error(partError.message);
    }

    await this.refresh(now);
    return (
      this.snapshot.sessions.find((s) => s.id === row.id) ?? {
        id: row.id,
        sessionDate,
        status: 'active',
        createdBy: input.createdBy,
        participantIds: uniqueParticipants,
        startedAt: row.started_at,
        endedAt: null,
        expiresAt,
      }
    );
  }

  async addParticipantToSession(
    sessionId: string,
    lifterId: string,
    now: Date = new Date(),
  ): Promise<void> {
    await this.sweepExpiredSessions(now);
    const conflict = this.snapshot.sessions.find(
      (s) => s.id !== sessionId && isSessionActiveAt(s, now) && s.participantIds.includes(lifterId),
    );
    if (conflict) {
      const lifterName = this.snapshot.lifters.find((l) => l.id === lifterId)?.name ?? 'Lifter';
      throw new Error(`${lifterName} is already in another active session.`);
    }

    const { error } = await this.client.from('session_participants').insert({
      session_id: sessionId,
      lifter_id: lifterId,
    });
    if (error) throw new Error(error.message);
    await this.refresh(now);
  }

  async endSession(sessionId: string, now: Date = new Date()): Promise<void> {
    const { error } = await this.client
      .from('workout_sessions')
      .update({ status: 'completed', ended_at: now.toISOString() })
      .eq('id', sessionId);
    if (error) throw new Error(error.message);
    await this.refresh(now);
  }

  async addSet(input: AddSetInput): Promise<WorkoutSet> {
    const exercise = this.snapshot.exercises.find((e) => e.id === input.exerciseId);
    if (!exercise) throw new Error('Exercise not found.');

    const normalized = normalizeAndValidateSet(exercise, {
      pullupMode: input.pullupMode,
      weightKg: input.weightKg,
      reps: input.reps,
    });

    const { data, error } = await this.client
      .from('workout_sets')
      .insert({
        session_id: input.sessionId,
        lifter_id: input.lifterId,
        exercise_id: input.exerciseId,
        pullup_mode: normalized.pullupMode,
        weight_kg: normalized.weightKg,
        reps: normalized.reps,
        logged_by: input.loggedBy,
      })
      .select('*')
      .single();

    if (error || !data) throw new Error(error?.message ?? 'Failed to add set.');
    const r = data as SetRow;
    await this.refresh();
    return {
      id: r.id,
      sessionId: r.session_id,
      lifterId: r.lifter_id,
      exerciseId: r.exercise_id,
      pullupMode: r.pullup_mode,
      weightKg: r.weight_kg === null ? null : Number(r.weight_kg),
      reps: r.reps,
      loggedBy: r.logged_by,
      createdAt: r.created_at,
    };
  }

  async updateSet(setId: string, patch: UpdateSetPatch): Promise<WorkoutSet> {
    const existing = this.snapshot.sets.find((s) => s.id === setId);
    if (!existing) throw new Error('Set not found.');
    const exercise = this.snapshot.exercises.find((e) => e.id === existing.exerciseId);
    if (!exercise) throw new Error('Exercise not found.');

    const normalized = normalizeAndValidateSet(exercise, {
      pullupMode: patch.pullupMode !== undefined ? patch.pullupMode : existing.pullupMode,
      weightKg: patch.weightKg !== undefined ? patch.weightKg : existing.weightKg,
      reps: patch.reps,
    });

    const { data, error } = await this.client
      .from('workout_sets')
      .update({
        pullup_mode: normalized.pullupMode,
        weight_kg: normalized.weightKg,
        reps: normalized.reps,
      })
      .eq('id', setId)
      .select('*')
      .single();

    if (error || !data) throw new Error(error?.message ?? 'Failed to update set.');
    const r = data as SetRow;
    await this.refresh();
    return {
      id: r.id,
      sessionId: r.session_id,
      lifterId: r.lifter_id,
      exerciseId: r.exercise_id,
      pullupMode: r.pullup_mode,
      weightKg: r.weight_kg === null ? null : Number(r.weight_kg),
      reps: r.reps,
      loggedBy: r.logged_by,
      createdAt: r.created_at,
    };
  }

  async deleteSet(setId: string): Promise<void> {
    const { error } = await this.client.from('workout_sets').delete().eq('id', setId);
    if (error) throw new Error(error.message);
    await this.refresh();
  }

  async addLifter(input: { name: string; avatarColor: string }): Promise<Lifter> {
    const trimmed = input.name.trim();
    if (!trimmed) throw new Error('Enter a name for the new user.');

    const { data, error } = await this.client
      .from('lifters')
      .insert({
        name: trimmed,
        avatar_color: input.avatarColor || '#10b981',
        is_admin: false,
      })
      .select('*')
      .single();

    if (error || !data) throw new Error(error?.message ?? 'Failed to add user.');
    const r = data as LifterRow;
    await this.refresh();
    return {
      id: r.id,
      name: r.name,
      avatarColor: r.avatar_color,
      isAdmin: r.is_admin,
      createdAt: r.created_at,
    };
  }

  async deleteLifter(targetLifterId: string, actingLifterId: string): Promise<void> {
    const { error } = await this.client.rpc('admin_delete_lifter', {
      target_lifter_id: targetLifterId,
      acting_lifter_id: actingLifterId,
    });
    if (error) throw new Error(error.message);
    await this.refresh();
  }

  async addExercise(input: { name: string; category: ExerciseCategory }): Promise<Exercise> {
    const trimmed = input.name.trim();
    if (!trimmed) throw new Error('Enter an exercise name.');
    const maxSort = this.snapshot.exercises.reduce((m, e) => Math.max(m, e.sortOrder), 0);

    const { data, error } = await this.client
      .from('exercises')
      .insert({
        name: trimmed,
        category: input.category,
        is_builtin: false,
        sort_order: maxSort + 1,
      })
      .select('*')
      .single();

    if (error || !data) throw new Error(error?.message ?? 'Failed to add exercise.');
    const r = data as ExerciseRow;
    await this.refresh();
    return {
      id: r.id,
      name: r.name,
      category: r.category,
      isBuiltin: r.is_builtin,
      sortOrder: r.sort_order,
      createdAt: r.created_at,
    };
  }

  async deleteExercise(targetExerciseId: string, actingLifterId: string): Promise<void> {
    const { error } = await this.client.rpc('admin_delete_exercise', {
      target_exercise_id: targetExerciseId,
      acting_lifter_id: actingLifterId,
    });
    if (error) throw new Error(error.message);
    await this.refresh();
  }

  async verifyAdminPin(pin: string): Promise<boolean> {
    const { data, error } = await this.client.rpc('verify_admin_pin', { pin_input: pin.trim() });
    if (error) {
      return verifyAdminPinHash(pin);
    }
    return Boolean(data);
  }

  dispose(): void {
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
      this.refreshTimer = null;
    }
    if (this.channel) {
      void this.client.removeChannel(this.channel);
      this.channel = null;
    }
    this.listeners.clear();
  }
}
