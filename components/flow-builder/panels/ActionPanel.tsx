"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { SmartDelayData } from "@/lib/smart-delay";
import { Plus, X, LogIn } from "lucide-react";
import { FlowPickerModal } from "./FlowPickerModal";
import { cn } from "@/lib/utils";
import type { NodeType } from "@/lib/types/database";
import { useReactFlow } from "@xyflow/react";
import { EnrollSequencePanel } from "./EnrollSequencePanel";
import { NextStepPicker } from "./NextStepPicker";
import { randomizerColor, randomizerLetter } from "../randomizer-colors";

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
  nodeId?: string;
}

interface ActionSubPanelProps {
  data: ActionPanelData;
  onChange: (data: Record<string, unknown>) => void;
}

export function ActionPanel({ data: rawData, onChange, nodeId }: ActionPanelProps) {
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
      return <GoToFlowConfig data={data} onChange={onChange} nodeId={nodeId ?? ""} />;
    case "subscribe":
    case "unsubscribe":
      return <SubscribeConfig data={data} onChange={onChange} />;
    case "humanTakeover":
      return <HumanTakeoverConfig data={data} onChange={onChange} />;
    case "abSplit":
      return <ABSplitConfig data={data} onChange={onChange} nodeId={nodeId ?? ""} />;
    case "smartDelay":
      return <SmartDelayConfig data={data} onChange={onChange} nodeId={nodeId ?? ""} />;
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
function GoToFlowConfig({ data, onChange, nodeId }: ActionSubPanelProps & { nodeId: string }) {
  const [picking, setPicking] = useState(false);
  const flowName = (data as { flowName?: string }).flowName;
  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={() => setPicking(true)}
        className="flex w-full flex-col items-center gap-2 border-b border-border pb-5 pt-2 text-center"
      >
        {!data.flowId && <span className="self-start text-red-500">⚠</span>}
        <LogIn className="h-6 w-6 text-foreground" />
        <span className={cn("max-w-full truncate text-sm", data.flowId ? "font-medium" : "text-muted-foreground")}>
          {data.flowId ? flowName || "Automatización seleccionada" : "Haz clic para seleccionar Automatización"}
        </span>
      </button>
      <NextStepPicker nodeId={nodeId} variant="button" />
      <FlowPickerModal
        open={picking}
        onClose={() => setPicking(false)}
        onPick={(f) => {
          onChange({ ...data, flowId: f.id, flowName: f.name });
          setPicking(false);
        }}
      />
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
function ABSplitConfig({ data, onChange, nodeId }: ActionSubPanelProps & { nodeId: string }) {
  const { setEdges } = useReactFlow();
  const paths: Array<{ name: string; weight: number }> =
    (data.paths as Array<{ name: string; weight: number }> | undefined) || [
      { name: "A", weight: 50 },
      { name: "B", weight: 50 },
    ];
  const randomPath = (data as { randomPath?: boolean }).randomPath === true;
  const total = paths.reduce((sum, p) => sum + (Number(p.weight) || 0), 0);
  const error =
    paths.length < 2
      ? "Por favor, añade al menos 2 variaciones"
      : total !== 100
        ? "Las rutas deben sumar hasta 100%. Ajusta tu distribución."
        : null;

  const relabel = (list: Array<{ name: string; weight: number }>) =>
    list.map((p, i) => ({ ...p, name: randomizerLetter(i) }));
  const even = (n: number) => {
    const base = Math.floor(100 / n);
    return Array.from({ length: n }, (_, i) => (i === n - 1 ? 100 - base * (n - 1) : base));
  };

  function addVariation() {
    const n = paths.length + 1;
    const wasEven =
      total === 100 && paths.every((p, i) => p.weight === even(paths.length)[i]);
    const next = wasEven
      ? even(n).map((w, i) => ({ name: randomizerLetter(i), weight: w }))
      : relabel([...paths, { name: "", weight: Math.max(0, 100 - total) }]);
    onChange({ ...data, paths: next });
  }

  function removeVariation(index: number) {
    onChange({ ...data, paths: relabel(paths.filter((_, i) => i !== index)) });
    // Keep every remaining variation connected to its own step.
    setEdges((eds) =>
      eds
        .filter((e) => !(e.source === nodeId && e.sourceHandle === `split-${index}`))
        .map((e) => {
          const m = e.source === nodeId && e.sourceHandle?.match(/^split-(\d+)$/);
          if (m && Number(m[1]) > index) return { ...e, sourceHandle: `split-${Number(m[1]) - 1}` };
          return e;
        })
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm font-semibold text-foreground">Dividir el tráfico</p>

      <div className="flex items-center gap-2">
        <button
          type="button"
          role="switch"
          aria-checked={randomPath}
          onClick={() => onChange({ ...data, randomPath: !randomPath })}
          className={cn(
            "relative h-4 w-7 shrink-0 rounded-full transition-colors",
            randomPath ? "bg-blue-600" : "bg-neutral-700"
          )}
        >
          <span
            className={cn(
              "absolute top-0.5 h-3 w-3 rounded-full bg-white transition-all",
              randomPath ? "left-3.5" : "left-0.5"
            )}
          />
        </button>
        <span className="text-sm text-foreground">Elige una ruta al azar cada vez</span>
        <span
          className="flex h-3.5 w-3.5 cursor-help items-center justify-center rounded-full border border-muted-foreground text-[9px] text-muted-foreground"
          title="Si está marcado, el contacto seguirá una ruta aleatoria cada vez que alcance este paso. De lo contrario, el contacto siempre seguirá la misma ruta (ideal para las pruebas A/B, concursos y loterías)."
        >
          ?
        </span>
      </div>

      <div>
        <div
          className={cn(
            "flex items-center justify-between rounded-md border px-3 py-2 text-sm",
            error ? "border-red-500 bg-red-50 dark:bg-red-950/30" : "border-border"
          )}
        >
          <span>Tráfico asignado</span>
          <span className={error ? "text-red-600" : ""}>{total}%</span>
        </div>
        {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
      </div>

      <div className="space-y-3">
        {paths.map((path, i) => {
          const color = randomizerColor(i);
          return (
            <div key={i} className="group relative rounded-lg border border-border px-3 pb-3 pt-4">
              <button
                type="button"
                onClick={() => removeVariation(i)}
                className="absolute right-1.5 top-1.5 hidden rounded p-0.5 text-muted-foreground hover:text-foreground group-hover:block"
                aria-label="Eliminar variación"
              >
                <X className="h-4 w-4" />
              </button>
              <div className="mb-3 flex items-center gap-3">
                <span className="w-4 text-base font-semibold" style={{ color }}>
                  {randomizerLetter(i)}
                </span>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={1}
                  value={path.weight}
                  onChange={(e) =>
                    onChange({
                      ...data,
                      paths: paths.map((p, j) => (j === i ? { ...p, weight: parseInt(e.target.value) || 0 } : p)),
                    })
                  }
                  className="flex-1"
                  style={{ accentColor: color }}
                />
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={3}
                  aria-label="Valor"
                  value={String(path.weight)}
                  onChange={(e) => {
                    const w = Math.max(0, Math.min(100, parseInt(e.target.value.replace(/\D/g, "")) || 0));
                    onChange({ ...data, paths: paths.map((p, j) => (j === i ? { ...p, weight: w } : p)) });
                  }}
                  className={cn(
                    "w-12 rounded-md border bg-card px-2 py-1 text-right text-sm",
                    error && paths.length >= 2 ? "border-red-500" : "border-border"
                  )}
                />
                <span className="text-sm text-muted-foreground">%</span>
              </div>
              <NextStepPicker nodeId={nodeId} handle={`split-${i}`} variant="button" />
            </div>
          );
        })}
      </div>

      <button
        type="button"
        onClick={addVariation}
        className="w-full rounded-lg border border-dashed border-sky-400 py-2.5 text-sm text-muted-foreground hover:bg-sky-50 dark:hover:bg-sky-950/30"
      >
        + Nueva variación
      </button>
    </div>
  );
}

/* ───────── Smart Delay Config ───────── */
function SmartDelayConfig({ data, onChange, nodeId }: ActionSubPanelProps & { nodeId: string }) {
  const d = data as unknown as SmartDelayData & Record<string, unknown>;
  const set = (patch: Partial<SmartDelayData>) => {
    // The account time zone comes from the browser of whoever edits the step.
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    onChange({ ...data, ...patch, tz });
  };
  const mode = d.mode ?? "duration";
  const schedule = d.schedule ?? {};
  const days = schedule.days && schedule.days.length ? schedule.days : [0, 1, 2, 3, 4, 5, 6];
  const [fields, setFields] = useState<Array<{ slug: string; name: string }>>([]);
  useEffect(() => {
    if (mode !== "date" || d.dateMode !== "dynamic") return;
    createClient()
      .from("custom_field_definitions")
      .select("slug, name")
      .order("name")
      .then(({ data: rows }) => setFields((rows as Array<{ slug: string; name: string }>) ?? []));
  }, [mode, d.dateMode]);
  const field = "rounded-md border border-border bg-card px-3 py-2 text-sm focus:border-blue-500 focus:outline-none";
  const hours = Array.from({ length: 24 }, (_, h) => h);
  const dayPreset = days.length === 7 ? "any" : days.join(",") === "1,2,3,4,5" ? "weekdays" : days.join(",") === "0,6" ? "weekend" : "custom";
  const DAY_NAMES = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

  return (
    <div className="space-y-5">
      <div className="flex justify-center">
        <div className="flex rounded-full bg-muted p-1 text-sm">
          {(["duration", "date"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => set({ mode: m })}
              className={cn("rounded-full px-4 py-1", mode === m ? "bg-card font-medium shadow-sm" : "text-muted-foreground")}
            >
              {m === "duration" ? "Duración" : "Fecha"}
            </button>
          ))}
        </div>
      </div>

      {mode === "duration" ? (
        <>
          <div>
            <p className="mb-2 text-sm">Esperar</p>
            <div className="flex gap-2">
              <input
                type="number"
                min={1}
                value={d.duration ?? 1}
                onChange={(e) => set({ duration: Math.max(1, parseInt(e.target.value) || 1) })}
                className={cn(field, "w-0 flex-[2]")}
              />
              <select value={d.unit ?? "hours"} onChange={(e) => set({ unit: e.target.value as SmartDelayData["unit"] })} className={cn(field, "flex-1")}>
                <option value="seconds">Segundos</option>
                <option value="minutes">Minutos</option>
                <option value="hours">Horas</option>
                <option value="days">Días</option>
              </select>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">Ingresa un número para el tiempo de espera. Máximo 365 días.</p>
          </div>

          <div>
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm">Enviar dentro de un horario específico</p>
              <button
                type="button"
                role="switch"
                aria-checked={!!schedule.enabled}
                onClick={() => set({ schedule: { from: 8, to: 22, ...schedule, enabled: !schedule.enabled } })}
                className={cn("relative h-4 w-7 shrink-0 rounded-full", schedule.enabled ? "bg-blue-600" : "bg-neutral-700")}
              >
                <span className={cn("absolute top-0.5 h-3 w-3 rounded-full bg-white transition-all", schedule.enabled ? "left-3.5" : "left-0.5")} />
              </button>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Se envía cuando la hora local del contacto se encuentra dentro del rango de horas que hayas configurado. Si se
              desconoce la zona horaria del contacto, se utilizará la de tu cuenta.
            </p>
            {schedule.enabled && (
              <div className="mt-3 space-y-2">
                <div className="flex items-center gap-2">
                  <select
                    value={schedule.from ?? 8}
                    onChange={(e) => set({ schedule: { ...schedule, from: Number(e.target.value) } })}
                    className={cn(field, "flex-1")}
                  >
                    {hours.map((h) => (
                      <option key={h} value={h}>
                        {h}:00
                      </option>
                    ))}
                  </select>
                  <span>-</span>
                  <select
                    value={schedule.to ?? 22}
                    onChange={(e) => set({ schedule: { ...schedule, to: Number(e.target.value) } })}
                    className={cn(field, "flex-1")}
                  >
                    {[...hours.slice(1), 0].map((h) => (
                      <option key={h} value={h}>
                        {h}:00
                      </option>
                    ))}
                  </select>
                </div>
                <select
                  value={dayPreset}
                  onChange={(e) => {
                    const v = e.target.value;
                    const next = v === "any" ? [0, 1, 2, 3, 4, 5, 6] : v === "weekdays" ? [1, 2, 3, 4, 5] : v === "weekend" ? [0, 6] : days;
                    set({ schedule: { ...schedule, days: next } });
                  }}
                  className={cn(field, "w-full")}
                >
                  <option value="any">Cualquier día</option>
                  <option value="weekdays">De lunes a viernes</option>
                  <option value="weekend">Sábado y domingo</option>
                  <option value="custom">Elegir días…</option>
                </select>
                {dayPreset === "custom" && (
                  <div className="flex flex-wrap gap-1.5">
                    {[1, 2, 3, 4, 5, 6, 0].map((x) => (
                      <button
                        key={x}
                        type="button"
                        onClick={() => {
                          const next = days.includes(x) ? days.filter((y) => y !== x) : [...days, x];
                          if (next.length) set({ schedule: { ...schedule, days: next.sort() } });
                        }}
                        className={cn(
                          "rounded-full border px-2.5 py-0.5 text-xs",
                          days.includes(x) ? "border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-950/40" : "border-border"
                        )}
                      >
                        {DAY_NAMES[x].slice(0, 3)}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </>
      ) : (
        <div className="space-y-2">
          <p className="text-sm">Esperar hasta</p>
          <select value={d.dateMode ?? "specific"} onChange={(e) => set({ dateMode: e.target.value as SmartDelayData["dateMode"] })} className={cn(field, "w-full")}>
            <option value="specific">Fecha específica</option>
            <option value="dynamic">Fecha dinámica</option>
          </select>
          {(d.dateMode ?? "specific") === "specific" ? (
            <input
              type="datetime-local"
              value={d.date ?? ""}
              onChange={(e) => set({ date: e.target.value })}
              placeholder="Selecciona una fecha y una hora"
              className={cn(field, "w-full")}
            />
          ) : (
            <select value={d.dateField ?? ""} onChange={(e) => set({ dateField: e.target.value })} className={cn(field, "w-full")}>
              <option value="">Selecciona un campo con fecha</option>
              {fields.map((f) => (
                <option key={f.slug} value={f.slug}>
                  {f.name}
                </option>
              ))}
            </select>
          )}
          <p className="text-xs text-muted-foreground">
            La automatización se detiene aquí si la fecha ya ha pasado. Utilizamos la zona horaria del contacto o la de tu cuenta
            si se desconoce la del contacto.
          </p>
        </div>
      )}

      <NextStepPicker nodeId={nodeId} variant="button" />
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
