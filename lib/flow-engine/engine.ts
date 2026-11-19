import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/types/database";
import { fireContactEvent, type ContactEvent, type ContactEventDetail } from "@/lib/contact-events";
import type {
  FlowNode,
  FlowEdge,
  FlowExecutionContext,
  SendMessageNodeData,
  ConditionNodeData,
  DelayNodeData,
  TagNodeData,
  SetFieldNodeData,
  HttpRequestNodeData,
  GoToFlowNodeData,
  ABSplitNodeData,
  CommentReplyNodeData,
  PrivateReplyNodeData,
  AiResponseNodeData,
  EnrollSequenceNodeData,
} from "./types";
import { executeAiResponse } from "./nodes/ai-response";
import { isAiStep, runAiStepTurn, type AiStepData, type AiTurn } from "@/lib/ai-step";
import { smartDelayRunAt, type SmartDelayData } from "@/lib/smart-delay";
import { adaptMessage } from "./platform-adapter";
import { createZernioClient } from "@/lib/zernio-client";
import { requestPublicUrl } from "./request-public-url";

export async function executeFlow(
  supabase: SupabaseClient<Database>,
  context: FlowExecutionContext
) {
  // Ensure variables always exists so nodes (aiResponse, httpRequest) can write
  // outputs even when the trigger passed none (e.g. DM-triggered flows).
  context.variables ??= {};

  // Seed {{message}} from the incoming message text so the variable offered in
  // the builder resolves in production, not just in the simulator (which seeds
  // it itself). Guarded so cron resumes with an empty incomingMessage don't
  // clobber a previously stored value.
  if (context.incomingMessage.text) {
    context.variables.message ??= context.incomingMessage.text;
  }

  // Contact variables, like ManyChat's {first_name}: {{nombre}},
  // {{nombre_completo}} and {{usuario}}.
  const fullName =
    context.incomingMessage.sender?.name || (context.variables.commenter_name as string | undefined);
  if (fullName && !/^\d+$/.test(fullName)) {
    context.variables.nombre_completo ??= fullName;
    context.variables.nombre ??= fullName.trim().split(/\s+/)[0];
  }
  if (context.incomingMessage.sender?.username) {
    context.variables.usuario ??= context.incomingMessage.sender.username;
  }

  // Check for active session waiting for input
  const { data: activeSession } = await supabase
    .from("flow_sessions")
    .select("*")
    .eq("contact_id", context.contactId)
    .eq("channel_id", context.channelId)
    .eq("status", "active")
    .eq("waiting_for_input", true)
    .single();

  const inc0 = context.incomingMessage;
  const hasIncoming = !!(inc0.text || inc0.postbackPayload || inc0.quickReplyPayload || inc0.event);
  const isChoiceAnswer = !!inc0.quickReplyPayload?.startsWith("ci:");
  if (activeSession && hasIncoming) {
    // Tapping a button starts what that button is connected to; it is not an
    // answer to a pending question, so that wait is dropped. So is an expired one.
    if (
      isWaitExpired(activeSession) ||
      context.incomingMessage.postbackPayload ||
      (context.incomingMessage.quickReplyPayload && !isChoiceAnswer)
    ) {
      await supabase
        .from("flow_sessions")
        .update({ status: "cancelled", waiting_for_input: false })
        .eq("id", activeSession.id);
    } else {
      return resumeSession(supabase, activeSession, context);
    }
  }

  // Load flow
  const { data: flow } = await supabase
    .from("flows")
    .select("*")
    .eq("id", context.flowId)
    .eq("status", "published")
    .single();

  if (!flow) return;

  const nodes = flow.nodes as unknown as FlowNode[];
  const edges = flow.edges as unknown as FlowEdge[];

  // Get channel platform and late_account_id
  const { data: channel } = await supabase
    .from("channels")
    .select("platform, late_account_id")
    .eq("id", context.channelId)
    .single();

  context.platform = channel?.platform as FlowExecutionContext["platform"];
  if (channel?.late_account_id && !context.lateAccountId) {
    context.lateAccountId = channel.late_account_id;
  }

  // Resolve late_conversation_id from the conversation record if not already set
  if (!context.lateConversationId && context.conversationId) {
    const { data: conversation } = await supabase
      .from("conversations")
      .select("late_conversation_id")
      .eq("id", context.conversationId)
      .single();

    if (conversation?.late_conversation_id) {
      context.lateConversationId = conversation.late_conversation_id;
    }
  }

  // Create session
  const { data: session } = await supabase
    .from("flow_sessions")
    .insert({
      contact_id: context.contactId,
      flow_id: context.flowId,
      channel_id: context.channelId,
      status: "active",
      variables: context.variables || {},
    })
    .select("id")
    .single();

  if (!session) return;

  const { data: firedTrigger } = await supabase
    .from("triggers")
    .select("config, type")
    .eq("id", context.triggerId)
    .maybeSingle();

  // A tap on a button continues a run; it is counted as a click (for CTR),
  // not as a new run ("Ejecuciones").
  const isButtonContinuation =
    firedTrigger?.type === "postback" || firedTrigger?.type === "quick_reply";
  await supabase.from("analytics_events").insert({
    workspace_id: context.workspaceId,
    flow_id: context.flowId,
    contact_id: context.contactId,
    event_type: isButtonContinuation ? "button_clicked" : "flow_started",
    metadata: {
      triggerId: context.triggerId,
      nodeId: (firedTrigger?.config as { nodeId?: string } | null)?.nodeId ?? null,
      handle: (firedTrigger?.config as { startHandle?: string } | null)?.startHandle ?? null,
    },
  });

  // Find the trigger node (entry point). Rows published since the ManyChat-style
  // builder carry the id of the node that produced them; start exactly there.
  const firedConfig = firedTrigger?.config as { nodeId?: string; startHandle?: string } | null;
  const firedNodeId = firedConfig?.nodeId;

  // A ManyChat-style button connected straight to a step: continue from it.
  if (firedNodeId && firedConfig?.startHandle) {
    const buttonEdge = edges.find(
      (e) => e.source === firedNodeId && e.sourceHandle === firedConfig.startHandle
    );
    const buttonTarget = buttonEdge && nodes.find((n) => n.id === buttonEdge.target);
    if (buttonTarget) {
      await traverseNodes(supabase, session.id, buttonTarget, nodes, edges, context, 0);
      return;
    }
  }
  const triggerNodes = nodes.filter((n) => n.type === "trigger"); const trigField = (n: FlowNode, k: "triggerType" | "payload") => (n.data as unknown as Record<string, string | undefined>)?.[k]; const inc = context.incomingMessage; const triggerNode = (firedNodeId ? triggerNodes.find((n) => n.id === firedNodeId) : undefined) ?? (inc.postbackPayload ? triggerNodes.find((n) => trigField(n, "triggerType") === "postback" && trigField(n, "payload") === inc.postbackPayload) : undefined) ?? (inc.quickReplyPayload ? triggerNodes.find((n) => trigField(n, "triggerType") === "quick_reply" && trigField(n, "payload") === inc.quickReplyPayload) : undefined) ?? (inc.text ? triggerNodes.find((n) => trigField(n, "triggerType") === "keyword" && (((n.data as unknown as { keywords?: Array<string | { value: string; matchType?: string }> }).keywords) ?? []).some((kw) => { const v = (typeof kw === "string" ? kw : kw.value).toLowerCase(); const m = typeof kw === "string" ? "contains" : (kw.matchType ?? "contains"); const t = inc.text!.toLowerCase().trim(); return m === "exact" ? t === v : m === "startsWith" ? t.startsWith(v) : t.includes(v); })) : undefined) ?? triggerNodes.find((n) => !["postback", "quick_reply"].includes(trigField(n, "triggerType") ?? "keyword")) ?? triggerNodes[0];
  if (!triggerNode) return;

  // Get the first connected node
  const firstEdge = edges.find((e) => e.source === triggerNode.id);
  if (!firstEdge) return;

  const startNode = nodes.find((n) => n.id === firstEdge.target);
  if (!startNode) return;

  await traverseNodes(supabase, session.id, startNode, nodes, edges, context, 0);
}

const MAX_TRAVERSAL_DEPTH = 50;

// Thrown before resumeSession advances current_node_id, so callers may retry
// without cancelling the session.
export class FlowLoadError extends Error {}

