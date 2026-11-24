import { useEffect, useState, type FormEvent } from 'react';
import { Delete, Lock, ScanFace, X } from 'lucide-react';
import { useApp } from '../context/AppContext';
import {
  hasEnrolledFaceId,
  isPlatformFaceIdAvailable,
  verifyFaceIdForAdmin,
} from '../lib/webauthn';

export function AdminUnlockModal() {
  const {
    pendingAdminTarget,
    cancelAdminUnlock,
    completeAdminUnlockWithPin,
    completeAdminUnlockWithFaceId,
  } = useApp();

  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [faceIdAvailable, setFaceIdAvailable] = useState(false);
  const [faceIdEnrolled, setFaceIdEnrolled] = useState(false);

  useEffect(() => {
    if (!pendingAdminTarget) {
      setPin('');
      setError(null);
      setBusy(false);
      return;
    }

    let active = true;
    const enrolled = hasEnrolledFaceId(pendingAdminTarget.id);
    setFaceIdEnrolled(enrolled);

    void isPlatformFaceIdAvailable().then((supported) => {
      if (active) setFaceIdAvailable(supported);
    });

    return () => {
      active = false;
    };
  }, [pendingAdminTarget]);

  if (!pendingAdminTarget) return null;

  const submitPin = async (candidate: string) => {
    if (candidate.length !== 4 || busy) return;
    setBusy(true);
    setError(null);
    try {
      const ok = await completeAdminUnlockWithPin(candidate);
      if (!ok) {
        setError('Väärä PIN-koodi. Yritä uudelleen.');
        setPin('');
      }
    } finally {
      setBusy(false);
    }
  };

  const handleDigit = (digit: string) => {
    if (busy || pin.length >= 4) return;
    const next = `${pin}${digit}`;
    setPin(next);
    setError(null);
    if (next.length === 4) {
      void submitPin(next);
    }
  };

  const handleBackspace = () => {
    if (busy) return;
    setPin((prev) => prev.slice(0, -1));
    setError(null);
  };

  const handleFormSubmit = (e: FormEvent) => {
    e.preventDefault();
    void submitPin(pin);
  };

  const handleFaceIdUnlock = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const ok = await verifyFaceIdForAdmin(pendingAdminTarget.id);
      if (ok) {
        completeAdminUnlockWithFaceId();
      } else {
        setError('Face ID -tunnistus ei onnistunut. Käytä PIN-koodia.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Face ID -tunnistus peruutettiin.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="admin-unlock-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
    >
      <div className="bb-widget relative w-full max-w-xs p-5">
        <button
          type="button"
          onClick={cancelAdminUnlock}
          aria-label="Peruuta ylläpitäjän kirjautuminen"
          className="absolute top-3.5 right-3.5 rounded-full p-1.5 transition hover:opacity-80"
          style={{ color: 'var(--text-muted)' }}
        >
          <X className="h-5 w-5" />
        </button>

        <div className="mb-4 flex flex-col items-center text-center">
          <div
            className="mb-2.5 flex h-11 w-11 items-center justify-center rounded-2xl"
            style={{
              backgroundColor: 'var(--accent-soft)',
              border: '1.5px solid var(--accent-border)',
              color: 'var(--accent-text)',
            }}
          >
            <Lock className="h-5 w-5" />
          </div>
          <h2 id="admin-unlock-title" className="text-lg font-extrabold">
            Vaihda käyttäjäksi {pendingAdminTarget.name}
          </h2>
          <p className="mt-0.5 text-xs" style={{ color: 'var(--text-muted)' }}>
            Syötä käyttäjän {pendingAdminTarget.name} 4-numeroinen ylläpitäjän PIN-koodi
            {faceIdAvailable && faceIdEnrolled ? ' tai käytä Face ID:tä' : ''}.
          </p>
        </div>

        {faceIdAvailable && faceIdEnrolled && (
          <button
            type="button"
            onClick={handleFaceIdUnlock}
            disabled={busy}
            className="bb-pill-active mb-4 flex w-full items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-bold transition active:scale-[0.98]"
          >
            <ScanFace className="h-5 w-5" />
            <span>Avaa Face ID:llä</span>
          </button>
        )}

        <form onSubmit={handleFormSubmit}>
          <label htmlFor="joel-pin-input" className="sr-only">
            Joelin ylläpitäjän PIN-koodi
          </label>
          <input
            id="joel-pin-input"
            aria-label="Joelin ylläpitäjän PIN-koodi"
            type="password"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={4}
            value={pin}
            onChange={(e) => {
              const cleaned = e.target.value.replace(/\D/g, '').slice(0, 4);
              setPin(cleaned);
              setError(null);
              if (cleaned.length === 4) {
                void submitPin(cleaned);
              }
            }}
            placeholder="••••"
            className="bb-input mb-3 w-full py-2.5 text-center text-xl font-extrabold tracking-[0.55em]"
          />

          {error && (
            <p
              role="alert"
              className="mb-3 rounded-xl px-3 py-2 text-center text-xs font-semibold"
              style={{ backgroundColor: 'var(--danger-soft)', color: 'var(--danger)' }}
            >
              {error}
            </p>
          )}

          <div className="grid grid-cols-3 gap-2">
            {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => handleDigit(d)}
                disabled={busy}
                className="bb-subcard py-3 text-base font-bold transition active:scale-95"
              >
                {d}
              </button>
            ))}
            <button
              type="button"
              onClick={() => {
                setPin('');
                setError(null);
              }}
              disabled={busy}
              className="bb-subcard py-3 text-xs font-semibold transition active:scale-95"
              style={{ color: 'var(--text-muted)' }}
            >
              Tyhjennä
            </button>
            <button
              type="button"
              onClick={() => handleDigit('0')}
              disabled={busy}
              className="bb-subcard py-3 text-base font-bold transition active:scale-95"
            >
              0
            </button>
            <button
              type="button"
              onClick={handleBackspace}
              disabled={busy}
              aria-label="Poista PIN-numero"
              className="bb-subcard flex items-center justify-center py-3 transition active:scale-95"
            >
              <Delete className="h-4 w-4" />
            </button>
          </div>

          <button
            type="submit"
            disabled={busy || pin.length !== 4}
            className="bb-btn-primary mt-3 w-full py-2.5 text-sm"
          >
            {busy ? 'Tarkistetaan…' : 'Avaa lukitus'}
          </button>
        </form>
      </div>
    </div>
  );
}
