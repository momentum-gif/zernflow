import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database";

/**
 * ManyChat "Eventos de contactos": automations that start when something
 * happens to a contact inside ZernFlow (not on Instagram). Stored as `keyword`
 * trigger rows with config.kind = "contact_event" (see lib/flow-triggers.ts).
 */
export type ContactEvent =
  | "contact_created"
  | "tag_added"
  | "tag_removed"
  | "custom_field_changed"
  | "sequence_subscribed"
  | "sequence_unsubscribed";

export const CONTACT_EVENTS: readonly ContactEvent[] = [
  "contact_created",
  "tag_added",
  "tag_removed",
  "custom_field_changed",
  "sequence_subscribed",
  "sequence_unsubscribed",
];

export interface ContactEventDetail {
  tagName?: string;
  fieldSlug?: string;
  sequenceId?: string;
}

/** Contact-event runs started from inside another such run stop after this many hops. */
const MAX_CHAIN = 3;

export async function fireContactEvent(
  supabase: SupabaseClient<Database>,
  params: {
    workspaceId: string;
    contactId: string;
    event: ContactEvent;
    detail?: ContactEventDetail;
    /** The flow that caused the event; it is not started again by its own change. */
    sourceFlowId?: string;
    /** How many contact-event runs led to this one. */
    chain?: number;
  },
) {
  const chain = params.chain ?? 0;
  if (chain >= MAX_CHAIN) return;

  try {
    const { data: triggers } = await supabase
      .from("triggers")
      .select("*, flows!inner(status, workspace_id)")
      .eq("type", "keyword")
      .eq("is_active", true)
      .eq("flows.status", "published")
      .eq("flows.workspace_id", params.workspaceId);

    const matching = (triggers ?? []).filter((t) => {
      if (t.flow_id === params.sourceFlowId) return false;
      const c = (t.config ?? {}) as {
        kind?: string;
        event?: string;
        tagName?: string;
        fieldSlug?: string;
        sequenceId?: string;
      };
      if (c.kind !== "contact_event" || c.event !== params.event) return false;
      const d = params.detail ?? {};
      if (c.tagName && c.tagName.trim().toLowerCase() !== (d.tagName ?? "").trim().toLowerCase()) return false;
      if (c.fieldSlug && c.fieldSlug !== d.fieldSlug) return false;
      if (c.sequenceId && c.sequenceId !== d.sequenceId) return false;
      return true;
    });
    if (matching.length === 0) return;

    // Messages need a conversation: use the contact's most recent one.
    const { data: conversation } = await supabase
      .from("conversations")
      .select("id, channel_id, late_conversation_id")
      .eq("contact_id", params.contactId)
      .order("last_message_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!conversation) return;

    const { executeFlow } = await import("@/lib/flow-engine/engine");
    for (const trigger of matching) {
      await executeFlow(supabase, {
        triggerId: trigger.id,
        flowId: trigger.flow_id,
        channelId: conversation.channel_id,
        contactId: params.contactId,
        conversationId: conversation.id,
        workspaceId: params.workspaceId,
        lateConversationId: conversation.late_conversation_id ?? undefined,
        incomingMessage: {},
        variables: { __contact_event_chain: String(chain + 1) },
      });
    }
  } catch (err) {
    console.error("[contact-events] failed to fire", params.event, err);
  }
}
