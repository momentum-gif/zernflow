import { NextRequest, NextResponse } from "next/server";
import { presign, workspaceZernioKey } from "@/lib/media-upload";

/**
 * POST multipart "file" → { publicUrl }. Fallback for browsers that cannot PUT
 * straight to the storage URL; limited by the server body size (~4 MB).
 */
export async function POST(request: NextRequest) {
  const key = await workspaceZernioKey();
  if (!key) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!file || typeof file === "string") return NextResponse.json({ error: "Falta el archivo" }, { status: 400 });
  try {
    const type = file.type || "application/octet-stream";
    const { uploadUrl, publicUrl } = await presign(key, file.name, type, file.size);
    const put = await fetch(uploadUrl, { method: "PUT", headers: { "Content-Type": type }, body: await file.arrayBuffer() });
    if (!put.ok) throw new Error(`Upload failed (${put.status})`);
    return NextResponse.json({ publicUrl });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "No se pudo subir" }, { status: 502 });
  }
}
