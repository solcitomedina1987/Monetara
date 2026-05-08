"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { format, startOfMonth, endOfMonth, subMonths } from "date-fns";
import { es } from "date-fns/locale";
import {
  ArrowUpCircle, ArrowDownCircle, ArrowLeftRight, TrendingUp,
  TrendingDown, Wallet, RefreshCw, Scale, Maximize2, X,
} from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from "recharts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatCurrency } from "@/lib/utils";
import { getDashboardStats, getExpensesByCategory, getTransactions, getTotalBalance } from "@/app/actions/transactions";
import type { Account, TransactionWithRelations, DashboardPeriod, TransactionFilters } from "@/lib/types";

const CHART_COLORS = [
  "#3b82f6", "#ef4444", "#10b981", "#f59e0b", "#8b5cf6",
  "#ec4899", "#06b6d4", "#84cc16", "#f97316", "#6366f1",
  "#64748b",
];

const PERIOD_LABELS: Record<DashboardPeriod, string> = {
  mes_actual:      "Mes actual",
  mes_anterior:    "Mes anterior",
  ultimos_3_meses: "Últimos 3 meses",
  año_actual:      "Año actual",
  ultimo_año:      "Último año",
  personalizado:   "Período personalizado",
};

function getDefaultCustomDates() {
  const now = new Date();
  const lastMonth = subMonths(now, 1);
  return {
    desde: format(startOfMonth(lastMonth), "yyyy-MM-dd"),
    hasta: format(endOfMonth(lastMonth), "yyyy-MM-dd"),
  };
}

type ExpenseEntry = { name: string; value: number; category_id: string | null };
type GroupedEntry = ExpenseEntry & { isVarios?: boolean };

/** Group categories < 5% of total into "Varios" */
function groupSmallSlices(data: ExpenseEntry[]): GroupedEntry[] {
  const total = data.reduce((s, e) => s + e.value, 0);
  if (total === 0) return data;
  const threshold = total * 0.05;
  const main: GroupedEntry[] = data.filter((e) => e.value >= threshold);
  const varios = data.filter((e) => e.value < threshold);
  if (varios.length > 0) {
    main.push({
      name: "Varios",
      value: varios.reduce((s, e) => s + e.value, 0),
      category_id: null,
      isVarios: true,
    });
  }
  return main;
}

interface DashboardClientProps {
  accounts: Account[];
  initialStats: { ingresos: number; gastos: number; balance: number };
  initialExpensesByCategory: ExpenseEntry[];
  initialTransactions: TransactionWithRelations[];
  initialTotalBalance: number;
  defaultAccountId?: string | null;
}

