"use client";

import { useState, useCallback, useTransition, useRef, useEffect, useMemo } from "react";
import Link from "next/link";
import Image from "next/image";
import { format, subMonths, startOfMonth } from "date-fns";
import { es } from "date-fns/locale";
import * as LucideIcons from "lucide-react";
import {
  Plus, Download, Trash2, Pencil, ArrowLeftRight,
  X, Loader2,
  Tag as TagIcon, FolderOpen, Wallet, Mail, FileText, Sheet,
  FileSpreadsheet, ArrowUpCircle, ArrowDownCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { getTransactions, deleteTransaction, getTotalBalance } from "@/app/actions/transactions";
import { ImportTransactionsDialog } from "./import-transactions-dialog";
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
  TransactionPeriod,
} from "@/lib/types";

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

const TX_FILTER_KEY = "monetara_tx_filters";

const DEFAULT_FILTERS: TransactionFilters = {
  periodo: "mes_actual",
  showIngresos: true,
  showGastos: true,
};

const VALID_PERIODS = new Set<string>([
  "mes_actual",
  "mes_anterior",
  "ultimos_3_meses",
  "año_actual",
  "ultimo_año",
  "personalizado",
  "desde_el_inicio",
]);

function normalizeStoredTransactionFilters(raw: unknown): TransactionFilters {
  const out: TransactionFilters = { ...DEFAULT_FILTERS };
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  const o = raw as Record<string, unknown>;

  if (typeof o.periodo === "string" && VALID_PERIODS.has(o.periodo)) {
    out.periodo = o.periodo as TransactionPeriod;
  }
  if (typeof o.fechaDesde === "string") out.fechaDesde = o.fechaDesde;
  if (typeof o.fechaHasta === "string") out.fechaHasta = o.fechaHasta;
  if (typeof o.account_id === "string") out.account_id = o.account_id;
  if (typeof o.category_id === "string") out.category_id = o.category_id;
  if (Array.isArray(o.tag_ids)) {
    out.tag_ids = o.tag_ids.filter((id): id is string => typeof id === "string");
  }

  const hasExplicitShow =
    Object.prototype.hasOwnProperty.call(o, "showIngresos") ||
    Object.prototype.hasOwnProperty.call(o, "showGastos");

  if (hasExplicitShow) {
    out.showIngresos =
      typeof o.showIngresos === "boolean" ? o.showIngresos : DEFAULT_FILTERS.showIngresos!;
    out.showGastos =
      typeof o.showGastos === "boolean" ? o.showGastos : DEFAULT_FILTERS.showGastos!;
  } else if (o.tipo === "ingreso") {
    out.showIngresos = true;
    out.showGastos = false;
  } else if (o.tipo === "gasto") {
    out.showIngresos = false;
    out.showGastos = true;
  }

  return out;
}

