"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Tag as TagIcon,
  Clock,
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
  Image as ImageIcon,
  Paperclip,
  Mic,
  MessageSquareQuote,
  CalendarClock,
  EyeOff,
  Eye,
  FileText,
  Trash2,
  Search,
  Workflow,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { PlatformIcon } from "@/components/platform-icon";
import { PickAutomationModal } from "./pick-automation-modal";
import { setContactTag } from "@/lib/actions/contacts";
import { uploadFile } from "@/components/flow-builder/panels/MediaUpload";
import { askText, askConfirm } from "@/components/dialogs";
import type { Database } from "@/lib/types/database";
import type { InboxConversation } from "./conversation-list";

type Message = Database["public"]["Tables"]["messages"]["Row"];
interface Tag {
  id: string;
  name: string;
  color: string | null;
}
interface Note {
  id: string;
  text: string;
  attachment_url: string | null;
  attachment_type: string | null;
  created_at: string;
}
interface InboxEvent {
  id: string;
  text: string;
  created_at: string;
}
interface SavedReply {
  id: string;
  title: string;
  text: string;
}
type Attachment = { type?: string; url?: string };
type Item =
  | { kind: "message"; at: string; message: Message }
  | { kind: "note"; at: string; note: Note }
  | { kind: "event"; at: string; event: InboxEvent };

const EMOJIS = ["😀", "😂", "😉", "😊", "😍", "🙌", "👏", "👍", "🙏", "💪", "🔥", "🚀", "✅", "❤️", "🤝", "👀", "💯", "🎯", "📈", "💰"];

const REMIND_OPTIONS: Array<{ label: string; minutes: number }> = [
  { label: "20 minutos", minutes: 20 },
  { label: "1 hora", minutes: 60 },
  { label: "6 horas", minutes: 360 },
  { label: "12 horas", minutes: 720 },
];

const STATUS_NAME: Record<string, string> = { open: "Abierto", closed: "Cerrado", snoozed: "Recordatorio" };

function formatTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit" });
}

function formatDateSeparator(dateStr: string): string {
  const date = new Date(dateStr);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === today.toDateString()) return `Hoy, ${formatTime(dateStr)}`;
  if (date.toDateString() === yesterday.toDateString()) return `Ayer, ${formatTime(dateStr)}`;
  return `${date.toLocaleDateString("es", { day: "numeric", month: "short" })}, ${formatTime(dateStr)}`;
}

