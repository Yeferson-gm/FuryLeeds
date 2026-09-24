'use client';

import { AlertTriangle, Loader2 } from 'lucide-react';

import { useCallback, useEffect, useState } from 'react';
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
  createContact,
  fetchTags as fetchTagsApi,
  findDuplicateContact,
  updateContact,
} from '@/lib/contacts/api';
import {
  type ExistingContact,
  isExactMatch,
  isUniqueViolation,
} from '@/lib/contacts/dedupe';
import { addContactTag, deleteContactTag } from '@/lib/contacts/tag-api';
import { toast } from '@/lib/notifications';
import { parseInternationalPhone } from '@/lib/whatsapp/phone-utils';
import type { Contact, ContactTag, Tag } from '@/types';

interface ContactFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contact?: Contact | null;
  contactTags?: ContactTag[];
  onSaved: () => void;
  /** Open an existing contact's detail view — used by the duplicate
   *  notice to jump to the contact that already owns this number. */
  onViewExisting?: (contactId: string) => void;
}

const EMPTY_CONTACT_TAGS: ContactTag[] = [];

export function ContactForm({
  open,
  onOpenChange,
  contact,
  contactTags = EMPTY_CONTACT_TAGS,
  onSaved,
  onViewExisting,
}: ContactFormProps) {
  const isEdit = !!contact;

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [company, setCompany] = useState('');
  const [saving, setSaving] = useState(false);

  // Duplicate-phone detection for NEW contacts. `exact` (same digits)
  // hard-blocks the save; a fuzzy trunk-variant match only warns. The
  // DB unique index (migration 022) is the real backstop — this is the
  // friendly heads-up before we get there.
  const [dupMatch, setDupMatch] = useState<{
    contact: ExistingContact;
    exact: boolean;
  } | null>(null);
  const [checkingDup, setCheckingDup] = useState(false);

  const [tags, setTags] = useState<Tag[]>([]);
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const selectedTagIdSet = new Set(selectedTagIds);
  const [loadingTags, setLoadingTags] = useState(false);

  const fetchTags = useCallback(async () => {
    setLoadingTags(true);
    try {
      const result = await fetchTagsApi();
      setTags(result.tags);
    } catch {
      toast.error('Error al cargar las etiquetas');
    } finally {
      setLoadingTags(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      setName(contact?.name ?? '');
      setPhone(contact?.phone ?? '');
      setEmail(contact?.email ?? '');
      setCompany(contact?.company ?? '');
      setSelectedTagIds(contactTags.map((ct) => ct.tag_id));
      setDupMatch(null);
      fetchTags();
    }
  }, [open, contact, contactTags, fetchTags]);

  // Look up an existing contact with this number (new contacts only).
  // Runs on blur so we don't query on every keystroke.
  async function checkDuplicate() {
    if (isEdit) return;
    const value = phone.trim();
    if (!value) {
      setDupMatch(null);
      return;
    }
    setCheckingDup(true);
    try {
      const { contact: existing } = await findDuplicateContact(value);
      setDupMatch(
        existing
          ? { contact: existing, exact: isExactMatch(existing, value) }
          : null
      );
    } finally {
      setCheckingDup(false);
    }
  }

  function toggleTag(tagId: string) {
    setSelectedTagIds((prev) =>
      prev.includes(tagId)
        ? prev.filter((id) => id !== tagId)
        : [...prev, tagId]
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!phone.trim()) {
      toast.error('El número de teléfono es obligatorio');
      return;
    }

    // A number typed here must carry its country code (leading `+`):
    // "4155551212" reads as a US number to the person typing it but is
    // delivered to +41 (Switzerland) by Meta (issue #586). Only checked
    // when the number actually changed — contacts created by the inbound
    // webhook store Meta's digits-only form, and editing their name must
    // not be blocked by a phone the user never touched.
    const phoneChanged = !isEdit || phone.trim() !== (contact?.phone ?? '');
    if (phoneChanged && !parseInternationalPhone(phone)) {
      toast.error(
        'Incluye el código de país — el número debe empezar con + (p. ej. +5215512345678)'
      );
      return;
    }

    // Hard-block an exact duplicate on create (the DB unique index is
    // the real backstop; this avoids a round-trip + a raw error toast).
    if (!isEdit && dupMatch?.exact) {
      toast.error('Ya existe un contacto con este número de teléfono');
      return;
    }

    setSaving(true);

    try {
      let contactId = contact?.id;
      const values = {
        name: name.trim() || null,
        email: email.trim() || null,
        company: company.trim() || null,
      };

      if (isEdit && contactId) {
        await updateContact(contactId, {
          ...values,
          ...(phoneChanged ? { phone: phone.trim() } : {}),
        });
      } else {
        const created = await createContact({ ...values, phone: phone.trim() });
        contactId = created.contact.id;
      }

      // Sync tags
      if (contactId) {
        const existingTagIds = new Set(contactTags.map((tag) => tag.tag_id));
        const desiredTagIds = new Set(selectedTagIds);
        const toRemove = [...existingTagIds].filter(
          (id) => !desiredTagIds.has(id)
        );
        const toAdd = [...desiredTagIds].filter(
          (id) => !existingTagIds.has(id)
        );

        for (const tagId of toRemove) {
          await deleteContactTag(contactId, tagId);
        }
        for (const tagId of toAdd) {
          await addContactTag(contactId, tagId);
        }
      }

      toast.success(
        isEdit
          ? 'Contacto actualizado correctamente'
          : 'Contacto creado correctamente'
      );
      onOpenChange(false);
      onSaved();
    } catch (err: unknown) {
      // The unique index (migration 022) rejects a duplicate phone that
      // slipped past the on-blur check (race, or a format that
      // normalizes equal). Surface it as the friendly duplicate notice
      // and, for new contacts, point the user at the existing record.
      if (isUniqueViolation(err)) {
        toast.error('Ya existe un contacto con este número de teléfono');
        if (!isEdit) {
          const { contact: existing } = await findDuplicateContact(
            phone.trim()
          );
          if (existing) setDupMatch({ contact: existing, exact: true });
        }
        return;
      }
      const message =
        err instanceof Error ? err.message : 'Error al guardar el contacto';
      toast.error(message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-popover border-border text-popover-foreground sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-popover-foreground">
            {isEdit ? 'Editar contacto' : 'Agregar contacto'}
          </DialogTitle>
          <DialogDescription className="text-muted-foreground">
            {isEdit
              ? 'Actualiza los datos y las etiquetas del contacto.'
              : 'Crea un nuevo contacto. El nombre es obligatorio.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="cf-name" className="text-muted-foreground">
              Nombre
            </Label>
            <Input
              id="cf-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="María Pérez"
              className="bg-muted border-border text-foreground placeholder:text-muted-foreground"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="cf-phone" className="text-muted-foreground">
              Número de teléfono <span className="text-red-400">*</span>
            </Label>
            <Input
              id="cf-phone"
              value={phone}
              onChange={(e) => {
                setPhone(e.target.value);
                if (dupMatch) setDupMatch(null);
              }}
              onBlur={checkDuplicate}
              placeholder="+1234567890"
              className="bg-muted border-border text-foreground placeholder:text-muted-foreground"
            />
            {dupMatch ? (
              <div
                className={`flex items-start gap-2 rounded-md border px-2.5 py-2 text-xs ${
                  dupMatch.exact
                    ? 'border-red-500/40 bg-red-500/10 text-red-300'
                    : 'border-amber-500/40 bg-amber-500/10 text-amber-300'
                }`}
              >
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                <div className="space-y-1">
                  <p>
                    {dupMatch.exact
                      ? 'Ya existe un contacto con este número de teléfono.'
                      : 'Ya existe un contacto con un número muy parecido.'}
                  </p>
                  {onViewExisting && (
                    <button
                      type="button"
                      onClick={() => onViewExisting(dupMatch.contact.id)}
                      className="font-medium underline underline-offset-2 hover:no-underline"
                    >
                      {`Ver ${dupMatch.contact.name || dupMatch.contact.phone}`}
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                Incluye el código de país, p. ej. +52 para México
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="cf-email" className="text-muted-foreground">
              Correo electrónico
            </Label>
            <Input
              id="cf-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="maria@example.com"
              className="bg-muted border-border text-foreground placeholder:text-muted-foreground"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="cf-company" className="text-muted-foreground">
              Empresa
            </Label>
            <Input
              id="cf-company"
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              placeholder="Acme S.A."
              className="bg-muted border-border text-foreground placeholder:text-muted-foreground"
            />
          </div>

          <div className="space-y-2">
            <Label className="text-muted-foreground">Etiquetas</Label>
            {loadingTags ? (
              <div className="flex items-center gap-2 text-muted-foreground text-sm">
                <Loader2 className="size-3 animate-spin" />
                Cargando etiquetas...
              </div>
            ) : tags.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                No hay etiquetas disponibles. Crea etiquetas en Configuración.
              </p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {tags.map((tag) => {
                  const selected = selectedTagIdSet.has(tag.id);
                  return (
                    <button
                      key={tag.id}
                      type="button"
                      onClick={() => toggleTag(tag.id)}
                      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors cursor-pointer ${
                        selected
                          ? 'ring-2 ring-primary ring-offset-1 ring-offset-border'
                          : 'opacity-60 hover:opacity-100'
                      }`}
                      style={{
                        backgroundColor: `${tag.color}20`,
                        color: tag.color,
                        borderColor: tag.color,
                      }}
                    >
                      {tag.name}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <DialogFooter className="bg-popover border-border">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="border-border text-muted-foreground hover:bg-muted"
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={saving || checkingDup || (!isEdit && !!dupMatch?.exact)}
              className="bg-primary hover:bg-primary/90 text-primary-foreground"
            >
              {saving && <Loader2 className="size-4 animate-spin" />}
              {isEdit ? 'Actualizar' : 'Crear'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
