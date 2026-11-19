import { generateText, createGateway } from "ai";

/** ManyChat "AI Step": an objective, a list of tasks and context for the AI. */
export interface AiStepTask {
  text: string;
  /** "Guardar respuesta del usuario como" */
  saveField?: boolean;
  /** custom field slug, or "email" / "phone" */
  fieldSlug?: string;
}

export interface AiStepData {
  goal?: string;
  context?: string;
  tasks?: AiStepTask[];
  model?: string;
}

export interface AiTurn {
  role: "user" | "assistant";
  content: string;
}

export const DEFAULT_AI_MODEL = "openai/gpt-4o-mini";

export function isAiStep(data: unknown): data is AiStepData {
  const d = data as (AiStepData & { aiStep?: boolean }) | null;
  return d?.aiStep === true || Array.isArray(d?.tasks);
}

function gateway(apiKey?: string | null) {
  const key = apiKey || process.env.AI_GATEWAY_API_KEY;
  if (!key) throw new Error("Falta la clave de IA. Agrégala en Ajustes → AI Gateway.");
  return createGateway({ apiKey: key });
}

function parseJson<T>(text: string): T | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1)) as T;
  } catch {
    return null;
  }
}

/** "Generar": turn "Dile a la IA lo que debe hacer" + context into an objective and tasks. */
export async function generateAiStep(apiKey: string | null, goal: string, context: string, model?: string) {
  const gw = gateway(apiKey);
  const { text } = await generateText({
    model: gw(model || DEFAULT_AI_MODEL),
    temperature: 0.3,
    maxOutputTokens: 600,
    system:
      "Eres un experto en automatizaciones de Instagram como ManyChat. Divide el objetivo en tareas cortas y concretas que un asistente de IA hará en una conversación por mensaje directo. Una tarea es un objetivo (qué averiguar o decidir), nunca una frase para enviar: los ejemplos de preguntas, respuestas o criterios del contexto NO son tareas, la IA los leerá del contexto. Usa las menos tareas posibles (normalmente 1 a 3). Responde SOLO con JSON.",
    prompt: `Objetivo: ${goal}\nContexto del negocio: ${context}\n\nDevuelve JSON así: {"goal": "objetivo resumido en una frase", "tasks": [{"text": "tarea en una frase, en español", "saveField": true si la tarea pide un dato al usuario que convenga guardar}]}. Entre 1 y 6 tareas.`,
  });
  const parsed = parseJson<{ goal?: string; tasks?: Array<{ text?: string; saveField?: boolean }> }>(text);
  const tasks = (parsed?.tasks ?? [])
    .map((t) => ({ text: String(t.text ?? "").trim(), saveField: !!t.saveField }))
    .filter((t) => t.text);
  if (!tasks.length) throw new Error("La IA no devolvió tareas. Intenta escribir el objetivo con más detalle.");
  return { goal: parsed?.goal?.trim() || goal, tasks };
}

function systemPrompt(data: AiStepData) {
  const tasks = (data.tasks ?? [])
    .map((t, i) => {
      const save = t.saveField && t.fieldSlug ? ` → guarda el resultado en el campo "${t.fieldSlug}"` : "";
      return `${i + 1}. ${t.text}${save}`;
    })
    .join("\n");
  return `Eres el asistente que responde los mensajes directos de Instagram de este negocio. Escribe como una persona real: mensajes cortos, cálidos, en el mismo idioma y tono que el contacto, sin decir que eres una IA salvo que te lo pregunten.

OBJETIVO: ${data.goal || "(sin objetivo)"}

TAREAS (en orden, una a la vez; no hagas más de una pregunta por mensaje):
${tasks || "(sin tareas)"}

CONTEXTO DEL NEGOCIO:
${data.context || "(sin contexto)"}

REGLAS:
- No vuelvas a preguntar algo que el contacto ya respondió en la conversación.
- Si ya tienes todo lo necesario para completar las tareas, devuelve "reply" vacío y "done": true (no escribas nada más).
- Si la respuesta no alcanza para decidir, haz UNA pregunta corta en el mismo estilo que el contexto.

Cada vez responde SOLO con JSON:
{"reply": "el próximo mensaje para el contacto (vacío si no hace falta decir nada más)", "fields": {"campo": "valor"} con los datos ya obtenidos para los campos indicados, "done": true cuando todas las tareas estén completas}`;
}

/** One AI Step turn: what to say next, data to save and whether the step is finished. */
export async function runAiStepTurn(apiKey: string | null, data: AiStepData, history: AiTurn[]) {
  const gw = gateway(apiKey);
  const { text } = await generateText({
    model: gw(data.model || DEFAULT_AI_MODEL),
    temperature: 0.5,
    maxOutputTokens: 500,
    system: systemPrompt(data),
    messages: history.length ? history : [{ role: "user", content: "(El contacto acaba de llegar a este paso. Empieza.)" }],
  });
  const parsed = parseJson<{ reply?: string; fields?: Record<string, unknown>; done?: boolean }>(text);
  if (!parsed) return { reply: text.trim(), fields: {}, done: false };
  const fields: Record<string, string> = {};
  for (const [k, v] of Object.entries(parsed.fields ?? {})) {
    if (v !== null && v !== undefined && String(v).trim()) fields[k] = String(v).trim();
  }
  return { reply: String(parsed.reply ?? "").trim(), fields, done: !!parsed.done };
}
