import { useCallback, useEffect, useState, type ReactElement } from 'react';

import { t } from '../../shared/i18n';

import {

  Button,

  Card,

  ErrorState,

  LoadingState,

  Meter,

  Switch,

} from '../components/ui';

import { useEventRefetch } from '../hooks/use-event-refetch';

import { useCoreService } from '../hooks/use-core-service';

import { ExplainBubble } from '../shell/app-state';



interface SettingsData {

  local: Record<string, unknown>;

  kv: Record<string, unknown>;

  budget: { used: number; cap: number };

}



interface ModelInfo {

  id: string;

  name: string;

  source: 'local' | 'claude';

}



const SETUP_STEPS = [

  'welcome',

  'paths',

  'team-repo',

  'people',

  'repos',

  'connectors',

  'ai',

  'review',

] as const;



export function SettingsScreen(): ReactElement {

  const { invoke } = useCoreService();

  const [loading, setLoading] = useState(true);

  const [error, setError] = useState<string | null>(null);

  const [settings, setSettings] = useState<SettingsData | null>(null);

  const [models, setModels] = useState<ModelInfo[]>([]);

  const [qualityFallback, setQualityFallback] = useState(false);

  const [connectorStatus, setConnectorStatus] = useState<Record<string, string>>({});
  const [diagPath, setDiagPath] = useState<string | null>(null);



  const refresh = useCallback(async () => {

    setLoading(true);

    setError(null);

    const [settingsRes, modelsRes, budgetRes] = await Promise.all([

      invoke('settings', 'get'),

      invoke('ai', 'listModels'),

      invoke('settings', 'getBudget'),

    ]);

    if (!settingsRes.ok) {

      setError(settingsRes.error.message);

    } else {

      const data = settingsRes.data as SettingsData;

      setSettings(data);

      setQualityFallback(data.kv.qualityFallback === true);

    }

    if (modelsRes.ok) {

      const m = modelsRes.data as { models?: ModelInfo[] };

      setModels(m.models ?? (modelsRes.data as ModelInfo[]));

    }

    if (budgetRes.ok) {

      const b = budgetRes.data as { used: number; cap: number };

      setSettings((prev) => (prev !== null ? { ...prev, budget: b } : prev));

    }

    setLoading(false);

  }, [invoke]);



  useEffect(() => {

    void refresh();

  }, [refresh]);



  useEventRefetch(refresh);



  const saveKv = useCallback(

    async (key: string, value: unknown) => {

      await invoke('settings', 'set', { key, value });

      void refresh();

    },

    [invoke, refresh],

  );



  const testConnector = useCallback(

    async (connector: string) => {

      const result = await invoke('settings', 'testConnector', { connector });

      setConnectorStatus((prev) => ({

        ...prev,

        [connector]: result.ok
          ? (result.data as { message: string }).message
          : result.error.message,

      }));

    },

    [invoke],

  );

  const exportDiagnostics = useCallback(async () => {
    const result = await invoke('system', 'exportDiagnostics');
    if (result.ok) {
      setDiagPath((result.data as { path: string }).path);
    }
  }, [invoke]);



  if (loading) return <LoadingState message={t('loading', 'Loading…')} />;

  if (error !== null) return <ErrorState message={error} />;

  if (settings === null) return <ErrorState message={t('settings.empty', 'No settings')} />;



  const budget = settings.budget ?? { used: 0, cap: 10000 };

  const budgetPct = budget.cap > 0
    ? Math.round((budget.used / budget.cap) * 100)
    : 0;



  return (

    <div className="screen settings-screen">

      <header className="screen-header">

        <h1>{t('nav.settings', 'Settings & AI')}</h1>

      </header>



      <div className="settings-grid">

        <Card title={t('settings.models', 'Models')}>

          <ExplainBubble

            title={t('settings.modelsExplain.title', 'AI models')}

            text={t('settings.modelsExplain.text', 'Local Ollama is default; Claude is opt-in and metered.')}

          />

          {models.length === 0 ? (

            <p className="muted">{t('settings.noModels', 'No models configured')}</p>

          ) : (

            <ul>

              {models.map((m) => (

                <li key={m.id}>{m.name} <span className="muted">({m.source})</span></li>

              ))}

            </ul>

          )}

          <Switch

            label={t('settings.qualityFallback', 'Quality fallback to Claude')}

            checked={qualityFallback}

            onChange={(e) => {

              setQualityFallback(e.target.checked);

              void saveKv('qualityFallback', e.target.checked);

            }}

          />

        </Card>



        <Card title={t('settings.budget', 'Claude budget')}>

          <p>

            {budget.used} / {budget.cap} {t('settings.tokens', 'tokens this week')}

          </p>

          <Meter value={budgetPct} label={t('settings.budgetUsed', 'Budget used')} variant={budgetPct > 80 ? 'danger' : 'default'} />

        </Card>



        <Card title={t('settings.connectors', 'Connectors')}>

          {['github', 'slack', 'rss', 'ollama', 'git'].map((c) => (

            <div key={c} className="connector-row">

              <span>{c}</span>

              <Button variant="sm" onClick={() => void testConnector(c)}>

                {t('settings.test', 'Test')}

              </Button>

              {connectorStatus[c] !== undefined && (

                <span className="muted">{connectorStatus[c]}</span>

              )}

            </div>

          ))}

        </Card>



        <Card title={t('settings.feeds', 'News feeds')}>

          <p className="muted">{t('settings.feedsHint', 'Configure RSS feeds in team repo cairn.config.yaml')}</p>

        </Card>



        <Card title={t('settings.diagnostics', 'Diagnostics')}>

          <p className="muted">{t('settings.diagnosticsHint', 'Export redacted logs and runtime info for support.')}</p>

          <Button variant="sm" onClick={() => void exportDiagnostics()}>

            {t('settings.exportDiagnostics', 'Export diagnostics')}

          </Button>

          {diagPath !== null && <p className="muted">{diagPath}</p>}

        </Card>



        <Card title={t('settings.privacy', 'Privacy')}>

          <ul className="privacy-list">

            <li>{t('settings.privacy1', 'No code in WIP signals')}</li>

            <li>{t('settings.privacy2', 'Meeting audio stays on-device')}</li>

            <li>{t('settings.privacy3', 'Secrets in OS keychain only')}</li>

            <li>{t('settings.privacy4', 'Claude only on explicit action')}</li>

          </ul>

        </Card>

      </div>

    </div>

  );

}



