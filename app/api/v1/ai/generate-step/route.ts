import { NextRequest, NextResponse } from "next/server";
import { workspaceAiKey } from "@/lib/media-upload";
import { generateAiStep } from "@/lib/ai-step";

/** AI Step "Generar": { goal, context } → { goal, tasks }. */
export async function POST(request: NextRequest) {
  const { ok, key } = await workspaceAiKey();
  if (!ok) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const { goal, context } = (await request.json().catch(() => ({}))) as { goal?: string; context?: string };
  if (!goal?.trim() || !context?.trim()) return NextResponse.json({ error: "Falta el objetivo o el contexto" }, { status: 400 });
  try {
    return NextResponse.json(await generateAiStep(key, goal.trim(), context.trim()));
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "No se pudo generar" }, { status: 502 });
  }
}
