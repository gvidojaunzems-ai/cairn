import { useCallback, useEffect, useMemo, useState, type ReactElement } from 'react';
import { t } from '../../shared/i18n';
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  LoadingState,
  Meter,
  Nudge,
  Pill,
  StatusBadge,
  Tag,
} from '../components/ui';
import { useEventRefetch } from '../hooks/use-event-refetch';
import { useCoreService } from '../hooks/use-core-service';
import { ExplainBubble, useAppState } from '../shell/app-state';
import { CustomizePanel, loadWidgetPrefsFromSettings } from '../widgets/CustomizePanel';
import {
  DEFAULT_WIDGET_PREFS,
  getAllWidgets,
  getWidget,
  registerWidget,
  type WidgetPrefs,
} from '../widgets/registry';

interface TodayDashboard {
  greeting: string;
  date: string;
  sync: { message: string; status: string };
  focusProject: {
    id: string;
    name: string;
    deadlineDays: number;
    burndownPct: number;
    onGoalPct: number;
    status: string;
  } | null;
  widgets: {
    contextResume: { branch: string; lastCommit: string; openFiles: string[]; nextStep: string };
    standupDraft: { yesterday: string; today: string; blockers: string };
    needsAttention: { id: string; label: string; action: string }[];
    squadWip: { person: string; branch: string; unpushedDays: number }[];
    news: { id: string; title: string; why: string }[];
    checks: { name: string; status: 'pass' | 'fail' | 'queued' }[];
    todos: { file: string; line: number; tag: string; text: string }[];
  };
  stats: {
    activePocs: number;
    unpushedBranches: number;
    budgetUsedPct: number;
    tokensToday: number;
  };
}

function registerTodayWidgets(): void {
  if (getAllWidgets().length > 0) return;

  registerWidget({
    id: 'contextResume',
    titleKey: 'today.contextResume',
    titleFallback: 'Context resume',
    defaultVisible: true,
    defaultOrder: 0,
    render: (data) => {
      const w = (data as TodayDashboard).widgets.contextResume;
      return (
        <>
          <p><strong>{t('today.branch', 'Branch')}:</strong> {w.branch}</p>
          <p className="muted">{w.lastCommit}</p>
          <ul className="mono-list">
            {w.openFiles.map((f) => <li key={f}>{f}</li>)}
          </ul>
          <p>{w.nextStep}</p>
          <Button variant="sm">{t('today.resume', 'Resume work')}</Button>
        </>
      );
    },
  });

  registerWidget({
    id: 'standupDraft',
    titleKey: 'today.standup',
    titleFallback: 'Standup draft',
    defaultVisible: true,
    defaultOrder: 1,
    render: (data) => {
      const w = (data as TodayDashboard).widgets.standupDraft;
      return (
        <>
          <pre className="standup-draft">
            {`## Yesterday\n${w.yesterday}\n\n## Today\n${w.today}\n\n## Blockers\n${w.blockers}`}
          </pre>
          <Pill variant="local">{t('today.localFree', 'local · free')}</Pill>
        </>
      );
    },
  });

  registerWidget({
    id: 'needsAttention',
    titleKey: 'today.attention',
    titleFallback: 'Needs attention',
    defaultVisible: true,
    defaultOrder: 2,
    render: (data) => {
      const items = (data as TodayDashboard).widgets.needsAttention;
      if (items.length === 0) return <EmptyState message={t('today.allClear', 'All clear')} />;
      return (
        <div className="nudge-list">
          {items.map((n) => (
            <Nudge key={n.id} label={n.label} action={n.action} severity="warn" />
          ))}
        </div>
      );
    },
  });

  registerWidget({
    id: 'squadWip',
    titleKey: 'today.squad',
    titleFallback: 'Squad right now',
    defaultVisible: true,
    defaultOrder: 3,
    render: (data) => {
      const items = (data as TodayDashboard).widgets.squadWip;
      return (
        <ul className="wip-list">
          {items.map((s) => (
            <li key={`${s.person}-${s.branch}`}>
              <strong>{s.person}</strong> — {s.branch}
              {s.unpushedDays > 2 && (
                <Pill variant="default">{s.unpushedDays}d unpushed</Pill>
              )}
            </li>
          ))}
        </ul>
      );
    },
  });

  registerWidget({
    id: 'news',
    titleKey: 'today.news',
    titleFallback: 'AI news for you',
    defaultVisible: true,
    defaultOrder: 4,
    render: (data) => {
      const items = (data as TodayDashboard).widgets.news;
      return (
        <ul>
          {items.map((n) => (
            <li key={n.id}>
              <strong>{n.title}</strong>
              <p className="muted">{n.why}</p>
            </li>
          ))}
        </ul>
      );
    },
  });

  registerWidget({
    id: 'checks',
    titleKey: 'today.checks',
    titleFallback: 'My checks',
    defaultVisible: true,
    defaultOrder: 5,
    render: (data) => {
      const items = (data as TodayDashboard).widgets.checks;
      return (
        <ul>
          {items.map((c) => (
            <li key={c.name}>
              <StatusBadge status={c.status === 'pass' ? 'shipped' : c.status === 'fail' ? 'stalled' : 'idle'} label={c.name} />
            </li>
          ))}
        </ul>
      );
    },
  });

  registerWidget({
    id: 'todos',
    titleKey: 'today.todos',
    titleFallback: 'TODO / FIXME',
    defaultVisible: true,
    defaultOrder: 6,
    render: (data) => {
      const items = (data as TodayDashboard).widgets.todos;
      return (
        <ul className="mono-list">
          {items.map((todo) => (
            <li key={`${todo.file}-${todo.line}`}>
              <Tag color={todo.tag === 'FIXME' ? 'fixme' : 'todo'}>{todo.tag}</Tag>
              {todo.file}:{todo.line} — {todo.text}
            </li>
          ))}
        </ul>
      );
    },
  });
}