export async function resumeSession(
  supabase: SupabaseClient<Database>,
  session: Database["public"]["Tables"]["flow_sessions"]["Row"],
  context: FlowExecutionContext
) {
  const { data: flow, error: flowError } = await supabase
    .from("flows")
    .select("*")
    .eq("id", session.flow_id)
    .single();

  if (!flow) {
    // postgrest-js swallows transient failures into { data: null, error }, it
    // does not throw. Only PGRST116 (zero rows) means the flow row is genuinely
    // gone; anything else is a transient DB/network blip, so throw and let the
    // caller recover (cron retry with backoff, or the contact's next message on
    // the webhook path) instead of permanently cancelling the session.
    if (flowError && flowError.code !== "PGRST116") {
      throw new FlowLoadError(
        `flow ${session.flow_id} could not be loaded: ${flowError.message}`
      );
    }
    await cancelUnresumableSession(
      supabase,
      session.id,
      `flow ${session.flow_id} no longer exists`
    );
    return;
  }

  const nodes = flow.nodes as unknown as FlowNode[];
  const edges = flow.edges as unknown as FlowEdge[];

  const { data: channel } = await supabase
    .from("channels")
    .select("platform, late_account_id")
    .eq("id", context.channelId)
    .single();

  context.platform = channel?.platform as FlowExecutionContext["platform"];
  if (channel?.late_account_id && !context.lateAccountId) {
    context.lateAccountId = channel.late_account_id;
  }

  // Resolve late_conversation_id if not set
  if (!context.lateConversationId && context.conversationId) {
    const { data: conversation } = await supabase
      .from("conversations")
      .select("late_conversation_id")
      .eq("id", context.conversationId)
      .single();

    if (conversation?.late_conversation_id) {
      context.lateConversationId = conversation.late_conversation_id;
    }
  }

  context.variables = (session.variables as Record<string, string>) || {};

  // The resume is driven by a fresh reply; make {{message}} reflect it.
  if (context.incomingMessage.text) {
    context.variables.message = context.incomingMessage.text;
  }
  // The contact answered by DM: the comment's private-reply stage is over.
  if (context.incomingMessage.text || context.incomingMessage.quickReplyPayload || context.incomingMessage.postbackPayload) {
    context.variables.__dm_replied = "1";
  }

  // Update session
  await supabase
    .from("flow_sessions")
    .update({ waiting_for_input: false, waiting_until: null })
    .eq("id", session.id);

  // Continue from current node
  const currentNode = nodes.find((n) => n.id === session.current_node_id);
  if (!currentNode) {
    // The flow was edited and the paused-on node removed; the session can
    // never advance, so settle it instead of leaving it active forever.
    await cancelUnresumableSession(
      supabase,
      session.id,
      `node ${session.current_node_id} no longer exists in flow ${session.flow_id}`
    );
    return;
  }

  // AI Step: the contact answered; the AI decides what to say next or finishes.
  if (currentNode.type === "aiResponse" && isAiStep(currentNode.data)) {
    const r = await executeAiStep(
      supabase,
      currentNode.data as AiStepData,
      context,
      session.id,
      currentNode.id,
      context.incomingMessage.text ?? ""
    );
    if (r === "pause") return;
  }

  // "Recopilación de datos": validate and store the answer before moving on.
  const currentActionType =
    (currentNode.type as string) === "action"
      ? (currentNode.data as unknown as { actionType?: string }).actionType
      : currentNode.type;
  const messageQuestion =
    currentNode.type === "sendMessage"
      ? (currentNode.data as unknown as { question?: MessageQuestion }).question
      : undefined;
  if (currentActionType === "collectInput" || (messageQuestion && messageQuestion.text?.trim())) {
    const d: CollectInputNodeData = messageQuestion
      ? {
          inputType: messageQuestion.inputType,
          options: messageQuestion.options,
          fieldSlug: messageQuestion.fieldSlug,
          variableName: messageQuestion.variableName,
          retryText: messageQuestion.retryText,
        }
      : (currentNode.data as unknown as CollectInputNodeData);
    const qr = context.incomingMessage.quickReplyPayload;
    const answer = (qr?.startsWith("ci:") ? qr.slice(3) : context.incomingMessage.text ?? "").trim();
    if (!isValidCollectedInput(d.inputType, answer, d.options)) {
      // ManyChat "Reintentar N veces si la respuesta del usuario no es válida".
      if (messageQuestion) {
        const tries = Number(context.variables?.__ci_retries ?? 0) + 1;
        const max = Number(messageQuestion.retries ?? 3);
        if (tries > max) {
          await completeSession(supabase, session.id);
          return;
        }
        context.variables ??= {};
        context.variables.__ci_retries = String(tries);
        await supabase
          .from("flow_sessions")
          .update({ variables: context.variables as Json })
          .eq("id", session.id);
      }
      const retry = d.retryText?.trim() || defaultRetryText(d.inputType);
      await executeSendMessage(
        supabase,
        { messages: [{ text: retry }] } as unknown as SendMessageNodeData,
        context
      );
      await supabase
        .from("flow_sessions")
        .update({ waiting_for_input: true })
        .eq("id", session.id);
      return;
    }
    const varName = (d.variableName?.trim() || "respuesta").replace(/[^\w]/g, "_");
    context.variables ??= {};
    context.variables[varName] = answer;
    await supabase
      .from("flow_sessions")
      .update({ variables: context.variables as Json })
      .eq("id", session.id);
    if (d.fieldSlug) {
      await executeSetField(supabase, { fieldSlug: d.fieldSlug, value: answer }, context);
    }
    if (d.inputType === "email") {
      await supabase.from("contacts").update({ email: answer }).eq("id", context.contactId);
      await emitContactEvent(supabase, context, "system_field_changed", { fieldSlug: "email" });
    }
    if (d.inputType === "name") {
      await supabase.from("contacts").update({ display_name: answer }).eq("id", context.contactId);
    }
    delete context.variables.__ci_expires_at;
    delete context.variables.__ci_retries;
  }

  // Message with a question: "Acción en respuesta" runs on a valid answer, then "Siguiente paso".
  if (messageQuestion && messageQuestion.text?.trim()) {
    const replyEdge = edges.find((e) => e.source === currentNode.id && e.sourceHandle === "reply");
    const nextDefault = edges.find((e) => e.source === currentNode.id && !e.sourceHandle);
    const replyNode = replyEdge && nodes.find((n) => n.id === replyEdge.target);
    const defaultNode = nextDefault && nodes.find((n) => n.id === nextDefault.target);
    if (replyNode && defaultNode) {
      context.currentNodeId = replyNode.id;
      await executeNode(supabase, replyNode, context, session.id);
      await traverseNodes(supabase, session.id, defaultNode, nodes, edges, context, 0);
      return;
    }
    const target = replyNode ?? defaultNode;
    if (!target) {
      await completeSession(supabase, session.id);
      return;
    }
    await traverseNodes(supabase, session.id, target, nodes, edges, context, 0);
    return;
  }

  // Get next node after the current one
  const nextEdge = edges.find((e) => e.source === currentNode.id && !e.sourceHandle?.startsWith("btn:") && e.sourceHandle !== "reply" && e.sourceHandle !== "noreply");
  if (!nextEdge) {
    await completeSession(supabase, session.id);
    return;
  }

  const nextNode = nodes.find((n) => n.id === nextEdge.target);
  if (!nextNode) {
    await completeSession(supabase, session.id);
    return;
  }

  await traverseNodes(supabase, session.id, nextNode, nodes, edges, context, 0);
}

async function cancelUnresumableSession(
  supabase: SupabaseClient<Database>,
  sessionId: string,
  reason: string
) {
  console.error(`Cancelling flow session ${sessionId}: ${reason}`);
  const { error } = await supabase
    .from("flow_sessions")
    .update({ status: "cancelled" })
    .eq("id", sessionId);
  if (error) {
    // postgrest swallows network failures into { error }, so an unchecked
    // cancel can silently no-op and strand the session as active forever.
    // current_node_id has not advanced, so FlowLoadError lets callers retry
    // and re-attempt the cancel.
    throw new FlowLoadError(
      `session ${sessionId} could not be cancelled (${reason}): ${error.message}`
    );
  }
}

