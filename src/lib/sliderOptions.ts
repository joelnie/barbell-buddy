import type { Exercise, PullupMode, WorkoutSet } from '../types/models';
import { formatWeightNumber } from './metrics';

export type RawWeightOption = 'Assisted' | 'Bodyweight' | number;

export interface SliderStop {
  key: string;
  rawValue: RawWeightOption;
  primaryLabel: string;
  secondaryLabel: string;
  tickLabel: string;
  ariaValueText: string;
}

export function generateLinearStops(min: number, max: number, step: number): number[] {
  const stops: number[] = [];
  const count = Math.round((max - min) / step);
  for (let i = 0; i <= count; i++) {
    const val = Math.round((min + i * step) * 100) / 100;
    stops.push(val);
  }
  return stops;
}

export const REPS_RAW_OPTIONS: readonly number[] = generateLinearStops(1, 30, 1);

export const PULLUP_RAW_WEIGHT_OPTIONS: readonly RawWeightOption[] = [
  'Assisted',
  'Bodyweight',
  ...generateLinearStops(2.5, 30, 2.5),
];

export const BENCH_PRESS_RAW_WEIGHT_OPTIONS: readonly number[] = generateLinearStops(20, 120, 2.5);

export const SQUAT_RAW_WEIGHT_OPTIONS: readonly number[] = generateLinearStops(20, 150, 2.5);

export const DEADLIFT_RAW_WEIGHT_OPTIONS: readonly number[] = generateLinearStops(25, 180, 2.5);

export const DUMBBELL_RAW_WEIGHT_OPTIONS: readonly number[] = [
  8, 9, 10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 30, 32, 34, 36, 38, 40,
];

export const CUSTOM_BARBELL_RAW_WEIGHT_OPTIONS: readonly number[] = generateLinearStops(
  20,
  140,
  2.5,
);

export const MACHINE_RAW_WEIGHT_OPTIONS: readonly number[] = generateLinearStops(5, 120, 2.5);

export function getRepsSliderStops(): SliderStop[] {
  return REPS_RAW_OPTIONS.map((rep) => ({
    key: `rep-${rep}`,
    rawValue: rep,
    primaryLabel: String(rep),
    secondaryLabel: rep === 1 ? 'rep' : 'reps',
    tickLabel: String(rep),
    ariaValueText: `${rep} ${rep === 1 ? 'rep' : 'reps'}`,
  }));
}

export function getRawWeightOptionsForExercise(exercise: Exercise): readonly RawWeightOption[] {
  if (exercise.category === 'pullup') {
    return PULLUP_RAW_WEIGHT_OPTIONS;
  }

  if (exercise.category === 'dumbbell') {
    return DUMBBELL_RAW_WEIGHT_OPTIONS;
  }

  if (exercise.category === 'bodyweight') {
    return ['Bodyweight'];
  }

  const normalizedName = exercise.name.trim().toLowerCase();

  if (exercise.id === 'ex-bench-press' || normalizedName === 'bench press') {
    return BENCH_PRESS_RAW_WEIGHT_OPTIONS;
  }

  if (exercise.id === 'ex-squat' || normalizedName === 'squat') {
    return SQUAT_RAW_WEIGHT_OPTIONS;
  }

  if (exercise.id === 'ex-deadlift' || normalizedName === 'deadlift') {
    return DEADLIFT_RAW_WEIGHT_OPTIONS;
  }

  if (exercise.category === 'machine') {
    return MACHINE_RAW_WEIGHT_OPTIONS;
  }

  return CUSTOM_BARBELL_RAW_WEIGHT_OPTIONS;
}

