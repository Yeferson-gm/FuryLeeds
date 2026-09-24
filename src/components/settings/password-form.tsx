'use client';

import { KeyRound, Loader2 } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { authClient } from '@/lib/auth/client';
import { toast } from '@/lib/notifications';

const MIN_PASSWORD = 8;

export function PasswordForm() {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (next.length < MIN_PASSWORD) {
      setFormError(
        `La contraseña debe tener al menos ${MIN_PASSWORD} caracteres.`
      );
      return;
    }
    if (next !== confirm) {
      setFormError('La nueva contraseña y la confirmación no coinciden.');
      return;
    }

    setFormError(null);
    setSaving(true);
    try {
      const result = await authClient.changePassword({
        currentPassword: current,
        newPassword: next,
        revokeOtherSessions: false,
      });

      if (result.error) {
        const message =
          result.error.status === 400
            ? 'La contraseña actual es incorrecta o esta cuenta usa Google.'
            : result.error.message;
        toast.error(message ?? 'No se pudo actualizar la contraseña.');
        return;
      }

      setCurrent('');
      setNext('');
      setConfirm('');
      toast.success('Contraseña actualizada');
    } catch {
      toast.error('No se pudo actualizar la contraseña.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-foreground">
          <KeyRound className="size-4 text-primary" />
          Contraseña
        </CardTitle>
        <CardDescription>
          Usa al menos {MIN_PASSWORD} caracteres. Tu sesión actual seguirá
          abierta.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="current-password">Contraseña actual</Label>
            <Input
              id="current-password"
              type="password"
              autoComplete="current-password"
              value={current}
              onChange={(event) => setCurrent(event.target.value)}
              disabled={saving}
              required
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="new-password">Nueva contraseña</Label>
              <Input
                id="new-password"
                type="password"
                autoComplete="new-password"
                minLength={MIN_PASSWORD}
                value={next}
                onChange={(event) => setNext(event.target.value)}
                disabled={saving}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm-password">Confirmar contraseña</Label>
              <Input
                id="confirm-password"
                type="password"
                autoComplete="new-password"
                minLength={MIN_PASSWORD}
                value={confirm}
                onChange={(event) => setConfirm(event.target.value)}
                disabled={saving}
                required
              />
            </div>
          </div>
          {formError ? (
            <p
              role="alert"
              className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive"
            >
              {formError}
            </p>
          ) : null}
          <div className="flex justify-end">
            <Button
              type="submit"
              disabled={saving || !current || !next || !confirm}
            >
              {saving ? <Loader2 className="size-4 animate-spin" /> : null}
              {saving ? 'Actualizando…' : 'Actualizar contraseña'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
