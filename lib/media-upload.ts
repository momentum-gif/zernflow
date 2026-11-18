import { createClient } from "@/lib/supabase/server";

const ZERNIO = "https://zernio.com/api/v1";

/** The signed-in user's workspace Zernio key (uploads go to Zernio's media storage). */
export async function workspaceZernioKey(): Promise<string | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: member } = await supabase
    .from("workspace_members")
    .select("workspace_id")
    .eq("user_id", user.id)
    .limit(1)
    .single();
  if (!member) return null;
  const { data: ws } = await supabase
    .from("workspaces")
    .select("late_api_key_encrypted")
    .eq("id", member.workspace_id)
    .single();
  return ws?.late_api_key_encrypted ?? null;
}

/** Zernio POST /v1/media/presign → { uploadUrl, publicUrl }. */
export async function presign(apiKey: string, filename: string, contentType: string, size?: number) {
  const res = await fetch(`${ZERNIO}/media/presign`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ filename, contentType, ...(size ? { size } : {}) }),
  });
  const body = (await res.json().catch(() => ({}))) as { uploadUrl?: string; publicUrl?: string; error?: string; message?: string };
  if (!res.ok || !body.uploadUrl || !body.publicUrl) {
    throw new Error(body.error || body.message || `Zernio presign failed (${res.status})`);
  }
  return { uploadUrl: body.uploadUrl, publicUrl: body.publicUrl };
}

/** The signed-in user's workspace AI Gateway key (null if none saved). */
export async function workspaceAiKey(): Promise<{ ok: boolean; key: string | null }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, key: null };
  const { data: member } = await supabase
    .from("workspace_members")
    .select("workspace_id")
    .eq("user_id", user.id)
    .limit(1)
    .single();
  if (!member) return { ok: false, key: null };
  const { data: ws } = await supabase.from("workspaces").select("ai_api_key").eq("id", member.workspace_id).single();
  return { ok: true, key: ws?.ai_api_key ?? null };
}
