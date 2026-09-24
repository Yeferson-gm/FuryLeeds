'use client';

import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Plus, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { confirmDestructiveAction } from '@/lib/action-alerts';
import { toast } from '@/lib/notifications';

import type { Pipeline, PipelineStage } from '@/types';

const COPY = {
  add: 'Agregar',
  cancel: 'Cancelar',
  changeColor: 'Cambiar color',
  createNewPipeline: 'Crear un nuevo pipeline',
  deletePipeline: 'Eliminar pipeline',
  deletePipelineBtn: 'Eliminar pipeline',
  deletePipelineDesc:
    'Esto archivará todos los negocios de este pipeline. No se puede deshacer.',
  deleting: 'Eliminando...',
  dragToReorder: 'Arrastra para reordenar',
  managePipeline: 'Administrar pipeline',
  newStageNamePlaceholder: 'Nombre de la nueva etapa',
  pipelineName: 'Nombre del pipeline',
  saveChanges: 'Guardar cambios',
  saving: 'Guardando...',
  stages: 'Etapas',
  toastDeleted: 'Pipeline eliminado',
  toastFailedAddStage: 'Error al agregar la etapa',
  toastFailedDeletePipeline: 'Error al eliminar el pipeline',
  toastFailedDeleteStage: 'Error al eliminar la etapa',
  toastFailedSave: 'Error al guardar el pipeline',
  toastMoveOrDeleteDeals: 'Primero mueve o elimina los negocios de esta etapa',
  toastSaved: 'Pipeline guardado',
} as const;

const STAGE_COLORS = [
  '#3b82f6',
  '#6366f1',
  '#8b5cf6',
  '#ec4899',
  '#f43f5e',
  '#f97316',
  '#eab308',
  '#22c55e',
  '#14b8a6',
  '#06b6d4',
];

interface PipelineSettingsProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pipeline: Pipeline;
  stages: PipelineStage[];
  onPipelinesChanged: () => void;
  onStagesChanged: () => void;
  onCreateNewPipeline: () => void;
}

