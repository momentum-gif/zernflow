"use client";

import { useCallback } from "react";
import { Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { NodeType } from "@/lib/types/database";
import { EnrollSequencePanel } from "./EnrollSequencePanel";

interface ActionPanelData {
  actionType?: NodeType;
  tagName?: string;
  action?: "add" | "remove";
  fieldSlug?: string;
  value?: string;
  method?: string;
  url?: string;
  headers?: Record<string, string>;
  body?: string;
  responseVariable?: string;
  flowId?: string;
  returnAfter?: boolean;
  message?: string;
  paths?: Array<{ name: string; weight: number }>;
  timeout?: number;
  timeoutUnit?: string;
  confirmed?: boolean;
  sequenceId?: string;
  [key: string]: unknown;
}

interface ActionPanelProps {
  data: Record<string, unknown>;
  onChange: (data: Record<string, unknown>) => void;
}

interface ActionSubPanelProps {
  data: ActionPanelData;
  onChange: (data: Record<string, unknown>) => void;
}

export function ActionPanel({ data: rawData, onChange }: ActionPanelProps) {
  const data = rawData as ActionPanelData;
  const actionType = data.actionType || "addTag";

  switch (actionType) {
    case "addTag":
    case "removeTag":
      return <TagConfig data={data} onChange={onChange} />;
    case "setCustomField":
      return <SetFieldConfig data={data} onChange={onChange} />;
    case "httpRequest":
      return <HttpRequestConfig data={data} onChange={onChange} />;
    case "goToFlow":
      return <GoToFlowConfig data={data} onChange={onChange} />;
    case "subscribe":
    case "unsubscribe":
      return <SubscribeConfig data={data} onChange={onChange} />;
    case "humanTakeover":
      return <HumanTakeoverConfig data={data} onChange={onChange} />;
    case "abSplit":
      return <ABSplitConfig data={data} onChange={onChange} />;
    case "smartDelay":
      return <SmartDelayConfig data={data} onChange={onChange} />;
    case "enrollSequence":
      return <EnrollSequencePanel data={rawData} onChange={onChange} />;
    case "collectInput":
      return <CollectInputConfig data={data} onChange={onChange} />;
    default:
      return (
        <p className="text-sm text-muted-foreground">
          No configuration available for this action type.
        </p>
      );
  }
}

/* ───────── Tag Config ───────── */
function TagConfig({ data, onChange }: ActionSubPanelProps) {
  const isAdd = data.actionType === "addTag";

  return (
    <div className="space-y-4">
      <div>
        <label className="mb-2 block text-xs font-semibold text-foreground">
          Tag Name
        </label>
        <input
          type="text"
          value={data.tagName || ""}
          onChange={(e) => onChange({ ...data, tagName: e.target.value })}
          placeholder="Enter tag name..."
          className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/60 focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
        />
        <p className="mt-1.5 text-xs text-muted-foreground">
          {isAdd
            ? "This tag will be added to the contact when they reach this step."
            : "This tag will be removed from the contact when they reach this step."}
        </p>
      </div>
    </div>
  );
}

/* ───────── Set Custom Field Config ───────── */
function SetFieldConfig({ data, onChange }: ActionSubPanelProps) {
  return (
    <div className="space-y-4">
      <div>
        <label className="mb-2 block text-xs font-semibold text-foreground">
          Field Name (slug)
        </label>
        <input
          type="text"
          value={data.fieldSlug || ""}
          onChange={(e) => onChange({ ...data, fieldSlug: e.target.value })}
          placeholder="e.g. favorite_color"
          className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/60 focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </div>
      <div>
        <label className="mb-2 block text-xs font-semibold text-foreground">
          Value
        </label>
        <input
          type="text"
          value={data.value || ""}
          onChange={(e) => onChange({ ...data, value: e.target.value })}
          placeholder="Value or {{variable}}"
          className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/60 focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
        />
        <p className="mt-1.5 text-[11px] text-muted-foreground/60">
          Use {"{{variable}}"} for dynamic values
        </p>
      </div>
    </div>
  );
}

/* ───────── HTTP Request Config ───────── */
function HttpRequestConfig({ data, onChange }: ActionSubPanelProps) {
  const headers = data.headers || {};
  const headerEntries = Object.entries(headers);

  const addHeader = useCallback(() => {
    onChange({ ...data, headers: { ...headers, "": "" } });
  }, [data, headers, onChange]);

  const updateHeaderKey = useCallback(
    (oldKey: string, newKey: string) => {
      const newHeaders: Record<string, string> = {};
      for (const [k, v] of Object.entries(headers)) {
        newHeaders[k === oldKey ? newKey : k] = v;
      }
      onChange({ ...data, headers: newHeaders });
    },
    [data, headers, onChange]
  );

  const updateHeaderValue = useCallback(
    (key: string, value: string) => {
      onChange({ ...data, headers: { ...headers, [key]: value } });
    },
    [data, headers, onChange]
  );

  const removeHeader = useCallback(
    (key: string) => {
      const newHeaders = { ...headers };
      delete newHeaders[key];
      onChange({ ...data, headers: Object.keys(newHeaders).length > 0 ? newHeaders : undefined });
    },
    [data, headers, onChange]
  );

  return (
    <div className="space-y-4">
      {/* Method + URL */}
      <div>
        <label className="mb-2 block text-xs font-semibold text-foreground">
          Request
        </label>
        <div className="flex gap-2">
          <select
            value={data.method || "GET"}
            onChange={(e) => onChange({ ...data, method: e.target.value })}
            className="rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium text-foreground focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
          >
            <option value="GET">GET</option>
            <option value="POST">POST</option>
            <option value="PUT">PUT</option>
            <option value="DELETE">DELETE</option>
          </select>
          <input
            type="url"
            value={data.url || ""}
            onChange={(e) => onChange({ ...data, url: e.target.value })}
            placeholder="https://api.example.com/webhook"
            className="flex-1 rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/60 focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
      </div>

      {/* Headers */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <label className="text-xs font-semibold text-foreground">Headers</label>
          <button
            type="button"
            onClick={addHeader}
            className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground hover:bg-muted"
          >
            <Plus className="h-3 w-3" />
            Add
          </button>
        </div>
        {headerEntries.map(([key, value], i) => (
          <div key={i} className="mb-2 flex items-center gap-2">
            <input
              type="text"
              value={key}
              onChange={(e) => updateHeaderKey(key, e.target.value)}
              placeholder="Key"
              className="flex-1 rounded border border-border bg-card px-2 py-1.5 text-xs text-foreground placeholder:text-muted-foreground/60 focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
            />
            <input
              type="text"
              value={value}
              onChange={(e) => updateHeaderValue(key, e.target.value)}
              placeholder="Value"
              className="flex-1 rounded border border-border bg-card px-2 py-1.5 text-xs text-foreground placeholder:text-muted-foreground/60 focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
            />
            <button
              type="button"
              onClick={() => removeHeader(key)}
              className="rounded p-1 text-muted-foreground/60 hover:bg-muted hover:text-muted-foreground"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        ))}
      </div>

      {/* Body */}
      {(data.method === "POST" || data.method === "PUT") && (
        <div>
          <label className="mb-2 block text-xs font-semibold text-foreground">
            Request Body (JSON)
          </label>
          <textarea
            value={data.body || ""}
            onChange={(e) => onChange({ ...data, body: e.target.value })}
            placeholder='{"key": "{{variable}}"}'
            rows={4}
            className="w-full resize-none rounded-lg border border-border bg-card px-3 py-2 font-mono text-xs text-foreground placeholder:text-muted-foreground/60 focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
      )}

      {/* Response Variable */}
      <div>
        <label className="mb-2 block text-xs font-semibold text-foreground">
          Save response to variable
        </label>
        <input
          type="text"
          value={data.responseVariable || ""}
          onChange={(e) => onChange({ ...data, responseVariable: e.target.value })}
          placeholder="e.g. api_response"
          className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/60 focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
        />
        <p className="mt-1.5 text-xs text-muted-foreground">
          Optional. Store the response body in a variable for later use.
        </p>
      </div>
    </div>
  );
}

/* ───────── Go To Flow Config ───────── */
function GoToFlowConfig({ data, onChange }: ActionSubPanelProps) {
  return (
    <div className="space-y-4">
      <div>
        <label className="mb-2 block text-xs font-semibold text-foreground">
          Target Flow ID
        </label>
        <input
          type="text"
          value={data.flowId || ""}
          onChange={(e) => onChange({ ...data, flowId: e.target.value })}
          placeholder="Enter flow ID..."
          className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/60 focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
        />
        <p className="mt-1.5 text-xs text-muted-foreground">
          The contact will be redirected to this flow.
        </p>
      </div>

      <div className="flex items-center gap-3">
        <label className="relative inline-flex cursor-pointer items-center">
          <input
            type="checkbox"
            checked={data.returnAfter || false}
            onChange={(e) => onChange({ ...data, returnAfter: e.target.checked })}
            className="peer sr-only"
          />
          <div className="peer h-5 w-9 rounded-full bg-muted after:absolute after:left-[2px] after:top-[2px] after:h-4 after:w-4 after:rounded-full after:bg-card after:transition-all peer-checked:bg-muted0 peer-checked:after:translate-x-full peer-focus:ring-2 peer-focus:ring-ring" />
        </label>
        <div>
          <p className="text-sm font-medium text-foreground">Return after</p>
          <p className="text-xs text-muted-foreground">
            Come back to this flow after the target flow completes
          </p>
        </div>
      </div>
    </div>
  );
}

/* ───────── Subscribe / Unsubscribe Config ───────── */
function SubscribeConfig({ data, onChange }: ActionSubPanelProps) {
  const isSubscribe = data.actionType === "subscribe";

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border bg-muted p-4">
        <p className="text-sm font-medium text-foreground">
          {isSubscribe ? "Subscribe Contact" : "Unsubscribe Contact"}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {isSubscribe
            ? "This will mark the contact as subscribed. They will receive broadcasts and automated messages."
            : "This will mark the contact as unsubscribed. They will stop receiving broadcasts and most automated messages."}
        </p>
      </div>

      <div className="flex items-center gap-3">
        <label className="relative inline-flex cursor-pointer items-center">
          <input
            type="checkbox"
            checked={data.confirmed || false}
            onChange={(e) => onChange({ ...data, confirmed: e.target.checked })}
            className="peer sr-only"
          />
          <div className="peer h-5 w-9 rounded-full bg-muted after:absolute after:left-[2px] after:top-[2px] after:h-4 after:w-4 after:rounded-full after:bg-card after:transition-all peer-checked:bg-muted0 peer-checked:after:translate-x-full peer-focus:ring-2 peer-focus:ring-ring" />
        </label>
        <div>
          <p className="text-sm font-medium text-foreground">I confirm this action</p>
          <p className="text-xs text-muted-foreground">
            This action will affect the contact&apos;s subscription status
          </p>
        </div>
      </div>
    </div>
  );
}

/* ───────── Human Takeover Config ───────── */
function HumanTakeoverConfig({ data, onChange }: ActionSubPanelProps) {
  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border bg-muted p-4">
        <p className="text-sm font-medium text-foreground">Hand off to a human agent</p>
        <p className="mt-1 text-xs text-muted-foreground">
          The flow will pause and the conversation will be marked for human takeover. Automation will stop until an agent resumes it.
        </p>
      </div>

      <div>
        <label className="mb-2 block text-xs font-semibold text-foreground">
          Internal note (optional)
        </label>
        <textarea
          value={data.message || ""}
          onChange={(e) => onChange({ ...data, message: e.target.value })}
          placeholder="Add context for the agent..."
          rows={3}
          className="w-full resize-none rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/60 focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
        />
        <p className="mt-1.5 text-xs text-muted-foreground">
          This message will be visible to agents as an internal note.
        </p>
      </div>
    </div>
  );
}

