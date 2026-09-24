import {
  Coins,
  FileText,
  KeyRound,
  LayoutGrid,
  type LucideIcon,
  Palette,
  PlugZap,
  Shield,
  Tags,
  User,
  UsersRound,
  Zap,
} from 'lucide-react';

/**
 * Settings information architecture for the redesigned page.
 *
 * The grouped left rail uses the `?tab=` query parameter so every
 * section remains directly linkable from the rest of the application.
 */
export const SETTINGS_SECTIONS = [
  'overview',
  'profile',
  'security',
  'appearance',
  'whatsapp',
  'templates',
  'quick-replies',
  'fields',
  'deals',
  'members',
  'api',
] as const;

export type SettingsSection = (typeof SETTINGS_SECTIONS)[number];

export const DEFAULT_SECTION: SettingsSection = 'overview';

/** Rail grouping. `adminOnly` items are hidden for non-admins. */
export interface SectionMeta {
  id: SettingsSection;
  label: string;
  icon: LucideIcon;
  group: 'top' | 'account' | 'workspace';
}

export const SECTION_META: Record<SettingsSection, SectionMeta> = {
  overview: {
    id: 'overview',
    label: 'Resumen',
    icon: LayoutGrid,
    group: 'top',
  },
  profile: {
    id: 'profile',
    label: 'Tu perfil',
    icon: User,
    group: 'account',
  },
  security: {
    id: 'security',
    label: 'Acceso y seguridad',
    icon: Shield,
    group: 'account',
  },
  appearance: {
    id: 'appearance',
    label: 'Apariencia',
    icon: Palette,
    group: 'account',
  },
  whatsapp: {
    id: 'whatsapp',
    label: 'WhatsApp',
    icon: PlugZap,
    group: 'workspace',
  },
  templates: {
    id: 'templates',
    label: 'Plantillas',
    icon: FileText,
    group: 'workspace',
  },
  'quick-replies': {
    id: 'quick-replies',
    label: 'Respuestas rápidas',
    icon: Zap,
    group: 'workspace',
  },
  fields: {
    id: 'fields',
    label: 'Campos y etiquetas',
    icon: Tags,
    group: 'workspace',
  },
  deals: {
    id: 'deals',
    label: 'Negocios y moneda',
    icon: Coins,
    group: 'workspace',
  },
  members: {
    id: 'members',
    label: 'Miembros del equipo',
    icon: UsersRound,
    group: 'workspace',
  },
  api: {
    id: 'api',
    label: 'Claves de API',
    icon: KeyRound,
    group: 'workspace',
  },
};

export const RAIL_GROUPS: {
  label: string | null;
  group: SectionMeta['group'];
}[] = [
  { label: null, group: 'top' },
  { label: 'Cuenta', group: 'account' },
  { label: 'Espacio de trabajo', group: 'workspace' },
];

function isSection(value: string | null): value is SettingsSection {
  return !!value && (SETTINGS_SECTIONS as readonly string[]).includes(value);
}

/** Resolve a raw `?tab=` value, defaulting unknown values to Overview. */
export function resolveSection(raw: string | null): SettingsSection {
  return isSection(raw) ? raw : DEFAULT_SECTION;
}
