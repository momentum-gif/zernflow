import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database";

/**
 * ManyChat "Fecha/Hora en que ocurrió": start an automation for each contact
 * whose date field (a custom field such as a birthday or an appointment date)
 * falls on a given day, optionally a few days before or after, at a chosen
 * time. Runs from the every-minute cron; each contact is started once per day.
 *
 * Trigger rows: type "keyword", config.kind = "date_time", with fieldSlug,
 * offsetDays (negative = before the date), time "HH:MM", timezone and yearly.
 */

interface DateConfig {
  kind?: string;
  nodeId?: string;
  fieldSlug?: string;
  offsetDays?: number;
  time?: string;
  timezone?: string;
  yearly?: boolean;
}

/** Today's date and current HH:MM in a time zone. */
function nowIn(timezone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  return { date: `${get("year")}-${get("month")}-${get("day")}`, time: `${get("hour")}:${get("minute")}` };
}

function shiftDate(isoDate: string, days: number) {
  const d = new Date(`${isoDate}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Accepts YYYY-MM-DD, DD/MM/YYYY and DD-MM-YYYY; returns YYYY-MM-DD or null. */
function parseDate(value: string | null): string | null {
  if (!value) return null;
  const v = value.trim();
  let m = v.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  m = v.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  return null;
}

export async function processDateTriggers(supabase: SupabaseClient<Database>) {
  const { data: triggers } = await supabase
    .from("triggers")
    .select("*, flows!inner(status, workspace_id)")
    .eq("type", "keyword")
    .eq("is_active", true)
    .eq("flows.status", "published");

  for (const trigger of triggers ?? []) {
    const c = (trigger.config ?? {}) as DateConfig;
    if (c.kind !== "date_time" || !c.fieldSlug) continue;
    const workspaceId = (trigger.flows as unknown as { workspace_id: string }).workspace_id;

    try {
      const tz = c.timezone || "UTC";
      const now = nowIn(tz);
      if (now.time < (c.time || "09:00")) continue;

      // A date field matching "today - offset" fires today.
      const target = shiftDate(now.date, -(c.offsetDays ?? 0));

      const { data: field } = await supabase
        .from("custom_field_definitions")
        .select("id")
        .eq("workspace_id", workspaceId)
        .eq("slug", c.fieldSlug)
        .maybeSingle();
      if (!field) continue;

      const { data: values } = await supabase
        .from("contact_custom_fields")
        .select("contact_id, value")
        .eq("field_id", field.id)
        .limit(5000);

      const due = (values ?? []).filter((row) => {
        const d = parseDate(row.value as string | null);
        if (!d) return false;
        return c.yearly ? d.slice(5) === target.slice(5) : d === target;
      });
      if (due.length === 0) continue;

      // Once per contact per day for this trigger.
      const { data: already } = await supabase
        .from("analytics_events")
        .select("contact_id, metadata")
        .eq("flow_id", trigger.flow_id)
        .eq("event_type", "date_trigger_fired")
        .gte("created_at", new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString())
        .limit(5000);
      const done = new Set(
        (already ?? [])
          .filter((r) => {
            const m = (r.metadata ?? {}) as { triggerId?: string; day?: string };
            return m.triggerId === trigger.id && m.day === now.date;
          })
          .map((r) => r.contact_id),
      );

      const { executeFlow } = await import("@/lib/flow-engine/engine");
      for (const row of due) {
        if (done.has(row.contact_id)) continue;
        await supabase.from("analytics_events").insert({
          workspace_id: workspaceId,
          flow_id: trigger.flow_id,
          contact_id: row.contact_id,
          event_type: "date_trigger_fired",
          metadata: { triggerId: trigger.id, day: now.date },
        });

        const { data: conversation } = await supabase
          .from("conversations")
          .select("id, channel_id, late_conversation_id")
          .eq("contact_id", row.contact_id)
          .order("last_message_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (!conversation) continue;

        await executeFlow(supabase, {
          triggerId: trigger.id,
          flowId: trigger.flow_id,
          channelId: conversation.channel_id,
          contactId: row.contact_id,
          conversationId: conversation.id,
          workspaceId,
          lateConversationId: conversation.late_conversation_id ?? undefined,
          incomingMessage: {},
        });
      }
    } catch (err) {
      console.error("[date-triggers] trigger", trigger.id, err);
    }
  }
}
