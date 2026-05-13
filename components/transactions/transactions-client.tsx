"use client";

import { useState, useCallback, useTransition, useEffect, useMemo } from "react";
import Link from "next/link";
import Image from "next/image";
import { format, subMonths, startOfMonth } from "date-fns";
import { es } from "date-fns/locale";
import * as LucideIcons from "lucide-react";
import {
  Plus, Download, Trash2, Pencil, ArrowLeftRight,
  X, Loader2,
  FolderOpen, Wallet, Mail, FileText, Sheet,
  FileSpreadsheet, ArrowUpCircle, ArrowDownCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { getTransactions, deleteTransaction, getTotalBalance } from "@/app/actions/transactions";
import { ImportTransactionsDialog } from "./import-transactions-dialog";
import { TransactionFiltersBar } from "./transaction-filters-bar";
import { toast } from "@/hooks/use-toast";
import { formatCurrency } from "@/lib/utils";
import {
  applyTransactionToRunningBalance,
  sortTxsWithinDayForBalance,
  sumBalanceDeltasForScope,
  type RunningBalanceScope,
} from "@/lib/transaction-balance";
import { exportToPDF, exportToExcel, exportToCSV } from "@/lib/export";
import type {
  Account,
  Category,
  Tag,
  TransactionWithRelations,
  TransactionFilters,
} from "@/lib/types";
import {
  TX_FILTER_KEY,
  DEFAULT_TRANSACTION_FILTERS,
  normalizeStoredTransactionFilters,
  persistTransactionFilters,
} from "@/lib/transaction-filters";

function DynamicCategoryIcon({ iconName, className }: { iconName: string | null | undefined; className?: string }) {
  const cls = className ?? "h-3.5 w-3.5";
  if (!iconName) return <FolderOpen className={cls} />;
  const IconComponent = (LucideIcons as any)[iconName] as React.ElementType<{ className?: string }>;
  if (!IconComponent) return <FolderOpen className={cls} />;
  return <IconComponent className={cls} />;
}

interface Props {
  initialTransactions: TransactionWithRelations[];
  accounts: Account[];
  categories: Category[];
  tags: Tag[];
  /** Saldo real RPC (widget): lista anclada para que el cierre coincida */
  referenceTotalBalance: number;
  initialFilters?: TransactionFilters;
}

type ExportFormat = "pdf" | "excel" | "csv";
type ExportStep = "format" | "destination" | "email";

export function TransactionsClient({
  initialTransactions,
  accounts,
  categories,
  tags,
  referenceTotalBalance: initialReferenceTotalBalance,
  initialFilters,
}: Props) {
  const [transactions, setTransactions] = useState(initialTransactions);
  const [filters, setFilters] = useState<TransactionFilters>(() =>
    initialFilters
      ? normalizeStoredTransactionFilters(initialFilters)
      : DEFAULT_TRANSACTION_FILTERS
  );
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [loading, setLoading] = useState(false);
  const [referenceTotalBalance, setReferenceTotalBalance] = useState(initialReferenceTotalBalance);

  useEffect(() => {
    setReferenceTotalBalance(initialReferenceTotalBalance);
  }, [initialReferenceTotalBalance]);

  // Export dialog
  const [exportOpen, setExportOpen] = useState(false);
  const [exportStep, setExportStep] = useState<ExportStep>("format");
  const [exportFormat, setExportFormat] = useState<ExportFormat | null>(null);
  const [exportEmail, setExportEmail] = useState("");
  const [exporting, setExporting] = useState(false);

  const [importOpen, setImportOpen] = useState(false);

  // Pre-fill email from profile
  useEffect(() => {
    async function loadEmail() {
      try {
        const { createClient } = await import("@/lib/supabase/client");
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (user?.email) setExportEmail(user.email);
      } catch {}
    }
    loadEmail();
  }, []);

  const applyFilters = useCallback(async (newFilters: TransactionFilters) => {
    setLoading(true);
    try {
      const [data, newRef] = await Promise.all([
        getTransactions(newFilters),
        getTotalBalance(newFilters.account_id),
      ]);
      setTransactions(data);
      setFilters(newFilters);
      persistTransactionFilters(newFilters);
      setReferenceTotalBalance(newRef);
    } catch (err: any) {
      toast({ variant: "destructive", title: "Error", description: err.message });
    } finally {
      setLoading(false);
    }
  }, []);

  const clearFilters = useCallback(() => {
    try { localStorage.removeItem(TX_FILTER_KEY); } catch {}
    applyFilters({ ...DEFAULT_TRANSACTION_FILTERS });
  }, [applyFilters]);

  /** Sin query params en la URL: recuperar filtros de localStorage tras montar. Con URL: persistir sin refetch. */
  useEffect(() => {
    if (initialFilters) {
      const normalized = normalizeStoredTransactionFilters(initialFilters);
      persistTransactionFilters(normalized);
      return;
    }
    try {
      const stored = localStorage.getItem(TX_FILTER_KEY);
      if (stored) {
        applyFilters(normalizeStoredTransactionFilters(JSON.parse(stored)));
      }
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleDelete = (id: string) => {
    startTransition(async () => {
      try {
        await deleteTransaction(id);
        setTransactions((prev) => prev.filter((t) => t.id !== id));
        const newTotal = await getTotalBalance(filters.account_id);
        setReferenceTotalBalance(newTotal);
        setDeleteId(null);
        toast({ title: "Movimiento eliminado" });
      } catch (err: any) {
        toast({ variant: "destructive", title: "Error", description: err.message });
      }
    });
  };

  const openExportDialog = () => {
    setExportStep("format");
    setExportFormat(null);
    setExportOpen(true);
  };

  const handleExportFormat = (fmt: ExportFormat) => {
    setExportFormat(fmt);
    setExportStep("destination");
  };

  const handleDownload = async () => {
    if (!exportFormat) return;
    setExporting(true);
    try {
      if (exportFormat === "pdf") await exportToPDF(transactions, filters);
      else if (exportFormat === "excel") await exportToExcel(transactions);
      else exportToCSV(transactions);
      setExportOpen(false);
      toast({ title: "Archivo exportado correctamente" });
    } catch (err: any) {
      toast({ variant: "destructive", title: "Error al exportar", description: err.message });
    } finally {
      setExporting(false);
    }
  };

  const handleSendEmail = async () => {
    if (!exportEmail.trim()) {
      toast({ variant: "destructive", title: "Ingresá una dirección de email" });
      return;
    }
    setExporting(true);
    await new Promise((r) => setTimeout(r, 1000));
    setExporting(false);
    setExportOpen(false);
    toast({
      title: "Email programado",
      description: `Se enviaría el reporte a ${exportEmail}. (Configurá un servicio de email como Resend o SendGrid para activar el envío real.)`,
    });
  };

  const { byDay, sortedDays } = useMemo(() => {
    const acc = transactions.reduce((map, t) => {
      if (!map[t.fecha]) map[t.fecha] = [];
      map[t.fecha].push(t);
      return map;
    }, {} as Record<string, TransactionWithRelations[]>);
    const sorted = Object.keys(acc).sort((a, b) => b.localeCompare(a));
    return { byDay: acc, sortedDays: sorted };
  }, [transactions]);

  const selectedAccountId = filters.account_id;
  const runningScope = useMemo<RunningBalanceScope>(
    () =>
      selectedAccountId
        ? { kind: "one", accountId: selectedAccountId }
        : { kind: "many", accountIds: new Set(accounts.map((a) => a.id)) },
    [selectedAccountId, accounts]
  );

  const listDisplayCurrency =
    accounts.find((a) => a.id === filters.account_id)?.moneda ?? "ARS";

  const dayEndBalance = useMemo(() => {
    const sumD = sumBalanceDeltasForScope(transactions, runningScope);
    let running = Math.round((referenceTotalBalance - sumD) * 100) / 100;
    const result: Record<string, number> = {};
    const daysAscending = [...sortedDays].reverse();
    for (const day of daysAscending) {
      const dayTxs = byDay[day];
      const sorted = sortTxsWithinDayForBalance(dayTxs);
      for (const t of sorted) {
        running = applyTransactionToRunningBalance(running, t, runningScope);
      }
      result[day] = running;
    }
    return result;
  }, [transactions, referenceTotalBalance, runningScope, sortedDays, byDay]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Movimientos</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/transactions/new?tipo=ingreso">
            <Button
              size="sm"
              className="min-h-11 touch-manipulation gap-1.5 bg-green-600 px-3 text-xs text-white hover:bg-green-700 sm:min-h-8"
            >
              <ArrowUpCircle className="h-3.5 w-3.5" />
              Ingreso
            </Button>
          </Link>
          <Link href="/transactions/new?tipo=gasto">
            <Button
              size="sm"
              className="min-h-11 touch-manipulation gap-1.5 bg-red-600 px-3 text-xs text-white hover:bg-red-700 sm:min-h-8"
            >
              <ArrowDownCircle className="h-3.5 w-3.5" />
              Gasto
            </Button>
          </Link>
          <Link href="/transactions/new?tipo=transferencia">
            <Button
              size="sm"
              className="min-h-11 touch-manipulation gap-1.5 bg-[#0e415f] px-3 text-xs text-white hover:bg-[#1f628e] dark:bg-[#f4f0e0] dark:text-[#0e415f] dark:hover:bg-[#e8e4d4] sm:min-h-8"
            >
              <ArrowLeftRight className="h-3.5 w-3.5" />
              Transferencia
            </Button>
          </Link>
        </div>
      </div>

      {/* Filtros + import/export */}
      <TransactionFiltersBar
        filters={filters}
        onFiltersChange={applyFilters}
        onClear={clearFilters}
        accounts={accounts}
        categories={categories}
        tags={tags}
        idPrefix="filtro"
        footer={
          <>
            <Button
              variant="outline"
              size="sm"
              className="min-h-11 touch-manipulation sm:h-8"
              onClick={() => setImportOpen(true)}
            >
              <Download className="mr-1.5 h-4 w-4 rotate-180" />
              Importar
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="min-h-11 touch-manipulation sm:h-8"
              onClick={openExportDialog}
            >
              <Download className="mr-1.5 h-4 w-4" />
              Exportar
            </Button>
          </>
        }
      />

      {/* Transaction list */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : sortedDays.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <ArrowLeftRight className="h-12 w-12 mb-4 opacity-30" />
            <p className="text-lg font-medium">Sin movimientos</p>
            <p className="text-sm">No hay movimientos para el período seleccionado.</p>
            <Link href="/transactions/new" className="mt-4">
              <Button size="sm"><Plus className="h-4 w-4 mr-2" /> Nuevo Movimiento</Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {sortedDays.map((day) => {
            const dayTxs = byDay[day];
            const saldoAlCierre = dayEndBalance[day];

            return (
              <div key={day}>
                {/* Day header */}
                <div className="flex items-center justify-between mb-3 sticky top-0 bg-background py-1 z-10">
                  <h3 className="text-sm font-semibold text-muted-foreground">
                    {format(new Date(day + "T12:00:00"), "EEEE, d 'de' MMMM", { locale: es })
                      .replace(/^\w/, (c) => c.toUpperCase())}
                  </h3>
                  <span className={`text-xs font-bold ${saldoAlCierre >= 0 ? "text-foreground" : "text-red-600 dark:text-red-400"}`}>
                    Saldo Total: {formatCurrency(saldoAlCierre, listDisplayCurrency)}
                  </span>
                </div>

                <Card>
                  <CardContent className="p-0 divide-y overflow-x-auto">
                    {dayTxs.map((t) => (
                      <div key={t.id} className="flex items-center gap-3 p-3 sm:p-4 hover:bg-muted/30 transition-colors min-w-0">
                        {/* Account icon (replaces type indicator) */}
                        <div className="rounded-full bg-muted shrink-0 h-9 w-9 flex items-center justify-center overflow-hidden">
                          {t.account?.icon_url ? (
                            <Image
                              src={t.account.icon_url}
                              alt={t.account?.nombre ?? ""}
                              width={36}
                              height={36}
                              className="h-9 w-9 object-cover rounded-full"
                            />
                          ) : (
                            <Wallet className="h-4 w-4 text-muted-foreground" />
                          )}
                        </div>

                        {/* Info block */}
                        <div className="min-w-0 flex-1 space-y-1">
                          <div className="flex min-w-0 items-center gap-1.5">
                            {t.tipo !== "transferencia" && (
                              <span className="shrink-0 text-muted-foreground">
                                <DynamicCategoryIcon iconName={t.category?.icono} className="h-3.5 w-3.5" />
                              </span>
                            )}
                            <p className="truncate text-sm font-medium">
                              {t.tipo === "transferencia"
                                ? `${t.account?.nombre} → ${t.to_account?.nombre}`
                                : t.category?.nombre ?? "Sin categoría"}
                            </p>
                          </div>

                          {t.tags && t.tags.length > 0 && (
                            <div className="flex flex-wrap gap-1">
                              {t.tags.map((tag) => (
                                <Badge
                                  key={tag.id}
                                  variant="outline"
                                  className="h-auto max-w-full truncate border-muted-foreground/25 px-1.5 py-0 text-[11px] font-normal text-muted-foreground"
                                >
                                  {tag.nombre}
                                </Badge>
                              ))}
                            </div>
                          )}

                          {t.notas?.trim() && (
                            <p className="truncate text-[11px] leading-snug text-muted-foreground/80">
                              Nota: {t.notas}
                            </p>
                          )}
                        </div>

                        {/* Amount */}
                        <p
                          className={`shrink-0 text-sm font-bold ${
                            t.tipo === "ingreso"
                              ? "text-green-600 dark:text-green-400"
                              : t.tipo === "gasto"
                                ? "text-red-600 dark:text-red-400"
                                : "text-blue-600 dark:text-blue-400"
                          }`}
                        >
                          {t.tipo === "ingreso" ? "+" : t.tipo === "gasto" ? "-" : ""}
                          {formatCurrency(Number(t.monto), t.account?.moneda ?? "ARS")}
                        </p>

                        {/* Actions */}
                        <div className="flex shrink-0 gap-0.5">
                          <Link href={`/transactions/${t.id}/edit`} className="touch-manipulation">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-11 w-11 text-muted-foreground transition-colors hover:text-red-600 dark:hover:text-red-400 sm:h-8 sm:w-8"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                          </Link>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-11 w-11 touch-manipulation text-muted-foreground transition-colors hover:text-red-600 dark:hover:text-red-400 sm:h-8 sm:w-8"
                            onClick={() => setDeleteId(t.id)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              </div>
            );
          })}
        </div>
      )}

      {/* Import dialog */}
      <ImportTransactionsDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        onSuccess={() => applyFilters(filters)}
      />

      {/* Export dialog */}
      <Dialog open={exportOpen} onOpenChange={setExportOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Exportar movimientos</DialogTitle>
            <DialogDescription>
              {exportStep === "format" && "Elegí el formato de exportación."}
              {exportStep === "destination" && "¿Cómo querés recibir el archivo?"}
              {exportStep === "email" && "Ingresá la dirección de correo."}
            </DialogDescription>
          </DialogHeader>

          {exportStep === "format" && (
            <div className="grid gap-2">
              <Button variant="outline" className="justify-start gap-3 h-12" onClick={() => handleExportFormat("pdf")}>
                <FileText className="h-5 w-5 text-red-500" />
                <div className="text-left">
                  <p className="font-medium">PDF</p>
                  <p className="text-xs text-muted-foreground">Reporte visual con tabla</p>
                </div>
              </Button>
              <Button variant="outline" className="justify-start gap-3 h-12" onClick={() => handleExportFormat("excel")}>
                <FileSpreadsheet className="h-5 w-5 text-green-600" />
                <div className="text-left">
                  <p className="font-medium">Excel (.xlsx)</p>
                  <p className="text-xs text-muted-foreground">Hoja de cálculo con resumen</p>
                </div>
              </Button>
              <Button variant="outline" className="justify-start gap-3 h-12" onClick={() => handleExportFormat("csv")}>
                <Sheet className="h-5 w-5 text-blue-500" />
                <div className="text-left">
                  <p className="font-medium">CSV</p>
                  <p className="text-xs text-muted-foreground">Datos planos separados por coma</p>
                </div>
              </Button>
            </div>
          )}

          {exportStep === "destination" && (
            <div className="grid gap-2">
              <Button
                variant="outline"
                className="justify-start gap-3 h-12"
                onClick={handleDownload}
                disabled={exporting}
              >
                {exporting ? <Loader2 className="h-5 w-5 animate-spin" /> : <Download className="h-5 w-5" />}
                <div className="text-left">
                  <p className="font-medium">Descargar archivo</p>
                  <p className="text-xs text-muted-foreground">Guardar en este dispositivo</p>
                </div>
              </Button>
              <Button
                variant="outline"
                className="justify-start gap-3 h-12"
                onClick={() => setExportStep("email")}
              >
                <Mail className="h-5 w-5" />
                <div className="text-left">
                  <p className="font-medium">Enviar por e-mail</p>
                  <p className="text-xs text-muted-foreground">Recibir el reporte en tu correo</p>
                </div>
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setExportStep("format")} className="text-xs">
                ← Cambiar formato
              </Button>
            </div>
          )}

          {exportStep === "email" && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="export-email">Dirección de correo</Label>
                <Input
                  id="export-email"
                  type="email"
                  placeholder="tu@email.com"
                  value={exportEmail}
                  onChange={(e) => setExportEmail(e.target.value)}
                />
              </div>
              <p className="text-xs text-muted-foreground bg-muted rounded-md p-3">
                El reporte en formato <strong>{exportFormat?.toUpperCase()}</strong> será enviado a esta dirección.
                Para activar el envío real, configurá un servicio como Resend o SendGrid en tu proyecto.
              </p>
              <DialogFooter>
                <Button variant="ghost" onClick={() => setExportStep("destination")} className="text-xs">
                  Volver
                </Button>
                <Button onClick={handleSendEmail} disabled={exporting}>
                  {exporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Mail className="mr-2 h-4 w-4" />}
                  Enviar
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <Dialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Eliminar movimiento</DialogTitle>
            <DialogDescription>
              ¿Estás seguro que querés eliminar este movimiento? Esta acción no se puede deshacer.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteId(null)}>Cancelar</Button>
            <Button
              variant="destructive"
              onClick={() => deleteId && handleDelete(deleteId)}
              disabled={isPending}
            >
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Eliminar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
