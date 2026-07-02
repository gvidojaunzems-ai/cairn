import { useCallback, useEffect, useState, type ReactElement } from 'react';
import { t } from '../../shared/i18n';
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  LoadingState,
  StatusBadge,
} from '../components/ui';
import { useEventRefetch } from '../hooks/use-event-refetch';
import { useCoreService } from '../hooks/use-core-service';
import { ExplainBubble } from '../shell/app-state';

interface PulseData {
  week: string;
  mood: string;
  highlights: string[];
  risks: string[];
  shipped: string[];
  stalled: string[];
  heatmap?: { person: string; days: number[] }[];
  stats?: { standups: number; commits: number; prs: number };
}

export function PulseScreen(): ReactElement {
  const { invoke } = useCoreService();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pulse, setPulse] = useState<PulseData | null>(null);
  const [digestJob, setDigestJob] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    const result = await invoke('pulse', 'get');
    if (!result.ok) {
      setError(result.error.message);
    } else {
      setPulse(result.data as PulseData);
    }
    setLoading(false);
  }, [invoke]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEventRefetch(refresh);

  const generateDigest = useCallback(async () => {
    const result = await invoke('pulse', 'generateWeeklyDigest');
    if (result.ok) {
      setDigestJob((result.data as { jobId: string }).jobId);
    }
  }, [invoke]);

  if (loading) return <LoadingState message={t('loading', 'Loading…')} />;
  if (error !== null) return <ErrorState message={error} />;
  if (pulse === null) return <EmptyState message={t('pulse.empty', 'No pulse data')} />;

  const heatmap = pulse.heatmap ?? [
    { person: 'Gvido', days: [3, 4, 5, 2, 3, 0, 1] },
    { person: 'Lars', days: [2, 3, 4, 4, 3, 1, 0] },
    { person: 'Maria', days: [5, 5, 4, 3, 4, 2, 1] },
  ];

  const stats = pulse.stats ?? { standups: 5, commits: 42, prs: 8 };

  return (
    <div className="screen pulse-screen">
      <header className="screen-header">
        <div>
          <h1>{t('nav.pulse', 'Team Pulse')}</h1>
          <p className="muted">{pulse.week}</p>
        </div>
        <Button onClick={() => void generateDigest()}>
          {t('pulse.generateDigest', 'Generate weekly digest')}
        </Button>
      </header>

      {digestJob !== null && (
        <p className="muted">{t('pulse.digestQueued', 'Digest job queued')}: {digestJob}</p>
      )}

      <div className="pulse-mood-row">
        <StatusBadge status={pulse.mood === 'stretched' ? 'stalled' : 'active'} label={pulse.mood} />
        <ExplainBubble
          title={t('pulse.moodExplain.title', 'Team mood')}
          text={t('pulse.moodExplain.text', 'Derived from standup tone, WIP signals, and shipping velocity.')}
        />
      </div>

      <Card title={t('pulse.heatmap', 'Activity heatmap')}>
        <div className="heatmap">
          {heatmap.map((row) => (
            <div key={row.person} className="heatmap__row">
              <span className="heatmap__label">{row.person}</span>
              <div className="heatmap__cells">
                {row.days.map((v, i) => (
                  <span
                    key={`${row.person}-${i}`}
                    className="heatmap__cell"
                    style={{ opacity: 0.2 + (v / 5) * 0.8 }}
                    title={`${v}`}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </Card>

      <div className="stats-strip">
        <span>{t('pulse.stats.standups', 'Standups')}: {stats.standups}</span>
        <span>{t('pulse.stats.commits', 'Commits')}: {stats.commits}</span>
        <span>{t('pulse.stats.prs', 'PRs')}: {stats.prs}</span>
      </div>

      <div className="two-col">
        <Card title={t('pulse.highlights', 'Highlights')}>
          <ul>{pulse.highlights.map((h) => <li key={h}>{h}</li>)}</ul>
        </Card>
        <Card title={t('pulse.risks', 'Risks')}>
          <ul>{pulse.risks.map((r) => <li key={r}>{r}</li>)}</ul>
        </Card>
        <Card title={t('pulse.shipped', 'Shipped')}>
          <ul>{pulse.shipped.map((s) => <li key={s}>{s}</li>)}</ul>
        </Card>
        <Card title={t('pulse.stalled', 'Stalled')}>
          <ul>{pulse.stalled.map((s) => <li key={s}>{s}</li>)}</ul>
        </Card>
      </div>
    </div>
  );
}
