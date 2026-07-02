import type { ReactElement } from 'react';
import { AppStateProvider } from './shell/app-state';
import { AppShell } from './shell/AppShell';
import type { ScreenId } from './shell/navigation';
import {
  DailiesScreen,
  DocsScreen,
  MeetingsScreen,
  NewsScreen,
  ProjectsScreen,
  PulseScreen,
  ReportsScreen,
  SettingsScreen,
  SetupScreen,
  SupportScreen,
  TodayScreen,
} from './screens';
import { useAppState } from './shell/app-state';
import { ToastProvider } from './hooks/use-toast';

function ScreenRouter(): ReactElement {
  const { screen } = useAppState();
  const screens: Record<ScreenId, ReactElement> = {
    today: <TodayScreen />,
    dailies: <DailiesScreen />,
    meetings: <MeetingsScreen />,
    projects: <ProjectsScreen />,
    news: <NewsScreen />,
    reports: <ReportsScreen />,
    pulse: <PulseScreen />,
    docs: <DocsScreen />,
    support: <SupportScreen />,
    setup: <SetupScreen />,
    settings: <SettingsScreen />,
  };
  return screens[screen];
}

export function App(): ReactElement {
  return (
    <AppStateProvider>
      <ToastProvider>
        <AppShell>
          <ScreenRouter />
        </AppShell>
      </ToastProvider>
    </AppStateProvider>
  );
}
