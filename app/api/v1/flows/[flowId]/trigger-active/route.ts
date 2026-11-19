import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * POST { nodeId, active } — ManyChat's "Activa este disparador": switches a
 * trigger on/off right away in the live automation.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ flowId: string }> }) {
  const { flowId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { nodeId, active } = (await request.json().catch(() => ({}))) as { nodeId?: string; active?: boolean };
  if (!nodeId || typeof active !== "boolean") return NextResponse.json({ error: "Bad request" }, { status: 400 });

  // RLS limits this to the user's workspace.
  const { error } = await supabase
    .from("triggers")
    .update({ is_active: active })
    .eq("flow_id", flowId)
    .eq("config->>nodeId", nodeId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
