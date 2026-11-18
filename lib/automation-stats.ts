import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database";

/**
 * One definition of every automation number, used by the automation list, the
 * builder and Analytics so they never disagree (ManyChat-style):
 *
 * - Ejecuciones: times the automation started (one per trigger fire).
 * - Enviados (per step): people who received that message step.
 * - Clics (per button): people who tapped that button.
 * - CTR (per step): people who tapped any of its buttons ÷ people who received it.
 * - CTR (automation): people who tapped any button ÷ people who received any message.
 *
 * Counting people instead of raw events keeps tests and repeats from inflating
 * the numbers, and a button can never show more clicks than its step's sends.
 */
export interface FlowStats {
  runs: number;
  sent: number;
  clicked: number;
  ctr: number | null;
  nodes: Record<string, { sent: number; clicked: number; ctr: number | null }>;
  buttons: Record<string, number>;
}

const PAGE = 1000;

export async function computeFlowStats(
  supabase: SupabaseClient<Database>,
  flowId: string,
  range?: { start: string; end: string },
): Promise<FlowStats> {
  const { count: runs } = await (range
    ? supabase
        .from("analytics_events")
        .select("*", { count: "exact", head: true })
        .eq("flow_id", flowId)
        .eq("event_type", "flow_started")
        .gte("created_at", range.start)
        .lte("created_at", range.end)
    : supabase
        .from("analytics_events")
        .select("*", { count: "exact", head: true })
        .eq("flow_id", flowId)
        .eq("event_type", "flow_started"));

  const sentBy = new Map<string, Set<string>>(); // nodeId -> contacts
  const clickBy = new Map<string, Set<string>>(); // handle -> contacts
  const clickNode = new Map<string, Set<string>>(); // nodeId -> contacts who tapped any of its buttons
  const sentAll = new Set<string>();
  const clickedAll = new Set<string>();

  for (let from = 0; from < 100_000; from += PAGE) {
    let q = supabase
      .from("analytics_events")
      .select("event_type, contact_id, metadata")
      .eq("flow_id", flowId)
      .in("event_type", ["message_sent", "button_clicked"]);
    if (range) q = q.gte("created_at", range.start).lte("created_at", range.end);
    const { data } = await q.range(from, from + PAGE - 1);
    for (const row of data ?? []) {
      const contact = row.contact_id;
      if (!contact) continue;
      const m = (row.metadata ?? {}) as { nodeId?: string | null; handle?: string | null };
      if (row.event_type === "message_sent") {
        sentAll.add(contact);
        if (m.nodeId) {
          if (!sentBy.has(m.nodeId)) sentBy.set(m.nodeId, new Set());
          sentBy.get(m.nodeId)!.add(contact);
        }
      } else {
        clickedAll.add(contact);
        if (m.handle) {
          if (!clickBy.has(m.handle)) clickBy.set(m.handle, new Set());
          clickBy.get(m.handle)!.add(contact);
        }
        if (m.nodeId) {
          if (!clickNode.has(m.nodeId)) clickNode.set(m.nodeId, new Set());
          clickNode.get(m.nodeId)!.add(contact);
        }
      }
    }
    if (!data || data.length < PAGE) break;
  }

  const nodes: FlowStats["nodes"] = {};
  for (const [nodeId, contacts] of sentBy) {
    const clicked = clickNode.get(nodeId)?.size ?? 0;
    nodes[nodeId] = {
      sent: contacts.size,
      clicked,
      ctr: contacts.size > 0 ? Math.min(100, Math.round((clicked / contacts.size) * 100)) : null,
    };
  }
  const buttons: FlowStats["buttons"] = {};
  for (const [handle, contacts] of clickBy) buttons[handle] = contacts.size;

  return {
    runs: runs ?? 0,
    sent: sentAll.size,
    clicked: clickedAll.size,
    ctr: sentAll.size > 0 ? Math.min(100, Math.round((clickedAll.size / sentAll.size) * 100)) : null,
    nodes,
    buttons,
  };
}
