import type {
  Exercise,
  PullupMode,
  WorkoutSession,
  WorkoutSet,
} from '../types/models';
import { localizeExerciseName } from './finnish';

export interface NormalizedSetFields {
  pullupMode: PullupMode | null;
  weightKg: number | null;
  reps: number;
}

export function normalizeAndValidateSet(
  exercise: Exercise,
  raw: { pullupMode?: PullupMode | null; weightKg?: number | null; reps: number },
): NormalizedSetFields {
  const reps = Math.round(Number(raw.reps));
  if (!Number.isFinite(reps) || reps < 1 || reps > 20) {
    throw new Error('Toistojen määrän on oltava välillä 1–20.');
  }

  if (exercise.category === 'pullup') {
    const mode: PullupMode = raw.pullupMode ?? 'bodyweight';
    if (mode !== 'assisted' && mode !== 'bodyweight' && mode !== 'weighted') {
      throw new Error('Virheellinen leuanvetotapa.');
    }
    if (mode === 'assisted' || mode === 'bodyweight') {
      if (raw.weightKg !== undefined && raw.weightKg !== null && Number(raw.weightKg) < 0) {
        throw new Error('Leuanvedossa ei käytetä negatiivisia painoja. Valitse sen sijaan Kuminauha.');
      }
      return { pullupMode: mode, weightKg: null, reps };
    }
    const weight = Number(raw.weightKg ?? 0);
    if (!Number.isFinite(weight) || weight < 0) {
      throw new Error('Lisäpainon on oltava vähintään 0 kg (ei negatiivisia painoja).');
    }
    return {
      pullupMode: 'weighted',
      weightKg: Math.round(weight * 100) / 100,
      reps,
    };
  }

  if (exercise.category === 'bodyweight') {
    return { pullupMode: null, weightKg: null, reps };
  }

  const weight = Number(raw.weightKg ?? 0);
  if (!Number.isFinite(weight) || weight < 0) {
    throw new Error('Painon on oltava vähintään 0 kg.');
  }

  return {
    pullupMode: null,
    weightKg: Math.round(weight * 100) / 100,
    reps,
  };
}

export function formatWeightNumber(kg: number): string {
  return Number.isInteger(kg) ? String(kg) : kg.toFixed(2).replace(/\.?0+$/, '');
}

export function formatSetLoad(set: WorkoutSet, exercise?: Exercise): string {
  if (exercise?.category === 'pullup' || set.pullupMode) {
    const mode = set.pullupMode ?? 'bodyweight';
    if (mode === 'assisted') return 'Kuminauha';
    if (mode === 'bodyweight') return 'Kehonpaino';
    const kg = set.weightKg ?? 0;
    return `+${formatWeightNumber(kg)} kg`;
  }

  if (exercise?.category === 'bodyweight' || set.weightKg === null) {
    return 'Kehonpaino';
  }

  const unitSuffix = exercise?.category === 'dumbbell' ? 'kg / kp' : 'kg';
  return `${formatWeightNumber(set.weightKg)} ${unitSuffix}`;
}

export function formatSetSummary(set: WorkoutSet, exercise?: Exercise): string {
  return `${formatSetLoad(set, exercise)} × ${set.reps}`;
}

export function estimateOneRepMax(weightKg: number, reps: number): number {
  if (weightKg <= 0) return 0;
  if (reps <= 1) return Math.round(weightKg * 10) / 10;
  return Math.round(weightKg * (1 + reps / 30) * 10) / 10;
}

export function getLastLoggedSetForLifterExercise(
  sets: WorkoutSet[],
  lifterId: string,
  exerciseId: string,
  exercises?: Exercise[],
  sessions?: WorkoutSession[],
): WorkoutSet | undefined {
  const deletedSessionIds = sessions
    ? new Set(sessions.filter((s) => Boolean(s.deletedAt)).map((s) => s.id))
    : null;

  let matchingExerciseIds: Set<string> | null = null;
  if (exercises && exercises.length > 0) {
    const target = exercises.find((e) => e.id === exerciseId);
    if (target) {
      const targetName = localizeExerciseName(target.name).toLowerCase();
      matchingExerciseIds = new Set(
        exercises
          .filter(
            (e) =>
              e.id === exerciseId ||
              localizeExerciseName(e.name).toLowerCase() === targetName,
          )
          .map((e) => e.id),
      );
    }
  }

  let latest: WorkoutSet | undefined;
  let latestTime = -Infinity;
  for (const s of sets) {
    if (s.lifterId !== lifterId) continue;
    if (deletedSessionIds?.has(s.sessionId)) continue;
    const matchesExercise = matchingExerciseIds
      ? matchingExerciseIds.has(s.exerciseId)
      : s.exerciseId === exerciseId;
    if (!matchesExercise) continue;

    const parsed = Date.parse(s.createdAt);
    const t = Number.isNaN(parsed) ? 0 : parsed;
    if (t >= latestTime) {
      latestTime = t;
      latest = s;
    }
  }
  return latest;
}

