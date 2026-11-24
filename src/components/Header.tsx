import { Dumbbell, ShieldCheck, Wifi, WifiOff } from 'lucide-react';
import { useApp } from '../context/AppContext';
import type { AppTab } from '../types/models';

interface HeaderProps {
  onSelectTab: (tab: AppTab) => void;
}

export function Header({ onSelectTab }: HeaderProps) {
  const { mainUser, snapshot } = useApp();

  const isOffline = snapshot.syncStatus === 'offline';

  return (
    <header
      className="sticky top-0 z-30 border-b px-4 py-3 backdrop-blur-md"
      style={{
        backgroundColor: 'color-mix(in srgb, var(--bg-surface) 88%, transparent)',
        borderColor: 'var(--accent-border)',
      }}
    >
      <div className="mx-auto flex max-w-lg items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <div
            className="flex h-9 w-9 items-center justify-center rounded-xl"
            style={{
              backgroundColor: 'var(--accent-soft)',
              border: '1.5px solid var(--accent-border)',
              color: 'var(--accent-text)',
            }}
          >
            <Dumbbell className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-base font-extrabold tracking-tight leading-tight">
              Barbell Buddy
            </h1>
            <div className="flex items-center gap-1.5 text-[11px]" style={{ color: 'var(--text-muted)' }}>
              {isOffline ? (
                <>
                  <WifiOff className="h-3 w-3 text-rose-500" />
                  <span>Offline</span>
                </>
              ) : (
                <>
                  <span
                    className="inline-block h-2 w-2 rounded-full"
                    style={{ backgroundColor: 'var(--accent)' }}
                  />
                  <Wifi className="h-3 w-3" style={{ color: 'var(--accent-text)' }} />
                  <span>
                    {snapshot.mode === 'supabase' ? 'Live Cloud Sync' : 'Live Realtime Sync'}
                  </span>
                </>
              )}
            </div>
          </div>
        </div>

        {mainUser && (
          <button
            type="button"
            onClick={() => onSelectTab('settings')}
            aria-label={`Current user: ${mainUser.name}. Tap to open Settings`}
            className="flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold transition active:scale-95"
            style={{
              backgroundColor: 'var(--bg-elevated)',
              border: '1.5px solid var(--accent-border)',
              color: 'var(--text-primary)',
            }}
          >
            <span
              className="flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-bold text-white"
              style={{ backgroundColor: mainUser.avatarColor }}
            >
              {mainUser.name.slice(0, 1).toUpperCase()}
            </span>
            <span>{mainUser.name}</span>
            {mainUser.isAdmin && (
              <ShieldCheck
                className="h-3.5 w-3.5"
                style={{ color: 'var(--accent-text)' }}
                aria-label="Admin"
              />
            )}
          </button>
        )}
      </div>
    </header>
  );
}
