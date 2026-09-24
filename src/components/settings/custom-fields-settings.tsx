'use client';

import { Shield, SlidersHorizontal } from 'lucide-react';
import { CustomFieldsPanel } from '@/components/contacts/custom-fields-manager';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { SettingsChip } from './settings-chip';

const COPY = {
  adminRole: 'Administrador',
  fieldsDesc:
    'Campos adicionales para los contactos (p. ej. código postal, origen del lead). Aparecen en todos los contactos y en la acción de automatización “Actualizar campo del contacto”.',
  fieldsTitle: 'Campos personalizados',
} as const;

/**
 * Settings → Custom Fields card. Manages the account-wide custom
 * contact field catalogue (the same panel the Contacts page exposes
 * via a dialog). Writes are administrator-gated in both the caller and API.
 */
export function CustomFieldsSettings() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-foreground">
          <SlidersHorizontal className="size-4 text-primary" />
          {COPY.fieldsTitle}
          <SettingsChip variant="admin" className="font-medium">
            <Shield />
            {COPY.adminRole}
          </SettingsChip>
        </CardTitle>
        <CardDescription className="text-muted-foreground">
          {COPY.fieldsDesc}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <CustomFieldsPanel />
      </CardContent>
    </Card>
  );
}
