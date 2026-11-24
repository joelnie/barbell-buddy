import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { SecondaryAccent, ThemeMode } from '../types/models';

const THEME_STORAGE_KEY = 'bb_theme_mode_v1';
const ACCENT_STORAGE_KEY = 'bb_secondary_accent_v1';

export interface AccentOption {
  id: SecondaryAccent;
  label: string;
  swatchHex: string;
  description: string;
}

export const SECONDARY_ACCENT_OPTIONS: AccentOption[] = [
  {
    id: 'neon-green',
    label: 'Neonvihreä',
    swatchHex: '#39ff14',
    description: 'Sähäkkä salin neonvihreä',
  },
  {
    id: 'turquoise',
    label: 'Turkoosi',
    swatchHex: '#14b8a6',
    description: 'Raikas sähköinen turkoosi',
  },
  {
    id: 'bright-orange',
    label: 'Kirkkaanoranssi',
    swatchHex: '#ff6b00',
    description: 'Hehkuva levytankooranssi',
  },
  {
    id: 'electric-blue',
    label: 'Sähkönsininen',
    swatchHex: '#3b82f6',
    description: 'Puhdas koboltinsininen',
  },
  {
    id: 'vivid-purple',
    label: 'Kirkkaanvioletti',
    swatchHex: '#a855f7',
    description: 'Näyttävä ultravioletti korostus',
  },
];

const THEME_META_COLORS: Record<ThemeMode, string> = {
  dark: '#090d16',
  light: '#f4f7fb',
  pink: '#fff1f5',
};

interface ThemeContextValue {
  theme: ThemeMode;
  accent: SecondaryAccent;
  setTheme: (next: ThemeMode) => void;
  setAccent: (next: SecondaryAccent) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function readInitialTheme(): ThemeMode {
  try {
    const saved = localStorage.getItem(THEME_STORAGE_KEY);
    if (saved === 'dark' || saved === 'light' || saved === 'pink') {
      return saved;
    }
  } catch {
    // ignore storage errors
  }
  return 'dark';
}

function readInitialAccent(): SecondaryAccent {
  try {
    const saved = localStorage.getItem(ACCENT_STORAGE_KEY) as SecondaryAccent | null;
    if (saved && SECONDARY_ACCENT_OPTIONS.some((o) => o.id === saved)) {
      return saved;
    }
  } catch {
    // ignore storage errors
  }
  return 'neon-green';
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeMode>(readInitialTheme);
  const [accent, setAccentState] = useState<SecondaryAccent>(readInitialAccent);

  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute('data-theme', theme);
    root.setAttribute('data-accent', accent);

    const metaTheme = document.querySelector('meta[name="theme-color"]');
    if (metaTheme) {
      metaTheme.setAttribute('content', THEME_META_COLORS[theme]);
    }
  }, [theme, accent]);

  const setTheme = useCallback((next: ThemeMode) => {
    setThemeState(next);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // ignore
    }
  }, []);

  const setAccent = useCallback((next: SecondaryAccent) => {
    setAccentState(next);
    try {
      localStorage.setItem(ACCENT_STORAGE_KEY, next);
    } catch {
      // ignore
    }
  }, []);

  const value = useMemo(
    () => ({
      theme,
      accent,
      setTheme,
      setAccent,
    }),
    [theme, accent, setTheme, setAccent],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useTheme must be used within a ThemeProvider.');
  }
  return ctx;
}
