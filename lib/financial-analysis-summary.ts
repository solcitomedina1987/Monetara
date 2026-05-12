import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import type { TransactionWithRelations, TransactionFilters } from "@/lib/types";
import { enumerateMonthKeys, getPeriodDateRangeTuple } from "@/lib/analysis-period";

export type MonthlyAnalysisPoint = {
  monthKey: string;
  monthLabel: string;
  ingresos: number;
  gastos: number;
};

/** Payload anonimizado para Gemini (IDs, montos, sin notas ni nombres de usuario). */
export type FinancialAiPayload = {
  filters: {
    periodo: string;
    account_id: string | null;
    category_id: string | null;
    tag_ids: string[];
  };
  monthly: Array<{
    m: string;
    ingresos: number;
    gastos: number;
    gastos_por_etiqueta_id: Record<string, number>;
  }>;
  variacion_mes_a_mes: Array<{
    m: string;
    ingresos_pct_vs_anterior: number | null;
    gastos_pct_vs_anterior: number | null;
  }>;
  totales: { ingresos: number; gastos: number };
};

function monthKeyFromFecha(fecha: string): string {
  return fecha.slice(0, 7);
}

function boundsFromTransactions(transactions: TransactionWithRelations[]): [string, string] | null {
  if (transactions.length === 0) return null;
  let min = transactions[0].fecha;
  let max = transactions[0].fecha;
  for (const t of transactions) {
    if (t.fecha < min) min = t.fecha;
    if (t.fecha > max) max = t.fecha;
  }
  return [min, max];
}

function inDateRange(fecha: string, from: string, to: string): boolean {
  return fecha >= from && fecha <= to;
}

/** Reparte el gasto de una transacción entre etiquetas (partes iguales) para no inflar totales. */
function addGastoTagsToBucket(
  bucket: Record<string, number>,
  monto: number,
  tags: { id: string }[] | undefined
): void {
  const list = tags?.length ? tags : [];
  if (list.length === 0) return;
  const share = monto / list.length;
  for (const tag of list) {
    bucket[tag.id] = (bucket[tag.id] ?? 0) + share;
  }
}

export function buildMonthlyChartSeries(
  transactions: TransactionWithRelations[],
  filters: TransactionFilters
): MonthlyAnalysisPoint[] {
  const tuple = getPeriodDateRangeTuple(filters);
  let from: string;
  let to: string;
  if (tuple) {
    [from, to] = tuple;
  } else {
    const derived = boundsFromTransactions(transactions);
    if (!derived) return [];
    [from, to] = derived;
  }

  const monthKeys = enumerateMonthKeys(from, to);
  const ing: Record<string, number> = Object.fromEntries(monthKeys.map((k) => [k, 0]));
  const gas: Record<string, number> = Object.fromEntries(monthKeys.map((k) => [k, 0]));

  for (const t of transactions) {
    if (!inDateRange(t.fecha, from, to)) continue;
    const mk = monthKeyFromFecha(t.fecha);
    if (!(mk in ing)) continue;
    if (t.tipo === "ingreso") ing[mk] += Number(t.monto);
    else if (t.tipo === "gasto") gas[mk] += Number(t.monto);
  }

  return monthKeys.map((monthKey) => ({
    monthKey,
    monthLabel: format(parseISO(`${monthKey}-01T12:00:00`), "MMM yyyy", { locale: es }).replace(/^\w/, (c) => c.toUpperCase()),
    ingresos: Math.round(ing[monthKey] * 100) / 100,
    gastos: Math.round(gas[monthKey] * 100) / 100,
  }));
}

export function buildFinancialAiPayload(
  transactions: TransactionWithRelations[],
  filters: TransactionFilters
): FinancialAiPayload {
  const tuple = getPeriodDateRangeTuple(filters);
  let from: string;
  let to: string;
  if (tuple) {
    [from, to] = tuple;
  } else {
    const derived = boundsFromTransactions(transactions);
    if (!derived) {
      return {
        filters: {
          periodo: filters.periodo ?? "ultimo_año",
          account_id: filters.account_id ?? null,
          category_id: filters.category_id ?? null,
          tag_ids: filters.tag_ids ?? [],
        },
        monthly: [],
        variacion_mes_a_mes: [],
        totales: { ingresos: 0, gastos: 0 },
      };
    }
    [from, to] = derived;
  }

  const monthKeys = enumerateMonthKeys(from, to);
  const ing: Record<string, number> = Object.fromEntries(monthKeys.map((k) => [k, 0]));
  const gas: Record<string, number> = Object.fromEntries(monthKeys.map((k) => [k, 0]));
  const tagByMonth: Record<string, Record<string, number>> = {};
  for (const k of monthKeys) tagByMonth[k] = {};

  for (const t of transactions) {
    if (!inDateRange(t.fecha, from, to)) continue;
    const mk = monthKeyFromFecha(t.fecha);
    if (!(mk in ing)) continue;
    if (t.tipo === "ingreso") ing[mk] += Number(t.monto);
    else if (t.tipo === "gasto") {
      const m = Number(t.monto);
      gas[mk] += m;
      addGastoTagsToBucket(tagByMonth[mk], m, t.tags);
    }
  }

  const monthly = monthKeys.map((m) => ({
    m,
    ingresos: Math.round(ing[m] * 100) / 100,
    gastos: Math.round(gas[m] * 100) / 100,
    gastos_por_etiqueta_id: Object.fromEntries(
      Object.entries(tagByMonth[m]).map(([id, v]) => [id, Math.round(v * 100) / 100])
    ),
  }));

  let prevI: number | null = null;
  let prevG: number | null = null;
  const variacion_mes_a_mes = monthKeys.map((m) => {
    const i = ing[m];
    const g = gas[m];
    let ingresos_pct_vs_anterior: number | null = null;
    let gastos_pct_vs_anterior: number | null = null;
    if (prevI !== null && prevI !== 0) {
      ingresos_pct_vs_anterior = Math.round(((i - prevI) / prevI) * 1000) / 10;
    }
    if (prevG !== null && prevG !== 0) {
      gastos_pct_vs_anterior = Math.round(((g - prevG) / prevG) * 1000) / 10;
    }
    prevI = i;
    prevG = g;
    return { m, ingresos_pct_vs_anterior, gastos_pct_vs_anterior };
  });

  const totales = {
    ingresos: Math.round(monthKeys.reduce((s, m) => s + ing[m], 0) * 100) / 100,
    gastos: Math.round(monthKeys.reduce((s, m) => s + gas[m], 0) * 100) / 100,
  };

  return {
    filters: {
      periodo: filters.periodo ?? "ultimo_año",
      account_id: filters.account_id ?? null,
      category_id: filters.category_id ?? null,
      tag_ids: filters.tag_ids ?? [],
    },
    monthly,
    variacion_mes_a_mes,
    totales,
  };
}

