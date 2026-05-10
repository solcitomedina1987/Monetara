"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { format, startOfMonth, endOfMonth, subMonths } from "date-fns";
import { es } from "date-fns/locale";
import * as LucideIcons from "lucide-react";
import {
  ArrowUpCircle, ArrowDownCircle, ArrowLeftRight, TrendingUp,
  TrendingDown, Wallet, RefreshCw, Scale, Maximize2, X, FolderOpen,
} from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from "recharts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatCurrency } from "@/lib/utils";
import { applyTransactionToRunningBalance, sortTxsWithinDayForBalance, type RunningBalanceScope } from "@/lib/transaction-balance";
import { usePersistedState } from "@/lib/hooks/use-persisted-state";
import { getDashboardStats, getExpensesByCategory, getExpensesByTag, getTransactions, getTotalBalance, getBalanceBeforePeriod } from "@/app/actions/transactions";
import type { Account, TransactionWithRelations, DashboardPeriod, TransactionFilters } from "@/lib/types";

function DynamicCategoryIcon({ iconName, className }: { iconName: string | null | undefined; className?: string }) {
  const cls = className ?? "h-3 w-3";
  if (!iconName) return <FolderOpen className={cls} />;
  const IconComponent = (LucideIcons as any)[iconName] as React.ElementType<{ className?: string }>;
  if (!IconComponent) return <FolderOpen className={cls} />;
  return <IconComponent className={cls} />;
}

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

type TagEntry = { name: string; value: number; tag_id: string | null };
type GroupedTagEntry = TagEntry & { isVarios?: boolean };

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

