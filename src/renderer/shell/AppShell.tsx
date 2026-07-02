import { useCallback, useEffect, type ReactElement, type ReactNode } from 'react';
import { t } from '../../shared/i18n';
import { Avatar, Pill } from '../components/ui';
import { useCoreService } from '../hooks/use-core-service';
import { useAppState } from './app-state';
import { NAV_GROUPS, NAV_ITEMS, type ScreenId } from './navigation';

interface AppShellProps {
  children: ReactNode;
}

export function AppShell({ children }: AppShellProps): ReactElement {
  const { screen, setScreen, explainMode, toggleExplain, syncLabel, setSyncLabel } = useAppState();
  const { invoke, subscribe } = useCoreService();

  const refreshSync = useCallback(async () => {
    const result = await invoke('git', 'getSyncState');
    if (result.ok) {
      const sync = result.data as { message?: string; status?: string };
      setSyncLabel(sync.message ?? sync.status ?? t('sync.unknown', 'Sync'));
    }
  }, [invoke, setSyncLabel]);

  useEffect(() => {
    void refreshSync();
    return subscribe('sync.updated', () => {
      void refreshSync();
    });
  }, [refreshSync, subscribe]);

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="topbar__brand">
          <span className="topbar__logo" aria-hidden="true">◆</span>
          <span className="topbar__title">{t('app.mainLandmark')}</span>
        </div>
        <Pill variant="sync" className="sync-pill">{syncLabel}</Pill>
        <label className="explain-toggle">
          <input type="checkbox" checked={explainMode} onChange={toggleExplain} />
          {t('shell.explain', 'Explain')}
        </label>
        <Avatar initials="GJ" size="sm" title={t('shell.user', 'User')} />
      </header>
      <div className="app-body">
        <nav className="sidebar" aria-label={t('shell.nav', 'Main navigation')}>
          {NAV_GROUPS.map((group) => (
            <div key={group.id} className="sidebar__group">
              <h2 className="sidebar__group-title">{t(group.labelKey, group.fallback)}</h2>
              <ul className="sidebar__list">
                {NAV_ITEMS.filter((item) => item.group === group.id).map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      className={`sidebar__link${screen === item.id ? ' sidebar__link--active' : ''}`}
                      aria-current={screen === item.id ? 'page' : undefined}
                      onClick={() => setScreen(item.id as ScreenId)}
                    >
                      {t(item.labelKey, item.fallback)}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
        <main className="content" aria-label={t('app.mainLandmark')}>
          {children}
        </main>
      </div>
    </div>
  );
}
