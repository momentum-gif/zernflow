import { NextRequest, NextResponse } from "next/server";
import { createHmac } from "crypto";
import { createClient } from "@/lib/supabase/server";
import { createZernioClient } from "@/lib/zernio-client";
import { getOrCreateWorkspaceWebhookSecret } from "@/lib/zernio-webhook";
import { appBaseUrl } from "@/lib/app-url";

/**
 * POST /api/v1/channels/webhook-replay?apply=1
 *
 * Re-delivers comments/DMs that Zernio could not deliver (failed webhook
 * logs), skipping people who already got a message from us after that event.
 * Without apply=1 it only reports what it would do.
 */
type Log = {
  eventId?: string;
  event?: string;
  status?: string;
  createdAt?: string;
  requestPayload?: Record<string, any>;
};

export async function POST(request: NextRequest) {
  const apply = request.nextUrl.searchParams.get("apply") === "1";
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: membership } = await supabase
    .from("workspace_members")
    .select("workspace_id, workspaces(late_api_key_encrypted)")
    .eq("user_id", user.id)
    .limit(1)
    .single();
  const key = (membership?.workspaces as unknown as { late_api_key_encrypted: string | null } | null)?.late_api_key_encrypted;
  if (!membership || !key) return NextResponse.json({ error: "Zernio no configurado" }, { status: 400 });
  const zernio = createZernioClient(key);

  // 1. Failed deliveries (newest first), minus events that later succeeded.
  const logs: Log[] = [];
  for (let skip = 0; skip < 1000; skip += 100) {
    const l = await zernio.webhooks.getWebhookLogs({ query: { limit: 100, skip } as never });
    const page = ((l?.data as { logs?: Log[] } | undefined)?.logs ?? []) as Log[];
    logs.push(...page);
    if (page.length < 100) break;
  }
  const delivered = new Set(logs.filter((l) => l.status !== "failed").map((l) => l.eventId));
  const seen = new Set<string>();
  const failed = logs.filter((l) => {
    if (l.status !== "failed" || !l.eventId || !l.requestPayload || delivered.has(l.eventId) || seen.has(l.eventId)) return false;
    if (l.event !== "comment.received" && l.event !== "message.received") return false;
    seen.add(l.eventId);
    return true;
  });

  // 2. Who already heard from us after the event (Zernio conversation history).
  const accountId = failed[0]?.requestPayload?.account?.id as string | undefined;
  const convByPerson = new Map<string, string>();
  if (accountId) {
    const res = await zernio.messages.listInboxConversations({ query: { accountId, limit: 100, platform: "instagram" } });
    for (const c of ((res.data as { data?: Array<{ id?: string; participantId?: string }> })?.data ?? [])) {
      if (c.participantId && c.id) convByPerson.set(c.participantId, c.id);
    }
  }

  const plan: Array<Record<string, unknown>> = [];
  for (const l of failed) {
    const p = l.requestPayload!;
    const isComment = l.event === "comment.received";
    const personId: string | undefined = isComment ? p.comment?.author?.id : p.message?.sender?.id;
    const who: string = (isComment ? p.comment?.author?.username : p.message?.sender?.username || p.message?.sender?.name) ?? "?";
    const at: string = (isComment ? p.comment?.createdAt : p.message?.sentAt) ?? p.timestamp ?? l.createdAt ?? "";
    let answered = false;

    if (isComment && p.comment?.id) {
      const { data: logged } = await supabase.from("comment_logs").select("id").eq("platform_comment_id", p.comment.id).maybeSingle();
      if (logged) answered = true;
    }
    const convId = personId ? convByPerson.get(personId) : undefined;
    if (!answered && convId && accountId) {
      const m = await zernio.messages.getInboxConversationMessages({ path: { conversationId: convId }, query: { accountId } });
      const msgs = ((m.data as { messages?: Array<{ direction?: string; createdAt?: string; sentAt?: string }> })?.messages ?? []);
      answered = msgs.some((x) => x.direction === "outgoing" && new Date(x.sentAt ?? x.createdAt ?? 0).getTime() > new Date(at).getTime());
    }

    plan.push({
      event: l.event,
      who,
      text: (isComment ? p.comment?.text : p.message?.text) ?? "",
      post: isComment ? p.comment?.platformPostId ?? p.comment?.postId : null,
      at,
      answered,
      eventId: l.eventId,
    });
  }

  if (!apply) return NextResponse.json({ plan });

  // 3. Re-deliver the unanswered ones to our own webhook, signed like Zernio does.
  const base = appBaseUrl(request);
  if (!base) return NextResponse.json({ error: "No public app URL" }, { status: 500 });
  const secret = await getOrCreateWorkspaceWebhookSecret(supabase, membership.workspace_id);
  const results: Array<Record<string, unknown>> = [];
  for (const item of plan) {
    if (item.answered) continue;
    const log = failed.find((l) => l.eventId === item.eventId)!;
    const body = JSON.stringify(log.requestPayload);
    const res = await fetch(`${base}/api/webhooks/late`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-late-signature": createHmac("sha256", secret).update(body).digest("hex"),
        "x-late-event-id": String(item.eventId),
      },
      body,
    });
    results.push({ who: item.who, event: item.event, status: res.status, body: (await res.text()).slice(0, 120) });
  }
  return NextResponse.json({ plan, results });
}
