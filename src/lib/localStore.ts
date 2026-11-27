import type {
  AddSetInput,
  CreateSessionInput,
  DataStore,
  Exercise,
  ExerciseCategory,
  Lifter,
  StoreSnapshot,
  UpdateSetPatch,
  WorkoutSession,
  WorkoutSet,
} from '../types/models';
import { verifyAdminPinHash } from './adminAuth';
import { computeSessionExpiryIso, formatLocalDate, isSessionActiveAt } from './dates';
import { localizeExercise, localizeExerciseName } from './finnish';
import { normalizeAndValidateSet } from './metrics';
import { STARTER_EXERCISES, STARTER_LIFTERS } from './seedData';

const DEFAULT_STORAGE_KEY = 'bb_local_store_v1';
const DEFAULT_CHANNEL_NAME = 'barbell-buddy-sync-v1';

interface PersistedLocalData {
  lifters: Lifter[];
  exercises: Exercise[];
  sessions: WorkoutSession[];
  sets: WorkoutSet[];
  migratedV2?: boolean;
  migratedV3?: boolean;
}

function generateId(prefix: string): string {
  if (typeof globalThis.crypto !== 'undefined' && typeof globalThis.crypto.randomUUID === 'function') {
    return `${prefix}-${globalThis.crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

function createInitialPersistedData(): PersistedLocalData {
  return {
    lifters: STARTER_LIFTERS.map((l) => ({ ...l, deletedAt: null })),
    exercises: STARTER_EXERCISES.map((e) => ({ ...e, deletedAt: null })),
    sessions: [],
    sets: [],
    migratedV2: true,
    migratedV3: true,
  };
}

export interface LocalStoreOptions {
  storageKey?: string;
  channelName?: string;
}

export class LocalRealtimeStore implements DataStore {
  private readonly storageKey: string;
  private readonly channelName: string;
  private readonly instanceId: string;
  private channel: BroadcastChannel | null = null;
  private listeners = new Set<() => void>();
  private snapshot: StoreSnapshot;
  private storageHandler: ((e: StorageEvent) => void) | null = null;

  constructor(options: LocalStoreOptions = {}) {
    this.storageKey = options.storageKey ?? DEFAULT_STORAGE_KEY;
    this.channelName = options.channelName ?? DEFAULT_CHANNEL_NAME;
    this.instanceId = generateId('inst');
    const data = this.readFromStorage();
    this.snapshot = this.buildSnapshot(data);
  }

  private readFromStorage(): PersistedLocalData {
    try {
      const raw = localStorage.getItem(this.storageKey);
      if (!raw) {
        const seeded = createInitialPersistedData();
        localStorage.setItem(this.storageKey, JSON.stringify(seeded));
        return seeded;
      }
      const parsed = JSON.parse(raw) as Partial<PersistedLocalData>;
      let lifters =
        Array.isArray(parsed.lifters) && parsed.lifters.length > 0
          ? parsed.lifters.map((l) => ({
              ...l,
              avatarColor:
                l.name.trim().toLowerCase() === 'julie' && l.avatarColor === '#f43f5e'
                  ? '#ec4899'
                  : l.avatarColor,
              deletedAt: l.deletedAt ?? null,
            }))
          : createInitialPersistedData().lifters;

      let exercises =
        Array.isArray(parsed.exercises) && parsed.exercises.length > 0
          ? parsed.exercises.map((e) => ({
              ...e,
              deletedAt: e.deletedAt ?? null,
            }))
          : createInitialPersistedData().exercises;

      let migratedV2 = Boolean(parsed.migratedV2);
      let migratedV3 = Boolean(parsed.migratedV3);
      let didMigrate = false;

      if (!migratedV2) {
        if (!lifters.some((l) => l.name.trim().toLowerCase() === 'tuomas')) {
          const tuomasSeed = STARTER_LIFTERS.find((l) => l.id === 'lifter-tuomas');
          if (tuomasSeed) {
            lifters = [...lifters, { ...tuomasSeed, deletedAt: null }];
          }
        }
        migratedV2 = true;
        didMigrate = true;
      }

      if (!migratedV3) {
        exercises = exercises.map((e) =>
          e.name.trim().toLowerCase() === 'yliveto'
            ? { ...e, category: 'dumbbell_single' as const }
            : e,
        );
        migratedV3 = true;
        didMigrate = true;
      }

      const normalizedData: PersistedLocalData = {
        lifters,
        exercises,
        sessions: Array.isArray(parsed.sessions)
          ? parsed.sessions.map((s) => ({ ...s, deletedAt: s.deletedAt ?? null }))
          : [],
        sets: Array.isArray(parsed.sets) ? parsed.sets : [],
        migratedV2,
        migratedV3,
      };

      if (didMigrate) {
        localStorage.setItem(this.storageKey, JSON.stringify(normalizedData));
      }

      return normalizedData;
    } catch {
      return createInitialPersistedData();
    }
  }

  private buildSnapshot(data: PersistedLocalData): StoreSnapshot {
    const activeLifters = data.lifters.filter((l) => !l.deletedAt);
    const activeLifterIds = new Set(activeLifters.map((l) => l.id));

    const sortedExercises = data.exercises
      .filter((e) => !e.deletedAt)
      .map((e) => localizeExercise(e))
      .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, 'fi'));
    const activeExerciseIds = new Set(sortedExercises.map((e) => e.id));

    const sortedSessions = data.sessions
      .map((s) => ({
        ...s,
        participantIds: s.participantIds.filter((id) => activeLifterIds.has(id)),
      }))
      .filter((s) => s.participantIds.length > 0)
      .sort(
        (a, b) => b.sessionDate.localeCompare(a.sessionDate) || b.startedAt.localeCompare(a.startedAt),
      );

    const sortedSets = data.sets
      .filter((s) => activeLifterIds.has(s.lifterId) && activeExerciseIds.has(s.exerciseId))
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

    return {
      lifters: [...activeLifters],
      exercises: sortedExercises,
      sessions: sortedSessions,
      sets: sortedSets,
      syncStatus: 'synced',
      mode: 'local',
      authRequired: false,
    };
  }

  private persistAndBroadcast(data: PersistedLocalData): void {
    localStorage.setItem(this.storageKey, JSON.stringify(data));
    this.snapshot = this.buildSnapshot(data);
    this.emit();
    if (this.channel) {
      try {
        this.channel.postMessage({ senderId: this.instanceId, updatedAt: Date.now() });
      } catch {
        // Ignore closed channel errors
      }
    }
  }

  private emit(): void {
    for (const listener of this.listeners) {
      listener();
    }
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

  async initialize(): Promise<void> {
    if (typeof BroadcastChannel !== 'undefined' && !this.channel) {
      this.channel = new BroadcastChannel(this.channelName);
      this.channel.onmessage = (event: MessageEvent<{ senderId?: string }>) => {
        if (event.data?.senderId === this.instanceId) return;
        const fresh = this.readFromStorage();
        this.snapshot = this.buildSnapshot(fresh);
        this.emit();
      };
    }

    if (typeof window !== 'undefined' && !this.storageHandler) {
      this.storageHandler = (e: StorageEvent) => {
        if (e.key !== this.storageKey) return;
        const fresh = this.readFromStorage();
        this.snapshot = this.buildSnapshot(fresh);
        this.emit();
      };
      window.addEventListener('storage', this.storageHandler);
    }

    await this.sweepExpiredSessions();
  }

  async refresh(now: Date = new Date()): Promise<void> {
    const fresh = this.readFromStorage();
    this.snapshot = this.buildSnapshot(fresh);
    this.emit();
    await this.sweepExpiredSessions(now);
  }

  async sweepExpiredSessions(now: Date = new Date()): Promise<number> {
    const data = this.readFromStorage();
    let sweptCount = 0;

    const updatedSessions = data.sessions.map((session) => {
      if (!session.deletedAt && session.status === 'active' && !isSessionActiveAt(session, now)) {
        sweptCount += 1;
        return {
          ...session,
          status: 'completed' as const,
          endedAt: session.endedAt ?? session.expiresAt,
        };
      }
      return session;
    });

    if (sweptCount > 0) {
      this.persistAndBroadcast({
        ...data,
        sessions: updatedSessions,
      });
    }
    return sweptCount;
  }

  async createSession(input: CreateSessionInput): Promise<WorkoutSession> {
    const now = input.now ?? new Date();
    await this.sweepExpiredSessions(now);
    const data = this.readFromStorage();

    const uniqueParticipants = Array.from(new Set(input.participantIds.filter(Boolean)));
    if (uniqueParticipants.length === 0) {
      throw new Error('Valitse vähintään yksi treenaaja treeniin.');
    }

    for (const pid of uniqueParticipants) {
      if (!data.lifters.some((l) => !l.deletedAt && l.id === pid)) {
        throw new Error('Tuntematon treenaaja valittu.');
      }
      const alreadyActive = data.sessions.find(
        (s) => isSessionActiveAt(s, now) && s.participantIds.includes(pid),
      );
      if (alreadyActive) {
        const lifterName = data.lifters.find((l) => l.id === pid)?.name ?? 'Treenaaja';
        throw new Error(`${lifterName} on jo käynnissä olevassa treenissä.`);
      }
    }

    const sessionDate = input.sessionDate ?? formatLocalDate(now);
    const session: WorkoutSession = {
      id: generateId('sess'),
      sessionDate,
      status: 'active',
      createdBy: input.createdBy,
      participantIds: uniqueParticipants,
      startedAt: now.toISOString(),
      endedAt: null,
      expiresAt: computeSessionExpiryIso(sessionDate),
      deletedAt: null,
    };

    this.persistAndBroadcast({
      ...data,
      sessions: [session, ...data.sessions],
    });

    return session;
  }

  async addParticipantToSession(
    sessionId: string,
    lifterId: string,
    now: Date = new Date(),
  ): Promise<void> {
    await this.sweepExpiredSessions(now);
    const data = this.readFromStorage();
    const target = data.sessions.find((s) => s.id === sessionId);
    if (!target || !isSessionActiveAt(target, now)) {
      throw new Error('Tämä treeni ei ole enää käynnissä.');
    }
    if (!data.lifters.some((l) => !l.deletedAt && l.id === lifterId)) {
      throw new Error('Treenaajaa ei löytynyt.');
    }
    if (target.participantIds.includes(lifterId)) {
      return;
    }

    const conflict = data.sessions.find(
      (s) => s.id !== sessionId && isSessionActiveAt(s, now) && s.participantIds.includes(lifterId),
    );
    if (conflict) {
      const lifterName = data.lifters.find((l) => l.id === lifterId)?.name ?? 'Treenaaja';
      throw new Error(`${lifterName} on jo toisessa käynnissä olevassa treenissä.`);
    }

    const updatedSessions = data.sessions.map((s) =>
      s.id === sessionId ? { ...s, participantIds: [...s.participantIds, lifterId] } : s,
    );

    this.persistAndBroadcast({
      ...data,
      sessions: updatedSessions,
    });
  }

  async endSession(sessionId: string, now: Date = new Date()): Promise<void> {
    const data = this.readFromStorage();
    const target = data.sessions.find((s) => s.id === sessionId);
    if (!target) {
      throw new Error('Treeniä ei löytynyt.');
    }
    if (target.status === 'completed') return;

    const updatedSessions = data.sessions.map((s) =>
      s.id === sessionId
        ? {
            ...s,
            status: 'completed' as const,
            endedAt: now.toISOString(),
          }
        : s,
    );

    this.persistAndBroadcast({
      ...data,
      sessions: updatedSessions,
    });
  }

  async deleteSession(sessionId: string): Promise<void> {
    const data = this.readFromStorage();
    const target = data.sessions.find((s) => s.id === sessionId && !s.deletedAt);
    if (!target) {
      throw new Error('Treeniä ei löytynyt.');
    }

    const nowIso = new Date().toISOString();
    const updatedSessions = data.sessions.map((s) =>
      s.id === sessionId
        ? {
            ...s,
            status: 'completed' as const,
            endedAt: s.endedAt ?? nowIso,
            deletedAt: nowIso,
          }
        : s,
    );

    this.persistAndBroadcast({
      ...data,
      sessions: updatedSessions,
    });
  }

  async restoreSession(sessionId: string, actingLifterId: string): Promise<void> {
    const data = this.readFromStorage();
    const actor = data.lifters.find((l) => !l.deletedAt && l.id === actingLifterId);
    if (!actor?.isAdmin) {
      throw new Error('Vain Joel (ylläpitäjä) voi palauttaa poistettuja treenejä.');
    }

    const target = data.sessions.find((s) => s.id === sessionId);
    if (!target) {
      throw new Error('Treeniä ei löytynyt.');
    }

    const nowIso = new Date().toISOString();
    const updatedSessions = data.sessions.map((s) =>
      s.id === sessionId
        ? {
            ...s,
            status: 'completed' as const,
            endedAt: s.endedAt ?? nowIso,
            deletedAt: null,
          }
        : s,
    );

    this.persistAndBroadcast({
      ...data,
      sessions: updatedSessions,
    });
  }

  async addSet(input: AddSetInput): Promise<WorkoutSet> {
    const data = this.readFromStorage();
    const session = data.sessions.find((s) => s.id === input.sessionId);
    if (!session) {
      throw new Error('Treeniä ei löytynyt.');
    }
    if (!session.participantIds.includes(input.lifterId)) {
      throw new Error('Valittu treenaaja ei ole mukana tässä treenissä.');
    }
    if (input.loggedBy && !session.participantIds.includes(input.loggedBy)) {
      throw new Error('Vain treenin osallistujat voivat lisätä siihen sarjoja.');
    }

    const exercise = data.exercises.find((e) => !e.deletedAt && e.id === input.exerciseId);
    if (!exercise) {
      throw new Error('Liikettä ei löytynyt.');
    }

    const normalized = normalizeAndValidateSet(exercise, {
      pullupMode: input.pullupMode,
      weightKg: input.weightKg,
      reps: input.reps,
    });

    const created: WorkoutSet = {
      id: generateId('set'),
      sessionId: input.sessionId,
      lifterId: input.lifterId,
      exerciseId: input.exerciseId,
      pullupMode: normalized.pullupMode,
      weightKg: normalized.weightKg,
      reps: normalized.reps,
      loggedBy: input.loggedBy,
      createdAt: new Date().toISOString(),
    };

    this.persistAndBroadcast({
      ...data,
      sets: [...data.sets, created],
    });

    return created;
  }

  async updateSet(setId: string, patch: UpdateSetPatch): Promise<WorkoutSet> {
    const data = this.readFromStorage();
    const existing = data.sets.find((s) => s.id === setId);
    if (!existing) {
      throw new Error('Sarjaa ei löytynyt.');
    }
    const exercise = data.exercises.find((e) => e.id === existing.exerciseId);
    if (!exercise) {
      throw new Error('Liikettä ei löytynyt.');
    }

    const normalized = normalizeAndValidateSet(exercise, {
      pullupMode: patch.pullupMode !== undefined ? patch.pullupMode : existing.pullupMode,
      weightKg: patch.weightKg !== undefined ? patch.weightKg : existing.weightKg,
      reps: patch.reps,
    });

    const updated: WorkoutSet = {
      ...existing,
      pullupMode: normalized.pullupMode,
      weightKg: normalized.weightKg,
      reps: normalized.reps,
    };

    this.persistAndBroadcast({
      ...data,
      sets: data.sets.map((s) => (s.id === setId ? updated : s)),
    });

    return updated;
  }

  async deleteSet(setId: string): Promise<void> {
    const data = this.readFromStorage();
    this.persistAndBroadcast({
      ...data,
      sets: data.sets.filter((s) => s.id !== setId),
    });
  }

  async addLifter(input: { name: string; avatarColor: string }): Promise<Lifter> {
    const trimmed = input.name.trim();
    if (!trimmed) {
      throw new Error('Anna uuden käyttäjän nimi.');
    }
    const data = this.readFromStorage();
    const trimmedLower = trimmed.toLowerCase();

    if (
      data.lifters.some(
        (l) => !l.deletedAt && l.name.trim().toLowerCase() === trimmedLower,
      )
    ) {
      throw new Error(`Käyttäjä nimeltä "${trimmed}" on jo olemassa.`);
    }

    const softDeletedMatches = data.lifters
      .filter((l) => Boolean(l.deletedAt) && l.name.trim().toLowerCase() === trimmedLower)
      .sort((a, b) => (b.deletedAt ?? '').localeCompare(a.deletedAt ?? ''));

    if (softDeletedMatches.length > 0) {
      const targetToRestore = softDeletedMatches[0];
      const restored: Lifter = {
        ...targetToRestore,
        name: trimmed,
        avatarColor: input.avatarColor || targetToRestore.avatarColor,
        deletedAt: null,
      };
      this.persistAndBroadcast({
        ...data,
        lifters: data.lifters.map((l) => (l.id === restored.id ? restored : l)),
      });
      return restored;
    }

    const created: Lifter = {
      id: generateId('lifter'),
      name: trimmed,
      avatarColor: input.avatarColor || '#10b981',
      isAdmin: false,
      createdAt: new Date().toISOString(),
      deletedAt: null,
    };

    this.persistAndBroadcast({
      ...data,
      lifters: [...data.lifters, created],
    });

    return created;
  }

  async deleteLifter(targetLifterId: string, actingLifterId: string): Promise<void> {
    const data = this.readFromStorage();
    const actor = data.lifters.find((l) => !l.deletedAt && l.id === actingLifterId);
    if (!actor?.isAdmin) {
      throw new Error('Vain Joel (ylläpitäjä) voi poistaa käyttäjiä.');
    }
    if (targetLifterId === actingLifterId) {
      throw new Error('Joel ei voi poistaa omaa ylläpitäjätiliään.');
    }
    const target = data.lifters.find((l) => !l.deletedAt && l.id === targetLifterId);
    if (!target) {
      throw new Error('Käyttäjää ei löytynyt.');
    }
    if (target.isAdmin) {
      throw new Error('Ylläpitäjää ei voi poistaa.');
    }

    const nowIso = new Date().toISOString();
    this.persistAndBroadcast({
      ...data,
      lifters: data.lifters.map((l) =>
        l.id === targetLifterId ? { ...l, deletedAt: nowIso } : l,
      ),
    });
  }

  async addExercise(input: { name: string; category: ExerciseCategory }): Promise<Exercise> {
    const trimmed = input.name.trim();
    if (!trimmed) {
      throw new Error('Anna liikkeen nimi.');
    }
    const data = this.readFromStorage();
    const localizedTrimmed = localizeExerciseName(trimmed);
    const candidateLower = trimmed.toLowerCase();
    const candidateNormalized = localizedTrimmed.toLowerCase();

    if (
      data.exercises.some(
        (e) =>
          !e.deletedAt &&
          (e.name.trim().toLowerCase() === candidateLower ||
            localizeExerciseName(e.name).toLowerCase() === candidateNormalized),
      )
    ) {
      throw new Error(`Liike "${trimmed}" on jo olemassa.`);
    }

    const softDeletedMatches = data.exercises
      .filter(
        (e) =>
          Boolean(e.deletedAt) &&
          e.category === input.category &&
          (e.name.trim().toLowerCase() === candidateLower ||
            localizeExerciseName(e.name).toLowerCase() === candidateNormalized),
      )
      .sort((a, b) => (b.deletedAt ?? '').localeCompare(a.deletedAt ?? ''));

    if (softDeletedMatches.length > 0) {
      const targetToRestore = softDeletedMatches[0];
      const restored: Exercise = {
        ...targetToRestore,
        name: localizedTrimmed,
        deletedAt: null,
      };
      this.persistAndBroadcast({
        ...data,
        exercises: data.exercises.map((e) => (e.id === restored.id ? restored : e)),
      });
      return localizeExercise(restored);
    }

    const maxSort = data.exercises.reduce((max, e) => Math.max(max, e.sortOrder), 0);
    const created: Exercise = {
      id: generateId('ex'),
      name: localizedTrimmed,
      category: input.category,
      isBuiltin: false,
      sortOrder: maxSort + 1,
      createdAt: new Date().toISOString(),
      deletedAt: null,
    };

    this.persistAndBroadcast({
      ...data,
      exercises: [...data.exercises, created],
    });

    return created;
  }

  async renameExercise(
    targetExerciseId: string,
    newName: string,
    actingLifterId: string,
  ): Promise<Exercise> {
    const data = this.readFromStorage();
    const actor = data.lifters.find((l) => !l.deletedAt && l.id === actingLifterId);
    if (!actor?.isAdmin) {
      throw new Error('Vain Joel (ylläpitäjä) voi muokata liikkeiden nimiä.');
    }

    const trimmed = newName.trim();
    if (!trimmed) {
      throw new Error('Anna liikkeen nimi.');
    }

    const existing = data.exercises.find((e) => !e.deletedAt && e.id === targetExerciseId);
    if (!existing) {
      throw new Error('Liikettä ei löytynyt.');
    }

    const candidateLower = trimmed.toLowerCase();
    if (
      data.exercises.some(
        (e) =>
          !e.deletedAt &&
          e.id !== targetExerciseId &&
          (e.name.trim().toLowerCase() === candidateLower ||
            localizeExerciseName(e.name).toLowerCase() === candidateLower),
      )
    ) {
      throw new Error(`Liike "${trimmed}" on jo olemassa.`);
    }

    const updated: Exercise = {
      ...existing,
      name: trimmed,
    };

    this.persistAndBroadcast({
      ...data,
      exercises: data.exercises.map((e) => (e.id === targetExerciseId ? updated : e)),
    });

    return localizeExercise(updated);
  }

  async deleteExercise(targetExerciseId: string, actingLifterId: string): Promise<void> {
    const data = this.readFromStorage();
    const actor = data.lifters.find((l) => !l.deletedAt && l.id === actingLifterId);
    if (!actor?.isAdmin) {
      throw new Error('Vain Joel (ylläpitäjä) voi poistaa liikkeitä.');
    }
    if (!data.exercises.some((e) => !e.deletedAt && e.id === targetExerciseId)) {
      throw new Error('Liikettä ei löytynyt.');
    }

    const nowIso = new Date().toISOString();
    this.persistAndBroadcast({
      ...data,
      exercises: data.exercises.map((e) =>
        e.id === targetExerciseId ? { ...e, deletedAt: nowIso } : e,
      ),
    });
  }

  async verifyAdminPin(pin: string): Promise<boolean> {
    return verifyAdminPinHash(pin);
  }

  dispose(): void {
    if (this.channel) {
      this.channel.close();
      this.channel = null;
    }
    if (typeof window !== 'undefined' && this.storageHandler) {
      window.removeEventListener('storage', this.storageHandler);
      this.storageHandler = null;
    }
    this.listeners.clear();
  }
}
