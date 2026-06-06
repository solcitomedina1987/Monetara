import { getTransactions, getTotalBalance } from "@/app/actions/transactions";
import { getActiveAccounts } from "@/app/actions/accounts";
import { getActiveCategories } from "@/app/actions/categories";
import { getActiveTags } from "@/app/actions/tags";
import { TransactionsClient } from "@/components/transactions/transactions-client";
import type { TransactionPeriod, TransactionFilters } from "@/lib/types";

interface Props {
  searchParams: Promise<{
    periodo?: string;
    account_id?: string;
    account_ids?: string;
    category_id?: string;
    /** Varias categorías separadas por coma */
    category_ids?: string;
    fechaDesde?: string;
    fechaHasta?: string;
  }>;
}

export default async function TransactionsPage({ searchParams }: Props) {
  const params = await searchParams;

  const hasUrlFilters =
    params.periodo !== undefined ||
    params.account_id !== undefined ||
    params.account_ids !== undefined ||
    params.category_id !== undefined ||
    params.category_ids !== undefined ||
    params.fechaDesde !== undefined ||
    params.fechaHasta !== undefined;

  const periodo = (params.periodo as TransactionPeriod) ?? "mes_actual";
  const categoryIdsFromUrl = params.category_ids
    ? params.category_ids.split(",").map((s) => s.trim()).filter(Boolean)
    : params.category_id
      ? [params.category_id]
      : undefined;

  const accountIdsFromUrl = params.account_ids
    ? params.account_ids.split(",").map((s) => s.trim()).filter(Boolean)
    : params.account_id
      ? [params.account_id]
      : undefined;

  const filtersForFetch: TransactionFilters = {
    periodo,
    showIngresos: true,
    showGastos: true,
    ...(accountIdsFromUrl?.length ? { account_ids: accountIdsFromUrl } : {}),
    ...(categoryIdsFromUrl?.length ? { category_ids: categoryIdsFromUrl } : {}),
    ...(periodo === "personalizado" && params.fechaDesde && params.fechaHasta
      ? { fechaDesde: params.fechaDesde, fechaHasta: params.fechaHasta }
      : {}),
  };

  const [transactions, accounts, categories, tags, referenceTotalBalance] = await Promise.all([
    getTransactions(filtersForFetch),
    getActiveAccounts(),
    getActiveCategories(),
    getActiveTags(),
    getTotalBalance(
      accountIdsFromUrl?.length === 1
        ? accountIdsFromUrl[0]
        : accountIdsFromUrl && accountIdsFromUrl.length > 1
          ? accountIdsFromUrl
          : undefined
    ),
  ]);

  return (
    <TransactionsClient
      initialTransactions={transactions}
      accounts={accounts}
      categories={categories}
      tags={tags}
      referenceTotalBalance={referenceTotalBalance}
      initialFilters={hasUrlFilters ? filtersForFetch : undefined}
    />
  );
}
