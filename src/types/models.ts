export type ExerciseCategory = 'pullup' | 'barbell' | 'dumbbell' | 'bodyweight' | 'machine';

export type PullupMode = 'assisted' | 'bodyweight' | 'weighted';

export type SessionStatus = 'active' | 'completed';

export type ThemeMode = 'dark' | 'light' | 'pink';

export type SecondaryAccent =
  | 'neon-green'
  | 'turquoise'
  | 'bright-orange'
  | 'electric-blue'
  | 'vivid-purple';

export type AppTab = 'session' | 'history' | 'progress' | 'settings';

export interface Lifter {
  id: string;
  name: string;
  avatarColor: string;
  isAdmin: boolean;
  createdAt: string;
}

export interface Exercise {
  id: string;
  name: string;
  category: ExerciseCategory;
  isBuiltin: boolean;
  sortOrder: number;
  createdAt: string;
}

export interface WorkoutSession {
  id: string;
  sessionDate: string; // YYYY-MM-DD (serves as the session name)
  status: SessionStatus;
  createdBy: string | null;
  participantIds: string[];
  startedAt: string;
  endedAt: string | null;
  expiresAt: string; // 23:59:59.999 local time on sessionDate
}

export interface WorkoutSet {
  id: string;
  sessionId: string;
  lifterId: string;
  exerciseId: string;
  pullupMode: PullupMode | null;
  weightKg: number | null; // null for assisted/bodyweight pull-ups & bodyweight exercises; >= 0 otherwise
  reps: number;
  loggedBy: string | null;
  createdAt: string;
}

export interface StoreSnapshot {
  lifters: Lifter[];
  exercises: Exercise[];
  sessions: WorkoutSession[];
  sets: WorkoutSet[];
  syncStatus: 'synced' | 'syncing' | 'offline';
  mode: 'supabase' | 'local';
  authRequired: boolean;
  crewEmail?: string;
}

export interface CreateSessionInput {
  createdBy: string;
  participantIds: string[];
  sessionDate?: string;
  now?: Date;
}

export interface AddSetInput {
  sessionId: string;
  lifterId: string;
  exerciseId: string;
  pullupMode?: PullupMode | null;
  weightKg?: number | null;
  reps: number;
  loggedBy: string | null;
}

export interface UpdateSetPatch {
  pullupMode?: PullupMode | null;
  weightKg?: number | null;
  reps: number;
}

export interface DataStore {
  getSnapshot(): StoreSnapshot;
  subscribe(listener: () => void): () => void;
  initialize(): Promise<void>;
  refresh(now?: Date): Promise<void>;
  sweepExpiredSessions(now?: Date): Promise<number>;
  signInCrew?(password: string, emailOverride?: string): Promise<void>;
  signOutCrew?(): Promise<void>;
  createSession(input: CreateSessionInput): Promise<WorkoutSession>;
  addParticipantToSession(sessionId: string, lifterId: string, now?: Date): Promise<void>;
  endSession(sessionId: string, now?: Date): Promise<void>;
  addSet(input: AddSetInput): Promise<WorkoutSet>;
  updateSet(setId: string, patch: UpdateSetPatch): Promise<WorkoutSet>;
  deleteSet(setId: string): Promise<void>;
  addLifter(input: { name: string; avatarColor: string }): Promise<Lifter>;
  deleteLifter(targetLifterId: string, actingLifterId: string): Promise<void>;
  addExercise(input: { name: string; category: ExerciseCategory }): Promise<Exercise>;
  deleteExercise(targetExerciseId: string, actingLifterId: string): Promise<void>;
  verifyAdminPin(pin: string): Promise<boolean>;
  dispose(): void;
}
