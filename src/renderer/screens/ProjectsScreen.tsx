import { useCallback, useEffect, useState, type ReactElement } from 'react';

import { t } from '../../shared/i18n';

import {

  Breadcrumb,

  Button,

  Card,

  EmptyState,

  ErrorState,

  LoadingState,

  Meter,

  Modal,

  StatusBadge,

  Tag,

} from '../components/ui';

import { useEventRefetch } from '../hooks/use-event-refetch';

import { useCoreService } from '../hooks/use-core-service';

import { ExplainBubble } from '../shell/app-state';



interface ProjectView {

  id: string;

  name: string;

  description: string | null;

  status: string;

  charter?: { id: string; title: string; body: string };

  onGoalPct: number;

  driftFlag: boolean;

  driftReason?: string;

}



export function ProjectsScreen(): ReactElement {

  const { invoke } = useCoreService();

  const [loading, setLoading] = useState(true);

  const [error, setError] = useState<string | null>(null);

  const [projects, setProjects] = useState<ProjectView[]>([]);

  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [detail, setDetail] = useState<ProjectView | null>(null);

  const [charterBody, setCharterBody] = useState('');

  const [showNew, setShowNew] = useState(false);

  const [newName, setNewName] = useState('');



  const refresh = useCallback(async () => {

    setLoading(true);

    setError(null);

    const result = await invoke('projects', 'list');

    if (!result.ok) {

      setError(result.error.message);

    } else {

      const list = (result.data as { projects: ProjectView[] }).projects;

      setProjects(list);

      if (selectedId !== null) {

        const d = list.find((p) => p.id === selectedId);

        if (d !== undefined) {

          setDetail(d);

          setCharterBody(d.charter?.body ?? '');

        }

      }

    }

    setLoading(false);

  }, [invoke, selectedId]);



  useEffect(() => {

    void refresh();

  }, [refresh]);



  useEventRefetch(refresh);



  const selectProject = useCallback(

    async (id: string) => {

      setSelectedId(id);

      const result = await invoke('projects', 'get', { projectId: id });

      if (result.ok) {

        const p = (result.data as { project: ProjectView }).project;

        setDetail(p);

        setCharterBody(p.charter?.body ?? '');

      } else {

        const fallback = projects.find((p) => p.id === id);

        if (fallback !== undefined) {

          setDetail(fallback);

          setCharterBody(fallback.charter?.body ?? '');

        }

      }

    },

    [invoke, projects],

  );



  const saveCharter = useCallback(async () => {

    if (selectedId === null) return;

    await invoke('projects', 'updateCharter', {

      projectId: selectedId,

      charter: { body: charterBody },

    });

    void refresh();

  }, [invoke, selectedId, charterBody, refresh]);



  const createProject = useCallback(async () => {

    if (newName.trim() === '') return;

    const result = await invoke('projects', 'create', { name: newName.trim() });

    if (result.ok) {

      setShowNew(false);

      setNewName('');

      void refresh();

    }

  }, [invoke, newName, refresh]);



  if (loading && projects.length === 0) {

    return <LoadingState message={t('loading', 'Loading…')} />;

  }

  if (error !== null && projects.length === 0) {

    return <ErrorState message={error} />;

  }



  return (

    <div className="screen projects-screen">

      <header className="screen-header">

        <h1>{t('nav.projects', 'PoC Projects')}</h1>

        <Button onClick={() => setShowNew(true)}>{t('projects.new', 'New PoC')}</Button>

      </header>



      <div className="split-layout">

        <aside className="split-layout__side">

          <ExplainBubble

            title={t('projects.listExplain.title', 'PoC list')}

            text={t('projects.listExplain.text', 'Active proof-of-concept projects with charter and drift status.')}

          />

          {projects.length === 0 ? (

            <EmptyState message={t('projects.empty', 'No projects yet')} />

          ) : (

            <ul className="entity-list">

              {projects.map((p) => (

                <li key={p.id}>

                  <button

                    type="button"

                    className={`entity-list__item${selectedId === p.id ? ' entity-list__item--active' : ''}`}

                    onClick={() => void selectProject(p.id)}

                  >

                    <span>{p.name}</span>

                    <StatusBadge status={p.status} />

                  </button>

                </li>

              ))}

            </ul>

          )}

        </aside>



        <section className="split-layout__main">

          {detail === null ? (

            <EmptyState message={t('projects.selectOne', 'Select a project')} />

          ) : (

            <>

              <Breadcrumb

                items={[

                  { label: t('nav.projects', 'PoC Projects'), onClick: () => setSelectedId(null) },

                  { label: detail.name },

                ]}

              />

              <Card title={detail.name}>

                <p className="muted">{detail.description ?? ''}</p>

                <StatusBadge status={detail.status} />

                {detail.driftFlag && (

                  <Tag color="fixme">{detail.driftReason ?? t('projects.drift', 'Drift detected')}</Tag>

                )}

                <Meter value={detail.onGoalPct} label={t('today.alignment', 'Goal alignment')} variant={detail.onGoalPct < 50 ? 'danger' : 'default'} />

              </Card>

              <Card title={t('projects.charter', 'Charter')}>

                <textarea

                  value={charterBody}

                  onChange={(e) => setCharterBody(e.target.value)}

                  rows={12}

                  aria-label={t('projects.charter', 'Charter')}

                />

                <Button onClick={() => void saveCharter()}>{t('action.save', 'Save')}</Button>

              </Card>

            </>

          )}

        </section>

      </div>



      <Modal

        open={showNew}

        title={t('projects.newTitle', 'New PoC project')}

        onClose={() => setShowNew(false)}

        footer={

          <>

            <Button variant="ghost" onClick={() => setShowNew(false)}>{t('action.cancel', 'Cancel')}</Button>

            <Button onClick={() => void createProject()}>{t('action.create', 'Create')}</Button>

          </>

        }

      >

        <label className="form-field">

          <span>{t('projects.name', 'Name')}</span>

          <input type="text" value={newName} onChange={(e) => setNewName(e.target.value)} />

        </label>

      </Modal>

    </div>

  );

}


