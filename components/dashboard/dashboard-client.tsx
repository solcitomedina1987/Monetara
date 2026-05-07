"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { format, startOfMonth, endOfMonth } from "date-fns";
import { es } from "date-fns/locale";
import {
  ArrowUpCircle, ArrowDownCircle, ArrowLeftRight, TrendingUp,
  TrendingDown, Wallet, RefreshCw,
} from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from "recharts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrency } from "@/lib/utils";
import { getDashboardStats, getExpensesByCategory, getTransactions } from "@/app/actions/transactions";
import type { Account, TransactionWithRelations } from "@/lib/types";

const CHART_COLORS = [
  "#3b82f6", "#ef4444", "#10b981", "#f59e0b", "#8b5cf6",
  "#ec4899", "#06b6d4", "#84cc16", "#f97316", "#6366f1",
];

interface DashboardClientProps {
  accounts: Account[];
  initialStats: { ingresos: number; gastos: number; balance: number };
  initialExpensesByCategory: { name: string; value: number }[];
  initialTransactions: TransactionWithRelations[];
}

export function DashboardClient({
  accounts, initialStats, initialExpensesByCategory, initialTransactions,
}: DashboardClientProps) {
  const [selectedAccount, setSelectedAccount] = useState<string>(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("finanzas_account") ?? "todos";
    }
    return "todos";
  });
  const [stats, setStats] = useState(initialStats);
  const [expenses, setExpenses] = useState(initialExpensesByCategory);
  const [transactions, setTransactions] = useState(initialTransactions);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    const accountId = selectedAccount === "todos" ? undefined : selectedAccount;
    const [newStats, newExpenses, newTx] = await Promise.all([
      getDashboardStats(accountId),
      getExpensesByCategory(accountId),
      getTransactions({ periodo: "mes_actual", account_id: accountId }),
    ]);
    setStats(newStats);
    setExpenses(newExpenses);
    setTransactions(newTx);
    setLoading(false);
  }, [selectedAccount]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem("finanzas_account", selectedAccount);
    }
    refresh();
  }, [selectedAccount]);

  // Group transactions by day
  const byDay = transactions.reduce((acc, t) => {
    const day = t.fecha;
    if (!acc[day]) acc[day] = [];
    acc[day].push(t);
    return acc;
  }, {} as Record<string, TransactionWithRelations[]>);

  const sortedDays = Object.keys(byDay).sort((a, b) => b.localeCompare(a));

  const selectedAccountData = accounts.find((a) => a.id === selectedAccount);
  const currency = selectedAccountData?.moneda ?? "ARS";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <p className="text-muted-foreground text-sm">
            {format(new Date(), "MMMM yyyy", { locale: es }).replace(/^\w/, (c) => c.toUpperCase())}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={selectedAccount} onValueChange={setSelectedAccount}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Todas las cuentas" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todas las cuentas</SelectItem>
              {accounts.map((a) => (
                <SelectItem key={a.id} value={a.id}>{a.nombre}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" size="icon" onClick={refresh} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

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
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1">
              <TrendingUp className="h-4 w-4 text-green-500" />
              Ingresos del mes
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-8 w-32" />
            ) : (
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
              Gastos del mes
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-8 w-32" />
            ) : (
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
              Balance del mes
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-8 w-32" />
            ) : (
              <p className={`text-2xl font-bold ${stats.balance >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>
                {formatCurrency(stats.balance, currency)}
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Chart + Transactions */}
      <div className="grid gap-6 lg:grid-cols-5">
        {/* Expense donut chart */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Gastos por Categoría</CardTitle>
            <CardDescription>Mes actual</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-64 w-full rounded-full mx-auto" />
            ) : expenses.length === 0 ? (
              <div className="flex items-center justify-center h-64 text-muted-foreground text-sm">
                Sin gastos este mes
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie
                    data={expenses}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={90}
                    paddingAngle={3}
                    dataKey="value"
                  >
                    {expenses.map((_, index) => (
                      <Cell key={index} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value: any) => formatCurrency(Number(value), currency)}
                  />
                  <Legend
                    formatter={(value) => <span className="text-xs">{value}</span>}
                  />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Transaction list */}
        <Card className="lg:col-span-3">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base">Movimientos Recientes</CardTitle>
              <CardDescription>Agrupados por día</CardDescription>
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
                Sin movimientos este mes
              </div>
            ) : (
              sortedDays.slice(0, 5).map((day) => {
                const dayTxs = byDay[day];
                const dayIngresos = dayTxs.filter((t) => t.tipo === "ingreso").reduce((s, t) => s + Number(t.monto), 0);
                const dayGastos = dayTxs.filter((t) => t.tipo === "gasto").reduce((s, t) => s + Number(t.monto), 0);

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
                            <div className="min-w-0">
                              <p className="text-sm truncate">
                                {t.category?.nombre ?? (t.tipo === "transferencia" ? `→ ${t.to_account?.nombre}` : "Sin categoría")}
                              </p>
                              {t.notas && <p className="text-xs text-muted-foreground truncate">{t.notas}</p>}
                            </div>
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
    </div>
  );
}