/** Group tags < 5% of total into "Varios" */
function groupSmallTagSlices(data: TagEntry[]): GroupedTagEntry[] {
  const total = data.reduce((s, e) => s + e.value, 0);
  if (total === 0) return data;
  const threshold = total * 0.05;
  const main: GroupedTagEntry[] = data.filter((e) => e.value >= threshold);
  const varios = data.filter((e) => e.value < threshold);
  if (varios.length > 0) {
    main.push({
      name: "Varios",
      value: varios.reduce((s, e) => s + e.value, 0),
      tag_id: null,
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

  const [selectedAccount, setSelectedAccount] = usePersistedState<string>(
    "monetara_dashboard_account",
    defaultAccountId ?? "todos"
  );
  const [periodo, setPeriodo] = usePersistedState<DashboardPeriod>(
    "monetara_dashboard_periodo",
    "mes_actual"
  );
  const [customDates, setCustomDates] = useState(getDefaultCustomDates);

  const [stats, setStats] = useState(initialStats);
  const [expenses, setExpenses] = useState<ExpenseEntry[]>(initialExpensesByCategory);
  const [expensesByTag, setExpensesByTag] = useState<TagEntry[]>([]);
  const [transactions, setTransactions] = useState(initialTransactions);
  const [totalBalance, setTotalBalance] = useState(initialTotalBalance);
  const [startingBalance, setStartingBalance] = useState(0);
  const [loading, setLoading] = useState(false);
  const [chartFullscreen, setChartFullscreen] = useState(false);
  const [chartMode, setChartMode] = useState<"categoria" | "etiqueta">("categoria");

  // Modal-specific filters (independent from main filters)
  const [modalPeriodo, setModalPeriodo] = useState<DashboardPeriod>("mes_actual");
  const [modalAccount, setModalAccount] = useState<string>("todos");
  const [modalExpenses, setModalExpenses] = useState<ExpenseEntry[]>(initialExpensesByCategory);
  const [modalExpensesByTag, setModalExpensesByTag] = useState<TagEntry[]>([]);
  const [modalChartMode, setModalChartMode] = useState<"categoria" | "etiqueta">("categoria");
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
      const [newStats, newExpenses, newTagExpenses, newTx, newTotal, newStarting] = await Promise.all([
        getDashboardStats(filters),
        getExpensesByCategory(filters),
        getExpensesByTag(filters),
        getTransactions(filters),
        getTotalBalance(accountId),
        getBalanceBeforePeriod(filters),
      ]);
      setStats(newStats);
      setExpenses(newExpenses);
      setExpensesByTag(newTagExpenses);
      setTransactions(newTx);
      setTotalBalance(newTotal);
      setStartingBalance(newStarting);
    } finally {
      setLoading(false);
    }
  }, [selectedAccount, periodo, customDates, buildFilters]);

  useEffect(() => {
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
      const [newExpenses, newTagExpenses] = await Promise.all([
        getExpensesByCategory(filters),
        getExpensesByTag(filters),
      ]);
      setModalExpenses(newExpenses);
      setModalExpensesByTag(newTagExpenses);
    } finally {
      setModalLoading(false);
    }
  }, [buildFilters, customDates]);

  const handleOpenFullscreen = () => {
    setModalPeriodo(periodo);
    setModalAccount(selectedAccount);
    setModalExpenses(expenses);
    setModalExpensesByTag(expensesByTag);
    setModalChartMode(chartMode);
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

  const runningScope = useMemo<RunningBalanceScope>(
    () =>
      selectedAccount === "todos"
        ? { kind: "many", accountIds: new Set(accounts.map((a) => a.id)) }
        : { kind: "one", accountId: selectedAccount },
    [selectedAccount, accounts]
  );

  // Cumulative Saldo Total per day: startingBalance + all transactions up to that day (full history via startingBalance)
  const dayEndBalance = useMemo(() => {
    const result: Record<string, number> = {};
    let running = startingBalance;
    const ascending = [...sortedDays].reverse();
    for (const day of ascending) {
      const sorted = sortTxsWithinDayForBalance(byDay[day] ?? []);
      for (const t of sorted) {
        running = applyTransactionToRunningBalance(running, t, runningScope);
      }
      result[day] = running;
    }
    return result;
  }, [sortedDays, byDay, startingBalance, runningScope]);

  const selectedAccountData = accounts.find((a) => a.id === selectedAccount);
  const currency = selectedAccountData?.moneda ?? "ARS";

  const groupedExpenses = useMemo<GroupedEntry[]>(() => groupSmallSlices(expenses), [expenses]);
  const groupedModalExpenses = useMemo<GroupedEntry[]>(() => groupSmallSlices(modalExpenses), [modalExpenses]);
  const groupedTagExpenses = useMemo<GroupedTagEntry[]>(() => groupSmallTagSlices(expensesByTag), [expensesByTag]);
  const groupedModalTagExpenses = useMemo<GroupedTagEntry[]>(() => groupSmallTagSlices(modalExpensesByTag), [modalExpensesByTag]);

  const CustomTooltip = ({ active, payload }: any) => {
    if (!active || !payload?.length) return null;
    return (
      <div className="rounded-md border bg-background p-2 shadow-md text-xs">
        <p className="font-medium">{payload[0].name}</p>
        <p>{formatCurrency(payload[0].value, currency)}</p>
      </div>
    );
  };

  type AnyChartEntry = { name: string; value: number; isVarios?: boolean; category_id?: string | null; tag_id?: string | null };
  const renderChart = (data: AnyChartEntry[], onSliceClick?: (entry: any) => void, height = 250) => (
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
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold shrink-0">Dashboard</h1>

        {/* Filters — always one row, never wraps, scrolls horizontally if needed */}
        <div className="flex flex-nowrap items-center gap-2 overflow-x-auto pb-0.5">
          <Select value={selectedAccount} onValueChange={setSelectedAccount}>
            <SelectTrigger className="w-36 shrink-0 text-xs h-9">
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
            <SelectTrigger className="w-40 shrink-0 text-xs h-9">
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

          <Button variant="outline" size="icon" className="shrink-0 h-9 w-9" onClick={() => refresh()} disabled={loading}>
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
          <Button
            size="xl"
            className="w-full gap-2 h-14 bg-[#0e415f] hover:bg-[#1f628e] text-white dark:bg-[#f4f0e0] dark:hover:bg-[#e8e4d4] dark:text-[#0e415f]"
          >
            <ArrowLeftRight className="h-5 w-5" />
            <span className="hidden sm:inline">⇄ Transferencia</span>
            <span className="sm:hidden">Transfer.</span>
          </Button>
        </Link>
      </div>

      {/* Stats cards — 2×2 on mobile, 4-column on desktop */}
      <div className="grid gap-2 grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="px-3 pt-3 pb-1">
            <CardDescription className="flex items-center gap-1 text-xs">
              <TrendingUp className="h-3 w-3 text-green-500 shrink-0" />
              <span className="truncate">Ingresos</span>
            </CardDescription>
          </CardHeader>
          <CardContent className="px-3 pb-3">
            {loading ? <Skeleton className="h-6 w-20" /> : (
              <p className="text-base sm:text-xl font-bold text-green-600 dark:text-green-400 leading-tight tabular-nums">
                {formatCurrency(stats.ingresos, currency)}
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="px-3 pt-3 pb-1">
            <CardDescription className="flex items-center gap-1 text-xs">
              <TrendingDown className="h-3 w-3 text-red-500 shrink-0" />
              <span className="truncate">Gastos</span>
            </CardDescription>
          </CardHeader>
          <CardContent className="px-3 pb-3">
            {loading ? <Skeleton className="h-6 w-20" /> : (
              <p className="text-base sm:text-xl font-bold text-red-600 dark:text-red-400 leading-tight tabular-nums">
                {formatCurrency(stats.gastos, currency)}
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="px-3 pt-3 pb-1">
            <CardDescription className="flex items-center gap-1 text-xs">
              <Wallet className="h-3 w-3 text-primary shrink-0" />
              <span className="truncate">Balance</span>
            </CardDescription>
          </CardHeader>
          <CardContent className="px-3 pb-3">
            {loading ? <Skeleton className="h-6 w-20" /> : (
              <p className={`text-base sm:text-xl font-bold leading-tight tabular-nums ${stats.balance >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>
                {formatCurrency(stats.balance, currency)}
              </p>
            )}
          </CardContent>
        </Card>

        <Card className="border-primary/30 bg-primary/5">
          <CardHeader className="px-3 pt-3 pb-1">
            <CardDescription className="flex items-center gap-1 text-xs text-primary">
              <Scale className="h-3 w-3 shrink-0" />
              <span className="truncate">Saldo Real</span>
            </CardDescription>
          </CardHeader>
          <CardContent className="px-3 pb-3">
            {loading ? <Skeleton className="h-6 w-20" /> : (
              <p className={`text-base sm:text-xl font-bold leading-tight tabular-nums ${totalBalance >= 0 ? "text-primary" : "text-red-600 dark:text-red-400"}`}>
                {formatCurrency(totalBalance, currency)}
              </p>
            )}
            <p className="text-[10px] text-muted-foreground mt-0.5 leading-tight truncate">
              {selectedAccount === "todos" ? "Todas las cuentas" : selectedAccountData?.nombre ?? "cuenta"}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Chart + Transactions */}
      <div className="grid gap-6 lg:grid-cols-5">
        {/* Expense donut chart — dual mode (categoría / etiqueta) */}
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-start justify-between pb-2">
            <div className="flex-1">
              <Tabs value={chartMode} onValueChange={(v) => setChartMode(v as "categoria" | "etiqueta")}>
                <TabsList className="h-7 text-xs">
                  <TabsTrigger value="categoria" className="text-xs px-2 h-6">Categoría</TabsTrigger>
                  <TabsTrigger value="etiqueta" className="text-xs px-2 h-6">Etiqueta</TabsTrigger>
                </TabsList>
              </Tabs>
              <CardDescription className="mt-1">{PERIOD_LABELS[periodo]}</CardDescription>
            </div>
            {(chartMode === "categoria" ? groupedExpenses : groupedTagExpenses).length > 0 && (
              <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={handleOpenFullscreen} title="Pantalla completa">
                <Maximize2 className="h-4 w-4" />
              </Button>
            )}
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-64 w-full rounded-full mx-auto" />
            ) : chartMode === "categoria" ? (
              groupedExpenses.length === 0 ? (
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
              )
            ) : (
              groupedTagExpenses.length === 0 ? (
                <div className="flex items-center justify-center h-64 text-muted-foreground text-sm">
                  Sin gastos con etiquetas en el período
                </div>
              ) : (
                renderChart(groupedTagExpenses)
              )
            )}
          </CardContent>
        </Card>

        {/* Transaction list — mirrors transactions-client rows */}
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
          <CardContent className="max-h-96 overflow-y-auto px-0 pb-0">
            {loading ? (
              <div className="space-y-2 px-4 pb-4">
                {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-14" />)}
              </div>
            ) : sortedDays.length === 0 ? (
              <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">
                Sin movimientos en el período
              </div>
            ) : (
              sortedDays.slice(0, 5).map((day) => {
                const dayTxs = byDay[day];
                const cumBalance = dayEndBalance[day] ?? 0;

                return (
                  <div key={day}>
                    {/* Day header — shows cumulative Saldo Total up to this day */}
                    <div className="flex items-center justify-between px-4 py-1.5 bg-muted/30">
                      <p className="text-xs font-semibold text-muted-foreground">
                        {format(new Date(day + "T12:00:00"), "EEEE d 'de' MMMM", { locale: es })
                          .replace(/^\w/, (c) => c.toUpperCase())}
                      </p>
                      <span className={`text-xs font-medium ${cumBalance >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>
                        Saldo Total: {formatCurrency(cumBalance, currency)}
                      </span>
                    </div>

                    {/* Transaction rows */}
                    {dayTxs.map((t) => (
                      <div key={t.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/30 transition-colors min-w-0">
                        {/* Account icon */}
                        <div className="rounded-full bg-muted shrink-0 h-8 w-8 flex items-center justify-center overflow-hidden">
                          {t.account?.icon_url ? (
                            <Image
                              src={t.account.icon_url}
                              alt={t.account?.nombre ?? ""}
                              width={32}
                              height={32}
                              className="h-8 w-8 object-cover rounded-full"
                            />
                          ) : (
                            <Wallet className="h-3.5 w-3.5 text-muted-foreground" />
                          )}
                        </div>

                        {/* Info block */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            {t.tipo !== "transferencia" && (
                              <span className="shrink-0 text-muted-foreground">
                                <DynamicCategoryIcon iconName={t.category?.icono} className="h-3 w-3" />
                              </span>
                            )}
                            <p className="text-sm font-medium truncate">
                              {t.tipo === "transferencia"
                                ? `${t.account?.nombre} → ${t.to_account?.nombre}`
                                : t.category?.nombre ?? "Sin categoría"}
                            </p>
                          </div>
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
                          "text-violet-600 dark:text-violet-400"
                        }`}>
                          {t.tipo === "ingreso" ? "+" : t.tipo === "gasto" ? "-" : ""}
                          {formatCurrency(Number(t.monto), t.account?.moneda ?? "ARS")}
                        </p>
                      </div>
                    ))}
                    <Separator />
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
            <DialogTitle className="flex items-center gap-3 pr-8">
              <span>Gastos por</span>
              <Tabs value={modalChartMode} onValueChange={(v) => setModalChartMode(v as "categoria" | "etiqueta")}>
                <TabsList className="h-7">
                  <TabsTrigger value="categoria" className="text-xs px-2 h-6">Categoría</TabsTrigger>
                  <TabsTrigger value="etiqueta" className="text-xs px-2 h-6">Etiqueta</TabsTrigger>
                </TabsList>
              </Tabs>
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
            {modalChartMode === "categoria" && (
              <p className="text-xs text-muted-foreground self-end pb-1">
                Hacé clic en una categoría para ver sus transacciones.
              </p>
            )}
          </div>

          {/* Modal chart */}
          {modalLoading ? (
            <Skeleton className="h-96 w-full" />
          ) : modalChartMode === "categoria" ? (
            groupedModalExpenses.length === 0 ? (
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
            )
          ) : (
            groupedModalTagExpenses.length === 0 ? (
              <div className="flex items-center justify-center h-96 text-muted-foreground text-sm">
                Sin gastos con etiquetas en el período
              </div>
            ) : (
              renderChart(groupedModalTagExpenses, undefined, 380)
            )
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
