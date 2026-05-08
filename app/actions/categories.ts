"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { Category } from "@/lib/types";

export async function getCategories() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("categories")
    .select("*")
    .order("nombre");
  if (error) throw error;
  return data as Category[];
}

export async function getActiveCategories() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("categories")
    .select("*")
    .eq("estado", "activo")
    .order("nombre");
  if (error) throw error;
  return data as Category[];
}

export async function createCategory(nombre: string, icono?: string | null) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("No autenticado");

  const { data: category, error } = await supabase
    .from("categories")
    .insert({ nombre, user_id: user.id, icono: icono ?? null })
    .select()
    .single();
  if (error) throw error;

  revalidatePath("/categories");
  return category as Category;
}

export async function updateCategory(id: string, nombre: string, icono?: string | null) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("categories")
    .update({ nombre, icono: icono ?? null })
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;

  revalidatePath("/categories");
  return data as Category;
}

export async function deactivateCategory(id: string) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("categories")
    .update({ estado: "inactivo" })
    .eq("id", id);
  if (error) throw error;
  revalidatePath("/categories");
}

export async function getCategoryTransactionCount(id: string): Promise<{ ingresos: number; gastos: number }> {
  const supabase = await createClient();
  const oneYearAgo = new Date();
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

  const { data, error } = await supabase
    .from("transactions")
    .select("tipo")
    .eq("category_id", id)
    .gte("fecha", oneYearAgo.toISOString().split("T")[0]);

  if (error) throw error;

  const ingresos = data?.filter((t) => t.tipo === "ingreso").length ?? 0;
  const gastos = data?.filter((t) => t.tipo === "gasto").length ?? 0;
  return { ingresos, gastos };
}