async function traverseNodes(
  supabase: SupabaseClient<Database>,
  sessionId: string,
  node: FlowNode,
  nodes: FlowNode[],
  edges: FlowEdge[],
  context: FlowExecutionContext,
  depth: number = 0
) {
  if (depth >= MAX_TRAVERSAL_DEPTH) {
    console.error(`Flow traversal exceeded max depth (${MAX_TRAVERSAL_DEPTH}), stopping. Flow: ${context.flowId}`);
    await completeSession(supabase, sessionId);
    return;
  }
  // Update current node
  await supabase
    .from("flow_sessions")
    .update({ current_node_id: node.id })
    .eq("id", sessionId);

  // Track analytics
  await supabase.from("analytics_events").insert({
    workspace_id: context.workspaceId,
    flow_id: context.flowId,
    contact_id: context.contactId,
    event_type: "node_executed",
    metadata: { nodeId: node.id, nodeType: node.type },
  });

  // Execute the node
  context.currentNodeId = node.id;
  const result = await executeNode(supabase, node, context, sessionId);

  // Persist variables written by output-producing nodes so they survive
  // pauses (resumeSession reloads them from the session row).
  const persistKind =
    (node.type as string) === "action" ? (node.data as unknown as { actionType?: string }).actionType : node.type;
  if (persistKind === "aiResponse" || persistKind === "httpRequest" || persistKind === "collectInput") {
    await supabase
      .from("flow_sessions")
      .update({ variables: (context.variables ?? {}) as Json })
      .eq("id", sessionId);
  }

  // If the node pauses execution (delay, wait for input, human takeover), stop
  if (result === "pause") return;

  // Find next node(s)
  let nextEdge: FlowEdge | undefined;

  if (result && typeof result === "string" && result.startsWith("handle:")) {
    // Condition/split nodes specify which handle to follow
    const handle = result.replace("handle:", "");
    // The condition step's connectors are drawn as "yes"/"no".
    const alias = handle === "true" ? "yes" : handle === "false" ? "no" : undefined;
    nextEdge = edges.find(
      (e) => e.source === node.id && (e.sourceHandle === handle || (!!alias && e.sourceHandle === alias))
    );
  } else {
    // Button connectors ("btn:<payload>") only run when that button is tapped.
    nextEdge = edges.find((e) => e.source === node.id && !e.sourceHandle?.startsWith("btn:") && e.sourceHandle !== "reply" && e.sourceHandle !== "noreply");
  }

  if (!nextEdge) {
    await completeSession(supabase, sessionId);
    return;
  }

  const nextNode = nodes.find((n) => n.id === nextEdge!.target);
  if (!nextNode) {
    await completeSession(supabase, sessionId);
    return;
  }

  // Continue to next node
  await traverseNodes(supabase, sessionId, nextNode, nodes, edges, context, depth + 1);
}

async function executeNode(
  supabase: SupabaseClient<Database>,
  node: FlowNode,
  context: FlowExecutionContext,
  sessionId: string
): Promise<string | void> {
  // The builder stores actions as type "action" + data.actionType; map them to
  // the engine's node kinds (and tag/subscribe to the fields their executors read).
  const actionType =
    (node.type as string) === "action" ? ((node.data as unknown as { actionType?: string }).actionType ?? "") : null;
  const kind = actionType ?? node.type;
  if (actionType) {
    const extra: Record<string, string> = {};
    if (actionType === "addTag") extra.action = "add";
    if (actionType === "removeTag") extra.action = "remove";
    if (actionType === "subscribe" || actionType === "unsubscribe") extra.action = actionType;
    node = { ...node, data: { ...(node.data as object), ...extra } as FlowNode["data"] };
  }
  switch (kind) {
    case "sendMessage": {
      const q = (node.data as unknown as { question?: MessageQuestion }).question;
      const hasQuestion = !!(q && q.text?.trim());
      const gate = await messagingGate(supabase, context);
      if (gate === "private_reply_used" || gate === "window_closed") {
        // Meta: one private reply per comment until the person answers, and
        // automated messages only within 24 h of their last message. Like
        // ManyChat, stop here instead of sending something Instagram rejects.
        console.warn(`[meta-rules] ${gate}: run ${sessionId} stops at node ${node.id}`);
        await completeSession(supabase, sessionId);
        return "pause";
      }
      if (gate === "private_reply") {
        // The whole step (all its texts + the question) goes out as ONE message.
        await sendPrivateReplyStep(supabase, node.data as SendMessageNodeData, hasQuestion ? q! : undefined, context);
        if (hasQuestion) return askMessageQuestion(supabase, q!, node.id, context, sessionId, true);
        await supabase.from("flow_sessions").update({ variables: context.variables as Json }).eq("id", sessionId);
        return;
      }
      const res = await executeSendMessage(supabase, node.data as SendMessageNodeData, context);
      if (hasQuestion) return askMessageQuestion(supabase, q!, node.id, context, sessionId);
      return res;
    }
    case "condition":
      return executeCondition(supabase, node.data as ConditionNodeData, context);
    case "delay":
      return executeDelay(supabase, node.data as DelayNodeData, sessionId, node.id, context);
    case "addTag":
    case "removeTag":
      return executeTag(supabase, node.data as TagNodeData, context);
    case "setCustomField":
      return executeSetField(supabase, node.data as SetFieldNodeData, context);
    case "httpRequest":
      return executeHttpRequest(node.data as HttpRequestNodeData, context);
    case "goToFlow":
      return executeGoToFlow(supabase, node.data as GoToFlowNodeData, context, sessionId);
    case "humanTakeover":
      return executeHumanTakeover(supabase, context, sessionId);
    case "subscribe":
    case "unsubscribe":
      return executeSubscription(supabase, node.type, context);
    case "commentReply":
      return executeCommentReply(supabase, node.data as CommentReplyNodeData, context);
    case "privateReply":
      return executePrivateReply(supabase, node.data as PrivateReplyNodeData, context);
    case "aiResponse":
      if (isAiStep(node.data)) return executeAiStep(supabase, node.data as AiStepData, context, sessionId, node.id);
      return executeAiResponse(supabase, node.data as AiResponseNodeData, context, sessionId);
    case "abSplit":
      return executeABSplit(node.data as ABSplitNodeData, context, node.id);
    case "smartDelay": {
      // ManyChat "Pausa inteligente": wait a time (optionally inside set hours/days) or until a date.
      const sd = node.data as unknown as SmartDelayData;
      let fieldValue: string | null = null;
      if (sd.mode === "date" && sd.dateMode === "dynamic" && sd.dateField) {
        const { data: def } = await supabase
          .from("custom_field_definitions")
          .select("id")
          .eq("workspace_id", context.workspaceId)
          .eq("slug", sd.dateField)
          .maybeSingle();
        if (def) {
          const { data: row } = await supabase
            .from("contact_custom_fields")
            .select("value")
            .eq("contact_id", context.contactId)
            .eq("field_id", def.id)
            .maybeSingle();
          fieldValue = row?.value != null ? String(row.value) : null;
        }
      }
      const runAt = smartDelayRunAt(sd, fieldValue);
      if (!runAt) {
        // The date already passed (or none): the automation stops here.
        await completeSession(supabase, sessionId);
        return "pause";
      }
      const ms = Math.max(0, runAt.getTime() - Date.now());
      return executeDelay(supabase, { duration: Math.ceil(ms / 1000), unit: "seconds" }, sessionId, node.id, context);
    }
    case "enrollSequence":
      return executeEnrollSequence(supabase, node.data as EnrollSequenceNodeData, context);
    case "actions":
      return executeActionList(supabase, node.data as unknown as ActionListNodeData, context, sessionId);
    case "collectInput": {
      // "Recopilación de datos": ask, then wait for the answer (see resumeSession).
      const d = node.data as unknown as CollectInputNodeData;
      const options = (d.options ?? []).map((o) => o.trim()).filter(Boolean);
      if (d.question?.trim()) {
        const message: Record<string, unknown> = { text: d.question };
        // Elección múltiple: the options go out as quick replies.
        if (d.inputType === "choice" && options.length > 0) {
          message.quickReplies = options.slice(0, 13).map((o) => ({ title: o.slice(0, 20), payload: `ci:${o}` }));
        }
        await executeSendMessage(supabase, { messages: [message] } as unknown as SendMessageNodeData, context);
      }
      context.variables ??= {};
      const minutes = Number(d.expireMinutes ?? 0);
      if (minutes > 0) {
        context.variables.__ci_expires_at = new Date(Date.now() + minutes * 60_000).toISOString();
      } else {
        delete context.variables.__ci_expires_at;
      }
      await supabase
        .from("flow_sessions")
        .update({
          waiting_for_input: true,
          current_node_id: node.id,
          variables: context.variables as Json,
        })
        .eq("id", sessionId);
      return "pause";
    }
    default:
      return;
  }
}