registerTodayWidgets();

export function TodayScreen(): ReactElement {
  const { invoke } = useCoreService();
  const { setSyncLabel } = useAppState();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<TodayDashboard | null>(null);
  const [prefs, setPrefs] = useState<WidgetPrefs>(DEFAULT_WIDGET_PREFS);
  const [approving, setApproving] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    const [dashResult, settingsResult] = await Promise.all([
      invoke('today', 'getDashboard'),
      invoke('settings', 'get'),
    ]);
    if (!dashResult.ok) {
      setError(dashResult.error.message);
      setLoading(false);
      return;
    }
    setData(dashResult.data as TodayDashboard);
    const dash = dashResult.data as TodayDashboard;
    setSyncLabel(dash.sync.message);
    if (settingsResult.ok) {
      const kv = (settingsResult.data as { kv: Record<string, unknown> }).kv;
      setPrefs(loadWidgetPrefsFromSettings(kv));
    }
    setLoading(false);
  }, [invoke, setSyncLabel]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEventRefetch(refresh);

  const orderedWidgets = useMemo(() => {
    return prefs.order
      .filter((id) => prefs.visible[id] !== false)
      .map((id) => getWidget(id))
      .filter((w): w is NonNullable<typeof w> => w !== undefined);
  }, [prefs]);

  const handleApprove = useCallback(async () => {
    setApproving(true);
    await invoke('today', 'approveStandup');
    setApproving(false);
    void refresh();
  }, [invoke, refresh]);

  const handleRegenerate = useCallback(async () => {
    await invoke('today', 'regenerateStandup');
    void refresh();
  }, [invoke, refresh]);

  const handlePull = useCallback(async () => {
    await invoke('git', 'pull');
    void refresh();
  }, [invoke, refresh]);

  if (loading) return <LoadingState message={t('today.loading', 'Loading dashboard…')} />;
  if (error !== null) return <ErrorState message={error} />;
  if (data === null) return <EmptyState message={t('today.empty', 'No dashboard data')} />;

  const alignmentVariant =
    data.focusProject !== null && data.focusProject.onGoalPct < 50
      ? 'danger'
      : data.focusProject !== null && data.focusProject.onGoalPct < 70
        ? 'warn'
        : 'default';

  return (
    <div className="screen today-screen">
      <header className="screen-header">
        <div>
          <h1>{data.greeting}</h1>
          <p className="muted">{data.date}</p>
        </div>
        <div className="screen-header__actions">
          <CustomizePanel prefs={prefs} onChange={setPrefs} />
          <Button variant="ghost" onClick={() => void handlePull()}>
            {t('action.refresh', 'Refresh')}
          </Button>
        </div>
      </header>

      {data.focusProject !== null && (
        <Card title={t('today.focus', 'Current PoC focus')} className="focus-strip">
          <ExplainBubble
            title={t('today.focusExplain.title', 'Focus strip')}
            text={t('today.focusExplain.text', 'Shows burndown and goal alignment for your active PoC.')}
            how={t('today.focusExplain.how', 'Derived from git activity and charter goals.')}
          />
          <h2>{data.focusProject.name}</h2>
          <StatusBadge status={data.focusProject.status} />
          <p className="muted">
            {t('today.deadline', 'Deadline in')} {data.focusProject.deadlineDays}{' '}
            {t('today.days', 'days')}
          </p>
          <Meter value={data.focusProject.burndownPct} label={t('today.burndown', 'Burndown')} />
          <Meter
            value={data.focusProject.onGoalPct}
            label={t('today.alignment', 'Goal alignment')}
            variant={alignmentVariant}
          />
        </Card>
      )}

      <div className="widget-grid">
        {orderedWidgets.map((widget) => (
          <Card
            key={widget.id}
            title={t(widget.titleKey, widget.titleFallback)}
            actions={
              widget.id === 'standupDraft' ? (
                <div className="card__actions">
                  <Button variant="sm" onClick={() => void handleApprove()} disabled={approving}>
                    {t('today.approveStandup', 'Approve & push')}
                  </Button>
                  <Button variant="ghost" onClick={() => void handleRegenerate()}>
                    {t('today.regenerate', 'Regenerate')}
                  </Button>
                </div>
              ) : undefined
            }
          >
            {widget.render(data)}
          </Card>
        ))}
      </div>

      <div className="stats-strip">
        <span>{t('today.stats.pocs', 'Active PoCs')}: {data.stats.activePocs}</span>
        <span>{t('today.stats.unpushed', 'Unpushed')}: {data.stats.unpushedBranches}</span>
        <span>{t('today.stats.budget', 'Budget')}: {data.stats.budgetUsedPct}%</span>
        <span>{t('today.stats.tokens', 'Tokens today')}: {data.stats.tokensToday}</span>
      </div>
    </div>
  );
}
