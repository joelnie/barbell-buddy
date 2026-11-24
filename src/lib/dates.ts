import type { WorkoutSession } from '../types/models';

export function formatLocalDate(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Computes 23:59:59.999 in local calendar time for a YYYY-MM-DD session date.
 * If "End Session" is not pressed, the session automatically finalizes at 23:59.
 */
export function computeSessionExpiryIso(sessionDate: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(sessionDate);
  if (!match) {
    const fallback = new Date();
    fallback.setHours(23, 59, 59, 999);
    return fallback.toISOString();
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const endOfDay = new Date(year, month - 1, day, 23, 59, 59, 999);
  return endOfDay.toISOString();
}

export function isSessionActiveAt(
  session: Pick<WorkoutSession, 'status' | 'expiresAt'>,
  now: Date = new Date(),
): boolean {
  if (session.status !== 'active') return false;
  return new Date(session.expiresAt).getTime() > now.getTime();
}

export function msUntilExpiry(expiresAtIso: string, now: Date = new Date()): number {
  return Math.max(0, new Date(expiresAtIso).getTime() - now.getTime());
}

export function formatTimeShort(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('fi-FI', { hour: '2-digit', minute: '2-digit' });
}
