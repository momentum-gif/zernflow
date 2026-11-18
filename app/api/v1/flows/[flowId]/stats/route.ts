import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/v1/flows/:flowId/stats — per-step numbers for the builder, like
 * ManyChat's stats on each block: messages sent per step and taps per button.
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ flowId: string }> }) {
  const { flowId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sent: Record<string, number> = {};
  const clicks: Record<string, number> = {};
  const PAGE = 1000;

  // RLS scopes analytics_events to the caller's workspaces.
  for (let from = 0; from < 50_000; from += PAGE) {
    const { data, error } = await supabase
      .from("analytics_events")
      .select("event_type, metadata")
      .eq("flow_id", flowId)
      .in("event_type", ["message_sent", "button_clicked"])
      .range(from, from + PAGE - 1);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    for (const row of data ?? []) {
      const m = (row.metadata ?? {}) as { nodeId?: string | null; handle?: string | null };
      if (row.event_type === "message_sent" && m.nodeId) sent[m.nodeId] = (sent[m.nodeId] ?? 0) + 1;
      if (row.event_type === "button_clicked" && m.handle) clicks[m.handle] = (clicks[m.handle] ?? 0) + 1;
    }
    if (!data || data.length < PAGE) break;
  }

  return NextResponse.json({ sent, clicks });
}
