'use client';

/**
 * Per-node configuration form, dispatched by node_type.
 *
 * One component, ten branches. Each branch renders the inputs that
 * map onto the node's `config` JSONB shape (text + buttons for
 * send_buttons, prompt + var_key for collect_input, etc.) and forwards
 * edits up via `onUpdateConfig`.
 *
 * Why this lives in src/components/flows/forms/ instead of next to
 * the list editor: PR 2 (canvas editing) needs to mount the same
 * form in a side panel when a user clicks a node on the canvas.
 * Keeping the per-node forms here means there's exactly one place
 * where each form's behaviour and validation lives — drift between
 * "what the list editor shows" and "what the canvas side panel
 * shows" becomes impossible.
 *
 * `showAdvanced` is the disclosure that surfaces internal
 * identifiers (node_key, button reply_id, list row reply_id) — owned
 * by the host (NodeCard / SideSheet) so the toggle is rendered
 * outside this form alongside whatever delete/cancel buttons that
 * host wants. The form just reads the boolean and conditionally
 * renders the advanced rows.
 */

import { Loader2, Paperclip, Plus, Trash2, Upload, X } from 'lucide-react';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from '@/lib/notifications';
import {
  MEDIA_MAX_BYTES,
  uploadAccountMedia,
} from '@/lib/storage/upload-media';
import { cn } from '@/lib/utils';
import { type BuilderNode, slugify } from '../shared';
import { NextNodeRow, NodeKeySelect, TextRow } from './fields';

const FORM_COPY = {
  advancesTo: 'Avanza a',
  textToCustomer: 'Texto enviado al cliente',
  promptToCustomer: 'Pregunta enviada al cliente',
  varKeyLabel:
    'Clave de la variable (guardada en flow_runs.vars; alfanumérica + guion bajo)',
  varKeyPlaceholder: 'p. ej. name, email, company',
  varKeyHelp:
    'Interpólala en preguntas posteriores y notas de transferencia con',
  advanceAfterCapture: 'Después de capturar, avanzar a',
  internalNote: 'Nota interna (para el agente que la tome)',
  endNodeHelp:
    'Nodo terminal. Cuando el ejecutor llega a este nodo, la ejecución se marca como completada. No requiere configuración.',
  bodyText: 'Texto del cuerpo',
  footerText: 'Pie (opcional, 60 caracteres)',
  buttonsHelp: 'Botones (1–3): cada uno lleva a un nodo siguiente distinto',
  optionTitlePlaceholder: 'Título visible (≤20 caracteres)',
  nextNodePlaceholder: 'Siguiente nodo…',
  addButton: 'Agregar botón',
  buttonLabel: 'Texto del botón para expandir (≤20 caracteres)',
  rowsHelp: 'Filas (1–10 en total entre todas las secciones)',
  rowTitlePlaceholder: 'Título de la fila (≤24)',
  addRow: 'Agregar fila',
  addSection: 'Agregar sección',
  ifLabel: 'Si',
  capturedVariable: 'Variable capturada',
  contactHasTag: 'El contacto tiene la etiqueta',
  contactField: 'Campo del contacto',
  varName: 'nombre de variable',
  tagLabel: 'Etiqueta',
  fieldLabel: 'Campo',
  pickTag: 'Elige una etiqueta…',
  pickField: 'Elige un campo…',
  operatorLabel: 'Operador',
  isPresent: 'está presente',
  isAbsent: 'está ausente',
  equals: 'es igual a',
  contains: 'contiene',
  valueLabel: 'Valor',
  ifTrueAdvance: 'Si es verdadero → avanzar a',
  ifFalseAdvance: 'Si es falso → avanzar a',
  actionLabel: 'Acción',
  addTag: 'Agregar etiqueta',
  removeTag: 'Quitar etiqueta',
  tagUuidPlaceholder: 'UUID de la etiqueta',
  thenAdvanceTo: 'Luego avanzar a',
  mediaTypeLabel: 'Tipo de archivo',
  imageLabel: 'Imagen (PNG, JPEG, WebP)',
  videoLabel: 'Video (MP4, 3GP)',
  documentLabel: 'Documento (PDF, Word, Excel, PowerPoint, TXT)',
  fileLabel: 'Archivo',
  removeFile: 'Quitar archivo',
  uploading: 'Subiendo…',
  clickToUpload: 'Haz clic para subir (máx. 16 MB)',
  captionLabel: 'Descripción (opcional, se muestra debajo del archivo)',
  filenameLabel: 'Nombre de archivo que ve el cliente (solo documentos)',
  filenamePlaceholder: 'factura.pdf',
  advanceAfterSending: 'Después de enviar, avanzar a',
  removeSection: 'Quitar sección',
  fileUploaded: 'Archivo subido.',
  uploadFailed: 'Error al subir.',
  defaultOptionTitle: 'Opción',
} as const;