export function PipelineSettings({
  open,
  onOpenChange,
  pipeline,
  stages,
  onPipelinesChanged,
  onStagesChanged,
  onCreateNewPipeline,
}: PipelineSettingsProps) {
  const [name, setName] = useState(pipeline.name);
  const [localStages, setLocalStages] = useState<PipelineStage[]>(stages);
  const [newStageName, setNewStageName] = useState('');
  const [newStageColor, setNewStageColor] = useState(STAGE_COLORS[0]);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Reset form state when the dialog opens or its prop inputs change
  // — legitimate prop-driven sync.
  useEffect(() => {
    if (!open) return;
    setName(pipeline.name);
    setLocalStages([...stages].sort((a, b) => a.position - b.position));
  }, [open, pipeline, stages]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  function handleReorder(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = localStages.findIndex((s) => s.id === active.id);
    const newIndex = localStages.findIndex((s) => s.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    setLocalStages(arrayMove(localStages, oldIndex, newIndex));
  }

  async function handleSave() {
    setSaving(true);

    try {
      const response = await fetch(`/api/pipelines/${pipeline.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          stages: localStages.map((stage) => ({
            id: stage.id,
            name: stage.name,
            color: stage.color,
          })),
        }),
      });

      if (!response.ok) {
        toast.error(COPY.toastFailedSave);
        return;
      }

      onOpenChange(false);
      onPipelinesChanged();
      onStagesChanged();
      toast.success(COPY.toastSaved);
    } finally {
      setSaving(false);
    }
  }

  async function handleAddStage() {
    const trimmed = newStageName.trim();
    if (!trimmed) return;
    const response = await fetch(`/api/pipelines/${pipeline.id}/stages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: trimmed,
        color: newStageColor,
        position: localStages.length,
      }),
    });
    if (!response.ok) {
      toast.error(COPY.toastFailedAddStage);
      return;
    }
    const payload = (await response.json().catch(() => ({}))) as {
      stage?: PipelineStage;
    };
    if (!payload.stage) {
      toast.error(COPY.toastFailedAddStage);
      return;
    }
    setLocalStages((current) => [...current, payload.stage as PipelineStage]);
    setNewStageName('');
    setNewStageColor(
      STAGE_COLORS[(localStages.length + 1) % STAGE_COLORS.length]
    );
  }

  async function handleRemoveStage(stageId: string) {
    const stage = localStages.find((item) => item.id === stageId);
    if (!stage) return;
    const confirmed = await confirmDestructiveAction({
      title: `¿Eliminar la etapa "${stage.name}"?`,
      text: 'Sólo se eliminará si no contiene negocios. Esta acción no se puede deshacer.',
      confirmText: 'Eliminar etapa',
    });
    if (!confirmed) return;

    const response = await fetch(
      `/api/pipelines/${pipeline.id}/stages/${stageId}`,
      { method: 'DELETE' }
    );
    if (!response.ok) {
      toast.error(
        response.status === 409
          ? COPY.toastMoveOrDeleteDeals
          : COPY.toastFailedDeleteStage
      );
      return;
    }
    setLocalStages((current) =>
      current.filter((stage) => stage.id !== stageId)
    );
  }

  async function handleDeletePipeline() {
    const confirmed = await confirmDestructiveAction({
      title: `¿Eliminar el pipeline "${pipeline.name}"?`,
      text: COPY.deletePipelineDesc,
      confirmText: COPY.deletePipelineBtn,
    });
    if (!confirmed) return;

    setDeleting(true);
    try {
      const response = await fetch(`/api/pipelines/${pipeline.id}`, {
        method: 'DELETE',
      });
      if (!response.ok) {
        toast.error(COPY.toastFailedDeletePipeline);
        return;
      }
      onOpenChange(false);
      onPipelinesChanged();
      toast.success(COPY.toastDeleted);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md bg-popover border-border max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-popover-foreground">
            {COPY.managePipeline}
          </DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="grid gap-2">
            <Label className="text-muted-foreground">{COPY.pipelineName}</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="border-border bg-muted text-foreground"
            />
          </div>

          <div className="grid gap-2">
            <Label className="text-muted-foreground">{COPY.stages}</Label>
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleReorder}
            >
              <SortableContext
                items={localStages.map((s) => s.id)}
                strategy={verticalListSortingStrategy}
              >
                <div className="space-y-2">
                  {localStages.map((stage, index) => (
                    <SortableStageRow
                      key={stage.id}
                      stage={stage}
                      onNameChange={(v) => {
                        const updated = [...localStages];
                        updated[index] = { ...updated[index], name: v };
                        setLocalStages(updated);
                      }}
                      onColorChange={(v) => {
                        const updated = [...localStages];
                        updated[index] = { ...updated[index], color: v };
                        setLocalStages(updated);
                      }}
                      onRemove={() => handleRemoveStage(stage.id)}
                      colors={STAGE_COLORS}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>

            {/* Add new stage */}
            <div className="mt-1 flex flex-wrap gap-1">
              {STAGE_COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  onClick={() => setNewStageColor(color)}
                  className="h-5 w-5 rounded-full border-2 transition-transform hover:scale-110"
                  style={{
                    backgroundColor: color,
                    borderColor:
                      newStageColor === color
                        ? 'var(--foreground)'
                        : 'transparent',
                  }}
                  aria-label={`Elegir color ${color}`}
                />
              ))}
            </div>
            <div className="flex items-center gap-2">
              <Input
                value={newStageName}
                onChange={(e) => setNewStageName(e.target.value)}
                placeholder={COPY.newStageNamePlaceholder}
                className="border-border bg-muted text-sm text-foreground"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleAddStage();
                }}
              />
              <Button
                variant="outline"
                size="sm"
                onClick={handleAddStage}
                disabled={!newStageName.trim()}
                className="shrink-0 border-border bg-transparent text-muted-foreground hover:bg-muted"
              >
                <Plus className="mr-1 h-3 w-3" />
                {COPY.add}
              </Button>
            </div>
          </div>

          <Button
            variant="outline"
            onClick={onCreateNewPipeline}
            className="w-full border-border bg-transparent text-muted-foreground hover:bg-muted"
          >
            <Plus className="mr-1 h-3 w-3" />
            {COPY.createNewPipeline}
          </Button>
        </div>

        <DialogFooter className="border-border bg-popover/50">
          <Button
            onClick={handleDeletePipeline}
            disabled={deleting}
            className="mr-auto bg-red-600 text-white hover:bg-red-700"
          >
            {deleting ? COPY.deleting : COPY.deletePipeline}
          </Button>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="border-border bg-transparent text-muted-foreground hover:bg-muted"
          >
            {COPY.cancel}
          </Button>
          <Button
            onClick={handleSave}
            disabled={saving || !name.trim()}
            className="bg-primary text-primary-foreground hover:bg-primary/90"
          >
            {saving ? COPY.saving : COPY.saveChanges}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SortableStageRow({
  stage,
  onNameChange,
  onColorChange,
  onRemove,
  colors,
}: {
  stage: PipelineStage;
  onNameChange: (v: string) => void;
  onColorChange: (v: string) => void;
  onRemove: () => void;
  colors: string[];
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: stage.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-2 rounded-lg border border-border bg-muted p-2"
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        className="cursor-grab touch-none text-muted-foreground hover:text-foreground active:cursor-grabbing"
        aria-label={COPY.dragToReorder}
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <ColorSwatch
        value={stage.color}
        onChange={onColorChange}
        colors={colors}
      />
      <Input
        value={stage.name}
        onChange={(e) => onNameChange(e.target.value)}
        className="h-7 flex-1 border-transparent bg-transparent text-sm text-foreground focus:border-border"
      />
      <Button
        variant="ghost"
        size="icon-xs"
        onClick={onRemove}
        className="text-muted-foreground hover:text-red-400"
        aria-label={`Eliminar etapa ${stage.name}`}
      >
        <Trash2 className="h-3 w-3" />
      </Button>
    </div>
  );
}

function ColorSwatch({
  value,
  onChange,
  colors,
}: {
  value: string;
  onChange: (v: string) => void;
  colors: string[];
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="h-4 w-4 rounded-full border border-border"
        style={{ backgroundColor: value }}
        aria-label={COPY.changeColor}
      />
      {open && (
        <>
          <button
            type="button"
            aria-label="Cerrar selector de color"
            className="fixed inset-0 z-10"
            onClick={() => setOpen(false)}
          />
          <div className="absolute left-0 top-6 z-20 flex flex-wrap gap-1 rounded-lg border border-border bg-popover p-2 shadow-lg w-36">
            {colors.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => {
                  onChange(c);
                  setOpen(false);
                }}
                className="h-5 w-5 rounded-full border-2 transition-transform hover:scale-110"
                style={{
                  backgroundColor: c,
                  borderColor:
                    c === value ? 'var(--foreground)' : 'transparent',
                }}
                aria-label={`Elegir color ${c}`}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
