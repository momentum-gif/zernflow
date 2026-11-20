"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Tag as TagIcon,
  CheckCheck,
  RotateCcw,
  MailOpen,
  Pause,
  Play,
  PanelRight,
  ChevronDown,
  Loader2,
  Smile,
  Bot,
  MessageSquare,
  Check,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { PlatformIcon } from "@/components/platform-icon";
import { SendFlowBar } from "./send-flow-menu";
import { setContactTag } from "@/lib/actions/contacts";
import type { Database } from "@/lib/types/database";
import type { InboxConversation } from "./conversation-list";

type Message = Database["public"]["Tables"]["messages"]["Row"];
interface Tag {
  id: string;
  name: string;
  color: string | null;
}

const EMOJIS = ["😀", "😂", "😉", "😊", "😍", "🙌", "👏", "👍", "🙏", "💪", "🔥", "🚀", "✅", "❤️", "🤝", "👀", "💯", "🎯", "📈", "💰"];

function formatMessageTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit" });
}

function formatDateSeparator(dateStr: string): string {
  const date = new Date(dateStr);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  const time = formatMessageTime(dateStr);
  if (date.toDateString() === today.toDateString()) return `Hoy, ${time}`;
  if (date.toDateString() === yesterday.toDateString()) return `Ayer, ${time}`;
  return `${date.toLocaleDateString("es", { day: "numeric", month: "short" })}, ${time}`;
}

function shouldShowDateSeparator(current: Message, previous: Message | undefined): boolean {
  if (!previous) return true;
  // ManyChat shows a time separator when there is a gap of more than an hour.
  return new Date(current.created_at).getTime() - new Date(previous.created_at).getTime() > 60 * 60 * 1000;
}

function Avatar({ url, name, size = 7 }: { url?: string | null; name?: string | null; size?: number }) {
  const cls = size === 7 ? "h-7 w-7" : "h-8 w-8";
  return url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt="" className={cn(cls, "flex-shrink-0 rounded-full object-cover")} />
  ) : (
    <div className={cn(cls, "flex flex-shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium")}>
      {name?.[0]?.toUpperCase() ?? "?"}
    </div>
  );
}

function MessageBubble({ message, contact }: { message: Message; contact: InboxConversation["contacts"] }) {
  const isInbound = message.direction === "inbound";
  const isBot = message.sent_by_flow_id !== null;
  return (
    <div className={cn("flex items-end gap-2", isInbound ? "justify-start" : "justify-end")}>
      {isInbound && <Avatar url={contact?.avatar_url} name={contact?.display_name} />}
      <div className="max-w-[70%]">
        <div
          title={formatMessageTime(message.created_at)}
          className={cn(
            "rounded-2xl px-4 py-2 text-sm",
            isInbound ? "bg-muted text-foreground" : "bg-blue-100 text-foreground dark:bg-blue-950/60"
          )}
        >
          {message.text && <p className="whitespace-pre-wrap">{message.text}</p>}
          {!message.text && message.attachments && <p className="text-xs uppercase text-muted-foreground">Archivo adjunto</p>}
        </div>
        {!isInbound && (isBot || message.status === "failed" || message.status === "pending") && (
          <div className="mt-0.5 flex items-center justify-end gap-1 text-[10px] text-muted-foreground">
            {isBot && <Bot className="h-3 w-3" />}
            {message.status === "failed" && <span className="text-red-600">No se pudo enviar</span>}
            {message.status === "pending" && <span>Enviando…</span>}
          </div>
        )}
      </div>
    </div>
  );
}

function IconButton({
  label,
  onClick,
  children,
  active,
  disabled,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
  active?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      className={cn(
        "flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50",
        active && "bg-accent text-foreground"
      )}
    >
      {children}
    </button>
  );
}

