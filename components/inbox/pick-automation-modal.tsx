"use client";

import { useEffect, useMemo, useState } from "react";
import { Search, ChevronDown, LayoutGrid, List, X, Loader2, ArrowUpDown } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

/* ManyChat's Live Chat "Escoger automatización": pick an automation and send it
 * to this contact. Published ones (ACTIVO and DETENIDA) can be chosen; drafts
 * are shown greyed out. */

interface PickFlow {
  id: string;
  name: string;
  status: "active" | "stopped" | "draft";
  updatedAt: string;
  runs: number | null;
  ctr: number | null;
  triggers: Array<{ type: string; active: boolean }>;
}

const TRIGGER_LABEL: Record<string, string> = {
  keyword: "El usuario envía un mensaje directo",
  comment_keyword: "El usuario comenta en tu Publicación o Reel",
  story_reply: "El usuario responde a tu Historia",
  story_mention: "El usuario te menciona en una Historia",
  ref_url: "El usuario hace clic en un enlace de referencia",
  welcome: "El usuario te escribe por primera vez",
  default: "Respuesta predeterminada",
  contact_created: "Nuevo contacto creado",
  tag_added: "Se aplica una etiqueta",
  tag_removed: "Se elimina una etiqueta",
  custom_field_changed: "Cambia un campo personalizado",
  system_field_changed: "Cambia el correo del contacto",
  date_time: "Fecha/Hora de un campo",
  sequence_subscribed: "Entra a una secuencia",
  sequence_unsubscribed: "Sale de una secuencia",
};

const STATUS_CHIP: Record<PickFlow["status"], { label: string; dot: string } | null> = {
  active: { label: "ACTIVO", dot: "bg-emerald-500" },
  stopped: { label: "DETENIDA", dot: "bg-amber-400" },
  draft: { label: "BORRADOR", dot: "" },
};

function ago(iso: string) {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 60) return mins <= 1 ? "hace un momento" : `hace ${mins} minutos`;
  const h = Math.floor(mins / 60);
  if (h < 24) return h === 1 ? "hace 1 hora" : `hace ${h} horas`;
  const d = Math.floor(h / 24);
  if (d < 30) return d === 1 ? "hace 1 día" : `hace ${d} días`;
  const m = Math.floor(d / 30);
  return m === 1 ? "hace 1 mes" : `hace ${m} meses`;
}

