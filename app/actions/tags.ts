"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { Tag } from "@/lib/types";

export async function getTags() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tags")
    .select("*")
    .order("nombre");
  if (error) throw error;
  return data as Tag[];
}

export async function getActiveTags() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tags")
    .select("*")
    .eq("estado", "activo")
    .order("nombre");
  if (error) throw error;
  return data as Tag[];
}

export async function createTag(nombre: string): Promise<Tag> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("No autenticado");

  const { data, error } = await supabase
    .from("tags")
    .insert({ nombre, user_id: user.id })
    .select()
    .single();
  if (error) throw error;
  revalidatePath("/tags");
  revalidatePath("/categories");
  return data as Tag;
}

export async function upsertTag(nombre: string): Promise<Tag> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("No autenticado");

  const { data: existing } = await supabase
    .from("tags")
    .select("*")
    .eq("user_id", user.id)
    .ilike("nombre", nombre)
    .single();

  if (existing) return existing as Tag;
  return createTag(nombre);
}

export async function updateTag(id: string, nombre: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tags")
    .update({ nombre })
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  revalidatePath("/tags");
  return data as Tag;
}

export async function deactivateTag(id: string) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("tags")
    .update({ estado: "inactivo" })
    .eq("id", id);
  if (error) throw error;
  revalidatePath("/tags");
}

export async function activateTag(id: string) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("tags")
    .update({ estado: "activo" })
    .eq("id", id);
  if (error) throw error;
  revalidatePath("/tags");
  revalidatePath("/categories");
}
