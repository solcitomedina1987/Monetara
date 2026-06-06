import type { TransactionFilters, TransactionPeriod } from "@/lib/types";

export { resolvedAccountIds } from "@/lib/account-filter";

export const TX_FILTER_KEY = "monetara_tx_filters";

export const DEFAULT_TRANSACTION_FILTERS: TransactionFilters = {
  periodo: "mes_actual",
  showIngresos: true,
  showGastos: true,
};

export const VALID_TRANSACTION_PERIODS = new Set<string>([
  "hoy",
  "ultimos_7_dias",
  "mes_actual",
  "mes_anterior",
  "ultimos_3_meses",
  "año_actual",
  "ultimo_año",
  "personalizado",
  "desde_el_inicio",
]);

/** IDs de categoría aplicados al filtro (multi o legado `category_id`). */
export function resolvedCategoryIds(f: TransactionFilters): string[] {
  if (f.category_ids?.length) return f.category_ids;
  if (f.category_id) return [f.category_id];
  return [];
}

export function normalizeStoredTransactionFilters(raw: unknown): TransactionFilters {
  const out: TransactionFilters = { ...DEFAULT_TRANSACTION_FILTERS };
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  const o = raw as Record<string, unknown>;

  if (typeof o.periodo === "string" && VALID_TRANSACTION_PERIODS.has(o.periodo)) {
    out.periodo = o.periodo as TransactionPeriod;
  }
  if (typeof o.fechaDesde === "string") out.fechaDesde = o.fechaDesde;
  if (typeof o.fechaHasta === "string") out.fechaHasta = o.fechaHasta;
  if (typeof o.account_id === "string" && o.account_id) out.account_id = o.account_id;
  if (Array.isArray(o.account_ids)) {
    out.account_ids = o.account_ids.filter((id): id is string => typeof id === "string");
    if (out.account_ids.length === 0) delete out.account_ids;
  }
  if (typeof o.account_id === "string" && o.account_id && !out.account_ids?.length) {
    out.account_ids = [o.account_id];
  }
  if (Array.isArray(o.category_ids)) {
    out.category_ids = o.category_ids.filter((id): id is string => typeof id === "string");
    if (out.category_ids.length === 0) delete out.category_ids;
  }
  if (typeof o.category_id === "string" && o.category_id && !out.category_ids?.length) {
    out.category_ids = [o.category_id];
  }
  if (Array.isArray(o.tag_ids)) {
    out.tag_ids = o.tag_ids.filter((id): id is string => typeof id === "string");
  }

  const hasExplicitShow =
    Object.prototype.hasOwnProperty.call(o, "showIngresos") ||
    Object.prototype.hasOwnProperty.call(o, "showGastos");

  if (hasExplicitShow) {
    out.showIngresos =
      typeof o.showIngresos === "boolean" ? o.showIngresos : DEFAULT_TRANSACTION_FILTERS.showIngresos!;
    out.showGastos =
      typeof o.showGastos === "boolean" ? o.showGastos : DEFAULT_TRANSACTION_FILTERS.showGastos!;
  } else if (o.tipo === "ingreso") {
    out.showIngresos = true;
    out.showGastos = false;
  } else if (o.tipo === "gasto") {
    out.showIngresos = false;
    out.showGastos = true;
  }

  return out;
}

export function persistTransactionFilters(f: TransactionFilters) {
  try {
    const { tipo: _omit, category_id: _legacyCat, account_id: _legacyAcc, ...rest } = f;
    localStorage.setItem(TX_FILTER_KEY, JSON.stringify(rest));
  } catch {
    /* ignore */
  }
}