function Select({ value, options, onChange }: { value: string; options: Array<[string, string]>; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative flex-1">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between rounded-md border border-border bg-background px-3 py-2 text-sm"
      >
        <span className="truncate">{options.find(([v]) => v === value)?.[1]}</span>
        <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute left-0 right-0 top-11 z-20 max-h-64 overflow-y-auto rounded-lg border border-border bg-card p-1 shadow-lg">
            {options.map(([v, label]) => (
              <button
                key={v}
                type="button"
                onClick={() => {
                  onChange(v);
                  setOpen(false);
                }}
                className={cn("flex w-full rounded-md px-3 py-1.5 text-left text-sm hover:bg-muted", v === value && "bg-muted")}
              >
                {label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/** Messages of the automation in order, for the preview on the right. */
function usePreview(flowId: string | null) {
  const [steps, setSteps] = useState<string[] | null>(null);
  useEffect(() => {
    if (!flowId) return setSteps(null);
    setSteps(null);
    createClient()
      .from("flows")
      .select("nodes, edges")
      .eq("id", flowId)
      .single()
      .then(({ data }) => {
        type N = { id: string; type?: string; data?: { messages?: Array<{ text?: string; block?: string; delaySeconds?: number; mediaType?: string }>; question?: { text?: string } } };
        const nodes = (Array.isArray(data?.nodes) ? data!.nodes : []) as unknown as N[];
        const edges = (Array.isArray(data?.edges) ? data!.edges : []) as unknown as Array<{ source: string; target: string; sourceHandle?: string | null }>;
        const targets = new Set(edges.map((e) => e.target));
        const trigger = nodes.find((n) => n.type === "trigger");
        let cur: N | undefined =
          (trigger && nodes.find((n) => n.id === edges.find((e) => e.source === trigger.id)?.target)) ??
          nodes.find((n) => n.type !== "trigger" && n.type !== "note" && !targets.has(n.id));
        const out: string[] = [];
        const seen = new Set<string>();
        while (cur && !seen.has(cur.id) && out.length < 12) {
          seen.add(cur.id);
          if (cur.type === "sendMessage") {
            for (const m of cur.data?.messages ?? []) {
              if (m.delaySeconds) continue;
              if (m.text) out.push(m.text);
              else if (m.mediaType || (m.block && m.block !== "text")) out.push(`[${m.mediaType ?? m.block}]`);
            }
            if (cur.data?.question?.text) out.push(cur.data.question.text);
          }
          const next = edges.find((e) => e.source === cur!.id && (!e.sourceHandle || e.sourceHandle === "next"));
          cur = next ? nodes.find((n) => n.id === next.target) : undefined;
        }
        setSteps(out);
      });
  }, [flowId]);
  return steps;
}

export function PickAutomationModal({
  onClose,
  onPick,
}: {
  onClose: () => void;
  onPick: (flow: { id: string; name: string }) => Promise<void>;
}) {
  const [flows, setFlows] = useState<PickFlow[] | null>(null);
  const [query, setQuery] = useState("");
  const [trigger, setTrigger] = useState("any");
  const [triggerState, setTriggerState] = useState("any");
  const [grid, setGrid] = useState(false);
  const [sort, setSort] = useState<{ by: "name" | "updated"; dir: 1 | -1 }>({ by: "updated", dir: -1 });
  const [selected, setSelected] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const preview = usePreview(selected);

  useEffect(() => {
    fetch("/api/v1/flows/pick-list")
      .then((r) => (r.ok ? r.json() : { flows: [] }))
      .then((d) => setFlows(d.flows ?? []))
      .catch(() => setFlows([]));
  }, []);

  const triggerOptions = useMemo(() => {
    const types = [...new Set((flows ?? []).flatMap((f) => f.triggers.map((t) => t.type)))];
    return [["any", "Cualquier disparador"], ...types.map((t) => [t, TRIGGER_LABEL[t] ?? t])] as Array<[string, string]>;
  }, [flows]);

  const list = (flows ?? [])
    .filter((f) => !query || f.name.toLowerCase().includes(query.toLowerCase()))
    .filter((f) => trigger === "any" || f.triggers.some((t) => t.type === trigger))
    .filter(
      (f) =>
        triggerState === "any" ||
        (triggerState === "on" ? f.triggers.some((t) => t.active) : f.triggers.length > 0 && f.triggers.some((t) => !t.active))
    )
    .sort((a, b) =>
      sort.by === "name"
        ? a.name.localeCompare(b.name) * sort.dir
        : (new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime()) * sort.dir
    );

  const chosen = (flows ?? []).find((f) => f.id === selected) ?? null;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="flex h-[85vh] w-full max-w-5xl overflow-hidden rounded-xl bg-card shadow-2xl" onClick={(e) => e.stopPropagation()}>
        {/* Left: list */}
        <div className="flex min-w-0 flex-[3] flex-col border-r border-border bg-muted/30">
          <div className="space-y-3 p-6 pb-3">
            <h2 className="text-2xl font-semibold">Escoger automatización</h2>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar todas las Automatizaciones"
                className="w-full rounded-md border border-blue-500 bg-background py-2 pl-9 pr-3 text-sm focus:outline-none"
              />
            </div>
            <div className="flex gap-3">
              <Select value={trigger} options={triggerOptions} onChange={setTrigger} />
              <Select
                value={triggerState}
                options={[
                  ["any", "Cualquier estado del disparador"],
                  ["on", "Disparador activado"],
                  ["off", "Disparador desactivado"],
                ]}
                onChange={setTriggerState}
              />
            </div>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setGrid((g) => !g)}
                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
              >
                {grid ? <List className="h-3.5 w-3.5" /> : <LayoutGrid className="h-3.5 w-3.5" />}
                {grid ? "Vista de lista" : "Vista de cuadrícula"}
              </button>
            </div>
            {!grid && (
              <div className="flex justify-between px-4 text-xs text-muted-foreground">
                {(
                  [
                    ["name", "Nombre"],
                    ["updated", "Modificado"],
                  ] as const
                ).map(([by, label]) => (
                  <button
                    key={by}
                    type="button"
                    onClick={() => setSort((s) => ({ by, dir: s.by === by ? ((-s.dir) as 1 | -1) : by === "name" ? 1 : -1 }))}
                    className={cn("flex items-center gap-1 hover:text-foreground", by === "updated" && "w-36")}
                  >
                    {label} <ArrowUpDown className="h-3 w-3" />
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className={cn("flex-1 overflow-y-auto px-6 pb-6", grid ? "grid grid-cols-2 content-start gap-3" : "space-y-3")}>
            {flows === null && <Loader2 className="mx-auto mt-10 h-5 w-5 animate-spin text-muted-foreground" />}
            {flows?.length === 0 && <p className="mt-10 text-center text-sm text-muted-foreground">Todavía no tenés automatizaciones.</p>}
            {list.map((f) => {
              const draft = f.status === "draft";
              const chip = STATUS_CHIP[f.status];
              return (
                <button
                  key={f.id}
                  type="button"
                  disabled={draft}
                  onClick={() => setSelected(f.id)}
                  className={cn(
                    "block w-full rounded-xl border-2 bg-card p-4 text-left transition-colors",
                    selected === f.id ? "border-blue-600" : "border-transparent",
                    draft ? "cursor-not-allowed opacity-50" : "hover:border-blue-300"
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-2">
                      {chip?.dot && <span className={cn("h-2 w-2 shrink-0 rounded-full", chip.dot)} />}
                      {chip && <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">{chip.label}</span>}
                      <span className="truncate font-semibold">{f.name}</span>
                    </div>
                    {!grid && <span className="w-36 shrink-0 text-sm text-muted-foreground">{ago(f.updatedAt)}</span>}
                  </div>
                  <div className="mt-2 grid w-48 grid-cols-2 gap-y-0.5 text-xs">
                    <span className="text-muted-foreground">Ejecuciones</span>
                    <span>{f.runs ?? "n/a"}</span>
                    <span className="text-muted-foreground">CTR</span>
                    <span>{f.ctr === null ? "n/a" : `${f.ctr}%`}</span>
                  </div>
                  {f.triggers.length > 0 && (
                    <div className="mt-2 space-y-0.5">
                      {f.triggers.map((t, i) => (
                        <p key={i} className={cn("truncate text-xs", t.active ? "text-muted-foreground" : "text-muted-foreground/60 line-through")}>
                          {TRIGGER_LABEL[t.type] ?? t.type}
                        </p>
                      ))}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Right: preview */}
        <div className="relative flex min-w-0 flex-[2] flex-col">
          <button type="button" onClick={onClose} aria-label="Cerrar" className="absolute right-4 top-4 text-muted-foreground hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
          {!chosen ? (
            <div className="m-auto max-w-xs px-6 text-center">
              <p className="font-medium">Automatización de vista previa</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Selecciona cualquier automatización con una versión publicada para ver una vista previa
              </p>
            </div>
          ) : (
            <>
              <div className="flex-1 overflow-y-auto p-6 pt-12">
                <p className="mb-4 font-semibold">{chosen.name}</p>
                {preview === null ? (
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                ) : preview.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Esta automatización no tiene mensajes para mostrar.</p>
                ) : (
                  <div className="space-y-2">
                    {preview.map((t, i) => (
                      <div key={i} className="ml-auto max-w-[85%] whitespace-pre-wrap rounded-2xl bg-blue-100 px-3 py-2 text-sm dark:bg-blue-950/60">
                        {t}
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="border-t border-border p-4">
                <button
                  type="button"
                  disabled={sending}
                  onClick={async () => {
                    setSending(true);
                    await onPick({ id: chosen.id, name: chosen.name });
                    setSending(false);
                  }}
                  className="flex w-full items-center justify-center gap-2 rounded-md bg-blue-600 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
                >
                  {sending && <Loader2 className="h-4 w-4 animate-spin" />}
                  Escoger
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
