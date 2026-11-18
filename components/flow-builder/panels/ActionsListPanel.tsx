"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * ManyChat's "Acciones" step: "Realiza las siguientes acciones:" with a list of
 * actions and "+ Acción", which opens a catalogue grouped like ManyChat's.
 */

export interface ActionItem {
  id: string;
  type: string;
  tagName?: string;
  fieldSlug?: string;
  value?: string;
  sequenceId?: string;
  flowId?: string;
  url?: string;
  method?: string;
  body?: string;
  responseVariable?: string;
}

interface CatalogEntry {
  type: string;
  title: string;
  description: string;
}

export const ACTION_CATALOG: Array<{ id: string; label: string; description: string; items: CatalogEntry[] }> = [
  {
    id: "contact",
    label: "Datos de contacto",
    description: "Gestiona las etiquetas de los contactos, los campos y los estados",
    items: [
      { type: "addTag", title: "Añadir etiqueta", description: "Etiqueta los contactos para organizarlos y segmentarlos" },
      { type: "removeTag", title: "Eliminar etiqueta", description: "Quita una etiqueta que ya no aplica al contacto" },
      { type: "setCustomField", title: "Establecer campo de usuario", description: "Guarda datos del contacto, como su fecha de nacimiento" },
      { type: "clearCustomField", title: "Borrar campo de usuario", description: "Elimina un dato guardado del contacto" },
      { type: "deleteContact", title: "Eliminar contacto", description: "Elimina el contacto de forma permanente" },
    ],
  },
  {
    id: "automation",
    label: "Automatización",
    description: "Gestiona el flujo de trabajo de automatización",
    items: [
      { type: "enrollSequence", title: "Suscribirse a secuencia", description: "Suscribe al contacto a una secuencia de mensajes" },
      { type: "unenrollSequence", title: "Cancelar suscripción de la secuencia", description: "Saca al contacto de una secuencia" },
      { type: "goToFlow", title: "Iniciar otra automatización", description: "Continúa en otra de tus automatizaciones" },
      { type: "httpRequest", title: "Realizar solicitud externa", description: "Envía una solicitud HTTP a tu servidor" },
      { type: "pauseAutomations", title: "Pausar todas las automatizaciones", description: "Deja de enviar mensajes automáticos a este contacto" },
    ],
  },
  {
    id: "inbox",
    label: "Bandeja de entrada",
    description: "Gestiona el comportamiento de la bandeja de entrada",
    items: [
      { type: "openConversation", title: "Marcar conversación como abierta", description: "Para una interacción en curso" },
      { type: "closeConversation", title: "Marcar conversación como cerrada", description: "Para una interacción concluida" },
    ],
  },
];

export function actionTitle(type: string) {
  for (const g of ACTION_CATALOG) {
    const found = g.items.find((i) => i.type === type);
    if (found) return found.title;
  }
  return type;
}

interface Props {
  data: Record<string, unknown>;
  onChange: (data: Record<string, unknown>) => void;
}

const inputClass =
  "w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500";

