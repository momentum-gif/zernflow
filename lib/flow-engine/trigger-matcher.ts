import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database";

/** Instagram DM events that have their own triggers (see DM_EVENT_KINDS). */
export interface IncomingDmEvent {
  kind: "story_reply" | "story_mention" | "ref_url";
  ref?: string;
  storyId?: string;
}

interface IncomingMessage {
  event?: IncomingDmEvent;
  text?: string;
  postbackPayload?: string;
  quickReplyPayload?: string;
  sender?: { id: string };
}

type Trigger = Database["public"]["Tables"]["triggers"]["Row"];

export async function matchTrigger(
  supabase: SupabaseClient<Database>,
  {
    channelId,
    workspaceId,
    conversationId,
    message,
    isFirstMessage,
  }: {
    channelId: string;
    workspaceId: string;
    conversationId: string;
    message: IncomingMessage;
    /** Caller-known "first inbound message" signal; inbound messages are not
     * mirrored locally, so the legacy count query below always sees 0. */
    isFirstMessage?: boolean;
  }
): Promise<Trigger | null> {
  // Triggers with null channel_id are workspace-wide, NOT global: the flows
  // join must be pinned to the channel's workspace or one tenant's triggers
  // (and flows) would run on another tenant's channels.
  const { data: triggers } = await supabase
    .from("triggers")
    .select("*, flows!inner(status, workspace_id)")
    .or(`channel_id.eq.${channelId},channel_id.is.null`)
    .eq("is_active", true)
    .eq("flows.status", "published")
    .eq("flows.workspace_id", workspaceId)
    .order("priority", { ascending: false });

  if (!triggers || triggers.length === 0) return null;

  const kindOf = (t: Trigger) => (t.config as { kind?: string } | null)?.kind;

  // Ice breakers / main menu items saved from the "Básico" page carry
  // "zf_flow:<flowId>": start that automation from its first trigger.
  if (message.postbackPayload?.startsWith("zf_flow:")) {
    const flowId = message.postbackPayload.slice("zf_flow:".length);
    const match =
      triggers.find((t) => t.flow_id === flowId && !kindOf(t)) ??
      triggers.find((t) => t.flow_id === flowId);
    if (match) return match;
  }

  // 0. Instagram DM events (story reply / story mention / ref link)
  const event = message.event;
  if (event?.kind === "ref_url" && event.ref) {
    const ref = event.ref.toLowerCase().trim();
    const match = triggers.find(
      (t) =>
        kindOf(t) === "ref_url" &&
        ((t.config as { ref?: string }).ref ?? "").toLowerCase().trim() === ref
    );
    if (match) return match;
    // A ref link that opened an empty conversation has nothing else to match.
    if (!message.text) return null;
  }
  if (event?.kind === "story_mention") {
    return triggers.find((t) => kindOf(t) === "story_mention") ?? null;
  }
  if (event?.kind === "story_reply") {
    const text = (message.text ?? "").toLowerCase().trim();
    const match = triggers.find((t) => {
      if (kindOf(t) !== "story_reply") return false;
      const c = t.config as {
        anyComment?: boolean;
        keywords?: Array<string | { value: string }>;
        excludeKeywords?: string[];
      };
      if (c.excludeKeywords?.some((ex) => ex.trim() && text.includes(ex.toLowerCase().trim()))) return false;
      if (c.anyComment) return true;
      return (c.keywords ?? []).some((kw) => {
        const v = (typeof kw === "string" ? kw : kw.value).toLowerCase().trim();
        return v.length > 0 && text.includes(v);
      });
    });
    if (match) return match;
  }

  // Priority order: postback > quick_reply > keyword > welcome > default
  // 1. Check postback triggers
  if (message.postbackPayload) {
    const match = triggers.find(
      (t) =>
        t.type === "postback" &&
        (t.config as { payload?: string })?.payload === message.postbackPayload
    );
    if (match) return match;
  }

  // 2. Check quick_reply triggers
  if (message.quickReplyPayload) {
    const match = triggers.find(
      (t) =>
        t.type === "quick_reply" &&
        (t.config as { payload?: string })?.payload ===
          message.quickReplyPayload
    );
    if (match) return match;
  }

  // 3. Check keyword triggers
  if (message.text) {
    const text = message.text.toLowerCase().trim();

    for (const trigger of triggers.filter((t) => t.type === "keyword" && !kindOf(t))) {
      const config = trigger.config as {
        keywords?: Array<string | { value: string; matchType?: "exact" | "contains" | "startsWith" }>;
        matchType?: "exact" | "contains" | "startsWith";
      };

      if (!config.keywords) continue;

      for (const kw of config.keywords) {
        // Support both formats: plain string or { value, matchType } object
        const keyword = (typeof kw === "string" ? kw : kw.value).toLowerCase();
        const matchType =
          (typeof kw === "object" && kw.matchType) || config.matchType || "contains";

        if (matchType === "exact" && text === keyword) return trigger;
        if (matchType === "contains" && text.includes(keyword)) return trigger;
        if (matchType === "startsWith" && text.startsWith(keyword))
          return trigger;
      }
    }
  }

  // 4. Check welcome trigger (first inbound message for this contact on this channel)
  let firstMessage = isFirstMessage;
  if (firstMessage === undefined) {
    const { count } = await supabase
      .from("messages")
      .select("*", { count: "exact", head: true })
      .eq("conversation_id", conversationId)
      .eq("direction", "inbound");
    firstMessage = count === 1;
  }

  if (firstMessage) {
    const welcomeTrigger = triggers.find((t) => t.type === "welcome");
    if (welcomeTrigger) return welcomeTrigger;
  }

  // 5. Default trigger
  const defaultTrigger = triggers.find((t) => t.type === "default");
  return defaultTrigger || null;
}
