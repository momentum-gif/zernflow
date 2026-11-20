"use client";

import { useState, useEffect } from "react";
import { MessageSquare } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { PlatformIcon } from "@/components/platform-icon";
import type { Database } from "@/lib/types/database";

export type InboxConversation = Database["public"]["Tables"]["conversations"]["Row"] & {
  contacts: (Database["public"]["Tables"]["contacts"]["Row"] & { contact_tags?: Array<{ tag_id: string }> }) | null;
};

export interface InboxFilters {
  search: string;
  status: "open" | "closed" | "all";
  unreadOnly: boolean;
  sort: "newest" | "oldest";
  channel: string;
  tagFolder: string | null;
  conditions: Array<{ kind: "tag"; op: "is" | "is_not"; tagId: string }>;
}

/** ManyChat-style short time: "5m", "8h", "1d", "3sem". */
function shortAgo(dateStr: string | null): string {
  if (!dateStr) return "";
  const mins = Math.floor((Date.now() - new Date(dateStr).getTime()) / 60000);
  if (mins < 1) return "ahora";
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d`;
  if (d < 30) return `${Math.floor(d / 7)}sem`;
  return new Date(dateStr).toLocaleDateString("es", { day: "numeric", month: "short" });
}

export function ConversationList({
  conversations: initialConversations,
  workspaceId,
  selectedId,
  onSelect,
  filters,
}: {
  conversations: InboxConversation[];
  workspaceId: string;
  selectedId: string | null;
  onSelect: (conversation: InboxConversation) => void;
  filters: InboxFilters;
}) {
  const [conversations, setConversations] = useState(initialConversations);
  // Relative times depend on the client clock; render them after mount to avoid
  // a hydration mismatch.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  useEffect(() => setConversations(initialConversations), [initialConversations]);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel("conversations-updates")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "conversations", filter: `workspace_id=eq.${workspaceId}` },
        async (payload) => {
          if (payload.eventType === "UPDATE") {
            const updated = payload.new as Database["public"]["Tables"]["conversations"]["Row"];
            setConversations((prev) => prev.map((c) => (c.id === updated.id ? { ...c, ...updated } : c)));
          } else if (payload.eventType === "INSERT") {
            const inserted = payload.new as Database["public"]["Tables"]["conversations"]["Row"];
            const { data } = await supabase
              .from("conversations")
              .select("*, contacts(*, contact_tags(tag_id))")
              .eq("id", inserted.id)
              .single();
            if (data) setConversations((prev) => [data as unknown as InboxConversation, ...prev]);
          }
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [workspaceId]);

  const { search, status, unreadOnly, sort, channel, tagFolder, conditions } = filters;
  const q = search.trim().toLowerCase();
  const filtered = conversations
    .filter((c) => {
      // "Chats cerrados" also covers snoozed ones: anything not waiting on a person.
      if (status === "open" && c.status !== "open") return false;
      if (status === "closed" && c.status === "open") return false;
      if (unreadOnly && !(c.unread_count > 0)) return false;
      if (channel !== "all" && c.platform !== channel) return false;
      const tagIds = new Set((c.contacts?.contact_tags ?? []).map((t) => t.tag_id));
      if (tagFolder && !tagIds.has(tagFolder)) return false;
      for (const cond of conditions) {
        if (cond.op === "is" && !tagIds.has(cond.tagId)) return false;
        if (cond.op === "is_not" && tagIds.has(cond.tagId)) return false;
      }
      if (q) {
        const name = c.contacts?.display_name?.toLowerCase() ?? "";
        const preview = c.last_message_preview?.toLowerCase() ?? "";
        if (!name.includes(q) && !preview.includes(q)) return false;
      }
      return true;
    })
    .sort((a, b) => {
      const at = new Date(a.last_message_at ?? a.created_at).getTime();
      const bt = new Date(b.last_message_at ?? b.created_at).getTime();
      return sort === "newest" ? bt - at : at - bt;
    });

  return (
    <div className="flex h-full flex-col bg-background">
      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
            <MessageSquare className="h-8 w-8 text-muted-foreground/50" />
            <p className="mt-2 text-sm text-muted-foreground">No hay conversaciones</p>
          </div>
        ) : (
          filtered.map((conversation) => {
            const unread = conversation.unread_count > 0;
            return (
              <button
                key={conversation.id}
                onClick={() => onSelect(conversation)}
                className={cn(
                  "flex w-full items-start gap-3 border-b border-border p-3 text-left transition-colors hover:bg-accent/50",
                  selectedId === conversation.id && "bg-accent"
                )}
              >
                <div className="relative flex-shrink-0">
                  {conversation.contacts?.avatar_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={conversation.contacts.avatar_url} alt="" className="h-10 w-10 rounded-full object-cover" />
                  ) : (
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted text-sm font-medium">
                      {conversation.contacts?.display_name?.[0]?.toUpperCase() ?? "?"}
                    </div>
                  )}
                  <div className="absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full border-2 border-background bg-background">
                    <PlatformIcon platform={conversation.platform} className="h-3 w-3" size={12} />
                  </div>
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className={cn("truncate text-sm", unread ? "font-semibold" : "font-medium")}>
                      {conversation.contacts?.display_name ?? "Desconocido"}
                    </p>
                    <span
                      suppressHydrationWarning
                      className={cn("flex flex-shrink-0 items-center gap-1 text-[11px]", unread ? "text-blue-600" : "text-muted-foreground")}
                    >
                      {unread && <span className="h-1.5 w-1.5 rounded-full bg-blue-600" />}
                      {mounted ? shortAgo(conversation.last_message_at) : ""}
                    </span>
                  </div>
                  <p className={cn("mt-0.5 truncate text-xs", unread ? "text-foreground" : "text-muted-foreground")}>
                    {conversation.last_message_preview ?? ""}
                  </p>
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
