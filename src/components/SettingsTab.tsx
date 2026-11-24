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
      setUserMessage(`Lisättiin ${created.name}!`);
    } catch (err) {
      setUserError(err instanceof Error ? err.message : 'Käyttäjän lisääminen epäonnistui.');
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
      setUserError(err instanceof Error ? err.message : 'Käyttäjän poistaminen epäonnistui.');
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
      setExerciseError(err instanceof Error ? err.message : 'Liikkeen lisääminen epäonnistui.');
    }
  };

  const handleDeleteExercise = async (targetExerciseId: string) => {
    if (!mainUser) return;
    setExerciseError(null);
    try {
      await store.deleteExercise(targetExerciseId, mainUser.id);
      setConfirmDeleteExerciseId(null);
    } catch (err) {
      setExerciseError(err instanceof Error ? err.message : 'Liikkeen poistaminen epäonnistui.');
    }
  };

  const handleEnrollFaceId = async () => {
    if (!mainUser || !mainUser.isAdmin) return;
    setFaceIdNotice(null);
    try {
      await enrollFaceIdForAdmin(mainUser);
      setFaceIdEnrolled(true);
      setFaceIdNotice('Face ID otettu käyttöön Joelin tiliä varten tällä laitteella.');
    } catch (err) {
      setFaceIdNotice(err instanceof Error ? err.message : 'Face ID:n käyttöönotto epäonnistui.');
    }
  };

  const handleRemoveFaceId = () => {
    clearEnrolledFaceId();
    setFaceIdEnrolled(false);
    setFaceIdNotice('Face ID poistettu tältä laitteelta. PIN-koodi on edelleen käytössä.');
  };

  const themeChoices: { id: ThemeMode; label: string; subtitle: string; bgPreview: string }[] = [
    {
      id: 'light',
      label: 'Vaalea',
      subtitle: 'Raikas päivänvaloteema',
      bgPreview: '#f4f7fb',
    },
    {
      id: 'dark',
      label: 'Tumma',
      subtitle: 'Syvä salinmusta',
      bgPreview: '#090d16',
    },
    {
      id: 'pink',
      label: 'Pinkki / Vaaleanpunainen',
      subtitle: 'Pehmeä ruusunpunainen hehku',
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
            <h2 className="text-base font-extrabold">Vaihda pääkäyttäjää</h2>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              Valitse kenen puhelin tämä on. Joelin tiliin vaihtaminen vaatii PIN-koodin tai Face ID:n.
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
                          Ylläpitäjä
                        </span>
                      )}
                    </div>
                    <div className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                      {isCurrent
                        ? 'Aktiivinen tässä puhelimessa'
                        : lifter.isAdmin
                          ? 'Vaatii 4-numeroisen PIN-koodin tai Face ID:n'
                          : 'Vaihda napauttamalla'}
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
                  <div className="text-xs font-bold">iPhone Face ID Joelille</div>
                  <div className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                    {faceIdEnrolled
                      ? 'Käytössä tällä laitteella nopeaan vaihtoon Joelille.'
                      : faceIdSupported
                        ? 'Salli Face ID 4-numeroisen PIN-koodin rinnalla tällä laitteella.'
                        : 'Face ID vaatii Safarin tai asennetun PWA-sovelluksen iPhonessa HTTPS-yhteydellä.'}
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
                  Poista
                </button>
              ) : (
                <button
                  type="button"
                  disabled={!faceIdSupported}
                  onClick={handleEnrollFaceId}
                  className="bb-btn-primary px-3 py-1.5 text-xs"
                >
                  Ota Face ID käyttöön
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
            <h2 className="text-base font-extrabold">Väriteemat ja reunukset</h2>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              Vaihda vaalean, tumman ja pinkin teeman sekä korostusvärien välillä.
            </p>
          </div>
        </div>

        {/* Base Theme Selector */}
        <div>
          <span
            className="mb-2 block text-xs font-bold uppercase tracking-wider"
            style={{ color: 'var(--text-muted)' }}
          >
            Sovelluksen teema
          </span>
          <div className="grid grid-cols-3 gap-2" role="group" aria-label="Väriteema">
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
              Korostusväri (korttien reunukset ja tehosteet)
            </span>
            <Sparkles className="h-3.5 w-3.5" style={{ color: 'var(--accent-text)' }} />
          </div>

          {theme === 'pink' ? (
            <p className="bb-subcard px-3 py-2.5 text-xs" style={{ color: 'var(--text-secondary)' }}>
              Pinkki / Vaaleanpunainen teema käyttää pehmeitä ruusunpunaisia reunuksia automaattisesti.
              Vaihda <strong>Vaalea</strong>- tai <strong>Tumma</strong>-teemaan valitaksesi oman korostusvärin.
            </p>
          ) : (
            <div
              className="grid grid-cols-2 gap-2 sm:grid-cols-3"
              role="group"
              aria-label="Sovelluksen korostusväri"
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
            <h2 className="text-base font-extrabold">Hallitse käyttäjiä</h2>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              Kuka tahansa voi lisätä uuden treenikaverin. Vain Joel voi poistaa käyttäjiä.
            </p>
          </div>
        </div>

        <form onSubmit={handleAddUser} className="space-y-2.5">
          <div className="flex gap-2">
            <input
              type="text"
              value={newUserName}
              onChange={(e) => setNewUserName(e.target.value)}
              placeholder="Uuden käyttäjän nimi (esim. Alex)"
              aria-label="Uuden käyttäjän nimi"
              className="bb-input flex-1 px-3 py-2 text-sm"
            />
            <button
              type="submit"
              disabled={!newUserName.trim()}
              className="bb-btn-primary px-4 py-2 text-xs"
            >
              Lisää käyttäjä
            </button>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="mr-1 text-[11px] font-semibold" style={{ color: 'var(--text-muted)' }}>
              Tunnusväri:
            </span>
            {AVATAR_COLOR_SWATCHES.map((hex) => (
              <button
                key={hex}
                type="button"
                aria-label={`Valitse tunnusväri ${hex}`}
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
                      (Ylläpitäjä)
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
                          aria-label={`Vahvista käyttäjän ${lifter.name} poisto`}
                          className="rounded-lg px-2.5 py-1 text-xs font-bold text-white"
                          style={{ backgroundColor: 'var(--danger)' }}
                        >
                          Vahvista
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteLifterId(null)}
                          className="bb-pill-idle rounded-lg px-2 py-1 text-xs"
                        >
                          Peruuta
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteLifterId(lifter.id)}
                        aria-label={`Poista käyttäjä ${lifter.name}`}
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
            <h2 className="text-base font-extrabold">Hallitse liikkeitä</h2>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              Kuka tahansa voi lisätä uusia liikkeitä. Vain Joel voi poistaa niitä.
            </p>
          </div>
        </div>

        <form onSubmit={handleAddExercise} className="space-y-2">
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              type="text"
              value={newExerciseName}
              onChange={(e) => setNewExerciseName(e.target.value)}
              placeholder="Liikkeen nimi (esim. Kulmasoutu)"
              aria-label="Hallittavan uuden liikkeen nimi"
              className="bb-input flex-1 px-3 py-2 text-sm"
            />
            <select
              value={newExerciseCategory}
              onChange={(e) => setNewExerciseCategory(e.target.value as ExerciseCategory)}
              aria-label="Hallittavan uuden liikkeen kategoria"
              className="bb-input px-3 py-2 text-sm"
            >
              <option value="barbell">Levytanko (kg)</option>
              <option value="dumbbell">Käsipaino (kg / kp)</option>
              <option value="machine">Laite / Talja (kg)</option>
              <option value="bodyweight">Kehonpaino (toistot)</option>
              <option value="pullup">Leuanveto (Kuminauha / KP / +kg)</option>
            </select>
          </div>
          <button
            type="submit"
            disabled={!newExerciseName.trim()}
            className="bb-btn-primary w-full py-2.5 text-xs"
          >
            Lisää liike
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
            const categoryLabel =
              ex.category === 'pullup'
                ? 'Kuminauha / Kehonpaino / +kg'
                : ex.category === 'dumbbell'
                  ? 'Käsipaino (kg / kp)'
                  : ex.category === 'barbell'
                    ? 'Levytanko (kg)'
                    : ex.category === 'machine'
                      ? 'Laite / Talja (kg)'
                      : 'Kehonpaino (toistot)';

            return (
              <div
                key={ex.id}
                className="bb-subcard flex items-center justify-between px-3 py-2"
              >
                <div>
                  <div className="text-sm font-bold">{ex.name}</div>
                  <div className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                    {categoryLabel}
                  </div>
                </div>

                {isJoelAdmin && (
                  <div>
                    {isConfirming ? (
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => void handleDeleteExercise(ex.id)}
                          aria-label={`Vahvista liikkeen ${ex.name} poisto`}
                          className="rounded-lg px-2.5 py-1 text-xs font-bold text-white"
                          style={{ backgroundColor: 'var(--danger)' }}
                        >
                          Vahvista
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteExerciseId(null)}
                          className="bb-pill-idle rounded-lg px-2 py-1 text-xs"
                        >
                          Peruuta
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteExerciseId(ex.id)}
                        aria-label={`Poista liike ${ex.name}`}
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
            {snapshot.mode === 'supabase' ? 'Supabase-pilvisynkronointi' : 'Paikallinen reaaliaikatila'}
          </div>
          <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
            {snapshot.mode === 'supabase'
              ? 'Synkronoituu kaikkien treenikaverien puhelimiin Postgres Realtimen kautta.'
              : 'Synkronoituu välittömästi välilehtien välillä; lisää Supabase-asetukset pilvisynkronointia varten.'}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void store.refresh()}
            aria-label="Synkronoi nyt"
            className="bb-pill-idle flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            <span>Päivitä</span>
          </button>

          {snapshot.mode === 'supabase' && store.signOutCrew && (
            <button
              type="button"
              onClick={() => void store.signOutCrew?.()}
              className="rounded-xl px-3 py-2 text-xs font-bold"
              style={{ backgroundColor: 'var(--danger-soft)', color: 'var(--danger)' }}
            >
              Kirjaudu ulos
            </button>
          )}
        </div>
      </section>
    </div>
  );
}