function persistTxFilters(f: TransactionFilters) {
  try {
    const { tipo: _omit, ...rest } = f;
    localStorage.setItem(TX_FILTER_KEY, JSON.stringify(rest));
  } catch {}
}

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
    initialFilters ? normalizeStoredTransactionFilters(initialFilters) : DEFAULT_FILTERS
  );
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [loading, setLoading] = useState(false);
  const [referenceTotalBalance, setReferenceTotalBalance] = useState(initialReferenceTotalBalance);

  useEffect(() => {
    setReferenceTotalBalance(initialReferenceTotalBalance);
  }, [initialReferenceTotalBalance]);

  // Tag filter
  const [tagSearch, setTagSearch] = useState("");
  const [tagDropdownOpen, setTagDropdownOpen] = useState(false);
  const tagInputRef = useRef<HTMLInputElement>(null);

  // Category combobox filter
  const [catSearch, setCatSearch] = useState("");
  const [catDropdownOpen, setCatDropdownOpen] = useState(false);
  const catInputRef = useRef<HTMLInputElement>(null);

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
      persistTxFilters(newFilters);
      setReferenceTotalBalance(newRef);
    } catch (err: any) {
      toast({ variant: "destructive", title: "Error", description: err.message });
    } finally {
      setLoading(false);
    }
  }, []);

  const clearFilters = useCallback(() => {
    try { localStorage.removeItem(TX_FILTER_KEY); } catch {}
    setCatSearch("");
    setTagSearch("");
    applyFilters({ ...DEFAULT_FILTERS });
  }, [applyFilters]);

  /** Sin query params en la URL: recuperar filtros de localStorage tras montar. Con URL: persistir sin refetch. */
  useEffect(() => {
    if (initialFilters) {
      const normalized = normalizeStoredTransactionFilters(initialFilters);
      persistTxFilters(normalized);
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

  // Category filter label
  const selectedCategory = categories.find((c) => c.id === filters.category_id);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Movimientos</h1>
        </div>
        <div className="flex gap-2 flex-wrap items-center">
          {/* File actions group */}
          <Button variant="outline" size="sm" onClick={() => setImportOpen(true)}>
            <Download className="h-4 w-4 mr-1.5 rotate-180" />
            Importar
          </Button>
          <Button variant="outline" size="sm" onClick={openExportDialog}>
            <Download className="h-4 w-4 mr-1.5" />
            Exportar
          </Button>

          {/* Quick-add actions */}
          <Link href="/transactions/new?tipo=ingreso">
            <Button size="sm" className="bg-green-600 hover:bg-green-700 text-white gap-1.5 h-8 px-3 text-xs">
              <ArrowUpCircle className="h-3.5 w-3.5" />
              Ingreso
            </Button>
          </Link>
          <Link href="/transactions/new?tipo=gasto">
            <Button size="sm" className="bg-red-600 hover:bg-red-700 text-white gap-1.5 h-8 px-3 text-xs">
              <ArrowDownCircle className="h-3.5 w-3.5" />
              Gasto
            </Button>
          </Link>
          <Link href="/transactions/new?tipo=transferencia">
            <Button size="sm" className="bg-[#0e415f] hover:bg-[#1f628e] text-white dark:bg-[#f4f0e0] dark:hover:bg-[#e8e4d4] dark:text-[#0e415f] gap-1.5 h-8 px-3 text-xs">
              <ArrowLeftRight className="h-3.5 w-3.5" />
              Transferencia
            </Button>
          </Link>
        </div>
      </div>

      {/* Barra de filtros (siempre visible) */}
      <Card>
        <CardContent className="pt-4 pb-4 space-y-3">
          <div className="flex flex-wrap gap-3 items-end">
            <div className="space-y-1 min-w-[10rem] flex-1 basis-[min(100%,12rem)]">
              <Label className="text-xs text-muted-foreground">Cuenta</Label>
              <Select
                value={filters.account_id ?? "todas"}
                onValueChange={(v) =>
                  applyFilters({ ...filters, account_id: v === "todas" ? undefined : v })
                }
              >
                <SelectTrigger className="h-8 text-xs w-full min-w-0">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todas">Todas</SelectItem>
                  {accounts.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1 min-w-[10rem] flex-1 basis-[min(100%,13rem)]">
              <Label className="text-xs text-muted-foreground">Categorías</Label>
              <div className="relative">
                <Input
                  ref={catInputRef}
                  className="h-8 text-xs pr-7"
                  placeholder={selectedCategory ? selectedCategory.nombre : "Buscar categoría..."}
                  value={catSearch}
                  onChange={(e) => {
                    setCatSearch(e.target.value);
                    setCatDropdownOpen(true);
                  }}
                  onFocus={() => setCatDropdownOpen(true)}
                  onBlur={() => setTimeout(() => setCatDropdownOpen(false), 150)}
                />
                {filters.category_id && (
                  <button
                    type="button"
                    className="absolute right-2 top-1/2 -translate-y-1/2"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      setCatSearch("");
                      applyFilters({ ...filters, category_id: undefined });
                    }}
                  >
                    <X className="h-3 w-3 text-muted-foreground hover:text-foreground" />
                  </button>
                )}
                {catDropdownOpen && (
                  <div className="absolute z-50 mt-1 w-full max-h-48 overflow-y-auto rounded-md border bg-popover shadow-md">
                    <button
                      type="button"
                      className="w-full text-left text-xs px-3 py-2 hover:bg-accent transition-colors text-muted-foreground"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        setCatSearch("");
                        setCatDropdownOpen(false);
                        applyFilters({ ...filters, category_id: undefined });
                      }}
                    >
                      Todas las categorías
                    </button>
                    {categories
                      .filter((c) => c.nombre.toLowerCase().includes(catSearch.toLowerCase()))
                      .map((cat) => (
                        <button
                          key={cat.id}
                          type="button"
                          className="w-full text-left text-xs px-3 py-2 hover:bg-accent transition-colors flex items-center gap-2"
                          onMouseDown={(e) => {
                            e.preventDefault();
                            setCatSearch("");
                            setCatDropdownOpen(false);
                            applyFilters({ ...filters, category_id: cat.id });
                          }}
                        >
                          <DynamicCategoryIcon iconName={cat.icono} className="h-3 w-3 shrink-0" />
                          {cat.nombre}
                        </button>
                      ))}
                    {categories.filter((c) =>
                      c.nombre.toLowerCase().includes(catSearch.toLowerCase())
                    ).length === 0 && (
                      <p className="text-xs text-muted-foreground px-3 py-2">Sin resultados</p>
                    )}
                  </div>
                )}
              </div>
              {selectedCategory && !catSearch && (
                <p className="text-xs text-primary truncate">{selectedCategory.nombre}</p>
              )}
            </div>

            <div className="space-y-1 min-w-[10rem] flex-1 basis-[min(100%,13rem)]">
              <Label className="text-xs text-muted-foreground">Etiquetas</Label>
              {(filters.tag_ids ?? []).length > 0 && (
                <div className="flex flex-wrap gap-1 mb-1">
                  {(filters.tag_ids ?? []).map((id) => {
                    const tag = tags.find((t) => t.id === id);
                    if (!tag) return null;
                    return (
                      <button
                        key={id}
                        type="button"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          const newIds = (filters.tag_ids ?? []).filter((tid) => tid !== id);
                          applyFilters({ ...filters, tag_ids: newIds.length ? newIds : undefined });
                        }}
                        className="text-xs px-2 py-0.5 rounded-full bg-primary text-primary-foreground flex items-center gap-1"
                      >
                        {tag.nombre}
                        <X className="h-2.5 w-2.5" />
                      </button>
                    );
                  })}
                </div>
              )}
              <div className="relative">
                <Input
                  ref={tagInputRef}
                  className="h-8 text-xs"
                  placeholder="Buscar etiqueta..."
                  value={tagSearch}
                  onChange={(e) => {
                    setTagSearch(e.target.value);
                    setTagDropdownOpen(true);
                  }}
                  onFocus={() => setTagDropdownOpen(true)}
                  onBlur={() => setTimeout(() => setTagDropdownOpen(false), 150)}
                />
                {tagDropdownOpen && (
                  <div className="absolute z-50 mt-1 w-full max-h-40 overflow-y-auto rounded-md border bg-popover shadow-md">
                    {tags
                      .filter(
                        (t) =>
                          t.nombre.toLowerCase().includes(tagSearch.toLowerCase()) &&
                          !(filters.tag_ids ?? []).includes(t.id)
                      )
                      .map((tag) => (
                        <button
                          key={tag.id}
                          type="button"
                          className="w-full text-left text-xs px-3 py-2 hover:bg-accent transition-colors"
                          onMouseDown={(e) => {
                            e.preventDefault();
                            const newIds = [...(filters.tag_ids ?? []), tag.id];
                            applyFilters({ ...filters, tag_ids: newIds });
                            setTagSearch("");
                            setTagDropdownOpen(false);
                          }}
                        >
                          {tag.nombre}
                        </button>
                      ))}
                    {tags.filter(
                      (t) =>
                        t.nombre.toLowerCase().includes(tagSearch.toLowerCase()) &&
                        !(filters.tag_ids ?? []).includes(t.id)
                    ).length === 0 && (
                      <p className="text-xs text-muted-foreground px-3 py-2">Sin resultados</p>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-1 min-w-[10rem] flex-1 basis-[min(100%,12rem)]">
              <Label className="text-xs text-muted-foreground">Período</Label>
              <Select
                value={filters.periodo ?? "mes_actual"}
                onValueChange={(v) =>
                  applyFilters({ ...filters, periodo: v as TransactionPeriod })
                }
              >
                <SelectTrigger className="h-8 text-xs w-full min-w-0">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="mes_actual">Mes actual</SelectItem>
                  <SelectItem value="mes_anterior">Mes anterior</SelectItem>
                  <SelectItem value="ultimos_3_meses">Últimos 3 meses</SelectItem>
                  <SelectItem value="año_actual">Año actual</SelectItem>
                  <SelectItem value="ultimo_año">Último año</SelectItem>
                  <SelectItem value="personalizado">Período personalizado</SelectItem>
                  <SelectItem value="desde_el_inicio">Desde el inicio</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 min-w-[9rem] shrink-0 pb-0.5">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="filtro-ingresos"
                  checked={filters.showIngresos !== false}
                  onCheckedChange={(v) =>
                    applyFilters({ ...filters, showIngresos: v === true })
                  }
                  className="border-green-600/45 data-[state=checked]:bg-green-600 data-[state=checked]:border-green-600 data-[state=checked]:text-white dark:border-green-500/55"
                />
                <Label htmlFor="filtro-ingresos" className="text-xs font-normal cursor-pointer whitespace-nowrap">
                  Ingresos
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="filtro-gastos"
                  checked={filters.showGastos !== false}
                  onCheckedChange={(v) =>
                    applyFilters({ ...filters, showGastos: v === true })
                  }
                  className="border-red-600/45 data-[state=checked]:bg-red-600 data-[state=checked]:border-red-600 data-[state=checked]:text-white dark:border-red-500/55"
                />
                <Label htmlFor="filtro-gastos" className="text-xs font-normal cursor-pointer whitespace-nowrap">
                  Gastos
                </Label>
              </div>
            </div>
          </div>

          {filters.periodo === "personalizado" && (
            <div className="grid gap-3 grid-cols-2 sm:max-w-md">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Desde</Label>
                <Input
                  type="date"
                  className="h-8 text-xs"
                  value={filters.fechaDesde ?? ""}
                  onChange={(e) => applyFilters({ ...filters, fechaDesde: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Hasta</Label>
                <Input
                  type="date"
                  className="h-8 text-xs"
                  value={filters.fechaHasta ?? ""}
                  onChange={(e) => applyFilters({ ...filters, fechaHasta: e.target.value })}
                />
              </div>
            </div>
          )}

          <div className="flex gap-2 pt-1">
            <Button variant="ghost" size="sm" className="text-xs h-8" onClick={clearFilters}>
              <X className="h-3.5 w-3.5 mr-1" />
              Limpiar filtros
            </Button>
          </div>
        </CardContent>
      </Card>

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
                        <div className="flex-1 min-w-0">
                          {/* Line 1: category icon + name + tags */}
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {t.tipo !== "transferencia" && (
                              <span className="shrink-0 text-muted-foreground">
                                <DynamicCategoryIcon iconName={t.category?.icono} className="h-3.5 w-3.5" />
                              </span>
                            )}
                            <p className="text-sm font-medium truncate">
                              {t.tipo === "transferencia"
                                ? `${t.account?.nombre} → ${t.to_account?.nombre}`
                                : t.category?.nombre ?? "Sin categoría"
                              }
                            </p>
                            {t.tags?.map((tag) => (
                              <span
                                key={tag.id}
                                className="hidden sm:inline-flex items-center gap-0.5 text-xs px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground border"
                              >
                                <TagIcon className="h-2.5 w-2.5" />
                                {tag.nombre}
                              </span>
                            ))}
                          </div>

                          {/* Line 2: notes — only when not empty */}
                          {t.notas?.trim() && (
                            <p className="text-xs text-muted-foreground/70 mt-0.5 truncate">
                              Nota: {t.notas}
                            </p>
                          )}
                        </div>

                        {/* Amount */}
                        <p className={`text-sm font-bold shrink-0 ${
                          t.tipo === "ingreso" ? "text-green-600 dark:text-green-400" :
                          t.tipo === "gasto"   ? "text-red-600 dark:text-red-400" :
                          "text-blue-600 dark:text-blue-400"
                        }`}>
                          {t.tipo === "ingreso" ? "+" : t.tipo === "gasto" ? "-" : ""}
                          {formatCurrency(Number(t.monto), t.account?.moneda ?? "ARS")}
                        </p>

                        {/* Actions — always visible, red on hover */}
                        <div className="flex gap-0.5 shrink-0">
                          <Link href={`/transactions/${t.id}/edit`}>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-muted-foreground hover:text-red-600 dark:hover:text-red-400 transition-colors"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                          </Link>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground hover:text-red-600 dark:hover:text-red-400 transition-colors"
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
