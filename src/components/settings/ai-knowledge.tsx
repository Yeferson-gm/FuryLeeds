'use client';

import {
  BookOpen,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
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
import { Textarea } from '@/components/ui/textarea';
import { confirmDestructiveAction } from '@/lib/action-alerts';
import { toast } from '@/lib/notifications';

const COPY = {
  addDoc: 'Agregar documento',
  cancel: 'Cancelar',
  deleteDoc: 'Eliminar',
  description:
    'Agrega preguntas frecuentes, políticas o detalles de productos. El asistente recupera los fragmentos relevantes al redactar y responder automáticamente, para poder responder en lugar de derivar.{searchType}',
  editDoc: 'Editar',
  editDocContent: 'Contenido',
  editDocContentPlaceholder:
    'Pega la respuesta de la pregunta frecuente, el texto de la política o los detalles del producto…',
  editDocTitle: 'Título',
  editDocTitlePlaceholder: 'p. ej. Política de devoluciones y reembolsos',
  keywordSearchOn:
    ' Usando búsqueda por palabras clave; agrega una clave de embeddings arriba para la búsqueda semántica.',
  loadFailed: 'Error al cargar la base de conocimiento',
  loading: 'Cargando…',
  noDocs: 'Aún no hay documentos.',
  openFailed: 'Error al abrir el documento',
  reindex: 'Reindexar',
  reindexFailed: 'Error al reindexar.',
  reindexSuccess: '{count} documento(s) reindexado(s).',
  reindexTooltip:
    'Volver a generar los embeddings de todos los documentos (p. ej. después de agregar una clave de embeddings)',
  removeFailed: 'Error al eliminar.',
  removeSuccess: 'Documento eliminado.',
  saveDoc: 'Guardar documento',
  saveFailed: 'Error al guardar.',
  saveSuccessNew: 'Documento agregado.',
  saveSuccessUpdate: 'Documento actualizado.',
  semanticSearchOn:
    ' La búsqueda semántica está activada (clave de embeddings configurada).',
  title: 'Base de conocimiento',
  titleContentRequired: 'El título y el contenido son obligatorios.',
} as const;

interface DocSummary {
  id: string;
  title: string;
  updated_at: string;
}

/** Editor target: 'new' when creating, a doc id when editing, null when closed. */
type EditTarget = 'new' | string | null;

export function AiKnowledgeCard({
  accountId,
  canEdit,
  hasEmbeddingsKey,
}: {
  accountId: string | null;
  canEdit: boolean;
  hasEmbeddingsKey: boolean;
}) {
  const [docs, setDocs] = useState<DocSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<EditTarget>(null);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [saving, setSaving] = useState(false);
  const [reindexing, setReindexing] = useState(false);
  const loadedAccountIdRef = useRef<string | null>(null);

  const fetchDocs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/ai/knowledge');
      const data = await res.json();
      if (res.ok) setDocs(data.documents ?? []);
      else toast.error(data.error ?? COPY.loadFailed);
    } catch {
      toast.error(COPY.loadFailed);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!accountId || loadedAccountIdRef.current === accountId) return;
    loadedAccountIdRef.current = accountId;
    void fetchDocs();
  }, [accountId, fetchDocs]);

  const openNew = () => {
    setEditing('new');
    setTitle('');
    setContent('');
  };

  const openEdit = async (id: string) => {
    try {
      const res = await fetch(`/api/ai/knowledge/${id}`);
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? COPY.openFailed);
        return;
      }
      setEditing(id);
      setTitle(data.title ?? '');
      setContent(data.content ?? '');
    } catch {
      toast.error(COPY.openFailed);
    }
  };

  const cancelEdit = () => {
    setEditing(null);
    setTitle('');
    setContent('');
  };

  const save = async () => {
    if (!title.trim() || !content.trim()) {
      toast.error(COPY.titleContentRequired);
      return;
    }
    setSaving(true);
    try {
      const isNew = editing === 'new';
      const res = await fetch(
        isNew ? '/api/ai/knowledge' : `/api/ai/knowledge/${editing}`,
        {
          method: isNew ? 'POST' : 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: title.trim(),
            content: content.trim(),
          }),
        }
      );
      const data = await res.json();
      if (res.ok) {
        // A 200 with `warning` means saved but indexing degraded.
        if (data.warning) toast.warning(data.warning);
        else
          toast.success(isNew ? COPY.saveSuccessNew : COPY.saveSuccessUpdate);
        cancelEdit();
        await fetchDocs();
      } else {
        toast.error(data.error ?? COPY.saveFailed);
      }
    } catch {
      toast.error(COPY.saveFailed);
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    const document = docs.find((item) => item.id === id);
    if (!document) return;
    const confirmed = await confirmDestructiveAction({
      title: `¿Eliminar "${document.title}"?`,
      text: 'El asistente dejará de usar este contenido. Esta acción no se puede deshacer.',
      confirmText: 'Eliminar documento',
    });
    if (!confirmed) return;

    try {
      const res = await fetch(`/api/ai/knowledge/${id}`, { method: 'DELETE' });
      if (res.ok) {
        toast.success(COPY.removeSuccess);
        setDocs((d) => d.filter((x) => x.id !== id));
      } else {
        const data = await res.json();
        toast.error(data.error ?? COPY.removeFailed);
      }
    } catch {
      toast.error(COPY.removeFailed);
    }
  };

  const reindex = async () => {
    setReindexing(true);
    try {
      const res = await fetch('/api/ai/knowledge/reindex', { method: 'POST' });
      const data = await res.json();
      if (res.ok && data.success) {
        toast.success(`${data.reindexed} documento(s) reindexado(s).`);
      } else {
        toast.error(data.error ?? COPY.reindexFailed);
      }
    } catch {
      toast.error(COPY.reindexFailed);
    } finally {
      setReindexing(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <BookOpen className="h-4 w-4 text-primary" /> {COPY.title}
        </CardTitle>
        <CardDescription>
          {`Agrega preguntas frecuentes, políticas o detalles de productos. El asistente recupera los fragmentos relevantes al redactar y responder automáticamente, para poder responder en lugar de derivar.${
            hasEmbeddingsKey ? COPY.semanticSearchOn : COPY.keywordSearchOn
          }`}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <div className="flex items-center py-4 text-sm text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> {COPY.loading}
          </div>
        ) : (
          <>
            {docs.length === 0 && editing === null && (
              <p className="text-sm text-muted-foreground">{COPY.noDocs}</p>
            )}

            {docs.length > 0 && (
              <ul className="divide-y divide-border rounded-md border border-border">
                {docs.map((doc) => (
                  <li
                    key={doc.id}
                    className="flex items-center justify-between gap-2 px-3 py-2"
                  >
                    <span className="min-w-0 truncate text-sm text-foreground">
                      {doc.title}
                    </span>
                    {canEdit && (
                      <span className="flex shrink-0 gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0"
                          onClick={() => void openEdit(doc.id)}
                          title={COPY.editDoc}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                          onClick={() => void remove(doc.id)}
                          title={COPY.deleteDoc}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}

            {editing !== null ? (
              <div className="space-y-3 rounded-md border border-border p-3">
                <div className="space-y-2">
                  <Label htmlFor="kb-title">{COPY.editDocTitle}</Label>
                  <Input
                    id="kb-title"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder={COPY.editDocTitlePlaceholder}
                    disabled={saving}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="kb-content">{COPY.editDocContent}</Label>
                  <Textarea
                    id="kb-content"
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    placeholder={COPY.editDocContentPlaceholder}
                    rows={8}
                    disabled={saving}
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <Button
                    variant="ghost"
                    onClick={cancelEdit}
                    disabled={saving}
                  >
                    {COPY.cancel}
                  </Button>
                  <Button onClick={save} disabled={saving}>
                    {saving && (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    )}
                    {COPY.saveDoc}
                  </Button>
                </div>
              </div>
            ) : (
              canEdit && (
                <div className="flex items-center justify-between">
                  <Button variant="outline" size="sm" onClick={openNew}>
                    <Plus className="mr-2 h-4 w-4" /> {COPY.addDoc}
                  </Button>
                  {hasEmbeddingsKey && docs.length > 0 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={reindex}
                      disabled={reindexing}
                      title={COPY.reindexTooltip}
                    >
                      {reindexing ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <RefreshCw className="mr-2 h-4 w-4" />
                      )}
                      {COPY.reindex}
                    </Button>
                  )}
                </div>
              )
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
