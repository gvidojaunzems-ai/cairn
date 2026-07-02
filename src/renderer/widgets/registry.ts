import type { ReactElement } from 'react';

export interface WidgetDefinition {
  id: string;
  titleKey: string;
  titleFallback: string;
  defaultVisible: boolean;
  defaultOrder: number;
  render: (data: unknown) => ReactElement;
}

const registry = new Map<string, WidgetDefinition>();

export function registerWidget(def: WidgetDefinition): void {
  registry.set(def.id, def);
}

export function getWidget(id: string): WidgetDefinition | undefined {
  return registry.get(id);
}

export function getAllWidgets(): WidgetDefinition[] {
  return Array.from(registry.values()).sort((a, b) => a.defaultOrder - b.defaultOrder);
}

export interface WidgetPrefs {
  order: string[];
  visible: Record<string, boolean>;
}

export const WIDGET_PREFS_KEY = 'today.widgets';

export const DEFAULT_WIDGET_PREFS: WidgetPrefs = {
  order: [
    'contextResume',
    'standupDraft',
    'needsAttention',
    'squadWip',
    'news',
    'checks',
    'todos',
  ],
  visible: {
    contextResume: true,
    standupDraft: true,
    needsAttention: true,
    squadWip: true,
    news: true,
    checks: true,
    todos: true,
  },
};

export function mergeWidgetPrefs(stored: unknown): WidgetPrefs {
  if (stored === null || typeof stored !== 'object') {
    return DEFAULT_WIDGET_PREFS;
  }
  const s = stored as Partial<WidgetPrefs>;
  return {
    order: Array.isArray(s.order) ? s.order : DEFAULT_WIDGET_PREFS.order,
    visible: { ...DEFAULT_WIDGET_PREFS.visible, ...(s.visible ?? {}) },
  };
}
