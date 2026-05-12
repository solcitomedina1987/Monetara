import { startOfMonth, endOfMonth, subMonths, startOfYear, format, parseISO, addMonths, isAfter } from "date-fns";
import type { TransactionFilters, TransactionPeriod } from "@/lib/types";

/** Espejo de la lógica en `app/actions/transactions.ts` para rangos de fechas en el cliente. */
export function getPeriodDateRangeTuple(filters?: TransactionFilters): [string, string] | null {
  const now = new Date();
  if (filters?.periodo === "desde_el_inicio") {
    return null;
  }
  if (!filters?.periodo || filters.periodo === "mes_actual") {
    return [format(startOfMonth(now), "yyyy-MM-dd"), format(endOfMonth(now), "yyyy-MM-dd")];
  }
  if (filters.periodo === "mes_anterior") {
    const last = subMonths(now, 1);
    return [format(startOfMonth(last), "yyyy-MM-dd"), format(endOfMonth(last), "yyyy-MM-dd")];
  }
  if (filters.periodo === "ultimos_3_meses") {
    return [format(startOfMonth(subMonths(now, 2)), "yyyy-MM-dd"), format(endOfMonth(now), "yyyy-MM-dd")];
  }
  if (filters.periodo === "año_actual") {
    return [format(startOfYear(now), "yyyy-MM-dd"), format(endOfMonth(now), "yyyy-MM-dd")];
  }
  if (filters.periodo === "ultimo_año") {
    return [format(subMonths(now, 12), "yyyy-MM-dd"), format(now, "yyyy-MM-dd")];
  }
  if (filters.periodo === "personalizado" && filters.fechaDesde && filters.fechaHasta) {
    return [filters.fechaDesde, filters.fechaHasta];
  }
  return null;
}

export function isValidTransactionPeriod(p: string): p is TransactionPeriod {
  return new Set<string>([
    "mes_actual",
    "mes_anterior",
    "ultimos_3_meses",
    "año_actual",
    "ultimo_año",
    "personalizado",
    "desde_el_inicio",
  ]).has(p);
}

/** Lista de claves `yyyy-MM` desde el inicio hasta el fin (inclusive por mes calendario). */
export function enumerateMonthKeys(fromIso: string, toIso: string): string[] {
  const keys: string[] = [];
  let d = startOfMonth(parseISO(`${fromIso}T12:00:00`));
  const end = endOfMonth(parseISO(`${toIso}T12:00:00`));
  while (!isAfter(d, end)) {
    keys.push(format(d, "yyyy-MM"));
    d = addMonths(d, 1);
  }
  return keys;
}
