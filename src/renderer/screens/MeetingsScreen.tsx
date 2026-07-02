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



interface Proposal {

  id: string;

  kind: string;

  text: string;

}



export function MeetingsScreen(): ReactElement {

  const { invoke, subscribe } = useCoreService();

  const [loading, setLoading] = useState(false);

  const [error, setError] = useState<string | null>(null);

  const [title, setTitle] = useState('');

  const [consent, setConsent] = useState(false);

  const [live, setLive] = useState<{ meetingId: string; recording: boolean; transcript: string } | null>(null);

  const [proposals, setProposals] = useState<Proposal[]>([]);

  const [meetingId, setMeetingId] = useState<string | null>(null);



  const refreshLive = useCallback(async () => {

    const result = await invoke('meetings', 'getLive');

    if (result.ok) {

      const data = result.data as { live: { id: string; title: string; recording: boolean; transcript: string } | null };

      if (data.live === null) {

        setLive(null);

      } else {

        setLive({

          meetingId: data.live.id,

          recording: data.live.recording,

          transcript: data.live.transcript,

        });

        setMeetingId(data.live.id);

      }

    }

  }, [invoke]);



  useEffect(() => {

    void refreshLive();

    const unsubPartial = subscribe('meeting.partial', (payload) => {

      setLive((prev) =>

        prev !== null

          ? { ...prev, transcript: prev.transcript + '\n' + payload.text }

          : { meetingId: payload.meetingId, recording: true, transcript: payload.text },

      );

      setMeetingId(payload.meetingId);

    });

    const unsubProposals = subscribe('meeting.proposals', (payload) => {

      setProposals([...payload.items]);

      setMeetingId(payload.meetingId);

    });

    return () => {

      unsubPartial();

      unsubProposals();

    };

  }, [refreshLive, subscribe]);



  const start = useCallback(async () => {

    if (!consent || title.trim() === '') return;

    setLoading(true);

    setError(null);

    const result = await invoke('meetings', 'start', { title: title.trim(), consent: true });

    if (!result.ok) {

      setError(result.error.message);

    } else {

      const data = result.data as { id: string; title: string };

      const id = data.id;

      setMeetingId(id);

      setLive({ meetingId: id, recording: true, transcript: '' });

      setProposals([]);

    }

    setLoading(false);

  }, [invoke, consent, title]);



  const stop = useCallback(async () => {

    setLoading(true);

    await invoke('meetings', 'stop');

    setLive(null);

    setLoading(false);

  }, [invoke]);



  const loadProposals = useCallback(async () => {

    if (meetingId === null) return;

    const result = await invoke('meetings', 'getProposals', { meetingId });

    if (result.ok) {

      const data = result.data as { items?: Proposal[]; proposals?: Proposal[] };

      setProposals(data.items ?? data.proposals ?? []);

    }

  }, [invoke, meetingId]);



  const applyProposal = useCallback(

    async (proposalId: string) => {

      if (meetingId === null) return;

      await invoke('meetings', 'applyProposal', { meetingId, proposalId });

      void loadProposals();

    },

    [invoke, meetingId, loadProposals],

  );



  const applyAll = useCallback(async () => {

    if (meetingId === null) return;

    await invoke('meetings', 'applyAll', { meetingId });

    setProposals([]);

  }, [invoke, meetingId]);



  return (

    <div className="screen meetings-screen">

      <header className="screen-header">

        <h1>{t('nav.meetings', 'Meetings')}</h1>

        {live !== null && <Pill variant="local">{t('meetings.recording', 'Recording')}</Pill>}

      </header>



      {error !== null && <ErrorState message={error} />}



      {live === null ? (

        <Card title={t('meetings.start', 'Start meeting listener')}>

          <ExplainBubble

            title={t('meetings.consentExplain.title', 'Consent')}

            text={t('meetings.consentExplain.text', 'Audio stays on-device and is discarded after transcription.')}

          />

          <label className="form-field">

            <span>{t('meetings.title', 'Meeting title')}</span>

            <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} />

          </label>

          <Switch

            label={t('meetings.consent', 'I consent to on-device transcription')}

            checked={consent}

            onChange={(e) => setConsent(e.target.checked)}

          />

          <Button onClick={() => void start()} disabled={!consent || title.trim() === '' || loading}>

            {t('meetings.startBtn', 'Start')}

          </Button>

        </Card>

      ) : (

        <>

          <Card title={t('meetings.live', 'Live transcript')}>

            <pre className="transcript">{live.transcript || t('meetings.listening', 'Listening…')}</pre>

            <Button variant="ghost" onClick={() => void stop()} disabled={loading}>

              {t('meetings.stop', 'Stop')}

            </Button>

          </Card>



          <Card

            title={t('meetings.proposals', 'Proposals review')}

            actions={<Button variant="sm" onClick={() => void loadProposals()}>{t('action.refresh', 'Refresh')}</Button>}

          >

            {proposals.length === 0 ? (

              <EmptyState message={t('meetings.noProposals', 'No proposals yet')} />

            ) : (

              <>

                <ul className="proposal-list">

                  {proposals.map((p) => (

                    <li key={p.id}>

                      <Pill>{p.kind}</Pill>

                      <p>{p.text}</p>

                      <Button variant="sm" onClick={() => void applyProposal(p.id)}>

                        {t('meetings.apply', 'Apply')}

                      </Button>

                    </li>

                  ))}

                </ul>

                <Button onClick={() => void applyAll()}>{t('meetings.applyAll', 'Apply all')}</Button>

              </>

            )}

          </Card>

        </>

      )}

    </div>

  );

}


