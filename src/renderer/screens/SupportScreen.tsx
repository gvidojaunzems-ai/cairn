import { useCallback, useEffect, useState, type ReactElement } from 'react';

import { t } from '../../shared/i18n';

import {

  Button,

  Card,

  EmptyState,

  ErrorState,

  LoadingState,

  StatusBadge,

  Table,

} from '../components/ui';

import { useCoreService } from '../hooks/use-core-service';

import { ExplainBubble } from '../shell/app-state';



interface AppInfo {

  id: string;

  name: string;

  status: string;

  description?: string;

}



interface Ticket {

  id: string;

  title: string;

  status: string;

  assigneeId?: string | null;

}



export function SupportScreen(): ReactElement {

  const { invoke } = useCoreService();

  const [loading, setLoading] = useState(true);

  const [error, setError] = useState<string | null>(null);

  const [apps, setApps] = useState<AppInfo[]>([]);

  const [tickets, setTickets] = useState<Ticket[]>([]);

  const [selectedApp, setSelectedApp] = useState<AppInfo | null>(null);

  const [statusFilter, setStatusFilter] = useState<string | undefined>('open');



  const refresh = useCallback(async () => {

    setLoading(true);

    setError(null);

    const [appsRes, ticketsRes] = await Promise.all([

      invoke('support', 'listApps'),

      invoke('support', 'listTickets', statusFilter !== undefined ? { status: statusFilter } : {}),

    ]);

    if (!appsRes.ok) {

      setError(appsRes.error.message);

    } else {

      const data = appsRes.data as { apps?: AppInfo[] };

      setApps(data.apps ?? (appsRes.data as AppInfo[]));

    }

    if (ticketsRes.ok) {

      const data = ticketsRes.data as { tickets?: Ticket[] };

      setTickets(data.tickets ?? (ticketsRes.data as Ticket[]));

    }

    setLoading(false);

  }, [invoke, statusFilter]);



  useEffect(() => {

    void refresh();

  }, [refresh]);



  const openApp = useCallback(

    async (appId: string) => {

      const result = await invoke('support', 'getApp', { appId });

      if (result.ok) {

        setSelectedApp(result.data as AppInfo);

      }

    },

    [invoke],

  );



  const triage = useCallback(

    async (ticketId: string) => {

      await invoke('support', 'triageTicket', { ticketId, assigneeId: 'gvido' });

      void refresh();

    },

    [invoke, refresh],

  );



  const resolve = useCallback(

    async (ticketId: string) => {

      await invoke('support', 'resolveTicket', { ticketId, resolution: 'Fixed in latest deploy' });

      void refresh();

    },

    [invoke, refresh],

  );



  if (loading && apps.length === 0) return <LoadingState message={t('loading', 'Loading…')} />;

  if (error !== null && apps.length === 0) return <ErrorState message={error} />;



  return (

    <div className="screen support-screen">

      <header className="screen-header">

        <h1>{t('nav.support', 'Support & Apps')}</h1>

      </header>



      <div className="split-layout">

        <aside className="split-layout__side">

          <h2>{t('support.apps', 'Background apps')}</h2>

          <ExplainBubble

            title={t('support.appsExplain.title', 'Apps')}

            text={t('support.appsExplain.text', 'Long-running squad apps monitored by Cairn.')}

          />

          {apps.length === 0 ? (

            <EmptyState message={t('support.noApps', 'No apps registered')} />

          ) : (

            <ul className="entity-list">

              {apps.map((app) => (

                <li key={app.id}>

                  <button

                    type="button"

                    className={`entity-list__item${selectedApp?.id === app.id ? ' entity-list__item--active' : ''}`}

                    onClick={() => void openApp(app.id)}

                  >

                    <span>{app.name}</span>

                    <StatusBadge status={app.status} />

                  </button>

                </li>

              ))}

            </ul>

          )}

          {selectedApp !== null && (

            <Card title={selectedApp.name}>

              <p>{selectedApp.description ?? ''}</p>

            </Card>

          )}

        </aside>



        <section className="split-layout__main">

          <Card title={t('support.inbox', 'Ticket inbox')}>

            <div className="filter-bar">

              {['open', 'in_progress', 'closed'].map((s) => (

                <Button

                  key={s}

                  variant={statusFilter === s ? 'primary' : 'ghost'}

                  onClick={() => setStatusFilter(s)}

                >

                  {s}

                </Button>

              ))}

            </div>

            {tickets.length === 0 ? (

              <EmptyState message={t('support.noTickets', 'No tickets')} />

            ) : (

              <Table

                columns={[

                  { key: 'title', header: t('support.title', 'Title'), render: (r) => r.title },

                  { key: 'status', header: t('support.status', 'Status'), render: (r) => <StatusBadge status={r.status} /> },

                  {

                    key: 'actions',

                    header: t('support.actions', 'Actions'),

                    render: (r) => (

                      <span className="btn-row">

                        {r.status === 'open' && (

                          <Button variant="sm" onClick={() => void triage(r.id)}>

                            {t('support.triage', 'Triage')}

                          </Button>

                        )}

                        {r.status !== 'closed' && (

                          <Button variant="sm" onClick={() => void resolve(r.id)}>

                            {t('support.resolve', 'Resolve')}

                          </Button>

                        )}

                      </span>

                    ),

                  },

                ]}

                rows={tickets}

                rowKey={(r) => r.id}

              />

            )}

          </Card>

        </section>

      </div>

    </div>

  );

}


