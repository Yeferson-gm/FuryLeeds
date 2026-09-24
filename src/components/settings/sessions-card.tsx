'use client';

import { Laptop, Loader2, LogOut, Smartphone, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

import { confirmAction } from '@/lib/action-alerts';
import { authClient } from '@/lib/auth/client';
import { toast } from '@/lib/notifications';

type AuthSession = NonNullable<
  Awaited<ReturnType<typeof authClient.listSessions>>['data']
>[number];

function deviceLabel(userAgent?: string | null): string {
  if (!userAgent) return 'Dispositivo desconocido';
  if (/iphone|ipad|android|mobile/i.test(userAgent)) return 'Dispositivo móvil';
  if (/macintosh|mac os/i.test(userAgent)) return 'Mac';
  if (/windows/i.test(userAgent)) return 'Windows';
  if (/linux/i.test(userAgent)) return 'Linux';
  return 'Navegador web';
}

export function SessionsCard() {
  const current = authClient.useSession();
  const [sessions, setSessions] = useState<AuthSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyToken, setBusyToken] = useState<string | null>(null);
  const [signingOut, setSigningOut] = useState(false);

  const loadSessions = useCallback(async () => {
    setLoading(true);
    try {
      const result = await authClient.listSessions();
      if (result.error) {
        toast.error(
          result.error.message ?? 'No se pudieron cargar las sesiones.'
        );
      } else {
        setSessions(result.data ?? []);
      }
    } catch {
      toast.error('No se pudieron cargar las sesiones.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(
    function loadActiveSessions() {
      void loadSessions();
    },
    [loadSessions]
  );

  async function revokeSession(token: string) {
    const confirmed = await confirmAction({
      title: '¿Cerrar esta sesión?',
      text: 'Ese dispositivo perderá acceso a FuryLeeds inmediatamente.',
      confirmText: 'Cerrar sesión',
      cancelText: 'Cancelar',
      icon: 'warning',
      destructive: true,
    });
    if (!confirmed) return;

    setBusyToken(token);
    const result = await authClient.revokeSession({ token });
    if (result.error) {
      toast.error(result.error.message ?? 'No se pudo cerrar esa sesión.');
    } else {
      setSessions((currentSessions) =>
        currentSessions.filter((session) => session.token !== token)
      );
      toast.success('Sesión cerrada');
    }
    setBusyToken(null);
  }

  async function revokeAllSessions() {
    const confirmed = await confirmAction({
      title: '¿Cerrar sesión en todas partes?',
      text: 'Se revocarán todas tus sesiones, incluida esta, y tendrás que volver a iniciar sesión.',
      confirmText: 'Cerrar todas las sesiones',
      cancelText: 'Permanecer aquí',
      icon: 'warning',
      destructive: true,
    });
    if (!confirmed) return;

    setSigningOut(true);
    let redirectStarted = false;
    try {
      const result = await authClient.revokeSessions();
      if (result.error) {
        toast.error(
          result.error.message ?? 'No se pudieron cerrar todas las sesiones.'
        );
        return;
      }
      await authClient.signOut();
      window.location.assign('/login');
      redirectStarted = true;
    } catch {
      toast.error('No se pudieron cerrar todas las sesiones.');
    } finally {
      setSigningOut((current) => (redirectStarted ? current : false));
    }
  }

  const currentToken = current.data?.session.token;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <LogOut className="size-4 text-primary" />
          Sesiones activas
        </CardTitle>
        <CardDescription>
          Revisa los dispositivos conectados y cierra cualquier sesión que no
          reconozcas.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Cargando sesiones…
          </p>
        ) : (
          <ul className="divide-y divide-border rounded-lg border">
            {sessions.map((session) => {
              const isMobile = /iphone|ipad|android|mobile/i.test(
                session.userAgent ?? ''
              );
              const isCurrent = session.token === currentToken;
              const DeviceIcon = isMobile ? Smartphone : Laptop;
              return (
                <li
                  key={session.id}
                  className="flex items-center gap-3 px-4 py-3"
                >
                  <DeviceIcon className="size-5 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">
                      {deviceLabel(session.userAgent)}
                      {isCurrent ? (
                        <span className="ml-2 text-xs font-normal text-primary">
                          Esta sesión
                        </span>
                      ) : null}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {session.ipAddress ?? 'IP no disponible'} · Creada el{' '}
                      {new Date(session.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                  {!isCurrent ? (
                    <Button
                      type="button"
                      size="icon-sm"
                      variant="ghost"
                      aria-label="Cerrar esta sesión"
                      onClick={() => revokeSession(session.token)}
                      disabled={busyToken !== null}
                    >
                      {busyToken === session.token ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <Trash2 className="size-4" />
                      )}
                    </Button>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
        <Button
          type="button"
          variant="outline"
          onClick={revokeAllSessions}
          disabled={signingOut}
        >
          <LogOut className="size-4" />
          {signingOut
            ? 'Cerrando sesiones…'
            : 'Cerrar sesión en todos los dispositivos'}
        </Button>
      </CardContent>
    </Card>
  );
}
