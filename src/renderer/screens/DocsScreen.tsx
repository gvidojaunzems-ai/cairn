import { useCallback, useEffect, useState, type ReactElement } from 'react';

import { t } from '../../shared/i18n';

import {

  Breadcrumb,

  Button,

  Card,

  EmptyState,

  ErrorState,

  LoadingState,

} from '../components/ui';

import { useCoreService } from '../hooks/use-core-service';

import { ExplainBubble } from '../shell/app-state';



interface DocNode {

  id: string;

  title: string;

  children?: DocNode[];

}



interface DocDetail {

  id: string;

  title: string;

  body: string;

}



export function DocsScreen(): ReactElement {

  const { invoke } = useCoreService();

  const [loading, setLoading] = useState(true);

  const [error, setError] = useState<string | null>(null);

  const [tree, setTree] = useState<DocNode[]>([]);

  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [doc, setDoc] = useState<DocDetail | null>(null);

  const [body, setBody] = useState('');

  const [askQuery, setAskQuery] = useState('');

  const [askAnswer, setAskAnswer] = useState<string | null>(null);



  const refresh = useCallback(async () => {

    setLoading(true);

    setError(null);

    const result = await invoke('docs', 'tree');

    if (!result.ok) {

      setError(result.error.message);

    } else {

      const data = result.data as { groups: { name: string; docs: { id: string; title: string }[] }[] };

      setTree(data.groups.map((g) => ({
        id: g.name,
        title: g.name,
        children: g.docs.map((d) => ({ id: d.id, title: d.title })),
      })));

    }

    setLoading(false);

  }, [invoke]);



  useEffect(() => {

    void refresh();

  }, [refresh]);



  const selectDoc = useCallback(

    async (id: string) => {

      setSelectedId(id);

      const result = await invoke('docs', 'get', { docId: id });

      if (result.ok) {

        const d = result.data as DocDetail;

        setDoc(d);

        setBody(d.body);

      }

    },

    [invoke],

  );



  const saveDoc = useCallback(async () => {

    if (selectedId === null) return;

    await invoke('docs', 'save', { docId: selectedId, body });

  }, [invoke, selectedId, body]);



  const ask = useCallback(async () => {

    if (askQuery.trim() === '') return;

    const result = await invoke('search', 'askDocs', {

      q: askQuery,

      docIds: selectedId !== null ? [selectedId] : undefined,

    });

    if (result.ok) {

      const data = result.data as { answer?: string; text?: string };

      setAskAnswer(data.answer ?? data.text ?? t('docs.noAnswer', 'No answer'));

    }

  }, [invoke, askQuery, selectedId]);



  const renderTree = (nodes: DocNode[], depth = 0): ReactElement => (

    <ul className="doc-tree" style={{ paddingLeft: depth > 0 ? 16 : 0 }}>

      {nodes.map((node) => (

        <li key={node.id}>

          <button

            type="button"

            className={`doc-tree__link${selectedId === node.id ? ' doc-tree__link--active' : ''}`}

            onClick={() => void selectDoc(node.id)}

          >

            {node.title}

          </button>

          {node.children !== undefined && node.children.length > 0 && renderTree(node.children, depth + 1)}

        </li>

      ))}

    </ul>

  );



  if (loading) return <LoadingState message={t('loading', 'Loading…')} />;

  if (error !== null) return <ErrorState message={error} />;



  return (

    <div className="screen docs-screen">

      <header className="screen-header">

        <h1>{t('nav.docs', 'Docs Hub')}</h1>

        <Button variant="ghost" onClick={() => void invoke('docs', 'syncRepos')}>

          {t('docs.sync', 'Sync repos')}

        </Button>

      </header>



      <div className="docs-layout">

        <nav className="docs-layout__nav" aria-label={t('docs.tree', 'Document tree')}>

          <ExplainBubble

            title={t('docs.treeExplain.title', 'Doc tree')}

            text={t('docs.treeExplain.text', 'Browse team docs imported from repos and manual pages.')}

          />

          {tree.length === 0 ? (

            <EmptyState message={t('docs.empty', 'No documents')} />

          ) : (

            renderTree(tree)

          )}

        </nav>



        <section className="docs-layout__editor">

          {doc === null ? (

            <EmptyState message={t('docs.selectOne', 'Select a document')} />

          ) : (

            <>

              <Breadcrumb items={[{ label: t('nav.docs', 'Docs Hub') }, { label: doc.title }]} />

              <input

                type="text"

                className="doc-title-input"

                value={doc.title}

                readOnly

                aria-label={t('docs.title', 'Title')}

              />

              <textarea

                value={body}

                onChange={(e) => setBody(e.target.value)}

                rows={20}

                className="doc-editor"

                aria-label={t('docs.body', 'Body')}

              />

              <Button onClick={() => void saveDoc()}>{t('action.save', 'Save')}</Button>

            </>

          )}

        </section>



        <aside className="docs-layout__ask">

          <Card title={t('docs.ask', 'Ask this doc')}>

            <textarea

              value={askQuery}

              onChange={(e) => setAskQuery(e.target.value)}

              rows={3}

              placeholder={t('docs.askPlaceholder', 'Ask a question…')}

            />

            <Button onClick={() => void ask()}>{t('docs.askBtn', 'Ask')}</Button>

            {askAnswer !== null && <p className="ask-answer">{askAnswer}</p>}

          </Card>

        </aside>

      </div>

    </div>

  );

}


