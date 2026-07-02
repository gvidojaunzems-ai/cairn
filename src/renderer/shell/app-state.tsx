import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react';
import { Popover, type ExplainInfo } from '../components/ui';
import { t } from '../../shared/i18n';
import type { ScreenId } from './navigation';

interface AppState {
  screen: ScreenId;
  setScreen: (id: ScreenId) => void;
  explainMode: boolean;
  toggleExplain: () => void;
  syncLabel: string;
  setSyncLabel: (label: string) => void;
}

const AppStateContext = createContext<AppState | null>(null);

export function AppStateProvider({ children }: { children: ReactNode }): ReactElement {
  const [screen, setScreen] = useState<ScreenId>('today');
  const [explainMode, setExplainMode] = useState(true);
  const [syncLabel, setSyncLabel] = useState(t('sync.offline', 'Offline cache'));

  const toggleExplain = useCallback(() => setExplainMode((v) => !v), []);

  const value = useMemo(
    () => ({ screen, setScreen, explainMode, toggleExplain, syncLabel, setSyncLabel }),
    [screen, explainMode, toggleExplain, syncLabel],
  );

  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>;
}

export function useAppState(): AppState {
  const ctx = useContext(AppStateContext);
  if (ctx === null) {
    throw new Error('useAppState must be used within AppStateProvider');
  }
  return ctx;
}

interface ExplainBubbleProps extends ExplainInfo {}

export function ExplainBubble({ title, text, how }: ExplainBubbleProps): ReactElement | null {
  const { explainMode } = useAppState();
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLButtonElement>(null);

  if (!explainMode) {
    return null;
  }

  return (
    <>
      <button
        ref={anchorRef}
        type="button"
        className="explain-dot"
        aria-label={`${title}: ${text}`}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        ⓘ
      </button>
      <Popover
        info={{ title, text, how }}
        open={open}
        onClose={() => setOpen(false)}
        anchorRef={anchorRef}
      />
    </>
  );
}
