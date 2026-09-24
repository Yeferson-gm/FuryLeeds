'use client';

import {
  Check,
  DollarSign,
  Loader2,
  MessageSquare,
  Trash2,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/hooks/use-auth';
import { confirmDestructiveAction } from '@/lib/action-alerts';
import { CURRENCIES } from '@/lib/currency';
import { toast } from '@/lib/notifications';

import type {
  Contact,
  Conversation,
  Deal,
  DealStatus,
  PipelineStage,
  Profile,
} from '@/types';

const COPY = {
  assignedTo: 'Asignado a',
  cancel: 'Cancelar',
  confirm: 'Confirmar',
  contact: 'Contacto',
  createDeal: 'Crear negocio',
  currency: 'Moneda',
  deleteDeal: 'Eliminar negocio',
  deletePrompt: '¿Eliminar este negocio?',
  deleting: 'Eliminando...',
  editDeal: 'Editar negocio',
  expectedCloseDate: 'Fecha estimada de cierre',
  linkToConversation: 'Vincular a una conversación',
  markAsLost: 'Marcar como perdido',
  markAsWon: 'Marcar como ganado',
  newDeal: 'Nuevo negocio',
  notes: 'Notas',
  notesPlaceholder: 'Agregar notas...',
  reopenDeal: 'Reabrir negocio',
  saveChanges: 'Guardar cambios',
  saving: 'Guardando...',
  selectContact: 'Selecciona un contacto',
  stage: 'Etapa',
  status: 'Estado',
  title: 'Título',
  titlePlaceholder: 'Título del negocio',
  toastCreated: 'Negocio creado',
  toastDeleted: 'Negocio eliminado',
  toastFailedCreate: 'Error al crear el negocio',
  toastFailedDelete: 'Error al eliminar el negocio',
  toastFailedSave: 'Error al guardar el negocio',
  toastFailedStatus: 'Error al actualizar el estado del negocio',
  toastMarkedLost: 'Marcado como perdido',
  toastMarkedWon: 'Marcado como ganado',
  toastNotLinked: 'Tu perfil no está vinculado a una cuenta.',
  toastNotSignedIn: 'No has iniciado sesión',
  toastReopened: 'Negocio reabierto',
  toastRequired: 'Título, contacto y etapa son obligatorios',
  toastUpdated: 'Negocio actualizado',
  unassigned: 'Sin asignar',
  value: 'Valor',
} as const;

interface DealFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  deal?: Deal | null;
  pipelineId: string;
  stages: PipelineStage[];
  defaultStageId?: string;
  onSaved: () => void;
}