export function DashboardClient({
  accounts,
  initialStats,
  initialExpensesByCategory,
  initialTransactions,
  initialTotalBalance,
  defaultAccountId,
}: DashboardClientProps) {
  const router = useRouter();

  const [selectedAccount, setSelectedAccount] = useState<string>(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("finanzas_account") ?? defaultAccountId ?? "todos";
    }
    return defaultAccountId ?? "todos";
  });
  const [periodo, setPeriodo] = useState<DashboardPeriod>("mes_actual");
  const [customDates, setCustomDates] = useState(getDefaultCustomDates);

  const [stats, setStats] = useState(initialStats);
  const [expenses, setExpenses] = useState<ExpenseEntry[]>(initialExpensesByCategory);
  const [transactions, setTransactions] = useState(initialTransactions);
  const [totalBalance, setTotalBalance] = useState(initialTotalBalance);
  const [loading, setLoading] = useState(false);
  const [chartFullscreen, setChartFullscreen] = useState(false);

  // Modal-specific filters (independent from main filters)
  const [modalPeriodo, setModalPeriodo] = useState<DashboardPeriod>("mes_actual");
  const [modalAccount, setModalAccount] = useState<string>("todos");
  const [modalExpenses, setModalExpenses] = useState<ExpenseEntry[]>(initialExpensesByCategory);
  const [modalLoading, setModalLoading] = useState(false);

  const buildFilters = useCallback(
    (account: string, per: DashboardPeriod, dates: typeof customDates): TransactionFilters => ({
      periodo: per,
      account_id: account === "todos" ? undefined : account,
      ...(per === "personalizado"
        ? { fechaDesde: dates.desde, fechaHasta: dates.hasta }
        : {}),
    }),
    []
  );

  const refresh = useCallback(async (
    account = selectedAccount,
    per = periodo,
    dates = customDates,
  ) => {
    setLoading(true);
    const filters = buildFilters(account, per, dates);
    const accountId = account === "todos" ? undefined : account;
    try {
      const [newStats, newExpenses, newTx, newTotal] = await Promise.all([
        getDashboardStats(filters),
        getExpensesByCategory(filters),
        getTransactions(filters),
        getTotalBalance(accountId),
      ]);
      setStats(newStats);
      setExpenses(newExpenses);
      setTransactions(newTx);
      setTotalBalance(newTotal);
    } finally {
      setLoading(false);
    }
  }, [selectedAccount, periodo, customDates, buildFilters]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem("finanzas_account", selectedAccount);
    }
    refresh(selectedAccount, periodo, customDates);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedAccount, periodo]);

  const handleCustomDate = (key: "desde" | "hasta", value: string) => {
    const next = { ...customDates, [key]: value };
    setCustomDates(next);
    if (periodo === "personalizado") refresh(selectedAccount, "personalizado", next);
  };

  // Refresh modal chart when modal filters change
  const refreshModal = useCallback(async (account: string, per: DashboardPeriod) => {
    setModalLoading(true);
    const filters = buildFilters(account, per, customDates);
    try {
      const newExpenses = await getExpensesByCategory(filters);
      setModalExpenses(newExpenses);
    } finally {
      setModalLoading(false);
    }
  }, [buildFilters, customDates]);

  const handleOpenFullscreen = () => {
    setModalPeriodo(periodo);
    setModalAccount(selectedAccount);
    setModalExpenses(expenses);
    setChartFullscreen(true);
  };

  const handleModalPeriodoChange = (per: DashboardPeriod) => {
    setModalPeriodo(per);
    refreshModal(modalAccount, per);
  };

  const handleModalAccountChange = (acc: string) => {
    setModalAccount(acc);
    refreshModal(acc, modalPeriodo);
  };

  // Navigate to transactions filtered by category + period + account
  const navigateToTransactions = (categoryId: string | null, per: DashboardPeriod, accountId: string) => {
    const params = new URLSearchParams();
    params.set("periodo", per);
    if (accountId !== "todos") params.set("account_id", accountId);
    if (categoryId) params.set("category_id", categoryId);
    setChartFullscreen(false);
    router.push(`/transactions?${params.toString()}`);
  };

  // Group transactions by day
  const byDay = transactions.reduce((acc, t) => {
    if (!acc[t.fecha]) acc[t.fecha] = [];
    acc[t.fecha].push(t);
    return acc;
  }, {} as Record<string, TransactionWithRelations[]>);
  const sortedDays = Object.keys(byDay).sort((a, b) => b.localeCompare(a));

  const selectedAccountData = accounts.find((a) => a.id === selectedAccount);
  const currency = selectedAccountData?.moneda ?? "ARS";

  const groupedExpenses = useMemo<GroupedEntry[]>(() => groupSmallSlices(expenses), [expenses]);
  const groupedModalExpenses = useMemo<GroupedEntry[]>(() => groupSmallSlices(modalExpenses), [modalExpenses]);

  const CustomTooltip = ({ active, payload }: any) => {
    if (!active || !payload?.length) return null;
    return (
      <div className="rounded-md border bg-background p-2 shadow-md text-xs">
        <p className="font-medium">{payload[0].name}</p>
        <p>{formatCurrency(payload[0].value, currency)}</p>
      </div>
    );
  };

  const renderChart = (data: GroupedEntry[], onSliceClick?: (entry: any) => void, height = 250) => (
    <ResponsiveContainer width="100%" height={height}>
      <PieChart>
        <Pie
          data={data}
          cx="50%"
          cy="50%"
          innerRadius={height > 300 ? 80 : 60}
          outerRadius={height > 300 ? 120 : 90}
          paddingAngle={3}
          dataKey="value"
          onClick={onSliceClick}
          style={onSliceClick ? { cursor: "pointer" } : undefined}
        >
          {data.map((_, index) => (
            <Cell key={index} fill={CHART_COLORS[index % CHART_COLORS.length]} />
          ))}
        </Pie>
        <Tooltip content={<CustomTooltip />} />
        <Legend
          formatter={(value, entry: any) => (
            <span
              className={`text-xs ${onSliceClick ? "cursor-pointer hover:underline" : ""}`}
              onClick={() => onSliceClick && onSliceClick(entry.payload)}
            >
              {value}
            </span>
          )}
        />
      </PieChart>
    </ResponsiveContainer>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <p className="text-muted-foreground text-sm">{PERIOD_LABELS[periodo]}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={selectedAccount} onValueChange={setSelectedAccount}>
            <SelectTrigger className="w-44">
              <SelectValue placeholder="Todas las cuentas" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todas las cuentas</SelectItem>
              {accounts.map((a) => (
                <SelectItem key={a.id} value={a.id}>{a.nombre}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={periodo} onValueChange={(v) => setPeriodo(v as DashboardPeriod)}>
            <SelectTrigger className="w-48">
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

          <Button variant="outline" size="icon" onClick={() => refresh()} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      {/* Custom date range */}
      {periodo === "personalizado" && (
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex flex-wrap gap-4 items-end">
              <div className="space-y-1">
                <Label className="text-xs">Desde</Label>
                <Input
                  type="date"
                  className="h-8 text-xs w-40"
                  value={customDates.desde}
                  onChange={(e) => handleCustomDate("desde", e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Hasta</Label>
                <Input
                  type="date"
                  className="h-8 text-xs w-40"
                  value={customDates.hasta}
                  onChange={(e) => handleCustomDate("hasta", e.target.value)}
                />
              </div>
              <p className="text-xs text-muted-foreground pb-1.5">
                Autocompleta con el mes anterior — modificable libremente.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Quick action buttons */}
      <div className="grid grid-cols-3 gap-3">
        <Link href="/transactions/new?tipo=ingreso">
          <Button size="xl" className="w-full bg-green-600 hover:bg-green-700 text-white gap-2 h-14">
            <ArrowUpCircle className="h-5 w-5" />
            <span className="hidden sm:inline">+ Ingreso</span>
            <span className="sm:hidden">Ingreso</span>
          </Button>
        </Link>
        <Link href="/transactions/new?tipo=gasto">
          <Button size="xl" className="w-full bg-red-600 hover:bg-red-700 text-white gap-2 h-14">
            <ArrowDownCircle className="h-5 w-5" />
            <span className="hidden sm:inline">- Gasto</span>
            <span className="sm:hidden">Gasto</span>
          </Button>
        </Link>
        <Link href="/transactions/new?tipo=transferencia">
          <Button size="xl" variant="outline" className="w-full gap-2 h-14 border-blue-500 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20">
            <ArrowLeftRight className="h-5 w-5" />
            <span className="hidden sm:inline">⇄ Transferencia</span>
            <span className="sm:hidden">Transfer.</span>
          </Button>
        </Link>
      </div>

      {/* Stats cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1">
              <TrendingUp className="h-4 w-4 text-green-500" />
              Ingresos del período
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? <Skeleton className="h-8 w-32" /> : (
              <p className="text-2xl font-bold text-green-600 dark:text-green-400">
                {formatCurrency(stats.ingresos, currency)}
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1">
              <TrendingDown className="h-4 w-4 text-red-500" />
              Gastos del período
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? <Skeleton className="h-8 w-32" /> : (
              <p className="text-2xl font-bold text-red-600 dark:text-red-400">
                {formatCurrency(stats.gastos, currency)}
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1">
              <Wallet className="h-4 w-4 text-primary" />
              Balance del período
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? <Skeleton className="h-8 w-32" /> : (
              <p className={`text-2xl font-bold ${stats.balance >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>
                {formatCurrency(stats.balance, currency)}
              </p>
            )}
          </CardContent>
        </Card>

        <Card className="border-primary/30 bg-primary/5">
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1 text-primary">
              <Scale className="h-4 w-4" />
              Saldo total real
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? <Skeleton className="h-8 w-32" /> : (
              <p className={`text-2xl font-bold ${totalBalance >= 0 ? "text-primary" : "text-red-600 dark:text-red-400"}`}>
                {formatCurrency(totalBalance, currency)}
              </p>
            )}
            <p className="text-xs text-muted-foreground mt-1">
              {selectedAccount === "todos"
                ? "Ingresos − gastos · todas las cuentas"
                : `Saldo actual · ${selectedAccountData?.nombre ?? "cuenta"}`}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Chart + Transactions */}
      <div className="grid gap-6 lg:grid-cols-5">
        {/* Expense donut chart */}
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-start justify-between">
            <div>
              <CardTitle className="text-base">Gastos por Categoría</CardTitle>
              <CardDescription>{PERIOD_LABELS[periodo]}</CardDescription>
            </div>
            {groupedExpenses.length > 0 && (
              <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={handleOpenFullscreen} title="Pantalla completa">
                <Maximize2 className="h-4 w-4" />
              </Button>
            )}
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-64 w-full rounded-full mx-auto" />
            ) : groupedExpenses.length === 0 ? (
              <div className="flex items-center justify-center h-64 text-muted-foreground text-sm">
                Sin gastos en el período
              </div>
            ) : (
              renderChart(
                groupedExpenses,
                (entry) => {
                  if (!entry?.isVarios) {
                    navigateToTransactions(entry?.category_id ?? null, periodo, selectedAccount);
                  }
                }
              )
            )}
          </CardContent>
        </Card>

        {/* Transaction list */}
        <Card className="lg:col-span-3">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base">Movimientos Recientes</CardTitle>
              <CardDescription>{PERIOD_LABELS[periodo]}{selectedAccountData ? ` · ${selectedAccountData.nombre}` : ""}</CardDescription>
            </div>
            <Link href="/transactions">
              <Button variant="ghost" size="sm" className="text-xs">Ver todos →</Button>
            </Link>
          </CardHeader>
          <CardContent className="space-y-4 max-h-80 overflow-y-auto pr-1">
            {loading ? (
              <div className="space-y-3">
                {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-14" />)}
              </div>
            ) : sortedDays.length === 0 ? (
              <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">
                Sin movimientos en el período
              </div>
            ) : (
              sortedDays.slice(0, 5).map((day) => {
                const dayTxs = byDay[day];
                const dayIngresos = dayTxs.filter((t) => t.tipo === "ingreso").reduce((s, t) => s + Number(t.monto), 0);
                const dayGastos   = dayTxs.filter((t) => t.tipo === "gasto").reduce((s, t) => s + Number(t.monto), 0);

                return (
                  <div key={day}>
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-xs font-semibold text-muted-foreground">
                        {format(new Date(day + "T12:00:00"), "EEEE d 'de' MMMM", { locale: es })
                          .replace(/^\w/, (c) => c.toUpperCase())}
                      </p>
                      <div className="flex gap-2 text-xs">
                        {dayIngresos > 0 && (
                          <span className="text-green-600 dark:text-green-400 font-medium">
                            +{formatCurrency(dayIngresos, currency)}
                          </span>
                        )}
                        {dayGastos > 0 && (
                          <span className="text-red-600 dark:text-red-400 font-medium">
                            -{formatCurrency(dayGastos, currency)}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="space-y-1">
                      {dayTxs.map((t) => (
                        <div key={t.id} className="flex items-center justify-between py-1.5 px-2 rounded-lg hover:bg-muted/50 transition-colors">
                          <div className="flex items-center gap-2 min-w-0">
                            <div className={`h-2 w-2 rounded-full shrink-0 ${
                              t.tipo === "ingreso" ? "bg-green-500" :
                              t.tipo === "gasto" ? "bg-red-500" : "bg-blue-500"
                            }`} />
                            <p className="text-sm truncate">
                              {t.category?.nombre ?? (t.tipo === "transferencia" ? `→ ${t.to_account?.nombre}` : "Sin categoría")}
                            </p>
                          </div>
                          <p className={`text-sm font-semibold shrink-0 ml-2 ${
                            t.tipo === "ingreso" ? "text-green-600 dark:text-green-400" :
                            t.tipo === "gasto" ? "text-red-600 dark:text-red-400" : "text-blue-600 dark:text-blue-400"
                          }`}>
                            {t.tipo === "ingreso" ? "+" : t.tipo === "gasto" ? "-" : ""}
                            {formatCurrency(Number(t.monto), t.account?.moneda ?? "ARS")}
                          </p>
                        </div>
                      ))}
                    </div>
                    <Separator className="mt-2" />
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>
      </div>

      {/* Fullscreen chart modal */}
      <Dialog open={chartFullscreen} onOpenChange={setChartFullscreen}>
        <DialogContent className="max-w-3xl w-full">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between pr-8">
              <span>Gastos por Categoría</span>
            </DialogTitle>
          </DialogHeader>

          {/* Modal filters */}
          <div className="flex flex-wrap gap-3 pb-2 border-b">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Período</Label>
              <Select value={modalPeriodo} onValueChange={(v) => handleModalPeriodoChange(v as DashboardPeriod)}>
                <SelectTrigger className="h-8 w-44 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="mes_actual">Mes actual</SelectItem>
                  <SelectItem value="mes_anterior">Mes anterior</SelectItem>
                  <SelectItem value="ultimos_3_meses">Últimos 3 meses</SelectItem>
                  <SelectItem value="año_actual">Año actual</SelectItem>
                  <SelectItem value="ultimo_año">Último año</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Cuenta</Label>
              <Select value={modalAccount} onValueChange={handleModalAccountChange}>
                <SelectTrigger className="h-8 w-44 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todas las cuentas</SelectItem>
                  {accounts.map((a) => (
                    <SelectItem key={a.id} value={a.id}>{a.nombre}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <p className="text-xs text-muted-foreground self-end pb-1">
              Hacé clic en una categoría para ver sus transacciones.
            </p>
          </div>

          {/* Modal chart */}
          {modalLoading ? (
            <Skeleton className="h-96 w-full" />
          ) : groupedModalExpenses.length === 0 ? (
            <div className="flex items-center justify-center h-96 text-muted-foreground text-sm">
              Sin gastos en el período
            </div>
          ) : (
            renderChart(
              groupedModalExpenses,
              (entry) => {
                if (!entry?.isVarios) {
                  navigateToTransactions(entry?.category_id ?? null, modalPeriodo, modalAccount);
                }
              },
              380
            )
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
