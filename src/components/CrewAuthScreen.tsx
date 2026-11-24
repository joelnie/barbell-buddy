import { useState, type FormEvent } from 'react';
import { Dumbbell, KeyRound } from 'lucide-react';
import { useApp } from '../context/AppContext';

export function CrewAuthScreen() {
  const { store, snapshot } = useApp();
  const [email, setEmail] = useState(snapshot.crewEmail ?? 'crew@barbellbuddy.app');
  const [passcode, setPasscode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!store.signInCrew) return;
    setError(null);
    setSubmitting(true);
    try {
      await store.signInCrew(passcode, email);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Porukan salasanan tarkistus epäonnistui.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-dvh items-center justify-center p-4">
      <div className="bb-widget w-full max-w-sm p-6">
        <div className="mb-5 flex flex-col items-center text-center">
          <div
            className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl"
            style={{
              backgroundColor: 'var(--accent-soft)',
              border: '1.5px solid var(--accent-border)',
              color: 'var(--accent-text)',
            }}
          >
            <Dumbbell className="h-7 w-7" />
          </div>
          <h1 className="text-xl font-extrabold">Barbell Buddy</h1>
          <p className="mt-1 text-sm" style={{ color: 'var(--text-muted)' }}>
            Syötä yhteinen porukan salasana kerran yhdistääksesi puhelimen reaaliaikaiseen salisynkronointiin.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="crew-email" className="mb-1 block text-xs font-semibold">
              Porukan tilin sähköposti
            </label>
            <input
              id="crew-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="bb-input w-full px-3 py-2.5 text-sm"
              required
            />
          </div>

          <div>
            <label htmlFor="crew-passcode" className="mb-1 block text-xs font-semibold">
              Yhteinen porukan salasana
            </label>
            <div className="relative">
              <KeyRound
                className="pointer-events-none absolute top-3 left-3 h-4 w-4"
                style={{ color: 'var(--text-muted)' }}
              />
              <input
                id="crew-passcode"
                type="password"
                value={passcode}
                onChange={(e) => setPasscode(e.target.value)}
                placeholder="Syötä porukan salasana"
                className="bb-input w-full py-2.5 pr-3 pl-9 text-sm"
                required
              />
            </div>
          </div>

          {error && (
            <p
              role="alert"
              className="rounded-xl px-3 py-2 text-xs font-medium"
              style={{ backgroundColor: 'var(--danger-soft)', color: 'var(--danger)' }}
            >
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting || !passcode.trim()}
            className="bb-btn-primary w-full py-3 text-sm"
          >
            {submitting ? 'Yhdistetään…' : 'Yhdistä puhelin'}
          </button>
        </form>
      </div>
    </div>
  );
}
