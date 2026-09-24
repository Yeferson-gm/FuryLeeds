'use client';

// ============================================================
// InviteMemberDialog
//
// The Base UI dialog owns the role/expiry/label form. After creation it
// closes and the one-time URL is revealed through the shared SweetAlert2
// helper, with an explicit copy action and acknowledgement.
//
// The plaintext token is server-stored only as a SHA-256 hash, so the URL
// is cleared from page state and modal DOM as soon as the reveal closes.
// ============================================================

import { Loader2 } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { showOneTimeSecret } from '@/lib/action-alerts';
import { toast } from '@/lib/notifications';

const COPY = {
  cancel: 'Cancelar',
  clipboardBlocked: 'Portapapeles bloqueado: copia el enlace manualmente',
  copied: 'Enlace de invitación copiado',
  copy: 'Copiar',
  creating: 'Creando...',
  dialogDesc:
    'Genera un enlace de invitación de un solo uso. Compártelo por WhatsApp, Slack o el canal que prefieras; no se necesita servicio de correo.',
  dialogTitle: 'Invitar a un compañero',
  done: 'Listo',

  generateLink: 'Generar enlace',
  inviteCreated: 'Invitación creada',

  labelHint:
    'Te ayuda a recordar a quién enviaste el enlace en la lista de pendientes de abajo.',
  labelPlaceholder: 'p. ej. Sara — equipo de soporte',
  labelTitle: 'Etiqueta',
  labelTooLong: 'La etiqueta debe tener {max} caracteres o menos',
  networkError: 'No se pudo conectar con el servidor. ¿Intentar de nuevo?',
  optional: '(opcional)',
  roleLabel: 'Rol',

  validForLabel: 'Enlace válido por',
} as const;

const ROLE_LABELS: Record<InviteRole, string> = {
  admin: 'Administrador',
  agent: 'Agente',
  viewer: 'Observador',
};

const ROLE_HINTS: Record<InviteRole, string> = {
  admin: 'Administra miembros + todo lo demás',
  agent: 'Usa las funciones; sin configuración',
  viewer: 'Solo lectura en toda la app',
};

type InviteRole = 'admin' | 'agent' | 'viewer';

interface InviteMemberDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called after a successful create so the parent re-fetches the
   *  pending-invitations list. */
  onCreated: () => void;
}

const EXPIRY_OPTIONS = [
  { value: '1', label: '1 día' },
  { value: '7', label: '7 días' },
  { value: '30', label: '30 días' },
];

// Server caps label at 80 chars (see src/app/api/account/invitations/route.ts).
// Mirror it on the client so we short-circuit before the round-trip
// rather than letting the user submit and bounce off a 400.
const MAX_LABEL_LEN = 80;

interface CreatedInvite {
  url: string;
  role: InviteRole;
  expiresInDays: number;
}

export function InviteMemberDialog({
  open,
  onOpenChange,
  onCreated,
}: InviteMemberDialogProps) {
  const [role, setRole] = useState<InviteRole>('agent');
  const [expiry, setExpiry] = useState<string>('7');
  const [label, setLabel] = useState('');
  const [submitting, setSubmitting] = useState(false);

  function reset() {
    setRole('agent');
    setExpiry('7');
    setLabel('');
    setSubmitting(false);
  }

  async function handleCreate() {
    // Mirror the server's max-length check so we don't ship an
    // obviously-too-long label across the wire just to bounce off
    // a 400. The Input also has a `maxLength={MAX_LABEL_LEN}` cap
    // but a paste can land an over-limit string into state before
    // the limit kicks in on the next keystroke — this is the safety
    // net for that path.
    const trimmedLabel = label.trim();
    if (trimmedLabel.length > MAX_LABEL_LEN) {
      toast.error(`La etiqueta debe tener ${MAX_LABEL_LEN} caracteres o menos`);
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch('/api/account/invitations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          role,
          expiresInDays: Number(expiry),
          label: trimmedLabel || undefined,
        }),
      });

      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        toast.error(payload.error || 'Error al crear la invitación');
        return;
      }

      const data = (await res.json()) as {
        url: string;
        expiresInDays: number;
      };

      const createdInvite: CreatedInvite = {
        url: data.url,
        role,
        expiresInDays: data.expiresInDays,
      };
      onCreated();
      reset();
      onOpenChange(false);
      await showOneTimeSecret({
        title: COPY.inviteCreated,
        description: `Comparte este enlace para unirse como ${ROLE_LABELS[createdInvite.role]}. Es válido por ${createdInvite.expiresInDays} ${createdInvite.expiresInDays === 1 ? 'día' : 'días'} y sólo volverá a mostrarse ahora.`,
        secret: createdInvite.url,
        copyLabel: COPY.copy,
        copiedMessage: COPY.copied,
        copyFailedMessage: COPY.clipboardBlocked,
        confirmText: COPY.done,
      });
    } catch (err) {
      console.error('[InviteMemberDialog] create error:', err);
      toast.error(COPY.networkError);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        // Reset state when the dialog closes — both for cancel and
        // for dismissal after a successful create. The plaintext URL
        // is intentionally NOT preserved across opens.
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent className="bg-popover border-border sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-popover-foreground">
            {COPY.dialogTitle}
          </DialogTitle>
          <DialogDescription className="text-muted-foreground">
            {COPY.dialogDesc}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label className="text-muted-foreground">{COPY.roleLabel}</Label>
            <Select
              value={role}
              onValueChange={(v) => v && setRole(v as InviteRole)}
            >
              <SelectTrigger className="w-full bg-muted border-border text-foreground">
                <SelectValue>{ROLE_LABELS[role]}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="admin">{ROLE_LABELS.admin}</SelectItem>
                <SelectItem value="agent">{ROLE_LABELS.agent}</SelectItem>
                <SelectItem value="viewer">{ROLE_LABELS.viewer}</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">{ROLE_HINTS[role]}</p>
          </div>

          <div className="space-y-2">
            <Label className="text-muted-foreground">
              {COPY.validForLabel}
            </Label>
            <Select value={expiry} onValueChange={(v) => v && setExpiry(v)}>
              <SelectTrigger className="w-full bg-muted border-border text-foreground">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {EXPIRY_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label className="text-muted-foreground">
              {COPY.labelTitle}{' '}
              <span className="text-xs text-muted-foreground">
                {COPY.optional}
              </span>
            </Label>
            <Input
              placeholder={COPY.labelPlaceholder}
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              maxLength={MAX_LABEL_LEN}
              className="bg-muted border-border text-foreground placeholder:text-muted-foreground"
            />
            <p className="text-xs text-muted-foreground">{COPY.labelHint}</p>
          </div>
        </div>

        <DialogFooter className="bg-popover border-border">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="border-border text-muted-foreground hover:bg-muted"
          >
            {COPY.cancel}
          </Button>
          <Button
            onClick={handleCreate}
            disabled={submitting}
            className="bg-primary hover:bg-primary/90 text-primary-foreground"
          >
            {submitting ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                {COPY.creating}
              </>
            ) : (
              COPY.generateLink
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