interface NodeConfigFormProps {
  node: BuilderNode;
  allNodes: BuilderNode[];
  showAdvanced: boolean;
  onUpdateConfig: (patch: Record<string, unknown>) => void;
}

export function NodeConfigForm({
  node,
  allNodes,
  showAdvanced,
  onUpdateConfig,
}: NodeConfigFormProps) {
  const cfg = node.config;
  switch (node.node_type) {
    case 'start':
      return (
        <NextNodeRow
          value={(cfg as { next_node_key?: string }).next_node_key ?? ''}
          allNodes={allNodes}
          currentKey={node.node_key}
          onChange={(v) => onUpdateConfig({ next_node_key: v })}
          label={FORM_COPY.advancesTo}
        />
      );

    case 'send_message':
      return (
        <>
          <TextRow
            label={FORM_COPY.textToCustomer}
            value={(cfg as { text?: string }).text ?? ''}
            onChange={(v) => onUpdateConfig({ text: v })}
            rows={3}
          />
          <NextNodeRow
            value={(cfg as { next_node_key?: string }).next_node_key ?? ''}
            allNodes={allNodes}
            currentKey={node.node_key}
            onChange={(v) => onUpdateConfig({ next_node_key: v })}
            label={FORM_COPY.advancesTo}
          />
        </>
      );

    case 'send_buttons':
      return (
        <SendButtonsForm
          cfg={cfg as SendButtonsCfg}
          allNodes={allNodes}
          currentKey={node.node_key}
          onUpdateConfig={onUpdateConfig}
          showAdvanced={showAdvanced}
        />
      );

    case 'send_list':
      return (
        <SendListForm
          cfg={cfg as SendListCfg}
          allNodes={allNodes}
          currentKey={node.node_key}
          onUpdateConfig={onUpdateConfig}
          showAdvanced={showAdvanced}
        />
      );

    case 'send_media':
      return (
        <SendMediaForm
          cfg={cfg as SendMediaCfg}
          allNodes={allNodes}
          currentKey={node.node_key}
          onUpdateConfig={onUpdateConfig}
        />
      );

    case 'collect_input':
      return (
        <>
          <TextRow
            label={FORM_COPY.promptToCustomer}
            value={(cfg as { prompt_text?: string }).prompt_text ?? ''}
            onChange={(v) => onUpdateConfig({ prompt_text: v })}
            rows={2}
          />
          <div>
            <label
              htmlFor={`collect-var-key-${node.node_key}`}
              className="mb-1 block text-xs text-muted-foreground"
            >
              {FORM_COPY.varKeyLabel}
            </label>
            <Input
              id={`collect-var-key-${node.node_key}`}
              value={(cfg as { var_key?: string }).var_key ?? ''}
              onChange={(e) =>
                onUpdateConfig({
                  var_key: e.target.value.replace(/[^a-zA-Z0-9_]/g, ''),
                })
              }
              placeholder={FORM_COPY.varKeyPlaceholder}
              className="bg-muted font-mono text-xs"
            />
            <p className="mt-1 text-[10px] text-muted-foreground">
              {FORM_COPY.varKeyHelp}{' '}
              <code className="rounded bg-muted px-1">
                {'{{vars.'}
                {(cfg as { var_key?: string }).var_key || 'name'}
                {'}}'}
              </code>
              .
            </p>
          </div>
          <NextNodeRow
            value={(cfg as { next_node_key?: string }).next_node_key ?? ''}
            allNodes={allNodes}
            currentKey={node.node_key}
            onChange={(v) => onUpdateConfig({ next_node_key: v })}
            label={FORM_COPY.advanceAfterCapture}
          />
        </>
      );

    case 'condition':
      return (
        <ConditionForm
          cfg={cfg as ConditionCfg}
          allNodes={allNodes}
          currentKey={node.node_key}
          onUpdateConfig={onUpdateConfig}
        />
      );

    case 'set_tag':
      return (
        <SetTagForm
          cfg={cfg as SetTagCfg}
          allNodes={allNodes}
          currentKey={node.node_key}
          onUpdateConfig={onUpdateConfig}
        />
      );

    case 'handoff':
      return (
        <TextRow
          label={FORM_COPY.internalNote}
          value={(cfg as { note?: string }).note ?? ''}
          onChange={(v) => onUpdateConfig({ note: v })}
          rows={2}
        />
      );

    case 'end':
      return (
        <p className="text-xs text-muted-foreground">{FORM_COPY.endNodeHelp}</p>
      );
  }
}