/* ───────── A/B Split Config ───────── */
function ABSplitConfig({ data, onChange }: ActionSubPanelProps) {
  const paths: Array<{ name: string; weight: number }> =
    (data.paths as Array<{ name: string; weight: number }> | undefined) || [
      { name: "A", weight: 50 },
      { name: "B", weight: 50 },
    ];
  const randomPath = (data as { randomPath?: boolean }).randomPath !== false;
  const total = paths.reduce((sum, p) => sum + (Number(p.weight) || 0), 0);
  const colors = ["bg-purple-500", "bg-blue-500", "bg-emerald-500", "bg-amber-500", "bg-rose-500", "bg-cyan-500"];

  const setPaths = (next: Array<{ name: string; weight: number }>) => onChange({ ...data, paths: next });
  const even = (n: number) => {
    const base = Math.floor(100 / n);
    return Array.from({ length: n }, (_, i) => base + (i === 0 ? 100 - base * n : 0));
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-foreground">
        Envía a cada contacto por una de las variaciones según su porcentaje. Úsalo para probar qué mensaje funciona
        mejor.
      </p>

      <div className="flex h-2.5 overflow-hidden rounded-full bg-muted">
        {paths.map((p, i) => (
          <div key={i} className={colors[i % colors.length]} style={{ width: `${total > 0 ? (p.weight / total) * 100 : 0}%` }} />
        ))}
      </div>

      <div className="space-y-2">
        {paths.map((path, i) => (
          <div key={i} className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2">
            <span className={cn("h-2.5 w-2.5 shrink-0 rounded-full", colors[i % colors.length])} />
            <span className="w-6 text-sm font-semibold">{path.name}</span>
            <input
              type="number"
              min={0}
              max={100}
              value={path.weight}
              onChange={(e) => {
                const w = Math.max(0, Math.min(100, parseInt(e.target.value) || 0));
                setPaths(paths.map((p, j) => (j === i ? { ...p, weight: w } : p)));
              }}
              className="w-16 rounded border border-border bg-card px-2 py-1 text-right text-sm"
            />
            <span className="text-sm text-muted-foreground">%</span>
            <span className="flex-1" />
            {paths.length > 2 && (
              <button
                type="button"
                onClick={() => {
                  const rest = paths.filter((_, j) => j !== i);
                  const w = even(rest.length);
                  setPaths(rest.map((p, j) => ({ name: String.fromCharCode(65 + j), weight: w[j] })));
                }}
                className="text-muted-foreground hover:text-red-500"
                aria-label="Quitar variación"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        ))}
      </div>

      {total !== 100 && <p className="text-xs font-medium text-red-500">La suma es {total}%. Debe ser 100%.</p>}

      <div className="flex gap-2">
        {paths.length < 6 && (
          <button
            type="button"
            onClick={() => {
              const w = even(paths.length + 1);
              setPaths([...paths, { name: "", weight: 0 }].map((p, j) => ({ name: String.fromCharCode(65 + j), weight: w[j] })));
            }}
            className="flex-1 rounded-lg border border-dashed border-purple-400 py-2 text-xs font-medium text-purple-600 hover:bg-purple-50 dark:hover:bg-purple-950/30"
          >
            + Variación
          </button>
        )}
        <button
          type="button"
          onClick={() => {
            const w = even(paths.length);
            setPaths(paths.map((p, j) => ({ ...p, weight: w[j] })));
          }}
          className="rounded-lg border border-border px-3 py-2 text-xs font-medium text-muted-foreground hover:bg-muted"
        >
          Repartir por igual
        </button>
      </div>

      <label className="flex items-start gap-2 rounded-lg border border-border p-3">
        <input
          type="checkbox"
          checked={randomPath}
          onChange={(e) => onChange({ ...data, randomPath: e.target.checked })}
          className="mt-0.5"
        />
        <span>
          <span className="block text-sm font-medium">Ruta aleatoria</span>
          <span className="block text-xs text-muted-foreground">
            Activado: cada vez que alguien pasa por aquí se elige una variación al azar. Desactivado: cada contacto
            recibe siempre la misma variación.
          </span>
        </span>
      </label>

      <p className="text-xs text-muted-foreground">En el lienzo, conecta cada variación (A, B…) a su propio paso.</p>
    </div>
  );
}

/* ───────── Smart Delay Config ───────── */
function SmartDelayConfig({ data, onChange }: ActionSubPanelProps) {
  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border bg-muted p-4">
        <p className="text-sm font-medium text-foreground">Smart Delay</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Pause the flow and wait for a user response. If no response is received within the timeout, continue to the next step.
        </p>
      </div>

      <div>
        <label className="mb-2 block text-xs font-semibold text-foreground">
          Timeout
        </label>
        <div className="flex gap-2">
          <input
            type="number"
            min={1}
            value={data.timeout || 30}
            onChange={(e) =>
              onChange({ ...data, timeout: Math.max(1, parseInt(e.target.value) || 1) })
            }
            className="w-24 rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
          />
          <select
            value={data.timeoutUnit || "minutes"}
            onChange={(e) => onChange({ ...data, timeoutUnit: e.target.value })}
            className="flex-1 rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
          >
            <option value="minutes">Minutes</option>
            <option value="hours">Hours</option>
            <option value="days">Days</option>
          </select>
        </div>
        <p className="mt-1.5 text-xs text-muted-foreground">
          If the user does not respond within this time, the flow will continue.
        </p>
      </div>
    </div>
  );
}

/* ───────── Recopilación de datos (ManyChat "Editar recopilación de datos") ───────── */
function CollectInputConfig({ data, onChange }: ActionSubPanelProps) {
  const d = data as unknown as Record<string, unknown>;
  const str = (k: string) => (typeof d[k] === "string" ? (d[k] as string) : "");
  const set = (patch: Record<string, unknown>) => onChange({ ...data, ...patch });
  const options = Array.isArray(d.options) ? (d.options as string[]) : [];
  const inputType = str("inputType") || "text";
  const expire = typeof d.expireMinutes === "number" ? (d.expireMinutes as number) : 0;
  const inputClass =
    "w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500";
  return (
    <div className="space-y-4">
      <div>
        <label className="mb-2 block text-xs font-semibold text-foreground">Pregunta</label>
        <textarea
          rows={3}
          maxLength={640}
          value={str("question")}
          onChange={(e) => set({ question: e.target.value })}
          placeholder="Introduce una pregunta…"
          className={inputClass}
        />
        <p className="mt-1 text-right text-[11px] text-muted-foreground">{640 - str("question").length}</p>
        <p className="text-xs text-muted-foreground">Nota: la automatización se pausa hasta que el contacto responde.</p>
      </div>

      <div>
        <label className="mb-2 block text-xs font-semibold text-foreground">Tipo de respuesta</label>
        <select value={inputType} onChange={(e) => set({ inputType: e.target.value })} className={inputClass}>
          <option value="text">Texto</option>
          <option value="email">Correo electrónico</option>
          <option value="phone">Teléfono</option>
          <option value="choice">Elección múltiple</option>
          <option value="number">Número</option>
          <option value="name">Nombre</option>
          <option value="first_name">Nombre (solo nombre)</option>
          <option value="last_name">Apellido</option>
          <option value="url">URL</option>
          <option value="date">Fecha</option>
          <option value="datetime">Fecha y hora</option>
        </select>
      </div>

      {inputType === "choice" && (
        <div>
          <label className="mb-2 block text-xs font-semibold text-foreground">Opciones</label>
          <div className="space-y-2">
            {options.map((o, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  value={o}
                  maxLength={20}
                  onChange={(e) => set({ options: options.map((x, j) => (j === i ? e.target.value : x)) })}
                  className={inputClass}
                />
                <button
                  type="button"
                  onClick={() => set({ options: options.filter((_, j) => j !== i) })}
                  className="text-muted-foreground hover:text-red-500"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ))}
            {options.length < 13 && (
              <button
                type="button"
                onClick={() => set({ options: [...options, ""] })}
                className="text-xs font-medium text-emerald-600 hover:underline"
              >
                + Añadir opción
              </button>
            )}
          </div>
        </div>
      )}

      <div>
        <label className="mb-2 block text-xs font-semibold text-foreground">Guardar respuesta en una variable</label>
        <input
          value={str("variableName")}
          onChange={(e) => set({ variableName: e.target.value.replace(/[^\w]/g, "_") })}
          placeholder="respuesta"
          className={inputClass}
        />
        <p className="mt-1.5 text-xs text-muted-foreground">
          Úsala en mensajes como {"{{"}{str("variableName") || "respuesta"}{"}}"}.
        </p>
      </div>
      <div>
        <label className="mb-2 block text-xs font-semibold text-foreground">Guardar respuesta en un campo personalizado</label>
        <input
          value={str("fieldSlug")}
          onChange={(e) => set({ fieldSlug: e.target.value })}
          placeholder="slug del campo (opcional)"
          className={inputClass}
        />
      </div>
      <div>
        <label className="mb-2 block text-xs font-semibold text-foreground">Mensaje si la respuesta no es válida</label>
        <input
          value={str("retryText")}
          onChange={(e) => set({ retryText: e.target.value })}
          placeholder="Se usa un mensaje automático si lo dejas vacío"
          className={inputClass}
        />
      </div>
      <div>
        <label className="mb-2 block text-xs font-semibold text-foreground">Si el contacto no ha respondido</label>
        <select
          value={String(expire)}
          onChange={(e) => set({ expireMinutes: Number(e.target.value) })}
          className={inputClass}
        >
          <option value="0">Esperar sin límite</option>
          <option value="30">La recopilación expira en 30 minutos</option>
          <option value="60">La recopilación expira en 1 hora</option>
          <option value="360">La recopilación expira en 6 horas</option>
          <option value="1440">La recopilación expira en 24 horas</option>
        </select>
      </div>
    </div>
  );
}