export function getWeightSliderStopsForExercise(exercise: Exercise): SliderStop[] {
  const rawOptions = getRawWeightOptionsForExercise(exercise);

  return rawOptions.map((opt) => {
    if (opt === 'Assisted') {
      return {
        key: 'assisted',
        rawValue: 'Assisted',
        primaryLabel: 'Assisted',
        secondaryLabel: 'reps only',
        tickLabel: 'Asst',
        ariaValueText: 'Assisted',
      };
    }

    if (opt === 'Bodyweight') {
      return {
        key: 'bodyweight',
        rawValue: 'Bodyweight',
        primaryLabel: 'Bodyweight',
        secondaryLabel: 'reps only',
        tickLabel: 'BW',
        ariaValueText: 'Bodyweight',
      };
    }

    const formatted = formatWeightNumber(opt);

    if (exercise.category === 'pullup') {
      return {
        key: `plus-${formatted}`,
        rawValue: opt,
        primaryLabel: `+${formatted}`,
        secondaryLabel: 'kg added',
        tickLabel: `+${formatted}`,
        ariaValueText: `+${formatted} kg`,
      };
    }

    if (exercise.category === 'dumbbell') {
      return {
        key: `db-${formatted}`,
        rawValue: opt,
        primaryLabel: formatted,
        secondaryLabel: 'kg / DB',
        tickLabel: `${formatted}`,
        ariaValueText: `${formatted} kg per dumbbell`,
      };
    }

    return {
      key: `kg-${formatted}`,
      rawValue: opt,
      primaryLabel: formatted,
      secondaryLabel: 'kg',
      tickLabel: `${formatted}`,
      ariaValueText: `${formatted} kg`,
    };
  });
}

export function mapWeightStopToSetPayload(
  exercise: Exercise,
  stop: SliderStop,
): { pullupMode: PullupMode | null; weightKg: number | null } {
  if (exercise.category === 'pullup') {
    if (stop.rawValue === 'Assisted') {
      return { pullupMode: 'assisted', weightKg: null };
    }
    if (stop.rawValue === 'Bodyweight') {
      return { pullupMode: 'bodyweight', weightKg: null };
    }
    return { pullupMode: 'weighted', weightKg: stop.rawValue };
  }

  if (exercise.category === 'bodyweight' || stop.rawValue === 'Bodyweight' || stop.rawValue === 'Assisted') {
    return { pullupMode: null, weightKg: null };
  }

  return { pullupMode: null, weightKg: stop.rawValue };
}

function findNearestNumericStopIndex(stops: readonly SliderStop[], targetKg: number): number {
  let bestIdx = 0;
  let bestDist = Infinity;

  stops.forEach((stop, idx) => {
    if (typeof stop.rawValue !== 'number') return;
    const dist = Math.abs(stop.rawValue - targetKg);
    if (dist < bestDist) {
      bestDist = dist;
      bestIdx = idx;
    }
  });

  return bestIdx;
}

export function resolveInitialRepsIndex(exercise: Exercise, lastSet?: WorkoutSet): number {
  const defaultReps =
    exercise.category === 'pullup'
      ? 8
      : exercise.category === 'barbell'
        ? 6
        : 10;

  const targetReps = lastSet ? Math.round(lastSet.reps) : defaultReps;
  const clamped = Math.max(1, Math.min(30, targetReps));
  return clamped - 1;
}

export function resolveInitialWeightIndex(
  exercise: Exercise,
  stops: readonly SliderStop[],
  lastSet?: WorkoutSet,
): number {
  if (stops.length <= 1) return 0;

  if (exercise.category === 'pullup') {
    if (!lastSet) {
      const bwIdx = stops.findIndex((s) => s.rawValue === 'Bodyweight');
      return bwIdx >= 0 ? bwIdx : 0;
    }
    if (lastSet.pullupMode === 'assisted') {
      const idx = stops.findIndex((s) => s.rawValue === 'Assisted');
      return idx >= 0 ? idx : 0;
    }
    if (lastSet.pullupMode === 'bodyweight' || !lastSet.weightKg || lastSet.weightKg <= 0) {
      const idx = stops.findIndex((s) => s.rawValue === 'Bodyweight');
      return idx >= 0 ? idx : 0;
    }
    return findNearestNumericStopIndex(stops, lastSet.weightKg);
  }

  if (exercise.category === 'bodyweight') {
    return 0;
  }

  if (lastSet && lastSet.weightKg !== null) {
    return findNearestNumericStopIndex(stops, lastSet.weightKg);
  }

  const normalizedName = exercise.name.trim().toLowerCase();
  let defaultKg = 40;
  if (exercise.category === 'dumbbell') {
    defaultKg = 18;
  } else if (exercise.category === 'machine') {
    defaultKg = 35;
  } else if (exercise.id === 'ex-deadlift' || normalizedName === 'deadlift') {
    defaultKg = 80;
  } else if (exercise.id === 'ex-squat' || normalizedName === 'squat') {
    defaultKg = 60;
  } else if (exercise.id === 'ex-bench-press' || normalizedName === 'bench press') {
    defaultKg = 60;
  }

  return findNearestNumericStopIndex(stops, defaultKg);
}
