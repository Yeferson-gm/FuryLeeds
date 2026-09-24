'use client';

import { CircleAlert, Loader2, Trash2, Upload } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/hooks/use-auth';
import { authClient } from '@/lib/auth/client';
import { toast } from '@/lib/notifications';
import { BrowserNotificationsCard } from './browser-notifications-card';
import { SettingsPanelHead } from './settings-panel-head';

const PROFILE_DATE_FORMATTER = new Intl.DateTimeFormat('es-ES', {
  year: 'numeric',
  month: 'long',
  day: 'numeric',
});
const MAX_AVATAR_BYTES = 2 * 1024 * 1024;
const ALLOWED_MIME = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
]);

function fileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () =>
      typeof reader.result === 'string'
        ? resolve(reader.result)
        : reject(new Error('No se pudo leer la imagen.'));
    reader.onerror = () => reject(new Error('No se pudo leer la imagen.'));
    reader.readAsDataURL(file);
  });
}

export function ProfileForm() {
  const {
    user,
    profile,
    accountRole,
    systemRole,
    isSuperadmin,
    refreshProfile,
  } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const previewUrlRef = useRef<string | null>(null);
  const [fullName, setFullName] = useState('');
  const [pendingAvatar, setPendingAvatar] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [removeAvatar, setRemoveAvatar] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(
    function seedProfileForm() {
      setFullName(profile?.full_name ?? '');
    },
    [profile?.full_name]
  );

  useEffect(function releaseAvatarPreviewOnUnmount() {
    return function releaseAvatarPreview() {
      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current);
      }
    };
  }, []);

  function replaceAvatarPreview(nextUrl: string | null) {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
    }
    previewUrlRef.current = nextUrl;
    setPreviewUrl(nextUrl);
  }

  const currentAvatar =
    previewUrl ?? (!removeAvatar ? (profile?.avatar_url ?? null) : null);
  const initial = (fullName || profile?.email || 'U').charAt(0).toUpperCase();
  const dirty =
    !!profile &&
    (fullName.trim() !== profile.full_name ||
      pendingAvatar !== null ||
      removeAvatar);

  function onPickFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!ALLOWED_MIME.has(file.type)) {
      toast.error('Usa una imagen PNG, JPG, WebP o GIF.');
      return;
    }
    if (file.size > MAX_AVATAR_BYTES) {
      toast.error('La imagen debe pesar 2 MB o menos.');
      return;
    }
    setPendingAvatar(file);
    replaceAvatarPreview(URL.createObjectURL(file));
    setRemoveAvatar(false);
  }

  function onRemoveAvatar() {
    setPendingAvatar(null);
    replaceAvatarPreview(null);
    setRemoveAvatar(true);
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!profile) return;
    const name = fullName.trim();
    if (!name) {
      toast.error('El nombre para mostrar es obligatorio.');
      return;
    }

    setSaving(true);
    try {
      let avatarUrl: string | null | undefined;
      if (pendingAvatar) avatarUrl = await fileAsDataUrl(pendingAvatar);
      else if (removeAvatar) avatarUrl = null;

      const response = await fetch('/api/account', {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          profile: {
            fullName: name,
            ...(avatarUrl !== undefined ? { avatarUrl } : {}),
          },
        }),
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(payload?.error ?? 'No se pudo guardar el perfil.');
      }

      setPendingAvatar(null);
      replaceAvatarPreview(null);
      setRemoveAvatar(false);
      await refreshProfile();
      await authClient.getSession({ query: { disableCookieCache: true } });
      toast.success('Perfil guardado');
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'No se pudo guardar el perfil.'
      );
    } finally {
      setSaving(false);
    }
  }

  const joined = user?.createdAt
    ? PROFILE_DATE_FORMATTER.format(new Date(user.createdAt))
    : '—';

  return (
    <section className="max-w-2xl animate-in fade-in-50 duration-200">
      <SettingsPanelHead
        title="Tu perfil"
        description="Tu nombre y avatar aparecen en el encabezado y en los espacios compartidos con tu equipo."
      />
      <form onSubmit={onSubmit} className="space-y-4">
        <Card>
          <CardContent className="space-y-6">
            <div className="flex flex-wrap items-center gap-5">
              <Avatar size="lg" className="size-16">
                {currentAvatar ? (
                  <AvatarImage src={currentAvatar} alt={fullName || 'Avatar'} />
                ) : null}
                <AvatarFallback className="bg-primary/10 text-base text-primary">
                  {initial}
                </AvatarFallback>
              </Avatar>
              <div className="flex flex-wrap gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  className="hidden"
                  onChange={onPickFile}
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={saving}
                >
                  <Upload className="size-4" />
                  {currentAvatar ? 'Cambiar foto' : 'Subir foto'}
                </Button>
                {currentAvatar ? (
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={onRemoveAvatar}
                    disabled={saving}
                  >
                    <Trash2 className="size-4" /> Quitar
                  </Button>
                ) : null}
                <p className="w-full text-xs text-muted-foreground">
                  PNG, JPG, WebP o GIF. Hasta 2 MB.
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="profile-full-name">Nombre para mostrar</Label>
              <Input
                id="profile-full-name"
                value={fullName}
                onChange={(event) => setFullName(event.target.value)}
                maxLength={120}
                disabled={saving}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="profile-email">Correo electrónico</Label>
              <Input
                id="profile-email"
                type="email"
                value={profile?.email ?? ''}
                disabled
              />
              <p className="text-xs text-muted-foreground">
                El correo de acceso no se puede cambiar desde este formulario.
              </p>
            </div>

            <div className="rounded-lg border bg-muted p-4">
              <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Detalles de la cuenta
              </p>
              <dl className="grid gap-3 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-muted-foreground">Rol del equipo</dt>
                  <dd className="mt-0.5 font-mono">{accountRole ?? '—'}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Rol del sistema</dt>
                  <dd className="mt-0.5 font-mono">
                    {isSuperadmin ? 'superadmin' : systemRole}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Se unió</dt>
                  <dd className="mt-0.5">{joined}</dd>
                </div>
                <div className="sm:col-span-2">
                  <dt className="text-muted-foreground">ID de usuario</dt>
                  <dd className="mt-0.5 break-all font-mono text-xs text-muted-foreground">
                    {user?.id ?? '—'}
                  </dd>
                </div>
              </dl>
            </div>

            {!profile ? (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <CircleAlert className="size-4" /> Cargando tu perfil…
              </p>
            ) : null}
          </CardContent>
        </Card>
        <div className="flex justify-end">
          <Button type="submit" disabled={saving || !dirty || !profile}>
            {saving ? <Loader2 className="size-4 animate-spin" /> : null}
            {saving ? 'Guardando…' : 'Guardar cambios'}
          </Button>
        </div>
      </form>
      <BrowserNotificationsCard className="mt-6" />
    </section>
  );
}
