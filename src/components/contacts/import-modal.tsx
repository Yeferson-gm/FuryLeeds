'use client';

import {
  AlertTriangle,
  CheckCircle,
  FileText,
  Loader2,
  Tag,
  Upload,
  XCircle,
} from 'lucide-react';

import { useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { fetchTags as fetchTagsApi, importContacts } from '@/lib/contacts/api';
import {
  type ParsedContactRow,
  parseContactCsv,
} from '@/lib/contacts/parse-contact-csv';
import { toast } from '@/lib/notifications';

import { cn } from '@/lib/utils';

const DEFAULT_TAG_COLOR = '#3b82f6';
const PREVIEW_LIMIT = 5;

function truncateFilename(name: string, max = 48): string {
  if (name.length <= max) return name;
  const ext = name.includes('.') ? name.slice(name.lastIndexOf('.')) : '';
  const base = name.slice(0, name.length - ext.length);
  const keep = max - ext.length - 1;
  return `${base.slice(0, Math.max(keep, 12))}…${ext}`;
}

function CsvColumn({ children }: { children: React.ReactNode }) {
  return (
    <code className="rounded bg-muted px-1 py-0.5 text-[11px] text-muted-foreground">
      {children}
    </code>
  );
}

function PreviewCell({
  value,
  mono,
  maxWidth = 'max-w-[9rem]',
}: {
  value: string;
  mono?: boolean;
  maxWidth?: string;
}) {
  return (
    <span
      className={cn(
        'block truncate',
        maxWidth,
        mono && 'font-mono text-[11px]'
      )}
      title={value}
    >
      {value}
    </span>
  );
}

function ImportPreviewTags({
  tagNames,
  tagColorByKey,
}: {
  tagNames: string[];
  tagColorByKey: Map<string, string>;
}) {
  if (tagNames.length === 0) {
    return <span className="text-muted-foreground">—</span>;
  }

  return (
    <div className="flex min-w-18 flex-wrap gap-1">
      {tagNames.map((name) => {
        const color =
          tagColorByKey.get(name.trim().toLowerCase()) ?? DEFAULT_TAG_COLOR;
        const isKnown = tagColorByKey.has(name.trim().toLowerCase());
        return (
          <span
            key={name}
            className="inline-flex max-w-full items-center gap-1 rounded-full px-2 py-0.5 text-[10px] leading-none font-medium"
            style={{
              backgroundColor: `${color}18`,
              color,
              border: `1px solid ${color}${isKnown ? '55' : '30'}`,
            }}
            title={isKnown ? name : `${name} (se creará al importar)`}
          >
            <span
              className="size-1.5 shrink-0 rounded-full"
              style={{ backgroundColor: color }}
            />
            <span className="truncate">{name}</span>
          </span>
        );
      })}
    </div>
  );
}

interface ImportModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImported: () => void;
}

