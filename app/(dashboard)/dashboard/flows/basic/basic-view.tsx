"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AtSign, Loader2, Menu, MessageCircleQuestion, Plus, Reply, UserPlus, X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface BasicFlow {
  id: string;
  name: string;
  status: string;
  triggerTypes: string[];
}

interface IceBreaker {
  question: string;
  flowId: string | null;
}

interface MenuItem {
  title: string;
  type: "flow" | "url";
  flowId: string | null;
  url: string | null;
}

/**
 * "Automatizaciones básicas", in ManyChat's order: default reply, greet new
 * followers, conversation starters, story mention reply, main menu.
 */
export function BasicAutomationsView({ flows }: { flows: BasicFlow[] }) {
  const defaultFlow = flows.find((f) => f.triggerTypes.includes("default"));
  const mentionFlow = flows.find((f) => f.triggerTypes.includes("story_mention"));

  const [iceBreakers, setIceBreakers] = useState<IceBreaker[] | null>(null);
  const [menuItems, setMenuItems] = useState<MenuItem[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/v1/instagram/basics")
      .then(async (r) => {
        const body = await r.json();
        if (!r.ok) throw new Error(body.error || "Error");
        setIceBreakers(body.iceBreakers);
        setMenuItems(body.menuItems);
      })
      .catch((e) => {
        setLoadError(e instanceof Error ? e.message : "No se pudo cargar");
        setIceBreakers([]);
        setMenuItems([]);
      });
  }, []);

  return (
    <div className="max-w-4xl">
      <h2 className="mb-4 text-xl font-bold">Automatizaciones básicas</h2>
      {loadError && (
        <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
          No se pudo leer la configuración de Instagram: {loadError}
        </p>
      )}

      <div className="divide-y divide-border rounded-xl border border-border bg-card">
        <FlowBackedRow
          icon={Reply}
          title="Respuesta predeterminada: envía respuestas instantáneas a mensajes directos entrantes"
          description="Se envía cuando un mensaje no coincide con ninguna otra automatización."
          flow={defaultFlow}
          template={{ name: "Respuesta predeterminada", triggerType: "default", text: "¡Gracias por escribir! Te respondo muy pronto 🙌" }}
        />

        <Row
          icon={UserPlus}
          title={
            <>
              ¡Saluda a tus nuevos seguidores: la primera impresión es la que cuenta!{" "}
              <span className="ml-1 rounded bg-emerald-600 px-1.5 py-0.5 align-middle text-[10px] font-semibold text-white">
                BETA
              </span>
            </>
          }
          description="Cuando alguien comience a seguirte, se enviará un mensaje automático. Instagram todavía no permite que las aplicaciones sepan quién empieza a seguirte."
        >
          <p className="text-xs text-muted-foreground">ⓘ No disponible por ahora.</p>
        </Row>

        <Row
          icon={MessageCircleQuestion}
          title="Introductores de conversación: ayuda a los clientes potenciales a entablar una conversación con tu empresa"
          description="Cuando alguien abre un chat nuevo con tu cuenta de Instagram, verá botones con preguntas frecuentes. Al tocar uno se inicia la automatización que elijas. Máximo 4."
        >
          <IceBreakersEditor initial={iceBreakers} flows={flows} />
        </Row>

        <FlowBackedRow
          icon={AtSign}
          title="Respuesta a mención en una historia: responde a los usuarios que te mencionan en su historia"
          description={`Cuando te mencionan en una historia, puedes enviarles un mensaje de "Gracias" o iniciar una conversación automatizada.`}
          flow={mentionFlow}
          template={{ name: "Respuesta a mención en historia", triggerType: "story_mention", text: "¡Gracias por mencionarnos! 🧡" }}
        />

        <Row
          icon={Menu}
          title="Menú principal: ayuda a los seguidores a localizar rápidamente la información"
          description={`El menú "hamburguesa" en la parte inferior de los mensajes directos. Al tocar una opción se inicia una automatización o se abre un enlace. Máximo 3.`}
        >
          <MainMenuEditor initial={menuItems} flows={flows} />
        </Row>
      </div>
    </div>
  );
}

/* --------------------------------- rows ---------------------------------- */

