import { useEffect, useState, type FormEvent } from 'react';
import {
  Check,
  Dumbbell,
  Lock,
  Palette,
  RefreshCw,
  ScanFace,
  ShieldCheck,
  Sparkles,
  Trash2,
  UserPlus,
  Users,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { SECONDARY_ACCENT_OPTIONS, useTheme } from '../context/ThemeContext';
import { AVATAR_COLOR_SWATCHES } from '../lib/seedData';
import {
  clearEnrolledFaceId,
  enrollFaceIdForAdmin,
  hasEnrolledFaceId,
  isPlatformFaceIdAvailable,
} from '../lib/webauthn';
import type { ExerciseCategory, ThemeMode } from '../types/models';

export function SettingsTab() {
  const { store, snapshot, mainUser, requestSwitchMainUser } = useApp();
  const { theme, accent, setTheme, setAccent } = useTheme();

  // Add Lifter form
  const [newUserName, setNewUserName] = useState('');
  const [newUserColor, setNewUserColor] = useState(AVATAR_COLOR_SWATCHES[3]);
  const [userMessage, setUserMessage] = useState<string | null>(null);
  const [userError, setUserError] = useState<string | null>(null);
  const [confirmDeleteLifterId, setConfirmDeleteLifterId] = useState<string | null>(null);

  // Add Exercise form
  const [newExerciseName, setNewExerciseName] = useState('');
  const [newExerciseCategory, setNewExerciseCategory] = useState<ExerciseCategory>('barbell');
  const [exerciseError, setExerciseError] = useState<string | null>(null);
  const [confirmDeleteExerciseId, setConfirmDeleteExerciseId] = useState<string | null>(null);

  // Face ID state (only managed when active user is Joel / Admin)
  const [faceIdSupported, setFaceIdSupported] = useState(false);
  const [faceIdEnrolled, setFaceIdEnrolled] = useState(false);
  const [faceIdNotice, setFaceIdNotice] = useState<string | null>(null);

  const isJoelAdmin = Boolean(mainUser?.isAdmin);

  useEffect(() => {
    let active = true;
    setFaceIdEnrolled(hasEnrolledFaceId(mainUser?.id));
    void isPlatformFaceIdAvailable().then((supported) => {
      if (active) setFaceIdSupported(supported);
    });
    return () => {
      active = false;
    };
  }, [mainUser?.id]);

  const handleAddUser = async (e: FormEvent) => {
    e.preventDefault();
    setUserError(null);
    setUserMessage(null);
    try {
      const created = await store.addLifter({
        name: newUserName,
        avatarColor: newUserColor,
      });
      setNewUserName('');
      setUserMessage(`Added ${created.name}!`);
    } catch (err) {
      setUserError(err instanceof Error ? err.message : 'Failed to add user.');
    }
  };

  const handleDeleteUser = async (targetId: string) => {
    if (!mainUser) return;
    setUserError(null);
    setUserMessage(null);
    try {
      await store.deleteLifter(targetId, mainUser.id);
      setConfirmDeleteLifterId(null);
    } catch (err) {
      setUserError(err instanceof Error ? err.message : 'Could not delete user.');
    }
  };

  const handleAddExercise = async (e: FormEvent) => {
    e.preventDefault();
    setExerciseError(null);
    try {
      await store.addExercise({
        name: newExerciseName,
        category: newExerciseCategory,
      });
      setNewExerciseName('');
    } catch (err) {
      setExerciseError(err instanceof Error ? err.message : 'Failed to add exercise.');
    }
  };

  const handleDeleteExercise = async (targetExerciseId: string) => {
    if (!mainUser) return;
    setExerciseError(null);
    try {
      await store.deleteExercise(targetExerciseId, mainUser.id);
      setConfirmDeleteExerciseId(null);
    } catch (err) {
      setExerciseError(err instanceof Error ? err.message : 'Could not remove exercise.');
    }
  };

  const handleEnrollFaceId = async () => {
    if (!mainUser || !mainUser.isAdmin) return;
    setFaceIdNotice(null);
    try {
      await enrollFaceIdForAdmin(mainUser);
      setFaceIdEnrolled(true);
      setFaceIdNotice('Face ID enabled for switching to Joel on this device.');
    } catch (err) {
      setFaceIdNotice(err instanceof Error ? err.message : 'Could not enable Face ID.');
    }
  };

  const handleRemoveFaceId = () => {
    clearEnrolledFaceId();
    setFaceIdEnrolled(false);
    setFaceIdNotice('Face ID removed on this device. PIN remains active.');
  };

  const themeChoices: { id: ThemeMode; label: string; subtitle: string; bgPreview: string }[] = [
    {
      id: 'light',
      label: 'Light',
      subtitle: 'Crisp daylight surfaces',
      bgPreview: '#f4f7fb',
    },
    {
      id: 'dark',
      label: 'Dark',
      subtitle: 'Deep gym obsidian',
      bgPreview: '#090d16',
    },
    {
      id: 'pink',
      label: 'Pink / Light Pink',
      subtitle: 'Soft rose & blush glow',
      bgPreview: '#fff1f5',
    },
  ];

  return (
    <div className="space-y-4">
      {/* 1. Switch Main User + Joel Face ID */}
      <section className="bb-widget p-4">
        <div className="mb-3 flex items-center gap-2">
          <Users className="h-4 w-4" style={{ color: 'var(--accent-text)' }} />
          <div>
            <h2 className="text-base font-extrabold">Switch Main User</h2>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              Choose who owns this phone. Switching to Joel requires his PIN or Face ID.
            </p>
          </div>
        </div>

        <div className="space-y-2">
          {snapshot.lifters.map((lifter) => {
            const isCurrent = mainUser?.id === lifter.id;
            return (
              <button
                key={lifter.id}
                type="button"
                aria-pressed={isCurrent}
                onClick={() => requestSwitchMainUser(lifter)}
                className={`flex w-full items-center justify-between rounded-xl px-3.5 py-3 text-left transition ${
                  isCurrent ? 'bb-pill-active' : 'bb-pill-idle'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <span
                    aria-hidden="true"
                    className="flex h-8 w-8 items-center justify-center rounded-full text-xs font-extrabold text-white"
                    style={{ backgroundColor: lifter.avatarColor }}
                  >
                    {lifter.name.slice(0, 1).toUpperCase()}
                  </span>
                  <div>
                    <div className="flex items-center gap-1.5 text-sm font-bold">
                      <span>{lifter.name}</span>
                      {lifter.isAdmin && (
                        <span
                          className="inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[10px] font-bold"
                          style={{
                            backgroundColor: 'var(--accent-soft)',
                            color: 'var(--accent-text)',
                          }}
                        >
                          <ShieldCheck className="h-3 w-3" />
                          Admin
                        </span>
                      )}
                    </div>
                    <div className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                      {isCurrent
                        ? 'Active on this phone'
                        : lifter.isAdmin
                          ? 'Requires 4-digit PIN or Face ID'
                          : 'Tap to switch'}
                    </div>
                  </div>
                </div>

                {isCurrent ? (
                  <Check className="h-4 w-4" />
                ) : lifter.isAdmin ? (
                  <Lock className="h-4 w-4" style={{ color: 'var(--text-muted)' }} />
                ) : null}
              </button>
            );
          })}
        </div>

        {/* iPhone Face ID Management (only when verified as Joel) */}
        {isJoelAdmin && (
          <div className="bb-subcard mt-3.5 p-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <ScanFace className="h-5 w-5" style={{ color: 'var(--accent-text)' }} />
                <div>
                  <div className="text-xs font-bold">iPhone Face ID for Joel</div>
                  <div className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                    {faceIdEnrolled
                      ? 'Enabled on this device for quick switching to Joel.'
                      : faceIdSupported
                        ? 'Allow Face ID alongside your 4-digit PIN on this device.'
                        : 'Platform Face ID requires Safari / installed PWA on iPhone over HTTPS.'}
                  </div>
                </div>
              </div>

              {faceIdEnrolled ? (
                <button
                  type="button"
                  onClick={handleRemoveFaceId}
                  className="rounded-lg px-2.5 py-1.5 text-xs font-bold"
                  style={{ backgroundColor: 'var(--danger-soft)', color: 'var(--danger)' }}
                >
                  Remove
                </button>
              ) : (
                <button
                  type="button"
                  disabled={!faceIdSupported}
                  onClick={handleEnrollFaceId}
                  className="bb-btn-primary px-3 py-1.5 text-xs"
                >
                  Enable Face ID
                </button>
              )}
            </div>
            {faceIdNotice && (
              <p className="mt-2 text-[11px] font-semibold" style={{ color: 'var(--accent-text)' }}>
                {faceIdNotice}
              </p>
            )}
          </div>
        )}
      </section>

      {/* 2. Color Theme & Secondary App Color */}
      <section className="bb-widget p-4 space-y-4">
        <div className="flex items-center gap-2">
          <Palette className="h-4 w-4" style={{ color: 'var(--accent-text)' }} />
          <div>
            <h2 className="text-base font-extrabold">Color Themes &amp; Borders</h2>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              Switch between Light, Dark, and Pink themes plus widget border accents.
            </p>
          </div>
        </div>

        {/* Base Theme Selector */}
        <div>
          <span
            className="mb-2 block text-xs font-bold uppercase tracking-wider"
            style={{ color: 'var(--text-muted)' }}
          >
            App Theme
          </span>
          <div className="grid grid-cols-3 gap-2" role="group" aria-label="Color theme">
            {themeChoices.map((item) => {
              const active = theme === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setTheme(item.id)}
                  className={`flex flex-col items-center rounded-xl p-2.5 text-center transition ${
                    active ? 'bb-pill-active' : 'bb-pill-idle'
                  }`}
                >
                  <span
                    className="mb-1.5 h-6 w-6 rounded-full border"
                    style={{
                      backgroundColor: item.bgPreview,
                      borderColor:
                        item.id === 'pink' ? '#ec4899' : 'var(--accent-border)',
                    }}
                  />
                  <span className="text-xs font-extrabold">{item.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Secondary App Color (Light & Dark themes) */}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <span
              className="text-xs font-bold uppercase tracking-wider"
              style={{ color: 'var(--text-muted)' }}
            >
              Secondary App Color (Widget Borders &amp; Accents)
            </span>
            <Sparkles className="h-3.5 w-3.5" style={{ color: 'var(--accent-text)' }} />
          </div>

          {theme === 'pink' ? (
            <p className="bb-subcard px-3 py-2.5 text-xs" style={{ color: 'var(--text-secondary)' }}>
              Pink / Light Pink theme uses soft rose borders automatically. Switch to{' '}
              <strong>Light</strong> or <strong>Dark</strong> to apply your custom secondary border
              color.
            </p>
          ) : (
            <div
              className="grid grid-cols-2 gap-2 sm:grid-cols-3"
              role="group"
              aria-label="Secondary app color"
            >
              {SECONDARY_ACCENT_OPTIONS.map((opt) => {
                const active = accent === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setAccent(opt.id)}
                    className={`flex items-center gap-2 rounded-xl px-3 py-2.5 text-left text-xs font-bold transition ${
                      active ? 'bb-pill-active' : 'bb-pill-idle'
                    }`}
                  >
                    <span
                      className="h-4 w-4 shrink-0 rounded-full border border-black/20"
                      style={{ backgroundColor: opt.swatchHex }}
                    />
                    <span className="truncate">{opt.label}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* 3. Manage Users */}
      <section className="bb-widget p-4 space-y-3.5">
        <div className="flex items-center gap-2">
          <UserPlus className="h-4 w-4" style={{ color: 'var(--accent-text)' }} />
          <div>
            <h2 className="text-base font-extrabold">Manage Users</h2>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              Anyone can add a new gym buddy. Only Joel can delete users.
            </p>
          </div>
        </div>

        <form onSubmit={handleAddUser} className="space-y-2.5">
          <div className="flex gap-2">
            <input
              type="text"
              value={newUserName}
              onChange={(e) => setNewUserName(e.target.value)}
              placeholder="New user name (e.g. Alex)"
              aria-label="New user name"
              className="bb-input flex-1 px-3 py-2 text-sm"
            />
            <button
              type="submit"
              disabled={!newUserName.trim()}
              className="bb-btn-primary px-4 py-2 text-xs"
            >
              Add User
            </button>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="mr-1 text-[11px] font-semibold" style={{ color: 'var(--text-muted)' }}>
              Badge color:
            </span>
            {AVATAR_COLOR_SWATCHES.map((hex) => (
              <button
                key={hex}
                type="button"
                aria-label={`Select badge color ${hex}`}
                onClick={() => setNewUserColor(hex)}
                className="h-5 w-5 rounded-full transition"
                style={{
                  backgroundColor: hex,
                  outline: newUserColor === hex ? '2px solid var(--text-primary)' : 'none',
                  outlineOffset: '2px',
                }}
              />
            ))}
          </div>
        </form>

        {userError && (
          <p
            role="alert"
            className="rounded-xl px-3 py-2 text-xs font-semibold"
            style={{ backgroundColor: 'var(--danger-soft)', color: 'var(--danger)' }}
          >
            {userError}
          </p>
        )}
        {userMessage && (
          <p className="text-xs font-semibold" style={{ color: 'var(--accent-text)' }}>
            {userMessage}
          </p>
        )}

        <div className="space-y-1.5 pt-1">
          {snapshot.lifters.map((lifter) => {
            const canDelete = isJoelAdmin && !lifter.isAdmin;
            const isConfirming = confirmDeleteLifterId === lifter.id;

            return (
              <div
                key={lifter.id}
                className="bb-subcard flex items-center justify-between px-3 py-2"
              >
                <div className="flex items-center gap-2">
                  <span
                    className="h-3 w-3 rounded-full"
                    style={{ backgroundColor: lifter.avatarColor }}
                  />
                  <span className="text-sm font-bold">{lifter.name}</span>
                  {lifter.isAdmin && (
                    <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                      (Admin)
                    </span>
                  )}
                </div>

                {canDelete && (
                  <div>
                    {isConfirming ? (
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => void handleDeleteUser(lifter.id)}
                          aria-label={`Confirm delete user ${lifter.name}`}
                          className="rounded-lg px-2.5 py-1 text-xs font-bold text-white"
                          style={{ backgroundColor: 'var(--danger)' }}
                        >
                          Confirm
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteLifterId(null)}
                          className="bb-pill-idle rounded-lg px-2 py-1 text-xs"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteLifterId(lifter.id)}
                        aria-label={`Delete user ${lifter.name}`}
                        className="rounded-lg p-1.5 transition hover:opacity-80"
                        style={{ color: 'var(--danger)' }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* 4. Manage Exercises */}
      <section className="bb-widget p-4 space-y-3.5">
        <div className="flex items-center gap-2">
          <Dumbbell className="h-4 w-4" style={{ color: 'var(--accent-text)' }} />
          <div>
            <h2 className="text-base font-extrabold">Manage Exercises</h2>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              Anyone can add new exercises. Only Joel can remove them.
            </p>
          </div>
        </div>

        <form onSubmit={handleAddExercise} className="space-y-2">
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              type="text"
              value={newExerciseName}
              onChange={(e) => setNewExerciseName(e.target.value)}
              placeholder="Exercise name (e.g. Barbell Row)"
              aria-label="Manage new exercise name"
              className="bb-input flex-1 px-3 py-2 text-sm"
            />
            <select
              value={newExerciseCategory}
              onChange={(e) => setNewExerciseCategory(e.target.value as ExerciseCategory)}
              aria-label="Manage new exercise category"
              className="bb-input px-3 py-2 text-sm"
            >
              <option value="barbell">Barbell (kg)</option>
              <option value="dumbbell">Dumbbell (kg / DB)</option>
              <option value="machine">Machine / Cable (kg)</option>
              <option value="bodyweight">Bodyweight (reps)</option>
              <option value="pullup">Pull-up modes</option>
            </select>
          </div>
          <button
            type="submit"
            disabled={!newExerciseName.trim()}
            className="bb-btn-primary w-full py-2.5 text-xs"
          >
            Add Exercise
          </button>
        </form>

        {exerciseError && (
          <p
            role="alert"
            className="rounded-xl px-3 py-2 text-xs font-semibold"
            style={{ backgroundColor: 'var(--danger-soft)', color: 'var(--danger)' }}
          >
            {exerciseError}
          </p>
        )}

        <div className="space-y-1.5 pt-1">
          {snapshot.exercises.map((ex) => {
            const isConfirming = confirmDeleteExerciseId === ex.id;
            return (
              <div
                key={ex.id}
                className="bb-subcard flex items-center justify-between px-3 py-2"
              >
                <div>
                  <div className="text-sm font-bold">{ex.name}</div>
                  <div className="text-[11px] capitalize" style={{ color: 'var(--text-muted)' }}>
                    {ex.category === 'pullup'
                      ? 'Assisted / Bodyweight / +kg'
                      : ex.category === 'dumbbell'
                        ? 'Dumbbell (kg / DB)'
                        : `${ex.category} (${ex.category === 'bodyweight' ? 'reps' : 'kg'})`}
                  </div>
                </div>

                {isJoelAdmin && (
                  <div>
                    {isConfirming ? (
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => void handleDeleteExercise(ex.id)}
                          aria-label={`Confirm remove exercise ${ex.name}`}
                          className="rounded-lg px-2.5 py-1 text-xs font-bold text-white"
                          style={{ backgroundColor: 'var(--danger)' }}
                        >
                          Confirm
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteExerciseId(null)}
                          className="bb-pill-idle rounded-lg px-2 py-1 text-xs"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteExerciseId(ex.id)}
                        aria-label={`Remove exercise ${ex.name}`}
                        className="rounded-lg p-1.5 transition hover:opacity-80"
                        style={{ color: 'var(--danger)' }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* 5. Sync Status */}
      <section className="bb-widget flex items-center justify-between p-4">
        <div>
          <div className="text-xs font-extrabold uppercase tracking-wider">
            {snapshot.mode === 'supabase' ? 'Supabase Cloud Realtime' : 'Local Realtime Store'}
          </div>
          <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
            {snapshot.mode === 'supabase'
              ? 'Synced across all crew phones via Postgres Realtime.'
              : 'Synced instantly across browser tabs; configure Supabase env vars for cloud sync.'}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void store.refresh()}
            aria-label="Force sync now"
            className="bb-pill-idle flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            <span>Sync</span>
          </button>

          {snapshot.mode === 'supabase' && store.signOutCrew && (
            <button
              type="button"
              onClick={() => void store.signOutCrew?.()}
              className="rounded-xl px-3 py-2 text-xs font-bold"
              style={{ backgroundColor: 'var(--danger-soft)', color: 'var(--danger)' }}
            >
              Sign Out
            </button>
          )}
        </div>
      </section>
    </div>
  );
}
