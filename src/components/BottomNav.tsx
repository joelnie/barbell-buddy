import { CalendarClock, Dumbbell, Settings, TrendingUp } from 'lucide-react';
import { useApp } from '../context/AppContext';
import type { AppTab } from '../types/models';

interface BottomNavProps {
  activeTab: AppTab;
  onSelectTab: (tab: AppTab) => void;
}

const NAV_ITEMS: { id: AppTab; label: string; Icon: typeof Dumbbell }[] = [
  { id: 'session', label: 'Treeni', Icon: Dumbbell },
  { id: 'history', label: 'Historia', Icon: CalendarClock },
  { id: 'progress', label: 'Kehitys', Icon: TrendingUp },
  { id: 'settings', label: 'Asetukset', Icon: Settings },
];

export function BottomNav({ activeTab, onSelectTab }: BottomNavProps) {
  const { activeSessionForMainUser } = useApp();

  return (
    <nav
      aria-label="Päänavigaatio"
      className="bb-safe-bottom fixed right-0 bottom-0 left-0 z-30 border-t px-2 pt-2 backdrop-blur-md"
      style={{
        backgroundColor: 'color-mix(in srgb, var(--bg-surface) 92%, transparent)',
        borderColor: 'var(--accent-border)',
      }}
    >
      <div className="mx-auto grid max-w-lg grid-cols-4 gap-1">
        {NAV_ITEMS.map(({ id, label, Icon }) => {
          const isActive = activeTab === id;
          return (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => onSelectTab(id)}
              className={`relative flex flex-col items-center justify-center gap-1 rounded-xl py-2 text-xs font-semibold transition ${
                isActive ? 'bb-pill-active' : ''
              }`}
              style={
                isActive
                  ? undefined
                  : {
                      color: 'var(--text-muted)',
                      border: '1.5px solid transparent',
                    }
              }
            >
              <div className="relative">
                <Icon className="h-5 w-5" />
                {id === 'session' && activeSessionForMainUser && (
                  <span
                    title="Käynnissä oleva treeni"
                    className="absolute -top-1 -right-1.5 h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: 'var(--accent)' }}
                  />
                )}
              </div>
              <span>{label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
