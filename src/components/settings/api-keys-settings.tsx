'use client';

// ============================================================
// ApiKeysSettings — Settings → API keys
//
// Manage the credentials that authenticate the public REST API
// (`/api/v1/*`). Any member sees the roster (read-only); admin+ can
// mint and revoke, enforced by both the UI gate and admin-only API routes.
//
// One-time reveal: after the Base UI creation form closes, the freshly
// minted plaintext is shown once through the shared SweetAlert2 helper.
// After acknowledgement only the prefix remains; the server stores the hash.
// ============================================================

import { KeyRound, Loader2, Plus, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { RequireRole } from '@/components/auth/require-role';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/hooks/use-auth';
import {
  confirmDestructiveAction,
  showOneTimeSecret,
} from '@/lib/action-alerts';
import {
  API_SCOPES,
  type ApiScope,
  SCOPE_DESCRIPTIONS,
} from '@/lib/api-keys/scopes';
import { toast } from '@/lib/notifications';
import { SettingsPanelHead } from './settings-panel-head';

const COPY = {
  apiKeyLabel: 'Clave de API',
  askAdminHint: 'Pide a un administrador que cree una.',
  cancel: 'Cancelar',
  copy: 'Copiar',
  copyDesc:
    'Esta es la única vez que se muestra la clave completa. Guárdala en un lugar seguro; si la pierdes, revócala y crea una nueva.',
  copyFailed: 'Error al copiar: selecciona y copia manualmente',
  copySuccess: 'Clave de API copiada',
  copyTitle: 'Copia tu clave de API',
  createError: 'Error al crear la clave',
  createKey: 'Crear clave',
  createOneHint: 'Haz clic en <bold>Nueva clave de API</bold> para crear una.',
  created: 'Creada el {date}',
  creating: 'Creando…',
  description:
    'Las claves autentican la API REST pública (<apiCode>/api/v1</apiCode>) para que construyas tus propias automatizaciones. Envíalas como <headerCode>Authorization: Bearer &lt;key&gt;</headerCode>.',
  done: 'Listo',
  expired: 'Expirada',
  expires: 'expira {date}',
  lastUsed: 'último uso {date}',
  loadFailed: 'Error al cargar las claves de API',
  nameLabel: 'Nombre',
  namePlaceholder: 'p. ej. Automatización de Zapier',
  nameRequired: 'Ponle un nombre a la clave',
  networkError: 'No se pudo conectar con el servidor',
  neverUsed: 'nunca usada',
  newApiKey: 'Nueva clave de API',
  newKeyDesc:
    'Nómbrala según la integración que la usará y concede solo los alcances que necesite.',
  newKeyTitle: 'Nueva clave de API',
  noApiKeys: 'Aún no hay claves de API.',
  noScopes: 'Sin alcances',
  revoke: 'Revocar',
  revokeFailed: 'Error al revocar la clave',
  revokeSuccess: '"{name}" revocada',
  revoked: 'Revocada',
  scopesHint:
    'Una clave sin alcances aún puede llamar a <code>GET /api/v1/me</code> para verificar que funciona.',
  scopesLabel: 'Alcances',
  title: 'Claves de API',
} as const;

interface ApiKey {
  id: string;
  name: string;
  key_prefix: string;
  scopes: string[];
  last_used_at: string | null;
  expires_at: string | null;
  revoked_at: string | null;
  created_at: string;
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function keyStatus(k: ApiKey): 'active' | 'revoked' | 'expired' {
  if (k.revoked_at) return 'revoked';
  if (k.expires_at && new Date(k.expires_at).getTime() <= Date.now())
    return 'expired';
  return 'active';
}

export function ApiKeysSettings() {
  const { canEditSettings } = useAuth();

  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [revoking, setRevoking] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/account/api-keys', { cache: 'no-store' });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        toast.error(payload.error || COPY.loadFailed);
        return;
      }
      const data = (await res.json()) as { keys: ApiKey[] };
      setKeys(data.keys);
    } catch (err) {
      console.error('[ApiKeysSettings] load error:', err);
      toast.error(COPY.networkError);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleRevoke(key: ApiKey) {
    const confirmed = await confirmDestructiveAction({
      title: '¿Revocar esta clave de API?',
      text: `La integración que usa "${key.name}" perderá acceso inmediatamente. Esta acción no se puede deshacer.`,
      confirmText: 'Revocar clave',
    });
    if (!confirmed) return;

    setRevoking(key.id);
    try {
      const res = await fetch(`/api/account/api-keys/${key.id}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        toast.error(payload.error || COPY.revokeFailed);
        return;
      }
      toast.success(`"${key.name}" revocada`);
      // Reflect the revoke locally without a refetch.
      setKeys((prev) =>
        prev.map((k) =>
          k.id === key.id ? { ...k, revoked_at: new Date().toISOString() } : k
        )
      );
    } catch (err) {
      console.error('[ApiKeysSettings] revoke error:', err);
      toast.error(COPY.networkError);
    } finally {
      setRevoking(null);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="text-primary size-6 animate-spin" />
      </div>
    );
  }

  return (
    <section className="animate-in fade-in-50 space-y-6 duration-200">
      <SettingsPanelHead
        title={COPY.title}
        description={
          <>
            Las claves autentican la API REST pública (
            <code className="text-xs">/api/v1</code>) para que construyas tus
            propias automatizaciones. Envíalas como{' '}
            <code className="text-xs">{'Authorization: Bearer <key>'}</code>.
          </>
        }
        action={
          <RequireRole min="admin">
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="size-4" />
              {COPY.newApiKey}
            </Button>
          </RequireRole>
        }
      />

      {keys.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-10 text-center">
            <KeyRound className="text-muted-foreground size-6" />
            <p className="text-muted-foreground mt-2 text-sm">
              {COPY.noApiKeys}
            </p>
            {canEditSettings ? (
              <p className="text-muted-foreground mt-1 text-xs">
                Haz clic en{' '}
                <span className="text-foreground">Nueva clave de API</span> para
                crear una.
              </p>
            ) : (
              <p className="text-muted-foreground mt-1 text-xs">
                {COPY.askAdminHint}
              </p>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <ul className="divide-border divide-y">
              {keys.map((k) => {
                const status = keyStatus(k);
                const inactive = status !== 'active';
                return (
                  <li
                    key={k.id}
                    className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:gap-4"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span
                          className={`truncate text-sm font-medium ${
                            inactive
                              ? 'text-muted-foreground line-through'
                              : 'text-foreground'
                          }`}
                        >
                          {k.name}
                        </span>
                        {status === 'revoked' && (
                          <Badge className="border-border bg-muted text-muted-foreground text-[10px] tracking-wide uppercase">
                            {COPY.revoked}
                          </Badge>
                        )}
                        {status === 'expired' && (
                          <Badge className="border-border bg-muted text-muted-foreground text-[10px] tracking-wide uppercase">
                            {COPY.expired}
                          </Badge>
                        )}
                      </div>
                      <p className="text-muted-foreground mt-0.5 font-mono text-xs">
                        {k.key_prefix}…
                      </p>
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {k.scopes.length === 0 ? (
                          <span className="text-muted-foreground text-xs">
                            {COPY.noScopes}
                          </span>
                        ) : (
                          k.scopes.map((s) => (
                            <Badge
                              key={s}
                              className="border-border bg-muted text-muted-foreground text-[10px]"
                            >
                              {s}
                            </Badge>
                          ))
                        )}
                      </div>
                      <p className="text-muted-foreground mt-1.5 text-xs">
                        {`Creada el ${fmtDate(k.created_at)}`}
                        {' · '}
                        {k.last_used_at
                          ? `último uso ${fmtDate(k.last_used_at)}`
                          : COPY.neverUsed}
                        {k.expires_at && status !== 'expired'
                          ? ` · expira ${fmtDate(k.expires_at)}`
                          : ''}
                      </p>
                    </div>

                    {status === 'active' && (
                      <RequireRole min="admin">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleRevoke(k)}
                          disabled={revoking === k.id}
                          className="self-start border-red-500/40 bg-red-500/10 text-red-300 hover:border-red-500/60 hover:bg-red-500/20 hover:text-red-200 sm:self-auto"
                        >
                          {revoking === k.id ? (
                            <Loader2 className="size-4 animate-spin" />
                          ) : (
                            <Trash2 className="size-4" />
                          )}
                          {COPY.revoke}
                        </Button>
                      </RequireRole>
                    )}
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
      )}

      <CreateKeyDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={load}
      />
    </section>
  );
}

// ------------------------------------------------------------
// Create dialog — form → one-time plaintext reveal.
// ------------------------------------------------------------

function CreateKeyDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState('');
  const [scopes, setScopes] = useState<ApiScope[]>([]);
  const [submitting, setSubmitting] = useState(false);

  function reset() {
    setName('');
    setScopes([]);
    setSubmitting(false);
  }

  function toggleScope(scope: ApiScope, checked: boolean) {
    setScopes((prev) =>
      checked ? [...prev, scope] : prev.filter((s) => s !== scope)
    );
  }

  async function handleCreate() {
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error(COPY.nameRequired);
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch('/api/account/api-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmed, scopes }),
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        toast.error(payload.error || COPY.createError);
        return;
      }
      const payload = await res.json().catch(() => ({}));
      const plaintext =
        typeof payload.plaintext === 'string' ? payload.plaintext : null;
      if (!plaintext) {
        toast.error(COPY.createError);
        return;
      }

      onCreated();
      reset();
      onOpenChange(false);
      await showOneTimeSecret({
        title: COPY.copyTitle,
        description: COPY.copyDesc,
        secret: plaintext,
        copyLabel: COPY.copy,
        copiedMessage: COPY.copySuccess,
        copyFailedMessage: COPY.copyFailed,
        confirmText: COPY.done,
      });
    } catch (err) {
      console.error('[CreateKeyDialog] create error:', err);
      toast.error(COPY.networkError);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent className="border-border bg-popover sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-popover-foreground">
            {COPY.newKeyTitle}
          </DialogTitle>
          <DialogDescription className="text-muted-foreground">
            {COPY.newKeyDesc}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="api-key-name" className="text-muted-foreground">
              {COPY.nameLabel}
            </Label>
            <Input
              id="api-key-name"
              value={name}
              maxLength={80}
              placeholder={COPY.namePlaceholder}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <p className="text-muted-foreground text-sm font-medium">
              {COPY.scopesLabel}
            </p>
            <div className="border-border space-y-2 rounded-md border p-3">
              {API_SCOPES.map((scope) => (
                <label
                  key={scope}
                  htmlFor={`api-scope-${scope}`}
                  className="flex cursor-pointer items-start gap-2.5"
                >
                  <Checkbox
                    id={`api-scope-${scope}`}
                    checked={scopes.includes(scope)}
                    onCheckedChange={(checked) =>
                      toggleScope(scope, checked === true)
                    }
                    className="mt-0.5"
                  />
                  <span className="min-w-0">
                    <span className="text-foreground block font-mono text-xs">
                      {scope}
                    </span>
                    <span className="text-muted-foreground block text-xs">
                      {SCOPE_DESCRIPTIONS[scope]}
                    </span>
                  </span>
                </label>
              ))}
            </div>
            <p className="text-muted-foreground text-xs">
              Una clave sin alcances aún puede llamar a{' '}
              <code className="text-[11px]">GET /api/v1/me</code> para verificar
              que funciona.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => {
              reset();
              onOpenChange(false);
            }}
            className="border-border text-muted-foreground hover:bg-muted"
          >
            {COPY.cancel}
          </Button>
          <Button onClick={handleCreate} disabled={submitting}>
            {submitting ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                {COPY.creating}
              </>
            ) : (
              COPY.createKey
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