export function ImportModal({
  open,
  onOpenChange,
  onImported,
}: ImportModalProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [parsedRows, setParsedRows] = useState<ParsedContactRow[]>([]);
  const [hasTagsColumn, setHasTagsColumn] = useState(false);
  const [hasCompanyColumn, setHasCompanyColumn] = useState(false);
  const [tagColorByKey, setTagColorByKey] = useState<Map<string, string>>(
    new Map()
  );
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{
    imported: number;
    skipped: number;
    invalidPhone: number;
    failed: number;
    failedDetails: { phone: string; name?: string; reason: string }[];
    tagsAssigned: number;
  } | null>(null);

  function reset() {
    setFile(null);
    setParsedRows([]);
    setHasTagsColumn(false);
    setHasCompanyColumn(false);
    setTagColorByKey(new Map());
    setResult(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  function handleOpenChange(next: boolean) {
    if (!next) reset();
    onOpenChange(next);
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = e.target.files?.[0];
    if (!selected) return;

    setFile(selected);
    setResult(null);

    const text = await selected.text();
    const {
      rows,
      hasTagsColumn: csvHasTags,
      hasCompanyColumn: csvHasCompany,
    } = parseContactCsv(text);

    if (rows.length === 0) {
      toast.error(
        'No se encontraron filas válidas. Asegúrate de que el CSV tenga un encabezado de columna "phone".'
      );
      setParsedRows([]);
      setHasTagsColumn(false);
      setHasCompanyColumn(false);
      setTagColorByKey(new Map());
      return;
    }

    setParsedRows(rows);
    setHasTagsColumn(csvHasTags);
    setHasCompanyColumn(csvHasCompany);

    if (csvHasTags) {
      try {
        const { tags } = await fetchTagsApi();
        const colors = new Map<string, string>();
        for (const tag of tags) {
          const key = tag.name.trim().toLowerCase();
          if (!colors.has(key)) colors.set(key, tag.color);
        }
        setTagColorByKey(colors);
      } catch {
        setTagColorByKey(new Map());
      }
    } else {
      setTagColorByKey(new Map());
    }
  }

  async function handleImport() {
    if (parsedRows.length === 0) return;
    setImporting(true);

    try {
      const {
        imported,
        skipped,
        invalidPhone,
        failed,
        failedDetails,
        tagsAssigned,
        skippedTagNames,
      } = await importContacts(parsedRows);

      setResult({
        imported,
        skipped,
        invalidPhone,
        failed,
        failedDetails,
        tagsAssigned,
      });
      if (imported > 0) {
        toast.success(
          `${imported} ${
            imported === 1 ? 'contacto importado' : 'contactos importados'
          }`
        );
        onImported();
      }
      if (tagsAssigned > 0) {
        toast.success(
          `${tagsAssigned} ${
            tagsAssigned === 1
              ? 'asignación de etiqueta aplicada'
              : 'asignaciones de etiqueta aplicadas'
          }`
        );
      }
      if (skippedTagNames.length > 0) {
        const sample = skippedTagNames.slice(0, 3).join(', ');
        const more =
          skippedTagNames.length > 3
            ? ` (+${skippedTagNames.length - 3} more)`
            : '';
        toast.info(
          `Etiquetas desconocidas omitidas (créalas primero en Configuración): ${sample}${more}`
        );
      }
      if (skipped > 0) {
        toast.info(
          `${skipped} ${
            skipped === 1 ? 'duplicado omitido' : 'duplicados omitidos'
          }`
        );
      }
      if (invalidPhone > 0) {
        toast.warning(
          `${invalidPhone} ${
            invalidPhone === 1
              ? 'contacto no tenía un número de teléfono utilizable'
              : 'contactos no tenían un número de teléfono utilizable'
          }`
        );
      }
      if (failed > 0) {
        toast.error(
          `${failed} ${
            failed === 1
              ? 'contacto no se pudo importar'
              : 'contactos no se pudieron importar'
          }`
        );
      }
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Error en la importación';
      toast.error(message);
    } finally {
      setImporting(false);
    }
  }

  const preview = parsedRows.slice(0, PREVIEW_LIMIT);
  // Tags: OR — show when the CSV declares a column or preview rows carry
  // values, so an all-empty tags column still renders for validation.
  const previewHasTags =
    hasTagsColumn || preview.some((row) => row.tagNames.length > 0);
  // Company: AND — hide unless the CSV declares it and preview has data,
  // avoiding an all-dash column that wastes horizontal space.
  const previewHasCompany =
    hasCompanyColumn && preview.some((row) => row.company?.trim());

  const tagStats = useMemo(() => {
    const names = new Set<string>();
    let rowsWithTags = 0;
    for (const row of parsedRows) {
      if (row.tagNames.length === 0) continue;
      rowsWithTags++;
      for (const name of row.tagNames) names.add(name.trim().toLowerCase());
    }
    return { unique: names.size, rowsWithTags };
  }, [parsedRows]);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="flex max-h-[min(90vh,720px)] flex-col gap-0 overflow-hidden border-border/80 bg-popover p-0 text-popover-foreground sm:max-w-2xl">
        <div className="shrink-0 space-y-4 border-b border-border/80 px-6 pt-6 pb-5">
          <DialogHeader className="gap-1.5">
            <DialogTitle className="text-lg text-popover-foreground">
              Importar contactos
            </DialogTitle>
            <DialogDescription className="leading-relaxed text-muted-foreground">
              Sube un CSV con una columna <CsvColumn>phone</CsvColumn>{' '}
              obligatoria. Opcionales: <CsvColumn>name</CsvColumn>,{' '}
              <CsvColumn>email</CsvColumn>, <CsvColumn>company</CsvColumn>,{' '}
              <CsvColumn>tags</CsvColumn> (separadas por comas; pon entre
              comillas las celdas con varias etiquetas).
            </DialogDescription>
          </DialogHeader>

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className={cn(
              'group flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed p-5 transition-all',
              file
                ? 'border-primary/35 bg-primary/4'
                : 'hover:border-primary/40 border-border/80 bg-background/40 hover:bg-background/70'
            )}
          >
            {file ? (
              <>
                <div className="bg-primary/15 ring-primary/25 flex size-10 items-center justify-center rounded-lg ring-1">
                  <FileText className="text-primary size-5" />
                </div>
                <p
                  className="max-w-full truncate px-2 text-sm font-medium text-popover-foreground"
                  title={file.name}
                >
                  {truncateFilename(file.name)}
                </p>
                <span className="rounded-full bg-muted px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground">
                  {`${parsedRows.length} ${
                    parsedRows.length === 1 ? 'fila lista' : 'filas listas'
                  }`}
                </span>
              </>
            ) : (
              <>
                <div className="flex size-10 items-center justify-center rounded-lg bg-muted/80 ring-1 ring-border/80 transition-colors group-hover:bg-muted">
                  <Upload className="size-5 text-muted-foreground group-hover:text-foreground" />
                </div>
                <p className="text-sm text-muted-foreground">
                  Haz clic para elegir un archivo CSV
                </p>
                <p className="text-[11px] text-muted-foreground">
                  .csv hasta el límite de tu navegador
                </p>
              </>
            )}
          </button>

          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            onChange={handleFileChange}
            className="hidden"
          />
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
          {preview.length > 0 && !result && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-[11px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
                  {`Vista previa · primeras ${preview.length}`}
                </p>
                <div className="flex flex-wrap items-center gap-1.5">
                  {tagStats.rowsWithTags > 0 && (
                    <span className="inline-flex items-center gap-1 rounded-md bg-muted/90 px-2 py-0.5 text-[11px] text-muted-foreground">
                      <Tag className="text-primary/80 size-3" />
                      {`${tagStats.unique} ${
                        tagStats.unique === 1 ? 'etiqueta' : 'etiquetas'
                      } · ${tagStats.rowsWithTags} ${
                        tagStats.rowsWithTags === 1 ? 'contacto' : 'contactos'
                      }`}
                    </span>
                  )}
                </div>
              </div>

              <div className="overflow-hidden rounded-xl border border-border ring-1 ring-border/50">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-lg text-xs">
                    <thead>
                      <tr className="border-b border-border bg-background/60">
                        <th className="px-3 py-2 text-left font-medium whitespace-nowrap text-muted-foreground">
                          Teléfono
                        </th>
                        <th className="px-3 py-2 text-left font-medium whitespace-nowrap text-muted-foreground">
                          Nombre
                        </th>
                        <th className="px-3 py-2 text-left font-medium whitespace-nowrap text-muted-foreground">
                          Correo
                        </th>
                        {previewHasCompany && (
                          <th className="px-3 py-2 text-left font-medium whitespace-nowrap text-muted-foreground">
                            Empresa
                          </th>
                        )}
                        {previewHasTags && (
                          <th className="px-3 py-2 text-left font-medium whitespace-nowrap text-muted-foreground">
                            Etiquetas
                          </th>
                        )}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/70">
                      {preview.map((row) => (
                        <tr
                          key={`${row.phone}:${row.email}:${row.name}:${row.company}`}
                          className="bg-popover/40 transition-colors hover:bg-muted/30"
                        >
                          <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">
                            <PreviewCell
                              value={row.phone}
                              mono
                              maxWidth="max-w-[7.5rem]"
                            />
                          </td>
                          <td className="px-3 py-2 text-popover-foreground">
                            <PreviewCell
                              value={row.name || '—'}
                              maxWidth="max-w-[8.5rem]"
                            />
                          </td>
                          <td className="px-3 py-2 text-muted-foreground">
                            <PreviewCell
                              value={row.email || '—'}
                              maxWidth="max-w-[10rem]"
                            />
                          </td>
                          {previewHasCompany && (
                            <td className="px-3 py-2 text-muted-foreground">
                              <PreviewCell
                                value={row.company || '—'}
                                maxWidth="max-w-[7rem]"
                              />
                            </td>
                          )}
                          {previewHasTags && (
                            <td className="px-3 py-2 align-top">
                              <ImportPreviewTags
                                tagNames={row.tagNames}
                                tagColorByKey={tagColorByKey}
                              />
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {parsedRows.length > PREVIEW_LIMIT && (
                <p className="text-center text-[11px] text-muted-foreground">
                  {`+ ${parsedRows.length - PREVIEW_LIMIT} ${
                    parsedRows.length - PREVIEW_LIMIT === 1
                      ? 'fila más no mostrada'
                      : 'filas más no mostradas'
                  }`}
                </p>
              )}
            </div>
          )}

          {result && (
            <div className="rounded-xl border border-border bg-background/50 p-4">
              <p className="text-sm font-medium text-popover-foreground">
                Importación completada
              </p>
              <div className="mt-3 flex flex-wrap gap-3">
                {result.imported > 0 && (
                  <div className="text-primary flex items-center gap-1.5 text-sm">
                    <CheckCircle className="size-4 shrink-0" />
                    {`${result.imported} importados`}
                  </div>
                )}
                {result.tagsAssigned > 0 && (
                  <div className="flex items-center gap-1.5 text-sm text-cyan-400">
                    <CheckCircle className="size-4 shrink-0" />
                    {`${result.tagsAssigned} ${
                      result.tagsAssigned === 1
                        ? 'etiqueta asignada'
                        : 'etiquetas asignadas'
                    }`}
                  </div>
                )}
                {result.skipped > 0 && (
                  <div className="flex items-center gap-1.5 text-sm text-amber-400">
                    <AlertTriangle className="size-4 shrink-0" />
                    {`${result.skipped} omitidos`}
                  </div>
                )}
                {result.invalidPhone > 0 && (
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-1.5 text-sm text-amber-400">
                      <AlertTriangle className="size-4 shrink-0" />
                      {`${result.invalidPhone} ${
                        result.invalidPhone === 1
                          ? 'teléfono no válido'
                          : 'teléfonos no válidos'
                      }`}
                    </div>
                    <p className="pl-5.5 text-xs text-muted-foreground">
                      Los números de teléfono deben empezar con + y el código de
                      país (p. ej. +5215512345678). Los números sin código se
                      entregarían en el país equivocado.
                    </p>
                  </div>
                )}
                {result.failed > 0 && (
                  <div className="flex items-center gap-1.5 text-sm text-red-400">
                    <XCircle className="size-4 shrink-0" />
                    {`${result.failed} con error`}
                  </div>
                )}
              </div>

              {result.failedDetails.length > 0 && (
                <div className="mt-3 space-y-1 border-t border-border/80 pt-3">
                  <p className="text-[11px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
                    Filas con error
                  </p>
                  <ul className="max-h-32 space-y-1 overflow-y-auto text-xs">
                    {result.failedDetails.map((row) => (
                      <li
                        key={`${row.phone}:${row.reason}`}
                        className="flex items-baseline gap-2 text-muted-foreground"
                      >
                        <span className="shrink-0 font-mono text-popover-foreground">
                          {row.name ? `${row.name} (${row.phone})` : row.phone}
                        </span>
                        <span className="truncate">{row.reason}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="mt-0 shrink-0 gap-2 border-t border-border/80 bg-background/50 px-6 py-4 sm:justify-end">
          <Button
            type="button"
            variant="outline"
            onClick={() => handleOpenChange(false)}
            className="border-border text-muted-foreground hover:bg-muted"
          >
            {result ? 'Cerrar' : 'Cancelar'}
          </Button>
          {!result && (
            <Button
              type="button"
              disabled={parsedRows.length === 0 || importing}
              onClick={handleImport}
              className="bg-primary hover:bg-primary/90 text-primary-foreground"
            >
              {importing && <Loader2 className="size-4 animate-spin" />}
              {`Importar ${parsedRows.length} ${
                parsedRows.length === 1 ? 'contacto' : 'contactos'
              }`}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
