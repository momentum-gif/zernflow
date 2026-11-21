import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { computeFlowStats } from "@/lib/automation-stats";
import { liveFlowIds } from "@/lib/flow-live-status";

/**
 * GET /api/v1/flows/pick-list
 * Automations for the Inbox "Escoger automatización" window: status (ACTIVO /
 * DETENIDA / BORRADOR), triggers, Ejecuciones, CTR and last change.
 */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: membership } = await supabase
    .from("workspace_members")
    .select("workspace_id")
    .eq("user_id", user.id)
    .limit(1)
    .single();
  if (!membership) return NextResponse.json({ flows: [] });

  const { data } = await supabase
    .from("flows")
    .select("id, name, status, nodes, updated_at")
    .eq("workspace_id", membership.workspace_id)
    .neq("status", "archived")
    .order("updated_at", { ascending: false });

  const live = await liveFlowIds(
    supabase,
    ((data ?? []) as Array<{ id: string; status: string }>).filter((f) => f.status === "published").map((f) => f.id)
  );
  const flows = await Promise.all(
    ((data ?? []) as Array<{ id: string; name: string; status: string; nodes: unknown; updated_at: string }>).map(async (f) => {
      const published = f.status === "published";
      const st = published ? await computeFlowStats(supabase, f.id, undefined, { light: true }) : null;
      const triggers = (Array.isArray(f.nodes) ? f.nodes : [])
        .filter((n: { type?: string; data?: { triggerType?: string } }) => n?.type === "trigger" && n.data?.triggerType && n.data.triggerType !== "none")
        .map((n: { data: { triggerType: string; active?: boolean } }) => ({ type: n.data.triggerType, active: n.data.active !== false }));
      return {
        id: f.id,
        name: f.name,
        status: !published ? "draft" : !live.has(f.id) ? "stopped" : "active",
        updatedAt: f.updated_at,
        runs: st ? st.runs : null,
        ctr: st ? st.ctr : null,
        triggers,
      };
    }),
  );
  return NextResponse.json({ flows });
}
