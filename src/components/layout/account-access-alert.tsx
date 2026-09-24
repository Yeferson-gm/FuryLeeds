'use client';

import { Loader2, TriangleAlert } from 'lucide-react';
import { useState } from 'react';
import {
  Alert,
  AlertAction,
  AlertDescription,
  AlertTitle,
} from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/use-auth';

const COPY = {
  errorBody:
    'El rol de tu cuenta no se cargó, así que toda acción se trata como de solo lectura y los cambios no se guardarán. Revisa tu conexión e inténtalo de nuevo.',
  errorTitle: 'No se pudieron cargar tus permisos',
  retry: 'Reintentar',
  unlinkedBody:
    'Nada de lo que cambies se guardará mientras esto no se resuelva: la base de datos rechaza toda escritura de un usuario sin cuenta ni rol. Si te invitaron a un equipo, pide al propietario que reenvíe la invitación. En una instalación propia, verifica que la migración de bootstrap de la cuenta se haya ejecutado para este usuario.',
  unlinkedTitle: 'Este usuario no está vinculado a una cuenta',
} as const;

/**
 * Tells the user when their account context didn't resolve.
 *
 * Without it the app looks normal but server-side account guards reject
 * writes and `useCan` disables every capability when the role is null.
 * This makes the missing account context visible and actionable.
 *
 * Renders nothing on the happy path.
 */
export function AccountAccessAlert() {
  const { accountStatus, accountStatusDetail, refreshProfile } = useAuth();
  const [retrying, setRetrying] = useState(false);

  if (accountStatus === 'loading' || accountStatus === 'ready') return null;

  const retry = async () => {
    setRetrying(true);
    try {
      await refreshProfile();
    } finally {
      setRetrying(false);
    }
  };

  return (
    <Alert variant="destructive" className="mb-4">
      <TriangleAlert />
      <AlertTitle>
        {accountStatus === 'unlinked' ? COPY.unlinkedTitle : COPY.errorTitle}
      </AlertTitle>
      <AlertDescription>
        {accountStatus === 'unlinked' ? COPY.unlinkedBody : COPY.errorBody}
        {accountStatusDetail ? (
          // The raw reason, so a self-hoster reading a bug report has
          // something to act on instead of just "it's broken".
          <span className="mt-1 block font-mono text-xs opacity-70">
            {accountStatusDetail}
          </span>
        ) : null}
      </AlertDescription>
      <AlertAction>
        <Button size="sm" variant="outline" onClick={retry} disabled={retrying}>
          {retrying ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
          {COPY.retry}
        </Button>
      </AlertAction>
    </Alert>
  );
}
