import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/** Up to when the contact has read this chat ("Visto" in the Inbox). */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ conversationId: string }> }) {
  const { conversationId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: conv } = await supabase.from("conversations").select("contact_id").eq("id", conversationId).maybeSingle();
  if (!conv) return NextResponse.json({ seenAt: null });
  const { data } = await supabase
    .from("analytics_events")
    .select("metadata")
    .eq("contact_id", conv.contact_id)
    .eq("event_type", "conversation_seen")
    .order("created_at", { ascending: false })
    .limit(20);
  const seen = ((data ?? []) as Array<{ metadata: { conversationId?: string; upTo?: string } | null }>)
    .filter((e) => e.metadata?.conversationId === conversationId && e.metadata?.upTo)
    .map((e) => e.metadata!.upTo!)
    .sort()
    .pop();
  return NextResponse.json({ seenAt: seen ?? null });
}
