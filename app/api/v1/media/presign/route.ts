import { NextRequest, NextResponse } from "next/server";
import { presign, workspaceZernioKey } from "@/lib/media-upload";

/** POST { filename, contentType, size } → { uploadUrl, publicUrl } for a direct upload. */
export async function POST(request: NextRequest) {
  const key = await workspaceZernioKey();
  if (!key) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const { filename, contentType, size } = (await request.json().catch(() => ({}))) as {
    filename?: string;
    contentType?: string;
    size?: number;
  };
  if (!filename || !contentType) return NextResponse.json({ error: "Falta el archivo" }, { status: 400 });
  try {
    return NextResponse.json(await presign(key, filename, contentType, size));
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "No se pudo subir" }, { status: 502 });
  }
}
