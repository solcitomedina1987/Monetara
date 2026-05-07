"use client";

import { useState, useCallback } from "react";
import { format, subMonths, startOfMonth, endOfMonth } from "date-fns";
import { es } from "date-fns/locale";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  PieChart, Pie, Cell, ResponsiveContainer, LineChart, Line,
} from "recharts";
import { Download, BarChart3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { formatCurrency } from "@/lib/utils";
import { exportToPDF, exportToExcel, exportToCSV } from "@/lib/export";
import { getTransactions } from "@/app/actions/transactions";
import { toast } from "@/hooks/use-toast";
import type { Account, Category, TransactionWithRelations, TransactionFilters } from "@/lib/types";

const CHART_COLORS = ["#3b82f6","#ef4444","#10b981","#f59e0b","#8b5cf6","#ec4899","#06b6d4","#84cc16","#f97316","#6366f1"];

interface Props {
  initialTransactions: TransactionWithRelations[];
  accounts: Account[];
  categories: Category[];
}

export function ReportsClient({ initialTransactions, accounts, categories }: Props) {
  const [transactions, setTransactions] = useState(initialTransactions);
  const [filters, setFilters] = useState<TransactionFilters>({ periodo: "mes_actual" });
  const [loading, setLoading] = useState(false);

  const applyFilters = useCallback(async (newFilters: TransactionFilters) => {
    setLoading(true);
    try {
      const data = await getTransactions(newFilters);
      setTransactions(data);
      setFilters(newFilters);
    } catch (err: any) {
      toast({ variant: "destructive", title: "Error", description: err.message });
    } finally {
      setLoading(false);
    }
  }, []);

  // Gastos por categoría
  const expensesByCategory: Record<string, number> = {};
  transactions.filter((t) => t.tipo === "gasto").forEach((t) => {
    const name = t.category?.nombre ?? "Sin categoría";
    expensesByCategory[name] = (expensesByCategory[name] ?? 0) + Number(t.monto);
  });
  const pieData = Object.entries(expensesByCategory)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);

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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Reportes</h1>
          <p className="text-sm text-muted-foreground">Análisis de tus finanzas</p>
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

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="grid gap-4 sm:grid-cols-4">
            <div className="space-y-1">
              <Label className="text-xs">Período</Label>
              <Select value={filters.periodo ?? "mes_actual"} onValueChange={(v) => applyFilters({ ...filters, periodo: v as any })}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
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
                  <Input type="date" className="h-8 text-xs" value={filters.fechaDesde ?? ""} onChange={(e) => applyFilters({ ...filters, fechaDesde: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Hasta</Label>
                  <Input type="date" className="h-8 text-xs" value={filters.fechaHasta ?? ""} onChange={(e) => applyFilters({ ...filters, fechaHasta: e.target.value })} />
                </div>
              </>
            )}
            <div className="space-y-1">
              <Label className="text-xs">Cuenta</Label>
              <Select value={filters.account_id ?? "todas"} onValueChange={(v) => applyFilters({ ...filters, account_id: v === "todas" ? undefined : v })}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todas">Todas</SelectItem>
                  {accounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.nombre}</SelectItem>)}
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
            <p className="text-2xl font-bold text-green-600 dark:text-green-400">{formatCurrency(totalIngresos)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-xs text-muted-foreground mb-1">Total Gastos</p>
            <p className="text-2xl font-bold text-red-600 dark:text-red-400">{formatCurrency(totalGastos)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-xs text-muted-foreground mb-1">Balance</p>
            <p className={`text-2xl font-bold ${totalIngresos - totalGastos >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>
              {formatCurrency(totalIngresos - totalGastos)}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <Tabs defaultValue="categories">
        <TabsList>
          <TabsTrigger value="categories">Por Categoría</TabsTrigger>
          <TabsTrigger value="daily">Por Día</TabsTrigger>
          <TabsTrigger value="monthly">Tendencia</TabsTrigger>
        </TabsList>

        <TabsContent value="categories" className="mt-4">
          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Distribución de Gastos</CardTitle>
                <CardDescription>Gráfico de dona por categoría</CardDescription>
              </CardHeader>
              <CardContent>
                {pieData.length === 0 ? (
                  <div className="flex items-center justify-center h-64 text-muted-foreground text-sm">Sin datos</div>
                ) : (
                  <ResponsiveContainer width="100%" height={280}>
                    <PieChart>
                      <Pie data={pieData} cx="50%" cy="50%" innerRadius={65} outerRadius={100} paddingAngle={3} dataKey="value">
                        {pieData.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                      </Pie>
                      <Tooltip formatter={(v: any) => formatCurrency(Number(v))} />
                      <Legend formatter={(v) => <span className="text-xs">{v}</span>} />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Ranking de Gastos</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {pieData.slice(0, 8).map((item, i) => (
                    <div key={item.name} className="flex items-center gap-3">
                      <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between text-sm">
                          <span className="truncate">{item.name}</span>
                          <span className="font-medium shrink-0 ml-2">{formatCurrency(item.value)}</span>
                        </div>
                        <div className="h-1.5 rounded-full bg-muted mt-1">
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${(item.value / totalGastos) * 100}%`,
                              backgroundColor: CHART_COLORS[i % CHART_COLORS.length],
                            }}
                          />
                        </div>
                      </div>
                      <span className="text-xs text-muted-foreground shrink-0">
                        {((item.value / totalGastos) * 100).toFixed(1)}%
                      </span>
                    </div>
                  ))}
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
                <div className="flex items-center justify-center h-64 text-muted-foreground text-sm">Sin datos</div>
              ) : (
                <ResponsiveContainer width="100%" height={320}>
                  <BarChart data={barData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="fecha" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(v: any) => formatCurrency(Number(v))} />
                    <Legend />
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
                <LineChart data={monthlyData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v: any) => formatCurrency(Number(v))} />
                  <Legend />
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
