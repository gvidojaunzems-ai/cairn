import { useCallback, useEffect, useState, type ReactElement } from 'react';

import { t } from '../../shared/i18n';

import {

  Button,

  Card,

  EmptyState,

  ErrorState,

  LoadingState,

  Nudge,

  Pill,

  Table,

} from '../components/ui';

import { useEventRefetch } from '../hooks/use-event-refetch';

import { useCoreService } from '../hooks/use-core-service';

import { ExplainBubble } from '../shell/app-state';



interface WipEntry {

  person: string;

  summary: string;

  unpushedDays: number;

  status: string;

}



interface ActionItem {

  id: string;

  description: string;

  status: string;

  assignee?: string;

}



export function DailiesScreen(): ReactElement {

  const { invoke } = useCoreService();

  const [loading, setLoading] = useState(true);

  const [error, setError] = useState<string | null>(null);

  const [pack, setPack] = useState<{ date: string; updates: { person: string; yesterday: string; today: string; blockers: string }[] } | null>(null);

  const [wipRadar, setWipRadar] = useState<WipEntry[]>([]);

  const [actionItems, setActionItems] = useState<ActionItem[]>([]);



  const refresh = useCallback(async () => {

    setLoading(true);

    setError(null);

    const [packRes, wipRes, actionsRes] = await Promise.all([

      invoke('dailies', 'getPack'),

      invoke('dailies', 'getWipRadar'),

      invoke('dailies', 'listActionItems'),

    ]);

    if (!packRes.ok) {

      setError(packRes.error.message);

      setLoading(false);

      return;

    }

    setPack(packRes.data as typeof pack);

    if (wipRes.ok) {

      const wip = wipRes.data as { items: WipEntry[] };

      setWipRadar(wip.items);

    }

    if (actionsRes.ok) {

      const actions = actionsRes.data as { items: { id: string; description: string; status: string }[] };

      setActionItems(actions.items);

    }

    setLoading(false);

  }, [invoke]);



  useEffect(() => {

    void refresh();

  }, [refresh]);



  useEventRefetch(refresh);



  const toggleAction = useCallback(

    async (id: string, status: string) => {

      await invoke('dailies', 'setActionItem', { id, status });

      void refresh();

    },

    [invoke, refresh],

  );



  const nudge = useCallback(

    async (personId: string) => {

      await invoke('dailies', 'nudgeUnpushed', { personId });

    },

    [invoke],

  );



  if (loading) return <LoadingState message={t('loading', 'Loading…')} />;

  if (error !== null) return <ErrorState message={error} />;



  return (

    <div className="screen dailies-screen">

      <header className="screen-header">

        <h1>{t('nav.dailies', 'Dailies')}</h1>

        <Button variant="ghost" onClick={() => void refresh()}>{t('action.refresh', 'Refresh')}</Button>

      </header>



      <div className="two-col">

        <Card title={t('dailies.wip', 'WIP radar')}>

          <ExplainBubble

            title={t('dailies.wipExplain.title', 'WIP radar')}

            text={t('dailies.wipExplain.text', 'Metadata-only view of teammates unpushed work.')}

          />

          {wipRadar.length === 0 ? (

            <EmptyState message={t('dailies.noWip', 'No active WIP signals')} />

          ) : (

            <Table

              columns={[

                { key: 'person', header: t('dailies.person', 'Person'), render: (r) => r.person },

                { key: 'summary', header: t('dailies.summary', 'Summary'), render: (r) => r.summary },

                {

                  key: 'days',

                  header: t('dailies.unpushed', 'Unpushed'),

                  render: (r) => (

                    <span>

                      {r.unpushedDays}d

                      {r.unpushedDays >= 3 && (

                        <Button variant="sm" onClick={() => void nudge(r.person)}>

                          {t('dailies.nudge', 'Nudge')}

                        </Button>

                      )}

                    </span>

                  ),

                },

              ]}

              rows={wipRadar}

              rowKey={(r) => `${r.person}-${r.summary}`}

            />

          )}

        </Card>



        <Card title={t('dailies.actions', 'Action items')}>

          {actionItems.length === 0 ? (

            <p className="muted">{t('dailies.noActions', 'No open action items')}</p>

          ) : (

            <ul className="action-list">

              {actionItems.map((a) => (

                <li key={a.id}>

                  <Nudge

                    label={a.description}

                    action={a.status === 'done' ? t('dailies.reopen', 'Reopen') : t('dailies.done', 'Done')}

                    onAction={() => void toggleAction(a.id, a.status === 'done' ? 'open' : 'done')}

                  />

                </li>

              ))}

            </ul>

          )}

        </Card>

      </div>



      <Card title={t('dailies.pack', 'Standup pack')}>

        {pack === null || pack.updates.length === 0 ? (

          <EmptyState message={t('dailies.noPack', 'No standup pack for today')} />

        ) : (

          <>

            <Pill>{pack.date}</Pill>

            {pack.updates.map((u) => (

              <article key={u.person} className="standup-entry">

                <h3>{u.person}</h3>

                <p><strong>{t('dailies.yesterday', 'Yesterday')}:</strong> {u.yesterday}</p>

                <p><strong>{t('dailies.today', 'Today')}:</strong> {u.today}</p>

                <p><strong>{t('dailies.blockers', 'Blockers')}:</strong> {u.blockers}</p>

              </article>

            ))}

          </>

        )}

      </Card>

    </div>

  );

}


