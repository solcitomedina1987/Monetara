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
    return NextResponse.json({ markdown, fallback: false, error: null });
  } catch (e: unknown) {
    const code = e instanceof Error ? e.message : "UNKNOWN";
    return NextResponse.json({
      markdown: null,
      fallback: true,
      error: code === "NO_API_KEY" ? "no_key" : "gemini_error",
    });
  }
}