async function sendFirstMessageAsPrivateReply(
  supabase: SupabaseClient<Database>,
  zernio: ReturnType<typeof createZernioClient>,
  data: SendMessageNodeData,
  context: FlowExecutionContext,
  lateAccountId: string
) {
  const first = data.messages.find((m) => !(m as { delaySeconds?: number }).delaySeconds) ?? data.messages[0];
  if (!first) return;

  const text = interpolateVariables(
    adaptMessage(first, context.platform ?? "instagram").text,
    context.variables || {}
  );

  try {
    await zernio.comments.sendPrivateReplyToComment({
      path: {
        postId: String(context.variables!.post_id),
        commentId: String(context.variables!.comment_id),
      },
      body: { accountId: lateAccountId, message: text, ...(() => { const a = adaptMessage(first, context.platform ?? "instagram"); if (a.buttons?.length) return { buttons: a.buttons }; if (a.quickReplies?.length) return { quickReplies: a.quickReplies }; return {}; })() } as Parameters<typeof zernio.comments.sendPrivateReplyToComment>[0]["body"],
    });

    await supabase.from("messages").insert({
      conversation_id: context.conversationId,
      direction: "outbound",
      text,
      sent_by_flow_id: context.flowId,
      status: "sent",
    });

    await supabase.from("analytics_events").insert({
      workspace_id: context.workspaceId,
      flow_id: context.flowId,
      contact_id: context.contactId,
      event_type: "message_sent",
      metadata: { nodeId: context.currentNodeId ?? null },
    });
  } catch (error) {
    console.error("Failed to send comment-context message as private reply:", error);
    await supabase.from("messages").insert({
      conversation_id: context.conversationId,
      direction: "outbound",
      text,
      sent_by_flow_id: context.flowId,
      status: "failed",
    });
    return;
  }

  if (data.messages.length > 1) {
    console.warn(
      "Comment flow Send Message node had multiple messages; only the first was sent (one private reply per comment)."
    );
  }
}