function Row({
  icon: Icon,
  title,
  description,
  right,
  children,
}: {
  icon: typeof Reply;
  title: React.ReactNode;
  description: string;
  right?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex gap-3 p-5">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-4">
          <p className="text-sm font-medium text-foreground">{title}</p>
          {right}
        </div>
        <p className="mt-1.5 max-w-2xl text-xs text-muted-foreground">{description}</p>
        {children && <div className="mt-3">{children}</div>}
      </div>
    </div>
  );
}

function FlowBackedRow({
  icon,
  title,
  description,
  flow,
  template,
}: {
  icon: typeof Reply;
  title: string;
  description: string;
  flow: BasicFlow | undefined;
  template: { name: string; triggerType: string; text: string };
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const live = flow?.status === "published";

  async function configure() {
    if (flow) {
      router.push(`/dashboard/flows/${flow.id}`);
      return;
    }
    setBusy(true);
    try {
      const triggerId = `node_${Date.now()}_t`;
      const messageId = `node_${Date.now()}_m`;
      const res = await fetch("/api/v1/flows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: template.name,
          nodes: [
            { id: triggerId, type: "trigger", position: { x: 80, y: 120 }, data: { triggerType: template.triggerType, wizardDone: true } },
            {
              id: messageId,
              type: "sendMessage",
              position: { x: 420, y: 120 },
              data: { messages: [{ text: template.text }] },
            },
          ],
          edges: [{ id: `e_${triggerId}_${messageId}`, source: triggerId, target: messageId }],
        }),
      });
      const body = await res.json();
      if (!res.ok || !body?.id) throw new Error(body?.error || "Error");
      router.push(`/dashboard/flows/${body.id}`);
    } catch {
      alert("No se pudo crear la automatización.");
      setBusy(false);
    }
  }

  async function toggle() {
    if (!flow) return;
    setBusy(true);
    const res = await fetch(`/api/v1/flows/${flow.id}/${live ? "pause" : "publish"}`, { method: "POST" });
    if (!res.ok) alert("No se pudo cambiar el estado.");
    setBusy(false);
    router.refresh();
  }

  return (
    <Row
      icon={icon}
      title={title}
      description={description}
      right={
        flow && (
          <button
            onClick={toggle}
            disabled={busy}
            className={cn(
              "shrink-0 rounded-md border px-2 py-0.5 text-[11px] font-semibold",
              live ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-border bg-muted text-muted-foreground",
            )}
            title={live ? "Pausar" : "Activar"}
          >
            {live ? "Activo" : "Pausado"}
          </button>
        )
      }
    >
      <button
        onClick={configure}
        disabled={busy}
        className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
      >
        {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
        {flow ? "Editar" : "Configurar"}
      </button>
    </Row>
  );
}

/* ------------------------------ ice breakers ----------------------------- */

function FlowSelect({
  flows,
  value,
  onChange,
}: {
  flows: BasicFlow[];
  value: string | null;
  onChange: (id: string | null) => void;
}) {
  return (
    <select
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value || null)}
      className="w-56 rounded-lg border border-border bg-card px-2 py-2 text-sm"
    >
      <option value="">Elegir automatización…</option>
      {flows.map((f) => (
        <option key={f.id} value={f.id}>
          {f.name}
          {f.status !== "published" ? " (sin publicar)" : ""}
        </option>
      ))}
    </select>
  );
}

