import type { Exercise, Lifter } from '../types/models';

export const STARTER_LIFTERS: Lifter[] = [
  {
    id: 'lifter-julie',
    name: 'Julie',
    avatarColor: '#ec4899',
    isAdmin: false,
    createdAt: '2026-01-01T08:00:00.000Z',
  },
  {
    id: 'lifter-joel',
    name: 'Joel',
    avatarColor: '#10b981',
    isAdmin: true,
    createdAt: '2026-01-01T08:00:01.000Z',
  },
  {
    id: 'lifter-leevi',
    name: 'Leevi',
    avatarColor: '#3b82f6',
    isAdmin: false,
    createdAt: '2026-01-01T08:00:02.000Z',
  },
  {
    id: 'lifter-tuomas',
    name: 'Tuomas',
    avatarColor: '#f59e0b',
    isAdmin: false,
    createdAt: '2026-01-01T08:00:03.000Z',
  },
];

export const STARTER_EXERCISES: Exercise[] = [
  {
    id: 'ex-pullups',
    name: 'Leuanveto',
    category: 'pullup',
    isBuiltin: true,
    sortOrder: 1,
    createdAt: '2026-01-01T08:00:00.000Z',
  },
  {
    id: 'ex-bench-press',
    name: 'Penkkipunnerrus',
    category: 'barbell',
    isBuiltin: true,
    sortOrder: 2,
    createdAt: '2026-01-01T08:00:01.000Z',
  },
  {
    id: 'ex-incline-db-bench',
    name: 'Vinopenkki käsipainoilla',
    category: 'dumbbell',
    isBuiltin: true,
    sortOrder: 3,
    createdAt: '2026-01-01T08:00:02.000Z',
  },
  {
    id: 'ex-deadlift',
    name: 'Maastaveto',
    category: 'barbell',
    isBuiltin: true,
    sortOrder: 4,
    createdAt: '2026-01-01T08:00:03.000Z',
  },
  {
    id: 'ex-squat',
    name: 'Kyykky',
    category: 'barbell',
    isBuiltin: true,
    sortOrder: 5,
    createdAt: '2026-01-01T08:00:04.000Z',
  },
];

export const AVATAR_COLOR_SWATCHES = [
  '#f43f5e',
  '#10b981',
  '#3b82f6',
  '#f59e0b',
  '#a855f7',
  '#06b6d4',
  '#ec4899',
  '#84cc16',
];
