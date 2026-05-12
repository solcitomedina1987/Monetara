import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import type { Account, Category, TransactionFilters, TransactionWithRelations } from "@/lib/types";
import { enumerateMonthKeys, getPeriodDateRangeTuple } from "@/lib/analysis-period";

export type VariacionFila = {
  ruta: string;
  tipo: "ingreso" | "gasto";
  monto_anterior: number;
  monto_actual: number;
  delta_pct: number | null;
  delta_etiqueta: string;
};

export type VariacionMesPar = {
  mes_anterior: string;
  mes_actual: string;
  mes_anterior_label: string;
  mes_actual_label: string;
  filas: VariacionFila[];
};

export type CuentaVariaciones = {
  cuenta_id: string;
  nombre: string;
  variaciones: VariacionMesPar[];
};

export type AnalysisMatrixJson = {
  por_cuenta: CuentaVariaciones[];
  consolidado_general: { nombre: string; variaciones: VariacionMesPar[] };
  resumen_total_seleccion: {
    mes_anterior: string | null;
    mes_actual: string | null;
    mes_anterior_label: string | null;
    mes_actual_label: string | null;
    ingresos_anterior: number;
    ingresos_actual: number;
    ingresos_delta_pct: number | null;
    ingresos_delta_etiqueta: string;
    gastos_anterior: number;
    gastos_actual: number;
    gastos_delta_pct: number | null;
    gastos_delta_etiqueta: string;
  };
};

const EPS = 0.005;
const MAX_FILAS_POR_MES = 28;

type TipoIngGas = "ingreso" | "gasto";

type CatTagMap = Record<string, Record<string, number>>;

type AccountMonthBucket = {
  ingreso: CatTagMap;
  gasto: CatTagMap;
};

type MonthStore = Record<string, Record<string, AccountMonthBucket>>;

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

function monthLabel(m: string): string {
  return format(parseISO(`${m}-01T12:00:00`), "MMM yyyy", { locale: es }).replace(/^\w/, (c) => c.toUpperCase());
}

/** (Actual − Anterior) / Anterior × 100; maneja división por cero. */
export function formatoVariacionPorcentual(anterior: number, actual: number): {
  delta_pct: number | null;
  delta_etiqueta: string;
} {
  const a = Math.round(anterior * 100) / 100;
  const b = Math.round(actual * 100) / 100;
  if (a === 0) {
    if (b === 0) return { delta_pct: null, delta_etiqueta: "—" };
    return { delta_pct: null, delta_etiqueta: "Nuevo" };
  }
  const raw = ((b - a) / a) * 100;
  const rounded = Math.round(raw * 10) / 10;
  return {
    delta_pct: rounded,
    delta_etiqueta: `${raw >= 0 ? "+" : ""}${rounded}%`,
  };
}

function ensureBucket(store: MonthStore, month: string, accountId: string): AccountMonthBucket {
  if (!store[month]) store[month] = {};
  if (!store[month][accountId]) {
    store[month][accountId] = { ingreso: {}, gasto: {} };
  }
  return store[month][accountId];
}

function addCatTagAmount(catMap: CatTagMap, catId: string, tagIds: string[] | undefined, monto: number): void {
  const tags = tagIds?.length ? tagIds : ["__sin_tag__"];
  const share = tags.includes("__sin_tag__") ? monto : monto / tags.length;
  if (!catMap[catId]) catMap[catId] = {};
  for (const tid of tags) {
    catMap[catId][tid] = (catMap[catId][tid] ?? 0) + share;
  }
}

function mergeAccountBuckets(target: AccountMonthBucket, source: AccountMonthBucket): void {
  for (const tipo of ["ingreso", "gasto"] as const) {
    const src = source[tipo];
    const dst = target[tipo];
    for (const [catId, tagMap] of Object.entries(src)) {
      if (!dst[catId]) dst[catId] = {};
      for (const [tagId, val] of Object.entries(tagMap)) {
        dst[catId][tagId] = (dst[catId][tagId] ?? 0) + val;
      }
    }
  }
}

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

function catNombre(catId: string, categories: Category[]): string {
  if (catId === "__sin_cat__") return "Sin categoría";
  return categories.find((c) => c.id === catId)?.nombre ?? `Categoría ${catId.slice(0, 8)}…`;
}

function tagNombre(tagId: string, tagIdToName: Record<string, string>): string {
  if (tagId === "__sin_tag__") return "Sin etiqueta";
  return tagIdToName[tagId] ?? `Etiqueta ${tagId.slice(0, 8)}…`;
}

function buildRuta(
  prefix: string,
  tipo: TipoIngGas,
  catId: string,
  tagId: string,
  categories: Category[],
  tagIdToName: Record<string, string>
): string {
  const tipoLabel = tipo === "ingreso" ? "Ingreso" : "Gasto";
  return `${prefix} > ${tipoLabel} > ${catNombre(catId, categories)} > ${tagNombre(tagId, tagIdToName)}`;
}

