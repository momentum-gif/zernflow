import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database";

/**
 * One definition of every automation number, used by the automation list, the
 * builder and Analytics so they never disagree (ManyChat-style):
 *
 * - Ejecuciones / Envíos: times the automation started (one per trigger fire).
 * - Contactos únicos: people who started it.
 * - Per message step (ManyChat's numbers on top of each block):
 *     Enviado        people who received the step (Total = times it was sent)
 *     Entregado      sent without error (Instagram has no delivery receipt, so
 *                    a successful send counts as delivered, like ManyChat shows)
 *     Abierto        people who read it (Instagram "seen" receipts)
 *     Clics          people who tapped one of its buttons or links
 * - CTR: people who clicked ÷ people who received it.
 *
 * Percentages are over "Enviado" (unique), so a step can never show more than
 * 100%.
 */
export interface StepStats {
  /** people who reached this step (any step type) */
  reached: number;
  reachedTotal: number;
  sent: number;
  sentTotal: number;
  delivered: number;
  deliveredTotal: number;
  read: number;
  readTotal: number;
  clicked: number;
  clickedTotal: number;
  ctr: number | null;
}

export interface FlowStats {
  runs: number;
  /** people who started the automation */
  unique: number;
  sent: number;
  clicked: number;
  ctr: number | null;
  nodes: Record<string, StepStats>;
  buttons: Record<string, number>;
  /** per trigger: { runs, unique } (key = trigger id) */
  triggers: Record<string, { runs: number; unique: number }>;
}

const PAGE = 1000;
const pct = (n: number, d: number) => (d > 0 ? Math.min(100, Math.round((n / d) * 100)) : null);

export async function computeFlowStats(
  supabase: SupabaseClient<Database>,
  flowId: string,
  range?: { start: string; end: string },
  opts?: { light?: boolean },
): Promise<FlowStats> {
  // The automation list and Analytics only need runs and CTR.
  const types = opts?.light
    ? ["flow_started", "message_sent", "button_clicked"]
    : ["flow_started", "node_executed", "message_sent", "message_failed", "message_read", "button_clicked"];
  type Acc = { total: number; people: Set<string> };
  const acc = () => ({ total: 0, people: new Set<string>() });
  const bump = (map: Map<string, Acc>, key: string, contact: string, by = 1) => {
    if (!map.has(key)) map.set(key, acc());
    const a = map.get(key)!;
    a.total += by;
    a.people.add(contact);
  };

  let runs = 0;
  const starters = new Set<string>();
  const triggerRuns = new Map<string, Acc>();
  const reached = new Map<string, Acc>();
  const sent = new Map<string, Acc>(); // message steps: one count per execution
  const sentSeen = new Set<string>(); // nodeId|contact|minute — collapse a step's several texts
  const failed = new Map<string, Acc>();
  const read = new Map<string, Acc>();
  const readSeen = new Set<string>();
  const clicks = new Map<string, Acc>();
  const clickBy = new Map<string, Set<string>>(); // handle -> people
  const sentAll = new Set<string>();
  const clickedAll = new Set<string>();

  for (let from = 0; from < 200_000; from += PAGE) {
    let q = supabase
      .from("analytics_events")
      .select("event_type, contact_id, metadata, created_at")
      .eq("flow_id", flowId)
      .in("event_type", types)
      .order("created_at");
    if (range) q = q.gte("created_at", range.start).lte("created_at", range.end);
    const { data } = await q.range(from, from + PAGE - 1);
    for (const row of data ?? []) {
      const contact = row.contact_id;
      if (!contact) continue;
      const m = (row.metadata ?? {}) as { nodeId?: string | null; handle?: string | null; triggerId?: string | null; messageId?: string | null };
      switch (row.event_type) {
        case "flow_started":
          runs++;
          starters.add(contact);
          if (m.triggerId) bump(triggerRuns, m.triggerId, contact);
          break;
        case "node_executed":
          if (m.nodeId) bump(reached, m.nodeId, contact);
          break;
        case "message_sent": {
          sentAll.add(contact);
          if (!m.nodeId) break;
          // A step with several texts logs one message_sent per text: count it once per run.
          const key = `${m.nodeId}|${contact}|${String(row.created_at).slice(0, 16)}`;
          if (sentSeen.has(key)) break;
          sentSeen.add(key);
          bump(sent, m.nodeId, contact);
          break;
        }
        case "message_failed":
          if (m.nodeId) bump(failed, m.nodeId, contact);
          break;
        case "message_read": {
          if (!m.nodeId) break;
          const key = `${m.nodeId}|${m.messageId ?? contact + row.created_at}`;
          if (readSeen.has(key)) break;
          readSeen.add(key);
          bump(read, m.nodeId, contact);
          break;
        }
        case "button_clicked":
          clickedAll.add(contact);
          if (m.handle) {
            if (!clickBy.has(m.handle)) clickBy.set(m.handle, new Set());
            clickBy.get(m.handle)!.add(contact);
          }
          if (m.nodeId) bump(clicks, m.nodeId, contact);
          break;
      }
    }
    if (!data || data.length < PAGE) break;
  }

  const nodes: FlowStats["nodes"] = {};
  const ids = new Set([...reached.keys(), ...sent.keys(), ...failed.keys(), ...read.keys(), ...clicks.keys()]);
  for (const id of ids) {
    const ok = sent.get(id);
    const bad = failed.get(id);
    // Enviado = every attempt; Entregado = the ones Instagram accepted.
    const attempted = new Set([...(ok?.people ?? []), ...(bad?.people ?? [])]);
    const sentU = attempted.size;
    const clickedU = Math.min(sentU || Infinity, clicks.get(id)?.people.size ?? 0);
    const readU = Math.min(sentU || Infinity, read.get(id)?.people.size ?? 0);
    nodes[id] = {
      reached: reached.get(id)?.people.size ?? 0,
      reachedTotal: reached.get(id)?.total ?? 0,
      sent: sentU,
      sentTotal: (ok?.total ?? 0) + (bad?.total ?? 0),
      delivered: ok?.people.size ?? 0,
      deliveredTotal: ok?.total ?? 0,
      read: readU,
      readTotal: read.get(id)?.total ?? 0,
      clicked: clickedU,
      clickedTotal: clicks.get(id)?.total ?? 0,
      ctr: pct(clickedU, sentU),
    };
  }

  const buttons: FlowStats["buttons"] = {};
  for (const [handle, people] of clickBy) buttons[handle] = people.size;

  const triggers: FlowStats["triggers"] = {};
  for (const [id, a] of triggerRuns) triggers[id] = { runs: a.total, unique: a.people.size };

  return {
    runs,
    unique: starters.size,
    sent: sentAll.size,
    clicked: clickedAll.size,
    ctr: pct(clickedAll.size, sentAll.size),
    nodes,
    buttons,
    triggers,
  };
}
