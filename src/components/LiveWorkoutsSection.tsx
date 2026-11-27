import { useEffect, useState } from 'react';
import { ChevronDown, ChevronUp, Clock, Dumbbell, Eye } from 'lucide-react';
import { formatTimeShort } from '../lib/dates';
import { formatSetLoad } from '../lib/metrics';
import type { Exercise, Lifter, WorkoutSession, WorkoutSet } from '../types/models';

export interface LiveWorkoutsSectionProps {
  sessions: WorkoutSession[];
  sets: WorkoutSet[];
  lifterMap: Map<string, Lifter>;
  exerciseMap: Map<string, Exercise>;
  defaultExpanded: boolean;
}

export function LiveWorkoutsSection({
  sessions,
  sets,
  lifterMap,
  exerciseMap,
  defaultExpanded,
}: LiveWorkoutsSectionProps) {
  const [isExpanded, setIsExpanded] = useState<boolean>(defaultExpanded);

  useEffect(() => {
    setIsExpanded(defaultExpanded);
  }, [defaultExpanded]);

  if (sessions.length === 0) {
    return null;
  }

  return (
    <section
      data-testid="live-other-workouts-section"
      aria-label="Muiden käynnissä olevat treenit"
      className="bb-widget p-4"
    >
      <button
        type="button"
        onClick={() => setIsExpanded((prev) => !prev)}
        aria-expanded={isExpanded}
        className="flex w-full items-center justify-between gap-3 text-left transition hover:opacity-95"
      >
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className="text-sm font-extrabold uppercase tracking-wider"
              style={{ color: 'var(--text-primary)' }}
            >
              Käynnissä nyt
            </span>
            <span
              className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider"
              style={{
                backgroundColor: 'var(--accent-soft)',
                border: '1px solid var(--accent-border)',
                color: 'var(--accent-text)',
              }}
            >
              <span
                className="h-2 w-2 animate-pulse rounded-full"
                style={{ backgroundColor: 'var(--accent)' }}
              />
              LIVE
            </span>
            <span
              className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold"
              style={{
                backgroundColor: 'var(--bg-elevated)',
                border: '1px solid var(--border-subtle)',
                color: 'var(--text-muted)',
              }}
            >
              <Eye className="h-3 w-3" />
              Vain luku
            </span>
          </div>
          <p className="mt-1 text-xs" style={{ color: 'var(--text-muted)' }}>
            {sessions.length === 1
              ? '1 muu treeni meneillään — seuraa sarjoja reaaliajassa'
              : `${sessions.length} muuta treeniä meneillään — seuraa sarjoja reaaliajassa`}
          </p>
        </div>

        <div
          className="flex shrink-0 items-center gap-1 text-xs font-bold"
          style={{ color: 'var(--accent-text)' }}
        >
          <span>{isExpanded ? 'Piilota' : 'Näytä'}</span>
          {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </div>
      </button>

      {isExpanded && (
        <div
          className="mt-3.5 space-y-3 border-t pt-3.5"
          style={{ borderColor: 'var(--border-subtle)' }}
        >
          {sessions.map((session) => {
            const participants = session.participantIds
              .map((id) => lifterMap.get(id))
              .filter((l): l is NonNullable<typeof l> => Boolean(l));
            const sessionSets = sets.filter((s) => s.sessionId === session.id);
            const startTime = formatTimeShort(session.startedAt);

            const exerciseGroups: { exerciseId: string; sets: WorkoutSet[] }[] = [];
            for (const s of sessionSets) {
              let group = exerciseGroups.find((g) => g.exerciseId === s.exerciseId);
              if (!group) {
                group = { exerciseId: s.exerciseId, sets: [] };
                exerciseGroups.push(group);
              }
              group.sets.push(s);
            }

            return (
              <article
                key={session.id}
                data-testid={`live-session-card-${session.id}`}
                className="bb-subcard space-y-3 p-3.5"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {participants.map((p) => (
                        <span
                          key={p.id}
                          className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-bold"
                          style={{
                            backgroundColor: 'var(--bg-surface)',
                            border: '1px solid var(--border-subtle)',
                          }}
                        >
                          <span
                            className="h-2.5 w-2.5 rounded-full"
                            style={{ backgroundColor: p.avatarColor }}
                          />
                          {p.name}
                        </span>
                      ))}
                    </div>

                    <div
                      className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px]"
                      style={{ color: 'var(--text-muted)' }}
                    >
                      <Clock className="h-3 w-3 shrink-0" />
                      <span>{session.sessionDate}</span>
                      {startTime && (
                        <>
                          <span>·</span>
                          <span>Alkoi klo {startTime}</span>
                        </>
                      )}
                    </div>
                  </div>

                  <span
                    className="shrink-0 rounded-full px-2.5 py-1 text-[11px] font-extrabold"
                    style={{
                      backgroundColor: 'var(--accent-soft)',
                      color: 'var(--accent-text)',
                    }}
                  >
                    {sessionSets.length} {sessionSets.length === 1 ? 'sarja' : 'sarjaa'}
                  </span>
                </div>

                {exerciseGroups.length === 0 ? (
                  <div
                    className="flex items-center gap-2 rounded-xl px-3 py-3 text-xs"
                    style={{
                      backgroundColor: 'var(--bg-surface)',
                      color: 'var(--text-muted)',
                    }}
                  >
                    <Dumbbell className="h-4 w-4 shrink-0" />
                    <span>Ei vielä kirjattuja sarjoja — uudet sarjat päivittyvät tähän heti.</span>
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {exerciseGroups.map((group) => {
                      const ex = exerciseMap.get(group.exerciseId);
                      const perLifterCounter = new Map<string, number>();

                      return (
                        <div
                          key={group.exerciseId}
                          className="rounded-xl p-2.5"
                          style={{
                            backgroundColor: 'var(--bg-surface)',
                            border: '1px solid var(--border-subtle)',
                          }}
                        >
                          <div className="mb-2 flex items-center justify-between gap-2">
                            <h4 className="text-xs font-extrabold uppercase tracking-wider">
                              {ex?.name ?? 'Liike'}
                            </h4>
                            <span
                              className="text-[11px] font-semibold"
                              style={{ color: 'var(--text-muted)' }}
                            >
                              {group.sets.length} {group.sets.length === 1 ? 'sarja' : 'sarjaa'}
                            </span>
                          </div>

                          <div className="space-y-1.5">
                            {group.sets.map((s) => {
                              const setNum = (perLifterCounter.get(s.lifterId) ?? 0) + 1;
                              perLifterCounter.set(s.lifterId, setNum);
                              const lifter = lifterMap.get(s.lifterId);
                              const logger =
                                s.loggedBy && s.loggedBy !== s.lifterId
                                  ? lifterMap.get(s.loggedBy)
                                  : undefined;

                              return (
                                <div
                                  key={s.id}
                                  className="flex items-center justify-between gap-2 rounded-lg px-2.5 py-1.5"
                                  style={{ backgroundColor: 'var(--bg-elevated)' }}
                                >
                                  <div className="flex min-w-0 items-center gap-2">
                                    <span
                                      aria-hidden="true"
                                      className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-extrabold text-white"
                                      style={{ backgroundColor: lifter?.avatarColor ?? '#64748b' }}
                                    >
                                      {lifter?.name.slice(0, 1).toUpperCase() ?? '?'}
                                    </span>
                                    <div className="flex min-w-0 flex-wrap items-center gap-1.5 text-xs">
                                      <span className="font-bold">
                                        {lifter?.name ?? 'Tuntematon'}
                                      </span>
                                      <span style={{ color: 'var(--text-muted)' }}>#{setNum}</span>
                                      {logger && (
                                        <span
                                          className="text-[10px]"
                                          style={{ color: 'var(--text-muted)' }}
                                        >
                                          (kirjasi {logger.name})
                                        </span>
                                      )}
                                    </div>
                                  </div>

                                  <span
                                    className="shrink-0 text-xs font-extrabold"
                                    style={{ color: 'var(--accent-text)' }}
                                  >
                                    {formatSetLoad(s, ex)} × {s.reps}{' '}
                                    {s.reps === 1 ? 'toisto' : 'toistoa'}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
