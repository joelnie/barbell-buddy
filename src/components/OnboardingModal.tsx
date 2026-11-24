import { Dumbbell, Lock, UserCheck } from 'lucide-react';
import { useApp } from '../context/AppContext';

export function OnboardingModal() {
  const { snapshot, mainUser, requestSwitchMainUser } = useApp();

  if (mainUser) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="onboarding-title"
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
    >
      <div className="bb-widget w-full max-w-sm p-6">
        <div className="mb-5 flex flex-col items-center text-center">
          <div
            className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl"
            style={{
              backgroundColor: 'var(--accent-soft)',
              border: '1.5px solid var(--accent-border)',
              color: 'var(--accent-text)',
            }}
          >
            <Dumbbell className="h-6 w-6" />
          </div>
          <h2 id="onboarding-title" className="text-xl font-extrabold">
            Who&apos;s using this phone?
          </h2>
          <p className="mt-1 text-xs" style={{ color: 'var(--text-muted)' }}>
            Choose your main profile for this device. You can switch anytime in Settings.
          </p>
        </div>

        <div className="space-y-2.5">
          {snapshot.lifters.map((lifter) => (
            <button
              key={lifter.id}
              type="button"
              onClick={() => requestSwitchMainUser(lifter)}
              className="bb-subcard flex w-full items-center justify-between px-4 py-3.5 text-left transition hover:opacity-95 active:scale-[0.99]"
            >
              <div className="flex items-center gap-3">
                <span
                  aria-hidden="true"
                  className="flex h-9 w-9 items-center justify-center rounded-full text-sm font-extrabold text-white"
                  style={{ backgroundColor: lifter.avatarColor }}
                >
                  {lifter.name.slice(0, 1).toUpperCase()}
                </span>
                <div>
                  <div className="flex items-center gap-1.5 text-sm font-bold">
                    <span>{lifter.name}</span>
                    {lifter.isAdmin && (
                      <span
                        className="rounded-full px-2 py-0.5 text-[10px] font-bold"
                        style={{
                          backgroundColor: 'var(--accent-soft)',
                          color: 'var(--accent-text)',
                        }}
                      >
                        Admin
                      </span>
                    )}
                  </div>
                  <div className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                    {lifter.isAdmin ? 'PIN or Face ID required' : 'Tap to continue'}
                  </div>
                </div>
              </div>
              {lifter.isAdmin ? (
                <Lock className="h-4 w-4" style={{ color: 'var(--text-muted)' }} />
              ) : (
                <UserCheck className="h-4 w-4" style={{ color: 'var(--accent-text)' }} />
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
