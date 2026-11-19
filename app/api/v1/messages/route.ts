import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createZernioClient } from "@/lib/zernio-client";
import { messagePreview } from "@/lib/message-preview";

/**
 * GET /api/v1/messages?conversationId=...
 *
 * Fetches messages from the Zernio API (source of truth) instead of a local mirror.
 */
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const conversationId = request.nextUrl.searchParams.get("conversationId");
  if (!conversationId) {
    return NextResponse.json({ error: "conversationId required" }, { status: 400 });
  }

  // Look up the Zernio conversation ID and workspace API key
  const { data: conversation } = await supabase
    .from("conversations")
    .select("late_conversation_id, workspace_id, channels(late_account_id)")
    .eq("id", conversationId)
    .single();

  if (!conversation) {
    return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
  }

  const { data: workspace } = await supabase
    .from("workspaces")
    .select("late_api_key_encrypted")
    .eq("id", conversation.workspace_id)
    .single();

  if (!workspace?.late_api_key_encrypted) {
    return NextResponse.json({ error: "API key not configured" }, { status: 400 });
  }

  const channel = conversation.channels as { late_account_id: string } | null;
  if (!channel?.late_account_id) {
    return NextResponse.json({ error: "Channel not found" }, { status: 404 });
  }

  // Conversations that started from a comment have no Zernio conversation id
  // until we look it up: find the DM thread with this contact and remember it.
  let lateConversationId = conversation.late_conversation_id as string | null;
  if (!lateConversationId) {
    lateConversationId = await findZernioConversation(
      supabase,
      workspace.late_api_key_encrypted,
      channel.late_account_id,
      conversationId,
    );
    if (!lateConversationId) return NextResponse.json([]);
  }

  // Fetch messages from Zernio API
  try {
    const zernio = createZernioClient(workspace.late_api_key_encrypted);
    const res = await zernio.messages.getInboxConversationMessages({
      path: { conversationId: lateConversationId },
      query: { accountId: channel.late_account_id },
    });

    // The Zernio endpoint returns { success, messages: [...] } — NOT { data }.
    const zernioMessages =
      (res.data as { messages?: unknown[] })?.messages ??
      (res.data as { data?: unknown[] })?.data ??
      [];

    // Map Zernio messages to the shape the inbox UI expects
    const messages = zernioMessages.map((m: any) => ({
      id: m.id,
      conversation_id: conversationId,
      // Zernio says "incoming" / "outgoing"; older payloads used inbound / outbound.
      direction:
        m.direction === "outbound" || m.direction === "outgoing" || m.isOutgoing === true || m.fromMe === true
          ? "outbound"
          : "inbound",
      text: m.text ?? m.message ?? null,
      attachments: m.attachments?.length ? m.attachments : null,
      quick_reply_payload: null,
      postback_payload: null,
      callback_data: null,
      platform_message_id: m.platformMessageId ?? null,
      sent_by_flow_id: null,
      sent_by_node_id: null,
      sent_by_user_id: null,
      status: "sent",
      created_at: m.sentAt ?? m.createdAt ?? new Date().toISOString(),
    }));

    return NextResponse.json(messages);
  } catch (error) {
    console.error("Failed to fetch messages from Zernio API:", error);
    return NextResponse.json(
      { error: "Failed to fetch messages" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/v1/messages
 *
 * Sends a message via Zernio API. No local message storage — Zernio is the source of truth.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { conversationId, text } = body;

  if (!conversationId || !text) {
    return NextResponse.json(
      { error: "conversationId and text required" },
      { status: 400 }
    );
  }

  // Get conversation with channel info
  const { data: conversation } = await supabase
    .from("conversations")
    .select("*, channels(*)")
    .eq("id", conversationId)
    .single();

  if (!conversation) {
    return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
  }

  if (!conversation.late_conversation_id) {
    return NextResponse.json(
      { error: "No Zernio conversation ID linked to this conversation" },
      { status: 400 }
    );
  }

  const channel = conversation.channels as { late_account_id: string } | null;
  if (!channel?.late_account_id) {
    return NextResponse.json({ error: "Channel not found or missing Zernio account ID" }, { status: 404 });
  }

  const { data: workspace } = await supabase
    .from("workspaces")
    .select("late_api_key_encrypted")
    .eq("id", conversation.workspace_id)
    .single();

  if (!workspace?.late_api_key_encrypted) {
    return NextResponse.json({ error: "API key not configured" }, { status: 400 });
  }

  // Meta rules for a person writing by hand (like ManyChat's Inbox): free within
  // 24 h of the contact's last message; from 24 h to 7 days only with the
  // HUMAN_AGENT tag; after 7 days Instagram does not allow it.
  const { data: contact } = await supabase
    .from("contacts")
    .select("last_interaction_at")
    .eq("id", conversation.contact_id)
    .maybeSingle();
  const lastAt = contact?.last_interaction_at ? new Date(contact.last_interaction_at).getTime() : NaN;
  const ageMs = Number.isFinite(lastAt) ? Date.now() - lastAt : 0;
  const DAY = 24 * 60 * 60 * 1000;
  if (ageMs > 7 * DAY) {
    return NextResponse.json(
      {
        error:
          "Pasaron más de 7 días desde el último mensaje de esta persona. Instagram no deja escribirle hasta que vuelva a escribirte.",
      },
      { status: 400 }
    );
  }
  const humanAgent = ageMs > DAY;

  // Send via Zernio SDK — Zernio stores the message, no local insert needed
  try {
    const zernio = createZernioClient(workspace.late_api_key_encrypted);
    const res = await zernio.messages.sendInboxMessage({
      path: { conversationId: conversation.late_conversation_id },
      body: {
        accountId: channel.late_account_id,
        message: text,
        ...(humanAgent ? { messagingType: "MESSAGE_TAG", messageTag: "HUMAN_AGENT" } : {}),
      } as Parameters<typeof zernio.messages.sendInboxMessage>[0]["body"],
    });

    const messageId = (res.data as any)?.data?.messageId ?? null;

    // Update conversation's last message info (ZernFlow-specific metadata)
    await supabase
      .from("conversations")
      .update({
        last_message_at: new Date().toISOString(),
        last_message_preview: messagePreview(text),
      })
      .eq("id", conversationId);

    // Return a message-shaped response for the UI's optimistic update
    return NextResponse.json(
      {
        id: messageId ?? `sent-${Date.now()}`,
        conversation_id: conversationId,
        direction: "outbound",
        text,
        attachments: null,
        quick_reply_payload: null,
        postback_payload: null,
        callback_data: null,
        platform_message_id: messageId,
        sent_by_flow_id: null,
        sent_by_node_id: null,
        sent_by_user_id: user.id,
        status: "sent",
        created_at: new Date().toISOString(),
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Failed to send message via Zernio API:", error);
    return NextResponse.json(
      { error: `Failed to send message: ${error}` },
      { status: 500 }
    );
  }
}

async function findZernioConversation(
  supabase: Awaited<ReturnType<typeof createClient>>,
  apiKey: string,
  accountId: string,
  conversationId: string,
): Promise<string | null> {
  const { data: conv } = await supabase
    .from("conversations")
    .select("contact_id, channel_id")
    .eq("id", conversationId)
    .single();
  if (!conv) return null;
  const { data: link } = await supabase
    .from("contact_channels")
    .select("platform_sender_id, platform_username")
    .eq("contact_id", conv.contact_id)
    .eq("channel_id", conv.channel_id)
    .maybeSingle();
  if (!link?.platform_sender_id) return null;

  try {
    const res = await fetch(
      `https://zernio.com/api/v1/inbox/conversations?accountId=${encodeURIComponent(accountId)}&limit=100`,
      { headers: { Authorization: `Bearer ${apiKey}` }, cache: "no-store" },
    );
    if (!res.ok) return null;
    const body = (await res.json()) as Record<string, unknown>;
    const list = ((body.conversations ?? body.data ?? []) as Array<Record<string, unknown>>) || [];
    const match = list.find(
      (c) =>
        c.participantId === link.platform_sender_id ||
        (link.platform_username && c.participantUsername === link.platform_username),
    );
    const id = match && typeof match.id === "string" ? match.id : null;
    if (id) {
      await supabase.from("conversations").update({ late_conversation_id: id }).eq("id", conversationId);
    }
    return id;
  } catch {
    return null;
  }
}
