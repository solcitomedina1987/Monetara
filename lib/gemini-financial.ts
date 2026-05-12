import { GoogleGenerativeAI } from "@google/generative-ai";

const SYSTEM_INSTRUCTION = `Actúa como un experto Analista Financiero. Se te proporcionará un resumen de gastos e ingresos en formato JSON. Tu objetivo es:
Identificar la tendencia principal (¿El usuario está ahorrando o gastando más?).
Detectar variaciones porcentuales críticas (Ej: 'Tu gasto en X subió un 20%').
Analizar la distribución de etiquetas para ver dónde está la fuga de dinero.
Responde en español, con un tono profesional, breve y usando puntos clave (bullets).`;

function readGeminiApiKey(): string | undefined {
  const raw = process.env.GEMINI_API_KEY ?? process.env.NEXT_PUBLIC_GEMINI_API_KEY;
  if (!raw) return undefined;
  const t = raw.trim().replace(/^["']|["']$/g, "");
  return t.length > 0 ? t : undefined;
}

/** Modelos en orden de prueba (el primero disponible en tu cuenta / región gana). */
function modelCandidates(): string[] {
  const fromEnv = process.env.GEMINI_MODEL?.trim();
  const defaults = [
    "gemini-2.0-flash",
    "gemini-2.0-flash-001",
    "gemini-1.5-flash-latest",
    "gemini-1.5-flash-8b",
    "gemini-1.5-flash",
  ];
  const list = fromEnv ? [fromEnv, ...defaults.filter((m) => m !== fromEnv)] : defaults;
  return [...new Set(list)];
}

/**
 * Genera texto de insights a partir del resumen anonimizado.
 * Solo debe ejecutarse en el servidor (p. ej. Route Handler).
 */
export async function generateFinancialInsights(data: unknown): Promise<string> {
  const apiKey = readGeminiApiKey();
  if (!apiKey) {
    throw new Error("NO_API_KEY");
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const userMessage = `Analiza los siguientes datos financieros mensuales:

\`\`\`json
${JSON.stringify(data)}
\`\`\`

Identifica tendencias, variaciones porcentuales significativas y distribución de etiquetas. Devuelve un resumen ejecutivo breve y accionable.`;

  let lastError: unknown;
  for (const modelName of modelCandidates()) {
    try {
      const model = genAI.getGenerativeModel({
        model: modelName,
        systemInstruction: SYSTEM_INSTRUCTION,
      });
      const result = await model.generateContent(userMessage);
      const text = result.response?.text();
      if (text?.trim()) return text.trim();
      lastError = new Error(`EMPTY_RESPONSE:${modelName}`);
    } catch (e) {
      lastError = e;
    }
  }

  const msg = lastError instanceof Error ? lastError.message : String(lastError);
  throw new Error(`GEMINI_FAILED:${msg.slice(0, 400)}`);
}
