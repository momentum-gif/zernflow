import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { computeFlowStats } from "@/lib/automation-stats";

/** GET /api/v1/flows/:flowId/stats — per-step numbers for the builder (see lib/automation-stats). */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ flowId: string }> }) {
  const { flowId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // RLS scopes analytics_events to the caller's workspaces.
  return NextResponse.json(await computeFlowStats(supabase, flowId));
}
