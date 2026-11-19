"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useStore, type Edge, type Node } from "@xyflow/react";
import { Sparkles, Loader2, Plus, GripVertical, X, Search, Mail, Send, HelpCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { NextStepPicker } from "./NextStepPicker";

interface Task {
  text: string;
  saveField?: boolean;
  fieldSlug?: string;
}

interface StepData {
  aiStep?: boolean;
  goal?: string;
  context?: string;
  tasks?: Task[];
  draftGoal?: string;
  draftContext?: string;
  [key: string]: unknown;
}

const box =
  "w-full resize-none rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm placeholder:text-muted-foreground focus:border-blue-500 focus:outline-none";

function Hint({ text }: { text: string }) {
  return (
    <span title={text} className="cursor-help text-muted-foreground">
      <HelpCircle className="h-3.5 w-3.5" />
    </span>
  );
}

/** "Seleccionar Campo": Correo electrónico + custom fields, "+ Campo de usuario". */
function FieldPicker({ value, onChange }: { value?: string; onChange: (slug: string) => void }) {
  const [open, setOpen] = useState(false);
  const [fields, setFields] = useState<Array<{ slug: string; name: string }>>([]);
  const [q, setQ] = useState("");

  useEffect(() => {
    if (!open) return;
    createClient()
      .from("custom_field_definitions")
      .select("slug, name")
      .order("name")
      .then(({ data }) => setFields((data as Array<{ slug: string; name: string }>) ?? []));
  }, [open]);

  async function createField() {
    const name = window.prompt("Nombre del nuevo campo de usuario", q || "");
    if (!name?.trim()) return;
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { data: member } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("user_id", user?.id ?? "")
      .limit(1)
      .single();
    if (!member) return;
    const slug = name
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_|_$/g, "");
    await supabase.from("custom_field_definitions").insert({ workspace_id: member.workspace_id, name: name.trim(), slug, type: "text" });
    onChange(slug);
    setOpen(false);
  }

  const label = value === "email" ? "Correo electrónico" : fields.find((f) => f.slug === value)?.name ?? value;
  const list = [{ slug: "email", name: "Correo electrónico" }, ...fields].filter(
    (f) => !q || f.name.toLowerCase().includes(q.toLowerCase())
  );

  return (
    <span className="relative">
      <button type="button" onClick={() => setOpen((o) => !o)} className="text-blue-600 underline-offset-2 hover:underline">
        {value ? label : "Seleccionar Campo"}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-6 z-50 w-56 rounded-lg border border-border bg-card shadow-lg">
            <div className="m-2 flex items-center gap-1.5 rounded-md border border-border px-2 py-1">
              <Search className="h-3.5 w-3.5 text-muted-foreground" />
              <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} className="w-full bg-transparent text-sm focus:outline-none" />
            </div>
            <div className="max-h-48 overflow-y-auto">
              {list.map((f) => (
                <button
                  key={f.slug}
                  type="button"
                  onClick={() => {
                    onChange(f.slug);
                    setOpen(false);
                  }}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-muted"
                >
                  {f.slug === "email" && <Mail className="h-3.5 w-3.5 text-muted-foreground" />}
                  {f.name}
                </button>
              ))}
            </div>
            <button type="button" onClick={createField} className="w-full border-t border-border py-2 text-sm text-blue-600 hover:bg-muted">
              + Campo de usuario
            </button>
          </div>
        </>
      )}
    </span>
  );
}