export function ActionsListPanel({ data, onChange }: Props) {
  const actions = Array.isArray(data.actions) ? (data.actions as ActionItem[]) : [];
  const [pickerOpen, setPickerOpen] = useState(actions.length === 0);
  const [sequences, setSequences] = useState<Array<{ id: string; name: string }>>([]);
  const [flows, setFlows] = useState<Array<{ id: string; name: string }>>([]);

  useEffect(() => {
    import("@/lib/supabase/client").then(async ({ createClient }) => {
      const supabase = createClient();
      const [{ data: seq }, { data: fl }] = await Promise.all([
        supabase.from("sequences").select("id, name").order("name"),
        supabase.from("flows").select("id, name").neq("status", "archived").order("name"),
      ]);
      setSequences(seq ?? []);
      setFlows(fl ?? []);
    });
  }, []);

  const setActions = (next: ActionItem[]) => onChange({ ...data, actions: next });
  const update = (i: number, patch: Partial<ActionItem>) =>
    setActions(actions.map((a, j) => (j === i ? { ...a, ...patch } : a)));

  return (
    <div className="space-y-3">
      <p className="text-sm font-medium text-foreground">Realiza las siguientes acciones:</p>

      {actions.map((a, i) => (
        <div key={a.id} className="rounded-xl border border-amber-300 bg-amber-50/40 p-3 dark:border-amber-800 dark:bg-amber-950/20">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-semibold text-foreground">{actionTitle(a.type)}</p>
            <button
              onClick={() => setActions(actions.filter((_, j) => j !== i))}
              className="text-muted-foreground hover:text-red-500"
              aria-label="Quitar acción"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {(a.type === "addTag" || a.type === "removeTag") && (
            <input
              value={a.tagName ?? ""}
              onChange={(e) => update(i, { tagName: e.target.value })}
              placeholder="Nombre de la etiqueta"
              className={inputClass}
            />
          )}
          {(a.type === "setCustomField" || a.type === "clearCustomField") && (
            <div className="space-y-2">
              <input
                value={a.fieldSlug ?? ""}
                onChange={(e) => update(i, { fieldSlug: e.target.value })}
                placeholder="Campo (slug)"
                className={inputClass}
              />
              {a.type === "setCustomField" && (
                <input
                  value={a.value ?? ""}
                  onChange={(e) => update(i, { value: e.target.value })}
                  placeholder="Valor (puedes usar {{nombre}}, {{email}}…)"
                  className={inputClass}
                />
              )}
            </div>
          )}
          {(a.type === "enrollSequence" || a.type === "unenrollSequence") && (
            <select
              value={a.sequenceId ?? ""}
              onChange={(e) => update(i, { sequenceId: e.target.value })}
              className={inputClass}
            >
              <option value="">Elegir secuencia…</option>
              {sequences.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          )}
          {a.type === "goToFlow" && (
            <select value={a.flowId ?? ""} onChange={(e) => update(i, { flowId: e.target.value })} className={inputClass}>
              <option value="">Elegir automatización…</option>
              {flows.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          )}
          {a.type === "httpRequest" && (
            <div className="space-y-2">
              <div className="flex gap-2">
                <select
                  value={a.method ?? "POST"}
                  onChange={(e) => update(i, { method: e.target.value })}
                  className="rounded-lg border border-border bg-card px-2 py-2 text-sm"
                >
                  {["GET", "POST", "PUT", "DELETE"].map((m) => (
                    <option key={m}>{m}</option>
                  ))}
                </select>
                <input
                  value={a.url ?? ""}
                  onChange={(e) => update(i, { url: e.target.value })}
                  placeholder="https://"
                  className={inputClass}
                />
              </div>
              {a.method !== "GET" && (
                <textarea
                  rows={3}
                  value={a.body ?? ""}
                  onChange={(e) => update(i, { body: e.target.value })}
                  placeholder='{"email": "{{email}}"}'
                  className={inputClass}
                />
              )}
              <input
                value={a.responseVariable ?? ""}
                onChange={(e) => update(i, { responseVariable: e.target.value.replace(/[^\w]/g, "_") })}
                placeholder="Guardar respuesta en variable (opcional)"
                className={inputClass}
              />
            </div>
          )}
          {a.type === "deleteContact" && (
            <p className="text-xs text-red-600">El contacto se borrará para siempre y la automatización se detendrá aquí.</p>
          )}
          {["pauseAutomations", "openConversation", "closeConversation"].includes(a.type) && (
            <p className="text-xs text-muted-foreground">
              {ACTION_CATALOG.flatMap((g) => g.items).find((x) => x.type === a.type)?.description}
            </p>
          )}
        </div>
      ))}

      <button
        onClick={() => setPickerOpen(true)}
        className="w-full rounded-xl border border-dashed border-amber-400 py-2.5 text-sm font-medium text-amber-700 hover:bg-amber-50 dark:text-amber-400 dark:hover:bg-amber-950/30"
      >
        + Acción
      </button>

      <ActionCatalogModal
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onPick={(type) =>
          setActions([...actions, { id: `a_${Math.random().toString(36).slice(2, 9)}`, type }])
        }
      />
    </div>
  );
}

function ActionCatalogModal({
  open,
  onClose,
  onPick,
}: {
  open: boolean;
  onClose: () => void;
  onPick: (type: string) => void;
}) {
  const [group, setGroup] = useState(ACTION_CATALOG[0].id);
  if (!open || typeof document === "undefined") return null;
  const current = ACTION_CATALOG.find((g) => g.id === group)!;

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="flex max-h-[80vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-card shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <h2 className="text-xl font-bold text-foreground">Realiza las siguientes acciones...</h2>
          <button onClick={onClose} className="rounded-md p-1.5 text-muted-foreground hover:bg-muted" aria-label="Cerrar">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex min-h-0 flex-1">
          <nav className="w-52 shrink-0 space-y-1 border-r border-border p-3">
            {ACTION_CATALOG.map((g) => (
              <button
                key={g.id}
                onClick={() => setGroup(g.id)}
                className={cn(
                  "w-full rounded-lg px-3 py-2 text-left text-sm",
                  group === g.id ? "bg-muted font-medium text-foreground" : "text-muted-foreground hover:bg-muted/60",
                )}
              >
                {g.label}
              </button>
            ))}
          </nav>
          <div className="min-h-0 flex-1 overflow-y-auto p-5">
            <p className="text-sm font-semibold text-foreground">{current.label}</p>
            <p className="mb-3 text-xs text-muted-foreground">{current.description}</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {current.items.map((item) => (
                <button
                  key={item.type}
                  onClick={() => {
                    onPick(item.type);
                    onClose();
                  }}
                  className="rounded-xl border border-border p-3 text-left hover:border-amber-500"
                >
                  <span className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                    <Plus className="h-3.5 w-3.5 text-amber-600" />
                    {item.title}
                  </span>
                  <span className="mt-1 block text-xs text-muted-foreground">{item.description}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
