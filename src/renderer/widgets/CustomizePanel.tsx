import { useCallback, useState, type ReactElement } from 'react';
import { t } from '../../shared/i18n';
import { Button, Modal, Switch } from '../components/ui';
import {
  getAllWidgets,
  mergeWidgetPrefs,
  WIDGET_PREFS_KEY,
  type WidgetPrefs,
} from './registry';
import { useCoreService } from '../hooks/use-core-service';

interface CustomizePanelProps {
  prefs: WidgetPrefs;
  onChange: (prefs: WidgetPrefs) => void;
}

export function CustomizePanel({ prefs, onChange }: CustomizePanelProps): ReactElement {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<WidgetPrefs>(prefs);
  const { invoke } = useCoreService();
  const widgets = getAllWidgets();

  const openPanel = useCallback(() => {
    setDraft(prefs);
    setOpen(true);
  }, [prefs]);

  const move = useCallback((id: string, dir: -1 | 1) => {
    setDraft((prev) => {
      const order = [...prev.order];
      const idx = order.indexOf(id);
      if (idx < 0) return prev;
      const next = idx + dir;
      if (next < 0 || next >= order.length) return prev;
      [order[idx], order[next]] = [order[next], order[idx]];
      return { ...prev, order };
    });
  }, []);

  const toggleVisible = useCallback((id: string) => {
    setDraft((prev) => ({
      ...prev,
      visible: { ...prev.visible, [id]: !prev.visible[id] },
    }));
  }, []);

  const save = useCallback(async () => {
    onChange(draft);
    await invoke('settings', 'set', { key: WIDGET_PREFS_KEY, value: draft });
    setOpen(false);
  }, [draft, onChange, invoke]);

  return (
    <>
      <Button variant="ghost" onClick={openPanel}>
        {t('today.customize', 'Customize')}
      </Button>
      <Modal
        open={open}
        title={t('today.customizeTitle', 'Customize dashboard')}
        onClose={() => setOpen(false)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              {t('action.cancel', 'Cancel')}
            </Button>
            <Button onClick={() => void save()}>
              {t('action.save', 'Save')}
            </Button>
          </>
        }
      >
        <ul className="customize-list">
          {draft.order.map((id) => {
            const def = widgets.find((w) => w.id === id);
            if (def === undefined) return null;
            const visible = draft.visible[id] !== false;
            return (
              <li key={id} className="customize-list__item">
                <Switch
                  label={t(def.titleKey, def.titleFallback)}
                  checked={visible}
                  onChange={() => toggleVisible(id)}
                />
                <span className="customize-list__actions">
                  <button type="button" className="btn btn--sm btn--ghost" onClick={() => move(id, -1)} aria-label="Move up">↑</button>
                  <button type="button" className="btn btn--sm btn--ghost" onClick={() => move(id, 1)} aria-label="Move down">↓</button>
                </span>
              </li>
            );
          })}
        </ul>
      </Modal>
    </>
  );
}

export function loadWidgetPrefsFromSettings(kv: Record<string, unknown>): WidgetPrefs {
  return mergeWidgetPrefs(kv[WIDGET_PREFS_KEY]);
}
