import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { isSessionActiveAt, msUntilExpiry } from '../lib/dates';
import { createDefaultDataStore } from '../lib/storeFactory';
import type {
  DataStore,
  Lifter,
  StoreSnapshot,
  WorkoutSession,
} from '../types/models';

const MAIN_USER_STORAGE_KEY = 'bb_main_user_id_v1';

export interface SessionLoggerDraft {
  sessionId: string | null;
  lifterId: string;
  exerciseId: string;
  repsIndex: number;
  weightIndex: number;
  initializedKey: string;
  customized: boolean;
}

const INITIAL_SESSION_DRAFT: SessionLoggerDraft = {
  sessionId: null,
  lifterId: '',
  exerciseId: '',
  repsIndex: 7,
  weightIndex: 1,
  initializedKey: '',
  customized: false,
};

interface AppContextValue {
  store: DataStore;
  snapshot: StoreSnapshot;
  isReady: boolean;
  mainUser: Lifter | null;
  activeSessionForMainUser: WorkoutSession | null;
  otherActiveSessions: WorkoutSession[];
  completedSessions: WorkoutSession[];
  deletedSessions: WorkoutSession[];
  pendingAdminTarget: Lifter | null;
  sessionDraft: SessionLoggerDraft;
  setSessionDraft: React.Dispatch<React.SetStateAction<SessionLoggerDraft>>;
  requestSwitchMainUser: (lifter: Lifter) => void;
  cancelAdminUnlock: () => void;
  completeAdminUnlockWithPin: (pin: string) => Promise<boolean>;
}

const AppContext = createContext<AppContextValue | null>(null);

export interface AppProviderProps {
  children: ReactNode;
  store?: DataStore;
  mainUserStorageKey?: string;
}