async function executeSendMessage(
  supabase: SupabaseClient<Database>,
  data: SendMessageNodeData,
  context: FlowExecutionContext
) {
  // Get workspace for API key
  const { data: workspace } = await supabase
    .from("workspaces")
    .select("late_api_key_encrypted")
    .eq("id", context.workspaceId)
    .single();

  if (!workspace?.late_api_key_encrypted) return;

  const zernio = createZernioClient(workspace.late_api_key_encrypted);

  // Resolve late_account_id from channel if not in context
  let lateAccountId = context.lateAccountId;
  if (!lateAccountId) {
    const { data: channel } = await supabase
      .from("channels")
      .select("late_account_id, platform")
      .eq("id", context.channelId)
      .single();

    if (!channel) return;
    lateAccountId = channel.late_account_id;
    if (!context.platform) {
      context.platform = channel.platform as FlowExecutionContext["platform"];
    }
  }

  // Resolve late_conversation_id from conversation if not in context
  let lateConversationId = context.lateConversationId;
  if (!lateConversationId) {
    const { data: conversation } = await supabase
      .from("conversations")
      .select("late_conversation_id")
      .eq("id", context.conversationId)
      .single();

    if (!conversation?.late_conversation_id) {
      // Comment-triggered flows have no DM conversation yet. Instagram allows
      // exactly one private reply per comment, so deliver the first message via
      // the private-reply endpoint instead of silently dropping the whole node
      // (users build comment flows with plain Send Message nodes, not Private Reply).
      if (context.variables?.comment_id && context.variables?.post_id && lateAccountId) {
        await sendFirstMessageAsPrivateReply(supabase, zernio, data, context, lateAccountId);
        return;
      }
      console.error("No late_conversation_id found for conversation:", context.conversationId);
      return;
    }
    lateConversationId = conversation.late_conversation_id;
  }

  for (const msg of data.messages) {
    // "Retraso" block: wait a few seconds between messages, like ManyChat.
    const delaySeconds = Number((msg as { delaySeconds?: number }).delaySeconds ?? 0);
    if (delaySeconds > 0) {
      await new Promise((r) => setTimeout(r, Math.min(delaySeconds, 20) * 1000));
      continue;
    }
    const adapted = adaptMessage(msg, context.platform!);
    const text = interpolateVariables(adapted.text, context.variables || {});
    {
      const raw = msg as { mediaUrl?: string; imageUrl?: string; carousel?: unknown };
      if (!text.trim() && !raw.mediaUrl && !raw.imageUrl && !raw.carousel) continue; // empty block
    }

    try {
      // Media (image/video/audio) is platform-agnostic, so read it from the raw
      // message. `mediaUrl` + `mediaType` supersede the legacy image-only `imageUrl`.
      const rawMsg = msg as { mediaUrl?: string; mediaType?: string; imageUrl?: string };
      const mediaUrl = rawMsg.mediaUrl || rawMsg.imageUrl;
      const mediaType = rawMsg.mediaType || (rawMsg.imageUrl ? "image" : undefined);

      const attachments = mediaUrl
        ? [{ type: mediaType || "image", url: mediaUrl }]
        : undefined;

      // Build the API body with rich messaging fields
      const body: Record<string, unknown> = {
        accountId: lateAccountId,
        message: text,
      };
      // Actually send the media to the recipient. Previously the attachment was only
      // stored locally and never included in the send body, so flow media never
      // reached the contact.
      if (mediaUrl) {
        body.attachmentUrl = mediaUrl;
        body.attachmentType = mediaType || "image";
      }

      if (adapted.buttons?.length) {
        body.buttons = adapted.buttons;
      }
      if (adapted.quickReplies?.length) {
        body.quickReplies = adapted.quickReplies;
      }
      if (adapted.template) {
        body.template = adapted.template;
      }
      if (adapted.replyMarkup) {
        body.replyMarkup = adapted.replyMarkup;
      }

      const response = await zernio.messages.sendInboxMessage({
        path: { conversationId: lateConversationId },
        body: body as Parameters<typeof zernio.messages.sendInboxMessage>[0]["body"],
      });

      // Store outbound message
      await supabase.from("messages").insert({
        conversation_id: context.conversationId,
        direction: "outbound",
        text,
        attachments: attachments || null,
        sent_by_flow_id: context.flowId,
        sent_by_node_id: null,
        platform_message_id: response.data?.data?.messageId || null,
        status: "sent",
      });

      await supabase.from("analytics_events").insert({
        workspace_id: context.workspaceId,
        flow_id: context.flowId,
        contact_id: context.contactId,
        event_type: "message_sent",
        metadata: { nodeId: context.currentNodeId ?? null },
      });
    } catch (error) {
      console.error("Failed to send message:", error);
      await supabase.from("messages").insert({
        conversation_id: context.conversationId,
        direction: "outbound",
        text,
        sent_by_flow_id: context.flowId,
        status: "failed",
      });

      await supabase.from("analytics_events").insert({
        workspace_id: context.workspaceId,
        flow_id: context.flowId,
        contact_id: context.contactId,
        event_type: "message_failed",
        metadata: { error: error instanceof Error ? error.message : "Unknown error" },
      });
    }

    // Small delay between messages
    if (data.messages.length > 1) {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
}

async function executeCondition(
  supabase: SupabaseClient<Database>,
  data: ConditionNodeData,
  context: FlowExecutionContext
): Promise<string> {
  const { data: contact } = await supabase
    .from("contacts")
    .select("*, contact_tags(tag_id, tags(name)), contact_custom_fields(field_id, value, custom_field_definitions(slug))")
    .eq("id", context.contactId)
    .single();

  if (!contact) return "handle:false";

  const tagNames = new Set(
    ((contact.contact_tags as Array<{ tags: { name: string } | null }> | null) ?? [])
      .map((ct) => ct.tags?.name?.toLowerCase())
      .filter(Boolean) as string[]
  );
  const customFields = (contact.contact_custom_fields as Array<{
    value: string;
    custom_field_definitions: { slug: string } | null;
  }> | null) ?? [];

  let activeSequences: Set<string> | null = null;
  const sequencesOf = async () => {
    if (activeSequences) return activeSequences;
    const { data: rows } = await supabase
      .from("sequence_enrollments")
      .select("sequence_id")
      .eq("contact_id", context.contactId)
      .eq("status", "active");
    activeSequences = new Set((rows ?? []).map((r) => r.sequence_id));
    return activeSequences;
  };

  const results: boolean[] = [];
  for (const condition of data.conditions) {
    const c = condition as typeof condition & { fieldSlug?: string; timezone?: string };
    let fieldValue: string | undefined;

    // ManyChat-style fields
    if (c.field === "tag") {
      const has = tagNames.has((c.value ?? "").trim().toLowerCase());
      results.push(c.operator === "has_not" || c.operator === "not_equals" ? !has : has);
      continue;
    }
    if (c.field === "sequence") {
      const inSeq = (await sequencesOf()).has(c.value);
      results.push(c.operator === "has_not" || c.operator === "not_equals" ? !inSeq : inSeq);
      continue;
    }
    if (c.field === "current_time") {
      const now = new Intl.DateTimeFormat("en-GB", {
        timeZone: c.timezone || "UTC",
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
      }).format(new Date());
      results.push(c.operator === "lt" ? now < c.value : now >= c.value);
      continue;
    }

    if (c.field === "email") fieldValue = contact.email ?? undefined;
    else if (c.field === "full_name") fieldValue = contact.display_name ?? undefined;
    else if (c.field === "first_name") fieldValue = contact.display_name?.trim().split(/\s+/)[0];
    else if (c.field === "username") fieldValue = context.variables?.usuario;
    else if (c.field === "custom_field") {
      fieldValue = customFields.find((f) => f.custom_field_definitions?.slug === c.fieldSlug)?.value;
    } else if (c.field === "variable") {
      const v = resolveVariablePath((context.variables ?? {}) as Record<string, unknown>, c.fieldSlug ?? "");
      fieldValue = v === undefined || v === null ? undefined : String(v);
    }
    // Older condition shapes
    else if (c.field === "platform") fieldValue = context.platform;
    else if (c.field === "is_subscribed") fieldValue = String(contact.is_subscribed);
    else if (c.field.startsWith("tag:")) fieldValue = String(tagNames.has(c.field.slice(4).toLowerCase()));
    else if (c.field.startsWith("variable:")) fieldValue = context.variables?.[c.field.slice(9)];
    else fieldValue = customFields.find((f) => f.custom_field_definitions?.slug === c.field)?.value;

    results.push(evaluateCondition(fieldValue, c.operator, c.value));
  }

  const passed =
    data.logic === "and" ? results.every(Boolean) : results.some(Boolean);

  return passed ? "handle:true" : "handle:false";
}

function evaluateCondition(
  actual: string | undefined,
  operator: string,
  expected: string
): boolean {
  const a = (actual ?? "").toString().trim().toLowerCase();
  const e = (expected ?? "").toString().trim().toLowerCase();
  switch (operator) {
    case "equals":
      return a === e;
    case "not_equals":
      return a !== e;
    case "contains":
      return a.includes(e);
    case "not_contains":
      return !a.includes(e);
    case "starts_with":
      return a.startsWith(e);
    case "not_exists":
      return a === "";
    case "exists":
      return actual !== undefined && actual !== null && actual !== "";
    case "gt":
      return Number(actual) > Number(expected);
    case "lt":
      return Number(actual) < Number(expected);
    default:
      return false;
  }
}

async function executeDelay(
  supabase: SupabaseClient<Database>,
  data: DelayNodeData,
  sessionId: string,
  nodeId: string,
  context: FlowExecutionContext
) {
  const multipliers: Record<string, number> = {
    seconds: 1000,
    minutes: 60 * 1000,
    hours: 60 * 60 * 1000,
    days: 24 * 60 * 60 * 1000,
  };

  const delayMs = data.duration * (multipliers[data.unit] || 1000);
  const runAt = new Date(Date.now() + delayMs).toISOString();

  // Schedule a job to resume the flow
  await supabase.from("scheduled_jobs").insert({
    type: "resume_flow",
    payload: {
      sessionId,
      nodeId,
      flowId: context.flowId,
      channelId: context.channelId,
      contactId: context.contactId,
      conversationId: context.conversationId,
      workspaceId: context.workspaceId,
      lateConversationId: context.lateConversationId || null,
      lateAccountId: context.lateAccountId || null,
      variables: context.variables || {},
    },
    run_at: runAt,
  });

  // Update session to waiting
  await supabase
    .from("flow_sessions")
    .update({
      waiting_until: runAt,
      current_node_id: nodeId,
    })
    .eq("id", sessionId);

  return "pause";
}

async function executeTag(
  supabase: SupabaseClient<Database>,
  data: TagNodeData,
  context: FlowExecutionContext
) {
  // Find or create tag
  const { data: tag } = await supabase
    .from("tags")
    .upsert(
      { workspace_id: context.workspaceId, name: data.tagName },
      { onConflict: "workspace_id,name" }
    )
    .select("id")
    .single();

  if (!tag) return;

  if (data.action === "add") {
    await supabase
      .from("contact_tags")
      .upsert({ contact_id: context.contactId, tag_id: tag.id })
      .select();
    await emitContactEvent(supabase, context, "tag_added", { tagName: data.tagName });
  } else {
    await supabase
      .from("contact_tags")
      .delete()
      .eq("contact_id", context.contactId)
      .eq("tag_id", tag.id);
    await emitContactEvent(supabase, context, "tag_removed", { tagName: data.tagName });
  }
}

async function executeSetField(
  supabase: SupabaseClient<Database>,
  data: SetFieldNodeData,
  context: FlowExecutionContext
) {
  // Find field definition
  const { data: fieldDef } = await supabase
    .from("custom_field_definitions")
    .select("id")
    .eq("workspace_id", context.workspaceId)
    .eq("slug", data.fieldSlug)
    .single();

  if (!fieldDef) return;

  const value = interpolateVariables(data.value, context.variables || {});

  await supabase.from("contact_custom_fields").upsert(
    {
      contact_id: context.contactId,
      field_id: fieldDef.id,
      value,
    },
    { onConflict: "contact_id,field_id" }
  );
  await emitContactEvent(supabase, context, "custom_field_changed", { fieldSlug: data.fieldSlug });
}

async function executeHttpRequest(
  data: HttpRequestNodeData,
  context: FlowExecutionContext
) {
  try {
    const url = interpolateVariables(data.url, context.variables || {});
    const body = data.body
      ? interpolateVariables(data.body, context.variables || {})
      : undefined;

    const responseData = await requestPublicUrl({
      method: data.method,
      url,
      headers: {
        "Content-Type": "application/json",
        ...data.headers,
      },
      body: data.method !== "GET" ? body : undefined,
    });

    // Store response in variable if configured
    if (data.responseVariable && context.variables) {
      try {
        context.variables[data.responseVariable] = JSON.parse(responseData);
      } catch {
        context.variables[data.responseVariable] = responseData;
      }
    }
  } catch (error) {
    console.error("HTTP request failed:", error);
  }
}

async function executeGoToFlow(
  supabase: SupabaseClient<Database>,
  data: GoToFlowNodeData,
  context: FlowExecutionContext,
  _sessionId: string
) {
  if (!data.flowId) return;
  // ManyChat "Iniciar Automatización": the chosen automation starts from its first
  // step (its own run), and this one continues with "Siguiente paso".
  await executeFlow(supabase, {
    triggerId: "manual",
    flowId: data.flowId,
    channelId: context.channelId,
    contactId: context.contactId,
    conversationId: context.conversationId,
    workspaceId: context.workspaceId,
    lateConversationId: context.lateConversationId,
    lateAccountId: context.lateAccountId,
    incomingMessage: {},
  });
  return;
}

async function executeHumanTakeover(
  supabase: SupabaseClient<Database>,
  context: FlowExecutionContext,
  sessionId: string
) {
  // Pause automation on the conversation
  await supabase
    .from("conversations")
    .update({ is_automation_paused: true })
    .eq("id", context.conversationId);

  // Mark session
  await supabase
    .from("flow_sessions")
    .update({
      human_takeover_at: new Date().toISOString(),
      status: "completed",
    })
    .eq("id", sessionId);

  return "pause";
}

async function executeSubscription(
  supabase: SupabaseClient<Database>,
  action: string,
  context: FlowExecutionContext
) {
  await supabase
    .from("contacts")
    .update({ is_subscribed: action === "subscribe" })
    .eq("id", context.contactId);
}

function executeABSplit(data: ABSplitNodeData, context?: FlowExecutionContext, nodeId?: string): string {
  const paths = data.paths?.length ? data.paths : [{ name: "A", weight: 50 }, { name: "B", weight: 50 }];
  const totalWeight = paths.reduce((sum, p) => sum + (Number(p.weight) || 0), 0) || paths.length;

  // ManyChat "Elige una ruta al azar cada vez" off (default): the same contact always gets the same variation.
  let random: number;
  if ((data as { randomPath?: boolean }).randomPath !== true && context) {
    let h = 0;
    for (const ch of `${context.contactId}:${nodeId ?? ""}`) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    random = ((h % 10000) / 10000) * totalWeight;
  } else {
    random = Math.random() * totalWeight;
  }

  let cumulative = 0;
  for (let i = 0; i < paths.length; i++) {
    cumulative += Number(paths[i].weight) || (totalWeight === paths.length ? 1 : 0);
    if (random < cumulative) return `handle:split-${i}`;
  }
  return `handle:split-${paths.length - 1}`;
}

/**
 * Post a public reply to the comment that triggered this flow.
 * Uses the comment_id and post_id variables set by the comment processor.
 */
async function executeCommentReply(
  supabase: SupabaseClient<Database>,
  data: CommentReplyNodeData,
  context: FlowExecutionContext
) {
  const { data: workspace } = await supabase
    .from("workspaces")
    .select("late_api_key_encrypted")
    .eq("id", context.workspaceId)
    .single();

  if (!workspace?.late_api_key_encrypted) return;

  const zernio = createZernioClient(workspace.late_api_key_encrypted);

  // Resolve late_account_id
  let lateAccountId = context.lateAccountId;
  if (!lateAccountId) {
    const { data: channel } = await supabase
      .from("channels")
      .select("late_account_id")
      .eq("id", context.channelId)
      .single();

    if (!channel) return;
    lateAccountId = channel.late_account_id;
  }

  const commentId = context.variables?.comment_id || context.incomingMessage.sender?.id;
  if (!commentId) return;

  const postId = context.variables?.post_id;
  if (!postId) {
    console.error("No post_id in context variables for commentReply node");
    return;
  }

  const text = interpolateVariables(data.text, context.variables || {});

  try {
    await zernio.comments.replyToInboxPost({
      path: { postId },
      body: { accountId: lateAccountId, message: text, commentId },
    });
  } catch (error) {
    console.error("Failed to post comment reply:", error);
  }
}

/**
 * Send a private DM to the commenter via the Zernio API's private reply endpoint.
 * This creates a DM conversation from a comment context.
 */
async function executePrivateReply(
  supabase: SupabaseClient<Database>,
  data: PrivateReplyNodeData,
  context: FlowExecutionContext
) {
  const { data: workspace } = await supabase
    .from("workspaces")
    .select("late_api_key_encrypted")
    .eq("id", context.workspaceId)
    .single();

  if (!workspace?.late_api_key_encrypted) return;

  const zernio = createZernioClient(workspace.late_api_key_encrypted);

  // Resolve late_account_id
  let lateAccountId = context.lateAccountId;
  if (!lateAccountId) {
    const { data: channel } = await supabase
      .from("channels")
      .select("late_account_id")
      .eq("id", context.channelId)
      .single();

    if (!channel) return;
    lateAccountId = channel.late_account_id;
  }

  const commentId = context.variables?.comment_id || context.incomingMessage.sender?.id;
  if (!commentId) return;

  const postId = context.variables?.post_id;
  if (!postId) {
    console.error("No post_id in context variables for privateReply node");
    return;
  }

  const text = interpolateVariables(data.text, context.variables || {});

  try {
    await zernio.comments.sendPrivateReplyToComment({
      path: { postId, commentId },
      body: { accountId: lateAccountId, message: text },
    });

    await supabase.from("messages").insert({
      conversation_id: context.conversationId,
      direction: "outbound",
      text,
      attachments: data.imageUrl
        ? [{ type: "image", url: data.imageUrl }]
        : null,
      sent_by_flow_id: context.flowId,
      status: "sent",
    });
  } catch (error) {
    console.error("Failed to send private reply:", error);
    await supabase.from("messages").insert({
      conversation_id: context.conversationId,
      direction: "outbound",
      text,
      sent_by_flow_id: context.flowId,
      status: "failed",
    });
  }
}

async function completeSession(
  supabase: SupabaseClient<Database>,
  sessionId: string
) {
  // Only an active session can complete: a concurrent cancel (e.g. the cron's
  // stranded-session settle) must not be overwritten to completed. Zero rows
  // matched also skips the flow_completed analytics event below.
  const { data: session } = await supabase
    .from("flow_sessions")
    .update({ status: "completed" })
    .eq("id", sessionId)
    .eq("status", "active")
    .select("flow_id, contact_id, channel_id")
    .single();

  if (session) {
    const { data: flow } = await supabase
      .from("flows")
      .select("workspace_id")
      .eq("id", session.flow_id)
      .single();

    if (flow) {
      await supabase.from("analytics_events").insert({
        workspace_id: flow.workspace_id,
        flow_id: session.flow_id,
        contact_id: session.contact_id,
        event_type: "flow_completed",
      });
    }
  }
}

async function executeEnrollSequence(
  supabase: SupabaseClient<Database>,
  data: EnrollSequenceNodeData,
  context: FlowExecutionContext
) {
  if (!data.sequenceId) {
    console.error("enrollSequence node missing sequenceId");
    return;
  }

  // Verify sequence exists and is active
  const { data: sequence } = await supabase
    .from("sequences")
    .select("id, steps, status")
    .eq("id", data.sequenceId)
    .single();

  if (!sequence || sequence.status !== "active") {
    console.error("Sequence not found or not active:", data.sequenceId);
    return;
  }

  const steps = (sequence.steps as Array<{ type: string; delayMinutes?: number }>) || [];
  if (steps.length === 0) return;

  // Calculate next_step_at based on first step
  let nextStepAt: string;
  const firstStep = steps[0];
  if (firstStep.type === "delay" && firstStep.delayMinutes) {
    nextStepAt = new Date(
      Date.now() + firstStep.delayMinutes * 60 * 1000
    ).toISOString();
  } else {
    nextStepAt = new Date().toISOString();
  }

  // Create enrollment (ignore duplicate errors)
  const { error } = await supabase
    .from("sequence_enrollments")
    .insert({
      sequence_id: data.sequenceId,
      contact_id: context.contactId,
      channel_id: context.channelId,
      next_step_at: nextStepAt,
    });

  if (error && error.code !== "23505") {
    console.error("Failed to enroll contact in sequence:", error);
  }
  if (!error) {
    await emitContactEvent(supabase, context, "sequence_subscribed", { sequenceId: data.sequenceId });
  }
}

function resolveVariablePath(
  variables: Record<string, unknown>,
  path: string
): unknown {
  let value: unknown = variables;
  for (const key of path.split(".")) {
    if (typeof value !== "object" || value === null) return undefined;
    value = (value as Record<string, unknown>)[key];
  }
  return value;
}

function interpolateVariables(
  text: string,
  variables: Record<string, unknown>
): string {
  // Supports dot paths ({{myvar.data.name}}) into object variables (e.g. parsed
  // httpRequest JSON responses). Unresolved paths leave the token literal.
  return text.replace(/\{\{(\w+(?:\.\w+)*)\}\}/g, (token, path: string) => {
    const value = resolveVariablePath(variables, path);
    if (value === null || value === undefined) return token;
    return typeof value === "object" ? JSON.stringify(value) : String(value);
  });
}

export interface CollectInputNodeData {
  question?: string;
  inputType?: "text" | "email" | "phone" | "number" | "url" | "choice" | "name" | "first_name" | "last_name" | "date" | "datetime";
  /** Elección múltiple */
  options?: string[];
  /** Minutes to wait for the answer; 0 = no limit. */
  expireMinutes?: number;
  variableName?: string;
  fieldSlug?: string;
  retryText?: string;
}

function isValidCollectedInput(
  type: CollectInputNodeData["inputType"],
  value: string,
  options?: string[]
): boolean {
  if (!value) return false;
  switch (type) {
    case "choice":
      return (options ?? []).some((o) => o.trim().toLowerCase() === value.toLowerCase());
    case "date":
      return /^\d{4}-\d{1,2}-\d{1,2}$|^\d{1,2}[/-]\d{1,2}[/-]\d{2,4}$/.test(value);
    case "datetime":
      return /^\d{1,4}[/-]\d{1,2}[/-]\d{1,4}[ T]\d{1,2}:\d{2}/.test(value);
    case "name":
    case "first_name":
    case "last_name":
      return value.length >= 2 && value.length <= 80;
    case "email":
      return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value);
    case "phone":
      return /^\+?[\d\s().-]{7,20}$/.test(value);
    case "number":
      return /^-?\d+([.,]\d+)?$/.test(value);
    case "url":
      return /^(https?:\/\/)?[\w-]+(\.[\w-]+)+(\/\S*)?$/i.test(value);
    default:
      return true;
  }
}

function defaultRetryText(type: CollectInputNodeData["inputType"]): string {
  switch (type) {
    case "email":
      return "Ese correo no parece válido. ¿Me lo escribes de nuevo? 🙏";
    case "phone":
      return "Ese número no parece válido. ¿Me lo escribes de nuevo con el código de país?";
    case "number":
      return "Necesito un número. ¿Me lo escribes de nuevo?";
    case "url":
      return "Ese enlace no parece válido. ¿Me lo envías de nuevo?";
    case "choice":
      return "Elige una de las opciones, por favor 👇";
    case "date":
      return "Escríbeme la fecha así: DD/MM/AAAA 🙏";
    case "datetime":
      return "Escríbeme la fecha y la hora así: DD/MM/AAAA 14:30 🙏";
    default:
      return "No te entendí, ¿me lo escribes de nuevo?";
  }
}

/** Report a contact change made by a flow step to "Eventos de contactos" automations. */
function emitContactEvent(
  supabase: SupabaseClient<Database>,
  context: FlowExecutionContext,
  event: ContactEvent,
  detail: ContactEventDetail
) {
  return fireContactEvent(supabase, {
    workspaceId: context.workspaceId,
    contactId: context.contactId,
    event,
    detail,
    sourceFlowId: context.flowId,
    chain: Number(context.variables?.__contact_event_chain ?? 0) || 0,
  });
}

/* ───────── "Acciones": one step that runs several actions, like ManyChat ───────── */

export interface ActionListItem {
  id?: string;
  type:
    | "addTag"
    | "removeTag"
    | "setCustomField"
    | "clearCustomField"
    | "deleteContact"
    | "enrollSequence"
    | "unenrollSequence"
    | "httpRequest"
    | "pauseAutomations"
    | "openConversation"
    | "closeConversation"
    | "goToFlow";
  tagName?: string;
  fieldSlug?: string;
  value?: string;
  sequenceId?: string;
  flowId?: string;
  url?: string;
  method?: string;
  body?: string;
  responseVariable?: string;
}

export interface ActionListNodeData {
  actions?: ActionListItem[];
}

async function executeActionList(
  supabase: SupabaseClient<Database>,
  data: ActionListNodeData,
  context: FlowExecutionContext,
  sessionId: string
): Promise<string | void> {
  for (const a of data.actions ?? []) {
    try {
      switch (a.type) {
        case "addTag":
        case "removeTag":
          if (a.tagName?.trim()) {
            await executeTag(
              supabase,
              { action: a.type === "addTag" ? "add" : "remove", tagName: a.tagName.trim() },
              context
            );
          }
          break;
        case "setCustomField":
          if (a.fieldSlug) await executeSetField(supabase, { fieldSlug: a.fieldSlug, value: a.value ?? "" }, context);
          break;
        case "clearCustomField": {
          if (!a.fieldSlug) break;
          const { data: def } = await supabase
            .from("custom_field_definitions")
            .select("id")
            .eq("workspace_id", context.workspaceId)
            .eq("slug", a.fieldSlug)
            .maybeSingle();
          if (def) {
            await supabase
              .from("contact_custom_fields")
              .delete()
              .eq("contact_id", context.contactId)
              .eq("field_id", def.id);
            await emitContactEvent(supabase, context, "custom_field_changed", { fieldSlug: a.fieldSlug });
          }
          break;
        }
        case "deleteContact":
          await supabase.from("contacts").delete().eq("id", context.contactId);
          return "pause";
        case "enrollSequence":
          if (a.sequenceId) await executeEnrollSequence(supabase, { sequenceId: a.sequenceId }, context);
          break;
        case "unenrollSequence": {
          if (!a.sequenceId) break;
          const { data: rows } = await supabase
            .from("sequence_enrollments")
            .update({ status: "cancelled" })
            .eq("contact_id", context.contactId)
            .eq("sequence_id", a.sequenceId)
            .eq("status", "active")
            .select("id");
          if (rows && rows.length > 0) {
            await emitContactEvent(supabase, context, "sequence_unsubscribed", { sequenceId: a.sequenceId });
          }
          break;
        }
        case "httpRequest":
          if (a.url) {
            await executeHttpRequest(
              {
                method: (a.method as HttpRequestNodeData["method"]) || "POST",
                url: a.url,
                body: a.body,
                responseVariable: a.responseVariable,
              } as HttpRequestNodeData,
              context
            );
            if (a.responseVariable) {
              await supabase
                .from("flow_sessions")
                .update({ variables: (context.variables ?? {}) as Json })
                .eq("id", sessionId);
            }
          }
          break;
        case "pauseAutomations":
          await supabase
            .from("conversations")
            .update({ is_automation_paused: true })
            .eq("id", context.conversationId);
          break;
        case "openConversation":
        case "closeConversation":
          await supabase
            .from("conversations")
            .update({ status: a.type === "openConversation" ? "open" : "closed" })
            .eq("id", context.conversationId);
          break;
        case "goToFlow":
          if (a.flowId) {
            await executeGoToFlow(supabase, { flowId: a.flowId, returnAfter: false }, context, sessionId);
            return "pause";
          }
          break;
      }
    } catch (err) {
      console.error(`Action ${a.type} failed:`, err);
    }
  }
}

/** "Recopilación de datos" with a time limit that has passed. */
export function isWaitExpired(session: { variables: unknown }): boolean {
  const at = (session.variables as Record<string, unknown> | null)?.__ci_expires_at;
  return typeof at === "string" && new Date(at).getTime() < Date.now();
}


/** ManyChat question block inside "Enviar mensaje" (Recopilación de datos). */
export interface MessageQuestion {
  text: string;
  inputType?: CollectInputNodeData["inputType"];
  options?: string[];
  fieldSlug?: string;
  variableName?: string;
  retryText?: string;
  /** "La recopilación de datos expira en" N unidades. */
  expireValue?: number;
  expireUnit?: "seconds" | "minutes" | "hours" | "days";
  /** "Reintentar N veces si la respuesta del usuario no es válida". */
  retries?: number;
}

const UNIT_MS: Record<string, number> = {
  seconds: 1000,
  minutes: 60_000,
  hours: 3_600_000,
  days: 86_400_000,
};

async function askMessageQuestion(
  supabase: SupabaseClient<Database>,
  q: MessageQuestion,
  nodeId: string,
  context: FlowExecutionContext,
  sessionId: string,
  alreadySent = false
): Promise<"pause"> {
  if (!alreadySent) {
    await executeSendMessage(supabase, { messages: [questionMessage(q)] } as unknown as SendMessageNodeData, context);
  }

  context.variables ??= {};
  delete context.variables.__ci_retries;
  // An AI Step right after this question reads the question and the answer.
  context.variables.__last_question = q.text;
  const ms = Number(q.expireValue ?? 0) * (UNIT_MS[q.expireUnit ?? "minutes"] ?? 60_000);
  let expiresAt: string | null = null;
  if (ms > 0) {
    expiresAt = new Date(Date.now() + ms).toISOString();
    context.variables.__ci_expires_at = expiresAt;
  } else {
    delete context.variables.__ci_expires_at;
  }
  await supabase
    .from("flow_sessions")
    .update({ waiting_for_input: true, current_node_id: nodeId, variables: context.variables as Json })
    .eq("id", sessionId);

  // "Si el contacto no ha respondido": the cron continues this branch when time runs out.
  if (expiresAt) {
    console.log(`[question] session ${sessionId} waits until ${expiresAt} at node ${nodeId}`);
    const { error: jobError } = await supabase.from("scheduled_jobs").insert({
      type: "input_timeout",
      payload: {
        sessionId,
        nodeId,
        expiresAt,
        flowId: context.flowId,
        channelId: context.channelId,
        contactId: context.contactId,
        conversationId: context.conversationId,
        workspaceId: context.workspaceId,
        lateConversationId: context.lateConversationId || null,
        lateAccountId: context.lateAccountId || null,
      },
      run_at: expiresAt,
    });
    if (jobError) console.error("[question] could not schedule the no-reply job:", jobError.message);
  }
  return "pause";
}

/**
 * The contact did not answer in time: follow "Si el contacto no ha respondido"
 * (handle "noreply"); without it the run simply ends.
 */
export async function resumeNoReply(
  supabase: SupabaseClient<Database>,
  session: Database["public"]["Tables"]["flow_sessions"]["Row"],
  context: FlowExecutionContext
) {
  const { data: flow } = await supabase.from("flows").select("*").eq("id", session.flow_id).single();
  if (!flow) {
    await completeSession(supabase, session.id);
    return;
  }
  const nodes = flow.nodes as unknown as FlowNode[];
  const edges = flow.edges as unknown as FlowEdge[];

  const { data: channel } = await supabase
    .from("channels")
    .select("platform, late_account_id")
    .eq("id", context.channelId)
    .single();
  context.platform = channel?.platform as FlowExecutionContext["platform"];
  if (channel?.late_account_id && !context.lateAccountId) context.lateAccountId = channel.late_account_id;

  context.variables = { ...((session.variables as Record<string, string>) || {}) };
  delete context.variables.__ci_expires_at;
  delete context.variables.__ci_retries;
  await supabase
    .from("flow_sessions")
    .update({ waiting_for_input: false, variables: context.variables as Json })
    .eq("id", session.id);

  const edge = edges.find((e) => e.source === session.current_node_id && e.sourceHandle === "noreply");
  const target = edge && nodes.find((n) => n.id === edge.target);
  if (!target) {
    await completeSession(supabase, session.id);
    return;
  }
  await traverseNodes(supabase, session.id, target, nodes, edges, context, 0);
}


const AI_STEP_MAX_TURNS = 12;

/**
 * ManyChat "AI Step": the AI talks with the contact following the objective and
 * tasks, saves the requested fields and continues to "Siguiente paso" when done.
 */
async function executeAiStep(
  supabase: SupabaseClient<Database>,
  data: AiStepData,
  context: FlowExecutionContext,
  sessionId: string,
  nodeId: string,
  userText?: string
): Promise<"pause" | void> {
  context.variables ??= {};
  let history: AiTurn[] = [];
  if (context.variables.__ai_node === nodeId && context.variables.__ai_history) {
    try {
      history = JSON.parse(context.variables.__ai_history) as AiTurn[];
    } catch {
      history = [];
    }
  }
  if (userText?.trim()) {
    history.push({ role: "user", content: userText.trim() });
  } else if (!history.length && context.variables.__last_question && context.incomingMessage?.text?.trim()) {
    // Like ManyChat + Claude: the AI reads the answer the contact just gave to
    // the previous question instead of asking again.
    history.push({ role: "assistant", content: context.variables.__last_question });
    history.push({ role: "user", content: context.incomingMessage.text.trim() });
  }
  delete context.variables.__last_question;

  const finish = async () => {
    delete context.variables!.__ai_history;
    delete context.variables!.__ai_node;
    await supabase
      .from("flow_sessions")
      .update({ waiting_for_input: false, variables: context.variables as Json })
      .eq("id", sessionId);
  };

  const { data: workspace } = await supabase
    .from("workspaces")
    .select("ai_api_key")
    .eq("id", context.workspaceId)
    .single();

  let turn: { reply: string; fields: Record<string, string>; done: boolean };
  try {
    turn = await runAiStepTurn(workspace?.ai_api_key ?? null, data, history, context.variables as Record<string, string>);
  } catch (err) {
    console.error("[ai-step]", err);
    await finish();
    return;
  }

  // Save "Guardar respuesta del usuario como" fields.
  const allowed = new Set((data.tasks ?? []).filter((t) => t.saveField && t.fieldSlug).map((t) => t.fieldSlug!));
  for (const [slug, raw] of Object.entries(turn.fields as Record<string, unknown>)) {
    if (!allowed.has(slug)) continue;
    const value = String(raw);
    if (slug === "email") {
      await supabase.from("contacts").update({ email: value }).eq("id", context.contactId);
      await emitContactEvent(supabase, context, "system_field_changed", { fieldSlug: "email" });
    } else {
      await executeSetField(supabase, { fieldSlug: slug, value }, context);
    }
    context.variables[slug] = value;
  }

  if (turn.reply) {
    await executeSendMessage(supabase, { messages: [{ text: turn.reply }] } as unknown as SendMessageNodeData, context);
    history.push({ role: "assistant", content: turn.reply });
  }

  const turns = history.filter((h) => h.role === "user").length;
  if (turn.done || turns >= AI_STEP_MAX_TURNS) {
    await finish();
    return;
  }

  context.variables.__ai_node = nodeId;
  context.variables.__ai_history = JSON.stringify(history.slice(-30));
  await supabase
    .from("flow_sessions")
    .update({ waiting_for_input: true, current_node_id: nodeId, variables: context.variables as Json })
    .eq("id", sessionId);
  return "pause";
}


function questionMessage(q: MessageQuestion): Record<string, unknown> {
  const options = (q.options ?? []).map((o) => o.trim()).filter(Boolean);
  const message: Record<string, unknown> = { text: q.text };
  // "Respuestas inmediatas" go out as quick replies with any answer type.
  if (options.length > 0) {
    message.quickReplies = options.slice(0, 13).map((o) => ({ title: o.slice(0, 20), payload: `ci:${o}` }));
  }
  return message;
}

const WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * Meta's messaging rules for automated messages on Instagram:
 * - "private_reply": the person only commented; one private reply is allowed.
 * - "private_reply_used": that single reply was already sent and they have not answered.
 * - "window_closed": more than 24 h since their last message (automations not allowed).
 * - "open": normal DM inside the 24-hour window.
 */
async function messagingGate(
  supabase: SupabaseClient<Database>,
  context: FlowExecutionContext
): Promise<"private_reply" | "private_reply_used" | "window_closed" | "open"> {
  if (context.platform && context.platform !== "instagram") return "open";
  // A run started by a comment stays in the private-reply stage until the person
  // answers by DM (a comment does not open the 24-hour window).
  if (context.variables?.comment_id && context.variables?.post_id && !context.variables.__dm_replied) {
    return context.variables.__pr_sent ? "private_reply_used" : "private_reply";
  }
  const { data: contact } = await supabase
    .from("contacts")
    .select("last_interaction_at")
    .eq("id", context.contactId)
    .maybeSingle();
  const last = contact?.last_interaction_at ? new Date(contact.last_interaction_at).getTime() : NaN;
  if (Number.isFinite(last) && Date.now() - last > WINDOW_MS) return "window_closed";
  return "open";
}

/** One private reply that carries the whole step: its texts and, last, the question. */
async function sendPrivateReplyStep(
  supabase: SupabaseClient<Database>,
  data: SendMessageNodeData,
  q: MessageQuestion | undefined,
  context: FlowExecutionContext
) {
  const texts = (data.messages ?? [])
    .map((m) => String((m as { text?: string }).text ?? "").trim())
    .filter(Boolean);
  const firstWithButtons = (data.messages ?? []).find((m) => (m as { buttons?: unknown[] }).buttons?.length);
  const merged: Record<string, unknown> = q ? questionMessage(q) : { ...(firstWithButtons ?? {}) };
  merged.text = [...texts, ...(q ? [q.text.trim()] : [])].join("\n\n");
  if (!String(merged.text).trim()) return;
  context.variables ??= {};
  const { data: workspace } = await supabase
    .from("workspaces")
    .select("late_api_key_encrypted")
    .eq("id", context.workspaceId)
    .single();
  if (!workspace?.late_api_key_encrypted) return;
  let lateAccountId = context.lateAccountId;
  if (!lateAccountId) {
    const { data: channel } = await supabase.from("channels").select("late_account_id").eq("id", context.channelId).single();
    lateAccountId = channel?.late_account_id ?? undefined;
  }
  if (!lateAccountId) return;
  const zernio = createZernioClient(workspace.late_api_key_encrypted);
  await sendFirstMessageAsPrivateReply(
    supabase,
    zernio,
    { messages: [merged] } as unknown as SendMessageNodeData,
    context,
    lateAccountId
  );
  context.variables.__pr_sent = "1";
}