export function DealForm({
  open,
  onOpenChange,
  deal,
  pipelineId,
  stages,
  defaultStageId,
  onSaved,
}: DealFormProps) {
  const { defaultCurrency } = useAuth();

  const [title, setTitle] = useState('');
  const [value, setValue] = useState('');
  const [currency, setCurrency] = useState(defaultCurrency);
  const [contactId, setContactId] = useState('');
  const [stageId, setStageId] = useState('');
  const [assignedTo, setAssignedTo] = useState('');
  const [expectedCloseDate, setExpectedCloseDate] = useState('');
  const [notes, setNotes] = useState('');

  const [contacts, setContacts] = useState<Contact[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [linkedConversation, setLinkedConversation] =
    useState<Conversation | null>(null);

  const [saving, setSaving] = useState(false);
  const [statusAction, setStatusAction] = useState<DealStatus | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Reset the form fields every time the sheet opens or its input
  // props change. This is a legitimate prop-driven sync; the rule is
  // over-cautious here, hence the block-level disable.
  useEffect(() => {
    if (!open) return;
    if (deal) {
      setTitle(deal.title);
      setValue(String(deal.value ?? ''));
      setCurrency(deal.currency || defaultCurrency);
      // contact_id is nullable when the contact has been deleted
      // (migration 004: ON DELETE SET NULL). "" means "no selection".
      setContactId(deal.contact_id ?? '');
      setStageId(deal.stage_id);
      setAssignedTo(deal.assigned_to ?? '');
      setExpectedCloseDate(deal.expected_close_date ?? '');
      setNotes(deal.notes ?? '');
    } else {
      setTitle('');
      setValue('');
      setCurrency(defaultCurrency);
      setContactId('');
      setStageId(defaultStageId || stages[0]?.id || '');
      setAssignedTo('');
      setExpectedCloseDate('');
      setNotes('');
    }
  }, [open, deal, defaultStageId, stages, defaultCurrency]);

  // Load supporting data once the sheet is open
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      const response = await fetch('/api/pipelines/resources', {
        cache: 'no-store',
      });
      if (cancelled || !response.ok) return;
      const payload = (await response.json().catch(() => ({}))) as {
        contacts?: Contact[];
        profiles?: Profile[];
      };
      setContacts(payload.contacts ?? []);
      setProfiles(payload.profiles ?? []);
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  // Fetch linked conversation for the selected contact (newest open one).
  // Clearing on no-selection is sync with prop state; the populated
  // case runs setLinkedConversation inside the async fetch callback.
  useEffect(() => {
    if (!open || !contactId) {
      setLinkedConversation(null);
      return;
    }
    let cancelled = false;
    (async () => {
      const response = await fetch(
        `/api/pipelines/resources?contact_id=${encodeURIComponent(contactId)}`,
        { cache: 'no-store' }
      );
      if (!response.ok) {
        if (!cancelled) setLinkedConversation(null);
        return;
      }
      const payload = (await response.json().catch(() => ({}))) as {
        conversation?: Conversation | null;
      };
      if (cancelled) return;
      setLinkedConversation(payload.conversation ?? null);
    })();
    return () => {
      cancelled = true;
    };
  }, [open, contactId]);

  async function handleSave() {
    if (!title.trim() || !contactId || !stageId) {
      toast.error(COPY.toastRequired);
      return;
    }
    setSaving(true);

    const payload = {
      title: title.trim(),
      value: parseFloat(value) || 0,
      currency,
      contact_id: contactId,
      pipeline_id: pipelineId,
      stage_id: stageId,
      assigned_to: assignedTo || null,
      notes: notes.trim() || null,
      expected_close_date: expectedCloseDate || null,
    };

    try {
      const response = await fetch(
        deal
          ? `/api/pipelines/${pipelineId}/deals/${deal.id}`
          : `/api/pipelines/${pipelineId}/deals`,
        {
          method: deal ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }
      );
      if (!response.ok) {
        toast.error(deal ? COPY.toastFailedSave : COPY.toastFailedCreate);
        return;
      }

      toast.success(deal ? COPY.toastUpdated : COPY.toastCreated);
      onOpenChange(false);
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  async function handleStatusChange(status: DealStatus) {
    if (!deal) return;
    setStatusAction(status);
    const response = await fetch(
      `/api/pipelines/${pipelineId}/deals/${deal.id}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      }
    );
    setStatusAction(null);
    if (!response.ok) {
      toast.error(COPY.toastFailedStatus);
      return;
    }
    toast.success(
      status === 'won'
        ? COPY.toastMarkedWon
        : status === 'lost'
          ? COPY.toastMarkedLost
          : COPY.toastReopened
    );
    onOpenChange(false);
    onSaved();
  }

  async function handleDelete() {
    if (!deal || deleting) return;
    const confirmed = await confirmDestructiveAction({
      title: COPY.deletePrompt,
      text: `El negocio "${deal.title}" se eliminará permanentemente. Esta acción no se puede deshacer.`,
      confirmText: COPY.deleteDeal,
    });
    if (!confirmed) return;

    setDeleting(true);
    try {
      const response = await fetch(
        `/api/pipelines/${pipelineId}/deals/${deal.id}`,
        { method: 'DELETE' }
      );
      if (!response.ok) {
        toast.error(COPY.toastFailedDelete);
        return;
      }
      toast.success(COPY.toastDeleted);
      onOpenChange(false);
      onSaved();
    } finally {
      setDeleting(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="bg-popover border-border text-popover-foreground sm:max-w-lg w-full p-0"
      >
        <div className="flex h-full flex-col">
          <SheetHeader className="border-b border-border/50 p-4">
            <SheetTitle className="text-popover-foreground">
              {deal ? COPY.editDeal : COPY.newDeal}
            </SheetTitle>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            <div className="grid gap-2">
              <Label className="text-muted-foreground">{COPY.title}</Label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={COPY.titlePlaceholder}
                className="border-border bg-muted text-foreground"
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="deal-contact" className="text-muted-foreground">
                {COPY.contact}
              </Label>
              <select
                id="deal-contact"
                value={contactId}
                onChange={(e) => setContactId(e.target.value)}
                className="h-9 w-full rounded-lg border border-border bg-muted px-2.5 text-sm text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary"
              >
                <option value="">{COPY.selectContact}</option>
                {contacts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name || c.phone}
                  </option>
                ))}
              </select>

              {linkedConversation && (
                <Link
                  href="/inbox"
                  className="mt-1 inline-flex items-center gap-1.5 self-start rounded-md bg-primary/10 px-2 py-1 text-xs text-primary hover:bg-primary/20"
                >
                  <MessageSquare className="h-3 w-3" />
                  {COPY.linkToConversation}
                </Link>
              )}
            </div>

            <div className="grid grid-cols-[1fr_110px] gap-3">
              <div className="grid gap-2">
                <Label className="text-muted-foreground">{COPY.value}</Label>
                <div className="relative">
                  <DollarSign className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    type="number"
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                    placeholder="0"
                    className="border-border bg-muted pl-7 text-foreground"
                  />
                </div>
              </div>
              <div className="grid gap-2">
                <Label
                  htmlFor="deal-currency"
                  className="text-muted-foreground"
                >
                  {COPY.currency}
                </Label>
                <select
                  id="deal-currency"
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                  className="h-9 w-full rounded-lg border border-border bg-muted px-2.5 text-sm text-foreground outline-none focus:border-primary"
                >
                  {CURRENCIES.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.code}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid gap-2">
              <Label className="text-muted-foreground">
                {COPY.expectedCloseDate}
              </Label>
              <Input
                type="date"
                value={expectedCloseDate}
                onChange={(e) => setExpectedCloseDate(e.target.value)}
                className="border-border bg-muted text-foreground"
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="deal-stage" className="text-muted-foreground">
                {COPY.stage}
              </Label>
              <select
                id="deal-stage"
                value={stageId}
                onChange={(e) => setStageId(e.target.value)}
                className="h-9 w-full rounded-lg border border-border bg-muted px-2.5 text-sm text-foreground outline-none focus:border-primary"
              >
                {stages.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="deal-assignee" className="text-muted-foreground">
                {COPY.assignedTo}
              </Label>
              <select
                id="deal-assignee"
                value={assignedTo}
                onChange={(e) => setAssignedTo(e.target.value)}
                className="h-9 w-full rounded-lg border border-border bg-muted px-2.5 text-sm text-foreground outline-none focus:border-primary"
              >
                <option value="">{COPY.unassigned}</option>
                {profiles.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.full_name || p.email}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid gap-2">
              <Label className="text-muted-foreground">{COPY.notes}</Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder={COPY.notesPlaceholder}
                className="min-h-25 border-border bg-muted text-foreground"
              />
            </div>

            {deal && (
              <div className="space-y-2 rounded-lg border border-border bg-muted/50 p-3">
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  {COPY.status}
                </p>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    onClick={() => handleStatusChange('won')}
                    disabled={!!statusAction || deal.status === 'won'}
                    className="flex-1 bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                  >
                    {statusAction === 'won' ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <>
                        <Check className="mr-1 h-4 w-4" />
                        {COPY.markAsWon}
                      </>
                    )}
                  </Button>
                  <Button
                    type="button"
                    onClick={() => handleStatusChange('lost')}
                    disabled={!!statusAction || deal.status === 'lost'}
                    className="flex-1 bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
                  >
                    {statusAction === 'lost' ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <>
                        <X className="mr-1 h-4 w-4" />
                        {COPY.markAsLost}
                      </>
                    )}
                  </Button>
                </div>
                {deal.status && deal.status !== 'open' && (
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => handleStatusChange('open')}
                    disabled={!!statusAction}
                    className="w-full text-muted-foreground hover:text-foreground"
                  >
                    {COPY.reopenDeal}
                  </Button>
                )}
              </div>
            )}
          </div>

          <div className="border-t border-border/50 bg-popover/80 p-4">
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => onOpenChange(false)}
                className="flex-1 border-border bg-transparent text-muted-foreground hover:bg-muted"
              >
                {COPY.cancel}
              </Button>
              <Button
                onClick={handleSave}
                disabled={saving || !title.trim() || !contactId || !stageId}
                className="flex-1 bg-primary text-primary-foreground hover:bg-primary/90"
              >
                {saving
                  ? COPY.saving
                  : deal
                    ? COPY.saveChanges
                    : COPY.createDeal}
              </Button>
            </div>

            {deal ? (
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting}
                className="mt-3 flex w-full items-center justify-center gap-1 text-xs text-red-400 hover:text-red-300 disabled:opacity-50"
              >
                <Trash2 className="h-3 w-3" />
                {deleting ? COPY.deleting : COPY.deleteDeal}
              </button>
            ) : null}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
