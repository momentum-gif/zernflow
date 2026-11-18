"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Zap, Search, Star, Folder, Loader2, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

interface FlowItem {
  id: string;
  name: string;
  folder_id: string | null;
}

const FAV_KEY = "zf_inbox_favorite_flows";

function readFavorites(): string[] {
  try {
    return JSON.parse(localStorage.getItem(FAV_KEY) || "[]");
  } catch {
    return [];
  }
}

function saveFavorites(ids: string[]) {
  try {
    localStorage.setItem(FAV_KEY, JSON.stringify(ids));
  } catch {
    /* storage unavailable */
  }
}

/**
 * ManyChat Live Chat "Automatizaciones": send a published automation to this
 * contact with one click. Starred ones stay as quick buttons above the composer
 * (the "botonera" setters use so they only press buttons).
 */
export function SendFlowBar({ conversationId, workspaceId }: { conversationId: string; workspaceId?: string }) {
  const [open, setOpen] = useState(false);
  const [flows, setFlows] = useState<FlowItem[]>([]);
  const [folders, setFolders] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [favorites, setFavorites] = useState<string[]>([]);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => setFavorites(readFavorites()), []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const supabase = createClient();
      let q = supabase.from("flows").select("id, name, folder_id").eq("status", "published").order("name");
      if (workspaceId) q = q.eq("workspace_id", workspaceId);
      const [{ data: f }, { data: dirs }] = await Promise.all([
        q,
        supabase.from("automation_folders").select("id, name"),
      ]);
      if (cancelled) return;
      setFlows((f as FlowItem[]) ?? []);
      setFolders(Object.fromEntries(((dirs as Array<{ id: string; name: string }>) ?? []).map((d) => [d.id, d.name])));
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [workspaceId]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 4000);
    return () => clearTimeout(t);
  }, [notice]);

  function toggleFavorite(id: string) {
    const next = favorites.includes(id) ? favorites.filter((f) => f !== id) : [...favorites, id];
    setFavorites(next);
    saveFavorites(next);
  }

  async function send(flow: FlowItem) {
    if (sendingId) return;
    setSendingId(flow.id);
    try {
      const res = await fetch(`/api/v1/conversations/${conversationId}/send-flow`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ flowId: flow.id }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "No se pudo enviar");
      setNotice({ ok: true, text: `Enviada: ${flow.name}` });
      setOpen(false);
    } catch (err) {
      setNotice({ ok: false, text: err instanceof Error ? err.message : "No se pudo enviar" });
    } finally {
      setSendingId(null);
    }
  }

  const grouped = useMemo(() => {
    const term = query.trim().toLowerCase();
    const list = flows.filter((f) => !term || f.name.toLowerCase().includes(term));
    const groups = new Map<string, FlowItem[]>();
    for (const f of list) {
      const key = f.folder_id && folders[f.folder_id] ? folders[f.folder_id] : "";
      groups.set(key, [...(groups.get(key) ?? []), f]);
    }
    return [...groups.entries()].sort(([a], [b]) => (a === "" ? -1 : b === "" ? 1 : a.localeCompare(b)));
  }, [flows, folders, query]);

  const favFlows = favorites.map((id) => flows.find((f) => f.id === id)).filter(Boolean) as FlowItem[];

  return (
    <div ref={boxRef} className="relative mx-auto mb-2 max-w-2xl">
      <div className="flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className={cn(
            "flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
            open ? "border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-950/40" : "border-border hover:bg-muted"
          )}
        >
          <Zap className="h-3.5 w-3.5 text-amber-500" />
          Automatizaciones
        </button>
        {favFlows.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => send(f)}
            disabled={!!sendingId}
            title={`Enviar "${f.name}"`}
            className="flex max-w-[180px] items-center gap-1 rounded-full bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-60"
          >
            {sendingId === f.id ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
            <span className="truncate">{f.name}</span>
          </button>
        ))}
        {notice && (
          <span className={cn("text-xs", notice.ok ? "text-emerald-600" : "text-red-600")}>{notice.text}</span>
        )}
      </div>

      {open && (
        <div className="absolute bottom-full left-0 z-30 mb-2 w-80 overflow-hidden rounded-xl border border-border bg-card shadow-xl">
          <div className="flex items-center justify-between border-b border-border px-3 py-2">
            <p className="text-sm font-semibold">Enviar automatización</p>
            <button type="button" onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="border-b border-border p-2">
            <div className="flex items-center gap-2 rounded-lg border border-border px-2 py-1.5">
              <Search className="h-3.5 w-3.5 text-muted-foreground" />
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar automatización"
                className="w-full bg-transparent text-sm focus:outline-none"
              />
            </div>
          </div>
          <div className="max-h-72 overflow-y-auto py-1">
            {loading && <p className="px-3 py-4 text-center text-xs text-muted-foreground">Cargando…</p>}
            {!loading && grouped.length === 0 && (
              <p className="px-3 py-4 text-center text-xs text-muted-foreground">
                No hay automatizaciones publicadas{query ? " con ese nombre" : ""}.
              </p>
            )}
            {grouped.map(([folder, items]) => (
              <div key={folder || "_"}>
                {folder && (
                  <p className="flex items-center gap-1.5 px-3 pb-1 pt-2 text-[11px] font-semibold uppercase text-muted-foreground">
                    <Folder className="h-3 w-3" />
                    {folder}
                  </p>
                )}
                {items.map((f) => (
                  <div key={f.id} className="group flex items-center gap-1 px-1.5">
                    <button
                      type="button"
                      onClick={() => send(f)}
                      disabled={!!sendingId}
                      className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted disabled:opacity-60"
                    >
                      {sendingId === f.id ? (
                        <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
                      ) : (
                        <Zap className="h-3.5 w-3.5 shrink-0 text-amber-500" />
                      )}
                      <span className="truncate">{f.name}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => toggleFavorite(f.id)}
                      title={favorites.includes(f.id) ? "Quitar de botones rápidos" : "Agregar a botones rápidos"}
                      className="rounded p-1 text-muted-foreground hover:text-amber-500"
                    >
                      <Star className={cn("h-3.5 w-3.5", favorites.includes(f.id) && "fill-amber-400 text-amber-500")} />
                    </button>
                  </div>
                ))}
              </div>
            ))}
          </div>
          <p className="border-t border-border px-3 py-2 text-[11px] text-muted-foreground">
            Toca la ⭐ para dejarla como botón rápido encima del chat.
          </p>
        </div>
      )}
    </div>
  );
}
