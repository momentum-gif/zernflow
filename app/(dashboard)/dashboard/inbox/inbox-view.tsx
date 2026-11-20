"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { MessageSquare, RefreshCw, Search, Inbox, Plus, ChevronDown, ArrowUpDown, X, Tag as TagIcon, Clock, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { ConversationList, type InboxConversation } from "@/components/inbox/conversation-list";
import { MessageThread } from "@/components/inbox/message-thread";
import { ContactPanel } from "@/components/inbox/contact-panel";
import { askText, askConfirm } from "@/components/dialogs";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import type { Database } from "@/lib/types/database";

type Message = Database["public"]["Tables"]["messages"]["Row"];
export interface InboxTag {
  id: string;
  name: string;
  color: string | null;
}

export type StatusFilter = "open" | "closed" | "all";
export type SortOrder = "newest" | "oldest";
export type InboxCondition = { kind: "tag"; op: "is" | "is_not"; tagId: string };

const STATUS_OPTIONS: Array<{ value: StatusFilter; label: string; short: string; hint?: string }> = [
  { value: "open", label: "Abrir chats", short: "Abrir Chats", hint: "Requiere la atención humana" },
  { value: "closed", label: "Chats cerrados", short: "Chats Cerrados", hint: "Marcado como cerrado o gestionado por automatización" },
  { value: "all", label: "Todos los chats", short: "Todos Los Chats" },
];

function Dropdown({
  label,
  icon,
  children,
  active,
}: {
  label: React.ReactNode;
  icon?: React.ReactNode;
  active?: boolean;
  children: (close: () => void) => React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "flex h-8 items-center gap-1.5 rounded-md border border-border bg-background px-2.5 text-xs font-medium hover:bg-accent",
          active && "border-blue-500 text-blue-600"
        )}
      >
        {icon}
        {label}
        <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-9 z-50 min-w-56 rounded-lg border border-border bg-card p-1 shadow-lg">
            {children(() => setOpen(false))}
          </div>
        </>
      )}
    </div>
  );
}