export function MessageThread({
  conversation,
  messages: initialMessages,
  tags,
  userId,
  contactPanelOpen,
  onToggleContact,
}: {
  conversation: InboxConversation | null;
  messages: Message[];
  tags: Tag[];
  userId: string;
  contactPanelOpen: boolean;
  onToggleContact: () => void;
}) {
  const router = useRouter();
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [menu, setMenu] = useState<"tags" | "assign" | "emoji" | null>(null);
  const [contactTags, setContactTags] = useState<string[]>([]);
  const [local, setLocal] = useState<Partial<InboxConversation>>({});
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const conv = conversation ? { ...conversation, ...local } : null;

  useEffect(() => setLocal({}), [conversation]);
  useEffect(() => setMessages(initialMessages), [initialMessages]);
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    setContactTags((conversation?.contacts?.contact_tags ?? []).map((t) => t.tag_id));
  }, [conversation?.id, conversation?.contacts?.contact_tags]);

  const update = useCallback(
    async (key: string, patch: Partial<Database["public"]["Tables"]["conversations"]["Update"]>) => {
      if (!conversation) return;
      setBusy(key);
      setLocal((l) => ({ ...l, ...(patch as Partial<InboxConversation>) }));
      const { error } = await createClient().from("conversations").update(patch).eq("id", conversation.id);
      if (error) {
        setLocal({});
        alert("No se pudo actualizar la conversación");
      }
      setBusy(null);
      router.refresh();
    },
    [conversation, router]
  );

  // Refetch messages when the conversation row changes (a new message arrived).
  useEffect(() => {
    if (!conversation) return;
    const supabase = createClient();
    const channel = supabase
      .channel(`conversation-${conversation.id}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "conversations", filter: `id=eq.${conversation.id}` },
        async () => {
          try {
            const res = await fetch(`/api/v1/messages?conversationId=${conversation.id}`);
            if (res.ok) {
              const fresh = await res.json();
              setMessages((prev) => [...fresh, ...prev.filter((m) => m.id.startsWith("optimistic-"))]);
            }
          } catch (err) {
            console.error("Failed to refresh messages:", err);
          }
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversation?.id]);

  async function toggleTag(tag: Tag) {
    if (!conversation?.contact_id) return;
    const has = contactTags.includes(tag.id);
    setContactTags((t) => (has ? t.filter((x) => x !== tag.id) : [...t, tag.id]));
    try {
      await setContactTag(conversation.contact_id, tag.name, has ? "remove" : "add");
      router.refresh();
    } catch {
      setContactTags((t) => (has ? [...t, tag.id] : t.filter((x) => x !== tag.id)));
    }
  }

  async function handleSend() {
    if (!input.trim() || !conversation || sending) return;
    const text = input.trim();
    setInput("");
    setSending(true);
    const optimisticId = `optimistic-${Date.now()}`;
    setMessages((prev) => [
      ...prev,
      {
        id: optimisticId,
        conversation_id: conversation.id,
        direction: "outbound",
        text,
        attachments: null,
        quick_reply_payload: null,
        postback_payload: null,
        callback_data: null,
        platform_message_id: null,
        sent_by_flow_id: null,
        sent_by_node_id: null,
        sent_by_user_id: null,
        status: "pending",
        created_at: new Date().toISOString(),
      },
    ]);
    try {
      const res = await fetch("/api/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId: conversation.id, text }),
      });
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || `Send failed (${res.status})`);
      }
      const confirmed: Message = await res.json();
      setMessages((prev) => prev.map((m) => (m.id === optimisticId ? confirmed : m)));
    } catch (err) {
      alert(err instanceof Error ? err.message : "No se pudo enviar el mensaje");
      setMessages((prev) => prev.map((m) => (m.id === optimisticId ? { ...m, status: "failed" as const } : m)));
    } finally {
      setSending(false);
    }
  }

  if (!conv) {
    return (
      <div className="flex h-full flex-col items-center justify-center bg-background px-6 text-center">
        <MessageSquare className="h-12 w-12 text-muted-foreground/30" />
        <h3 className="mt-4 text-sm font-medium">Aquí podrás chatear con tus contactos en todos los canales conectados</h3>
        <p className="mt-1 text-xs text-muted-foreground">Elegí una conversación de la lista.</p>
      </div>
    );
  }

  const isOpen = conv.status === "open";
  const assignedToMe = conv.assigned_to === userId;
  const platformName = conv.platform[0].toUpperCase() + conv.platform.slice(1);

  return (
    <div className="flex h-full flex-col bg-background">
      {/* Header */}
      <div className="flex h-14 shrink-0 items-center justify-between border-b border-border px-4">
        <div className="flex min-w-0 items-center gap-3">
          <Avatar url={conv.contacts?.avatar_url} name={conv.contacts?.display_name} size={8} />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{conv.contacts?.display_name ?? "Desconocido"}</p>
            <div className="relative">
              <button
                onClick={() => setMenu(menu === "assign" ? null : "assign")}
                className="flex items-center gap-0.5 text-xs text-muted-foreground hover:text-foreground"
              >
                {assignedToMe ? "Asignado a mí" : "No asignado"}
                <ChevronDown className="h-3 w-3" />
              </button>
              {menu === "assign" && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setMenu(null)} />
                  <div className="absolute left-0 top-5 z-50 w-44 rounded-lg border border-border bg-card p-1 text-sm shadow-lg">
                    {[
                      { label: "No asignado", value: null },
                      { label: "Asignado a mí", value: userId },
                    ].map((o) => (
                      <button
                        key={o.label}
                        onClick={() => {
                          setMenu(null);
                          update("assign", { assigned_to: o.value });
                        }}
                        className="flex w-full items-center justify-between rounded-md px-2 py-1.5 hover:bg-muted"
                      >
                        {o.label}
                        {conv.assigned_to === o.value && <Check className="h-3.5 w-3.5" />}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-0.5">
          <div className="relative">
            <IconButton label="Gestionar etiquetas" onClick={() => setMenu(menu === "tags" ? null : "tags")} active={menu === "tags"}>
              <TagIcon className="h-4 w-4" />
            </IconButton>
            {menu === "tags" && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setMenu(null)} />
                <div className="absolute right-0 top-9 z-50 max-h-72 w-56 overflow-y-auto rounded-lg border border-border bg-card p-1 text-sm shadow-lg">
                  {tags.length === 0 && <p className="px-2 py-1.5 text-xs text-muted-foreground">Todavía no hay etiquetas</p>}
                  {tags.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => toggleTag(t)}
                      className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-muted"
                    >
                      <span
                        className={cn(
                          "flex h-4 w-4 items-center justify-center rounded border",
                          contactTags.includes(t.id) ? "border-blue-600 bg-blue-600 text-white" : "border-border"
                        )}
                      >
                        {contactTags.includes(t.id) && <Check className="h-3 w-3" />}
                      </span>
                      <span className="truncate">{t.name}</span>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
          <IconButton
            label={isOpen ? "Marcar como Cerrado" : "Marcar como Abierto"}
            onClick={() => update("status", { status: isOpen ? "closed" : "open" })}
            disabled={!!busy}
          >
            {busy === "status" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : isOpen ? (
              <CheckCheck className="h-4 w-4" />
            ) : (
              <RotateCcw className="h-4 w-4" />
            )}
          </IconButton>
          <IconButton label="Marcar como No leído" onClick={() => update("unread", { unread_count: Math.max(1, conv.unread_count) })} disabled={!!busy}>
            <MailOpen className="h-4 w-4" />
          </IconButton>
          <IconButton
            label={conv.is_automation_paused ? "Reanudar automatización" : "Pausar automatización"}
            onClick={() => update("pause", { is_automation_paused: !conv.is_automation_paused })}
            active={conv.is_automation_paused}
            disabled={!!busy}
          >
            {conv.is_automation_paused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
          </IconButton>
          <IconButton label={contactPanelOpen ? "Ocultar contacto" : "Mostrar contacto"} onClick={onToggleContact} active={contactPanelOpen}>
            <PanelRight className="h-4 w-4" />
          </IconButton>
        </div>
      </div>

      {/* Channel tab */}
      <div className="flex shrink-0 items-center gap-1.5 border-b border-border px-4 py-1.5 text-sm font-medium">
        <PlatformIcon platform={conv.platform} className="h-4 w-4" size={16} />
        {platformName}
        {conv.is_automation_paused && (
          <span className="ml-2 rounded-full bg-orange-100 px-2 py-0.5 text-[10px] font-medium text-orange-700">Automatización pausada</span>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="mx-auto max-w-3xl space-y-3">
          {messages.length === 0 && (
            <p className="py-16 text-center text-sm text-muted-foreground">
              Todavía no hay mensajes directos con este contacto. Si solo comentó una publicación, el chat aparecerá aquí en cuanto se
              envíe o reciba el primer DM.
            </p>
          )}
          {messages.map((message, i) => (
            <div key={message.id}>
              {shouldShowDateSeparator(message, messages[i - 1]) && (
                <p className="my-3 text-center text-[11px] text-muted-foreground">{formatDateSeparator(message.created_at)}</p>
              )}
              <MessageBubble message={message} contact={conv.contacts} />
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Composer */}
      <div className="shrink-0 border-t border-border">
        <div className="flex gap-4 border-b border-border px-4 text-sm">
          <span className="border-b-2 border-blue-600 py-2 font-medium">Responder</span>
        </div>
        <div className="px-4 pt-2">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              const el = e.target;
              el.style.height = "auto";
              el.style.height = `${Math.min(el.scrollHeight, 150)}px`;
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder="Responder aquí"
            rows={2}
            className="w-full resize-none bg-transparent text-sm placeholder:text-muted-foreground focus:outline-none"
            style={{ maxHeight: 150 }}
          />
        </div>
        <div className="flex items-end justify-between gap-2 px-4 pb-3">
          <div className="flex items-end gap-1">
            <div className="relative">
              <IconButton label="Emoji" onClick={() => setMenu(menu === "emoji" ? null : "emoji")} active={menu === "emoji"}>
                <Smile className="h-4 w-4" />
              </IconButton>
              {menu === "emoji" && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setMenu(null)} />
                  <div className="absolute bottom-9 left-0 z-50 grid w-56 grid-cols-5 gap-1 rounded-lg border border-border bg-card p-2 shadow-lg">
                    {EMOJIS.map((em) => (
                      <button
                        key={em}
                        onClick={() => {
                          setInput((v) => v + em);
                          setMenu(null);
                          textareaRef.current?.focus();
                        }}
                        className="rounded p-1 text-lg hover:bg-muted"
                      >
                        {em}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
            <div className="[&>div]:mb-0">
              <SendFlowBar conversationId={conv.id} workspaceId={conv.workspace_id} />
            </div>
          </div>
          <button
            onClick={handleSend}
            disabled={!input.trim() || sending}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:bg-blue-300"
          >
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : `Enviar A ${platformName}`}
          </button>
        </div>
      </div>
    </div>
  );
}
