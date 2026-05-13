import {
  startOfMonth,
  endOfMonth,
  subMonths,
  startOfYear,
  format,
  subDays,
} from "date-fns";
import type { TransactionFilters } from "@/lib/types";

/** [fechaDesde, fechaHasta] inclusive; `null` = sin filtro de fechas (desde el inicio). */
export function getPeriodDates(filters?: TransactionFilters): [string, string] | null {
  const now = new Date();
  if (filters?.periodo === "desde_el_inicio") {
    return null;
  }
  if (filters?.periodo === "hoy") {
    const d = format(now, "yyyy-MM-dd");
    return [d, d];
  }
  if (filters?.periodo === "ultimos_7_dias") {
    return [format(subDays(now, 6), "yyyy-MM-dd"), format(now, "yyyy-MM-dd")];
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
