'use client';

import { Loader2, Plus, Tag as TagIcon, X } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

import { Input } from '@/components/ui/input';
import { useAuth } from '@/hooks/use-auth';
import { confirmDestructiveAction } from '@/lib/action-alerts';
import { toast } from '@/lib/notifications';

import { cn } from '@/lib/utils';
import type { Tag } from '@/types';

const COPY = {
  addTag: 'Agregar etiqueta',
  cancel: 'Cancelar',
  deleteAria: 'Eliminar {name}',
  deleteConfirm:
    '¿Eliminar la etiqueta "{name}"? Se quitará de todos los contactos y no se puede deshacer.',
  deleteTag: 'Eliminar etiqueta',
  deleting: 'Eliminando...',
  failedToCreateTag: 'Error al crear la etiqueta',
  failedToDeleteTag: 'Error al eliminar la etiqueta',
  failedToLoadTags: 'Error al cargar las etiquetas',
  nameRequired: 'El nombre de la etiqueta es obligatorio',
  noTags: 'Aún no hay etiquetas; crea la primera abajo.',
  notAuthenticated: 'No autenticado',
  placeholder: 'p. ej. Newsletter',
  tagCreated: 'Etiqueta creada',
  tagDeleted: 'Etiqueta eliminada',
  tagsDesc: 'Rótulos de colores para agrupar y filtrar contactos.',
  tagsTitle: 'Etiquetas',
  useColor: 'Usar {color}',
} as const;

const PRESET_COLORS = [
  { label: 'Rojo', value: '#ef4444' },
  { label: 'Naranja', value: '#f97316' },
  { label: 'Ámbar', value: '#f59e0b' },
  { label: 'Esmeralda', value: '#10b981' },
  { label: 'Cian', value: '#06b6d4' },
  { label: 'Azul', value: '#3b82f6' },
  { label: 'Violeta', value: '#8b5cf6' },
  { label: 'Rosa', value: '#ec4899' },
];

/**
 * Tags card — colour-coded contact labels. Creation is an inline row
 * (name + colour swatch + Add); deletion goes through a confirmation
 * dialog since it detaches the tag from every contact.
 */
export function TagManager() {
  const { user, loading: authLoading } = useAuth();

  const [loading, setLoading] = useState(true);
  const [tags, setTags] = useState<Tag[]>([]);
  const [saving, setSaving] = useState(false);
  const [newTagName, setNewTagName] = useState('');
  const [selectedColor, setSelectedColor] = useState(PRESET_COLORS[3].value);

  const fetchTags = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/tags', { cache: 'no-store' });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || COPY.failedToLoadTags);
      }
      setTags(Array.isArray(data.tags) ? data.tags : []);
    } catch (err) {
      console.error('Failed to fetch tags:', err);
      toast.error(COPY.failedToLoadTags);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setLoading(false);
      return;
    }
    fetchTags();
  }, [authLoading, user?.id, user, fetchTags]);

  async function handleCreate() {
    if (!newTagName.trim()) {
      toast.error(COPY.nameRequired);
      return;
    }

    try {
      setSaving(true);
      if (!user) {
        toast.error(COPY.notAuthenticated);
        return;
      }

      const response = await fetch('/api/tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newTagName.trim(),
          color: selectedColor,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || COPY.failedToCreateTag);
      }

      toast.success(COPY.tagCreated);
      setNewTagName('');
      setSelectedColor(PRESET_COLORS[3].value);
      await fetchTags();
    } catch (err) {
      console.error('Create error:', err);
      toast.error(COPY.failedToCreateTag);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(tag: Tag) {
    const confirmed = await confirmDestructiveAction({
      title: `¿Eliminar la etiqueta "${tag.name}"?`,
      text: 'Se quitará de todos los contactos. Esta acción no se puede deshacer.',
      confirmText: COPY.deleteTag,
    });
    if (!confirmed) return;

    try {
      const response = await fetch(`/api/tags/${tag.id}`, {
        method: 'DELETE',
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || COPY.failedToDeleteTag);
      }

      toast.success(COPY.tagDeleted);
      setTags((prev) => prev.filter((item) => item.id !== tag.id));
    } catch (err) {
      console.error('Delete error:', err);
      toast.error(COPY.failedToDeleteTag);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-foreground">
          <TagIcon className="size-4 text-primary" />
          {COPY.tagsTitle}
        </CardTitle>
        <CardDescription className="text-muted-foreground">
          {COPY.tagsDesc}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="size-6 animate-spin text-primary" />
          </div>
        ) : (
          <>
            {tags.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {tags.map((tag) => (
                  <span
                    key={tag.id}
                    className="group inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition-colors"
                    style={{
                      backgroundColor: `${tag.color}20`,
                      color: tag.color,
                      border: `1px solid ${tag.color}40`,
                    }}
                  >
                    <span
                      className="size-2 rounded-full"
                      style={{ backgroundColor: tag.color }}
                    />
                    {tag.name}
                    <button
                      type="button"
                      onClick={() => handleDelete(tag)}
                      aria-label={`Eliminar ${tag.name}`}
                      className="ml-0.5 rounded-full p-0.5 opacity-60 transition-opacity hover:bg-black/10 hover:opacity-100 dark:hover:bg-white/10"
                    >
                      <X className="size-3" />
                    </button>
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">{COPY.noTags}</p>
            )}

            {/* Inline create row */}
            <div className="flex flex-wrap items-center gap-2.5">
              <Input
                placeholder={COPY.placeholder}
                value={newTagName}
                onChange={(e) => setNewTagName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleCreate();
                }}
                disabled={saving}
                maxLength={40}
                className="min-w-45 flex-1"
              />
              <div className="flex gap-1.5">
                {PRESET_COLORS.map((color) => (
                  <button
                    key={color.value}
                    type="button"
                    onClick={() => setSelectedColor(color.value)}
                    aria-label={`Usar ${color.label}`}
                    aria-pressed={selectedColor === color.value}
                    className={cn(
                      'size-6 rounded-md transition-transform hover:scale-110',
                      selectedColor === color.value &&
                        'outline outline-offset-2 outline-primary'
                    )}
                    style={{ backgroundColor: color.value }}
                    title={color.label}
                  />
                ))}
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleCreate}
                disabled={saving || !newTagName.trim()}
              >
                {saving ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Plus className="size-4" />
                )}
                {COPY.addTag}
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
