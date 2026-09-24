'use client';

import { Coins, Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/hooks/use-auth';
import { CURRENCIES } from '@/lib/currency';
import { toast } from '@/lib/notifications';

import { SettingsPanelHead } from './settings-panel-head';

const COPY = {
  adminOnlyHint:
    'Solo los administradores de la cuenta pueden cambiar la moneda predeterminada.',
  currencyLabel: 'Moneda',
  defaultCurrency: 'Moneda predeterminada',
  defaultCurrencyDesc:
    'Los nuevos negocios usan esta moneda por defecto, y los totales del pipeline y del panel se muestran en ella. Los negocios existentes conservan la moneda con la que se guardaron.',
  description:
    'La moneda que se usa para los nuevos negocios y para los totales del pipeline y del panel.',
  save: 'Guardar',
  saveFailed: 'Error al guardar la moneda predeterminada',
  saveSuccess: 'Moneda predeterminada actualizada',
  saving: 'Guardando...',
  title: 'Negocios y moneda',
} as const;

/**
 * Deals settings — account-wide default currency.
 *
 * One currency per account (issue #218): the chosen code seeds new
 * deals and formats every aggregated total. Existing deals keep their
 * own saved currency. The API restricts writes to admin+; non-admins see
 * a disabled, read-only control.
 */
export function DealsSettings() {
  const { defaultCurrency, canEditSettings, profileLoading, refreshProfile } =
    useAuth();

  const [selected, setSelected] = useState(defaultCurrency);
  const [saving, setSaving] = useState(false);

  // Keep the select in sync once the profile (and its account default)
  // resolves, and after a save round-trips through refreshProfile.
  useEffect(() => {
    setSelected(defaultCurrency);
  }, [defaultCurrency]);

  const dirty = selected !== defaultCurrency;

  async function handleSave() {
    if (!dirty) return;
    setSaving(true);
    try {
      const response = await fetch('/api/pipelines/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ default_currency: selected }),
      });
      if (!response.ok) {
        toast.error(COPY.saveFailed);
        return;
      }
      // Pull the new value back into the auth context so the deal form
      // and every total pick it up without a full reload.
      await refreshProfile();
      toast.success(COPY.saveSuccess);
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="max-w-2xl animate-in fade-in-50 duration-200">
      <SettingsPanelHead title={COPY.title} description={COPY.description} />
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-foreground">
            <Coins className="size-4 text-primary" />
            {COPY.defaultCurrency}
          </CardTitle>
          <CardDescription className="text-muted-foreground">
            {COPY.defaultCurrencyDesc}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-2 sm:max-w-xs">
            <Label htmlFor="default-currency" className="text-muted-foreground">
              {COPY.currencyLabel}
            </Label>
            <select
              id="default-currency"
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
              disabled={!canEditSettings || profileLoading}
              className="h-9 w-full rounded-lg border border-border bg-muted px-2.5 text-sm text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary disabled:cursor-not-allowed disabled:opacity-60"
            >
              {CURRENCIES.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.code} — {c.label}
                </option>
              ))}
            </select>
            {!canEditSettings && (
              <p className="text-xs text-muted-foreground">
                {COPY.adminOnlyHint}
              </p>
            )}
          </div>

          {canEditSettings && (
            <Button
              onClick={handleSave}
              disabled={saving || !dirty}
              className="bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {saving ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  {COPY.saving}
                </>
              ) : (
                COPY.save
              )}
            </Button>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
