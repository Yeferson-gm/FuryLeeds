'use client';

import {
  ChevronLeft,
  ChevronRight,
  Filter,
  Loader2,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  SlidersHorizontal,
  Trash2,
  Upload,
  Users,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ContactDetailView } from '@/components/contacts/contact-detail-view';
import { ContactForm } from '@/components/contacts/contact-form';
import { CustomFieldsManager } from '@/components/contacts/custom-fields-manager';
import { ImportModal } from '@/components/contacts/import-modal';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { GatedButton } from '@/components/ui/gated-button';
import { Input } from '@/components/ui/input';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useCan } from '@/hooks/use-can';
import { confirmDestructiveAction } from '@/lib/action-alerts';
import {
  deleteContacts,
  fetchContacts as fetchContactsApi,
  fetchContactTags,
  fetchTags as fetchTagsApi,
} from '@/lib/contacts/api';
import { toast } from '@/lib/notifications';
import type { Contact, ContactTag, Tag } from '@/types';

const PAGE_SIZE = 25;

interface ContactWithTags extends Contact {
  tags?: Tag[];
}

export default function ContactsPage() {
  const canEdit = useCan('send-messages');
  const canEditSettings = useCan('edit-settings');

  const [contacts, setContacts] = useState<ContactWithTags[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  // Tag filter — contacts shown must have ANY of these tags (OR).
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const selectedTagIdSet = new Set(selectedTagIds);

  // Modals
  const [formOpen, setFormOpen] = useState(false);
  const [editContact, setEditContact] = useState<Contact | null>(null);
  const [editContactTags, setEditContactTags] = useState<ContactTag[]>([]);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailContactId, setDetailContactId] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [customFieldsOpen, setCustomFieldsOpen] = useState(false);

  // Bulk selection (page-scoped — only the loaded rows are selectable)
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // All tags for display
  const [tagsMap, setTagsMap] = useState<Record<string, Tag>>({});

  // Guards against out-of-order fetch responses: each fetchContacts run
  // claims a sequence number and only the latest is allowed to commit its
  // results. Without this, rapidly toggling tag filters could let a slower
  // earlier request resolve last and render stale rows.
  const fetchSeq = useRef(0);

  const fetchTags = useCallback(async () => {
    try {
      const { tags } = await fetchTagsApi();
      const map: Record<string, Tag> = {};
      for (const tag of tags) map[tag.id] = tag;
      setTagsMap(map);
      setSelectedTagIds((prev) => {
        const pruned = prev.filter((id) => map[id]);
        return pruned.length === prev.length ? prev : pruned;
      });
    } catch {
      toast.error('Error al cargar las etiquetas');
    }
  }, []);

  const fetchContacts = useCallback(async () => {
    const seq = ++fetchSeq.current;
    setLoading(true);
    // The visible rows are about to change — drop any selection that
    // referred to the old page/search results so the bulk bar can't
    // act on rows the user can no longer see.
    setSelected(new Set());

    try {
      const result = await fetchContactsApi({
        page,
        pageSize: PAGE_SIZE,
        search,
        tagIds: selectedTagIds,
      });
      if (seq !== fetchSeq.current) return;
      setContacts(result.contacts);
      setTotalCount(result.total);
    } catch {
      if (seq !== fetchSeq.current) return;
      toast.error('Error al cargar los contactos');
    } finally {
      if (seq === fetchSeq.current) setLoading(false);
    }
  }, [page, search, selectedTagIds]);

  // Load account tags and the current contact page independently.
  useEffect(() => {
    fetchTags();
  }, [fetchTags]);

  useEffect(() => {
    fetchContacts();
  }, [fetchContacts]);

  function openAddForm() {
    setEditContact(null);
    setEditContactTags([]);
    setFormOpen(true);
  }

  async function openEditForm(contact: Contact) {
    try {
      const { contactTags } = await fetchContactTags(contact.id);
      setEditContact(contact);
      setEditContactTags(contactTags);
      setFormOpen(true);
    } catch {
      toast.error('Error al cargar las etiquetas del contacto');
    }
  }

  function openDetail(contactId: string) {
    setDetailContactId(contactId);
    setDetailOpen(true);
  }

  async function confirmDelete(contact: Contact) {
    const label = contact.name || contact.phone;
    const confirmed = await confirmDestructiveAction({
      title: `¿Eliminar a ${label}?`,
      text: 'Se eliminará el contacto de esta cuenta. Esta acción no se puede deshacer.',
      confirmText: 'Eliminar contacto',
    });
    if (!confirmed) return;

    try {
      await deleteContacts([contact.id]);
      toast.success('Contacto eliminado');
      fetchContacts();
    } catch {
      toast.error('Error al eliminar el contacto');
    }
  }

  const allOnPageSelected =
    contacts.length > 0 && contacts.every((c) => selected.has(c.id));
  const someOnPageSelected = contacts.some((c) => selected.has(c.id));

  function toggleSelectAll() {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allOnPageSelected) {
        contacts.forEach((contact) => {
          next.delete(contact.id);
        });
      } else {
        contacts.forEach((contact) => {
          next.add(contact.id);
        });
      }
      return next;
    });
  }

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleBulkDelete() {
    const ids = [...selected];
    if (ids.length === 0) return;
    const confirmed = await confirmDestructiveAction({
      title: `¿Eliminar ${ids.length} ${ids.length === 1 ? 'contacto' : 'contactos'}?`,
      text: 'Se eliminarán los contactos seleccionados de esta cuenta. Esta acción no se puede deshacer.',
      confirmText: 'Eliminar contactos',
    });
    if (!confirmed) return;

    try {
      await deleteContacts(ids);
      toast.success(`${ids.length} contactos eliminados`);
      setSelected(new Set());
      fetchContacts();
    } catch {
      toast.error('Error al eliminar los contactos');
    }
  }

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);
  const hasNext = page < totalPages - 1;
  const hasPrev = page > 0;

  // Tag filter helpers. Every change resets to page 0 — the result set
  // shrinks/grows so page N may no longer be valid (mirrors the search box).
  const allTags = Object.values(tagsMap).sort((a, b) =>
    a.name.localeCompare(b.name)
  );
  const hasActiveFilters =
    search.trim().length > 0 || selectedTagIds.length > 0;

  function toggleTagFilter(tagId: string) {
    setSelectedTagIds((prev) =>
      prev.includes(tagId)
        ? prev.filter((id) => id !== tagId)
        : [...prev, tagId]
    );
    setPage(0);
  }

  function clearTagFilters() {
    setSelectedTagIds([]);
    setPage(0);
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{'Contactos'}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {totalCount > 0
              ? `Administra tu lista de contactos. ${totalCount} contactos en total.`
              : 'Administra tu lista de contactos.'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {canEditSettings && (
            <Button
              variant="outline"
              onClick={() => setCustomFieldsOpen(true)}
              className="border-border text-muted-foreground hover:bg-muted"
            >
              <SlidersHorizontal className="size-4" />
              {'Campos personalizados'}
            </Button>
          )}
          <GatedButton
            variant="outline"
            canAct={canEdit}
            gateReason="add or import contacts"
            onClick={() => setImportOpen(true)}
            className="border-border text-muted-foreground hover:bg-muted"
          >
            <Upload className="size-4" />
            {'Importar'}
          </GatedButton>
          <GatedButton
            canAct={canEdit}
            gateReason="add or import contacts"
            onClick={openAddForm}
            className="bg-primary hover:bg-primary/90 text-primary-foreground"
          >
            <Plus className="size-4" />
            {'Agregar contacto'}
          </GatedButton>
        </div>
      </div>

      {/* Search + tag filter */}
      <div className="space-y-2">
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative w-full max-w-sm">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                // Reset pagination when the query changes — the result
                // set shrinks/grows, page N may no longer be valid.
                setPage(0);
              }}
              placeholder={'Buscar por nombre, teléfono o correo...'}
              className="pl-8 bg-card border-border text-foreground placeholder:text-muted-foreground"
            />
          </div>

          <Popover>
            <PopoverTrigger
              render={
                <Button
                  variant="outline"
                  className="border-border text-muted-foreground hover:bg-muted shrink-0"
                />
              }
            >
              <Filter className="size-4" />
              {'Filtrar por etiquetas'}
              {selectedTagIds.length > 0 && (
                <span className="ml-1 inline-flex items-center justify-center rounded-full bg-primary px-1.5 text-[10px] font-semibold text-primary-foreground">
                  {selectedTagIds.length}
                </span>
              )}
            </PopoverTrigger>
            <PopoverContent align="start" className="w-64 p-0">
              <div className="flex items-center justify-between px-3 py-2 border-b border-border">
                <span className="text-sm font-medium text-popover-foreground">
                  {'Filtrar por etiquetas'}
                </span>
                {selectedTagIds.length > 0 && (
                  <button
                    type="button"
                    onClick={clearTagFilters}
                    className="text-xs text-muted-foreground hover:text-foreground"
                  >
                    {'Limpiar todo'}
                  </button>
                )}
              </div>
              {allTags.length === 0 ? (
                <p className="px-3 py-4 text-sm text-muted-foreground text-center">
                  {'Aún no hay etiquetas.'}
                </p>
              ) : (
                <div className="max-h-64 overflow-y-auto py-1">
                  {allTags.map((tag) => (
                    <label
                      key={tag.id}
                      htmlFor={`tag-filter-${tag.id}`}
                      className="flex items-center gap-2.5 px-3 py-1.5 cursor-pointer hover:bg-muted/50"
                    >
                      <Checkbox
                        id={`tag-filter-${tag.id}`}
                        checked={selectedTagIdSet.has(tag.id)}
                        onCheckedChange={() => toggleTagFilter(tag.id)}
                        aria-label={`Filter by ${tag.name}`}
                      />
                      <span
                        className="size-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: tag.color }}
                      />
                      <span className="text-sm text-popover-foreground truncate">
                        {tag.name}
                      </span>
                    </label>
                  ))}
                </div>
              )}
            </PopoverContent>
          </Popover>
        </div>

        {/* Active tag-filter chips */}
        {selectedTagIds.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            {selectedTagIds.map((id) => {
              const tag = tagsMap[id];
              if (!tag) return null;
              return (
                <span
                  key={id}
                  className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium"
                  style={{
                    backgroundColor: `${tag.color}20`,
                    color: tag.color,
                  }}
                >
                  {tag.name}
                  <button
                    type="button"
                    onClick={() => toggleTagFilter(id)}
                    aria-label={`Remove ${tag.name} filter`}
                    className="hover:opacity-70"
                  >
                    <X className="size-3" />
                  </button>
                </span>
              );
            })}
            <button
              type="button"
              onClick={clearTagFilters}
              className="text-xs text-muted-foreground hover:text-foreground px-1"
            >
              {'Limpiar todo'}
            </button>
          </div>
        )}
      </div>

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div className="flex items-center justify-between gap-4 rounded-lg border border-border bg-muted/40 px-4 py-2">
          <p className="text-sm text-foreground">
            {selected.size} seleccionados
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSelected(new Set())}
              className="text-muted-foreground hover:text-foreground"
            >
              {'Limpiar'}
            </Button>
            <GatedButton
              variant="destructive"
              size="sm"
              canAct={canEdit}
              gateReason="delete contacts"
              onClick={handleBulkDelete}
            >
              <Trash2 className="size-4" />
              {'Eliminar seleccionados'}
            </GatedButton>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="rounded-lg border border-border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="border-border hover:bg-transparent">
              <TableHead className="w-10">
                <Checkbox
                  checked={allOnPageSelected}
                  indeterminate={!allOnPageSelected && someOnPageSelected}
                  onCheckedChange={toggleSelectAll}
                  disabled={contacts.length === 0}
                  aria-label={'Seleccionar todos los contactos de esta página'}
                />
              </TableHead>
              <TableHead className="text-muted-foreground">
                {'Nombre'}
              </TableHead>
              <TableHead className="text-muted-foreground">
                {'Teléfono'}
              </TableHead>
              <TableHead className="text-muted-foreground hidden md:table-cell">
                {'Correo'}
              </TableHead>
              <TableHead className="text-muted-foreground hidden lg:table-cell">
                {'Empresa'}
              </TableHead>
              <TableHead className="text-muted-foreground hidden md:table-cell">
                {'Etiquetas'}
              </TableHead>
              <TableHead className="text-muted-foreground hidden lg:table-cell">
                {'Creado'}
              </TableHead>
              <TableHead className="text-muted-foreground w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow className="border-border">
                <TableCell colSpan={8} className="text-center py-12">
                  <div className="flex flex-col items-center gap-2">
                    <Loader2 className="size-6 animate-spin text-primary" />
                    <p className="text-sm text-muted-foreground">
                      {'Cargando contactos...'}
                    </p>
                  </div>
                </TableCell>
              </TableRow>
            ) : contacts.length === 0 ? (
              <TableRow className="border-border">
                <TableCell colSpan={8} className="text-center py-12">
                  <div className="flex flex-col items-center gap-2">
                    <Users className="size-8 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">
                      {hasActiveFilters
                        ? 'Ningún contacto coincide con tus filtros.'
                        : 'Aún no hay contactos.'}
                    </p>
                    {!hasActiveFilters && (
                      <GatedButton
                        canAct={canEdit}
                        gateReason="add or import contacts"
                        variant="outline"
                        size="sm"
                        onClick={openAddForm}
                        className="mt-2 border-border text-muted-foreground hover:bg-muted"
                      >
                        <Plus className="size-3.5" />
                        {'Agrega tu primer contacto'}
                      </GatedButton>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              contacts.map((contact) => (
                <TableRow
                  key={contact.id}
                  className="border-border hover:bg-muted/50 cursor-pointer"
                  onClick={() => openDetail(contact.id)}
                >
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <Checkbox
                      checked={selected.has(contact.id)}
                      onCheckedChange={() => toggleSelect(contact.id)}
                      aria-label={`Select ${contact.name || contact.phone}`}
                    />
                  </TableCell>
                  <TableCell className="text-foreground font-medium">
                    {contact.name || (
                      <span className="text-muted-foreground italic">
                        {'Sin nombre'}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground font-mono text-xs">
                    {contact.phone}
                  </TableCell>
                  <TableCell className="text-muted-foreground hidden md:table-cell text-sm">
                    {contact.email || (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground hidden lg:table-cell text-sm">
                    {contact.company || (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    <div className="flex flex-wrap gap-1">
                      {contact.tags && contact.tags.length > 0 ? (
                        contact.tags.slice(0, 3).map((tag) => (
                          <span
                            key={tag.id}
                            className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium"
                            style={{
                              backgroundColor: `${tag.color}20`,
                              color: tag.color,
                            }}
                          >
                            {tag.name}
                          </span>
                        ))
                      ) : (
                        <span className="text-muted-foreground text-xs">-</span>
                      )}
                      {contact.tags && contact.tags.length > 3 && (
                        <span className="text-[10px] text-muted-foreground">
                          +{contact.tags.length - 3}
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-xs hidden lg:table-cell">
                    {new Date(contact.created_at).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })}
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        render={
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            className="text-muted-foreground hover:text-foreground"
                            onClick={(e) => e.stopPropagation()}
                          />
                        }
                      >
                        <MoreHorizontal className="size-4" />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent
                        align="end"
                        className="bg-popover border-border"
                      >
                        <DropdownMenuItem
                          onClick={(e) => {
                            e.stopPropagation();
                            openEditForm(contact);
                          }}
                          className="text-popover-foreground focus:bg-muted focus:text-foreground"
                        >
                          <Pencil className="size-4" />
                          {'Editar'}
                        </DropdownMenuItem>
                        <DropdownMenuSeparator className="bg-border" />
                        <DropdownMenuItem
                          variant="destructive"
                          onClick={(e) => {
                            e.stopPropagation();
                            confirmDelete(contact);
                          }}
                        >
                          <Trash2 className="size-4" />
                          {'Eliminar'}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            Mostrando {page * PAGE_SIZE + 1}-
            {Math.min((page + 1) * PAGE_SIZE, totalCount)} de {totalCount}
          </p>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon-sm"
              disabled={!hasPrev}
              onClick={() => setPage((p) => p - 1)}
              className="border-border text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30"
              aria-label="Página anterior"
            >
              <ChevronLeft className="size-4" />
            </Button>
            <span className="text-xs text-muted-foreground px-2">
              Página {page + 1} de {totalPages}
            </span>
            <Button
              variant="outline"
              size="icon-sm"
              disabled={!hasNext}
              onClick={() => setPage((p) => p + 1)}
              className="border-border text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30"
              aria-label="Página siguiente"
            >
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Contact Form Dialog */}
      <ContactForm
        open={formOpen}
        onOpenChange={setFormOpen}
        contact={editContact}
        contactTags={editContactTags}
        onSaved={() => {
          fetchContacts();
          fetchTags();
        }}
        onViewExisting={(id) => {
          setFormOpen(false);
          openDetail(id);
        }}
      />

      {/* Contact Detail Sheet */}
      <ContactDetailView
        open={detailOpen}
        onOpenChange={setDetailOpen}
        contactId={detailContactId}
        onUpdated={fetchContacts}
      />

      {/* Import Modal */}
      <ImportModal
        open={importOpen}
        onOpenChange={setImportOpen}
        onImported={fetchContacts}
      />

      {/* Custom Fields Manager (admin+) */}
      {canEditSettings && (
        <CustomFieldsManager
          open={customFieldsOpen}
          onOpenChange={setCustomFieldsOpen}
        />
      )}
    </div>
  );
}
