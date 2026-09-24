'use client';

import { Loader2 } from 'lucide-react';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { FlowEditorShell } from '@/components/flows/flow-editor-shell';
import type { FlowNodeRow, FlowRow } from '@/lib/flows/types';
import { toast } from '@/lib/notifications';

/**
 * Flow editor shell.
 *
 * Loads `{flow, nodes}` from `/api/flows/[id]` and hands it to
 * `<FlowBuilder>`. Owns the loading/error state so the builder can
 * focus purely on editing.
 *
 * Open to every authenticated user. The account-scoped API returns 404
 * when the requested flow does not belong to the active tenant.
 */
export default function FlowEditorPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();

  const [flow, setFlow] = useState<FlowRow | null>(null);
  const [nodes, setNodes] = useState<FlowNodeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!params.id) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/flows/${params.id}`);
        if (res.status === 404) {
          if (!cancelled) setNotFound(true);
          return;
        }
        if (!res.ok) throw new Error(`Failed: ${res.status}`);
        const json = (await res.json()) as {
          flow: FlowRow;
          nodes: FlowNodeRow[];
        };
        if (!cancelled) {
          setFlow(json.flow);
          setNodes(json.nodes ?? []);
        }
      } catch (err) {
        if (!cancelled) {
          console.error(err);
          toast.error('No se pudo cargar el flujo.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [params.id]);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (notFound || !flow) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3">
        <p className="text-sm text-muted-foreground">
          {'Flujo no encontrado.'}
        </p>
        <button
          type="button"
          onClick={() => router.push('/flows')}
          className="text-sm text-primary hover:opacity-80"
        >
          {'← Volver a flujos'}
        </button>
      </div>
    );
  }

  return <FlowEditorShell initialFlow={flow} initialNodes={nodes} />;
}
