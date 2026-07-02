import { useCallback, useEffect, useState, type ReactElement } from 'react';
import { t } from '../../shared/i18n';
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  LoadingState,
  Pill,
  Switch,
} from '../components/ui';
import { useCoreService } from '../hooks/use-core-service';
import { ExplainBubble } from '../shell/app-state';

interface Template {
  id: string;
  name: string;
  description: string;
}

export function ReportsScreen(): ReactElement {
  const { invoke } = useCoreService();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [selected, setSelected] = useState<Template | null>(null);
  const [useClaude, setUseClaude] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [reportId, setReportId] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    const result = await invoke('reports', 'templates');
    if (!result.ok) {
      setError(result.error.message);
    } else {
      const data = result.data as { templates: Template[] };
      setTemplates(data.templates);
    }
    setLoading(false);
  }, [invoke]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const generate = useCallback(async () => {
    if (selected === null) return;
    setGenerating(true);
    const result = await invoke('reports', 'generate', {
      kind: selected.id,
      external: useClaude,
    });
    if (result.ok) {
      const data = result.data as { preview?: string; reportId?: string; jobId?: string };
      setPreview(data.preview ?? null);
      setReportId(data.reportId ?? data.jobId ?? null);
    }
    setGenerating(false);
  }, [invoke, selected, useClaude]);

  const exportReport = useCallback(
    async (format: 'md' | 'docx' | 'pdf') => {
      if (reportId === null) return;
      await invoke('reports', 'export', { reportId, format });
    },
    [invoke, reportId],
  );

  if (loading) return <LoadingState message={t('loading', 'Loading…')} />;
  if (error !== null) return <ErrorState message={error} />;

  return (
    <div className="screen reports-screen">
      <header className="screen-header">
        <h1>{t('nav.reports', 'Reports')}</h1>
      </header>

      <div className="split-layout">
        <aside className="split-layout__side">
          <ExplainBubble
            title={t('reports.templatesExplain.title', 'Templates')}
            text={t('reports.templatesExplain.text', 'Pre-built report formats for squad status and retros.')}
          />
          {templates.length === 0 ? (
            <EmptyState message={t('reports.empty', 'No templates')} />
          ) : (
            <ul className="entity-list">
              {templates.map((tpl) => (
                <li key={tpl.id}>
                  <button
                    type="button"
                    className={`entity-list__item${selected?.id === tpl.id ? ' entity-list__item--active' : ''}`}
                    onClick={() => setSelected(tpl)}
                  >
                    <span>{tpl.name}</span>
                    <span className="muted">{tpl.description}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>

        <section className="split-layout__main">
          {selected === null ? (
            <EmptyState message={t('reports.selectTemplate', 'Select a template')} />
          ) : (
            <Card title={selected.name}>
              <p>{selected.description}</p>
              <Switch
                label={t('reports.useClaude', 'Use Claude (polished)')}
                checked={useClaude}
                onChange={(e) => setUseClaude(e.target.checked)}
              />
              <Pill variant={useClaude ? 'claude' : 'local'}>
                {useClaude ? t('reports.claude', 'Claude · metered') : t('today.localFree', 'local · free')}
              </Pill>
              <Button onClick={() => void generate()} disabled={generating}>
                {t('reports.generate', 'Generate')}
              </Button>
              {preview !== null && (
                <>
                  <pre className="report-preview">{preview}</pre>
                  <div className="btn-row">
                    <Button variant="ghost" onClick={() => void exportReport('md')}>MD</Button>
                    <Button variant="ghost" onClick={() => void exportReport('docx')}>DOCX</Button>
                    <Button variant="ghost" onClick={() => void exportReport('pdf')}>PDF</Button>
                  </div>
                </>
              )}
            </Card>
          )}
        </section>
      </div>
    </div>
  );
}