function collectFilasForMonthPair(
  store: MonthStore,
  mesAnt: string,
  mesAct: string,
  accountId: string,
  rutaPrefix: string,
  categories: Category[],
  tagIdToName: Record<string, string>,
  showIngresos: boolean,
  showGastos: boolean
): VariacionFila[] {
  const prevB = store[mesAnt]?.[accountId];
  const currB = store[mesAct]?.[accountId];
  const filas: VariacionFila[] = [];

  const tipos: TipoIngGas[] = [];
  if (showIngresos) tipos.push("ingreso");
  if (showGastos) tipos.push("gasto");

  for (const tipo of tipos) {
    const prevMap = prevB?.[tipo] ?? {};
    const currMap = currB?.[tipo] ?? {};
    const catIds = new Set([...Object.keys(prevMap), ...Object.keys(currMap)]);
    for (const catId of catIds) {
      const prevTags = prevMap[catId] ?? {};
      const currTags = currMap[catId] ?? {};
      const tagIds = new Set([...Object.keys(prevTags), ...Object.keys(currTags)]);
      for (const tagId of tagIds) {
        const ma = roundMoney(prevTags[tagId] ?? 0);
        const mb = roundMoney(currTags[tagId] ?? 0);
        if (ma < EPS && mb < EPS) continue;
        const { delta_pct, delta_etiqueta } = formatoVariacionPorcentual(ma, mb);
        filas.push({
          ruta: buildRuta(rutaPrefix, tipo, catId, tagId, categories, tagIdToName),
          tipo,
          monto_anterior: ma,
          monto_actual: mb,
          delta_pct,
          delta_etiqueta,
        });
      }
    }
  }

  filas.sort((a, b) => {
    const da = a.delta_pct == null ? 1e6 : Math.abs(a.delta_pct);
    const db = b.delta_pct == null ? 1e6 : Math.abs(b.delta_pct);
    if (db !== da) return db - da;
    return Math.max(b.monto_anterior, b.monto_actual) - Math.max(a.monto_anterior, a.monto_actual);
  });
  return filas.slice(0, MAX_FILAS_POR_MES);
}

function monthTotalsFromStore(store: MonthStore, month: string): { ingresos: number; gastos: number } {
  const byAcc = store[month];
  if (!byAcc) return { ingresos: 0, gastos: 0 };
  const c = byAcc["__consolidado__"];
  if (c) {
    let ing = 0;
    let gas = 0;
    for (const tagMap of Object.values(c.ingreso)) {
      for (const v of Object.values(tagMap)) ing += v;
    }
    for (const tagMap of Object.values(c.gasto)) {
      for (const v of Object.values(tagMap)) gas += v;
    }
    return { ingresos: roundMoney(ing), gastos: roundMoney(gas) };
  }
  let ing = 0;
  let gas = 0;
  for (const [accId, bucket] of Object.entries(byAcc)) {
    for (const tagMap of Object.values(bucket.ingreso)) {
      for (const v of Object.values(tagMap)) ing += v;
    }
    for (const tagMap of Object.values(bucket.gasto)) {
      for (const v of Object.values(tagMap)) gas += v;
    }
  }
  return { ingresos: roundMoney(ing), gastos: roundMoney(gas) };
}

/**
 * Construye la matriz de comparación mes a mes (cada mes vs su predecesor en el rango),
 * por cuenta y consolidado, respetando filtros de ingreso/gasto.
 */
