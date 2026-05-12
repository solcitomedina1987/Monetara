import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generateFinancialInsights } from "@/lib/gemini-financial";

export const maxDuration = 60;

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized", markdown: null, fallback: true }, { status: 401 });
  }

  let data: unknown;
  try {
    data = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json", markdown: null, fallback: true }, { status: 400 });
  }

  try {
    const markdown = await generateFinancialInsights(data);
    return NextResponse.json({ markdown, fallback: false, error: null, hint: null });
  } catch (e: unknown) {
    console.error("[api/analysis/insights] Gemini:", e);
    const raw = e instanceof Error ? e.message : String(e);
    const code = raw === "NO_API_KEY" || raw.startsWith("NO_API_KEY") ? "no_key" : "gemini_error";

    let hint =
      "Gemini no respondió. Revisá la clave en Google AI Studio, cuotas y que el servidor se haya reiniciado tras editar .env.local.";
    if (raw.includes("404") || raw.includes("not found") || raw.includes("NOT_FOUND")) {
      hint =
        "El modelo no está disponible para tu clave o región. En .env.local probá: GEMINI_MODEL=gemini-2.0-flash (o el ID que liste tu proyecto en AI Studio).";
    }
    if (raw.includes("API_KEY_INVALID") || raw.includes("401") || raw.includes("403")) {
      hint =
        "Clave API rechazada. Verificá GEMINI_API_KEY (sin comillas extra ni espacios) y que sea la de Google AI Studio / Vertex según corresponda.";
    }
    if (raw.includes("429") || raw.includes("RESOURCE_EXHAUSTED")) {
      hint = "Cuota o límite de velocidad alcanzado; probá más tarde o otro proyecto de facturación.";
    }

    return NextResponse.json({
      markdown: null,
      fallback: true,
      error: code,
      hint,
      /** Solo para depuración en desarrollo (mensaje truncado del SDK). */
      debug: process.env.NODE_ENV === "development" ? raw.slice(0, 500) : undefined,
    });
  }
}
