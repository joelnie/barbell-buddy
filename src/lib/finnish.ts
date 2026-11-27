import type { Exercise } from '../types/models';

export const FINNISH_HERO_PHRASE_TEMPLATES: readonly string[] = [
  'Valmiina treenaamaan, <user>?',
  'Näytä niille, <user>!',
  '<user>, tänään liikkuu rauta!',
  'Sohva voi odottaa, tanko ei.',
  'Ensin treeni, sitten herkku.',
  'Jalkapäivää ei skipata, piste.',
  'Painovoima on tänään vain ehdotus.',
  'Peili kiittää myöhemmin.',
  'Hiki on rasvan itkua.',
  'Vähemmän puhetta, enemmän rautaa!',
  'Tänään rikotaan ennätyksiä, ei lupauksia.',
  'Selitykset jäävät pukuhuoneeseen.',
  'Maitohapot ovat vain hauiksen halauksia.',
  'Lihakset eivät kasva Netflixiä katsomalla.',
  'Huomisen sinä kiittää tätä päivää.',
  'Kroppa valittaa, sinä et kuuntele.',
  'Proteiinipirtelö pitää ansaita!',
  'Pumppi päälle, maailma odottakoon.',
  'Tanko on yksinäinen, mene moikkaamaan!',
  'Tänään kyykätään, huomenna ontutaan.',
  'Ole se, jota levytangot pelkäävät.',
  'Ei se paino itsestään nouse!',
];

export function formatHeroPhrase(template: string, userName: string): string {
  return template.replace(/<user>/g, userName);
}

export function pickRandomHeroPhraseTemplate(
  excludeTemplate?: string,
  randomFn: () => number = Math.random,
): string {
  const pool =
    excludeTemplate && FINNISH_HERO_PHRASE_TEMPLATES.length > 1
      ? FINNISH_HERO_PHRASE_TEMPLATES.filter((item) => item !== excludeTemplate)
      : FINNISH_HERO_PHRASE_TEMPLATES;
  const idx = Math.max(0, Math.min(pool.length - 1, Math.floor(randomFn() * pool.length)));
  return pool[idx];
}

const BUILTIN_EXERCISE_TRANSLATIONS: Record<string, string> = {
  'pull-ups': 'Leuanveto',
  pullups: 'Leuanveto',
  leuanveto: 'Leuanveto',
  'bench press': 'Penkkipunnerrus',
  penkkipunnerrus: 'Penkkipunnerrus',
  'incline dumbbell bench press': 'Vinopenkki käsipainoilla',
  'vinopenkki käsipainoilla': 'Vinopenkki käsipainoilla',
  deadlift: 'Maastaveto',
  maastaveto: 'Maastaveto',
  squat: 'Kyykky',
  kyykky: 'Kyykky',
};

export function localizeExerciseName(name: string): string {
  const key = name.trim().toLowerCase();
  return BUILTIN_EXERCISE_TRANSLATIONS[key] ?? name.trim();
}

export function localizeExercise(exercise: Exercise): Exercise {
  const localizedName = localizeExerciseName(exercise.name);
  if (localizedName === exercise.name) return exercise;
  return {
    ...exercise,
    name: localizedName,
  };
}

export function compareExercisesAlphabetically(
  a: Pick<Exercise, 'id' | 'name'>,
  b: Pick<Exercise, 'id' | 'name'>,
): number {
  return (
    a.name.localeCompare(b.name, 'fi', { sensitivity: 'base' }) ||
    a.id.localeCompare(b.id)
  );
}

export function sortExercisesAlphabetically<T extends Pick<Exercise, 'id' | 'name'>>(
  exercises: readonly T[],
): T[] {
  return [...exercises].sort(compareExercisesAlphabetically);
}

type ExerciseIdentity = Pick<Exercise, 'id' | 'name'> &
  Partial<Pick<Exercise, 'isBuiltin' | 'sortOrder'>>;

export function isBenchPressExercise(exercise: ExerciseIdentity): boolean {
  const norm = exercise.name.trim().toLowerCase();
  return (
    exercise.id === 'ex-bench-press' ||
    Boolean(exercise.isBuiltin && exercise.sortOrder === 2) ||
    norm === 'penkki' ||
    norm === 'bench press' ||
    norm === 'penkkipunnerrus'
  );
}

export function findDefaultSessionExercise<T extends ExerciseIdentity>(
  exercises: readonly T[],
): T | undefined {
  if (exercises.length === 0) return undefined;
  return (
    exercises.find((e) => e.name.trim().toLowerCase() === 'penkki') ??
    exercises.find((e) => {
      const norm = e.name.trim().toLowerCase();
      return norm === 'penkkipunnerrus' || norm === 'bench press';
    }) ??
    exercises.find((e) => isBenchPressExercise(e)) ??
    exercises[0]
  );
}

export function isSquatExercise(exercise: ExerciseIdentity): boolean {
  const norm = exercise.name.trim().toLowerCase();
  return (
    exercise.id === 'ex-squat' ||
    Boolean(exercise.isBuiltin && exercise.sortOrder === 5) ||
    norm === 'squat' ||
    norm === 'kyykky'
  );
}

export function isDeadliftExercise(exercise: ExerciseIdentity): boolean {
  const norm = exercise.name.trim().toLowerCase();
  return (
    exercise.id === 'ex-deadlift' ||
    Boolean(exercise.isBuiltin && exercise.sortOrder === 4) ||
    norm === 'deadlift' ||
    norm === 'maastaveto'
  );
}

export function isInclineDumbbellBenchExercise(exercise: ExerciseIdentity): boolean {
  const norm = exercise.name.trim().toLowerCase();
  return (
    exercise.id === 'ex-incline-db-bench' ||
    Boolean(exercise.isBuiltin && exercise.sortOrder === 3) ||
    norm === 'incline dumbbell bench press' ||
    norm === 'vinopenkki käsipainoilla'
  );
}