// ============================================================
// send_buttons
// ============================================================

interface SendButtonsCfg {
  text?: string;
  footer_text?: string;
  buttons?: Array<{ reply_id: string; title: string; next_node_key: string }>;
}

function SendButtonsForm({
  cfg,
  allNodes,
  currentKey,
  onUpdateConfig,
  showAdvanced,
}: {
  cfg: SendButtonsCfg;
  allNodes: BuilderNode[];
  currentKey: string;
  onUpdateConfig: (patch: Record<string, unknown>) => void;
  showAdvanced: boolean;
}) {
  const buttons = cfg.buttons ?? [];
  const updateButton = (
    idx: number,
    patch: Partial<NonNullable<SendButtonsCfg['buttons']>[number]>
  ) => {
    onUpdateConfig({
      buttons: buttons.map((b, i) => (i === idx ? { ...b, ...patch } : b)),
    });
  };
  const addButton = () =>
    onUpdateConfig({
      buttons: [
        ...buttons,
        {
          reply_id: `btn_${buttons.length + 1}`,
          title: FORM_COPY.defaultOptionTitle,
          next_node_key: '',
        },
      ],
    });
  const removeButton = (idx: number) =>
    onUpdateConfig({ buttons: buttons.filter((_, i) => i !== idx) });

  return (
    <>
      <TextRow
        label={FORM_COPY.bodyText}
        value={cfg.text ?? ''}
        onChange={(v) => onUpdateConfig({ text: v })}
        rows={3}
      />
      <TextRow
        label={FORM_COPY.footerText}
        value={cfg.footer_text ?? ''}
        onChange={(v) => onUpdateConfig({ footer_text: v })}
      />
      <div>
        <div className="mb-2 flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            {FORM_COPY.buttonsHelp}
          </p>
        </div>
        <div className="flex flex-col gap-3">
          {buttons.map((b, i) => (
            <div
              key={b.reply_id}
              className={cn(
                'grid grid-cols-1 gap-2 rounded-md border border-border bg-muted/40 p-3',
                showAdvanced
                  ? 'md:grid-cols-[1fr_2fr_2fr_auto]'
                  : 'md:grid-cols-[2fr_2fr_auto]'
              )}
            >
              {showAdvanced && (
                <Input
                  value={b.reply_id}
                  onChange={(e) =>
                    updateButton(i, {
                      reply_id: slugify(e.target.value, `btn_${i + 1}`),
                    })
                  }
                  placeholder="reply_id"
                  className="bg-muted font-mono text-xs"
                />
              )}
              <Input
                value={b.title}
                onChange={(e) => updateButton(i, { title: e.target.value })}
                placeholder={FORM_COPY.optionTitlePlaceholder}
                className="bg-muted"
                maxLength={20}
              />
              <NodeKeySelect
                value={b.next_node_key || null}
                nodes={allNodes}
                excludeKey={currentKey}
                onChange={(v) => updateButton(i, { next_node_key: v ?? '' })}
                placeholder={FORM_COPY.nextNodePlaceholder}
              />
              <Button
                variant="ghost"
                size="sm"
                onClick={() => removeButton(i)}
                className="text-red-400 hover:bg-red-500/10 hover:text-red-300"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </div>
        {buttons.length < 3 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={addButton}
            className="mt-2"
          >
            <Plus className="h-3.5 w-3.5" />
            {FORM_COPY.addButton}
          </Button>
        )}
      </div>
    </>
  );
}

// ============================================================
// send_list
// ============================================================

interface SendListCfg {
  text?: string;
  button_label?: string;
  footer_text?: string;
  sections?: Array<{
    title?: string;
    rows: Array<{
      reply_id: string;
      title: string;
      description?: string;
      next_node_key: string;
    }>;
  }>;
}

function SendListForm({
  cfg,
  allNodes,
  currentKey,
  onUpdateConfig,
  showAdvanced,
}: {
  cfg: SendListCfg;
  allNodes: BuilderNode[];
  currentKey: string;
  onUpdateConfig: (patch: Record<string, unknown>) => void;
  showAdvanced: boolean;
}) {
  const sections = cfg.sections ?? [];
  const totalRows = sections.reduce((sum, s) => sum + s.rows.length, 0);

  const updateSection = (
    sIdx: number,
    patch: Partial<NonNullable<SendListCfg['sections']>[number]>
  ) => {
    onUpdateConfig({
      sections: sections.map((s, i) => (i === sIdx ? { ...s, ...patch } : s)),
    });
  };
  const addSection = () =>
    onUpdateConfig({
      sections: [
        ...sections,
        {
          title: '',
          rows: [
            {
              reply_id: `row_${totalRows + 1}`,
              title: `Option ${totalRows + 1}`,
              next_node_key: '',
            },
          ],
        },
      ],
    });
  const removeSection = (sIdx: number) =>
    onUpdateConfig({ sections: sections.filter((_, i) => i !== sIdx) });
  const updateRow = (
    sIdx: number,
    rIdx: number,
    patch: Partial<NonNullable<SendListCfg['sections']>[number]['rows'][number]>
  ) => {
    onUpdateConfig({
      sections: sections.map((s, i) =>
        i === sIdx
          ? {
              ...s,
              rows: s.rows.map((r, j) => (j === rIdx ? { ...r, ...patch } : r)),
            }
          : s
      ),
    });
  };
  const addRow = (sIdx: number) =>
    onUpdateConfig({
      sections: sections.map((s, i) =>
        i === sIdx
          ? {
              ...s,
              rows: [
                ...s.rows,
                {
                  reply_id: `row_${totalRows + 1}`,
                  title: `Option ${totalRows + 1}`,
                  next_node_key: '',
                },
              ],
            }
          : s
      ),
    });
  const removeRow = (sIdx: number, rIdx: number) =>
    onUpdateConfig({
      sections: sections.map((s, i) =>
        i === sIdx ? { ...s, rows: s.rows.filter((_, j) => j !== rIdx) } : s
      ),
    });

  return (
    <>
      <TextRow
        label={FORM_COPY.bodyText}
        value={cfg.text ?? ''}
        onChange={(v) => onUpdateConfig({ text: v })}
        rows={3}
      />
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <TextRow
          label={FORM_COPY.buttonLabel}
          value={cfg.button_label ?? ''}
          onChange={(v) => onUpdateConfig({ button_label: v })}
        />
        <TextRow
          label={FORM_COPY.footerText}
          value={cfg.footer_text ?? ''}
          onChange={(v) => onUpdateConfig({ footer_text: v })}
        />
      </div>

      <div className="mt-2">
        <p className="mb-2 block text-xs text-muted-foreground">
          {FORM_COPY.rowsHelp}
        </p>
        {sections.map((section, sIdx) => (
          <div
            key={section.rows[0]?.reply_id ?? section.title}
            className="mb-3 rounded-md border border-border bg-muted/40 p-3"
          >
            <div className="mb-2 flex items-center gap-2">
              <Input
                value={section.title ?? ''}
                onChange={(e) => updateSection(sIdx, { title: e.target.value })}
                placeholder={`Título de la sección ${sIdx + 1} (opcional)`}
                className="bg-muted text-xs"
              />
              {sections.length > 1 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => removeSection(sIdx)}
                  className="shrink-0 text-red-400 hover:bg-red-500/10 hover:text-red-300"
                  aria-label={FORM_COPY.removeSection}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
            {section.rows.map((row, rIdx) => (
              <div
                key={row.reply_id}
                className={cn(
                  'mb-2 grid grid-cols-1 gap-2',
                  showAdvanced
                    ? 'md:grid-cols-[1fr_2fr_2fr_auto]'
                    : 'md:grid-cols-[2fr_2fr_auto]'
                )}
              >
                {showAdvanced && (
                  <Input
                    value={row.reply_id}
                    onChange={(e) =>
                      updateRow(sIdx, rIdx, {
                        reply_id: slugify(e.target.value, `row_${rIdx + 1}`),
                      })
                    }
                    placeholder="reply_id"
                    className="bg-muted font-mono text-xs"
                  />
                )}
                <Input
                  value={row.title}
                  onChange={(e) =>
                    updateRow(sIdx, rIdx, { title: e.target.value })
                  }
                  placeholder={FORM_COPY.rowTitlePlaceholder}
                  className="bg-muted"
                  maxLength={24}
                />
                <NodeKeySelect
                  value={row.next_node_key || null}
                  nodes={allNodes}
                  excludeKey={currentKey}
                  onChange={(v) =>
                    updateRow(sIdx, rIdx, { next_node_key: v ?? '' })
                  }
                  placeholder={FORM_COPY.nextNodePlaceholder}
                />
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => removeRow(sIdx, rIdx)}
                  className="text-red-400 hover:bg-red-500/10 hover:text-red-300"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
            {totalRows < 10 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => addRow(sIdx)}
                className="mt-1"
              >
                <Plus className="h-3.5 w-3.5" />
                {FORM_COPY.addRow}
              </Button>
            )}
          </div>
        ))}
        {/* WhatsApp's interactive-list spec caps sections at 10. Group rows
            by category (Billing / Support / Sales etc.) to give customers a
            scannable menu. */}
        {sections.length < 10 && (
          <Button variant="outline" size="sm" onClick={addSection}>
            <Plus className="h-3.5 w-3.5" />
            {FORM_COPY.addSection}
          </Button>
        )}
      </div>
    </>
  );
}

// ============================================================
// condition
// ============================================================

interface ConditionCfg {
  subject?: 'var' | 'tag' | 'contact_field';
  subject_key?: string;
  operator?: 'equals' | 'contains' | 'present' | 'absent';
  value?: string;
  true_next?: string;
  false_next?: string;
}

interface UserTag {
  id: string;
  name: string;
  color?: string;
}

function ConditionForm({
  cfg,
  allNodes,
  currentKey,
  onUpdateConfig,
}: {
  cfg: ConditionCfg;
  allNodes: BuilderNode[];
  currentKey: string;
  onUpdateConfig: (patch: Record<string, unknown>) => void;
}) {
  const tags = useUserTags();

  const subject = cfg.subject ?? 'var';
  const operator = cfg.operator ?? 'equals';
  const showValue = operator === 'equals' || operator === 'contains';

  return (
    <>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <div>
          <label
            htmlFor={`condition-subject-${currentKey}`}
            className="mb-1 block text-xs text-muted-foreground"
          >
            {FORM_COPY.ifLabel}
          </label>
          <Select
            value={subject}
            onValueChange={(v) =>
              onUpdateConfig({ subject: v as ConditionCfg['subject'] })
            }
          >
            <SelectTrigger
              id={`condition-subject-${currentKey}`}
              className="bg-muted"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="var">{FORM_COPY.capturedVariable}</SelectItem>
              <SelectItem value="tag">{FORM_COPY.contactHasTag}</SelectItem>
              <SelectItem value="contact_field">
                {FORM_COPY.contactField}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="md:col-span-2">
          <label
            htmlFor={`condition-subject-key-${currentKey}`}
            className="mb-1 block text-xs text-muted-foreground"
          >
            {subject === 'var'
              ? FORM_COPY.varName
              : subject === 'tag'
                ? FORM_COPY.tagLabel
                : FORM_COPY.fieldLabel}
          </label>
          {subject === 'tag' && tags.length > 0 ? (
            <Select
              value={cfg.subject_key ?? ''}
              onValueChange={(v) => onUpdateConfig({ subject_key: v })}
            >
              <SelectTrigger
                id={`condition-subject-key-${currentKey}`}
                className="bg-muted"
              >
                <SelectValue placeholder={FORM_COPY.pickTag} />
              </SelectTrigger>
              <SelectContent>
                {tags.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : subject === 'contact_field' ? (
            <Select
              value={cfg.subject_key ?? ''}
              onValueChange={(v) => onUpdateConfig({ subject_key: v })}
            >
              <SelectTrigger
                id={`condition-subject-key-${currentKey}`}
                className="bg-muted"
              >
                <SelectValue placeholder={FORM_COPY.pickField} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="name">name</SelectItem>
                <SelectItem value="email">email</SelectItem>
                <SelectItem value="phone">phone</SelectItem>
                <SelectItem value="company">company</SelectItem>
              </SelectContent>
            </Select>
          ) : (
            <Input
              id={`condition-subject-key-${currentKey}`}
              value={cfg.subject_key ?? ''}
              onChange={(e) => onUpdateConfig({ subject_key: e.target.value })}
              placeholder={
                subject === 'var'
                  ? FORM_COPY.varKeyPlaceholder
                  : FORM_COPY.tagUuidPlaceholder
              }
              className="bg-muted font-mono text-xs"
            />
          )}
        </div>
      </div>

      <div
        className={cn(
          'grid grid-cols-1 gap-3',
          showValue ? 'md:grid-cols-2' : ''
        )}
      >
        <div>
          <label
            htmlFor={`condition-operator-${currentKey}`}
            className="mb-1 block text-xs text-muted-foreground"
          >
            {FORM_COPY.operatorLabel}
          </label>
          <Select
            value={operator}
            onValueChange={(v) =>
              onUpdateConfig({ operator: v as ConditionCfg['operator'] })
            }
          >
            <SelectTrigger
              id={`condition-operator-${currentKey}`}
              className="bg-muted"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="present">{FORM_COPY.isPresent}</SelectItem>
              <SelectItem value="absent">{FORM_COPY.isAbsent}</SelectItem>
              <SelectItem value="equals">{FORM_COPY.equals}</SelectItem>
              <SelectItem value="contains">{FORM_COPY.contains}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {showValue && (
          <div>
            <label
              htmlFor={`condition-value-${currentKey}`}
              className="mb-1 block text-xs text-muted-foreground"
            >
              {FORM_COPY.valueLabel}
            </label>
            <Input
              id={`condition-value-${currentKey}`}
              value={cfg.value ?? ''}
              onChange={(e) => onUpdateConfig({ value: e.target.value })}
              className="bg-muted"
            />
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <NextNodeRow
          value={cfg.true_next ?? ''}
          allNodes={allNodes}
          currentKey={currentKey}
          onChange={(v) => onUpdateConfig({ true_next: v })}
          label={FORM_COPY.ifTrueAdvance}
        />
        <NextNodeRow
          value={cfg.false_next ?? ''}
          allNodes={allNodes}
          currentKey={currentKey}
          onChange={(v) => onUpdateConfig({ false_next: v })}
          label={FORM_COPY.ifFalseAdvance}
        />
      </div>
    </>
  );
}

// ============================================================
// set_tag
// ============================================================

interface SetTagCfg {
  mode?: 'add' | 'remove';
  tag_id?: string;
  next_node_key?: string;
}

function SetTagForm({
  cfg,
  allNodes,
  currentKey,
  onUpdateConfig,
}: {
  cfg: SetTagCfg;
  allNodes: BuilderNode[];
  currentKey: string;
  onUpdateConfig: (patch: Record<string, unknown>) => void;
}) {
  const tags = useUserTags();

  return (
    <>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div>
          <label
            htmlFor={`set-tag-action-${currentKey}`}
            className="mb-1 block text-xs text-muted-foreground"
          >
            {FORM_COPY.actionLabel}
          </label>
          <Select
            value={cfg.mode ?? 'add'}
            onValueChange={(v) =>
              onUpdateConfig({ mode: v as SetTagCfg['mode'] })
            }
          >
            <SelectTrigger
              id={`set-tag-action-${currentKey}`}
              className="bg-muted"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="add">{FORM_COPY.addTag}</SelectItem>
              <SelectItem value="remove">{FORM_COPY.removeTag}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <label
            htmlFor={`set-tag-value-${currentKey}`}
            className="mb-1 block text-xs text-muted-foreground"
          >
            {FORM_COPY.tagLabel}
          </label>
          {tags.length > 0 ? (
            <Select
              value={cfg.tag_id ?? ''}
              onValueChange={(v) => onUpdateConfig({ tag_id: v })}
            >
              <SelectTrigger
                id={`set-tag-value-${currentKey}`}
                className="bg-muted"
              >
                <SelectValue placeholder={FORM_COPY.pickTag} />
              </SelectTrigger>
              <SelectContent>
                {tags.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <Input
              id={`set-tag-value-${currentKey}`}
              value={cfg.tag_id ?? ''}
              onChange={(e) => onUpdateConfig({ tag_id: e.target.value })}
              placeholder={FORM_COPY.tagUuidPlaceholder}
              className="bg-muted font-mono text-xs"
            />
          )}
        </div>
      </div>
      <NextNodeRow
        value={cfg.next_node_key ?? ''}
        allNodes={allNodes}
        currentKey={currentKey}
        onChange={(v) => onUpdateConfig({ next_node_key: v })}
        label={FORM_COPY.thenAdvanceTo}
      />
    </>
  );
}

/**
 * Shared loader for both `condition` (subject=tag) and `set_tag`.
 * Falls back to raw UUID input if the endpoint is absent on older
 * deployments — the form remains authorable in that case.
 */
function useUserTags(): UserTag[] {
  const [tags, setTags] = useState<UserTag[]>([]);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/tags').catch(() => null);
        if (!res?.ok) return;
        const json = (await res.json()) as { tags?: UserTag[] };
        if (!cancelled) setTags(json.tags ?? []);
      } catch {
        // Tags endpoint absent — caller falls back to raw input.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  return tags;
}

// ============================================================
// send_media
// ============================================================

interface SendMediaCfg {
  media_type?: 'image' | 'video' | 'document';
  media_url?: string;
  caption?: string;
  filename?: string;
  next_node_key?: string;
}

// Mirrors the bucket's allowed_mime_types from migration 016. Kept in
// sync with the storage policy so the picker rejects unsupported files
// before they hit the network rather than failing with a confusing
// storage-policy / mime-type error.
const MEDIA_ACCEPT: Record<NonNullable<SendMediaCfg['media_type']>, string> = {
  image: 'image/png,image/jpeg,image/webp',
  video: 'video/mp4,video/3gpp',
  document:
    'application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation,text/plain',
};

const FLOW_MEDIA_BUCKET = 'flow-media';

function SendMediaForm({
  cfg,
  allNodes,
  currentKey,
  onUpdateConfig,
}: {
  cfg: SendMediaCfg;
  allNodes: BuilderNode[];
  currentKey: string;
  onUpdateConfig: (patch: Record<string, unknown>) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const mediaType = cfg.media_type ?? 'image';
  const isDocument = mediaType === 'document';
  const displayName =
    cfg.filename ||
    (cfg.media_url ? (cfg.media_url.split('/').pop() ?? '') : '');

  const handleFile = useCallback(
    async (file: File) => {
      if (file.size > MEDIA_MAX_BYTES) {
        toast.error(
          `El archivo pesa ${(file.size / 1024 / 1024).toFixed(1)} MB; el límite es 16 MB.`
        );
        return;
      }
      setUploading(true);
      try {
        // Server-side account-scoped Imgora upload; credentials and the
        // signed asset reference never need to be interpreted here.
        const { publicUrl } = await uploadAccountMedia(FLOW_MEDIA_BUCKET, file);
        // Patch all fields in one call so the form doesn't re-render
        // with a half-uploaded state.
        onUpdateConfig({
          media_url: publicUrl,
          filename: file.name,
        });
        toast.success(FORM_COPY.fileUploaded);
      } catch (err) {
        const msg = err instanceof Error ? err.message : FORM_COPY.uploadFailed;
        toast.error(msg);
      } finally {
        setUploading(false);
      }
    },
    [onUpdateConfig]
  );

  const handleClear = () => {
    onUpdateConfig({ media_url: '', filename: '' });
  };

  return (
    <>
      <div>
        <label
          htmlFor={`send-media-type-${currentKey}`}
          className="mb-1 block text-xs text-muted-foreground"
        >
          {FORM_COPY.mediaTypeLabel}
        </label>
        <Select
          value={mediaType}
          onValueChange={(v) => {
            // Changing type clears the existing file — the bucket
            // accepts different MIME sets per type and a previously
            // uploaded PDF can't be sent as an image.
            onUpdateConfig({
              media_type: v as NonNullable<SendMediaCfg['media_type']>,
              media_url: '',
              filename: '',
            });
          }}
        >
          <SelectTrigger
            id={`send-media-type-${currentKey}`}
            className="bg-muted"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="image">{FORM_COPY.imageLabel}</SelectItem>
            <SelectItem value="video">{FORM_COPY.videoLabel}</SelectItem>
            <SelectItem value="document">{FORM_COPY.documentLabel}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <fieldset>
        <legend className="mb-1 block text-xs text-muted-foreground">
          {FORM_COPY.fileLabel}
        </legend>
        {cfg.media_url ? (
          <div className="flex items-center gap-2 rounded-md border border-border bg-muted px-3 py-2 text-xs">
            <Paperclip className="h-3.5 w-3.5 shrink-0 text-cyan-400" />
            <a
              href={cfg.media_url}
              target="_blank"
              rel="noopener noreferrer"
              className="min-w-0 flex-1 truncate text-foreground hover:text-cyan-300"
              title={displayName || cfg.media_url}
            >
              {displayName || cfg.media_url}
            </a>
            <button
              type="button"
              onClick={handleClear}
              className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label={FORM_COPY.removeFile}
              disabled={uploading}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="flex w-full items-center justify-center gap-2 rounded-md border border-dashed border-border bg-card px-3 py-4 text-xs text-muted-foreground transition-colors hover:border-border hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60"
          >
            {uploading ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                {FORM_COPY.uploading}
              </>
            ) : (
              <>
                <Upload className="h-3.5 w-3.5" />
                {FORM_COPY.clickToUpload}
              </>
            )}
          </button>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept={MEDIA_ACCEPT[mediaType]}
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void handleFile(f);
            // Reset so picking the same file twice still fires onChange.
            e.target.value = '';
          }}
        />
      </fieldset>

      <TextRow
        label={FORM_COPY.captionLabel}
        value={cfg.caption ?? ''}
        onChange={(v) => onUpdateConfig({ caption: v })}
        rows={2}
      />

      {isDocument && (
        <div>
          <label
            htmlFor={`send-media-filename-${currentKey}`}
            className="mb-1 block text-xs text-muted-foreground"
          >
            {FORM_COPY.filenameLabel}
          </label>
          <Input
            id={`send-media-filename-${currentKey}`}
            value={cfg.filename ?? ''}
            onChange={(e) => onUpdateConfig({ filename: e.target.value })}
            placeholder={FORM_COPY.filenamePlaceholder}
            className="bg-muted text-xs"
          />
        </div>
      )}

      <NextNodeRow
        value={cfg.next_node_key ?? ''}
        allNodes={allNodes}
        currentKey={currentKey}
        onChange={(v) => onUpdateConfig({ next_node_key: v })}
        label={FORM_COPY.advanceAfterSending}
      />
    </>
  );
}
