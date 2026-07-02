import { useCallback, useEffect, useState, type ReactElement } from 'react';

import { t } from '../../shared/i18n';

import {

  Button,

  Card,

  Chip,

  EmptyState,

  ErrorState,

  LoadingState,

  Pill,

} from '../components/ui';

import { useEventRefetch } from '../hooks/use-event-refetch';

import { useCoreService } from '../hooks/use-core-service';

import { ExplainBubble } from '../shell/app-state';



interface NewsItem {

  id: string;

  title: string;

  summary: string | null;

  source?: string | null;

  topic?: string;

}



interface KnowledgeItem {

  id: string;

  title: string;

  snippet: string;

}



export function NewsScreen(): ReactElement {

  const { invoke } = useCoreService();

  const [loading, setLoading] = useState(true);

  const [error, setError] = useState<string | null>(null);

  const [items, setItems] = useState<NewsItem[]>([]);

  const [knowledge, setKnowledge] = useState<KnowledgeItem[]>([]);

  const [topic, setTopic] = useState<string | null>(null);

  const [selected, setSelected] = useState<NewsItem | null>(null);



  const refresh = useCallback(async () => {

    setLoading(true);

    setError(null);

    const [feedRes, knowRes] = await Promise.all([

      invoke('news', 'listFeed', topic !== null ? { topic } : {}),

      invoke('news', 'listKnowledge'),

    ]);

    if (!feedRes.ok) {

      setError(feedRes.error.message);

    } else {

      const data = feedRes.data as { items?: NewsItem[] };

      setItems(data.items ?? (feedRes.data as NewsItem[]));

    }

    if (knowRes.ok) {

      const k = knowRes.data as { items: { id: string; type: string; content: string }[] };

      setKnowledge(k.items.map((item) => ({
        id: item.id,
        title: item.type,
        snippet: item.content.slice(0, 100),
      })));

    }

    setLoading(false);

  }, [invoke, topic]);



  useEffect(() => {

    void refresh();

  }, [refresh]);



  useEventRefetch(refresh);



  const topics = ['all', 'llm', 'local-first', 'agents'];



  const openItem = useCallback(

    async (item: NewsItem) => {

      setSelected(item);

      const result = await invoke('news', 'getItem', { itemId: item.id });

      if (result.ok) {

        setSelected(result.data as NewsItem);

      }

    },

    [invoke],

  );



  const saveItem = useCallback(

    async (itemId: string) => {

      await invoke('news', 'save', { itemId });

    },

    [invoke],

  );



  if (loading && items.length === 0) return <LoadingState message={t('loading', 'Loading…')} />;

  if (error !== null && items.length === 0) return <ErrorState message={error} />;



  return (

    <div className="screen news-screen">

      <header className="screen-header">

        <h1>{t('nav.news', 'News & Knowledge')}</h1>

      </header>



      <div className="filter-bar">

        <ExplainBubble

          title={t('news.filterExplain.title', 'Filters')}

          text={t('news.filterExplain.text', 'Filter the AI news feed by topic.')}

        />

        {topics.map((tp) => (

          <Chip

            key={tp}

            active={topic === tp || (topic === null && tp === 'all')}

            onClick={() => setTopic(tp === 'all' ? null : tp)}

          >

            {tp}

          </Chip>

        ))}

      </div>



      <div className="split-layout">

        <div className="split-layout__main">

          {items.length === 0 ? (

            <EmptyState message={t('news.empty', 'No news items')} />

          ) : (

            <div className="card-grid">

              {items.map((item) => (

                <Card

                  key={item.id}

                  title={item.title}

                  actions={

                    <Button variant="sm" onClick={() => void saveItem(item.id)}>

                      {t('news.save', 'Save')}

                    </Button>

                  }

                >

                  <p>{item.summary ?? t('news.noSummary', 'No summary')}</p>

                  {item.source !== undefined && item.source !== null && (

                    <Pill>{item.source}</Pill>

                  )}

                  <Button variant="ghost" onClick={() => void openItem(item)}>

                    {t('news.read', 'Read')}

                  </Button>

                </Card>

              ))}

            </div>

          )}

        </div>



        <aside className="split-layout__side knowledge-panel">

          <h2>{t('news.knowledge', 'Knowledge')}</h2>

          {knowledge.length === 0 ? (

            <p className="muted">{t('news.noKnowledge', 'No saved knowledge yet')}</p>

          ) : (

            <ul>

              {knowledge.map((k) => (

                <li key={k.id}>

                  <strong>{k.title}</strong>

                  <p className="muted">{k.snippet}</p>

                </li>

              ))}

            </ul>

          )}

          {selected !== null && (

            <Card title={selected.title}>

              <p>{selected.summary}</p>

            </Card>

          )}

        </aside>

      </div>

    </div>

  );

}


