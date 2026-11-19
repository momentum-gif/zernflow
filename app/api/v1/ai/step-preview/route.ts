import { NextRequest, NextResponse } from "next/server";
import { workspaceAiKey } from "@/lib/media-upload";
import { runAiStepTurn, type AiStepData, type AiTurn } from "@/lib/ai-step";

/** AI Step chat preview: { data, history } → { reply, fields, done }. */
export async function POST(request: NextRequest) {
  const { ok, key } = await workspaceAiKey();
  if (!ok) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const { data, history, known } = (await request.json().catch(() => ({}))) as {
    data?: AiStepData;
    history?: AiTurn[];
    known?: Record<string, string>;
  };
  if (!data) return NextResponse.json({ error: "Falta el paso" }, { status: 400 });
  try {
    return NextResponse.json(await runAiStepTurn(key, data, (history ?? []).slice(-30), known ?? {}));
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "No se pudo responder" }, { status: 502 });
  }
}
