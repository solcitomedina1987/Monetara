"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { Transaction, TransactionWithRelations, TransactionFilters } from "@/lib/types";
import { balanceDeltaForTransaction } from "@/lib/transaction-balance";
import { startOfMonth, endOfMonth, subMonths, startOfYear, format } from "date-fns";

/** Returns [fechaDesde, fechaHasta] for the given filter period. */
function getPeriodDates(filters?: TransactionFilters): [string, string] | null {
  const now = new Date();
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

export async function getTransactions(filters?: TransactionFilters): Promise<TransactionWithRelations[]> {
  const supabase = await createClient();

  let query = supabase
    .from("transactions")
    .select(`
      *,
      account:accounts!account_id(*),
      category:categories(*),
      to_account:accounts!to_account_id(*),
      tags:transaction_tags(tag:tags(*))
    `)
    .order("fecha", { ascending: false })
    .order("created_at", { ascending: false });

  if (filters?.tipo && filters.tipo !== "todos") {
    query = query.eq("tipo", filters.tipo);
  }

  if (filters?.account_id) {
    query = query.or(`account_id.eq.${filters.account_id},to_account_id.eq.${filters.account_id}`);
  }

  if (filters?.category_id) {
    query = query.eq("category_id", filters.category_id);
  }

  const dates = getPeriodDates(filters);
  if (dates) {
    query = query.gte("fecha", dates[0]).lte("fecha", dates[1]);
  }

  const { data, error } = await query;
  if (error) throw error;

  let result = data.map((t: any) => ({
    ...t,
    tags: t.tags?.map((tt: any) => tt.tag).filter(Boolean) ?? [],
  })) as TransactionWithRelations[];

  // Filter by tags (post-query since N:N)
  if (filters?.tag_ids && filters.tag_ids.length > 0) {
    result = result.filter((t) =>
      filters.tag_ids!.some((tagId) => t.tags.some((tag) => tag.id === tagId))
    );
  }

  return result;
}

export async function createTransaction(payload: {
  monto: number;
  tipo: "ingreso" | "gasto" | "transferencia";
  account_id: string;
  category_id?: string | null;
  fecha: string;
  notas?: string | null;
  to_account_id?: string | null;
  tag_ids?: string[];
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("No autenticado");

  const { tag_ids, ...transactionData } = payload;

  // Double-entry accounting for transfers: insert one gasto + one ingreso
  if (payload.tipo === "transferencia") {
    if (!payload.to_account_id) throw new Error("Cuenta destino requerida para transferencias");

    const ref = Math.random().toString(36).slice(2, 8).toUpperCase();
    const transferNote = `[Transferencia ref:${ref}]${payload.notas ? " · " + payload.notas : ""}`;

    const [gastoResult, ingresoResult] = await Promise.all([
      supabase
        .from("transactions")
        .insert({
          monto: payload.monto,
          tipo: "gasto",
          account_id: payload.account_id,
          to_account_id: payload.to_account_id,
          category_id: null,
          fecha: payload.fecha,
          notas: transferNote,
          user_id: user.id,
        })
        .select()
        .single(),
      supabase
        .from("transactions")
        .insert({
          monto: payload.monto,
          tipo: "ingreso",
          account_id: payload.to_account_id,
          to_account_id: payload.account_id,
          category_id: null,
          fecha: payload.fecha,
          notas: transferNote,
          user_id: user.id,
        })
        .select()
        .single(),
    ]);

    // Rollback if either insert failed
    if (gastoResult.error || ingresoResult.error) {
      if (gastoResult.data) {
        await supabase.from("transactions").delete().eq("id", gastoResult.data.id);
      }
      if (ingresoResult.data) {
        await supabase.from("transactions").delete().eq("id", ingresoResult.data.id);
      }
      throw gastoResult.error ?? ingresoResult.error;
    }

    if (tag_ids && tag_ids.length > 0) {
      await Promise.all([
        supabase.from("transaction_tags").insert(
          tag_ids.map((tag_id) => ({ transaction_id: gastoResult.data!.id, tag_id }))
        ),
        supabase.from("transaction_tags").insert(
          tag_ids.map((tag_id) => ({ transaction_id: ingresoResult.data!.id, tag_id }))
        ),
      ]);
    }

    revalidatePath("/transactions");
    revalidatePath("/dashboard");
    return gastoResult.data as Transaction;
  }

  const { data, error } = await supabase
    .from("transactions")
    .insert({ ...transactionData, user_id: user.id })
    .select()
    .single();
  if (error) throw error;

  if (tag_ids && tag_ids.length > 0) {
    await supabase.from("transaction_tags").insert(
      tag_ids.map((tag_id) => ({ transaction_id: data.id, tag_id }))
    );
  }

  revalidatePath("/transactions");
  revalidatePath("/dashboard");
  return data as Transaction;
}

export async function updateTransaction(id: string, payload: {
  monto?: number;
  tipo?: "ingreso" | "gasto" | "transferencia";
  account_id?: string;
  category_id?: string | null;
  fecha?: string;
  notas?: string | null;
  to_account_id?: string | null;
  tag_ids?: string[];
}) {
  const supabase = await createClient();
  const { tag_ids, ...transactionData } = payload;

  const { data, error } = await supabase
    .from("transactions")
    .update(transactionData)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;

  if (tag_ids !== undefined) {
    await supabase.from("transaction_tags").delete().eq("transaction_id", id);
    if (tag_ids.length > 0) {
      await supabase.from("transaction_tags").insert(
        tag_ids.map((tag_id) => ({ transaction_id: id, tag_id }))
      );
    }
  }

  revalidatePath("/transactions");
  revalidatePath("/dashboard");
  return data as Transaction;
}

export async function deleteTransaction(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("transactions").delete().eq("id", id);
  if (error) throw error;
  revalidatePath("/transactions");
  revalidatePath("/dashboard");
}

export async function getDashboardStats(filters?: TransactionFilters) {
  const supabase = await createClient();

  const dates = getPeriodDates(filters) ?? getPeriodDates({ periodo: "mes_actual" })!;

  let query = supabase
    .from("transactions")
    .select("monto, tipo")
    .gte("fecha", dates[0])
    .lte("fecha", dates[1]);

  if (filters?.account_id) {
    query = query.or(`account_id.eq.${filters.account_id},to_account_id.eq.${filters.account_id}`);
  }

  const { data, error } = await query;
  if (error) throw error;

  const ingresos = data?.filter((t) => t.tipo === "ingreso").reduce((s, t) => s + Number(t.monto), 0) ?? 0;
  const gastos   = data?.filter((t) => t.tipo === "gasto").reduce((s, t) => s + Number(t.monto), 0) ?? 0;

  return { ingresos, gastos, balance: ingresos - gastos };
}

/**
 * Saldo real total:
 * - Con accountId → get_account_balance(id):
 *   saldo_inicial + ingresos − gastos ± transferencias de esa cuenta.
 * - Sin accountId → suma get_account_balance de TODAS las cuentas del usuario,
 *   que es exactamente la sumatoria de los saldos individuales.
 */
export async function getTotalBalance(accountId?: string): Promise<number> {
  const supabase = await createClient();

  if (accountId) {
    const { data, error } = await supabase.rpc("get_account_balance", {
      p_account_id: accountId,
    });
    if (error) throw error;
    return Math.round(Number(data ?? 0) * 100) / 100;
  }

  // Global: sumar el saldo real de cada cuenta
  const { data: accounts, error: accErr } = await supabase
    .from("accounts")
    .select("id");
  if (accErr) throw accErr;
  if (!accounts?.length) return 0;

  const balances = await Promise.all(
    accounts.map(async (a) => {
      const { data, error } = await supabase.rpc("get_account_balance", {
        p_account_id: a.id,
      });
      if (error) throw error;
      return Number(data ?? 0);
    })
  );

  const total = balances.reduce((sum, b) => sum + b, 0);
  return Math.round(total * 100) / 100;
}

/**
 * Returns the running balance at the START of the given filter period.
 * = saldo_inicial of relevant accounts + all transactions before the period start.
 */
export async function getBalanceBeforePeriod(filters?: TransactionFilters): Promise<number> {
  const supabase = await createClient();
  const now = new Date();

  const dates = getPeriodDates(filters) ?? getPeriodDates({ periodo: "mes_actual" })!;
  const periodStart = dates[0];

  // Fetch saldo_inicial for relevant account(s)
  let accountsQuery = supabase.from("accounts").select("id, saldo_inicial");
  if (filters?.account_id) {
    accountsQuery = accountsQuery.eq("id", filters.account_id);
  }
  const { data: accounts } = await accountsQuery;
  if (!accounts || accounts.length === 0) return 0;

  const accountIds = new Set(accounts.map((a) => a.id));
  const totalSaldoInicial = accounts.reduce((s, a) => s + Number(a.saldo_inicial), 0);

  // periodStart is always defined now (getPeriodDates always returns dates)

  // Sum all transactions strictly before the period start
  let txQuery = supabase
    .from("transactions")
    .select("monto, tipo, account_id, to_account_id")
    .lt("fecha", periodStart);

  if (filters?.account_id) {
    txQuery = txQuery.or(
      `account_id.eq.${filters.account_id},to_account_id.eq.${filters.account_id}`
    );
  }

  const { data: txs } = await txQuery;
  if (!txs) return totalSaldoInicial;

  let delta = 0;
  for (const t of txs) {
    delta += balanceDeltaForTransaction(t, accountIds);
  }

  return totalSaldoInicial + delta;
}

export async function getExpensesByCategory(filters?: TransactionFilters) {
  const supabase = await createClient();

  const dates = getPeriodDates(filters) ?? getPeriodDates({ periodo: "mes_actual" })!;

  let query = supabase
    .from("transactions")
    .select("monto, category_id, category:categories(nombre)")
    .eq("tipo", "gasto")
    .gte("fecha", dates[0])
    .lte("fecha", dates[1]);

  if (filters?.account_id) {
    query = query.eq("account_id", filters.account_id);
  }

  const { data, error } = await query;
  if (error) throw error;

  const grouped: Record<string, { value: number; category_id: string | null }> = {};
  data?.forEach((t: any) => {
    const name = t.category?.nombre ?? "Sin categoría";
    if (!grouped[name]) {
      grouped[name] = { value: 0, category_id: t.category_id ?? null };
    }
    grouped[name].value += Number(t.monto);
  });

  return Object.entries(grouped)
    .map(([name, { value, category_id }]) => ({ name, value, category_id }))
    .sort((a, b) => b.value - a.value);
}

export async function getExpensesByTag(filters?: TransactionFilters) {
  const supabase = await createClient();

  const dates = getPeriodDates(filters) ?? getPeriodDates({ periodo: "mes_actual" })!;

  let query = supabase
    .from("transactions")
    .select(`
      monto,
      transaction_tags(tag:tags(id, nombre))
    `)
    .eq("tipo", "gasto")
    .gte("fecha", dates[0])
    .lte("fecha", dates[1]);

  if (filters?.account_id) {
    query = query.eq("account_id", filters.account_id);
  }

  const { data, error } = await query;
  if (error) throw error;

  const grouped: Record<string, { value: number; tag_id: string | null }> = {};
  let untagged = 0;

  data?.forEach((t: any) => {
    const tags = (t.transaction_tags ?? [])
      .map((tt: any) => tt.tag)
      .filter(Boolean);

    if (tags.length === 0) {
      untagged += Number(t.monto);
    } else {
      tags.forEach((tag: any) => {
        if (!grouped[tag.nombre]) {
          grouped[tag.nombre] = { value: 0, tag_id: tag.id };
        }
        grouped[tag.nombre].value += Number(t.monto);
      });
    }
  });

  const result = Object.entries(grouped)
    .map(([name, { value, tag_id }]) => ({ name, value, tag_id }))
    .sort((a, b) => b.value - a.value);

  if (untagged > 0) {
    result.push({ name: "Sin etiqueta", value: untagged, tag_id: null });
  }

  return result;
}