/** "Chatea con AI Step aquí para ver cómo gestiona las conversaciones reales". */
function AiChatPreview({ data, anchor, nodeId }: { data: StepData; anchor: HTMLElement | null; nodeId: string }) {
  // The question of the step right before this one (what the contact is answering).
  const prevQuestion = useStore((st) => {
    const edge = (st.edges as Edge[]).find((e) => e.target === nodeId);
    const src = edge && (st.nodes as Node[]).find((n) => n.id === edge.source);
    const q = (src?.data as { question?: { text?: string } } | undefined)?.question?.text;
    return q?.trim() || "";
  });
  const [pos, setPos] = useState<{ left: number; top: number; height: number } | null>(null);
  const [started, setStarted] = useState(false);
  const [history, setHistory] = useState<Array<{ role: "user" | "assistant"; content: string }>>([]);
  const [saved, setSaved] = useState<Record<string, string>>({});
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  useLayoutEffect(() => {
    const sidebar = anchor?.closest("[data-node-sidebar]") as HTMLElement | null;
    if (!sidebar) return;
    const update = () => {
      const r = sidebar.getBoundingClientRect();
      setPos({ left: r.right, top: r.top, height: r.height });
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [anchor]);

  async function turn(next: Array<{ role: "user" | "assistant"; content: string }>) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/ai/step-preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data: { goal: data.goal, context: data.context, tasks: data.tasks }, history: next }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "No se pudo responder");
      const h = body.reply ? [...next, { role: "assistant" as const, content: body.reply }] : next;
      setHistory(h);
      setSaved((s) => ({ ...s, ...(body.fields ?? {}) }));
      setDone(!!body.done);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo responder");
    } finally {
      setBusy(false);
    }
  }

  if (!pos) return null;
  return createPortal(
    <div
      className="fixed z-30 flex w-[300px] flex-col border-r border-border bg-card shadow-lg"
      style={{ left: pos.left, top: pos.top, height: pos.height }}
    >
      <div className="flex-1 space-y-2 overflow-y-auto p-3">
        {!started ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
            <Sparkles className="h-6 w-6" />
            <p className="text-sm text-muted-foreground">Chatea con AI Step aquí para ver cómo gestiona las conversaciones reales</p>
            <button
              type="button"
              onClick={() => {
                setStarted(true);
                setSaved({});
                setDone(false);
                if (prevQuestion) {
                  // Same as the real conversation: the contact answers the previous question.
                  setHistory([{ role: "assistant", content: prevQuestion }]);
                } else {
                  setHistory([]);
                  turn([]);
                }
              }}
              className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted"
            >
              Empezar Vista Previa
            </button>
          </div>
        ) : (
          <>
            {history.map((m, i) => (
              <div
                key={i}
                className={cn(
                  "max-w-[85%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm",
                  m.role === "user" ? "ml-auto bg-blue-600 text-white" : "bg-muted"
                )}
              >
                {m.content}
              </div>
            ))}
            {busy && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
            {Object.keys(saved).length > 0 && (
              <div className="rounded-lg border border-emerald-300 bg-emerald-50/60 p-2 text-[11px] dark:bg-emerald-950/20">
                {Object.entries(saved).map(([k, v]) => (
                  <p key={k}>
                    <b>{k}</b>: {v}
                  </p>
                ))}
              </div>
            )}
            {done && <p className="text-center text-[11px] text-emerald-600">✓ Tareas completas → Siguiente paso</p>}
            {error && <p className="text-xs text-red-600">{error}</p>}
            <button
              type="button"
              onClick={() => setStarted(false)}
              className="block w-full text-center text-[11px] text-muted-foreground hover:underline"
            >
              Reiniciar
            </button>
          </>
        )}
      </div>
      <div className="flex items-center gap-2 border-t border-border p-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && draft.trim() && started && !busy) {
              const next = [...history, { role: "user" as const, content: draft.trim() }];
              setHistory(next);
              setDraft("");
              turn(next);
            }
          }}
          disabled={!started || busy}
          placeholder="Escribe un mensaje..."
          className="flex-1 bg-transparent px-2 py-1 text-sm focus:outline-none disabled:opacity-60"
        />
        <Send className="h-4 w-4 text-muted-foreground" />
      </div>
    </div>,
    document.body
  );
}