export function AppProvider({
  children,
  store: externalStore,
  mainUserStorageKey = MAIN_USER_STORAGE_KEY,
}: AppProviderProps) {
  const storeRef = useRef<DataStore | null>(externalStore ?? null);
  if (!storeRef.current) {
    storeRef.current = createDefaultDataStore();
  }
  const store = storeRef.current;

  const snapshot = useSyncExternalStore(
    useCallback((cb) => store.subscribe(cb), [store]),
    useCallback(() => store.getSnapshot(), [store]),
    useCallback(() => store.getSnapshot(), [store]),
  );

  const [isReady, setIsReady] = useState(false);
  const [mainUserId, setMainUserId] = useState<string | null>(() => {
    try {
      return localStorage.getItem(mainUserStorageKey);
    } catch {
      return null;
    }
  });
  const [pendingAdminTarget, setPendingAdminTarget] = useState<Lifter | null>(null);
  const [sessionDraft, setSessionDraft] = useState<SessionLoggerDraft>(INITIAL_SESSION_DRAFT);
  const [, setClockTick] = useState(0);

  useEffect(() => {
    let mounted = true;
    void store.initialize().finally(() => {
      if (mounted) setIsReady(true);
    });

    return () => {
      mounted = false;
      if (!externalStore) {
        store.dispose();
      }
    };
  }, [store, externalStore]);

  // Resync and sweep expired sessions when mobile device wakes or reconnects
  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void store.refresh();
      }
    };
    const onOnline = () => {
      void store.refresh();
    };

    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('online', onOnline);
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('online', onOnline);
    };
  }, [store]);

  // Schedule exact 23:59 auto-finalization timer + periodic check
  useEffect(() => {
    const activeSessions = snapshot.sessions.filter((s) => s.status === 'active');
    if (activeSessions.length === 0) return;

    const earliestExpiryMs = activeSessions.reduce((min, s) => {
      const wait = msUntilExpiry(s.expiresAt);
      return Math.min(min, wait);
    }, Infinity);

    const exactTimeout = setTimeout(
      () => {
        void store.sweepExpiredSessions().then(() => {
          setClockTick((n) => n + 1);
        });
      },
      Math.min(earliestExpiryMs + 25, 2_147_483_000),
    );

    const interval = setInterval(() => {
      void store.sweepExpiredSessions();
    }, 15_000);

    return () => {
      clearTimeout(exactTimeout);
      clearInterval(interval);
    };
  }, [snapshot.sessions, store]);

  const mainUser = useMemo(() => {
    if (!mainUserId) return null;
    return snapshot.lifters.find((l) => l.id === mainUserId) ?? null;
  }, [mainUserId, snapshot.lifters]);

  // Clear stale mainUserId if that user was deleted
  useEffect(() => {
    if (isReady && mainUserId && snapshot.lifters.length > 0 && !mainUser) {
      setMainUserId(null);
      try {
        localStorage.removeItem(mainUserStorageKey);
      } catch {
        // ignore
      }
    }
  }, [isReady, mainUserId, mainUser, snapshot.lifters.length, mainUserStorageKey]);

  const commitMainUser = useCallback(
    (lifterId: string) => {
      setMainUserId(lifterId);
      try {
        localStorage.setItem(mainUserStorageKey, lifterId);
      } catch {
        // ignore
      }
    },
    [mainUserStorageKey],
  );

  const requestSwitchMainUser = useCallback(
    (lifter: Lifter) => {
      if (lifter.id === mainUser?.id) return;
      if (lifter.isAdmin) {
        setPendingAdminTarget(lifter);
        return;
      }
      commitMainUser(lifter.id);
    },
    [mainUser?.id, commitMainUser],
  );

  const cancelAdminUnlock = useCallback(() => {
    setPendingAdminTarget(null);
  }, []);

  const completeAdminUnlockWithPin = useCallback(
    async (pin: string): Promise<boolean> => {
      if (!pendingAdminTarget) return false;
      const valid = await store.verifyAdminPin(pin);
      if (valid) {
        commitMainUser(pendingAdminTarget.id);
        setPendingAdminTarget(null);
        return true;
      }
      return false;
    },
    [pendingAdminTarget, store, commitMainUser],
  );

  const activeSessionForMainUser = useMemo(() => {
    if (!mainUser) return null;
    const now = new Date();
    return (
      snapshot.sessions.find(
        (s) => isSessionActiveAt(s, now) && s.participantIds.includes(mainUser.id),
      ) ?? null
    );
  }, [mainUser, snapshot.sessions]);

  const otherActiveSessions = useMemo(() => {
    if (!mainUser) return [];
    const now = new Date();
    return snapshot.sessions.filter(
      (s) => isSessionActiveAt(s, now) && !s.participantIds.includes(mainUser.id),
    );
  }, [mainUser, snapshot.sessions]);

  const completedSessions = useMemo(() => {
    const now = new Date();
    return snapshot.sessions.filter((s) => !s.deletedAt && !isSessionActiveAt(s, now));
  }, [snapshot.sessions]);

  const deletedSessions = useMemo(() => {
    return [...snapshot.sessions]
      .filter((s) => Boolean(s.deletedAt))
      .sort(
        (a, b) =>
          (b.deletedAt ?? '').localeCompare(a.deletedAt ?? '') ||
          b.sessionDate.localeCompare(a.sessionDate),
      );
  }, [snapshot.sessions]);

  // Reset logger draft when an active session ends so the next workout starts fresh
  useEffect(() => {
    if (!activeSessionForMainUser && sessionDraft.sessionId !== null) {
      setSessionDraft(INITIAL_SESSION_DRAFT);
    }
  }, [activeSessionForMainUser, sessionDraft.sessionId]);

  const value = useMemo<AppContextValue>(
    () => ({
      store,
      snapshot,
      isReady,
      mainUser,
      activeSessionForMainUser,
      otherActiveSessions,
      completedSessions,
      deletedSessions,
      pendingAdminTarget,
      sessionDraft,
      setSessionDraft,
      requestSwitchMainUser,
      cancelAdminUnlock,
      completeAdminUnlockWithPin,
    }),
    [
      store,
      snapshot,
      isReady,
      mainUser,
      activeSessionForMainUser,
      otherActiveSessions,
      completedSessions,
      deletedSessions,
      pendingAdminTarget,
      sessionDraft,
      requestSwitchMainUser,
      cancelAdminUnlock,
      completeAdminUnlockWithPin,
    ],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) {
    throw new Error('useApp must be used within an AppProvider.');
  }
  return ctx;
}
