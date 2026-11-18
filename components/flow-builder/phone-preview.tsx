"use client";

import { useState } from "react";
import type { Edge, Node } from "@xyflow/react";
import { ChevronLeft, Heart, MessageCircle, Send, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface Msg {
  text?: string;
  imageUrl?: string;
  mediaUrl?: string;
  mediaType?: string;
  buttons?: Array<{ title: string; type: string }>;
  quickReplies?: Array<{ title: string }>;
  carousel?: { elements: Array<{ title: string; subtitle?: string; imageUrl?: string; buttons?: Array<{ title: string }> }> };
}

const SAMPLE = { nombre: "Ana", nombre_completo: "Ana García", usuario: "ana.garcia", email: "ana@correo.com" };

function fill(text: string) {
  return text.replace(/\{\{(\w+)\}\}/g, (t, k: string) => (SAMPLE as Record<string, string>)[k] ?? t);
}

/**
 * ManyChat-style phone preview beside the step being edited: an Instagram DM
 * for message steps, and post → comment → DM for the comment trigger.
 */
export function PhonePreview({
  node,
  nodes,
  edges,
  username,
  onClose,
}: {
  node: Node;
  nodes: Node[];
  edges: Edge[];
  username?: string;
  onClose: () => void;
}) {
  const data = node.data as Record<string, unknown>;
  const isComment = node.type === "trigger" && data.triggerType === "comment_keyword";
  const [tab, setTab] = useState<"post" | "comments" | "dm">("dm");

  // Message shown in the DM tab: the step itself, or the first step after the trigger.
  const messageNode =
    node.type === "sendMessage"
      ? node
      : nodes.find((n) => n.id === edges.find((e) => e.source === node.id && !e.sourceHandle)?.target && n.type === "sendMessage");
  const messages = ((messageNode?.data as { messages?: Msg[] } | undefined)?.messages ?? []) as Msg[];

  const replies = typeof data.replyText === "string" ? data.replyText.split("||").filter((r) => r.trim()) : [];
  const keyword =
    data.anyComment === true
      ? "¡Me interesa!"
      : ((data.keywords as Array<{ value: string }> | undefined)?.[0]?.value ?? "Comentario");
  const picture = (data.selectedPosts as Array<{ picture: string | null }> | undefined)?.[0]?.picture ?? null;
  const handle = username ?? "tu_cuenta";
  const activeTab = isComment ? tab : "dm";

  return (
    <div className="pointer-events-auto absolute right-4 top-4 z-10 w-[260px] select-none">
      <div className="mb-1 flex items-center justify-between px-1">
        <span className="text-xs font-medium text-muted-foreground">Vista previa</span>
        <button onClick={onClose} className="rounded p-0.5 text-muted-foreground hover:bg-muted" aria-label="Cerrar vista previa">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="overflow-hidden rounded-[2rem] border-[6px] border-neutral-900 bg-neutral-950 text-white shadow-xl">
        <div className="flex items-center justify-between px-5 pt-2 text-[10px] text-neutral-400">
          <span>9:41</span>
          <span className="h-3 w-14 rounded-full bg-neutral-900" />
          <span>●●●</span>
        </div>

        <div className="flex items-center gap-2 border-b border-neutral-800 px-3 py-2">
          <ChevronLeft className="h-4 w-4 text-neutral-400" />
          <span className="h-6 w-6 rounded-full bg-gradient-to-br from-fuchsia-500 to-orange-400" />
          <span className="text-xs font-semibold">{activeTab === "dm" ? handle : "Publicaciones"}</span>
        </div>

        <div className="h-[380px] overflow-y-auto px-3 py-3">
          {activeTab === "post" && (
            <div>
              <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold">
                <span className="h-5 w-5 rounded-full bg-gradient-to-br from-fuchsia-500 to-orange-400" /> {handle}
              </div>
              {picture ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={picture} alt="" className="aspect-[4/5] w-full rounded-md object-cover" />
              ) : (
                <div className="flex aspect-[4/5] w-full items-center justify-center rounded-md bg-neutral-800 p-4 text-center text-[11px] text-neutral-400">
                  {data.postScope === "any"
                    ? "Todas tus publicaciones y Reels"
                    : data.postScope === "next"
                      ? "Tu siguiente publicación o Reel"
                      : "Aún no has elegido una publicación"}
                </div>
              )}
              <div className="mt-2 flex gap-3 text-neutral-300">
                <Heart className="h-4 w-4" />
                <MessageCircle className="h-4 w-4" />
                <Send className="h-4 w-4" />
              </div>
            </div>
          )}

          {activeTab === "comments" && (
            <div className="space-y-3 text-[11px]">
              <div className="flex gap-2">
                <span className="h-6 w-6 shrink-0 rounded-full bg-neutral-700" />
                <div>
                  <span className="font-semibold">{SAMPLE.usuario}</span> <span className="text-neutral-300">{keyword}</span>
                  <p className="text-[10px] text-neutral-500">Ahora · Responder</p>
                </div>
              </div>
              {replies.length > 0 && data.replyEnabled !== false && (
                <div className="ml-8 flex gap-2">
                  <span className="h-5 w-5 shrink-0 rounded-full bg-gradient-to-br from-fuchsia-500 to-orange-400" />
                  <div>
                    <span className="font-semibold">{handle}</span> <span className="text-neutral-300">{fill(replies[0])}</span>
                    <p className="text-[10px] text-neutral-500">
                      Ahora{replies.length > 1 ? ` · 1 de ${replies.length} respuestas al azar` : ""}
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === "dm" && (
            <div className="space-y-2">
              {messages.length === 0 && (
                <p className="pt-10 text-center text-[11px] text-neutral-500">Añade un mensaje para verlo aquí</p>
              )}
              {messages.map((m, i) => (
                <div key={i} className="flex flex-col items-start gap-1">
                  {(m.mediaUrl || m.imageUrl) && (
                    <div className="flex h-28 w-40 items-center justify-center rounded-2xl bg-neutral-800 text-[10px] text-neutral-400">
                      {m.mediaType === "video" ? "Video" : m.mediaType === "audio" ? "Audio" : "Imagen"}
                    </div>
                  )}
                  {m.carousel && (
                    <div className="flex w-full gap-2 overflow-x-auto">
                      {m.carousel.elements.map((el, j) => (
                        <div key={j} className="w-36 shrink-0 overflow-hidden rounded-2xl bg-neutral-800">
                          <div className="h-16 bg-neutral-700" />
                          <div className="p-2 text-[10px]">
                            <p className="font-semibold">{el.title || "Tarjeta"}</p>
                            {el.subtitle && <p className="text-neutral-400">{el.subtitle}</p>}
                          </div>
                          {(el.buttons ?? []).map((b, k) => (
                            <div key={k} className="border-t border-neutral-700 py-1.5 text-center text-[10px] font-semibold">
                              {b.title}
                            </div>
                          ))}
                        </div>
                      ))}
                    </div>
                  )}
                  {(m.text || (m.buttons?.length ?? 0) > 0) && (
                    <div className="max-w-[85%] overflow-hidden rounded-2xl bg-neutral-800">
                      {m.text && <p className="whitespace-pre-wrap px-3 py-2 text-[11px]">{fill(m.text)}</p>}
                      {(m.buttons ?? []).map((b, k) => (
                        <div key={k} className="border-t border-neutral-700 py-2 text-center text-[11px] font-semibold">
                          {b.title || "Botón"}
                        </div>
                      ))}
                    </div>
                  )}
                  {(m.quickReplies?.length ?? 0) > 0 && (
                    <div className="flex flex-wrap justify-end gap-1 self-end">
                      {m.quickReplies!.map((q, k) => (
                        <span key={k} className="rounded-full border border-neutral-600 px-2.5 py-1 text-[10px]">
                          {q.title || "Respuesta"}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {isComment && (
          <div className="grid grid-cols-3 border-t border-neutral-800 text-[10px]">
            {(
              [
                ["post", "Publicación"],
                ["comments", "Comentarios"],
                ["dm", "DM"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                onClick={() => setTab(id)}
                className={cn("py-2", tab === id ? "font-semibold text-white" : "text-neutral-500")}
              >
                {label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
