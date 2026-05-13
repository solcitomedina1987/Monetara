"use client";

import { useState, useCallback, useMemo, useEffect } from "react";
import {
  format,
  parseISO,
  eachMonthOfInterval,
  startOfMonth,
  endOfMonth,
} from "date-fns";
import { es } from "date-fns/locale";
import * as LucideIcons from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  LineChart,
  Line,
} from "recharts";
import { Download, FolderOpen, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { formatCurrency, cn } from "@/lib/utils";
import {
  groupSmallSlices,
  groupSmallTagSlices,
  type ExpenseEntry,
  type TagExpenseEntry,
  type GroupedExpenseEntry,
  type GroupedTagExpenseEntry,
} from "@/lib/expense-chart-grouping";
import { exportToPDF, exportToExcel, exportToCSV } from "@/lib/export";
import { getTransactions } from "@/app/actions/transactions";
import { toast } from "@/hooks/use-toast";
import { getPeriodDates } from "@/lib/transaction-period";
import {
  TX_FILTER_KEY,
  DEFAULT_TRANSACTION_FILTERS,
  normalizeStoredTransactionFilters,
  persistTransactionFilters,
} from "@/lib/transaction-filters";
import { TransactionFiltersBar } from "@/components/transactions/transaction-filters-bar";
import type {
  Account,
  Category,
  Tag,
  TransactionWithRelations,
  TransactionFilters,
} from "@/lib/types";

const CHART_COLORS = [
  "#3b82f6",
  "#ef4444",
  "#10b981",
  "#f59e0b",
  "#8b5cf6",
  "#ec4899",
  "#06b6d4",
  "#84cc16",
  "#f97316",
  "#6366f1",
];

const EMPTY_CHART_MESSAGE = "No hay datos para esta combinación de filtros";

function DynamicCategoryIcon({
  iconName,
  className,
}: {
  iconName: string | null | undefined;
  className?: string;
}) {
  const cls = className ?? "h-3.5 w-3.5";
  if (!iconName) return <FolderOpen className={cls} />;
  const IconComponent = (LucideIcons as any)[iconName] as React.ElementType<{ className?: string }>;
  if (!IconComponent) return <FolderOpen className={cls} />;
  return <IconComponent className={cls} />;
}

function buildCategorySlices(
  txs: TransactionWithRelations[],
  tipo: "ingreso" | "gasto"
): ExpenseEntry[] {
  const grouped: Record<string, { value: number; category_id: string | null }> = {};
  for (const t of txs) {
    if (t.tipo !== tipo) continue;
    const name = t.category?.nombre ?? "Sin categoría";
    const cid = t.category_id ?? null;
    if (!grouped[name]) grouped[name] = { value: 0, category_id: cid };
    grouped[name].value += Number(t.monto);
  }
  return Object.entries(grouped)
    .map(([name, { value, category_id }]) => ({ name, value, category_id }))
    .sort((a, b) => b.value - a.value);
}

function buildTagSlices(txs: TransactionWithRelations[], tipo: "ingreso" | "gasto"): TagExpenseEntry[] {
  const grouped: Record<string, { value: number; tag_id: string | null }> = {};
  let untagged = 0;

  for (const t of txs) {
    if (t.tipo !== tipo) continue;
    const tags = t.tags ?? [];
    if (tags.length === 0) {
      untagged += Number(t.monto);
    } else {
      for (const tag of tags) {
        if (!grouped[tag.nombre]) grouped[tag.nombre] = { value: 0, tag_id: tag.id };
        grouped[tag.nombre].value += Number(t.monto);
      }
    }
  }

  const result = Object.entries(grouped)
    .map(([name, { value, tag_id }]) => ({ name, value, tag_id }))
    .sort((a, b) => b.value - a.value);

  if (untagged > 0) {
    result.push({ name: "Sin etiqueta", value: untagged, tag_id: null });
  }
  return result;
}

function chartBoundsFromFilters(
  filters: TransactionFilters,
  txs: TransactionWithRelations[]
): { from: Date; to: Date } {
  const range = getPeriodDates(filters);
  const now = new Date();
  if (range) {
    return { from: parseISO(range[0]), to: parseISO(range[1]) };
  }
  if (txs.length === 0) {
    const m = startOfMonth(now);
    return { from: m, to: now };
  }
  const minStr = txs.reduce((m, t) => (t.fecha < m ? t.fecha : m), txs[0].fecha);
  const maxStr = txs.reduce((m, t) => (t.fecha > m ? t.fecha : m), txs[0].fecha);
  return { from: parseISO(minStr), to: parseISO(maxStr) };
}

interface Props {
  initialTransactions: TransactionWithRelations[];
  accounts: Account[];
  categories: Category[];
  tags: Tag[];
}

type DistribMode = "categoria" | "etiqueta";

export function ReportsClient({
  initialTransactions,
  accounts,
  categories,
  tags,
}: Props) {
  const [transactions, setTransactions] = useState(initialTransactions);
  const [filters, setFilters] = useState<TransactionFilters>(DEFAULT_TRANSACTION_FILTERS);
  const [loading, setLoading] = useState(false);
  const [distribMode, setDistribMode] = useState<DistribMode>("categoria");
  /** Cuando ingresos y gastos están activos, la torta muestra uno u otro. */
  const [pieTipo, setPieTipo] = useState<"gasto" | "ingreso">("gasto");

  const applyFilters = useCallback(async (newFilters: TransactionFilters) => {
    setLoading(true);
    try {
      const data = await getTransactions(newFilters);
      setTransactions(data);
      setFilters(newFilters);
      persistTransactionFilters(newFilters);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Error desconocido";
      toast({ variant: "destructive", title: "Error", description: message });
    } finally {
      setLoading(false);
    }
  }, []);

  const clearFilters = useCallback(() => {
    try {
      localStorage.removeItem(TX_FILTER_KEY);
    } catch {
      /* ignore */
    }
    applyFilters({ ...DEFAULT_TRANSACTION_FILTERS });
  }, [applyFilters]);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(TX_FILTER_KEY);
      if (stored) {
        applyFilters(normalizeStoredTransactionFilters(JSON.parse(stored)));
      }
    } catch {
      /* ignore */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const showIngresos = filters.showIngresos !== false;
  const showGastos = filters.showGastos !== false;

  const resolvedPieTipo: "ingreso" | "gasto" = !showGastos
    ? "ingreso"
    : !showIngresos
      ? "gasto"
      : pieTipo;

  const categorySlices = useMemo(
    () => buildCategorySlices(transactions, resolvedPieTipo),
    [transactions, resolvedPieTipo]
  );
  const tagSlices = useMemo(
    () => buildTagSlices(transactions, resolvedPieTipo),
    [transactions, resolvedPieTipo]
  );

  const groupedCategory = useMemo(() => groupSmallSlices(categorySlices), [categorySlices]);
  const groupedTag = useMemo(() => groupSmallTagSlices(tagSlices), [tagSlices]);

  const pieData: (GroupedExpenseEntry | GroupedTagExpenseEntry)[] =
    distribMode === "categoria" ? groupedCategory : groupedTag;

  const chartTotal = useMemo(() => pieData.reduce((s, x) => s + x.value, 0), [pieData]);

  const displayCurrency =
    accounts.find((a) => a.id === filters.account_id)?.moneda ?? "ARS";

  const selectedCategory = categories.find((c) => c.id === filters.category_id);

  const barData = useMemo(() => {
    const daily: Record<string, { ingresos: number; gastos: number }> = {};
    const singleCategory = Boolean(filters.category_id);

    for (const t of transactions) {
      if (t.tipo === "transferencia") continue;
      if (singleCategory && t.category_id !== filters.category_id) continue;

      if (!daily[t.fecha]) daily[t.fecha] = { ingresos: 0, gastos: 0 };
      if (t.tipo === "ingreso" && showIngresos) {
        daily[t.fecha].ingresos += Number(t.monto);
      }
      if (t.tipo === "gasto" && showGastos) {
        daily[t.fecha].gastos += Number(t.monto);
      }
    }

    return Object.entries(daily)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([fecha, data]) => ({
        fecha: format(parseISO(`${fecha}T12:00:00`), "dd/MM"),
        ...data,
      }));
  }, [transactions, filters.category_id, showIngresos, showGastos]);

  const monthlyData = useMemo(() => {
    let { from, to } = chartBoundsFromFilters(filters, transactions);
    if (from > to) {
      const swap = from;
      from = to;
      to = swap;
    }
    const start = startOfMonth(from);
    const end = endOfMonth(to);
    const months = eachMonthOfInterval({ start, end });

    return months.map((month) => {
      const monthStart = format(startOfMonth(month), "yyyy-MM-dd");
      const monthEnd = format(endOfMonth(month), "yyyy-MM-dd");
      const monthTxs = transactions.filter((t) => t.fecha >= monthStart && t.fecha <= monthEnd);
      return {
        mes: format(month, "MMM yy", { locale: es }),
        ingresos: monthTxs
          .filter((t) => t.tipo === "ingreso" && showIngresos)
          .reduce((s, t) => s + Number(t.monto), 0),
        gastos: monthTxs
          .filter((t) => t.tipo === "gasto" && showGastos)
          .reduce((s, t) => s + Number(t.monto), 0),
      };
    });
  }, [transactions, filters, showIngresos, showGastos]);

  const totalIngresos = useMemo(
    () =>
      transactions
        .filter((t) => t.tipo === "ingreso" && showIngresos)
        .reduce((s, t) => s + Number(t.monto), 0),
    [transactions, showIngresos]
  );
  const totalGastos = useMemo(
    () =>
      transactions
        .filter((t) => t.tipo === "gasto" && showGastos)
        .reduce((s, t) => s + Number(t.monto), 0),
    [transactions, showGastos]
  );

  const hasPieData = chartTotal > 0;
  const hasBarData = useMemo(
    () => barData.some((d) => d.ingresos > 0 || d.gastos > 0),
    [barData]
  );
  const hasTrendData = useMemo(
    () => monthlyData.some((d) => d.ingresos > 0 || d.gastos > 0),
    [monthlyData]
  );

  const CustomPieTooltip = ({ active, payload }: { active?: boolean; payload?: Array<{ name: string; value: number }> }) => {
    if (!active || !payload?.length) return null;
    const v = Number(payload[0].value);
    return (
      <div className="max-w-[min(100vw-2rem,18rem)] rounded-md border bg-background p-2 text-xs shadow-md break-words">
        <p className="font-medium leading-snug">{payload[0].name}</p>
        <p className="tabular-nums">{formatCurrency(v, displayCurrency)}</p>
        {chartTotal > 0 && (
          <p className="text-muted-foreground">{((v / chartTotal) * 100).toFixed(1)}% del gráfico</p>
        )}
      </div>
    );
  };

  const chartAnim = { isAnimationActive: true, animationDuration: 420, animationEasing: "ease-out" as const };
  const chartMargins = { top: 8, right: 8, bottom: 8, left: 0 } as const;

  const pieTitle =
    resolvedPieTipo === "gasto" ? "Distribución de gastos" : "Distribución de ingresos";

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold">Reportes</h1>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            className="min-h-11 touch-manipulation sm:min-h-9"
            onClick={() => exportToPDF(transactions, filters)}
          >
            <Download className="mr-1 h-3.5 w-3.5 shrink-0" /> PDF
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="min-h-11 touch-manipulation sm:min-h-9"
            onClick={() => exportToExcel(transactions)}
          >
            <Download className="mr-1 h-3.5 w-3.5 shrink-0" /> Excel
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="min-h-11 touch-manipulation sm:min-h-9"
            onClick={() => exportToCSV(transactions)}
          >
            <Download className="mr-1 h-3.5 w-3.5 shrink-0" /> CSV
          </Button>
        </div>
      </div>

      <TransactionFiltersBar
        filters={filters}
        onFiltersChange={applyFilters}
        onClear={clearFilters}
        accounts={accounts}
        categories={categories}
        tags={tags}
        idPrefix="rep-filtro"
        filtersRowClassName="lg:flex-nowrap lg:gap-2 xl:overflow-x-auto"
      />

      {loading && (
        <div className="flex items-center justify-center gap-2 py-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Actualizando datos…
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="pt-6">
            <p className="mb-1 text-xs text-muted-foreground">Total Ingresos</p>
            <p className="text-2xl font-bold text-green-600 dark:text-green-400">
              {formatCurrency(totalIngresos, displayCurrency)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="mb-1 text-xs text-muted-foreground">Total Gastos</p>
            <p className="text-2xl font-bold text-red-600 dark:text-red-400">
              {formatCurrency(totalGastos, displayCurrency)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="mb-1 text-xs text-muted-foreground">Balance</p>
            <p
              className={`text-2xl font-bold ${
                totalIngresos - totalGastos >= 0
                  ? "text-green-600 dark:text-green-400"
                  : "text-red-600 dark:text-red-400"
              }`}
            >
              {formatCurrency(totalIngresos - totalGastos, displayCurrency)}
            </p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="categories">
        <TabsList className="h-auto min-h-11 flex-wrap gap-1 sm:min-h-10">
          <TabsTrigger value="categories" className="min-h-11 touch-manipulation px-3 sm:min-h-9">
            Distribución
          </TabsTrigger>
          <TabsTrigger value="daily" className="min-h-11 touch-manipulation px-3 sm:min-h-9">
            Por Día
          </TabsTrigger>
          <TabsTrigger value="monthly" className="min-h-11 touch-manipulation px-3 sm:min-h-9">
            Tendencia
          </TabsTrigger>
        </TabsList>

        <TabsContent value="categories" className="mt-4">
          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader className="space-y-3">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <CardTitle className="text-base">{pieTitle}</CardTitle>
                  {showIngresos && showGastos && (
                    <div
                      role="tablist"
                      aria-label="Tipo de distribución"
                      className="grid h-auto min-h-11 w-full max-w-[14rem] grid-cols-2 gap-1 rounded-md bg-muted p-1 sm:min-h-9"
                    >
                      <button
                        type="button"
                        role="tab"
                        aria-selected={pieTipo === "gasto"}
                        className={cn(
                          "inline-flex min-h-11 touch-manipulation items-center justify-center rounded-sm px-2 text-xs font-medium transition-colors sm:min-h-8",
                          pieTipo === "gasto"
                            ? "bg-background text-foreground shadow-sm"
                            : "text-muted-foreground"
                        )}
                        onClick={() => setPieTipo("gasto")}
                      >
                        Gastos
                      </button>
                      <button
                        type="button"
                        role="tab"
                        aria-selected={pieTipo === "ingreso"}
                        className={cn(
                          "inline-flex min-h-11 touch-manipulation items-center justify-center rounded-sm px-2 text-xs font-medium transition-colors sm:min-h-8",
                          pieTipo === "ingreso"
                            ? "bg-background text-foreground shadow-sm"
                            : "text-muted-foreground"
                        )}
                        onClick={() => setPieTipo("ingreso")}
                      >
                        Ingresos
                      </button>
                    </div>
                  )}
                </div>
                <div
                  role="tablist"
                  aria-label="Agrupar distribución"
                  className="grid h-auto min-h-11 w-full grid-cols-2 gap-1 rounded-md bg-muted p-1 sm:min-h-9"
                >
                  <button
                    type="button"
                    role="tab"
                    aria-selected={distribMode === "categoria"}
                    className={cn(
                      "inline-flex min-h-11 touch-manipulation items-center justify-center rounded-sm px-2 text-xs font-medium transition-colors sm:min-h-8",
                      distribMode === "categoria"
                        ? "bg-background text-foreground shadow-sm"
                        : "text-muted-foreground"
                    )}
                    onClick={() => setDistribMode("categoria")}
                  >
                    Categorías
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={distribMode === "etiqueta"}
                    className={cn(
                      "inline-flex min-h-11 touch-manipulation items-center justify-center rounded-sm px-2 text-xs font-medium transition-colors sm:min-h-8",
                      distribMode === "etiqueta"
                        ? "bg-background text-foreground shadow-sm"
                        : "text-muted-foreground"
                    )}
                    onClick={() => setDistribMode("etiqueta")}
                  >
                    Etiquetas
                  </button>
                </div>
              </CardHeader>
              <CardContent>
                {!hasPieData ? (
                  <div className="flex h-64 items-center justify-center px-4 text-center text-sm text-muted-foreground">
                    {EMPTY_CHART_MESSAGE}
                  </div>
                ) : (
                  <div className="relative w-full min-h-[280px] sm:min-h-[300px]">
                    <ResponsiveContainer width="100%" height={300}>
                      <PieChart margin={{ top: 4, right: 4, bottom: 4, left: 4 }}>
                        <Pie
                          data={pieData}
                          cx="50%"
                          cy="42%"
                          innerRadius="28%"
                          outerRadius="42%"
                          paddingAngle={3}
                          dataKey="value"
                          {...chartAnim}
                        >
                          {pieData.map((_, i) => (
                            <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip content={<CustomPieTooltip />} />
                        <Legend
                          verticalAlign="bottom"
                          layout="horizontal"
                          wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
                          formatter={(value) => (
                            <span className="break-words text-[11px] leading-tight">{value}</span>
                          )}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  {distribMode === "categoria" ? "Ranking por categoría" : "Ranking por etiqueta"}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {!hasPieData ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">{EMPTY_CHART_MESSAGE}</p>
                ) : (
                  <div className="space-y-3">
                    {pieData.slice(0, 8).map((item, i) => (
                      <div key={item.name} className="flex items-center gap-3">
                        <div
                          className="h-3 w-3 shrink-0 rounded-full"
                          style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2 text-sm">
                            <span className="truncate">{item.name}</span>
                            <span className="ml-2 shrink-0 font-medium tabular-nums">
                              {formatCurrency(item.value, displayCurrency)}
                            </span>
                          </div>
                          <div className="mt-1 h-1.5 rounded-full bg-muted">
                            <div
                              className="h-full rounded-full"
                              style={{
                                width: chartTotal > 0 ? `${(item.value / chartTotal) * 100}%` : "0%",
                                backgroundColor: CHART_COLORS[i % CHART_COLORS.length],
                              }}
                            />
                          </div>
                        </div>
                        <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                          {chartTotal > 0 ? `${((item.value / chartTotal) * 100).toFixed(1)}%` : "—"}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="daily" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                {filters.category_id && selectedCategory
                  ? `Actividad por día — ${selectedCategory.nombre}`
                  : "Ingresos vs gastos por día"}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {!hasBarData ? (
                <div className="flex h-64 items-center justify-center px-4 text-center text-sm text-muted-foreground">
                  {EMPTY_CHART_MESSAGE}
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={320}>
                  <BarChart data={barData} margin={chartMargins}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="fecha" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
                    <YAxis tick={{ fontSize: 11 }} width={44} />
                    <Tooltip
                      formatter={(v) => formatCurrency(Number(v ?? 0), displayCurrency)}
                      contentStyle={{ fontSize: 12, maxWidth: "min(100vw - 2rem, 20rem)" }}
                    />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Bar
                      dataKey="ingresos"
                      name="Ingresos"
                      fill="#10b981"
                      radius={[3, 3, 0, 0]}
                      {...chartAnim}
                    />
                    <Bar
                      dataKey="gastos"
                      name="Gastos"
                      fill="#ef4444"
                      radius={[3, 3, 0, 0]}
                      {...chartAnim}
                    />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="monthly" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Tendencia en el período</CardTitle>
            </CardHeader>
            <CardContent>
              {!hasTrendData ? (
                <div className="flex h-64 items-center justify-center px-4 text-center text-sm text-muted-foreground">
                  {EMPTY_CHART_MESSAGE}
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={320}>
                  <LineChart data={monthlyData} margin={chartMargins}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="mes" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
                    <YAxis tick={{ fontSize: 11 }} width={44} />
                    <Tooltip
                      formatter={(v) => formatCurrency(Number(v ?? 0), displayCurrency)}
                      contentStyle={{ fontSize: 12, maxWidth: "min(100vw - 2rem, 20rem)" }}
                    />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Line
                      type="monotone"
                      dataKey="ingresos"
                      name="Ingresos"
                      stroke="#10b981"
                      strokeWidth={2}
                      dot={{ r: 4 }}
                      {...chartAnim}
                    />
                    <Line
                      type="monotone"
                      dataKey="gastos"
                      name="Gastos"
                      stroke="#ef4444"
                      strokeWidth={2}
                      dot={{ r: 4 }}
                      {...chartAnim}
                    />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
