"use client";

import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Instagram, Search, UserRound, MousePointerClick, X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * "Inicia automatización cuando..." — the trigger picker, laid out like
 * ManyChat's: categories on the left, trigger cards on the right.
 */

export interface TriggerOption {
  value: string;
  category: string;
  title: string;
  /** Badge shown instead of making the card selectable. */
  unavailable?: "NO DISPONIBLE" | "PRÓXIMAMENTE";
}

type Tab = "instagram" | "contact" | "other";

export const TRIGGER_OPTIONS: Record<Tab, TriggerOption[]> = {
  instagram: [
    { value: "comment_keyword", category: "Comentarios de publicaciones o reels", title: "El usuario comenta tu publicación o Reel" },
    { value: "story_reply", category: "Respuesta a las historias", title: "El usuario responde a tu historia" },
    { value: "keyword", category: "Mensaje de Instagram", title: "El usuario envía un mensaje" },
    { value: "share_post", category: "Compartir publicación o reel", title: "El usuario comparte tu Publicación o Reel como una Historia", unavailable: "NO DISPONIBLE" },
    { value: "ig_ads", category: "Anuncios de Instagram", title: "El usuario hace clic en un anuncio de Instagram", unavailable: "NO DISPONIBLE" },
    { value: "live_comment", category: "Comentarios en vivo", title: "El usuario comenta en tu En vivo", unavailable: "PRÓXIMAMENTE" },
    { value: "ref_url", category: "URL de referencia de Instagram", title: "El usuario hace clic en un enlace de referencia" },
  ],
  contact: [
    { value: "contact_created", category: "Evento de contactos", title: "Nuevo contacto creado" },
    { value: "custom_field_changed", category: "Evento de contactos", title: "El valor de campo personalizado está cambiado" },
    { value: "system_field_changed", category: "Evento de contactos", title: "El valor de campo del sistema está cambiado" },
    { value: "tag_added", category: "Evento de contactos", title: "Se aplica la etiqueta a un contacto" },
    { value: "tag_removed", category: "Evento de contactos", title: "Se elimina la etiqueta de un contacto" },
    { value: "sequence_subscribed", category: "Evento de contactos", title: "Contacto suscrito a una secuencia" },
    { value: "sequence_unsubscribed", category: "Evento de contactos", title: "Contacto no suscrito a una secuencia" },
    { value: "date_time", category: "Evento de contactos", title: "Fecha/Hora en que ocurrió" },
  ],
  other: [
    { value: "postback", category: "Botón", title: "El usuario toca un botón" },
    { value: "quick_reply", category: "Respuesta rápida", title: "El usuario toca una respuesta rápida" },
    { value: "welcome", category: "Bienvenida", title: "El usuario escribe por primera vez" },
    { value: "default", category: "Respuesta predeterminada", title: "Ningún otro disparador coincide" },
    { value: "story_mention", category: "Mención en una historia", title: "El usuario te menciona en su historia" },
  ],
};

const TABS: Array<{ id: Tab; label: string; heading: string; description: string; icon: typeof Instagram }> = [
  { id: "instagram", label: "Instagram", heading: "Disparadores", description: "Evento específico de Instagram que inicia tu automatización.", icon: Instagram },
  { id: "contact", label: "Eventos de contactos", heading: "Eventos de contactos", description: "El evento de contactos es un evento del lado de ZernFlow que inicia tu automatización.", icon: UserRound },
  { id: "other", label: "Botones y otros", heading: "Botones y otros", description: "Continúa una conversación o responde cuando nada más coincide.", icon: MousePointerClick },
];

export function findTriggerOption(value: string): TriggerOption | undefined {
  for (const list of Object.values(TRIGGER_OPTIONS)) {
    const found = list.find((o) => o.value === value);
    if (found) return found;
  }
  return undefined;
}

export function TriggerPickerModal({
  open,
  onClose,
  onSelect,
}: {
  open: boolean;
  onClose: () => void;
  onSelect: (value: string) => void;
}) {
  const [tab, setTab] = useState<Tab>("instagram");
  const [query, setQuery] = useState("");
  const current = TABS.find((t) => t.id === tab)!;

  const options = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = TRIGGER_OPTIONS[tab];
    if (!q) return list;
    return list.filter((o) => `${o.category} ${o.title}`.toLowerCase().includes(q));
  }, [tab, query]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="flex max-h-[80vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-card shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-4 border-b border-border px-6 py-4">
          <h2 className="text-xl font-bold text-foreground">Inicia automatización cuando...</h2>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={`Buscar en ${current.label}`}
                className="w-56 rounded-lg border border-border bg-card py-1.5 pl-8 pr-3 text-sm focus:border-emerald-500 focus:outline-none"
              />
            </div>
            <button onClick={onClose} className="rounded-md p-1.5 text-muted-foreground hover:bg-muted" aria-label="Cerrar">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="flex min-h-0 flex-1">
          <nav className="w-52 shrink-0 space-y-1 border-r border-border p-3">
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={cn(
                  "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm",
                  tab === t.id ? "bg-muted font-medium text-foreground" : "text-muted-foreground hover:bg-muted/60",
                )}
              >
                <t.icon className="h-4 w-4 shrink-0" />
                <span className="truncate">{t.label}</span>
              </button>
            ))}
          </nav>

          <div className="min-h-0 flex-1 overflow-y-auto p-5">
            <p className="text-sm font-semibold text-foreground">{current.heading}</p>
            <p className="mb-3 text-xs text-muted-foreground">{current.description}</p>
            <div className="space-y-2">
              {options.map((o) => (
                <button
                  key={o.value}
                  disabled={!!o.unavailable}
                  onClick={() => {
                    onSelect(o.value);
                    onClose();
                  }}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-xl border border-border p-3 text-left transition-colors",
                    o.unavailable ? "cursor-not-allowed opacity-60" : "hover:border-emerald-500",
                  )}
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-fuchsia-500 to-orange-400 text-white">
                    <current.icon className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2 text-xs text-muted-foreground">
                      {o.category}
                      {o.unavailable && (
                        <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
                          {o.unavailable}
                        </span>
                      )}
                    </span>
                    <span className="block text-sm font-medium text-foreground">{o.title}</span>
                  </span>
                </button>
              ))}
              {options.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">Sin resultados</p>}
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