function MenuItem({ selected, onClick, title, hint }: { selected?: boolean; onClick: () => void; title: React.ReactNode; hint?: string }) {
  return (
    <button
      onClick={onClick}
      className={cn("flex w-full flex-col items-start rounded-md px-3 py-2 text-left hover:bg-muted", selected && "bg-muted")}
    >
      <span className="text-sm">{title}</span>
      {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
    </button>
  );
}

export function InboxView({
  conversations,
  tags: initialTags,
  sequences,
  workspaceId,
  userId,
}: {
  conversations: InboxConversation[];
  tags: InboxTag[];
  sequences: Array<{ id: string; name: string }>;
  workspaceId: string;
  userId: string;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<InboxConversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [showContactPanel, setShowContactPanel] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [tags, setTags] = useState(initialTags);

  // Toolbar state (like ManyChat's Inbox)
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<StatusFilter>("open");
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [sort, setSort] = useState<SortOrder>("newest");
  const [channel, setChannel] = useState<string>("all");
  const [tagFolder, setTagFolder] = useState<string | null>(null);
  const [conditions, setConditions] = useState<InboxCondition[]>([]);
  const [draftCond, setDraftCond] = useState<InboxCondition | null>(null);

  useEffect(() => setTags(initialTags), [initialTags]);

  const platforms = [...new Set(conversations.map((c) => c.platform))];
  // Like ManyChat, folder counts follow the status filter (Abrir chats by default).
  const inStatus = (c: InboxConversation) =>
    status === "all" ? true : status === "open" ? c.status === "open" : c.status !== "open";
  const tagCount = (tagId: string) =>
    conversations.filter((c) => inStatus(c) && c.contacts?.contact_tags?.some((t) => t.tag_id === tagId)).length;

  async function handleSyncConversations() {
    setSyncing(true);
    setSyncError(null);
    try {
      const res = await fetch("/api/v1/channels/sync", { method: "POST" });
      const data = await res.json();
      if (!res.ok || data.error) {
        setSyncError(data.error || "No se pudo sincronizar");
        return;
      }
      router.refresh();
    } catch {
      setSyncError("No se pudo sincronizar. Revisá tu conexión.");
    } finally {
      setSyncing(false);
    }
  }

  const [tagMenu, setTagMenu] = useState<string | null>(null);

  async function renameTag(t: InboxTag) {
    setTagMenu(null);
    const name = (await askText("Renombrar etiqueta", t.name))?.trim();
    if (!name || name === t.name) return;
    const { error } = await createClient().from("tags").update({ name }).eq("id", t.id);
    if (error) return alert("No se pudo renombrar. ¿Ya existe una etiqueta con ese nombre?");
    setTags((x) => x.map((y) => (y.id === t.id ? { ...y, name } : y)).sort((a, b) => a.name.localeCompare(b.name)));
    router.refresh();
  }

  async function deleteTag(t: InboxTag) {
    setTagMenu(null);
    const n = tagCount(t.id);
    const ok = await askConfirm(
      `¿Eliminar la etiqueta "${t.name}"?${n ? ` Se va a quitar de ${n} contacto(s).` : ""} No se puede deshacer.`,
      { destructive: true }
    );
    if (!ok) return;
    const { error } = await createClient().from("tags").delete().eq("id", t.id);
    if (error) return alert("No se pudo eliminar la etiqueta");
    setTags((x) => x.filter((y) => y.id !== t.id));
    if (tagFolder === t.id) setTagFolder(null);
    router.refresh();
  }

  async function createTag() {
    const name = (await askText("Crear etiqueta"))?.trim();
    if (!name) return;
    const { data } = await createClient()
      .from("tags")
      .upsert({ workspace_id: workspaceId, name }, { onConflict: "workspace_id,name" })
      .select("id, name, color")
      .single();
    if (data) setTags((t) => [...t.filter((x) => x.id !== data.id), data].sort((a, b) => a.name.localeCompare(b.name)));
  }

  // "Iniciar Chat" from a contact profile opens /dashboard/inbox?c=<conversation id>.
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("c");
    if (!id) return;
    const match = conversations.find((c) => c.id === id);
    if (match) {
      setSelected(match);
      setStatus("all");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSelect = useCallback((c: InboxConversation) => setSelected(c), []);

  // Keep the selected conversation fresh when the list changes (status, pause…).
  useEffect(() => {
    if (!selected) return;
    const fresh = conversations.find((c) => c.id === selected.id);
    if (fresh && fresh !== selected) setSelected(fresh);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversations]);

  useEffect(() => {
    if (!selected) {
      setMessages([]);
      return;
    }
    async function loadMessages() {
      setLoadingMessages(true);
      try {
        const res = await fetch(`/api/v1/messages?conversationId=${selected!.id}`);
        setMessages(res.ok ? ((await res.json()) ?? []) : []);
      } catch {
        setMessages([]);
      } finally {
        setLoadingMessages(false);
      }
      if (selected!.unread_count > 0) {
        await createClient().from("conversations").update({ unread_count: 0 }).eq("id", selected!.id);
      }
    }
    loadMessages();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id]);

  const statusOpt = STATUS_OPTIONS.find((o) => o.value === status)!;

  return (
    <div className="flex h-full flex-col">
      {/* Top bar */}
      <div className="flex h-14 shrink-0 items-center gap-4 border-b border-border px-5">
        <h1 className="w-52 shrink-0 whitespace-nowrap text-lg font-semibold">Bandeja de entrada</h1>
        <div className="relative mx-auto w-full max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            placeholder="Buscar a través de conversaciones de Inbox"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-md border border-input bg-background py-1.5 pl-9 pr-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <div className="w-52 shrink-0" />
      </div>

      <div className="flex min-h-0 flex-1">
        {/* Left sidebar: folders + tags */}
        <div className="w-52 shrink-0 space-y-1 border-r border-border p-3 text-sm">
          <button
            onClick={() => setTagFolder(null)}
            className={cn(
              "flex w-full items-center justify-between rounded-md px-2 py-1.5 font-medium hover:bg-accent",
              tagFolder === null && "bg-accent"
            )}
          >
            <span className="flex items-center gap-2 whitespace-nowrap">
              <Inbox className="h-4 w-4" /> Todos los chats
            </span>
            <span className="text-xs text-muted-foreground">{conversations.filter(inStatus).length || ""}</span>
          </button>
          <button
            onClick={() => {
              setTagFolder("__reminders");
              setStatus("all");
            }}
            className={cn(
              "flex w-full items-center justify-between rounded-md px-2 py-1.5 hover:bg-accent",
              tagFolder === "__reminders" && "bg-accent"
            )}
          >
            <span className="flex items-center gap-2 whitespace-nowrap">
              <Clock className="h-4 w-4" /> Recordatorios
            </span>
            <span className="text-xs text-muted-foreground">
              {conversations.filter((c) => (c as { remind_at?: string | null }).remind_at).length || ""}
            </span>
          </button>
          <div className="flex items-center justify-between px-2 pt-3 text-xs text-muted-foreground">
            <span>Etiquetas</span>
            <button onClick={createTag} aria-label="Crear etiqueta" title="Crear etiqueta" className="rounded p-0.5 hover:bg-accent">
              <Plus className="h-3.5 w-3.5" />
            </button>
          </div>
          {tags.map((t) => (
            <div
              key={t.id}
              className={cn("group relative flex items-center rounded-md hover:bg-accent", tagFolder === t.id && "bg-accent")}
            >
              <button
                onClick={() => setTagFolder(t.id)}
                className="flex min-w-0 flex-1 items-center justify-between px-2 py-1.5"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <TagIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <span className="truncate">{t.name}</span>
                </span>
                <span className="text-xs text-muted-foreground group-hover:hidden">{tagCount(t.id)}</span>
              </button>
              <button
                onClick={() => setTagMenu(tagMenu === t.id ? null : t.id)}
                aria-label={`Opciones de ${t.name}`}
                className={cn("mr-1 rounded p-0.5 text-muted-foreground hover:bg-muted", tagMenu === t.id ? "block" : "hidden group-hover:block")}
              >
                <MoreHorizontal className="h-4 w-4" />
              </button>
              {tagMenu === t.id && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setTagMenu(null)} />
                  <div className="absolute left-full top-0 z-50 ml-1 w-40 rounded-lg border border-border bg-card p-1 shadow-lg">
                    <button onClick={() => renameTag(t)} className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-muted">
                      <Pencil className="h-3.5 w-3.5" /> Renombrar
                    </button>
                    <button
                      onClick={() => deleteTag(t)}
                      className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-red-600 hover:bg-muted"
                    >
                      <Trash2 className="h-3.5 w-3.5" /> Eliminar
                    </button>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>

        {/* Conversations column */}
        <div className="flex min-w-0 flex-1 flex-col">
          {/* Toolbar */}
          <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border px-4 py-2.5">
            <Dropdown label={statusOpt.short} icon={<MessageSquare className="h-3.5 w-3.5" />}>
              {(close) =>
                STATUS_OPTIONS.map((o) => (
                  <MenuItem
                    key={o.value}
                    selected={status === o.value}
                    onClick={() => {
                      setStatus(o.value);
                      close();
                    }}
                    title={
                      <>
                        {o.label}
                        {o.value === "open" && <span className="text-muted-foreground"> (predeterminado)</span>}
                      </>
                    }
                    hint={o.hint}
                  />
                ))
              }
            </Dropdown>
            <button
              onClick={() => setUnreadOnly((u) => !u)}
              className={cn(
                "h-8 rounded-md border border-border px-2.5 text-xs font-medium hover:bg-accent",
                unreadOnly && "border-blue-500 bg-blue-50 text-blue-600 dark:bg-blue-950/40"
              )}
            >
              No Leído
            </button>
            <Dropdown label={sort === "newest" ? "Ordenar: Más Reciente" : "Ordenar: Más Antiguo"} icon={<ArrowUpDown className="h-3.5 w-3.5" />}>
              {(close) => (
                <>
                  <MenuItem
                    selected={sort === "newest"}
                    onClick={() => {
                      setSort("newest");
                      close();
                    }}
                    title={
                      <>
                        Ordenar: más reciente <span className="text-muted-foreground">(predeterminado)</span>
                      </>
                    }
                  />
                  <MenuItem
                    selected={sort === "oldest"}
                    onClick={() => {
                      setSort("oldest");
                      close();
                    }}
                    title="Ordenar: Más antiguo"
                  />
                </>
              )}
            </Dropdown>
            <Dropdown label={channel === "all" ? "Todos Los Canales" : channel[0].toUpperCase() + channel.slice(1)}>
              {(close) => (
                <>
                  <MenuItem
                    selected={channel === "all"}
                    onClick={() => {
                      setChannel("all");
                      close();
                    }}
                    title={
                      <>
                        Todos los canales <span className="text-muted-foreground">(predeterminado)</span>
                      </>
                    }
                  />
                  {platforms.map((p) => (
                    <MenuItem
                      key={p}
                      selected={channel === p}
                      onClick={() => {
                        setChannel(p);
                        close();
                      }}
                      title={p[0].toUpperCase() + p.slice(1)}
                    />
                  ))}
                </>
              )}
            </Dropdown>
            <Dropdown label={conditions.length ? `Filtro (${conditions.length})` : "Filtro"} icon={<Plus className="h-3.5 w-3.5" />} active={conditions.length > 0}>
              {(close) => (
                <div className="w-72 space-y-2 p-2">
                  {conditions.map((c, i) => (
                    <div key={i} className="flex items-center justify-between rounded-md bg-muted px-2 py-1.5 text-xs">
                      <span>
                        Etiqueta {c.op === "is" ? "es" : "no es"} <b>{tags.find((t) => t.id === c.tagId)?.name ?? "?"}</b>
                      </span>
                      <button onClick={() => setConditions((cs) => cs.filter((_, j) => j !== i))}>
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                  {draftCond ? (
                    <div className="space-y-2 rounded-md border border-border p-2 text-xs">
                      <p className="font-medium">Etiqueta</p>
                      <select
                        value={draftCond.op}
                        onChange={(e) => setDraftCond({ ...draftCond, op: e.target.value as "is" | "is_not" })}
                        className="w-full rounded border border-border bg-card px-2 py-1"
                      >
                        <option value="is">es</option>
                        <option value="is_not">no es</option>
                      </select>
                      <select
                        value={draftCond.tagId}
                        onChange={(e) => setDraftCond({ ...draftCond, tagId: e.target.value })}
                        className="w-full rounded border border-border bg-card px-2 py-1"
                      >
                        <option value="">Elegí una etiqueta</option>
                        {tags.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : (
                    <button
                      onClick={() => setDraftCond({ kind: "tag", op: "is", tagId: "" })}
                      className="w-full rounded-md border border-dashed border-border py-2 text-xs text-muted-foreground hover:bg-muted"
                    >
                      + Condición
                    </button>
                  )}
                  <div className="flex justify-between pt-1">
                    <button
                      onClick={() => {
                        setConditions([]);
                        setDraftCond(null);
                        close();
                      }}
                      className="rounded-md border border-border px-3 py-1 text-xs hover:bg-muted"
                    >
                      Quitar
                    </button>
                    <button
                      disabled={!draftCond?.tagId}
                      onClick={() => {
                        if (draftCond?.tagId) setConditions((cs) => [...cs, draftCond]);
                        setDraftCond(null);
                        close();
                      }}
                      className="rounded-md bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                    >
                      Aplicar
                    </button>
                  </div>
                </div>
              )}
            </Dropdown>
          </div>

          <div className="flex min-h-0 flex-1">
            <div className="w-72 shrink-0 border-r border-border">
              <ConversationList
                conversations={conversations}
                workspaceId={workspaceId}
                selectedId={selected?.id ?? null}
                onSelect={handleSelect}
                filters={{ search, status, unreadOnly, sort, channel, tagFolder, conditions }}
              />
            </div>

            <div className="flex min-h-0 min-w-0 flex-1 flex-col">
              {conversations.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center px-6 text-center">
                  <MessageSquare className="h-10 w-10 text-muted-foreground/40" />
                  <p className="mt-3 text-sm font-medium">Aquí podrás chatear con tus contactos en todos los canales conectados</p>
                  <p className="mt-1 max-w-xs text-xs text-muted-foreground">Cada vez que alguien te envíe un mensaje, aparecerá aquí.</p>
                  <button
                    onClick={handleSyncConversations}
                    disabled={syncing}
                    className="mt-4 inline-flex items-center gap-2 rounded-lg border border-border bg-background px-4 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50"
                  >
                    <RefreshCw className={cn("h-4 w-4", syncing && "animate-spin")} />
                    {syncing ? "Sincronizando…" : "Sincronizar conversaciones"}
                  </button>
                  {syncError && <p className="mt-2 text-xs text-destructive">{syncError}</p>}
                </div>
              ) : loadingMessages && selected ? (
                <div className="flex h-full items-center justify-center">
                  <div className="h-6 w-6 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
                </div>
              ) : (
                <MessageThread
                  conversation={selected}
                  messages={messages}
                  tags={tags}
                  userId={userId}
                  contactPanelOpen={showContactPanel}
                  onToggleContact={() => setShowContactPanel((s) => !s)}
                />
              )}
            </div>

            {showContactPanel && selected?.contact_id && (
              <ContactPanel
                contactId={selected.contact_id}
                conversation={selected}
                tags={tags}
                sequences={sequences}
                onClose={() => setShowContactPanel(false)}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
