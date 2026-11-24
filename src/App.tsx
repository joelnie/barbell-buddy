import { useState } from 'react';
import { AdminUnlockModal } from './components/AdminUnlockModal';
import { BottomNav } from './components/BottomNav';
import { CrewAuthScreen } from './components/CrewAuthScreen';
import { Header } from './components/Header';
import { HistoryTab } from './components/HistoryTab';
import { OnboardingModal } from './components/OnboardingModal';
import { ProgressTab } from './components/ProgressTab';
import { SessionTab } from './components/SessionTab';
import { SettingsTab } from './components/SettingsTab';
import { AppProvider, useApp } from './context/AppContext';
import { ThemeProvider } from './context/ThemeContext';
import type { AppTab, DataStore } from './types/models';

function AppShell() {
  const { snapshot, isReady } = useApp();
  const [activeTab, setActiveTab] = useState<AppTab>('session');

  if (!isReady) {
    return (
      <div className="flex min-h-dvh items-center justify-center p-6 text-sm font-semibold">
        Loading Barbell Buddy…
      </div>
    );
  }

  if (snapshot.authRequired) {
    return <CrewAuthScreen />;
  }

  return (
    <div className="min-h-dvh pb-24">
      <Header onSelectTab={setActiveTab} />

      <main className="mx-auto max-w-lg px-4 pt-4">
        {activeTab === 'session' && <SessionTab />}
        {activeTab === 'history' && <HistoryTab />}
        {activeTab === 'progress' && <ProgressTab />}
        {activeTab === 'settings' && <SettingsTab />}
      </main>

      <BottomNav activeTab={activeTab} onSelectTab={setActiveTab} />
      <OnboardingModal />
      <AdminUnlockModal />
    </div>
  );
}

export interface BarbellBuddyAppProps {
  store?: DataStore;
  mainUserStorageKey?: string;
}

export function App({ store, mainUserStorageKey }: BarbellBuddyAppProps = {}) {
  return (
    <ThemeProvider>
      <AppProvider store={store} mainUserStorageKey={mainUserStorageKey}>
        <AppShell />
      </AppProvider>
    </ThemeProvider>
  );
}

export default App;
