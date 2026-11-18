"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Search, X, Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

interface FlowRow {
  id: string;
  name: string;
  status: string;
  updated_at: string;
  nodes: unknown;
}

const TRIGGER_TEXT: Record<string, string> = {
  comment_keyword: "El usuario comenta tu publicación o Reel",
  keyword: "El usuario envía un mensaje",
  story_reply: "El usuario responde a tu historia",
  story_mention: "El usuario te menciona en una historia",
  ref_url: "El usuario hace clic en un enlace de referencia",
  welcome: "El usuario inicia una conversación",
  contact_event: "Evento de contacto",
  date_time: "Fecha / Hora",
};

function ago(iso: string) {
  const s = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return `hace ${s} segundos`;
  const m = Math.round(s / 60);
  if (m < 60) return `hace ${m} minutos`;
  const h = Math.round(m / 60);
  if (h < 24) return `hace ${h} horas`;
  return `hace ${Math.round(h / 24)} días`;
}

function triggersOf(nodes: unknown): string[] {
  const list = Array.isArray(nodes) ? (nodes as Array<{ type?: string; data?: Record<string, unknown> }>) : [];
  const out: string[] = [];
  for (const n of list) {
    if (n.type !== "trigger") continue;
    const items = (n.data?.triggers as Array<{ triggerType?: string; kind?: string }> | undefined) ?? [n.data ?? {}];
    for (const t of items) {
      const key = (t as { kind?: string }).kind || (t as { triggerType?: string }).triggerType || "";
      if (key) out.push(TRIGGER_TEXT[key] ?? key);
    }
  }
  return out;
}

/** ManyChat "Escoger automatización". Only published automations can be chosen. */
export function FlowPickerModal({
  open,
  onClose,
  onPick,
  excludeId,
}: {
  open: boolean;
  onClose: () => void;
  onPick: (flow: { id: string; name: string }) => void;
  excludeId?: string;
}) {
  const [rows, setRows] = useState<FlowRow[]>([]);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<"all" | "published" | "draft">("all");
  const [hover, setHover] = useState<FlowRow | null>(null);

  useEffect(() => {
    if (!open) return;
    createClient()
      .from("flows")
      .select("id, name, status, updated_at, nodes")
      .neq("status", "archived")
      .order("updated_at", { ascending: false })
      .then(({ data }) => setRows(((data as FlowRow[]) ?? []).filter((f) => f.id !== excludeId)));
  }, [open, excludeId]);

  const list = useMemo(
    () =>
      rows.filter(
        (r) =>
          (!q || r.name.toLowerCase().includes(q.toLowerCase())) &&
          (status === "all" || (status === "published" ? r.status === "published" : r.status !== "published"))
      ),
    [rows, q, status]
  );

  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6" onClick={onClose}>
      <div className="flex h-[80vh] w-full max-w-4xl overflow-hidden rounded-xl bg-card shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex min-w-0 flex-[3] flex-col p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="text-xl font-semibold">Escoger automatización</h2>
            <a
              href="/dashboard/flows"
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted"
            >
              <Plus className="h-4 w-4" /> Nueva Automatización
            </a>
          </div>
          <div className="mb-3 flex items-center gap-2 rounded-md border border-blue-500 px-3 py-2">
            <Search className="h-4 w-4 text-muted-foreground" />
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar todas las Automatizaciones"
              className="w-full bg-transparent text-sm focus:outline-none"
            />
          </div>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as typeof status)}
            className="mb-3 w-1/2 rounded-md border border-border bg-card px-3 py-2 text-sm"
          >
            <option value="all">Cualquier estado</option>
            <option value="published">Publicadas</option>
            <option value="draft">Borradores</option>
          </select>
          <div className="mb-2 flex justify-between px-2 text-xs text-muted-foreground">
            <span>Nombre</span>
            <span>Modificado</span>
          </div>
          <div className="flex-1 space-y-2 overflow-y-auto">
            {list.map((f) => {
              const live = f.status === "published";
              const trig = triggersOf(f.nodes);
              return (
                <button
                  key={f.id}
                  type="button"
                  disabled={!live}
                  onMouseEnter={() => setHover(f)}
                  onClick={() => live && onPick({ id: f.id, name: f.name })}
                  className={cn(
                    "w-full rounded-lg border border-border p-3 text-left",
                    live ? "hover:border-blue-500" : "cursor-not-allowed opacity-50"
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex min-w-0 items-center gap-2">
                      <span
                        className={cn(
                          "rounded px-1.5 py-0.5 text-[10px] font-semibold",
                          live ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50" : "bg-muted text-muted-foreground"
                        )}
                      >
                        {live ? "LIVE" : "DRAFT"}
                      </span>
                      <span className="truncate font-medium">{f.name}</span>
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground">{ago(f.updated_at)}</span>
                  </div>
                  {trig.length > 0 && <p className="mt-1.5 truncate text-xs text-muted-foreground">{trig.join(" · ")}</p>}
                </button>
              );
            })}
            {list.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">No hay automatizaciones.</p>}
          </div>
        </div>
        <div className="relative flex flex-[2] flex-col items-center justify-center border-l border-border bg-muted/30 p-6 text-center">
          <button type="button" onClick={onClose} className="absolute right-3 top-3 text-muted-foreground hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
          {hover && hover.status === "published" ? (
            <>
              <p className="font-semibold">{hover.name}</p>
              <p className="mt-2 text-sm text-muted-foreground">
                {triggersOf(hover.nodes).join(" · ") || "Sin disparador"} ·{" "}
                {Array.isArray(hover.nodes) ? (hover.nodes as unknown[]).length : 0} pasos
              </p>
            </>
          ) : (
            <>
              <p className="font-semibold">Automatización de vista previa</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Selecciona cualquier automatización con una versión publicada para ver una vista previa
              </p>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