export type WeightedProgressMetric = 'topWeight' | 'e1rm';

export interface ProgressionPoint {
  sessionDate: string;
  value: number;
  detailLabel: string;
}

export interface LifterPersonalRecord {
  lifterId: string;
  bestValue: number;
  unit: string;
  bestSetLabel: string;
  sessionDate: string;
  totalSets: number;
}

export function computeProgressionByLifter(params: {
  sessions: WorkoutSession[];
  sets: WorkoutSet[];
  exercise: Exercise;
  lifterIds: string[];
  pullupMode?: PullupMode;
  weightedMetric?: WeightedProgressMetric;
}): {
  seriesByLifter: Record<string, ProgressionPoint[]>;
  prsByLifter: Record<string, LifterPersonalRecord | null>;
  yAxisUnit: string;
} {
  const {
    sessions,
    sets,
    exercise,
    lifterIds,
    pullupMode = 'bodyweight',
    weightedMetric = 'topWeight',
  } = params;

  const visibleSessions = sessions.filter((s) => !s.deletedAt);
  const sessionMap = new Map(visibleSessions.map((s) => [s.id, s]));
  const seriesByLifter: Record<string, ProgressionPoint[]> = {};
  const prsByLifter: Record<string, LifterPersonalRecord | null> = {};

  let yAxisUnit = 'kg';
  if (exercise.category === 'pullup') {
    yAxisUnit = pullupMode === 'weighted' ? '+kg' : 'toistoa';
  } else if (exercise.category === 'bodyweight') {
    yAxisUnit = 'toistoa';
  }

  for (const lifterId of lifterIds) {
    const matchingSets = sets.filter((s) => {
      if (s.lifterId !== lifterId || s.exerciseId !== exercise.id) return false;
      if (!sessionMap.has(s.sessionId)) return false;
      if (exercise.category === 'pullup') {
        return (s.pullupMode ?? 'bodyweight') === pullupMode;
      }
      return true;
    });

    const byDate = new Map<string, ProgressionPoint>();
    let bestPr: LifterPersonalRecord | null = null;

    for (const s of matchingSets) {
      const session = sessionMap.get(s.sessionId)!;
      const date = session.sessionDate;

      let value = 0;
      let detailLabel = '';

      if (exercise.category === 'pullup') {
        if (pullupMode === 'assisted' || pullupMode === 'bodyweight') {
          value = s.reps;
          detailLabel = `${s.reps} ${s.reps === 1 ? 'toisto' : 'toistoa'}`;
        } else {
          const w = s.weightKg ?? 0;
          value = weightedMetric === 'e1rm' ? estimateOneRepMax(w, s.reps) : w;
          detailLabel = `+${formatWeightNumber(w)} kg × ${s.reps}`;
        }
      } else if (exercise.category === 'bodyweight') {
        value = s.reps;
        detailLabel = `${s.reps} ${s.reps === 1 ? 'toisto' : 'toistoa'}`;
      } else {
        const w = s.weightKg ?? 0;
        value = weightedMetric === 'e1rm' ? estimateOneRepMax(w, s.reps) : w;
        detailLabel = `${formatSetSummary(s, exercise)}`;
      }

      const existingForDate = byDate.get(date);
      if (!existingForDate || value > existingForDate.value) {
        byDate.set(date, { sessionDate: date, value, detailLabel });
      }

      if (!bestPr || value > bestPr.bestValue) {
        bestPr = {
          lifterId,
          bestValue: value,
          unit: yAxisUnit,
          bestSetLabel: detailLabel,
          sessionDate: date,
          totalSets: matchingSets.length,
        };
      } else {
        bestPr.totalSets = matchingSets.length;
      }
    }

    const sortedPoints = Array.from(byDate.values()).sort((a, b) =>
      a.sessionDate.localeCompare(b.sessionDate),
    );
    seriesByLifter[lifterId] = sortedPoints;
    prsByLifter[lifterId] = bestPr;
  }

  return { seriesByLifter, prsByLifter, yAxisUnit };
}
