'use client';

import {
  BarChart3,
  DollarSign,
  Info,
  Target,
  TrendingUp,
  Trophy,
  XCircle,
} from 'lucide-react';
import { useMemo } from 'react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useAuth } from '@/hooks/use-auth';
import { formatCurrency } from '@/lib/currency';
import type { Deal, PipelineStage } from '@/types';

const COPY = {
  avgDealSize: 'Ticket promedio',
  avgDealSizeTooltip:
    'Valor del pipeline dividido por el total de negocios: el valor promedio de un solo negocio no perdido.',
  howCalculated: 'Cómo se calcula {label}',
  lostThisMonth: 'Perdidos este mes',
  lostThisMonthTooltip:
    'Negocios marcados como perdidos desde el primer día del mes actual.',
  pipelineValue: 'Valor del pipeline',
  pipelineValueTooltip:
    'Suma de los valores de todos los negocios de este pipeline, excluyendo los marcados como perdidos.',
  totalDeals: 'Total de negocios',
  totalDealsTooltip:
    'Cantidad de negocios de este pipeline que no están marcados como perdidos. Los negocios ganados siguen incluidos.',
  weightedValue: 'Valor ponderado',
  weightedValueTooltip:
    'Ingresos esperados: el valor de cada negocio abierto × la probabilidad de su etapa. Primera etapa ≈ 10%, las etapas avanzan hasta 90%, Ganado = 100%. Los negocios perdidos se excluyen.',
  wonThisMonth: 'Ganados este mes',
  wonThisMonthTooltip:
    'Negocios marcados como ganados desde el primer día del mes actual.',
} as const;

interface PipelineAnalyticsProps {
  stages: PipelineStage[];
  deals: Deal[];
}

/**
 * Weighted pipeline value: value × per-stage probability.
 * First stage ≈ 10%, stages interpolate up to 90% before the final stage,
 * final stage (Won) = 100%. Lost deals excluded.
 */
function computeStageProbability(
  stage: PipelineStage,
  sortedStages: PipelineStage[]
): number {
  const n = sortedStages.length;
  if (n <= 1) return 1;
  const index = sortedStages.findIndex((s) => s.id === stage.id);
  if (index < 0) return 0;
  if (index === n - 1) return 1;
  const slots = n - 1;
  if (slots <= 1) return 0.1;
  const t = index / (slots - 1);
  return 0.1 + t * (0.9 - 0.1);
}

export function PipelineAnalytics({ stages, deals }: PipelineAnalyticsProps) {
  const { defaultCurrency } = useAuth();
  const sortedStages = useMemo(
    () => [...stages].sort((a, b) => a.position - b.position),
    [stages]
  );

  const stats = useMemo(() => {
    const active = deals.filter((d) => d.status !== 'lost');
    const openDeals = active.filter((d) => d.status !== 'won');

    const totalCount = active.length;
    const totalValue = active.reduce((sum, d) => sum + Number(d.value || 0), 0);
    const avgValue = totalCount > 0 ? totalValue / totalCount : 0;

    const stageById = new Map(sortedStages.map((s) => [s.id, s]));
    const weightedValue = openDeals.reduce((sum, d) => {
      const stage = stageById.get(d.stage_id);
      if (!stage) return sum;
      const prob = computeStageProbability(stage, sortedStages);
      return sum + Number(d.value || 0) * prob;
    }, 0);

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const thisMonth = (d: Deal) => {
      const ts = d.updated_at ?? d.created_at;
      return ts ? new Date(ts) >= monthStart : false;
    };
    const wonThisMonth = deals.filter(
      (d) => d.status === 'won' && thisMonth(d)
    ).length;
    const lostThisMonth = deals.filter(
      (d) => d.status === 'lost' && thisMonth(d)
    ).length;

    return {
      totalCount,
      totalValue,
      avgValue,
      weightedValue,
      wonThisMonth,
      lostThisMonth,
    };
  }, [deals, sortedStages]);

  return (
    <TooltipProvider>
      <div className="grid grid-cols-2 gap-3 rounded-xl border border-border bg-card/60 p-4 sm:grid-cols-3 xl:grid-cols-6">
        <Metric
          icon={<BarChart3 className="h-4 w-4 text-muted-foreground" />}
          label={COPY.totalDeals}
          value={String(stats.totalCount)}
          tooltip={COPY.totalDealsTooltip}
        />
        <Metric
          icon={<DollarSign className="h-4 w-4 text-primary" />}
          label={COPY.pipelineValue}
          value={formatCurrency(stats.totalValue, defaultCurrency)}
          tooltip={COPY.pipelineValueTooltip}
        />
        <Metric
          icon={<Target className="h-4 w-4 text-blue-400" />}
          label={COPY.avgDealSize}
          value={formatCurrency(stats.avgValue, defaultCurrency)}
          tooltip={COPY.avgDealSizeTooltip}
        />
        <Metric
          icon={<TrendingUp className="h-4 w-4 text-purple-400" />}
          label={COPY.weightedValue}
          value={formatCurrency(stats.weightedValue, defaultCurrency)}
          tooltip={COPY.weightedValueTooltip}
        />
        <Metric
          icon={<Trophy className="h-4 w-4 text-primary" />}
          label={COPY.wonThisMonth}
          value={String(stats.wonThisMonth)}
          tooltip={COPY.wonThisMonthTooltip}
        />
        <Metric
          icon={<XCircle className="h-4 w-4 text-red-400" />}
          label={COPY.lostThisMonth}
          value={String(stats.lostThisMonth)}
          tooltip={COPY.lostThisMonthTooltip}
        />
      </div>
    </TooltipProvider>
  );
}

function Metric({
  icon,
  label,
  value,
  tooltip,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tooltip: string;
}) {
  return (
    <div className="rounded-lg bg-muted/50 p-3">
      <div className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        {icon}
        <span>{label}</span>
        <Tooltip>
          <TooltipTrigger
            render={
              <button
                type="button"
                aria-label={`Cómo se calcula ${label}`}
                className="ml-auto text-muted-foreground hover:text-foreground focus:outline-none"
              />
            }
          >
            <Info className="h-3 w-3" />
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-xs text-left">
            {tooltip}
          </TooltipContent>
        </Tooltip>
      </div>
      <p className="mt-1 text-base font-semibold text-foreground">{value}</p>
    </div>
  );
}
