'use client';

import { Bell, BellRing, CircleAlert, Loader2 } from 'lucide-react';
import { useState, useSyncExternalStore } from 'react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { useBrowserNotifyPref } from '@/hooks/use-browser-notifications';
import { toast } from '@/lib/notifications';
import {
  BROWSER_NOTIFY_CHANGE_EVENT,
  type BrowserNotifyPermission,
  getNotificationPermission,
  writeBrowserNotifyPref,
} from '@/lib/notifications/browser-notify';

const COPY = {
  deniedHint:
    'Permite las notificaciones de este sitio en la configuración de sitios de tu navegador (normalmente el ícono de candado junto a la barra de direcciones) y luego recarga la página.',
  description:
    'Recibe una alerta de escritorio por cada nuevo mensaje de cliente, incluso cuando estés en otra página. Se guarda en este dispositivo.',
  permissionDeniedToast: 'Tu navegador bloqueó las notificaciones',
  sendTest: 'Enviar notificación de prueba',
  statusDefault: 'Al activarlo, tu navegador pedirá permiso.',
  statusDenied: 'Bloqueado en la configuración del navegador',
  statusGranted: 'Permitido por tu navegador.',
  testBody:
    'Las notificaciones funcionan. Los nuevos mensajes de clientes aparecerán así.',
  testTitle: 'Notificación de prueba',
  title: 'Notificaciones del navegador',
  toggleDesc:
    'Solo funciona mientras la app esté abierta en una pestaña del navegador.',
  toggleLabel: 'Avisarme de nuevos mensajes de clientes',
  unsupported: 'Este navegador no admite notificaciones de escritorio.',
} as const;

// `Notification.permission` has no change event of its own. Re-read it
// whenever the tab regains focus (the user may have flipped the site
// setting in the browser UI) and whenever our own preference changes
// (right after requestPermission resolves).
function subscribePermission(onChange: () => void): () => void {
  window.addEventListener('focus', onChange);
  document.addEventListener('visibilitychange', onChange);
  window.addEventListener(BROWSER_NOTIFY_CHANGE_EVENT, onChange);
  return () => {
    window.removeEventListener('focus', onChange);
    document.removeEventListener('visibilitychange', onChange);
    window.removeEventListener(BROWSER_NOTIFY_CHANGE_EVENT, onChange);
  };
}

const serverPermission = (): BrowserNotifyPermission => 'unsupported';

/**
 * "Browser notifications" card — device-scoped opt-in for desktop
 * alerts about new customer messages (issue #516). Persistence is
 * localStorage; the browser's own permission grant is the real gate,
 * so the switch reads as off whenever that grant is missing.
 */
export function BrowserNotificationsCard({
  className,
}: {
  className?: string;
}) {
  const enabled = useBrowserNotifyPref();
  const permission = useSyncExternalStore(
    subscribePermission,
    getNotificationPermission,
    serverPermission
  );
  const [requesting, setRequesting] = useState(false);

  const supported = permission !== 'unsupported';
  const checked = enabled && permission === 'granted';

  const onToggle = async (next: boolean) => {
    if (!next) {
      writeBrowserNotifyPref(false);
      return;
    }
    if (permission === 'granted') {
      writeBrowserNotifyPref(true);
      return;
    }
    if (permission === 'denied') {
      toast.error(COPY.statusDenied, { description: COPY.deniedHint });
      return;
    }
    setRequesting(true);
    try {
      const result = await Notification.requestPermission();
      // Also dispatches the change event, which refreshes `permission`.
      writeBrowserNotifyPref(result === 'granted');
      if (result === 'denied') {
        toast.error(COPY.permissionDeniedToast, {
          description: COPY.deniedHint,
        });
      }
    } finally {
      setRequesting(false);
    }
  };

  const sendTest = () => {
    try {
      new Notification(COPY.testTitle, {
        body: COPY.testBody,
        icon: '/icon',
        tag: 'furyleeds-test-notification',
      });
    } catch {
      toast.error(COPY.unsupported);
    }
  };

  const statusText =
    permission === 'granted'
      ? COPY.statusGranted
      : permission === 'denied'
        ? COPY.statusDenied
        : COPY.statusDefault;

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-foreground">
          <Bell className="size-4 text-muted-foreground" />
          {COPY.title}
        </CardTitle>
        <CardDescription>{COPY.description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!supported ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <CircleAlert className="size-4 shrink-0" />
            {COPY.unsupported}
          </p>
        ) : (
          <>
            <div className="flex items-center justify-between gap-4 rounded-md border border-border p-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground">
                  {COPY.toggleLabel}
                </p>
                <p className="text-xs text-muted-foreground">
                  {COPY.toggleDesc}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {requesting && (
                  <Loader2 className="size-4 animate-spin text-muted-foreground" />
                )}
                <Switch
                  checked={checked}
                  onCheckedChange={(next) => void onToggle(next)}
                  disabled={requesting || permission === 'denied'}
                  aria-label={COPY.toggleLabel}
                />
              </div>
            </div>

            <p className="text-xs text-muted-foreground">{statusText}</p>

            {permission === 'denied' && (
              <p className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
                <CircleAlert className="mt-0.5 size-3.5 shrink-0" />
                <span>{COPY.deniedHint}</span>
              </p>
            )}

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={sendTest}
              disabled={!checked}
            >
              <BellRing className="size-4" />
              {COPY.sendTest}
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
