import type { TransactionType } from "@/lib/types";

/** Minimal shape for balance math */
export type TxBalanceInput = {
  tipo: TransactionType;
  monto: number | string;
  account_id: string;
  to_account_id: string | null;
  created_at?: string;
};

/**
 * Delta neto sobre el conjunto de cuentas indicado (una o todas).
 * Alineado con get_account_balance / getBalanceBeforePeriod:
 * - ingreso/gasto solo cuentan si account_id está en el conjunto (no el contra-asiento por to_account_id).
 * - transferencia legacy: -m en origen, +m en destino si están en el conjunto.
 */
export function balanceDeltaForTransaction(t: TxBalanceInput, accountIds: Set<string>): number {
  const monto = Number(t.monto);

  if (t.tipo === "transferencia") {
    let d = 0;
    if (accountIds.has(t.account_id)) d -= monto;
    if (t.to_account_id && accountIds.has(t.to_account_id)) d += monto;
    return d;
  }

  if (!accountIds.has(t.account_id)) return 0;
  if (t.tipo === "ingreso") return monto;
  return -monto;
}

export type RunningBalanceScope =
  | { kind: "one"; accountId: string }
  | { kind: "many"; accountIds: Set<string> };

export function applyTransactionToRunningBalance(
  running: number,
  t: TxBalanceInput,
  scope: RunningBalanceScope
): number {
  const ids = scope.kind === "one" ? new Set([scope.accountId]) : scope.accountIds;
  return running + balanceDeltaForTransaction(t, ids);
}

/** Suma de deltas de una lista (mismo criterio que get_account_balance). */
export function sumBalanceDeltasForScope(transactions: TxBalanceInput[], scope: RunningBalanceScope): number {
  const ids = scope.kind === "one" ? new Set([scope.accountId]) : scope.accountIds;
  return transactions.reduce((s, t) => s + balanceDeltaForTransaction(t, ids), 0);
}

/** Sort transactions within a day for deterministic running total */
export function sortTxsWithinDayForBalance<T extends TxBalanceInput>(txs: T[]): T[] {
  return [...txs].sort((a, b) => (a.created_at ?? "").localeCompare(b.created_at ?? ""));
}
