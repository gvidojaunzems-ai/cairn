import type { ReactElement } from 'react';
import { t } from '../shared/i18n';

/**
 * Empty accessible landmark for the Cairn shell.
 *
 * This foundation task renders no visible content — the window only needs to
 * open blank and titled. The `<main>` landmark is present so assistive tech
 * always has a labelled primary region for later tasks to fill.
 */
export function App(): ReactElement {
  return <main aria-label={t('app.mainLandmark')} />;
}
