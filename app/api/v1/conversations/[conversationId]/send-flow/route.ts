import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { executeFlow } from "@/lib/flow-engine/engine";

/**
 * POST /api/v1/conversations/:conversationId/send-flow  { flowId }
 *
 * ManyChat Live Chat "Enviar automatización": the person in the inbox picks an
 * automation and it runs for this contact from its first step.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ conversationId: string }> }) {
  const { conversationId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { flowId } = (await request.json().catch(() => ({}))) as { flowId?: string };
  if (!flowId) return NextResponse.json({ error: "flowId required" }, { status: 400 });

  // RLS: these reads only succeed for members of the workspace.
  const { data: conversation } = await supabase
    .from("conversations")
    .select("id, workspace_id, channel_id, contact_id, late_conversation_id")
    .eq("id", conversationId)
    .single();
  if (!conversation) return NextResponse.json({ error: "Conversación no encontrada" }, { status: 404 });

  const { data: flow } = await supabase
    .from("flows")
    .select("id, status, workspace_id")
    .eq("id", flowId)
    .single();
  if (!flow || flow.workspace_id !== conversation.workspace_id) {
    return NextResponse.json({ error: "Automatización no encontrada" }, { status: 404 });
  }
  if (flow.status !== "published") {
    return NextResponse.json({ error: "Publica la automatización antes de enviarla" }, { status: 400 });
  }

  // Meta: automations only within 24 h of the contact's last message (ManyChat
  // blocks them too). After that you can still write by hand for up to 7 days.
  const { data: contact } = await supabase
    .from("contacts")
    .select("last_interaction_at")
    .eq("id", conversation.contact_id)
    .maybeSingle();
  const lastAt = contact?.last_interaction_at ? new Date(contact.last_interaction_at).getTime() : NaN;
  if (Number.isFinite(lastAt) && Date.now() - lastAt > 24 * 60 * 60 * 1000) {
    return NextResponse.json(
      {
        error:
          "Pasaron más de 24 h desde su último mensaje: Instagram no permite automatizaciones. Escríbele a mano (hasta 7 días).",
      },
      { status: 400 }
    );
  }

  const service = await createServiceClient();

  // Like ManyChat, sending a new automation replaces any question still waiting for an answer.
  await service
    .from("flow_sessions")
    .update({ status: "cancelled", waiting_for_input: false })
    .eq("contact_id", conversation.contact_id)
    .eq("status", "active")
    .eq("waiting_for_input", true);

  try {
    await executeFlow(service, {
      triggerId: "manual",
      flowId,
      channelId: conversation.channel_id,
      contactId: conversation.contact_id,
      conversationId: conversation.id,
      workspaceId: conversation.workspace_id,
      lateConversationId: conversation.late_conversation_id ?? undefined,
      incomingMessage: {},
    });
  } catch (err) {
    console.error("[send-flow]", err);
    return NextResponse.json({ error: "No se pudo enviar la automatización" }, { status: 500 });
  }

  // Touch the conversation so open inboxes refresh the thread.
  await service.from("conversations").update({ last_message_at: new Date().toISOString() }).eq("id", conversation.id);

  return NextResponse.json({ ok: true });
}