function formatWhen(d: Date): string {
  return d.toLocaleString("es", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
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

function AttachmentView({ a }: { a: Attachment }) {
  if (!a.url) return <p className="text-xs uppercase text-muted-foreground">{a.type === "audio" ? "Audio" : "Archivo adjunto"}</p>;
  if (a.type === "image" || a.type === "story_mention" || /\.(png|jpe?g|gif|webp)(\?|$)/i.test(a.url))
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={a.url} alt="" className="max-h-60 rounded-lg" />;
  if (a.type === "audio" || /\.(m4a|mp3|wav|aac|ogg)(\?|$)/i.test(a.url)) return <audio controls src={a.url} className="max-w-[240px]" />;
  if (a.type === "video" || /\.(mp4|mov|webm)(\?|$)/i.test(a.url)) return <video controls src={a.url} className="max-h-60 rounded-lg" />;
  return (
    <a href={a.url} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 text-xs text-blue-600 underline">
      <FileText className="h-4 w-4" /> Archivo
    </a>
  );
}

function MessageBubble({ message, contact }: { message: Message; contact: InboxConversation["contacts"] }) {
  const isInbound = message.direction === "inbound";
  const isBot = message.sent_by_flow_id !== null;
  const attachments = (Array.isArray(message.attachments) ? message.attachments : []) as Attachment[];
  const buttons = ((message as unknown as { buttons?: Array<{ title: string; url?: string | null; quick?: boolean }> }).buttons ?? []);
  return (
    <div className={cn("flex items-end gap-2", isInbound ? "justify-start" : "justify-end")}>
      {isInbound && <Avatar url={contact?.avatar_url} name={contact?.display_name} />}
      <div className="max-w-[70%]">
        <div
          title={formatTime(message.created_at)}
          className={cn(
            "space-y-1.5 rounded-2xl px-4 py-2 text-sm",
            isInbound ? "bg-muted text-foreground" : "bg-blue-100 text-foreground dark:bg-blue-950/60"
          )}
        >
          {attachments.map((a, i) => (
            <AttachmentView key={i} a={a} />
          ))}
          {message.text && <p className="whitespace-pre-wrap">{message.text}</p>}
        </div>
        {buttons.length > 0 && (
          <div className="mt-1 space-y-1">
            {buttons.map((b, i) =>
              b.url ? (
                <a
                  key={i}
                  href={b.url}
                  target="_blank"
                  rel="noreferrer"
                  className="block rounded-xl border border-border bg-card px-4 py-1.5 text-center text-sm font-medium text-blue-600 hover:bg-muted"
                >
                  {b.title}
                </a>
              ) : (
                <div
                  key={i}
                  className={cn(
                    "border border-border bg-card px-4 py-1.5 text-center text-sm font-medium",
                    b.quick ? "rounded-full" : "rounded-xl"
                  )}
                >
                  {b.title}
                </div>
              )
            )}
          </div>
        )}
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
      type="button"
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

function Popover({ onClose, className, children }: { onClose: () => void; className: string; children: React.ReactNode }) {
  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div className={cn("absolute z-50 rounded-lg border border-border bg-card p-1 text-sm shadow-lg", className)}>{children}</div>
    </>
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
  const [notes, setNotes] = useState<Note[]>([]);
  const [events, setEvents] = useState<InboxEvent[]>([]);
  const [hideSystem, setHideSystem] = useState(false);
  const [tab, setTab] = useState<"reply" | "note">("reply");
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [pickOpen, setPickOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [menu, setMenu] = useState<"tags" | "assign" | "emoji" | "remind" | "replies" | null>(null);
  const [pickDate, setPickDate] = useState("");
  const [replies, setReplies] = useState<SavedReply[] | null>(null);
  const [replyQuery, setReplyQuery] = useState("");
  const [contactTags, setContactTags] = useState<string[]>([]);
  const [local, setLocal] = useState<Partial<InboxConversation> & { remind_at?: string | null }>({});
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const fileKind = useRef<"image" | "file" | "audio">("image");

  const conv = conversation ? ({ ...conversation, ...local } as InboxConversation & { remind_at?: string | null }) : null;

  useEffect(() => setLocal({}), [conversation]);
  useEffect(() => setMessages(initialMessages), [initialMessages]);

  useEffect(() => {
    setContactTags((conversation?.contacts?.contact_tags ?? []).map((t) => t.tag_id));
  }, [conversation?.id, conversation?.contacts?.contact_tags]);

  // Notes and system events live in ZernFlow (messages come from Zernio).
  const loadExtras = useCallback(async () => {
    if (!conversation) return;
    const supabase = createClient();
    const [n, e] = await Promise.all([
      supabase.from("inbox_notes" as never).select("id, text, attachment_url, attachment_type, created_at").eq("conversation_id", conversation.id).order("created_at"),
      supabase.from("inbox_events" as never).select("id, text, created_at").eq("conversation_id", conversation.id).order("created_at"),
    ]);
    setNotes(((n.data as unknown as Note[]) ?? []));
    setEvents(((e.data as unknown as InboxEvent[]) ?? []));
  }, [conversation]);

  useEffect(() => {
    setNotes([]);
    setEvents([]);
    loadExtras();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversation?.id]);

  const items: Item[] = [
    ...messages.map((m) => ({ kind: "message" as const, at: m.created_at, message: m })),
    ...notes.map((n) => ({ kind: "note" as const, at: n.created_at, note: n })),
    ...(hideSystem ? [] : events.map((e) => ({ kind: "event" as const, at: e.created_at, event: e }))),
  ].sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [items.length]);

  const logEvent = useCallback(
    async (text: string) => {
      if (!conversation) return;
      const ev = { id: `ev-${Date.now()}`, text, created_at: new Date().toISOString() };
      setEvents((x) => [...x, ev]);
      await createClient()
        .from("inbox_events" as never)
        .insert({ workspace_id: conversation.workspace_id, conversation_id: conversation.id, text } as never);
    },
    [conversation]
  );

  const update = useCallback(
    async (key: string, patch: Record<string, unknown>, event?: string) => {
      if (!conversation) return false;
      setBusy(key);
      setLocal((l) => ({ ...l, ...(patch as Partial<InboxConversation>) }));
      const { error } = await createClient().from("conversations").update(patch as never).eq("id", conversation.id);
      setBusy(null);
      if (error) {
        setLocal({});
        alert(
          error.message.includes("remind_at")
            ? "Falta activar los recordatorios en Supabase."
            : "No se pudo actualizar la conversación"
        );
        return false;
      }
      if (event) await logEvent(event);
      router.refresh();
      return true;
    },
    [conversation, router, logEvent]
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

  async function remindAt(when: Date) {
    setMenu(null);
    await update("remind", { remind_at: when.toISOString(), status: "snoozed" }, `Recordatorio programado para ${formatWhen(when)}`);
  }

  async function sendReply(text: string, attachment?: { url: string; type: string }) {
    if (!conversation) return;
    const optimisticId = `optimistic-${Date.now()}`;
    setMessages((prev) => [
      ...prev,
      {
        id: optimisticId,
        conversation_id: conversation.id,
        direction: "outbound",
        text: text || null,
        attachments: attachment ? [attachment] : null,
        quick_reply_payload: null,
        postback_payload: null,
        callback_data: null,
        platform_message_id: null,
        sent_by_flow_id: null,
        sent_by_node_id: null,
        sent_by_user_id: null,
        status: "pending",
        created_at: new Date().toISOString(),
      } as Message,
    ]);
    try {
      const res = await fetch("/api/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId: conversation.id,
          text,
          ...(attachment ? { attachmentUrl: attachment.url, attachmentType: attachment.type } : {}),
        }),
      });
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || `No se pudo enviar (${res.status})`);
      }
      const confirmed: Message = await res.json();
      setMessages((prev) => prev.map((m) => (m.id === optimisticId ? confirmed : m)));
    } catch (err) {
      alert(err instanceof Error ? err.message : "No se pudo enviar el mensaje");
      setMessages((prev) => prev.map((m) => (m.id === optimisticId ? { ...m, status: "failed" as const } : m)));
    }
  }

  async function addNote(text: string, attachment?: { url: string; type: string }) {
    if (!conversation) return;
    const { data, error } = await createClient()
      .from("inbox_notes" as never)
      .insert({
        workspace_id: conversation.workspace_id,
        conversation_id: conversation.id,
        user_id: userId,
        text,
        attachment_url: attachment?.url ?? null,
        attachment_type: attachment?.type ?? null,
      } as never)
      .select("id, text, attachment_url, attachment_type, created_at")
      .single();
    if (error) {
      alert("No se pudo guardar la nota. Falta activar las notas en Supabase.");
      return;
    }
    setNotes((x) => [...x, data as unknown as Note]);
  }

  async function handleSend() {
    const text = input.trim();
    if (!text || !conversation || sending) return;
    setSending(true);
    setInput("");
    if (tab === "note") await addNote(text);
    else await sendReply(text);
    setSending(false);
  }

  function pickFile(kind: "image" | "file" | "audio") {
    fileKind.current = kind;
    if (fileRef.current) {
      fileRef.current.accept =
        kind === "image" ? "image/png,image/jpeg,image/gif" : kind === "audio" ? ".m4a,.wav,.aac,.mp3,audio/*" : "application/pdf";
      fileRef.current.value = "";
      fileRef.current.click();
    }
  }

  async function onFile(file?: File | null) {
    if (!file) return;
    const kind = fileKind.current;
    const max = kind === "image" ? 8 : 25;
    if (file.size > max * 1024 * 1024) {
      alert(`El archivo pesa más de ${max} MB`);
      return;
    }
    setUploading(true);
    try {
      const url = await uploadFile(file);
      if (tab === "note") await addNote("", { url, type: kind });
      else await sendReply("", { url, type: kind });
    } catch (err) {
      alert(err instanceof Error ? err.message : "No se pudo subir el archivo");
    } finally {
      setUploading(false);
    }
  }

  async function openReplies() {
    setMenu(menu === "replies" ? null : "replies");
    if (replies || !conversation) return;
    const { data } = await createClient()
      .from("saved_replies" as never)
      .select("id, title, text")
      .eq("workspace_id", conversation.workspace_id)
      .order("title");
    setReplies((data as unknown as SavedReply[]) ?? []);
  }

  async function newReply() {
    if (!conversation) return;
    const title = (await askText("Nombre de la respuesta predefinida"))?.trim();
    if (!title) return;
    const text = (await askText("Texto de la respuesta", input))?.trim();
    if (!text) return;
    const { data, error } = await createClient()
      .from("saved_replies" as never)
      .insert({ workspace_id: conversation.workspace_id, title, text } as never)
      .select("id, title, text")
      .single();
    if (error) {
      alert("No se pudo guardar. Falta activar las respuestas predefinidas en Supabase.");
      return;
    }
    setReplies((r) => [...(r ?? []), data as unknown as SavedReply].sort((a, b) => a.title.localeCompare(b.title)));
  }

  async function deleteReply(r: SavedReply) {
    if (!(await askConfirm(`¿Eliminar la respuesta "${r.title}"?`, { destructive: true }))) return;
    await createClient().from("saved_replies" as never).delete().eq("id", r.id);
    setReplies((x) => (x ?? []).filter((y) => y.id !== r.id));
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
  const isNote = tab === "note";
  const filteredReplies = (replies ?? []).filter(
    (r) => !replyQuery || (r.title + " " + r.text).toLowerCase().includes(replyQuery.toLowerCase())
  );

  return (
    <div className="flex h-full flex-col bg-background">
      <input ref={fileRef} type="file" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
      {pickOpen && (
        <PickAutomationModal
          onClose={() => setPickOpen(false)}
          onPick={async (flow) => {
            const res = await fetch(`/api/v1/conversations/${conv.id}/send-flow`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ flowId: flow.id }),
            });
            const body = await res.json().catch(() => ({}));
            if (!res.ok) {
              alert(body.error || "No se pudo enviar la automatización");
              return;
            }
            setPickOpen(false);
            await logEvent(`Automatización enviada: ${flow.name}`);
          }}
        />
      )}

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
                <Popover onClose={() => setMenu(null)} className="left-0 top-5 w-44">
                  {[
                    { label: "No asignado", value: null },
                    { label: "Asignado a mí", value: userId },
                  ].map((o) => (
                    <button
                      key={o.label}
                      onClick={() => {
                        setMenu(null);
                        if (conv.assigned_to !== o.value)
                          update(
                            "assign",
                            { assigned_to: o.value },
                            o.value ? "La conversación fue asignada a vos" : "La conversación fue movida a No asignado"
                          );
                      }}
                      className="flex w-full items-center justify-between rounded-md px-2 py-1.5 hover:bg-muted"
                    >
                      {o.label}
                      {conv.assigned_to === o.value && <Check className="h-3.5 w-3.5" />}
                    </button>
                  ))}
                </Popover>
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
              <Popover onClose={() => setMenu(null)} className="right-0 top-9 max-h-72 w-56 overflow-y-auto">
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
              </Popover>
            )}
          </div>
          <div className="relative">
            <IconButton
              label="Recuérdamelo en"
              onClick={() => setMenu(menu === "remind" ? null : "remind")}
              active={menu === "remind" || !!conv.remind_at}
            >
              <Clock className="h-4 w-4" />
            </IconButton>
            {menu === "remind" && (
              <Popover onClose={() => setMenu(null)} className="right-0 top-9 w-56">
                <p className="px-2 py-1.5 text-xs text-muted-foreground">Recuérdamelo en</p>
                {REMIND_OPTIONS.map((o) => (
                  <button
                    key={o.label}
                    onClick={() => remindAt(new Date(Date.now() + o.minutes * 60000))}
                    className="flex w-full rounded-md px-2 py-1.5 text-left hover:bg-muted"
                  >
                    {o.label}
                  </button>
                ))}
                <div className="rounded-md px-2 py-1.5">
                  <p className="mb-1 flex items-center gap-2">
                    <CalendarClock className="h-4 w-4" /> Elegir fecha y hora
                  </p>
                  <div className="flex gap-1">
                    <input
                      type="datetime-local"
                      value={pickDate}
                      onChange={(e) => setPickDate(e.target.value)}
                      className="min-w-0 flex-1 rounded border border-border bg-card px-1 py-0.5 text-xs"
                    />
                    <button
                      disabled={!pickDate}
                      onClick={() => remindAt(new Date(pickDate))}
                      className="rounded bg-blue-600 px-2 text-xs text-white disabled:opacity-50"
                    >
                      OK
                    </button>
                  </div>
                </div>
                {conv.remind_at && (
                  <button
                    onClick={() => {
                      setMenu(null);
                      update("remind", { remind_at: null, status: "open" }, "Recordatorio cancelado");
                    }}
                    className="flex w-full rounded-md px-2 py-1.5 text-left text-red-600 hover:bg-muted"
                  >
                    Cancelar recordatorio ({formatWhen(new Date(conv.remind_at))})
                  </button>
                )}
              </Popover>
            )}
          </div>
          <IconButton
            label={isOpen ? "Marcar como Cerrado" : "Marcar como Abierto"}
            onClick={() =>
              update(
                "status",
                { status: isOpen ? "closed" : "open", ...(isOpen ? {} : { remind_at: null }) },
                `La conversación fue movida de ${STATUS_NAME[conv.status] ?? conv.status} a ${isOpen ? "Cerrado" : "Abierto"}`
              )
            }
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
            onClick={() =>
              update(
                "pause",
                { is_automation_paused: !conv.is_automation_paused },
                conv.is_automation_paused ? "Automatización reanudada" : "Automatización pausada"
              )
            }
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
      <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-1.5">
        <span className="flex items-center gap-1.5 text-sm font-medium">
          <PlatformIcon platform={conv.platform} className="h-4 w-4" size={16} />
          {platformName}
          {conv.is_automation_paused && (
            <span className="ml-2 rounded-full bg-orange-100 px-2 py-0.5 text-[10px] font-medium text-orange-700">Automatización pausada</span>
          )}
        </span>
        <IconButton label={hideSystem ? "Mostrar mensajes del sistema" : "Ocultar mensajes del sistema"} onClick={() => setHideSystem((h) => !h)}>
          {hideSystem ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
        </IconButton>
      </div>

      {/* Timeline */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="mx-auto max-w-3xl space-y-3">
          {items.length === 0 && (
            <p className="py-16 text-center text-sm text-muted-foreground">
              Todavía no hay mensajes directos con este contacto. Si solo comentó una publicación, el chat aparecerá aquí en cuanto se
              envíe o reciba el primer DM.
            </p>
          )}
          {items.map((it, i) => {
            const prev = items[i - 1];
            const showTime = !prev || new Date(it.at).getTime() - new Date(prev.at).getTime() > 60 * 60 * 1000;
            return (
              <div key={`${it.kind}-${it.kind === "message" ? it.message.id : it.kind === "note" ? it.note.id : it.event.id}`}>
                {showTime && <p className="my-3 text-center text-[11px] text-muted-foreground">{formatDateSeparator(it.at)}</p>}
                {it.kind === "message" && <MessageBubble message={it.message} contact={conv.contacts} />}
                {it.kind === "event" && <p className="text-center text-xs text-muted-foreground">{it.event.text}</p>}
                {it.kind === "note" && (
                  <div className="flex justify-end">
                    <div className="max-w-[70%] space-y-1.5 rounded-2xl bg-amber-100 px-4 py-2 text-sm text-amber-950 dark:bg-amber-900/40 dark:text-amber-100">
                      <p className="text-[10px] font-semibold uppercase opacity-70">Nota</p>
                      {it.note.attachment_url && <AttachmentView a={{ url: it.note.attachment_url, type: it.note.attachment_type ?? undefined }} />}
                      {it.note.text && <p className="whitespace-pre-wrap">{it.note.text}</p>}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Composer */}
      <div className={cn("shrink-0 border-t border-border", isNote && "bg-amber-50 dark:bg-amber-950/20")}>
        <div className="flex gap-4 border-b border-border px-4 text-sm">
          {(
            [
              ["reply", "Responder"],
              ["note", "Nota"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={cn("border-b-2 py-2", tab === key ? "border-blue-600 font-medium" : "border-transparent text-muted-foreground")}
            >
              {label}
            </button>
          ))}
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
            placeholder={isNote ? "Deja una nota para tus compañeros o un recordatorio para ti" : "Responder aquí"}
            rows={2}
            className="w-full resize-none bg-transparent text-sm placeholder:text-muted-foreground focus:outline-none"
            style={{ maxHeight: 150 }}
          />
        </div>
        <div className="flex items-end justify-between gap-2 px-4 pb-3">
          <div className="flex items-end gap-0.5">
            <div className="relative">
              <IconButton label="Emoji" onClick={() => setMenu(menu === "emoji" ? null : "emoji")} active={menu === "emoji"}>
                <Smile className="h-4 w-4" />
              </IconButton>
              {menu === "emoji" && (
                <Popover onClose={() => setMenu(null)} className="bottom-9 left-0 grid w-56 grid-cols-5 gap-1 p-2">
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
                </Popover>
              )}
            </div>
            <IconButton label="Envía una imagen" onClick={() => pickFile("image")} disabled={uploading}>
              <ImageIcon className="h-4 w-4" />
            </IconButton>
            <IconButton label="Envía un archivo" onClick={() => pickFile("file")} disabled={uploading}>
              <Paperclip className="h-4 w-4" />
            </IconButton>
            {!isNote && (
              <IconButton label="Envía un audio de hasta 25 MB" onClick={() => pickFile("audio")} disabled={uploading}>
                <Mic className="h-4 w-4" />
              </IconButton>
            )}
            {!isNote && (
              <IconButton label="Automatización" onClick={() => setPickOpen(true)}>
                <Workflow className="h-4 w-4" />
              </IconButton>
            )}
            <div className="relative">
              <IconButton label="Respuestas predefinidas" onClick={openReplies} active={menu === "replies"}>
                <MessageSquareQuote className="h-4 w-4" />
              </IconButton>
              {menu === "replies" && (
                <Popover onClose={() => setMenu(null)} className="bottom-9 left-0 w-72">
                  <div className="relative p-1">
                    <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                    <input
                      autoFocus
                      value={replyQuery}
                      onChange={(e) => setReplyQuery(e.target.value)}
                      placeholder="Buscar respuestas"
                      className="w-full rounded-md border border-border bg-background py-1 pl-7 pr-2 text-xs"
                    />
                  </div>
                  <div className="max-h-56 overflow-y-auto">
                    {replies === null && <Loader2 className="mx-auto my-3 h-4 w-4 animate-spin text-muted-foreground" />}
                    {replies?.length === 0 && <p className="px-2 py-2 text-xs text-muted-foreground">Todavía no tenés respuestas predefinidas.</p>}
                    {filteredReplies.map((r) => (
                      <div key={r.id} className="group flex items-start gap-1 rounded-md hover:bg-muted">
                        <button
                          onClick={() => {
                            setInput(r.text);
                            setMenu(null);
                            textareaRef.current?.focus();
                          }}
                          className="min-w-0 flex-1 px-2 py-1.5 text-left"
                        >
                          <p className="truncate text-sm font-medium">{r.title}</p>
                          <p className="truncate text-xs text-muted-foreground">{r.text}</p>
                        </button>
                        <button
                          onClick={() => deleteReply(r)}
                          aria-label="Eliminar"
                          className="p-1.5 text-muted-foreground opacity-0 hover:text-red-600 group-hover:opacity-100"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                  <button onClick={newReply} className="mt-1 w-full rounded-md px-2 py-1.5 text-left text-xs text-blue-600 hover:bg-muted">
                    + Nueva respuesta predefinida
                  </button>
                </Popover>
              )}
            </div>
            {uploading && <Loader2 className="mb-2 ml-1 h-4 w-4 animate-spin text-muted-foreground" />}
          </div>
          <button
            onClick={handleSend}
            disabled={!input.trim() || sending}
            className={cn(
              "shrink-0 whitespace-nowrap rounded-md px-4 py-2 text-sm font-medium text-white transition-colors disabled:opacity-50",
              isNote ? "bg-amber-500 hover:bg-amber-600" : "bg-blue-600 hover:bg-blue-700"
            )}
          >
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : isNote ? "Añadir Nota" : `Enviar A ${platformName}`}
          </button>
        </div>
      </div>
    </div>
  );
}
