"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { parseImportDate, parseImportAmount } from "@/lib/import-utils";

// ─── Tipos públicos ───────────────────────────────────────────────────────────

export interface RawImportRow {
  fecha: unknown;
  cuenta: string;
  categoria: string;
  etiqueta: string;
  monto: unknown;
  tipo: string;
  notas: string;
}

export interface RowError {
  row: number;
  message: string;
}

export interface PreviewResult {
  totalRows: number;
  validRows: number;
  errors: RowError[];
  missingCategories: string[];
  missingTags: string[];
}

export interface ImportResult {
  imported: number;
}

function norm(s: string): string {
  return s.trim().toLowerCase();
}

// ─── Acción: preview ──────────────────────────────────────────────────────────

export async function previewImport(rows: RawImportRow[]): Promise<PreviewResult> {
  const supabase = await createClient();

  const [{ data: accounts }, { data: categories }, { data: tags }] = await Promise.all([
    supabase.from("accounts").select("id, nombre"),
    supabase.from("categories").select("id, nombre"),
    supabase.from("tags").select("id, nombre"),
  ]);

  const accountMap   = new Map((accounts   ?? []).map((a) => [norm(a.nombre), a.id]));
  const categoryMap  = new Map((categories ?? []).map((c) => [norm(c.nombre), c.id]));
  const tagMap       = new Map((tags       ?? []).map((t) => [norm(t.nombre), t.id]));

  const errors: RowError[]     = [];
  const missingCats            = new Set<string>();
  const missingTagsSet         = new Set<string>();
  let validRows = 0;

  for (let i = 0; i < rows.length; i++) {
    const r   = rows[i];
    const num = i + 2; // fila 1 = encabezados
    const rowErrors: string[] = [];

    // Fecha
    if (!parseImportDate(r.fecha)) {
      rowErrors.push(`Fecha inválida: "${r.fecha}"`);
    }

    // Monto
    if (parseImportAmount(r.monto) === null) {
      rowErrors.push(`Monto inválido: "${r.monto}"`);
    }

    // Tipo
    const tipo = norm(r.tipo ?? "");
    if (tipo !== "gasto" && tipo !== "ingreso") {
      rowErrors.push(`Tipo inválido: "${r.tipo}" (debe ser "Gasto" o "Ingreso")`);
    }

    // Cuenta — debe existir
    const cuentaNorm = norm(r.cuenta ?? "");
    if (!cuentaNorm) {
      rowErrors.push("Cuenta vacía");
    } else if (!accountMap.has(cuentaNorm)) {
      rowErrors.push(`Cuenta no encontrada: "${r.cuenta}"`);
    }

    // Categoría — puede ser nueva
    const catNorm = norm(r.categoria ?? "");
    if (catNorm && !categoryMap.has(catNorm)) {
      missingCats.add(r.categoria.trim());
    }

    // Etiqueta — puede ser nueva
    const tagNorm = norm(r.etiqueta ?? "");
    if (tagNorm && !tagMap.has(tagNorm)) {
      missingTagsSet.add(r.etiqueta.trim());
    }

    if (rowErrors.length > 0) {
      errors.push({ row: num, message: rowErrors.join("; ") });
    } else {
      validRows++;
    }
  }

  return {
    totalRows: rows.length,
    validRows,
    errors,
    missingCategories: [...missingCats],
    missingTags: [...missingTagsSet],
  };
}

// ─── Acción: confirmImport ────────────────────────────────────────────────────

export async function confirmImport(rows: RawImportRow[]): Promise<ImportResult> {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("No autenticado");

  // Cargar catálogos frescos
  const [{ data: accounts }, { data: categories }, { data: tags }] = await Promise.all([
    supabase.from("accounts").select("id, nombre"),
    supabase.from("categories").select("id, nombre"),
    supabase.from("tags").select("id, nombre"),
  ]);

  const accountMap  = new Map((accounts   ?? []).map((a) => [norm(a.nombre), a.id]));
  const categoryMap = new Map((categories ?? []).map((c) => [norm(c.nombre), c.id]));
  const tagMap      = new Map((tags       ?? []).map((t) => [norm(t.nombre), t.id]));

  // 1. Crear categorías faltantes
  const missingCats = [...new Set(
    rows
      .map((r) => r.categoria?.trim())
      .filter((c): c is string => !!c && !categoryMap.has(norm(c)))
  )];
  if (missingCats.length > 0) {
    const { data: newCats, error } = await supabase
      .from("categories")
      .insert(missingCats.map((nombre) => ({ nombre, user_id: user.id })))
      .select("id, nombre");
    if (error) throw new Error(`Error al crear categorías: ${error.message}`);
    newCats?.forEach((c) => categoryMap.set(norm(c.nombre), c.id));
  }

  // 2. Crear etiquetas faltantes
  const missingTags = [...new Set(
    rows
      .map((r) => r.etiqueta?.trim())
      .filter((t): t is string => !!t && !tagMap.has(norm(t)))
  )];
  if (missingTags.length > 0) {
    const { data: newTags, error } = await supabase
      .from("tags")
      .insert(missingTags.map((nombre) => ({ nombre, user_id: user.id })))
      .select("id, nombre");
    if (error) throw new Error(`Error al crear etiquetas: ${error.message}`);
    newTags?.forEach((t) => tagMap.set(norm(t.nombre), t.id));
  }

  // 3. Insertar transacciones (en bloques de 100 para evitar timeouts)
  let imported = 0;
  const BATCH = 100;

  for (let offset = 0; offset < rows.length; offset += BATCH) {
    const batch = rows.slice(offset, offset + BATCH);

    for (const r of batch) {
      const fecha  = parseImportDate(r.fecha);
      const monto  = parseImportAmount(r.monto);
      const tipo   = norm(r.tipo) as "gasto" | "ingreso";

      if (!fecha || monto === null) continue;

      const account_id  = accountMap.get(norm(r.cuenta ?? ""));
      const category_id = r.categoria?.trim()
        ? (categoryMap.get(norm(r.categoria)) ?? null)
        : null;
      const tag_id = r.etiqueta?.trim()
        ? (tagMap.get(norm(r.etiqueta)) ?? null)
        : null;

      if (!account_id) continue;

      const { data: tx, error: txErr } = await supabase
        .from("transactions")
        .insert({
          user_id: user.id,
          monto,
          tipo,
          account_id,
          category_id,
          fecha,
          notas: r.notas?.trim() || null,
        })
        .select("id")
        .single();

      if (txErr) throw new Error(`Error al insertar transacción: ${txErr.message}`);

      // 4. Vincular etiqueta
      if (tag_id && tx?.id) {
        await supabase
          .from("transaction_tags")
          .insert({ transaction_id: tx.id, tag_id })
          .select();
      }

      imported++;
    }
  }

  revalidatePath("/transactions");
  revalidatePath("/dashboard");
  return { imported };
}