export function SetupScreen(): ReactElement {

  const { invoke, subscribe } = useCoreService();

  const [step, setStep] = useState(0);

  const [progress, setProgress] = useState({ pct: 0, label: '' });

  const [state, setState] = useState<{ complete: boolean; step: string; peopleCount: number } | null>(null);

  const [running, setRunning] = useState(false);
  const [runtime, setRuntime] = useState<{
    git?: { available: boolean; message: string };
    ollama?: { available: boolean; message: string };
    whisper?: { available: boolean; message: string };
  } | null>(null);



  const refresh = useCallback(async () => {

    const result = await invoke('setup', 'getState');

    if (result.ok) {

      setState(result.data as typeof state);

    }

    const status = await invoke('system', 'getStatus');

    if (status.ok) {

      const data = status.data as { runtime?: typeof runtime };

      setRuntime(data.runtime ?? null);

    }

  }, [invoke]);



  useEffect(() => {

    void refresh();

    return subscribe('setup.progress', (payload) => {

      setProgress({ pct: payload.pct, label: payload.label });

      const idx = SETUP_STEPS.indexOf(payload.step as (typeof SETUP_STEPS)[number]);

      if (idx >= 0) setStep(idx);

    });

  }, [refresh, subscribe]);



  const runStep = useCallback(async () => {

    setRunning(true);

    const currentStep = SETUP_STEPS[step];

    await invoke('setup', 'run', { step: currentStep });

    setRunning(false);

    if (step < SETUP_STEPS.length - 1) {

      setStep((s) => s + 1);

    } else {

      void refresh();

    }

  }, [invoke, step, refresh]);



  const cancel = useCallback(async () => {

    await invoke('setup', 'cancel');

    setRunning(false);

  }, [invoke]);



  const currentStep = SETUP_STEPS[step];



  return (

    <div className="screen setup-screen">

      <header className="screen-header">

        <h1>{t('nav.setup', 'Setup')}</h1>

      </header>



      <Card title={t('setup.wizard', 'Setup wizard')}>

        <div className="setup-progress">

          <Meter value={progress.pct || ((step + 1) / SETUP_STEPS.length) * 100} label={progress.label || currentStep} />

        </div>



        <ol className="setup-steps">

          {SETUP_STEPS.map((s, i) => (

            <li key={s} className={i === step ? 'setup-steps__active' : i < step ? 'setup-steps__done' : ''}>

              {t(`setup.step.${s}`, s)}

            </li>

          ))}

        </ol>



        <div className="setup-step-content">

          <h2>{t(`setup.step.${currentStep}`, currentStep)}</h2>

          <p>{t(`setup.stepDesc.${currentStep}`, `Configure ${currentStep} for your squad.`)}</p>

          {state !== null && (

            <p className="muted">

              {state.peopleCount} {t('setup.people', 'people')} · {state.step}

            </p>

          )}

          {runtime !== null && (

            <ul className="setup-runtime">

              <li className={runtime.git?.available ? 'ok' : 'warn'}>

                Git: {runtime.git?.message ?? 'unknown'}

              </li>

              <li className={runtime.ollama?.available ? 'ok' : 'warn'}>

                Ollama: {runtime.ollama?.message ?? 'unknown'}

              </li>

              <li className={runtime.whisper?.available ? 'ok' : 'warn'}>

                STT: {runtime.whisper?.message ?? 'unknown'}

              </li>

            </ul>

          )}

        </div>



        <div className="btn-row">

          <Button onClick={() => void runStep()} disabled={running || state?.complete === true}>

            {step < SETUP_STEPS.length - 1 ? t('setup.next', 'Next') : t('setup.finish', 'Finish')}

          </Button>

          {running && (

            <Button variant="ghost" onClick={() => void cancel()}>

              {t('action.cancel', 'Cancel')}

            </Button>

          )}

        </div>



        {state?.complete === true && (

          <p className="setup-complete">{t('setup.completeMsg', 'Setup complete!')}</p>

        )}

      </Card>

    </div>

  );

}


