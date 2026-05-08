"use client";

import { useState, useRef, useCallback } from "react";
import * as XLSX from "xlsx";
import {
  Upload, FileSpreadsheet, AlertTriangle, CheckCircle2,
  Loader2, X, Info,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { previewImport, confirmImport } from "@/app/actions/import";
import { toast } from "@/hooks/use-toast";
import type { RawImportRow, PreviewResult } from "@/app/actions/import";
// parseImportDate / parseImportAmount no se usan en el cliente (el parsing lo hace xlsx)

// ─── Normalización de columnas ────────────────────────────────────────────────

const COLUMN_ALIASES: Record<string, keyof RawImportRow> = {
  fecha: "fecha", date: "fecha",
  cuenta: "cuenta", account: "cuenta", cta: "cuenta",
  categoría: "categoria", categoria: "categoria", category: "categoria", cat: "categoria",
  etiqueta: "etiqueta", etiquetas: "etiqueta", tag: "etiqueta", tags: "etiqueta",
  monto: "monto", valor: "monto", amount: "monto", importe: "monto",
  tipo: "tipo", type: "tipo",
  nota: "notas", notas: "notas", comentario: "notas", comentarios: "notas",
  observacion: "notas", observaciones: "notas", comments: "notas",
  notes: "notas", descripcion: "notas", descripción: "notas",
};

function normalizeHeader(h: string): keyof RawImportRow | null {
  const key = h.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  return COLUMN_ALIASES[key] ?? null;
}

function parseSheetRows(sheet: XLSX.WorkSheet): RawImportRow[] {
  const raw: Record<string, unknown>[] = XLSX.utils.sheet_to_json(sheet, {
    raw: true,
    defval: "",
  });

  if (!raw.length) return [];

  // Mapear encabezados de la primera fila a campos normalizados
  const firstRow = raw[0];
  const headerMap: Record<string, keyof RawImportRow> = {};
  for (const key of Object.keys(firstRow)) {
    const mapped = normalizeHeader(key);
    if (mapped) headerMap[key] = mapped;
  }

  return raw.map((row) => {
    const out: Partial<RawImportRow> = {
      fecha: "", cuenta: "", categoria: "", etiqueta: "",
      monto: "", tipo: "", notas: "",
    };
    for (const [origKey, field] of Object.entries(headerMap)) {
      (out as any)[field] = row[origKey] ?? "";
    }
    return out as RawImportRow;
  });
}

// ─── Tipos de estado ──────────────────────────────────────────────────────────

type Step = "idle" | "parsing" | "previewing" | "importing" | "done";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

// ─── Componente principal ─────────────────────────────────────────────────────

export function ImportTransactionsDialog({ open, onOpenChange, onSuccess }: Props) {
  const fileRef      = useRef<HTMLInputElement>(null);
  const [step, setStep]           = useState<Step>("idle");
  const [fileName, setFileName]   = useState("");
  const [rows, setRows]           = useState<RawImportRow[]>([]);
  const [preview, setPreview]     = useState<PreviewResult | null>(null);
  const [progress, setProgress]   = useState(0);

  const reset = () => {
    setStep("idle");
    setFileName("");
    setRows([]);
    setPreview(null);
    setProgress(0);
    if (fileRef.current) fileRef.current.value = "";
  };

  const handleClose = () => {
    reset();
    onOpenChange(false);
  };

  // ── Paso 1: leer y parsear archivo ──────────────────────────────────────────
  const handleFile = useCallback(async (file: File) => {
    if (!file) return;
    setFileName(file.name);
    setStep("parsing");
    setProgress(10);

    try {
      const buffer = await file.arrayBuffer();
      setProgress(30);

      const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      const parsed = parseSheetRows(sheet);
      setProgress(60);

      if (!parsed.length) {
        throw new Error("El archivo no contiene filas de datos.");
      }

      setRows(parsed);

      // ── Paso 2: validación contra la BD ────────────────────────────────────
      const result = await previewImport(parsed);
      setProgress(100);
      setPreview(result);
      setStep("previewing");
    } catch (err: any) {
      toast({ variant: "destructive", title: "Error al procesar archivo", description: err.message });
      reset();
    }
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  };

  // ── Paso 3: confirmar e importar ────────────────────────────────────────────
  const handleConfirm = async () => {
    if (!rows.length) return;
    setStep("importing");
    setProgress(0);

    const progressInterval = setInterval(() => {
      setProgress((p) => Math.min(p + 3, 90));
    }, 200);

    try {
      const result = await confirmImport(rows);
      clearInterval(progressInterval);
      setProgress(100);
      setStep("done");
      toast({ title: `✓ ${result.imported} transacciones importadas correctamente` });
      onSuccess();
    } catch (err: any) {
      clearInterval(progressInterval);
      toast({ variant: "destructive", title: "Error durante la importación", description: err.message });
      setStep("previewing");
      setProgress(0);
    }
  };

  // ─── Render ─────────────────────────────────────────────────────────────────
  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5 text-primary" />
            Importar Transacciones
          </DialogTitle>
          <DialogDescription>
            Subí un archivo CSV o Excel (.xlsx) con las columnas: Fecha, Cuenta, Tipo, Monto, Categoría, Etiqueta, Nota.
          </DialogDescription>
        </DialogHeader>

        {/* ── PASO: idle ─────────────────────────────────────────────────────── */}
        {step === "idle" && (
          <div
            className="border-2 border-dashed rounded-xl p-10 flex flex-col items-center gap-4 text-center cursor-pointer hover:border-primary hover:bg-primary/5 transition-colors"
            onClick={() => fileRef.current?.click()}
            onDrop={handleDrop}
            onDragOver={(e) => e.preventDefault()}
          >
            <Upload className="h-10 w-10 text-muted-foreground" />
            <div>
              <p className="font-medium">Arrastrá un archivo o hacé click para seleccionar</p>
              <p className="text-sm text-muted-foreground mt-1">CSV o Excel (.xlsx, .xls)</p>
            </div>
            <Input
              ref={fileRef}
              type="file"
              accept=".csv,.xlsx,.xls"
              className="hidden"
              onChange={handleFileChange}
            />
            <Button variant="outline" size="sm" type="button">
              Seleccionar archivo
            </Button>
          </div>
        )}

        {/* ── PASO: parsing ─────────────────────────────────────────────────── */}
        {step === "parsing" && (
          <div className="space-y-4 py-6">
            <div className="flex items-center gap-3">
              <Loader2 className="h-5 w-5 animate-spin text-primary shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{fileName}</p>
                <p className="text-xs text-muted-foreground">Procesando y validando…</p>
              </div>
            </div>
            <Progress value={progress} className="h-2" />
          </div>
        )}

        {/* ── PASO: previewing ──────────────────────────────────────────────── */}
        {step === "previewing" && preview && (
          <div className="space-y-4">
            {/* Resumen general */}
            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="rounded-lg bg-muted p-3">
                <p className="text-2xl font-bold">{preview.totalRows}</p>
                <p className="text-xs text-muted-foreground">Total filas</p>
              </div>
              <div className="rounded-lg bg-green-50 dark:bg-green-900/20 p-3">
                <p className="text-2xl font-bold text-green-600">{preview.validRows}</p>
                <p className="text-xs text-muted-foreground">Válidas</p>
              </div>
              <div className={`rounded-lg p-3 ${preview.errors.length > 0 ? "bg-red-50 dark:bg-red-900/20" : "bg-muted"}`}>
                <p className={`text-2xl font-bold ${preview.errors.length > 0 ? "text-red-600" : ""}`}>
                  {preview.errors.length}
                </p>
                <p className="text-xs text-muted-foreground">Con errores</p>
              </div>
            </div>

            {/* Alertas: categorías nuevas */}
            {preview.missingCategories.length > 0 && (
              <Alert className="border-amber-300 bg-amber-50 dark:bg-amber-900/20">
                <AlertTriangle className="h-4 w-4 text-amber-600" />
                <AlertTitle className="text-amber-800 dark:text-amber-300">
                  Categorías nuevas ({preview.missingCategories.length})
                </AlertTitle>
                <AlertDescription className="text-amber-700 dark:text-amber-400 text-xs mt-1">
                  Las siguientes categorías no existen y se crearán automáticamente:
                  <div className="flex flex-wrap gap-1 mt-2">
                    {preview.missingCategories.map((c) => (
                      <Badge key={c} variant="outline" className="text-xs border-amber-400">
                        {c}
                      </Badge>
                    ))}
                  </div>
                </AlertDescription>
              </Alert>
            )}

            {/* Alertas: etiquetas nuevas */}
            {preview.missingTags.length > 0 && (
              <Alert className="border-blue-300 bg-blue-50 dark:bg-blue-900/20">
                <Info className="h-4 w-4 text-blue-600" />
                <AlertTitle className="text-blue-800 dark:text-blue-300">
                  Etiquetas nuevas ({preview.missingTags.length})
                </AlertTitle>
                <AlertDescription className="text-blue-700 dark:text-blue-400 text-xs mt-1">
                  Las siguientes etiquetas no existen y se crearán automáticamente:
                  <div className="flex flex-wrap gap-1 mt-2">
                    {preview.missingTags.map((t) => (
                      <Badge key={t} variant="outline" className="text-xs border-blue-400">
                        {t}
                      </Badge>
                    ))}
                  </div>
                </AlertDescription>
              </Alert>
            )}

            {/* Errores de filas */}
            {preview.errors.length > 0 && (
              <div className="rounded-lg border border-red-200 bg-red-50 dark:bg-red-900/10 p-3 space-y-1.5 max-h-40 overflow-y-auto">
                <p className="text-xs font-semibold text-red-700 dark:text-red-400">
                  Filas con errores (serán omitidas):
                </p>
                {preview.errors.map((e) => (
                  <p key={e.row} className="text-xs text-red-600 dark:text-red-400">
                    <span className="font-medium">Fila {e.row}:</span> {e.message}
                  </p>
                ))}
              </div>
            )}

            {preview.validRows === 0 && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Sin filas válidas</AlertTitle>
                <AlertDescription>
                  No hay ninguna fila que pueda importarse. Revisá el formato del archivo.
                </AlertDescription>
              </Alert>
            )}

            {preview.validRows > 0 && (
              <p className="text-xs text-muted-foreground text-center">
                Se importarán <strong>{preview.validRows}</strong> transacción(es).
                {preview.errors.length > 0 && ` Se omitirán ${preview.errors.length} fila(s) con errores.`}
              </p>
            )}
          </div>
        )}

        {/* ── PASO: importing ──────────────────────────────────────────────── */}
        {step === "importing" && (
          <div className="space-y-4 py-6">
            <div className="flex items-center gap-3">
              <Loader2 className="h-5 w-5 animate-spin text-primary shrink-0" />
              <div>
                <p className="text-sm font-medium">Importando transacciones…</p>
                <p className="text-xs text-muted-foreground">Esto puede tomar unos segundos</p>
              </div>
            </div>
            <Progress value={progress} className="h-2" />
          </div>
        )}

        {/* ── PASO: done ───────────────────────────────────────────────────── */}
        {step === "done" && (
          <div className="flex flex-col items-center gap-4 py-8 text-center">
            <CheckCircle2 className="h-14 w-14 text-green-500" />
            <div>
              <p className="text-lg font-semibold">Importación completada</p>
              <p className="text-sm text-muted-foreground mt-1">
                Las transacciones fueron importadas correctamente.
              </p>
            </div>
          </div>
        )}

        <Separator />

        {/* ── Botones ───────────────────────────────────────────────────────── */}
        <DialogFooter className="gap-2">
          {step === "done" ? (
            <Button onClick={handleClose}>Cerrar</Button>
          ) : step === "previewing" ? (
            <>
              <Button variant="outline" onClick={reset}>
                <X className="h-4 w-4 mr-1" /> Cancelar
              </Button>
              <Button
                onClick={handleConfirm}
                disabled={!preview || preview.validRows === 0}
              >
                <Upload className="h-4 w-4 mr-1" />
                Confirmar importación ({preview?.validRows ?? 0})
              </Button>
            </>
          ) : (
            <Button variant="outline" onClick={handleClose} disabled={step === "parsing" || step === "importing"}>
              Cancelar
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