function SaveBar({ saving, saved, onSave, error }: { saving: boolean; saved: boolean; onSave: () => void; error: string | null }) {
  return (
    <div className="mt-3 flex items-center gap-3">
      <button
        onClick={onSave}
        disabled={saving}
        className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
      >
        {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
        Guardar
      </button>
      {saved && <span className="text-xs text-emerald-600">Guardado en Instagram ✓</span>}
      {error && <span className="text-xs text-red-500">{error}</span>}
    </div>
  );
}

async function saveBasics(body: object): Promise<string | null> {
  const res = await fetch("/api/v1/instagram/basics", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (res.ok) return null;
  const data = await res.json().catch(() => ({}));
  return data.error || "No se pudo guardar";
}

function IceBreakersEditor({ initial, flows }: { initial: IceBreaker[] | null; flows: BasicFlow[] }) {
  const [items, setItems] = useState<IceBreaker[]>([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (initial) setItems(initial);
  }, [initial]);

  if (!initial) return <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />;

  const set = (i: number, patch: Partial<IceBreaker>) => {
    setSaved(false);
    setItems((prev) => prev.map((it, j) => (j === i ? { ...it, ...patch } : it)));
  };

  return (
    <div>
      <div className="space-y-2">
        {items.map((it, i) => (
          <div key={i} className="flex items-center gap-2">
            <input
              value={it.question}
              maxLength={80}
              onChange={(e) => set(i, { question: e.target.value })}
              placeholder="Ej: ¿Cuánto cuesta la asesoría?"
              className="flex-1 rounded-lg border border-border bg-card px-3 py-2 text-sm"
            />
            <FlowSelect flows={flows} value={it.flowId} onChange={(flowId) => set(i, { flowId })} />
            <button
              onClick={() => {
                setSaved(false);
                setItems((prev) => prev.filter((_, j) => j !== i));
              }}
              className="text-muted-foreground hover:text-red-500"
              aria-label="Quitar"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
      {items.length < 4 && (
        <button
          onClick={() => setItems((prev) => [...prev, { question: "", flowId: null }])}
          className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:underline"
        >
          <Plus className="h-3 w-3" /> Agregar pregunta
        </button>
      )}
      <SaveBar
        saving={saving}
        saved={saved}
        error={error}
        onSave={async () => {
          setSaving(true);
          setError(null);
          const err = await saveBasics({ iceBreakers: items });
          setSaving(false);
          if (err) setError(err);
          else setSaved(true);
        }}
      />
    </div>
  );
}

/* ------------------------------- main menu ------------------------------- */

function MainMenuEditor({ initial, flows }: { initial: MenuItem[] | null; flows: BasicFlow[] }) {
  const [items, setItems] = useState<MenuItem[]>([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (initial) setItems(initial);
  }, [initial]);

  if (!initial) return <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />;

  const set = (i: number, patch: Partial<MenuItem>) => {
    setSaved(false);
    setItems((prev) => prev.map((it, j) => (j === i ? { ...it, ...patch } : it)));
  };

  return (
    <div>
      <div className="space-y-2">
        {items.map((it, i) => (
          <div key={i} className="flex flex-wrap items-center gap-2">
            <input
              value={it.title}
              maxLength={30}
              onChange={(e) => set(i, { title: e.target.value })}
              placeholder="Ej: Ver precios"
              className="w-48 rounded-lg border border-border bg-card px-3 py-2 text-sm"
            />
            <select
              value={it.type}
              onChange={(e) => set(i, { type: e.target.value as MenuItem["type"] })}
              className="rounded-lg border border-border bg-card px-2 py-2 text-sm"
            >
              <option value="flow">Iniciar automatización</option>
              <option value="url">Abrir enlace</option>
            </select>
            {it.type === "flow" ? (
              <FlowSelect flows={flows} value={it.flowId} onChange={(flowId) => set(i, { flowId })} />
            ) : (
              <input
                value={it.url ?? ""}
                onChange={(e) => set(i, { url: e.target.value })}
                placeholder="https://"
                className="w-56 rounded-lg border border-border bg-card px-3 py-2 text-sm"
              />
            )}
            <button
              onClick={() => {
                setSaved(false);
                setItems((prev) => prev.filter((_, j) => j !== i));
              }}
              className="text-muted-foreground hover:text-red-500"
              aria-label="Quitar"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
      {items.length < 3 && (
        <button
          onClick={() => setItems((prev) => [...prev, { title: "", type: "flow", flowId: null, url: null }])}
          className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:underline"
        >
          <Plus className="h-3 w-3" /> Agregar opción
        </button>
      )}
      <SaveBar
        saving={saving}
        saved={saved}
        error={error}
        onSave={async () => {
          setSaving(true);
          setError(null);
          const err = await saveBasics({ menuItems: items });
          setSaving(false);
          if (err) setError(err);
          else setSaved(true);
        }}
      />
    </div>
  );
}