function pctChange(prev: number, curr: number): string {
  if (prev === 0) return curr === 0 ? "0%" : "nuevo";
  const p = Math.round(((curr - prev) / prev) * 1000) / 10;
  return `${p >= 0 ? "+" : ""}${p}%`;
}

/** Análisis descriptivo local (markdown) si Gemini no está disponible o falla. */
export function generateStatisticalInsightsMarkdown(
  series: MonthlyAnalysisPoint[],
  payload: FinancialAiPayload,
  labels: {
    categoryName?: string | null;
    tagIdToName?: Record<string, string>;
    appliedTagSummary?: string | null;
  }
): string {
  const lines: string[] = [];
  lines.push("### Resumen estadístico");
  lines.push("");
  lines.push(
    `- **Totales del período:** ingresos **${payload.totales.ingresos.toLocaleString("es-AR")}** · gastos **${payload.totales.gastos.toLocaleString("es-AR")}**`
  );

  if (labels.appliedTagSummary) {
    lines.push(`- **Filtro de etiquetas:** ${labels.appliedTagSummary}`);
  }

  const gastosVals = series.map((s) => s.gastos);
  const mean = gastosVals.reduce((a, b) => a + b, 0) / Math.max(gastosVals.length, 1);
  const maxG = Math.max(...gastosVals, 0);
  const maxIdx = gastosVals.indexOf(maxG);
  if (mean > 0 && maxG > mean * 1.45 && maxIdx >= 0) {
    lines.push(
      `- **Posible anomalía:** el mes **${series[maxIdx]?.monthLabel ?? "?"}** concentró gastos por encima del promedio mensual (~**${Math.round((maxG / mean) * 10) / 10}×** la media).`
    );
  }

  const mom = payload.variacion_mes_a_mes.filter(
    (v) => v.gastos_pct_vs_anterior !== null && Math.abs(v.gastos_pct_vs_anterior) >= 12
  );
  if (mom.length > 0) {
    lines.push("- **Variaciones relevantes en gastos (mes a mes, ≥12%):**");
    for (const row of mom.slice(-6)) {
      const label = format(parseISO(`${row.m}-01T12:00:00`), "MMM yyyy", { locale: es });
      lines.push(`  - **${label}:** ${row.gastos_pct_vs_anterior}% vs mes anterior`);
    }
  }

  if (labels.categoryName && payload.monthly.length > 0) {
    const mergedTags: Record<string, number> = {};
    for (const mo of payload.monthly) {
      for (const [tid, amt] of Object.entries(mo.gastos_por_etiqueta_id)) {
        mergedTags[tid] = (mergedTags[tid] ?? 0) + amt;
      }
    }
    const entries = Object.entries(mergedTags).sort((a, b) => b[1] - a[1]);
    const totalTag = entries.reduce((s, [, v]) => s + v, 0);
    if (totalTag > 0 && entries.length > 0) {
      const [topId, topAmt] = entries[0];
      const share = Math.round((topAmt / totalTag) * 1000) / 10;
      const topLabel = labels.tagIdToName?.[topId] ?? `etiqueta ${topId.slice(0, 8)}…`;
      lines.push(
        `- **Etiquetas (categoría *${labels.categoryName}*):** el **${share}%** del gasto atribuido a etiquetas recae en **${topLabel}**${entries.length > 1 ? ` (${entries.length} etiquetas distintas).` : "."}`
      );
    }
  }

  if (series.length >= 2) {
    const last = series[series.length - 1];
    const prev = series[series.length - 2];
    lines.push("");
    lines.push(
      `- **Último mes (${last.monthLabel}):** ingresos vs anterior **${pctChange(prev.ingresos, last.ingresos)}** · gastos vs anterior **${pctChange(prev.gastos, last.gastos)}**`
    );
  }

  lines.push("");
  lines.push("*Este bloque se generó con reglas estadísticas locales (sin modelo de IA).*");
  return lines.join("\n");
}
