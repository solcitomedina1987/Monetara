"use client";

import { useState, useCallback, useMemo } from "react";
import { format, subMonths, startOfMonth, endOfMonth } from "date-fns";
import { es } from "date-fns/locale";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  PieChart, Pie, Cell, ResponsiveContainer, LineChart, Line,
} from "recharts";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { formatCurrency } from "@/lib/utils";
import {
  groupSmallSlices,
  groupSmallTagSlices,
  type ExpenseEntry,
  type TagExpenseEntry,
  type GroupedExpenseEntry,
  type GroupedTagExpenseEntry,
} from "@/lib/expense-chart-grouping";
import { exportToPDF, exportToExcel, exportToCSV } from "@/lib/export";
import { getTransactions, getExpensesByCategory, getExpensesByTag } from "@/app/actions/transactions";
import { toast } from "@/hooks/use-toast";
import type { Account, TransactionWithRelations, TransactionFilters } from "@/lib/types";

const CHART_COLORS = [
  "#3b82f6", "#ef4444", "#10b981", "#f59e0b", "#8b5cf6",
  "#ec4899", "#06b6d4", "#84cc16", "#f97316", "#6366f1",
];

interface Props {
  initialTransactions: TransactionWithRelations[];
  initialExpensesByCategory: ExpenseEntry[];
  initialExpensesByTag: TagExpenseEntry[];
  accounts: Account[];
}

type DistribMode = "categoria" | "etiqueta";