/** ManyChat "AI Step". */
export function AiStepPanel({
  data: raw,
  onChange,
  nodeId,
}: {
  data: Record<string, unknown>;
  onChange: (d: Record<string, unknown>) => void;
  nodeId: string;
}) {
  const data = raw as StepData;
  const anchor = useRef<HTMLDivElement>(null);
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [missing, setMissing] = useState<"goal" | "context" | null>(null);
  const set = (patch: Partial<StepData>) => onChange({ ...data, ...patch });
  const tasks = data.tasks ?? [];
  const generated = Array.isArray(data.tasks);

  useEffect(() => setAnchorEl(anchor.current), []);

  async function generate() {
    const goal = (data.draftGoal ?? "").trim();
    const context = (data.draftContext ?? "").trim();
    if (!goal) return setMissing("goal");
    if (!context) return setMissing("context");
    setMissing(null);
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/ai/generate-step", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ goal, context }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "No se pudo generar");
      set({ aiStep: true, goal: body.goal, context, tasks: body.tasks });
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo generar");
    } finally {
      setBusy(false);
    }
  }

  if (!generated) {
    return (
      <div ref={anchor} className="space-y-5">
        <div>
          <div className="mb-2 flex items-center justify-between">
            <p className="text-base font-semibold">Dile a la IA lo que debe hacer</p>
            <Hint text="Piensa en las conversaciones que mantienes con tu audiencia. Dile a la IA de lo que se puede encargar específicamente por ti." />
          </div>
          <textarea
            rows={3}
            value={data.draftGoal ?? ""}
            onChange={(e) => set({ draftGoal: e.target.value })}
            placeholder="Establecer un objetivo para la conversación"
            className={cn(box, missing === "goal" && "border-red-400")}
          />
          {missing === "goal" && <p className="mt-1 text-xs text-red-600">Añadir objetivo para continuar</p>}
        </div>
        <div>
          <div className="mb-2 flex items-center justify-between">
            <p className="text-base font-semibold">Brindar contexto a la IA</p>
            <Hint text="Comparte toda la información que la IA necesita para dirigirse a tu audiencia. Incluye detalles de tu empresa o producto, enlaces relevantes o información promocional." />
          </div>
          <textarea
            rows={5}
            value={data.draftContext ?? ""}
            onChange={(e) => set({ draftContext: e.target.value })}
            placeholder="Comparte toda la información"
            className={cn(box, missing === "context" && "border-red-400 bg-red-50/40")}
          />
          {missing === "context" && <p className="mt-1 text-xs text-red-600">Añadir contexto para continuar</p>}
        </div>
        <button
          type="button"
          onClick={generate}
          disabled={busy}
          className="flex w-full items-center justify-center gap-2 rounded-md bg-blue-600 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          Generar
        </button>
        {error && <p className="text-xs text-red-600">{error}</p>}
        <p className="rounded-lg border border-border p-3 text-sm text-muted-foreground">
          Ahora la IA puede gestionar conversaciones completas basadas en tus peticiones. Puede recopilar datos, responder a
          preguntas frecuentes y mucho más.
        </p>
      </div>
    );
  }

  return (
    <div ref={anchor} className="space-y-5">
      <AiChatPreview data={data} anchor={anchorEl} nodeId={nodeId} />
      <div>
        <p className="mb-2 text-base font-semibold">Objetivo</p>
        <textarea rows={3} value={data.goal ?? ""} onChange={(e) => set({ goal: e.target.value })} className={box} />
      </div>

      <ul className="space-y-3">
        {tasks.map((t, i) => (
          <li key={i} className="group flex gap-2">
            <GripVertical className="mt-1 h-4 w-4 shrink-0 text-muted-foreground/40" />
            <div className="min-w-0 flex-1">
              <textarea
                rows={2}
                value={t.text}
                onChange={(e) => set({ tasks: tasks.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)) })}
                placeholder="Introducir tarea"
                className="w-full resize-none bg-transparent text-sm focus:outline-none"
              />
              {!t.text.trim() && <p className="text-xs text-red-600">Escribe la tarea para guardarla</p>}
              <label className="mt-1 flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
                <input
                  type="checkbox"
                  checked={!!t.saveField}
                  onChange={(e) => set({ tasks: tasks.map((x, j) => (j === i ? { ...x, saveField: e.target.checked } : x)) })}
                />
                Guardar respuesta del usuario como
                {t.saveField && (
                  <FieldPicker
                    value={t.fieldSlug}
                    onChange={(slug) => set({ tasks: tasks.map((x, j) => (j === i ? { ...x, fieldSlug: slug } : x)) })}
                  />
                )}
              </label>
              {t.saveField && !t.fieldSlug && <p className="text-xs text-red-600">Selecciona campo de usuario para guardar</p>}
            </div>
            <button
              type="button"
              onClick={() => set({ tasks: tasks.filter((_, j) => j !== i) })}
              className="hidden h-5 text-muted-foreground hover:text-red-500 group-hover:block"
              aria-label="Eliminar tarea"
            >
              <X className="h-4 w-4" />
            </button>
          </li>
        ))}
      </ul>
      <button
        type="button"
        onClick={() => set({ tasks: [...tasks, { text: "" }] })}
        className="flex items-center gap-1.5 text-sm hover:text-blue-600"
      >
        <Plus className="h-4 w-4" /> Nueva Tarea
      </button>

      <div>
        <p className="mb-2 text-base font-semibold">Contexto</p>
        <textarea rows={4} value={data.context ?? ""} onChange={(e) => set({ context: e.target.value })} className={box} />
      </div>

      <NextStepPicker nodeId={nodeId} variant="button" />
    </div>
  );
}
