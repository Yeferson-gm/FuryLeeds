'use client';

import { useCan } from '@/hooks/use-can';

import { CustomFieldsSettings } from './custom-fields-settings';
import { SettingsPanelHead } from './settings-panel-head';
import { TagManager } from './tag-manager';

const COPY = {
  description:
    'Dos formas de organizar contactos: etiquetas de colores para agrupar rápido y campos personalizados para datos estructurados.',
  title: 'Campos y etiquetas',
} as const;

/**
 * "Fields & tags" section — merges the former Tags and Custom Fields
 * tabs. Tags are visible to everyone; the custom-fields catalogue is
 * account-wide configuration, so both its card and API are admin-gated.
 */
export function FieldsAndTagsPanel() {
  const canEditSettings = useCan('edit-settings');

  return (
    <section className="max-w-3xl animate-in fade-in-50 space-y-4 duration-200">
      <SettingsPanelHead title={COPY.title} description={COPY.description} />
      <TagManager />
      {canEditSettings ? <CustomFieldsSettings /> : null}
    </section>
  );
}
