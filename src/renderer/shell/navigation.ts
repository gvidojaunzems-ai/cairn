export type ScreenId =
  | 'today'
  | 'dailies'
  | 'meetings'
  | 'projects'
  | 'news'
  | 'reports'
  | 'pulse'
  | 'docs'
  | 'support'
  | 'setup'
  | 'settings';

export interface NavItem {
  id: ScreenId;
  labelKey: string;
  fallback: string;
  group: 'daily' | 'produce' | 'operate' | 'configure';
}

export const NAV_ITEMS: readonly NavItem[] = [
  { id: 'today', labelKey: 'nav.today', fallback: 'Today', group: 'daily' },
  { id: 'dailies', labelKey: 'nav.dailies', fallback: 'Dailies', group: 'daily' },
  { id: 'meetings', labelKey: 'nav.meetings', fallback: 'Meetings', group: 'daily' },
  { id: 'projects', labelKey: 'nav.projects', fallback: 'PoC Projects', group: 'daily' },
  { id: 'news', labelKey: 'nav.news', fallback: 'News & Knowledge', group: 'daily' },
  { id: 'reports', labelKey: 'nav.reports', fallback: 'Reports', group: 'produce' },
  { id: 'pulse', labelKey: 'nav.pulse', fallback: 'Team Pulse', group: 'produce' },
  { id: 'docs', labelKey: 'nav.docs', fallback: 'Docs Hub', group: 'produce' },
  { id: 'support', labelKey: 'nav.support', fallback: 'Support & Apps', group: 'operate' },
  { id: 'setup', labelKey: 'nav.setup', fallback: 'Setup', group: 'configure' },
  { id: 'settings', labelKey: 'nav.settings', fallback: 'Settings & AI', group: 'configure' },
] as const;

export const NAV_GROUPS = [
  { id: 'daily', labelKey: 'nav.group.daily', fallback: 'Daily' },
  { id: 'produce', labelKey: 'nav.group.produce', fallback: 'Produce' },
  { id: 'operate', labelKey: 'nav.group.operate', fallback: 'Operate' },
  { id: 'configure', labelKey: 'nav.group.configure', fallback: 'Configure' },
] as const;
