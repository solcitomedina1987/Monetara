import { GoogleGenerativeAI } from "@google/generative-ai";

const SYSTEM_INSTRUCTION = `Actúa como un experto Analista Financiero. Se te proporcionará un resumen de gastos e ingresos en formato JSON. Tu objetivo es:
Identificar la tendencia principal (¿El usuario está ahorrando o gastando más?).
Detectar variaciones porcentuales críticas (Ej: 'Tu gasto en X subió un 20%').
Analizar la distribución de etiquetas para ver dónde está la fuga de dinero.
Responde en español, con un tono profesional, breve y usando puntos clave (bullets).`;

/**
 * Genera texto de insights a partir del resumen anonimizado.
 * Solo debe ejecutarse en el servidor (p. ej. Route Handler).
 */
export async function generateFinancialInsights(data: unknown): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY ?? process.env.NEXT_PUBLIC_GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("NO_API_KEY");
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: "gemini-1.5-flash",
    systemInstruction: SYSTEM_INSTRUCTION,
  });

  const userMessage = `Analiza los siguientes datos financieros mensuales:

\`\`\`json
${JSON.stringify(data)}
\`\`\`

Identifica tendencias, variaciones porcentuales significativas y distribución de etiquetas. Devuelve un resumen ejecutivo breve y accionable.`;

  const result = await model.generateContent(userMessage);
  const text = result.response?.text();
  if (!text?.trim()) throw new Error("EMPTY_RESPONSE");
  return text.trim();
}
