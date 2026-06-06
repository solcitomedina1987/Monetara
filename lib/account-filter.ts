import type { TransactionFilters } from "@/lib/types";

/** IDs de cuenta aplicados al filtro (multi o legado `account_id`). */
export function resolvedAccountIds(f: TransactionFilters | undefined): string[] {
  if (f?.account_ids?.length) return f.account_ids;
  if (f?.account_id) return [f.account_id];
  return [];
}

/** Filtro OR: movimiento en cualquiera de las cuentas (origen o destino en transferencias). */
export function applyTransactionAccountOrFilter<T extends { or: (filter: string) => T }>(
  query: T,
  accountIds: string[]
): T {
  if (!accountIds.length) return query;
  if (accountIds.length === 1) {
    const id = accountIds[0];
    return query.or(`account_id.eq.${id},to_account_id.eq.${id}`);
  }
  const list = accountIds.join(",");
  return query.or(`account_id.in.(${list}),to_account_id.in.(${list})`);
}
