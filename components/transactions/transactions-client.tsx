"use client";

import { useState, useCallback, useTransition, useRef, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { format, subMonths, startOfMonth } from "date-fns";
import { es } from "date-fns/locale";
import * as LucideIcons from "lucide-react";
import {
  Plus, Filter, Download, Trash2, Pencil, ArrowUpCircle,
  ArrowDownCircle, ArrowLeftRight, ChevronDown, X, Loader2,
  Tag as TagIcon, FolderOpen, Wallet, Mail, FileText, Sheet,
  FileSpreadsheet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { getTransactions, deleteTransaction, getBalanceBeforePeriod } from "@/app/actions/transactions";
import { ImportTransactionsDialog } from "./import-transactions-dialog";
import { toast } from "@/hooks/use-toast";
import { formatCurrency } from "@/lib/utils";
import { exportToPDF, exportToExcel, exportToCSV } from "@/lib/export";
import type { Account, Category, Tag, TransactionWithRelations, TransactionFilters } from "@/lib/types";

function DynamicCategoryIcon({ iconName, className }: { iconName: string | null | undefined; className?: string }) {
  const cls = className ?? "h-3.5 w-3.5";
  if (!iconName) return <FolderOpen className={cls} />;
  const IconComponent = (LucideIcons as any)[iconName] as React.FC<{ className?: string }>;
  if (!IconComponent) return <FolderOpen className={cls} />;
  return <IconComponent className={cls} />;
}

interface Props {
  initialTransactions: TransactionWithRelations[];
  accounts: Account[];
  categories: Category[];
  tags: Tag[];
  initialStartingBalance: number;
  initialFilters?: TransactionFilters;
}

type ExportFormat = "pdf" | "excel" | "csv";
type ExportStep = "format" | "destination" | "email";

export function TransactionsClient({ initialTransactions, accounts, categories, tags, initialStartingBalance, initialFilters }: Props) {
  const [transactions, setTransactions] = useState(initialTransactions);
  const [filters, setFilters] = useState<TransactionFilters>(initialFilters ?? { periodo: "mes_actual" });
  const [showFilters, setShowFilters] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [loading, setLoading] = useState(false);
  const [startingBalance, setStartingBalance] = useState(initialStartingBalance);

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
      const [data, newStartingBalance] = await Promise.all([
        getTransactions(newFilters),
        getBalanceBeforePeriod(newFilters),
      ]);
      setTransactions(data);
      setFilters(newFilters);
      setStartingBalance(newStartingBalance);
    } catch (err: any) {
      toast({ variant: "destructive", title: "Error", description: err.message });
    } finally {
      setLoading(false);
    }
  }, []);

  const handleDelete = (id: string) => {
    startTransition(async () => {
      try {
        await deleteTransaction(id);
        setTransactions((prev) => prev.filter((t) => t.id !== id));
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

  // Group by day
  const byDay = transactions.reduce((acc, t) => {
    if (!acc[t.fecha]) acc[t.fecha] = [];
    acc[t.fecha].push(t);
    return acc;
  }, {} as Record<string, TransactionWithRelations[]>);

  const sortedDays = Object.keys(byDay).sort((a, b) => b.localeCompare(a));

  const totalIngresos = transactions.filter((t) => t.tipo === "ingreso").reduce((s, t) => s + Number(t.monto), 0);
  const totalGastos = transactions.filter((t) => t.tipo === "gasto").reduce((s, t) => s + Number(t.monto), 0);

  const selectedAccountId = filters.account_id;
  const daysAscending = [...sortedDays].reverse();
  let running = startingBalance;
  const dayEndBalance: Record<string, number> = {};
  for (const day of daysAscending) {
    const dayTxs = byDay[day];
    const sorted = [...dayTxs].sort((a, b) => a.created_at.localeCompare(b.created_at));
    for (const t of sorted) {
      if (t.tipo === "ingreso") running += Number(t.monto);
      else if (t.tipo === "gasto") running -= Number(t.monto);
      else if (t.tipo === "transferencia") {
        if (selectedAccountId) {
          if (t.account_id === selectedAccountId) running -= Number(t.monto);
          else running += Number(t.monto);
        }
      }
    }
    dayEndBalance[day] = running;
  }

  // Category filter label
  const selectedCategory = categories.find((c) => c.id === filters.category_id);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Movimientos</h1>
          <p className="text-sm text-muted-foreground">{transactions.length} movimientos</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={() => setShowFilters(!showFilters)}>
            <Filter className="h-4 w-4 mr-2" />
            Filtros
            <ChevronDown className={`h-4 w-4 ml-1 transition-transform ${showFilters ? "rotate-180" : ""}`} />
          </Button>
          <Button variant="outline" size="sm" onClick={() => setImportOpen(true)}>
            <Download className="h-4 w-4 mr-2 rotate-180" />
            Importar
          </Button>
          <Link href="/transactions/new">
            <Button size="sm">
              <Plus className="h-4 w-4 mr-2" /> Nuevo
            </Button>
          </Link>
        </div>
      </div>

      {/* Filter panel */}
      {showFilters && (
        <Card>
          <CardContent className="pt-6 space-y-4">
            {/* Row 1: Tipo + Período + Cuenta */}
            <div className="grid gap-3 grid-cols-2 sm:grid-cols-3">
              <div className="space-y-1">
                <Label className="text-xs">Tipo</Label>
                <Select
                  value={filters.tipo ?? "todos"}
                  onValueChange={(v) => applyFilters({ ...filters, tipo: v as any })}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todo</SelectItem>
                    <SelectItem value="ingreso">Ingresos</SelectItem>
                    <SelectItem value="gasto">Gastos</SelectItem>
                    <SelectItem value="transferencia">Transferencias</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Período</Label>
                <Select
                  value={filters.periodo ?? "mes_actual"}
                  onValueChange={(v) => applyFilters({ ...filters, periodo: v as any })}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="mes_actual">Mes actual</SelectItem>
                    <SelectItem value="mes_anterior">Mes anterior</SelectItem>
                    <SelectItem value="ultimos_3_meses">Últimos 3 meses</SelectItem>
                    <SelectItem value="año_actual">Año actual</SelectItem>
                    <SelectItem value="ultimo_año">Último año</SelectItem>
                    <SelectItem value="personalizado">Período personalizado</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Cuenta</Label>
                <Select
                  value={filters.account_id ?? "todas"}
                  onValueChange={(v) => applyFilters({ ...filters, account_id: v === "todas" ? undefined : v })}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todas">Todas</SelectItem>
                    {accounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.nombre}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Custom date range */}
            {filters.periodo === "personalizado" && (
              <div className="grid gap-3 grid-cols-2">
                <div className="space-y-1">
                  <Label className="text-xs">Desde</Label>
                  <Input
                    type="date"
                    className="h-8 text-xs"
                    value={filters.fechaDesde ?? ""}
                    onChange={(e) => applyFilters({ ...filters, fechaDesde: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Hasta</Label>
                  <Input
                    type="date"
                    className="h-8 text-xs"
                    value={filters.fechaHasta ?? ""}
                    onChange={(e) => applyFilters({ ...filters, fechaHasta: e.target.value })}
                  />
                </div>
              </div>
            )}

            {/* Row 2: Categoría + Etiquetas (same row on md+) */}
            <div className="grid gap-3 sm:grid-cols-2">
              {/* Category combobox */}
              <div className="space-y-1">
                <Label className="text-xs">Categoría</Label>
                <div className="relative">
                  <Input
                    ref={catInputRef}
                    className="h-8 text-xs pr-7"
                    placeholder={selectedCategory ? selectedCategory.nombre : "Buscar categoría..."}
                    value={catSearch}
                    onChange={(e) => { setCatSearch(e.target.value); setCatDropdownOpen(true); }}
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
                      {categories.filter((c) => c.nombre.toLowerCase().includes(catSearch.toLowerCase())).length === 0 && (
                        <p className="text-xs text-muted-foreground px-3 py-2">Sin resultados</p>
                      )}
                    </div>
                  )}
                </div>
                {selectedCategory && !catSearch && (
                  <p className="text-xs text-primary truncate">{selectedCategory.nombre}</p>
                )}
              </div>

              {/* Tag searchable filter */}
              <div className="space-y-1">
                <Label className="text-xs">Etiquetas</Label>
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
                    onChange={(e) => { setTagSearch(e.target.value); setTagDropdownOpen(true); }}
                    onFocus={() => setTagDropdownOpen(true)}
                    onBlur={() => setTimeout(() => setTagDropdownOpen(false), 150)}
                  />
                  {tagDropdownOpen && (
                    <div className="absolute z-50 mt-1 w-full max-h-40 overflow-y-auto rounded-md border bg-popover shadow-md">
                      {tags
                        .filter((t) =>
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
                      {tags.filter((t) =>
                        t.nombre.toLowerCase().includes(tagSearch.toLowerCase()) &&
                        !(filters.tag_ids ?? []).includes(t.id)
                      ).length === 0 && (
                        <p className="text-xs text-muted-foreground px-3 py-2">Sin resultados</p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="flex gap-2">
              <Button
                variant="ghost"
                size="sm"
                className="text-xs"
                onClick={() => { setCatSearch(""); applyFilters({ periodo: "mes_actual" }); }}
              >
                <X className="h-3.5 w-3.5 mr-1" />
                Limpiar filtros
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Summary + Export */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm items-center">
          <span className="text-green-600 dark:text-green-400 font-medium">
            ↑ {formatCurrency(totalIngresos, "ARS")}
          </span>
          <span className="text-red-600 dark:text-red-400 font-medium">
            ↓ {formatCurrency(totalGastos, "ARS")}
          </span>
          <span className="text-muted-foreground">|</span>
          <span className="text-xs text-muted-foreground">Inicio período: {formatCurrency(startingBalance, "ARS")}</span>
          {sortedDays.length > 0 && (
            <>
              <span className="text-muted-foreground">·</span>
              <span className={`font-bold ${dayEndBalance[sortedDays[0]] >= 0 ? "" : "text-red-600 dark:text-red-400"}`}>
                Final: {formatCurrency(dayEndBalance[sortedDays[0]], "ARS")}
              </span>
            </>
          )}
        </div>

        <Button variant="outline" size="sm" onClick={openExportDialog}>
          <Download className="h-3.5 w-3.5 mr-1.5" />
          Exportar
        </Button>
      </div>

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
            const dayIngresos = dayTxs.filter((t) => t.tipo === "ingreso").reduce((s, t) => s + Number(t.monto), 0);
            const dayGastos = dayTxs.filter((t) => t.tipo === "gasto").reduce((s, t) => s + Number(t.monto), 0);
            const saldoAlCierre = dayEndBalance[day];

            return (
              <div key={day}>
                {/* Day header */}
                <div className="flex items-center justify-between mb-3 sticky top-0 bg-background py-1 z-10">
                  <h3 className="text-sm font-semibold text-muted-foreground">
                    {format(new Date(day + "T12:00:00"), "EEEE, d 'de' MMMM", { locale: es })
                      .replace(/^\w/, (c) => c.toUpperCase())}
                  </h3>
                  <div className="flex items-center gap-2 text-xs font-medium">
                    {dayIngresos > 0 && (
                      <span className="text-green-600 dark:text-green-400">
                        +{formatCurrency(dayIngresos, "ARS")}
                      </span>
                    )}
                    {dayGastos > 0 && (
                      <span className="text-red-600 dark:text-red-400">
                        -{formatCurrency(dayGastos, "ARS")}
                      </span>
                    )}
                    <span className={`font-bold ${saldoAlCierre >= 0 ? "text-foreground" : "text-red-600 dark:text-red-400"}`}>
                      = {formatCurrency(saldoAlCierre, "ARS")}
                    </span>
                  </div>
                </div>

                <Card>
                  <CardContent className="p-0 divide-y overflow-x-auto">
                    {dayTxs.map((t) => (
                      <div key={t.id} className="flex items-center gap-3 p-3 sm:p-4 hover:bg-muted/30 transition-colors group min-w-0">
                        {/* Type icon */}
                        <div className={`rounded-full p-2 shrink-0 ${
                          t.tipo === "ingreso" ? "bg-green-100 dark:bg-green-900/30" :
                          t.tipo === "gasto" ? "bg-red-100 dark:bg-red-900/30" :
                          "bg-blue-100 dark:bg-blue-900/30"
                        }`}>
                          {t.tipo === "ingreso" ? (
                            <ArrowUpCircle className="h-4 w-4 text-green-600 dark:text-green-400" />
                          ) : t.tipo === "gasto" ? (
                            <ArrowDownCircle className="h-4 w-4 text-red-600 dark:text-red-400" />
                          ) : (
                            <ArrowLeftRight className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                          )}
                        </div>

                        {/* Info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
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
                          {/* Notes */}
                          {t.notas && (
                            <p className="text-xs text-muted-foreground mt-0.5 truncate">{t.notas}</p>
                          )}
                          {/* Account row */}
                          <div className="flex items-center gap-1.5 mt-0.5">
                            {t.account?.icon_url ? (
                              <Image
                                src={t.account.icon_url}
                                alt={t.account.nombre}
                                width={14}
                                height={14}
                                className="rounded-full h-3.5 w-3.5 object-cover"
                              />
                            ) : (
                              <Wallet className="h-3 w-3 text-muted-foreground" />
                            )}
                            <span className="text-xs text-muted-foreground">{t.account?.nombre}</span>
                          </div>
                        </div>

                        {/* Amount */}
                        <p className={`text-sm font-bold shrink-0 ${
                          t.tipo === "ingreso" ? "text-green-600 dark:text-green-400" :
                          t.tipo === "gasto" ? "text-red-600 dark:text-red-400" :
                          "text-blue-600 dark:text-blue-400"
                        }`}>
                          {t.tipo === "ingreso" ? "+" : t.tipo === "gasto" ? "-" : ""}
                          {formatCurrency(Number(t.monto), t.account?.moneda ?? "ARS")}
                        </p>

                        {/* Actions */}
                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                          <Link href={`/transactions/${t.id}/edit`}>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                          </Link>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 hover:text-destructive"
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
