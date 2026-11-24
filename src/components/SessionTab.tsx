import { useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  Check,
  CheckCircle2,
  Clock,
  Dumbbell,
  Pencil,
  Plus,
  Sparkles,
  Trash2,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { formatLocalDate, isSessionActiveAt } from '../lib/dates';
import {
  formatSetLoad,
  formatWeightNumber,
  getLastLoggedSetForLifterExercise,
} from '../lib/metrics';
import {
  getRepsSliderStops,
  getWeightSliderStopsForExercise,
  mapWeightStopToSetPayload,
  resolveInitialRepsIndex,
  resolveInitialWeightIndex,
} from '../lib/sliderOptions';
import type {
  ExerciseCategory,
  PullupMode,
  WorkoutSet,
} from '../types/models';
import { VerticalDiscreteSlider } from './VerticalDiscreteSlider';

export function SessionTab() {
  const { store, snapshot, mainUser, activeSessionForMainUser, completedSessions } = useApp();

  const [showNewSessionPicker, setShowNewSessionPicker] = useState(false);
  const [selectedParticipantIds, setSelectedParticipantIds] = useState<string[]>([]);
  const [sessionError, setSessionError] = useState<string | null>(null);

  // Active session logging state (vertical discrete slider indices)
  const [selectedLifterId, setSelectedLifterId] = useState<string>('');
  const [selectedExerciseId, setSelectedExerciseId] = useState<string>('');
  const [repsIndex, setRepsIndex] = useState<number>(7); // 8 reps default
  const [weightIndex, setWeightIndex] = useState<number>(1);
  const [formError, setFormError] = useState<string | null>(null);

  // Quick "+ Exercise" inline sheet
  const [showQuickAddExercise, setShowQuickAddExercise] = useState(false);
  const [newExerciseName, setNewExerciseName] = useState('');
  const [newExerciseCategory, setNewExerciseCategory] = useState<ExerciseCategory>('barbell');

  // Late-joiner "+ Lifter" picker
  const [showAddParticipant, setShowAddParticipant] = useState(false);

  // Editing an existing set
  const [editingSetId, setEditingSetId] = useState<string | null>(null);
  const [editPullupMode, setEditPullupMode] = useState<PullupMode>('bodyweight');
  const [editWeightInput, setEditWeightInput] = useState<string>('0');
  const [editRepsInput, setEditRepsInput] = useState<string>('8');

  const todayStr = formatLocalDate();

  // Lifters currently busy in any active session
  const busyLifterIds = useMemo(() => {
    const now = new Date();
    const set = new Set<string>();
    for (const s of snapshot.sessions) {
      if (isSessionActiveAt(s, now)) {
        for (const pid of s.participantIds) {
          set.add(pid);
        }
      }
    }
    return set;
  }, [snapshot.sessions]);

  // Keep selectedExerciseId valid
  useEffect(() => {
    if (snapshot.exercises.length === 0) return;
    if (!selectedExerciseId || !snapshot.exercises.some((e) => e.id === selectedExerciseId)) {
      setSelectedExerciseId(snapshot.exercises[0].id);
    }
  }, [snapshot.exercises, selectedExerciseId]);

  // Keep selectedLifterId synced to participants of active session
  useEffect(() => {
    if (!activeSessionForMainUser) {
      setSelectedLifterId(mainUser?.id ?? '');
      return;
    }
    if (!activeSessionForMainUser.participantIds.includes(selectedLifterId)) {
      setSelectedLifterId(
        mainUser && activeSessionForMainUser.participantIds.includes(mainUser.id)
          ? mainUser.id
          : activeSessionForMainUser.participantIds[0] ?? '',
      );
    }
  }, [activeSessionForMainUser, mainUser, selectedLifterId]);

  const selectedExercise = useMemo(
    () => snapshot.exercises.find((e) => e.id === selectedExerciseId) ?? snapshot.exercises[0],
    [snapshot.exercises, selectedExerciseId],
  );

  const repsStops = useMemo(() => getRepsSliderStops(), []);

  const weightStops = useMemo(
    () => (selectedExercise ? getWeightSliderStopsForExercise(selectedExercise) : []),
    [selectedExercise],
  );

  // Pre-fill smartly by snapping to the lifter's most recent set for the chosen exercise
  useEffect(() => {
    if (!selectedLifterId || !selectedExercise) return;
    const stopsForExercise = getWeightSliderStopsForExercise(selectedExercise);
    const lastSet = getLastLoggedSetForLifterExercise(
      snapshot.sets,
      selectedLifterId,
      selectedExercise.id,
    );
    setRepsIndex(resolveInitialRepsIndex(selectedExercise, lastSet));
    setWeightIndex(resolveInitialWeightIndex(selectedExercise, stopsForExercise, lastSet));
  }, [selectedLifterId, selectedExercise?.id]);

  const openNewSessionFlow = () => {
    if (!mainUser) return;
    setSelectedParticipantIds([mainUser.id]);
    setSessionError(null);
    setShowNewSessionPicker(true);
  };

  const toggleParticipantCandidate = (lifterId: string) => {
    setSelectedParticipantIds((prev) =>
      prev.includes(lifterId) ? prev.filter((id) => id !== lifterId) : [...prev, lifterId],
    );
  };

  const handleStartSession = async () => {
    if (!mainUser) return;
    setSessionError(null);
    try {
      await store.createSession({
        createdBy: mainUser.id,
        participantIds: selectedParticipantIds,
      });
      setShowNewSessionPicker(false);
    } catch (err) {
      setSessionError(err instanceof Error ? err.message : 'Could not start session.');
    }
  };

  const handleEndSession = async () => {
    if (!activeSessionForMainUser) return;
    setFormError(null);
    try {
      await store.endSession(activeSessionForMainUser.id);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Could not end session.');
    }
  };

  const handleAddSet = async (e: FormEvent) => {
    e.preventDefault();
    if (!activeSessionForMainUser || !selectedExercise || !selectedLifterId) return;
    setFormError(null);

    const safeRepStop = repsStops[Math.max(0, Math.min(repsStops.length - 1, repsIndex))];
    const safeWeightStop =
      weightStops[Math.max(0, Math.min(weightStops.length - 1, weightIndex))];

    if (!safeRepStop || !safeWeightStop) return;

    const parsedReps = typeof safeRepStop.rawValue === 'number' ? safeRepStop.rawValue : 1;
    const { pullupMode, weightKg } = mapWeightStopToSetPayload(selectedExercise, safeWeightStop);

    try {
      await store.addSet({
        sessionId: activeSessionForMainUser.id,
        lifterId: selectedLifterId,
        exerciseId: selectedExercise.id,
        pullupMode,
        weightKg,
        reps: parsedReps,
        loggedBy: mainUser?.id ?? selectedLifterId,
      });
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to log set.');
    }
  };

  const handleQuickCreateExercise = async (e: FormEvent) => {
    e.preventDefault();
    setFormError(null);
    try {
      const created = await store.addExercise({
        name: newExerciseName,
        category: newExerciseCategory,
      });
      setSelectedExerciseId(created.id);
      setNewExerciseName('');
      setShowQuickAddExercise(false);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Could not add exercise.');
    }
  };

  const beginEditSet = (setItem: WorkoutSet) => {
    setEditingSetId(setItem.id);
    setEditPullupMode(setItem.pullupMode ?? 'bodyweight');
    setEditWeightInput(setItem.weightKg !== null ? formatWeightNumber(setItem.weightKg) : '0');
    setEditRepsInput(String(setItem.reps));
  };

  const saveEditSet = async (setItem: WorkoutSet) => {
    const ex = snapshot.exercises.find((e) => e.id === setItem.exerciseId);
    if (!ex) return;
    setFormError(null);
    const needsWeight =
      ex.category === 'pullup' ? editPullupMode === 'weighted' : ex.category !== 'bodyweight';
    try {
      await store.updateSet(setItem.id, {
        pullupMode: ex.category === 'pullup' ? editPullupMode : null,
        weightKg: needsWeight ? Number(editWeightInput) : null,
        reps: Number(editRepsInput),
      });
      setEditingSetId(null);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Could not update set.');
    }
  };

  const lifterMap = useMemo(
    () => new Map(snapshot.lifters.map((l) => [l.id, l])),
    [snapshot.lifters],
  );

  const exerciseMap = useMemo(
    () => new Map(snapshot.exercises.map((e) => [e.id, e])),
    [snapshot.exercises],
  );

  // Completed sessions today for context when idle
  const todaysCompletedCount = useMemo(
    () => completedSessions.filter((s) => s.sessionDate === todayStr).length,
    [completedSessions, todayStr],
  );

  if (!mainUser) {
    return null;
  }

  // =========================================================================
  // IDLE STATE: Main User is not in an active session -> Show "New Session"
  // =========================================================================
  if (!activeSessionForMainUser) {
    return (
      <div className="space-y-4">
        <section className="bb-widget p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <span
                className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold"
                style={{ backgroundColor: 'var(--accent-soft)', color: 'var(--accent-text)' }}
              >
                <Sparkles className="h-3.5 w-3.5" />
                {todayStr}
              </span>
              <h2 className="mt-2.5 text-xl font-extrabold">
                Ready to lift, {mainUser.name}?
              </h2>
              <p className="mt-1 text-sm" style={{ color: 'var(--text-secondary)' }}>
                Start a session solo or pick your gym partners for today. Only selected lifters
                will see and log into your live session.
              </p>
            </div>
          </div>

          {!showNewSessionPicker ? (
            <div className="mt-5 space-y-3">
              <button
                type="button"
                onClick={openNewSessionFlow}
                className="bb-btn-primary flex w-full items-center justify-center gap-2 py-3.5 text-base shadow-sm"
              >
                <Plus className="h-5 w-5" />
                <span>New Session</span>
              </button>

              <div
                className="flex items-center justify-between text-xs"
                style={{ color: 'var(--text-muted)' }}
              >
                <span className="flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5" />
                  Auto-saves at 23:59 if not ended manually
                </span>
                {todaysCompletedCount > 0 && (
                  <span>
                    {todaysCompletedCount} finished today
                  </span>
                )}
              </div>
            </div>
          ) : (
            <div className="mt-5 border-t pt-4" style={{ borderColor: 'var(--border-subtle)' }}>
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-extrabold">
                    Select Lifters for {todayStr}
                  </h3>
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                    Everyone selected can see and log sets in real time.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowNewSessionPicker(false)}
                  aria-label="Close new session picker"
                  className="rounded-lg p-1"
                  style={{ color: 'var(--text-muted)' }}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="space-y-2">
                {snapshot.lifters.map((lifter) => {
                  const isBusy = busyLifterIds.has(lifter.id);
                  const isChecked = selectedParticipantIds.includes(lifter.id);

                  return (
                    <button
                      key={lifter.id}
                      type="button"
                      disabled={isBusy}
                      aria-pressed={isChecked}
                      onClick={() => toggleParticipantCandidate(lifter.id)}
                      className={`flex w-full items-center justify-between rounded-xl px-3.5 py-3 text-left transition ${
                        isChecked ? 'bb-pill-active' : 'bb-pill-idle'
                      } ${isBusy ? 'cursor-not-allowed opacity-55' : ''}`}
                    >
                      <div className="flex items-center gap-2.5">
                        <span
                          className="flex h-7 w-7 items-center justify-center rounded-full text-xs font-extrabold text-white"
                          style={{ backgroundColor: lifter.avatarColor }}
                        >
                          {lifter.name.slice(0, 1).toUpperCase()}
                        </span>
                        <div>
                          <span className="text-sm font-bold">{lifter.name}</span>
                          {lifter.id === mainUser.id && (
                            <span className="ml-1.5 text-[11px] opacity-80">(You)</span>
                          )}
                          {isBusy && (
                            <div className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                              In another active session
                            </div>
                          )}
                        </div>
                      </div>

                      <div
                        className="flex h-5 w-5 items-center justify-center rounded-md border"
                        style={{
                          borderColor: isChecked ? 'var(--accent)' : 'var(--border-subtle)',
                          backgroundColor: isChecked ? 'var(--accent)' : 'transparent',
                          color: isChecked ? 'var(--accent-on-fill)' : 'transparent',
                        }}
                      >
                        <Check className="h-3.5 w-3.5" />
                      </div>
                    </button>
                  );
                })}
              </div>

              {sessionError && (
                <p
                  role="alert"
                  className="mt-3 rounded-xl px-3 py-2 text-xs font-semibold"
                  style={{ backgroundColor: 'var(--danger-soft)', color: 'var(--danger)' }}
                >
                  {sessionError}
                </p>
              )}

              <div className="mt-4 flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowNewSessionPicker(false)}
                  className="bb-pill-idle flex-1 rounded-xl py-2.5 text-sm font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={selectedParticipantIds.length === 0}
                  onClick={handleStartSession}
                  className="bb-btn-primary flex-[2] py-2.5 text-sm"
                >
                  Start Session ({selectedParticipantIds.length})
                </button>
              </div>
            </div>
          )}
        </section>
      </div>
    );
  }

  // =========================================================================
  // ACTIVE SESSION STATE: Main User is a participant in activeSessionForMainUser
  // =========================================================================
  const sessionParticipants = activeSessionForMainUser.participantIds
    .map((id) => lifterMap.get(id))
    .filter((l): l is NonNullable<typeof l> => Boolean(l));

  const availableLateJoiners = snapshot.lifters.filter(
    (l) => !activeSessionForMainUser.participantIds.includes(l.id) && !busyLifterIds.has(l.id),
  );

  const sessionSets = snapshot.sets.filter((s) => s.sessionId === activeSessionForMainUser.id);

  // Group sets by exercise in chronological order of first appearance
  const exerciseGroups: { exerciseId: string; sets: WorkoutSet[] }[] = [];
  for (const s of sessionSets) {
    let group = exerciseGroups.find((g) => g.exerciseId === s.exerciseId);
    if (!group) {
      group = { exerciseId: s.exerciseId, sets: [] };
      exerciseGroups.push(group);
    }
    group.sets.push(s);
  }

  const weightBadgeText = (() => {
    if (!selectedExercise || weightStops.length === 0) return undefined;
    if (selectedExercise.category === 'pullup') return 'Asst–+30';
    if (selectedExercise.category === 'dumbbell') return 'per DB';
    if (selectedExercise.category === 'bodyweight') return 'BW';
    const first = weightStops[0]?.tickLabel;
    const last = weightStops[weightStops.length - 1]?.tickLabel;
    return first && last ? `${first}–${last}` : undefined;
  })();

  return (
    <div className="space-y-4">
      {/* Active Session Banner */}
      <section className="bb-widget p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="flex items-center gap-2">
              <span
                className="inline-block h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: 'var(--accent)' }}
              />
              <h2 className="text-lg font-extrabold tracking-tight">
                Session {activeSessionForMainUser.sessionDate}
              </h2>
            </div>
            <p className="mt-0.5 flex items-center gap-1 text-[11px]" style={{ color: 'var(--text-muted)' }}>
              <Clock className="h-3 w-3" />
              <span>Auto-saves at 23:59</span>
              <span>·</span>
              <span>{sessionSets.length} sets logged</span>
            </p>
          </div>

          <button
            type="button"
            onClick={handleEndSession}
            className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold transition active:scale-95"
            style={{
              backgroundColor: 'var(--danger-soft)',
              color: 'var(--danger)',
              border: '1px solid var(--danger)',
            }}
          >
            <CheckCircle2 className="h-4 w-4" />
            <span>End Session</span>
          </button>
        </div>

        {/* Participant Chips + Late Joiner */}
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <span className="mr-1 flex items-center gap-1 text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>
            <Users className="h-3.5 w-3.5" />
            Crew:
          </span>
          {sessionParticipants.map((p) => (
            <span
              key={p.id}
              className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold"
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

          {availableLateJoiners.length > 0 && (
            <button
              type="button"
              onClick={() => setShowAddParticipant((v) => !v)}
              className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold"
              style={{
                backgroundColor: 'var(--accent-soft)',
                color: 'var(--accent-text)',
              }}
            >
              <UserPlus className="h-3 w-3" />
              <span>Add Lifter</span>
            </button>
          )}
        </div>

        {showAddParticipant && availableLateJoiners.length > 0 && (
          <div className="bb-subcard mt-3 flex flex-wrap items-center gap-2 p-2.5">
            <span className="text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>
              Join live session:
            </span>
            {availableLateJoiners.map((lifter) => (
              <button
                key={lifter.id}
                type="button"
                onClick={async () => {
                  try {
                    await store.addParticipantToSession(activeSessionForMainUser.id, lifter.id);
                    setShowAddParticipant(false);
                  } catch (err) {
                    setFormError(err instanceof Error ? err.message : 'Could not add lifter.');
                  }
                }}
                className="bb-pill-active rounded-full px-3 py-1 text-xs font-bold"
              >
                + {lifter.name}
              </button>
            ))}
          </div>
        )}
      </section>

      {/* Quick Set Logger Widget */}
      <section className="bb-widget p-4">
        <form onSubmit={handleAddSet} className="space-y-4">
          {/* 1-Tap Lifter Switcher */}
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                Logging Set For
              </span>
              {selectedLifterId !== mainUser.id && (
                <span className="text-[11px] font-semibold" style={{ color: 'var(--accent-text)' }}>
                  Logging for partner
                </span>
              )}
            </div>
            <div className="grid grid-cols-3 gap-2">
              {sessionParticipants.map((p) => {
                const isSelected = p.id === selectedLifterId;
                return (
                  <button
                    key={p.id}
                    type="button"
                    aria-pressed={isSelected}
                    onClick={() => setSelectedLifterId(p.id)}
                    className={`flex items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-bold transition ${
                      isSelected ? 'bb-pill-active' : 'bb-pill-idle'
                    }`}
                  >
                    <span
                      aria-hidden="true"
                      className="flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-extrabold text-white"
                      style={{ backgroundColor: p.avatarColor }}
                    >
                      {p.name.slice(0, 1).toUpperCase()}
                    </span>
                    <span className="truncate">{p.name}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Exercise Picker */}
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <label
                htmlFor="session-exercise-select"
                className="text-xs font-bold uppercase tracking-wider"
                style={{ color: 'var(--text-muted)' }}
              >
                Exercise
              </label>
              <button
                type="button"
                onClick={() => setShowQuickAddExercise((v) => !v)}
                className="text-xs font-bold"
                style={{ color: 'var(--accent-text)' }}
              >
                {showQuickAddExercise ? 'Cancel' : '+ New Exercise'}
              </button>
            </div>

            <select
              id="session-exercise-select"
              aria-label="Exercise"
              value={selectedExercise?.id ?? ''}
              onChange={(e) => setSelectedExerciseId(e.target.value)}
              className="bb-input w-full px-3.5 py-2.5 text-sm font-bold"
            >
              {snapshot.exercises.map((ex) => (
                <option key={ex.id} value={ex.id}>
                  {ex.name}
                </option>
              ))}
            </select>
          </div>

          {/* Quick Inline Add Exercise */}
          {showQuickAddExercise && (
            <div className="bb-subcard space-y-2.5 p-3">
              <div className="text-xs font-bold">Add New Exercise</div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <input
                  type="text"
                  value={newExerciseName}
                  onChange={(e) => setNewExerciseName(e.target.value)}
                  placeholder="e.g. Overhead Press"
                  aria-label="New exercise name"
                  className="bb-input flex-1 px-3 py-2 text-sm"
                />
                <select
                  value={newExerciseCategory}
                  onChange={(e) => setNewExerciseCategory(e.target.value as ExerciseCategory)}
                  aria-label="New exercise type"
                  className="bb-input px-3 py-2 text-sm"
                >
                  <option value="barbell">Barbell (kg)</option>
                  <option value="dumbbell">Dumbbell (kg / DB)</option>
                  <option value="machine">Machine / Cable (kg)</option>
                  <option value="bodyweight">Bodyweight (reps only)</option>
                  <option value="pullup">Pull-up modes (Assisted / BW / +kg)</option>
                </select>
              </div>
              <button
                type="button"
                disabled={!newExerciseName.trim()}
                onClick={handleQuickCreateExercise}
                className="bb-btn-primary w-full py-2 text-xs"
              >
                Save Exercise
              </button>
            </div>
          )}

          {/* Side-by-Side Vertical Sliders: Left = Reps (1-30), Right = Exercise Weight */}
          <div className="grid grid-cols-2 gap-3" role="group" aria-label="Set reps and weight sliders">
            <VerticalDiscreteSlider
              id="set-reps-slider"
              label="Reps"
              badgeText="1–30"
              stops={repsStops}
              selectedIndex={repsIndex}
              onSelectIndex={setRepsIndex}
              stepUpLabel="Increase reps"
              stepDownLabel="Decrease reps"
              trackTestId="reps-slider-track"
            />

            <VerticalDiscreteSlider
              id="set-weight-slider"
              label="Weight"
              badgeText={weightBadgeText}
              stops={weightStops}
              selectedIndex={weightIndex}
              onSelectIndex={setWeightIndex}
              stepUpLabel="Increase weight"
              stepDownLabel="Decrease weight"
              trackTestId="weight-slider-track"
            />
          </div>

          {formError && (
            <p
              role="alert"
              className="rounded-xl px-3 py-2 text-xs font-semibold"
              style={{ backgroundColor: 'var(--danger-soft)', color: 'var(--danger)' }}
            >
              {formError}
            </p>
          )}

          <button type="submit" className="bb-btn-primary flex w-full items-center justify-center gap-2 py-3.5 text-sm">
            <Plus className="h-4 w-4" />
            <span>
              Add Set for {lifterMap.get(selectedLifterId)?.name ?? 'Lifter'}
            </span>
          </button>
        </form>
      </section>

      {/* Live Session Feed */}
      <section className="bb-widget p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-extrabold uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>
            Live Session Sets
          </h3>
          <span className="text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>
            Real-time
          </span>
        </div>

        {exerciseGroups.length === 0 ? (
          <div className="bb-subcard flex flex-col items-center py-8 text-center">
            <Dumbbell className="mb-2 h-6 w-6" style={{ color: 'var(--text-muted)' }} />
            <p className="text-sm font-semibold">No sets logged yet</p>
            <p className="mt-0.5 text-xs" style={{ color: 'var(--text-muted)' }}>
              Add your first set above — everyone in this session will see it instantly.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {exerciseGroups.map((group) => {
              const ex = exerciseMap.get(group.exerciseId);
              const perLifterCounter = new Map<string, number>();

              return (
                <div key={group.exerciseId} className="bb-subcard p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <h4 className="text-sm font-extrabold">{ex?.name ?? 'Exercise'}</h4>
                    <span className="text-[11px] font-semibold" style={{ color: 'var(--text-muted)' }}>
                      {group.sets.length} {group.sets.length === 1 ? 'set' : 'sets'}
                    </span>
                  </div>

                  <div className="space-y-2">
                    {group.sets.map((s) => {
                      const setNum = (perLifterCounter.get(s.lifterId) ?? 0) + 1;
                      perLifterCounter.set(s.lifterId, setNum);
                      const lifter = lifterMap.get(s.lifterId);
                      const logger = s.loggedBy ? lifterMap.get(s.loggedBy) : undefined;
                      const isEditing = editingSetId === s.id;

                      if (isEditing && ex) {
                        const editNeedsWeight =
                          ex.category === 'pullup'
                            ? editPullupMode === 'weighted'
                            : ex.category !== 'bodyweight';

                        return (
                          <div
                            key={s.id}
                            className="rounded-xl border p-2.5 space-y-2"
                            style={{
                              backgroundColor: 'var(--bg-surface)',
                              borderColor: 'var(--accent-border)',
                            }}
                          >
                            {ex.category === 'pullup' && (
                              <div className="grid grid-cols-3 gap-1.5">
                                {(['assisted', 'bodyweight', 'weighted'] as const).map((m) => (
                                  <button
                                    key={m}
                                    type="button"
                                    onClick={() => setEditPullupMode(m)}
                                    className={`rounded-lg py-1 text-[11px] font-bold capitalize ${
                                      editPullupMode === m ? 'bb-pill-active' : 'bb-pill-idle'
                                    }`}
                                  >
                                    {m === 'weighted' ? '+kg' : m}
                                  </button>
                                ))}
                              </div>
                            )}
                            <div className="flex items-center gap-2">
                              {editNeedsWeight && (
                                <input
                                  type="number"
                                  min="0"
                                  step="0.5"
                                  aria-label="Edit weight (kg)"
                                  value={editWeightInput}
                                  onChange={(e) => setEditWeightInput(e.target.value)}
                                  className="bb-input w-24 px-2.5 py-1.5 text-xs font-bold"
                                />
                              )}
                              <input
                                type="number"
                                min="1"
                                max="999"
                                aria-label="Edit reps"
                                value={editRepsInput}
                                onChange={(e) => setEditRepsInput(e.target.value)}
                                className="bb-input w-20 px-2.5 py-1.5 text-xs font-bold"
                              />
                              <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                                reps
                              </span>
                              <div className="ml-auto flex items-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => saveEditSet(s)}
                                  aria-label="Save set changes"
                                  className="bb-btn-primary px-2.5 py-1.5 text-xs"
                                >
                                  Save
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setEditingSetId(null)}
                                  aria-label="Cancel editing set"
                                  className="bb-pill-idle rounded-lg px-2 py-1.5 text-xs"
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                          </div>
                        );
                      }

                      return (
                        <div
                          key={s.id}
                          className="flex items-center justify-between gap-2 rounded-xl px-3 py-2"
                          style={{ backgroundColor: 'var(--bg-surface)' }}
                        >
                          <div className="flex min-w-0 items-center gap-2.5">
                            <span
                              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-extrabold text-white"
                              style={{ backgroundColor: lifter?.avatarColor ?? '#64748b' }}
                            >
                              {lifter?.name.slice(0, 1).toUpperCase() ?? '?'}
                            </span>
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-1.5 text-xs">
                                <span className="font-bold">{lifter?.name ?? 'Unknown'}</span>
                                <span style={{ color: 'var(--text-muted)' }}>Set #{setNum}</span>
                                {logger && logger.id !== s.lifterId && (
                                  <span
                                    className="text-[10px]"
                                    style={{ color: 'var(--text-muted)' }}
                                  >
                                    (added by {logger.name})
                                  </span>
                                )}
                              </div>
                              <div className="text-sm font-extrabold" style={{ color: 'var(--accent-text)' }}>
                                {formatSetLoad(s, ex)} × {s.reps} reps
                              </div>
                            </div>
                          </div>

                          <div className="flex shrink-0 items-center gap-1">
                            <button
                              type="button"
                              onClick={() => beginEditSet(s)}
                              aria-label={`Edit ${lifter?.name ?? ''} set ${setNum}`}
                              className="rounded-lg p-1.5 transition hover:opacity-80"
                              style={{ color: 'var(--text-muted)' }}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => void store.deleteSet(s.id)}
                              aria-label={`Delete ${lifter?.name ?? ''} set ${setNum}`}
                              className="rounded-lg p-1.5 transition hover:opacity-80"
                              style={{ color: 'var(--danger)' }}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
