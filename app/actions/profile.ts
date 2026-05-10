"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { Profile, ThemePreference } from "@/lib/types";

export async function getProfile(): Promise<Profile | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  if (error) throw error;
  return data as Profile | null;
}

export async function updateProfile(payload: {
  nombre?: string;
  apellido?: string;
  avatar_url?: string | null;
  default_theme?: ThemePreference | null;
}): Promise<Profile> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("No autenticado");

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (payload.nombre !== undefined) updates.nombre = payload.nombre;
  if (payload.apellido !== undefined) updates.apellido = payload.apellido;
  if (payload.avatar_url !== undefined) updates.avatar_url = payload.avatar_url;
  if (payload.default_theme !== undefined) updates.default_theme = payload.default_theme;

  const { data, error } = await supabase
    .from("profiles")
    .update(updates)
    .eq("id", user.id)
    .select()
    .single();

  if (error) throw error;
  revalidatePath("/perfil");
  revalidatePath("/dashboard");
  return data as Profile;
}

export async function updatePassword(newPassword: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) throw error;
}