export function ReportsClient({
  initialTransactions,
  initialExpensesByCategory,
  initialExpensesByTag,
  accounts,
}: Props) {
  const [transactions, setTransactions] = useState(initialTransactions);
  const [expensesByCategory, setExpensesByCategory] = useState(initialExpensesByCategory);
  const [expensesByTag, setExpensesByTag] = useState(initialExpensesByTag);
  const [filters, setFilters] = useState<TransactionFilters>({ periodo: "mes_actual" });
  const [loading, setLoading] = useState(false);
  const [distribMode, setDistribMode] = useState<DistribMode>("categoria");

  const applyFilters = useCallback(async (newFilters: TransactionFilters) => {
    setLoading(true);
    try {
      const [data, byCat, byTag] = await Promise.all([
        getTransactions(newFilters),
        getExpensesByCategory(newFilters),
        getExpensesByTag(newFilters),
      ]);
      setTransactions(data);
      setExpensesByCategory(byCat);
      setExpensesByTag(byTag);
      setFilters(newFilters);
    } catch (err: any) {
      toast({ variant: "destructive", title: "Error", description: err.message });
    } finally {
      setLoading(false);
    }
  }, []);

  const groupedCategory = useMemo(
    () => groupSmallSlices(expensesByCategory),
    [expensesByCategory]
  );
  const groupedTag = useMemo(
    () => groupSmallTagSlices(expensesByTag),
    [expensesByTag]
  );

  const pieData: (GroupedExpenseEntry | GroupedTagExpenseEntry)[] =
    distribMode === "categoria" ? groupedCategory : groupedTag;

  const chartTotal = useMemo(
    () => pieData.reduce((s, x) => s + x.value, 0),
    [pieData]
  );

  const displayCurrency = accounts.find((a) => a.id === filters.account_id)?.moneda ?? "ARS";

  const CustomPieTooltip = ({ active, payload }: any) => {
    if (!active || !payload?.length) return null;
    const v = Number(payload[0].value);
    return (
      <div className="max-w-[min(100vw-2rem,18rem)] rounded-md border bg-background p-2 shadow-md text-xs break-words">
        <p className="font-medium leading-snug">{payload[0].name}</p>
        <p className="tabular-nums">{formatCurrency(v, displayCurrency)}</p>
        {chartTotal > 0 && (
          <p className="text-muted-foreground">{((v / chartTotal) * 100).toFixed(1)}% del gráfico</p>
        )}
      </div>
    );
  };

  // Ingresos vs gastos por día
  const dailyData: Record<string, { ingresos: number; gastos: number }> = {};
  transactions.forEach((t) => {
    if (!dailyData[t.fecha]) dailyData[t.fecha] = { ingresos: 0, gastos: 0 };
    if (t.tipo === "ingreso") dailyData[t.fecha].ingresos += Number(t.monto);
    if (t.tipo === "gasto") dailyData[t.fecha].gastos += Number(t.monto);
  });
  const barData = Object.entries(dailyData)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([fecha, data]) => ({ fecha: format(new Date(fecha + "T12:00:00"), "dd/MM"), ...data }));

  // Tendencia mensual (últimos 6 meses)
  const monthlyData = Array.from({ length: 6 }, (_, i) => {
    const month = subMonths(new Date(), 5 - i);
    const monthStart = format(startOfMonth(month), "yyyy-MM-dd");
    const monthEnd = format(endOfMonth(month), "yyyy-MM-dd");
    const monthTxs = transactions.filter((t) => t.fecha >= monthStart && t.fecha <= monthEnd);
    return {
      mes: format(month, "MMM", { locale: es }),
      ingresos: monthTxs.filter((t) => t.tipo === "ingreso").reduce((s, t) => s + Number(t.monto), 0),
      gastos: monthTxs.filter((t) => t.tipo === "gasto").reduce((s, t) => s + Number(t.monto), 0),
    };
  });

  const totalIngresos = transactions.filter((t) => t.tipo === "ingreso").reduce((s, t) => s + Number(t.monto), 0);
  const totalGastos = transactions.filter((t) => t.tipo === "gasto").reduce((s, t) => s + Number(t.monto), 0);

  const chartMargins = { top: 8, right: 8, bottom: 8, left: 0 } as const;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold">Reportes</h1>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            className="min-h-11 sm:min-h-9 touch-manipulation"
            onClick={() => exportToPDF(transactions, filters)}
          >
            <Download className="h-3.5 w-3.5 mr-1 shrink-0" /> PDF
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="min-h-11 sm:min-h-9 touch-manipulation"
            onClick={() => exportToExcel(transactions)}
          >
            <Download className="h-3.5 w-3.5 mr-1 shrink-0" /> Excel
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="min-h-11 sm:min-h-9 touch-manipulation"
            onClick={() => exportToCSV(transactions)}
          >
            <Download className="h-3.5 w-3.5 mr-1 shrink-0" /> CSV
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="grid gap-4 sm:grid-cols-4">
            <div className="space-y-1">
              <Label className="text-xs">Período</Label>
              <Select value={filters.periodo ?? "mes_actual"} onValueChange={(v) => applyFilters({ ...filters, periodo: v as any })}>
                <SelectTrigger className="h-11 sm:h-8 text-xs touch-manipulation">
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
                    className="h-11 sm:h-8 text-xs touch-manipulation"
                    value={filters.fechaDesde ?? ""}
                    onChange={(e) => applyFilters({ ...filters, fechaDesde: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Hasta</Label>
                  <Input
                    type="date"
                    className="h-11 sm:h-8 text-xs touch-manipulation"
                    value={filters.fechaHasta ?? ""}
                    onChange={(e) => applyFilters({ ...filters, fechaHasta: e.target.value })}
                  />
                </div>
              </>
            )}
            <div className="space-y-1">
              <Label className="text-xs">Cuenta</Label>
              <Select value={filters.account_id ?? "todas"} onValueChange={(v) => applyFilters({ ...filters, account_id: v === "todas" ? undefined : v })}>
                <SelectTrigger className="h-11 sm:h-8 text-xs touch-manipulation">
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
          </div>
        </CardContent>
      </Card>

      {/* Summary KPIs */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="pt-6">
            <p className="text-xs text-muted-foreground mb-1">Total Ingresos</p>
            <p className="text-2xl font-bold text-green-600 dark:text-green-400">
              {formatCurrency(totalIngresos, displayCurrency)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-xs text-muted-foreground mb-1">Total Gastos</p>
            <p className="text-2xl font-bold text-red-600 dark:text-red-400">
              {formatCurrency(totalGastos, displayCurrency)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-xs text-muted-foreground mb-1">Balance</p>
            <p className={`text-2xl font-bold ${totalIngresos - totalGastos >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>
              {formatCurrency(totalIngresos - totalGastos, displayCurrency)}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <Tabs defaultValue="categories">
        <TabsList className="min-h-11 h-auto flex-wrap gap-1 sm:min-h-10">
          <TabsTrigger value="categories" className="min-h-11 px-3 sm:min-h-9 touch-manipulation">
            Distribución
          </TabsTrigger>
          <TabsTrigger value="daily" className="min-h-11 px-3 sm:min-h-9 touch-manipulation">
            Por Día
          </TabsTrigger>
          <TabsTrigger value="monthly" className="min-h-11 px-3 sm:min-h-9 touch-manipulation">
            Tendencia
          </TabsTrigger>
        </TabsList>

        <TabsContent value="categories" className="mt-4">
          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader className="space-y-3">
                <CardTitle className="text-base">Distribución de Gastos</CardTitle>
                <div
                  role="tablist"
                  aria-label="Agrupar distribución"
                  className="grid h-auto min-h-11 w-full grid-cols-2 gap-1 rounded-md bg-muted p-1 sm:min-h-9"
                >
                  <button
                    type="button"
                    role="tab"
                    aria-selected={distribMode === "categoria"}
                    className={`inline-flex min-h-11 touch-manipulation items-center justify-center rounded-sm px-2 text-xs font-medium transition-colors sm:min-h-8 ${
                      distribMode === "categoria" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"
                    }`}
                    onClick={() => setDistribMode("categoria")}
                  >
                    Categorías
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={distribMode === "etiqueta"}
                    className={`inline-flex min-h-11 touch-manipulation items-center justify-center rounded-sm px-2 text-xs font-medium transition-colors sm:min-h-8 ${
                      distribMode === "etiqueta" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"
                    }`}
                    onClick={() => setDistribMode("etiqueta")}
                  >
                    Etiquetas
                  </button>
                </div>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">Cargando…</div>
                ) : pieData.length === 0 ? (
                  <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
                    {distribMode === "etiqueta" ? "Sin gastos con etiquetas en el período" : "Sin datos"}
                  </div>
                ) : (
                  <div className="w-full min-h-[280px] sm:min-h-[300px]">
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
                          formatter={(value) => <span className="text-[11px] leading-tight break-words">{value}</span>}
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
                  {pieData.length === 0 && !loading && (
                    <p className="text-sm text-muted-foreground">Sin datos para este período.</p>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="daily" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Ingresos vs Gastos por Día</CardTitle>
            </CardHeader>
            <CardContent>
              {barData.length === 0 ? (
                <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">Sin datos</div>
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
                    <Bar dataKey="ingresos" name="Ingresos" fill="#10b981" radius={[3, 3, 0, 0]} />
                    <Bar dataKey="gastos" name="Gastos" fill="#ef4444" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="monthly" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Tendencia Últimos 6 Meses</CardTitle>
            </CardHeader>
            <CardContent>
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
                  <Line type="monotone" dataKey="ingresos" name="Ingresos" stroke="#10b981" strokeWidth={2} dot={{ r: 4 }} />
                  <Line type="monotone" dataKey="gastos" name="Gastos" stroke="#ef4444" strokeWidth={2} dot={{ r: 4 }} />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