export function buildAnalysisMatrix(
  transactions: TransactionWithRelations[],
  filters: TransactionFilters,
  accounts: Account[],
  categories: Category[],
  tagIdToName: Record<string, string>
): AnalysisMatrixJson {
  const showIngresos = filters.showIngresos !== false;
  const showGastos = filters.showGastos !== false;

  const tuple = getPeriodDateRangeTuple(filters);
  let from: string;
  let to: string;
  if (tuple) {
    [from, to] = tuple;
  } else {
    const d = boundsFromTransactions(transactions);
    if (!d) {
      return {
        por_cuenta: [],
        consolidado_general: { nombre: "Total General", variaciones: [] },
        resumen_total_seleccion: {
          mes_anterior: null,
          mes_actual: null,
          mes_anterior_label: null,
          mes_actual_label: null,
          ingresos_anterior: 0,
          ingresos_actual: 0,
          ingresos_delta_pct: null,
          ingresos_delta_etiqueta: "—",
          gastos_anterior: 0,
          gastos_actual: 0,
          gastos_delta_pct: null,
          gastos_delta_etiqueta: "—",
        },
      };
    }
    [from, to] = d;
  }

  const monthKeys = enumerateMonthKeys(from, to);
  const store: MonthStore = {};

  const accountName = (id: string) => accounts.find((a) => a.id === id)?.nombre ?? id.slice(0, 8);

  const monthKeySet = new Set(monthKeys);

  for (const t of transactions) {
    if (!inDateRange(t.fecha, from, to)) continue;
    if (t.tipo === "transferencia") continue;
    if (t.tipo === "ingreso" && !showIngresos) continue;
    if (t.tipo === "gasto" && !showGastos) continue;

    const mk = monthKeyFromFecha(t.fecha);
    if (!monthKeySet.has(mk)) continue;

    const accId = t.account_id;
    const tipo = t.tipo as TipoIngGas;
    if (tipo !== "ingreso" && tipo !== "gasto") continue;

    const catId = t.category_id ?? "__sin_cat__";
    const tagIds = t.tags?.map((tg) => tg.id);

    const bucket = ensureBucket(store, mk, accId);
    addCatTagAmount(bucket[tipo], catId, tagIds, Number(t.monto));
  }

  for (const mk of monthKeys) {
    const row = store[mk];
    if (!row) continue;
    const cons: AccountMonthBucket = { ingreso: {}, gasto: {} };
    for (const [accId, bucket] of Object.entries(row)) {
      if (accId === "__consolidado__") continue;
      mergeAccountBuckets(cons, bucket);
    }
    store[mk]!["__consolidado__"] = cons;
  }

  const variacionesForAccount = (accountId: string, nombreCuenta: string): VariacionMesPar[] => {
    const out: VariacionMesPar[] = [];
    for (let i = 1; i < monthKeys.length; i++) {
      const mesAnt = monthKeys[i - 1]!;
      const mesAct = monthKeys[i]!;
      const filas = collectFilasForMonthPair(
        store,
        mesAnt,
        mesAct,
        accountId,
        nombreCuenta,
        categories,
        tagIdToName,
        showIngresos,
        showGastos
      );
      out.push({
        mes_anterior: mesAnt,
        mes_actual: mesAct,
        mes_anterior_label: monthLabel(mesAnt),
        mes_actual_label: monthLabel(mesAct),
        filas,
      });
    }
    return out;
  };

  const accountIdsInData = new Set<string>();
  for (const mk of monthKeys) {
    const row = store[mk];
    if (!row) continue;
    for (const accId of Object.keys(row)) {
      if (accId !== "__consolidado__") accountIdsInData.add(accId);
    }
  }

  let scopeIds: string[];
  if (filters.account_id) {
    scopeIds = accountIdsInData.has(filters.account_id) ? [filters.account_id] : [filters.account_id];
  } else {
    scopeIds = [...accountIdsInData];
  }

  const por_cuenta: CuentaVariaciones[] = scopeIds.map((id) => ({
    cuenta_id: id,
    nombre: accountName(id),
    variaciones: variacionesForAccount(id, `Cuenta ${accountName(id)}`),
  }));

  const nombresCortos = scopeIds.map((id) => accountName(id));
  const consNombre =
    scopeIds.length > 1
      ? `Total General (${nombresCortos.join(" + ")})`
      : scopeIds.length === 1
        ? `Total General (${nombresCortos[0]})`
        : "Total General";

  const consolidado_general = {
    nombre: consNombre,
    variaciones: variacionesForAccount("__consolidado__", consNombre),
  };

  let resumen_total_seleccion: AnalysisMatrixJson["resumen_total_seleccion"];
  if (monthKeys.length < 2) {
    resumen_total_seleccion = {
      mes_anterior: null,
      mes_actual: null,
      mes_anterior_label: null,
      mes_actual_label: null,
      ingresos_anterior: 0,
      ingresos_actual: 0,
      ingresos_delta_pct: null,
      ingresos_delta_etiqueta: "—",
      gastos_anterior: 0,
      gastos_actual: 0,
      gastos_delta_pct: null,
      gastos_delta_etiqueta: "—",
    };
  } else {
    const mesAnt = monthKeys[monthKeys.length - 2]!;
    const mesAct = monthKeys[monthKeys.length - 1]!;
    const tAnt = monthTotalsFromStore(store, mesAnt);
    const tAct = monthTotalsFromStore(store, mesAct);
    const ing = formatoVariacionPorcentual(tAnt.ingresos, tAct.ingresos);
    const gas = formatoVariacionPorcentual(tAnt.gastos, tAct.gastos);
    resumen_total_seleccion = {
      mes_anterior: mesAnt,
      mes_actual: mesAct,
      mes_anterior_label: monthLabel(mesAnt),
      mes_actual_label: monthLabel(mesAct),
      ingresos_anterior: tAnt.ingresos,
      ingresos_actual: tAct.ingresos,
      ingresos_delta_pct: showIngresos ? ing.delta_pct : null,
      ingresos_delta_etiqueta: showIngresos ? ing.delta_etiqueta : "—",
      gastos_anterior: tAnt.gastos,
      gastos_actual: tAct.gastos,
      gastos_delta_pct: showGastos ? gas.delta_pct : null,
      gastos_delta_etiqueta: showGastos ? gas.delta_etiqueta : "—",
    };
  }

  return { por_cuenta, consolidado_general, resumen_total_seleccion };
}
