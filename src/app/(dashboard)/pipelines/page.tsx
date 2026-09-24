'use client';

import { ChevronDown, GitBranch, Plus, Settings } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { DealForm } from '@/components/pipelines/deal-form';
import { PipelineAnalytics } from '@/components/pipelines/pipeline-analytics';
import { PipelineBoard } from '@/components/pipelines/pipeline-board';
import { PipelineSettings } from '@/components/pipelines/pipeline-settings';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { GatedButton } from '@/components/ui/gated-button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useCan } from '@/hooks/use-can';
import { toast } from '@/lib/notifications';
import type { Deal, Pipeline, PipelineStage } from '@/types';

// Pipeline creation is an admin-class settings write; deal creation is
// operational and requires agent+. The API enforces both capabilities.

export default function PipelinesPage() {
  const canEditSettings = useCan('edit-settings');
  const canCreateDeals = useCan('send-messages');

  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [selectedPipelineId, setSelectedPipelineId] = useState<string>('');
  const [stages, setStages] = useState<PipelineStage[]>([]);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(true);

  // Dialog / sheet state
  const [newPipelineOpen, setNewPipelineOpen] = useState(false);
  const [newPipelineName, setNewPipelineName] = useState('');
  const [creating, setCreating] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Deal form state is lifted here so both the top-bar "Add Deal" and
  // the per-column "+" trigger the same Sheet.
  const [dealFormOpen, setDealFormOpen] = useState(false);
  const [editingDeal, setEditingDeal] = useState<Deal | null>(null);
  const [defaultStageId, setDefaultStageId] = useState<string>('');

  // Guard against double-seeding (React StrictMode double-effect in dev).
  const seedAttempted = useRef(false);

  const loadPipelines = useCallback(async (): Promise<Pipeline[]> => {
    const response = await fetch('/api/pipelines', { cache: 'no-store' });
    if (!response.ok) {
      const errorPayload = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      console.error('Failed to load pipelines:', errorPayload.error);
      return [];
    }
    const payload = (await response.json().catch(() => ({}))) as {
      pipelines?: Pipeline[];
    };
    return payload.pipelines ?? [];
  }, []);

  const loadPipelineData = useCallback(
    async (
      pipelineId: string
    ): Promise<{
      stages: PipelineStage[];
      deals: Deal[];
    }> => {
      const response = await fetch(`/api/pipelines/${pipelineId}`, {
        cache: 'no-store',
      });
      if (!response.ok) {
        const errorPayload = (await response.json().catch(() => ({}))) as {
          error?: string;
        };
        console.error('Failed to load pipeline:', errorPayload.error);
        return { stages: [], deals: [] };
      }
      const payload = (await response.json().catch(() => ({}))) as {
        stages?: PipelineStage[];
        deals?: Deal[];
      };
      return { stages: payload.stages ?? [], deals: payload.deals ?? [] };
    },
    []
  );

  const seedDefaultPipeline =
    useCallback(async (): Promise<Pipeline | null> => {
      if (!canEditSettings) return null;
      const response = await fetch('/api/pipelines', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Pipeline de ventas' }),
      });
      if (!response.ok) {
        const errorPayload = (await response.json().catch(() => ({}))) as {
          error?: string;
        };
        console.error('Failed to seed pipeline:', errorPayload.error);
        return null;
      }
      const payload = (await response.json().catch(() => ({}))) as {
        pipeline?: Pipeline;
        error?: string;
      };
      if (!payload.pipeline) {
        console.error('Failed to seed pipeline:', payload.error);
        return null;
      }
      return payload.pipeline;
    }, [canEditSettings]);

  // Initial load + seed-if-empty
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        let list = await loadPipelines();

        if (list.length === 0 && !seedAttempted.current) {
          seedAttempted.current = true;
          const seeded = await seedDefaultPipeline();
          if (seeded) list = await loadPipelines();
        }

        if (cancelled) return;
        setPipelines(list);
        if (list.length > 0) {
          setSelectedPipelineId((prev) =>
            prev && list.some((p) => p.id === prev) ? prev : list[0].id
          );
        } else {
          setSelectedPipelineId('');
        }
      } catch (error) {
        console.error('Failed to initialize pipelines:', error);
      } finally {
        setLoading((current) => (cancelled ? current : false));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loadPipelines, seedDefaultPipeline]);

  // Load stages + deals whenever selected pipeline changes.
  // Clearing on no-selection is a legitimate sync with URL/prop
  // state; the load completion uses async setters inside promise
  // callbacks (not synchronous in the effect body).
  useEffect(() => {
    if (!selectedPipelineId) {
      setStages([]);
      setDeals([]);
      return;
    }
    let cancelled = false;
    (async () => {
      const data = await loadPipelineData(selectedPipelineId);
      if (cancelled) return;
      setStages(data.stages);
      setDeals(data.deals);
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedPipelineId, loadPipelineData]);

  const refreshPipelines = useCallback(async () => {
    const list = await loadPipelines();
    setPipelines(list);
    if (list.length === 0) setSelectedPipelineId('');
    else if (!list.some((p) => p.id === selectedPipelineId))
      setSelectedPipelineId(list[0].id);
  }, [loadPipelines, selectedPipelineId]);

  const refreshStages = useCallback(async () => {
    if (!selectedPipelineId) return;
    const data = await loadPipelineData(selectedPipelineId);
    setStages(data.stages);
  }, [loadPipelineData, selectedPipelineId]);

  const refreshDeals = useCallback(async () => {
    if (!selectedPipelineId) return;
    const data = await loadPipelineData(selectedPipelineId);
    setDeals(data.deals);
  }, [loadPipelineData, selectedPipelineId]);

  const handleDealMoved = useCallback(
    async (dealId: string, newStageId: string) => {
      // Optimistic update — board already animated; just persist.
      setDeals((prev) =>
        prev.map((d) => (d.id === dealId ? { ...d, stage_id: newStageId } : d))
      );
      const response = await fetch(
        `/api/pipelines/${selectedPipelineId}/deals/${dealId}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ stage_id: newStageId }),
        }
      );
      if (!response.ok) {
        toast.error('Error al mover el negocio');
        refreshDeals();
      }
    },
    [refreshDeals, selectedPipelineId]
  );

  const handleAddDeal = useCallback(
    (stageId?: string) => {
      setEditingDeal(null);
      setDefaultStageId(stageId ?? stages[0]?.id ?? '');
      setDealFormOpen(true);
    },
    [stages]
  );

  const handleEditDeal = useCallback((deal: Deal) => {
    setEditingDeal(deal);
    setDefaultStageId(deal.stage_id);
    setDealFormOpen(true);
  }, []);

  async function handleCreatePipeline() {
    const name = newPipelineName.trim();
    if (!name) return;
    setCreating(true);

    const response = await fetch('/api/pipelines', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    if (!response.ok) {
      toast.error('Error al crear el pipeline');
      setCreating(false);
      return;
    }
    const payload = (await response.json().catch(() => ({}))) as {
      pipeline?: Pipeline;
    };
    const pipeline = payload.pipeline;

    if (!pipeline) {
      toast.error('Error al crear el pipeline');
      setCreating(false);
      return;
    }

    setNewPipelineName('');
    setNewPipelineOpen(false);
    setSelectedPipelineId(pipeline.id);
    await refreshPipelines();
    setCreating(false);
    toast.success('Pipeline creado');
  }

  const selectedPipeline = pipelines.find((p) => p.id === selectedPipelineId);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="h-8 w-48 animate-pulse rounded bg-muted" />
          <div className="h-9 w-28 animate-pulse rounded-lg bg-muted" />
        </div>
        <div className="flex gap-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <div
              key={i}
              className="h-96 w-72 animate-pulse rounded-xl bg-muted/50"
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          {/* Pipeline selector dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground hover:bg-muted transition-colors data-popup-open:bg-muted">
              <GitBranch className="h-4 w-4 text-primary" />
              <span className="font-semibold">
                {selectedPipeline?.name ?? 'Seleccionar pipeline'}
              </span>
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="start"
              className="w-64 border-border bg-popover text-popover-foreground"
            >
              {pipelines.length === 0 && (
                <DropdownMenuItem disabled className="text-muted-foreground">
                  {'Aún no hay pipelines'}
                </DropdownMenuItem>
              )}
              {pipelines.map((p) => (
                <DropdownMenuItem
                  key={p.id}
                  onClick={() => setSelectedPipelineId(p.id)}
                  className={
                    p.id === selectedPipelineId
                      ? 'text-primary'
                      : 'text-popover-foreground'
                  }
                >
                  <GitBranch className="mr-2 h-3.5 w-3.5" />
                  {p.name}
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator className="bg-border" />
              {selectedPipeline && (
                <DropdownMenuItem
                  onClick={() => setSettingsOpen(true)}
                  className="text-popover-foreground"
                >
                  <Settings className="mr-2 h-3.5 w-3.5" />
                  {'Administrar pipelines'}
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="flex items-center gap-2">
          <GatedButton
            variant="outline"
            canAct={canEditSettings}
            gateReason="crear pipelines"
            onClick={() => setNewPipelineOpen(true)}
            className="border-border bg-card text-foreground hover:bg-muted"
          >
            <Plus className="mr-1 h-4 w-4" />
            {'Agregar pipeline'}
          </GatedButton>
          <GatedButton
            canAct={canCreateDeals}
            gateReason="crear negocios"
            disabled={!selectedPipelineId || stages.length === 0}
            onClick={() => handleAddDeal()}
            className="bg-primary text-primary-foreground hover:bg-primary/90"
          >
            <Plus className="mr-1 h-4 w-4" />
            {'Agregar negocio'}
          </GatedButton>
        </div>
      </div>

      {/* Board */}
      {pipelines.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-20">
          <GitBranch className="h-12 w-12 text-muted-foreground" />
          <h3 className="mt-4 text-lg font-medium text-foreground">
            {'Aún no hay pipelines'}
          </h3>
          <p className="mt-2 text-sm text-muted-foreground">
            {'Crea un pipeline para empezar a dar seguimiento a los negocios'}
          </p>
          <GatedButton
            canAct={canEditSettings}
            gateReason="crear pipelines"
            onClick={() => setNewPipelineOpen(true)}
            className="mt-4 bg-primary text-primary-foreground hover:bg-primary/90"
          >
            <Plus className="mr-1 h-4 w-4" />
            {'Crear pipeline'}
          </GatedButton>
        </div>
      ) : (
        <>
          <PipelineAnalytics stages={stages} deals={deals} />
          <PipelineBoard
            stages={stages}
            deals={deals}
            onDealMoved={handleDealMoved}
            onAddDeal={handleAddDeal}
            onEditDeal={handleEditDeal}
          />
        </>
      )}

      {/* New Pipeline Dialog */}
      <Dialog open={newPipelineOpen} onOpenChange={setNewPipelineOpen}>
        <DialogContent className="sm:max-w-sm bg-popover border-border">
          <DialogHeader>
            <DialogTitle className="text-popover-foreground">
              {'Nuevo pipeline'}
            </DialogTitle>
          </DialogHeader>
          <div className="py-2">
            <Label className="text-muted-foreground">
              {'Nombre del pipeline'}
            </Label>
            <Input
              value={newPipelineName}
              onChange={(e) => setNewPipelineName(e.target.value)}
              placeholder={'p. ej. Ventas corporativas'}
              className="mt-2 bg-muted border-border text-foreground"
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCreatePipeline();
              }}
            />
            <p className="mt-2 text-xs text-muted-foreground">
              {
                'Las etapas predeterminadas (Nuevo prospecto → Ganado) se crearán automáticamente.'
              }
            </p>
          </div>
          <DialogFooter className="bg-popover/50 border-border">
            <Button
              variant="outline"
              onClick={() => setNewPipelineOpen(false)}
              className="border-border text-muted-foreground hover:bg-muted"
            >
              {'Cancelar'}
            </Button>
            <Button
              onClick={handleCreatePipeline}
              disabled={creating || !newPipelineName.trim()}
              className="bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {creating ? 'Creando...' : 'Crear pipeline'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Pipeline Settings */}
      {selectedPipeline && (
        <PipelineSettings
          open={settingsOpen}
          onOpenChange={setSettingsOpen}
          pipeline={selectedPipeline}
          stages={stages}
          onPipelinesChanged={refreshPipelines}
          onStagesChanged={refreshStages}
          onCreateNewPipeline={() => {
            setSettingsOpen(false);
            setNewPipelineOpen(true);
          }}
        />
      )}

      {/* Deal Form (Sheet) */}
      <DealForm
        open={dealFormOpen}
        onOpenChange={setDealFormOpen}
        deal={editingDeal}
        pipelineId={selectedPipelineId}
        stages={stages}
        defaultStageId={defaultStageId}
        onSaved={refreshDeals}
      />
    </div>
  );
}
