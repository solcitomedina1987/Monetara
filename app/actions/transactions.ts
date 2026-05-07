"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { Transaction, TransactionWithRelations, TransactionFilters } from "@/lib/types";
import { startOfMonth, endOfMonth, subMonths, format } from "date-fns";

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

  // Period filters
  const now = new Date();
  if (filters?.periodo === "mes_actual") {
    query = query
      .gte("fecha", format(startOfMonth(now), "yyyy-MM-dd"))
      .lte("fecha", format(endOfMonth(now), "yyyy-MM-dd"));
  } else if (filters?.periodo === "mes_anterior") {
    const lastMonth = subMonths(now, 1);
    query = query
      .gte("fecha", format(startOfMonth(lastMonth), "yyyy-MM-dd"))
      .lte("fecha", format(endOfMonth(lastMonth), "yyyy-MM-dd"));
  } else if (filters?.periodo === "personalizado" && filters.fechaDesde && filters.fechaHasta) {
    query = query.gte("fecha", filters.fechaDesde).lte("fecha", filters.fechaHasta);
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

export async function getDashboardStats(accountId?: string) {
  const supabase = await createClient();
  const now = new Date();
  const firstDay = format(startOfMonth(now), "yyyy-MM-dd");
  const lastDay = format(endOfMonth(now), "yyyy-MM-dd");

  let query = supabase
    .from("transactions")
    .select("monto, tipo")
    .gte("fecha", firstDay)
    .lte("fecha", lastDay);

  if (accountId) {
    query = query.or(`account_id.eq.${accountId},to_account_id.eq.${accountId}`);
  }

  const { data, error } = await query;
  if (error) throw error;

  const ingresos = data?.filter((t) => t.tipo === "ingreso").reduce((s, t) => s + Number(t.monto), 0) ?? 0;
  const gastos = data?.filter((t) => t.tipo === "gasto").reduce((s, t) => s + Number(t.monto), 0) ?? 0;

  return { ingresos, gastos, balance: ingresos - gastos };
}

export async function getExpensesByCategory(accountId?: string) {
  const supabase = await createClient();
  const now = new Date();
  const firstDay = format(startOfMonth(now), "yyyy-MM-dd");
  const lastDay = format(endOfMonth(now), "yyyy-MM-dd");

  let query = supabase
    .from("transactions")
    .select("monto, category:categories(nombre)")
    .eq("tipo", "gasto")
    .gte("fecha", firstDay)
    .lte("fecha", lastDay);

  if (accountId) {
    query = query.eq("account_id", accountId);
  }

  const { data, error } = await query;
  if (error) throw error;

  const grouped: Record<string, number> = {};
  data?.forEach((t: any) => {
    const name = t.category?.nombre ?? "Sin categoría";
    grouped[name] = (grouped[name] ?? 0) + Number(t.monto);
  });

  return Object.entries(grouped)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);
}
