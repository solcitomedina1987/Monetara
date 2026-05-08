"use client";

import { useState, useCallback, useTransition, useRef } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import * as LucideIcons from "lucide-react";
import {
  Plus, Filter, Download, Trash2, Pencil, ArrowUpCircle,
  ArrowDownCircle, ArrowLeftRight, ChevronDown, X, Loader2,
  Tag as TagIcon, FolderOpen,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
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
import { formatCurrency, toISODateString } from "@/lib/utils";
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

export function TransactionsClient({ initialTransactions, accounts, categories, tags, initialStartingBalance, initialFilters }: Props) {
  const [transactions, setTransactions] = useState(initialTransactions);
  const [filters, setFilters] = useState<TransactionFilters>(initialFilters ?? { periodo: "mes_actual" });
  const [showFilters, setShowFilters] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [loading, setLoading] = useState(false);
  const [startingBalance, setStartingBalance] = useState(initialStartingBalance);
  const [tagSearch, setTagSearch] = useState("");
  const [tagDropdownOpen, setTagDropdownOpen] = useState(false);
  const tagInputRef = useRef<HTMLInputElement>(null);
  const [importOpen, setImportOpen] = useState(false);

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

  // Group by day (descending for display)
  const byDay = transactions.reduce((acc, t) => {
    if (!acc[t.fecha]) acc[t.fecha] = [];
    acc[t.fecha].push(t);
    return acc;
  }, {} as Record<string, TransactionWithRelations[]>);

  const sortedDays = Object.keys(byDay).sort((a, b) => b.localeCompare(a));

  const totalIngresos = transactions.filter((t) => t.tipo === "ingreso").reduce((s, t) => s + Number(t.monto), 0);
  const totalGastos = transactions.filter((t) => t.tipo === "gasto").reduce((s, t) => s + Number(t.monto), 0);

  // Compute cumulative running balance per day (oldest → newest)
  // Each entry: balance at the END of that day
  const selectedAccountId = filters.account_id;
  const daysAscending = [...sortedDays].reverse(); // oldest first

  let running = startingBalance;
  const dayEndBalance: Record<string, number> = {};
  for (const day of daysAscending) {
    const dayTxs = byDay[day];
    // Sort transactions within the day by created_at ascending
    const sorted = [...dayTxs].sort((a, b) => a.created_at.localeCompare(b.created_at));
    for (const t of sorted) {
      if (t.tipo === "ingreso") {
        running += Number(t.monto);
      } else if (t.tipo === "gasto") {
        running -= Number(t.monto);
      } else if (t.tipo === "transferencia") {
        if (selectedAccountId) {
          // Single account view: determine direction relative to selected account
          if (t.account_id === selectedAccountId) {
            running -= Number(t.monto); // debit from selected account
          } else {
            running += Number(t.monto); // credit to selected account
          }
        }
        // All-accounts view: transfer is a wash (net zero), skip
      }
    }
    dayEndBalance[day] = running;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Movimientos</h1>
          <p className="text-sm text-muted-foreground">{transactions.length} movimientos</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowFilters(!showFilters)}>
            <Filter className="h-4 w-4 mr-2" />
            Filtros
            {showFilters ? <ChevronDown className="h-4 w-4 ml-1 rotate-180" /> : <ChevronDown className="h-4 w-4 ml-1" />}
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
          <CardContent className="pt-6">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
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
                    <SelectItem value="personalizado">Rango personalizado</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {filters.periodo === "personalizado" && (
                <>
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
                </>
              )}

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

              <div className="space-y-1">
                <Label className="text-xs">Categoría</Label>
                <Select
                  value={filters.category_id ?? "todas"}
                  onValueChange={(v) => applyFilters({ ...filters, category_id: v === "todas" ? undefined : v })}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todas">Todas</SelectItem>
                    {categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.nombre}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Tag filters — searchable */}
            {tags.length > 0 && (
              <div className="mt-4">
                <Label className="text-xs">Etiquetas</Label>

                {/* Selected tags */}
                {(filters.tag_ids ?? []).length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-1 mb-2">
                    {(filters.tag_ids ?? []).map((id) => {
                      const tag = tags.find((t) => t.id === id);
                      if (!tag) return null;
                      return (
                        <button
                          key={id}
                          onClick={() => {
                            const newIds = (filters.tag_ids ?? []).filter((tid) => tid !== id);
                            applyFilters({ ...filters, tag_ids: newIds.length ? newIds : undefined });
                          }}
                          className="text-xs px-2.5 py-1 rounded-full bg-primary text-primary-foreground flex items-center gap-1"
                        >
                          {tag.nombre}
                          <X className="h-2.5 w-2.5" />
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* Search input */}
                <div className="relative mt-1">
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
                    <div className="absolute z-50 mt-1 w-full max-h-48 overflow-y-auto rounded-md border bg-popover shadow-md">
                      {tags
                        .filter((t) =>
                          t.nombre.toLowerCase().includes(tagSearch.toLowerCase()) &&
                          !(filters.tag_ids ?? []).includes(t.id)
                        )
                        .map((tag) => (
                          <button
                            key={tag.id}
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
            )}

            <div className="flex gap-2 mt-4">
              <Button
                variant="ghost"
                size="sm"
                className="text-xs"
                onClick={() => applyFilters({ periodo: "mes_actual" })}
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
          <span className="text-xs text-muted-foreground">Saldo al inicio del período: {formatCurrency(startingBalance, "ARS")}</span>
          {sortedDays.length > 0 && (
            <>
              <span className="text-muted-foreground">·</span>
              <span className={`font-bold ${dayEndBalance[sortedDays[0]] >= 0 ? "" : "text-red-600 dark:text-red-400"}`}>
                Saldo final: {formatCurrency(dayEndBalance[sortedDays[0]], "ARS")}
              </span>
            </>
          )}
        </div>

        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => exportToPDF(transactions, filters)}>
            <Download className="h-3.5 w-3.5 mr-1" /> PDF
          </Button>
          <Button variant="outline" size="sm" onClick={() => exportToExcel(transactions)}>
            <Download className="h-3.5 w-3.5 mr-1" /> Excel
          </Button>
          <Button variant="outline" size="sm" onClick={() => exportToCSV(transactions)}>
            <Download className="h-3.5 w-3.5 mr-1" /> CSV
          </Button>
        </div>
      </div>

      {/* Transaction list grouped by day */}
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
                <div className="flex items-center justify-between mb-3 sticky top-0 bg-background py-1">
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
                  <CardContent className="p-0 divide-y">
                    {dayTxs.map((t) => (
                      <div key={t.id} className="flex items-center gap-3 p-4 hover:bg-muted/30 transition-colors group">
                        {/* Icon */}
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
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <span>{t.account?.nombre}</span>
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
                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
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
