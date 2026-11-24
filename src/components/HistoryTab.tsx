import { useMemo, useState } from 'react';
import { CalendarClock, ChevronDown, ChevronUp, Dumbbell, Trash2 } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { formatTimeShort } from '../lib/dates';
import { formatSetLoad } from '../lib/metrics';
import type { WorkoutSet } from '../types/models';

export function HistoryTab() {
  const { store, snapshot, completedSessions } = useApp();
  const [lifterFilter, setLifterFilter] = useState<string>('all');
  const [expandedSessionIds, setExpandedSessionIds] = useState<Set<string>>(() => new Set());
  const [confirmDeleteSessionId, setConfirmDeleteSessionId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const lifterMap = useMemo(
    () => new Map(snapshot.lifters.map((l) => [l.id, l])),
    [snapshot.lifters],
  );

  const exerciseMap = useMemo(
    () => new Map(snapshot.exercises.map((e) => [e.id, e])),
    [snapshot.exercises],
  );

  const filteredSessions = useMemo(() => {
    if (lifterFilter === 'all') return completedSessions;
    return completedSessions.filter(
      (s) =>
        s.participantIds.includes(lifterFilter) ||
        snapshot.sets.some((set) => set.sessionId === s.id && set.lifterId === lifterFilter),
    );
  }, [completedSessions, lifterFilter, snapshot.sets]);

  const toggleExpand = (sessionId: string) => {
    setExpandedSessionIds((prev) => {
      const next = new Set(prev);
      if (next.has(sessionId)) {
        next.delete(sessionId);
      } else {
        next.add(sessionId);
      }
      return next;
    });
  };

  return (
    <div className="space-y-4">
      <section className="bb-widget p-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-extrabold">Aiemmat treenit</h2>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              Napauta treenipäivää nähdäksesi kaikki tehdyt liikkeet, sarjat, toistot ja painot.
            </p>
          </div>
          <span
            className="rounded-full px-2.5 py-1 text-xs font-bold"
            style={{ backgroundColor: 'var(--accent-soft)', color: 'var(--accent-text)' }}
          >
            {filteredSessions.length}
          </span>
        </div>

        {/* Lifter Filter Pills */}
        <div className="mt-3 flex flex-wrap gap-1.5" role="group" aria-label="Suodata treenejä treenaajan mukaan">
          <button
            type="button"
            onClick={() => setLifterFilter('all')}
            aria-pressed={lifterFilter === 'all'}
            className={`rounded-full px-3 py-1 text-xs font-bold transition ${
              lifterFilter === 'all' ? 'bb-pill-active' : 'bb-pill-idle'
            }`}
          >
            Kaikki
          </button>
          {snapshot.lifters.map((lifter) => (
            <button
              key={lifter.id}
              type="button"
              onClick={() => setLifterFilter(lifter.id)}
              aria-pressed={lifterFilter === lifter.id}
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold transition ${
                lifterFilter === lifter.id ? 'bb-pill-active' : 'bb-pill-idle'
              }`}
            >
              <span
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: lifter.avatarColor }}
              />
              {lifter.name}
            </button>
          ))}
        </div>
      </section>

      {deleteError && (
        <p
          role="alert"
          className="rounded-xl px-3 py-2 text-xs font-semibold"
          style={{ backgroundColor: 'var(--danger-soft)', color: 'var(--danger)' }}
        >
          {deleteError}
        </p>
      )}

      {filteredSessions.length === 0 ? (
        <section className="bb-widget flex flex-col items-center p-8 text-center">
          <CalendarClock className="mb-2.5 h-8 w-8" style={{ color: 'var(--text-muted)' }} />
          <h3 className="text-base font-bold">Ei vielä valmiita treenejä</h3>
          <p className="mt-1 text-xs" style={{ color: 'var(--text-muted)' }}>
            Päätetyt treenit (sekä klo 23.59 automaattisesti tallennetut treenit) näkyvät täällä kaikille.
          </p>
        </section>
      ) : (
        <div className="space-y-3">
          {filteredSessions.map((session) => {
            const isExpanded = expandedSessionIds.has(session.id);
            const sessionSets = snapshot.sets.filter((s) => s.sessionId === session.id);
            const participants = session.participantIds
              .map((id) => lifterMap.get(id))
              .filter((l): l is NonNullable<typeof l> => Boolean(l));

            const uniqueExercises = Array.from(
              new Set(
                sessionSets
                  .map((s) => exerciseMap.get(s.exerciseId)?.name)
                  .filter((n): n is string => Boolean(n)),
              ),
            );

            // Group sets by exercise when expanded
            const groups: { exerciseId: string; sets: WorkoutSet[] }[] = [];
            if (isExpanded) {
              for (const s of sessionSets) {
                let g = groups.find((item) => item.exerciseId === s.exerciseId);
                if (!g) {
                  g = { exerciseId: s.exerciseId, sets: [] };
                  groups.push(g);
                }
                g.sets.push(s);
              }
            }

            const isConfirmingDelete = confirmDeleteSessionId === session.id;

            return (
              <article key={session.id} className="bb-widget overflow-hidden">
                <div className="flex items-center gap-2 p-4">
                  <button
                    type="button"
                    aria-expanded={isExpanded}
                    onClick={() => toggleExpand(session.id)}
                    className="flex min-w-0 flex-1 items-center justify-between gap-3 text-left transition hover:opacity-95"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-base font-extrabold">{session.sessionDate}</span>
                        <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                          {formatTimeShort(session.startedAt)}
                        </span>
                        <span
                          className="rounded-full px-2 py-0.5 text-[11px] font-bold"
                          style={{
                            backgroundColor: 'var(--accent-soft)',
                            color: 'var(--accent-text)',
                          }}
                        >
                          {sessionSets.length} {sessionSets.length === 1 ? 'sarja' : 'sarjaa'}
                        </span>
                      </div>

                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                        {participants.map((p) => (
                          <span
                            key={p.id}
                            className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold"
                            style={{
                              backgroundColor: 'var(--bg-elevated)',
                              border: '1px solid var(--border-subtle)',
                            }}
                          >
                            <span
                              className="h-2 w-2 rounded-full"
                              style={{ backgroundColor: p.avatarColor }}
                            />
                            {p.name}
                          </span>
                        ))}
                      </div>

                      {uniqueExercises.length > 0 && (
                        <p className="mt-1.5 truncate text-xs" style={{ color: 'var(--text-muted)' }}>
                          {uniqueExercises.join(' · ')}
                        </p>
                      )}
                    </div>

                    <div style={{ color: 'var(--accent-text)' }}>
                      {isExpanded ? (
                        <ChevronUp className="h-5 w-5" />
                      ) : (
                        <ChevronDown className="h-5 w-5" />
                      )}
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setDeleteError(null);
                      setConfirmDeleteSessionId((prev) => (prev === session.id ? null : session.id));
                    }}
                    aria-label="Poista treeni"
                    title="Poista treeni"
                    className="shrink-0 rounded-xl p-2 transition hover:opacity-80 active:scale-95"
                    style={{ color: 'var(--danger)' }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>

                {isConfirmingDelete && (
                  <div
                    className="flex flex-wrap items-center justify-between gap-2 border-t px-4 py-3"
                    style={{
                      borderColor: 'var(--border-subtle)',
                      backgroundColor: 'var(--danger-soft)',
                    }}
                  >
                    <span className="text-xs font-extrabold" style={{ color: 'var(--danger)' }}>
                      Oletko varma? Treeni poistetaan pysyvästi.
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={async () => {
                          setDeleteError(null);
                          try {
                            await store.deleteSession(session.id);
                            setConfirmDeleteSessionId(null);
                          } catch (err) {
                            setDeleteError(
                              err instanceof Error
                                ? err.message
                                : 'Treenin poistaminen epäonnistui.',
                            );
                          }
                        }}
                        className="rounded-lg px-3 py-1.5 text-xs font-bold text-white"
                        style={{ backgroundColor: 'var(--danger)' }}
                      >
                        Poista
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteSessionId(null)}
                        className="bb-pill-idle rounded-lg px-3 py-1.5 text-xs font-semibold"
                      >
                        Peruuta
                      </button>
                    </div>
                  </div>
                )}

                {isExpanded && (
                  <div
                    className="border-t px-4 pt-3 pb-4 space-y-3"
                    style={{ borderColor: 'var(--border-subtle)' }}
                  >
                    {groups.length === 0 ? (
                      <div className="flex items-center gap-2 py-2 text-xs" style={{ color: 'var(--text-muted)' }}>
                        <Dumbbell className="h-4 w-4" />
                        <span>Tähän treeniin ei kirjattu sarjoja.</span>
                      </div>
                    ) : (
                      groups.map((g) => {
                        const ex = exerciseMap.get(g.exerciseId);
                        const perLifterCounter = new Map<string, number>();

                        return (
                          <div key={g.exerciseId} className="bb-subcard p-3">
                            <h4 className="mb-2 text-xs font-extrabold uppercase tracking-wider">
                              {ex?.name ?? 'Poistettu liike'}
                            </h4>
                            <div className="space-y-1.5">
                              {g.sets.map((s) => {
                                const num = (perLifterCounter.get(s.lifterId) ?? 0) + 1;
                                perLifterCounter.set(s.lifterId, num);
                                const lifter = lifterMap.get(s.lifterId);

                                return (
                                  <div
                                    key={s.id}
                                    className="flex items-center justify-between rounded-lg px-2.5 py-1.5 text-xs"
                                    style={{ backgroundColor: 'var(--bg-surface)' }}
                                  >
                                    <div className="flex items-center gap-2">
                                      <span
                                        className="h-2.5 w-2.5 rounded-full"
                                        style={{ backgroundColor: lifter?.avatarColor ?? '#64748b' }}
                                      />
                                      <span className="font-bold">{lifter?.name ?? 'Tuntematon'}</span>
                                      <span style={{ color: 'var(--text-muted)' }}>#{num}</span>
                                    </div>
                                    <span className="font-extrabold" style={{ color: 'var(--accent-text)' }}>
                                      {formatSetLoad(s, ex)} × {s.reps} {s.reps === 1 ? 'toisto' : 'toistoa'}
                                    </span>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
