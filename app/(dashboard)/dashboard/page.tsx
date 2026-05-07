import { Suspense } from "react";
import { getDashboardStats, getExpensesByCategory, getTransactions } from "@/app/actions/transactions";
import { getActiveAccounts } from "@/app/actions/accounts";
import { DashboardClient } from "@/components/dashboard/dashboard-client";
import { Skeleton } from "@/components/ui/skeleton";

export default async function DashboardPage() {
  const [accounts, stats, expensesByCategory, recentTransactions] = await Promise.all([
    getActiveAccounts(),
    getDashboardStats(),
    getExpensesByCategory(),
    getTransactions({ periodo: "mes_actual" }),
  ]);

  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <DashboardClient
        accounts={accounts}
        initialStats={stats}
        initialExpensesByCategory={expensesByCategory}
        initialTransactions={recentTransactions}
      />
    </Suspense>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-32 rounded-xl" />
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Skeleton className="h-80 rounded-xl" />
        <Skeleton className="h-80 rounded-xl" />
      </div>
    </div>
  );
}
