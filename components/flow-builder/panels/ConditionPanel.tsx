"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Condition step laid out like ManyChat's: "El contacto coincide con todas /
 * cualquiera de las siguientes condiciones", "+ Condición" with field groups,
 * and the Yes/No connectors on the canvas.
 */

interface Condition {
  field: string;
  operator: string;
  value: string;
  fieldSlug?: string;
  timezone?: string;
}

interface ConditionPanelProps {
  data: Record<string, unknown>;
  onChange: (data: Record<string, unknown>) => void;
}

const GROUPS: Array<{ label: string; fields: Array<{ id: string; label: string }> }> = [
  {
    label: "Recomendado",
    fields: [
      { id: "tag", label: "Etiqueta" },
      { id: "email", label: "Correo electrónico" },
    ],
  },
  {
    label: "Filtros generales",
    fields: [
      { id: "sequence", label: "Suscripción de secuencia" },
      { id: "current_time", label: "Hora actual" },
    ],
  },
  {
    label: "Campos del sistema",
    fields: [
      { id: "first_name", label: "Nombre" },
      { id: "full_name", label: "Nombre completo" },
      { id: "username", label: "Nombre de usuario" },
    ],
  },
  {
    label: "Campos personalizados y variables",
    fields: [
      { id: "custom_field", label: "Campo personalizado" },
      { id: "variable", label: "Variable" },
    ],
  },
];

const FIELD_LABEL: Record<string, string> = Object.fromEntries(
  GROUPS.flatMap((g) => g.fields.map((f) => [f.id, f.label])),
);

const TEXT_OPERATORS = [
  { value: "equals", label: "es" },
  { value: "not_equals", label: "no es" },
  { value: "contains", label: "contiene" },
  { value: "not_contains", label: "no contiene" },
  { value: "starts_with", label: "empieza con" },
  { value: "exists", label: "tiene algún valor" },
  { value: "not_exists", label: "está vacío" },
  { value: "gt", label: "mayor que" },
  { value: "lt", label: "menor que" },
];

const inputClass =
  "w-full rounded-lg border border-border bg-card px-2.5 py-1.5 text-sm text-foreground focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500";

export function ConditionPanel({ data, onChange }: ConditionPanelProps) {
  const conditions = (Array.isArray(data.conditions) ? data.conditions : []) as Condition[];
  const logic = data.logic === "or" ? "or" : "and";
  const [picking, setPicking] = useState(conditions.length === 0);
  const [group, setGroup] = useState(0);
  const [sequences, setSequences] = useState<Array<{ id: string; name: string }>>([]);
  const [fields, setFields] = useState<Array<{ slug: string; name: string }>>([]);

  useEffect(() => {
    import("@/lib/supabase/client").then(async ({ createClient }) => {
      const supabase = createClient();
      const [{ data: rows }, { data: defs }] = await Promise.all([
        supabase.from("sequences").select("id, name").order("name"),
        supabase.from("custom_field_definitions").select("slug, name").order("name"),
      ]);
      setSequences(rows ?? []);
      setFields((defs as Array<{ slug: string; name: string }>) ?? []);
    });
  }, []);

  const set = (next: Condition[]) => onChange({ ...data, conditions: next });
  const update = (i: number, patch: Partial<Condition>) => set(conditions.map((c, j) => (j === i ? { ...c, ...patch } : c)));

  function add(field: string, fieldSlug?: string) {
    const base: Condition = fieldSlug
      ? { field: "custom_field", fieldSlug, operator: "equals", value: "" }
      :
      field === "tag" || field === "sequence"
        ? { field, operator: "has", value: "" }
        : field === "current_time"
          ? { field, operator: "gte", value: "09:00", timezone: Intl.DateTimeFormat().resolvedOptions().timeZone }
          : { field, operator: "equals", value: "" };
    set([...conditions, base]);
    setPicking(false);
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-foreground">
        El contacto coincide con{" "}
        <button
          type="button"
          onClick={() => onChange({ ...data, logic: logic === "and" ? "or" : "and" })}
          className="font-medium text-sky-600 underline decoration-dotted underline-offset-2"
        >
          {logic === "and" ? "todas las siguientes condiciones" : "cualquiera de las siguientes condiciones"}
        </button>
        ?
      </p>

      {conditions.map((c, i) => (
        <div key={i}>
          {i > 0 && (
            <p className="mb-2 text-center text-[11px] font-semibold uppercase text-muted-foreground">
              {logic === "and" ? "y" : "o"}
            </p>
          )}
          <div className="rounded-xl border border-sky-200 bg-sky-50/40 p-3 dark:border-sky-900 dark:bg-sky-950/20">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-semibold text-foreground">
                {c.field === "custom_field" && c.fieldSlug
                  ? fields.find((f) => f.slug === c.fieldSlug)?.name ?? c.fieldSlug
                  : FIELD_LABEL[c.field] ?? c.field}
              </span>
              <button type="button" onClick={() => set(conditions.filter((_, j) => j !== i))} className="text-muted-foreground hover:text-red-500">
                <X className="h-4 w-4" />
              </button>
            </div>

            {(c.field === "tag" || c.field === "sequence") && (
              <div className="space-y-2">
                <select value={c.operator === "has_not" ? "has_not" : "has"} onChange={(e) => update(i, { operator: e.target.value })} className={inputClass}>
                  <option value="has">{c.field === "tag" ? "tiene la etiqueta" : "está suscrito a"}</option>
                  <option value="has_not">{c.field === "tag" ? "no tiene la etiqueta" : "no está suscrito a"}</option>
                </select>
                {c.field === "tag" ? (
                  <input value={c.value} onChange={(e) => update(i, { value: e.target.value })} placeholder="Nombre de la etiqueta" className={inputClass} />
                ) : (
                  <select value={c.value} onChange={(e) => update(i, { value: e.target.value })} className={inputClass}>
                    <option value="">Elegir secuencia…</option>
                    {sequences.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            )}

            {c.field === "current_time" && (
              <div className="flex gap-2">
                <select value={c.operator === "lt" ? "lt" : "gte"} onChange={(e) => update(i, { operator: e.target.value })} className={inputClass}>
                  <option value="gte">es después de</option>
                  <option value="lt">es antes de</option>
                </select>
                <input type="time" value={c.value} onChange={(e) => update(i, { value: e.target.value })} className={inputClass} />
              </div>
            )}

            {!["tag", "sequence", "current_time"].includes(c.field) && (
              <div className="space-y-2">
                {c.field === "custom_field" && !c.fieldSlug && (
                  <select value="" onChange={(e) => update(i, { fieldSlug: e.target.value })} className={inputClass}>
                    <option value="">Elegir campo…</option>
                    {fields.map((f) => (
                      <option key={f.slug} value={f.slug}>
                        {f.name}
                      </option>
                    ))}
                  </select>
                )}
                {c.field === "variable" && (
                  <input
                    value={c.fieldSlug ?? ""}
                    onChange={(e) => update(i, { fieldSlug: e.target.value })}
                    placeholder="Nombre de la variable (ej: email)"
                    className={inputClass}
                  />
                )}
                <select value={c.operator} onChange={(e) => update(i, { operator: e.target.value })} className={inputClass}>
                  {TEXT_OPERATORS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
                {!["exists", "not_exists"].includes(c.operator) && (
                  <input value={c.value} onChange={(e) => update(i, { value: e.target.value })} placeholder="Valor" className={inputClass} />
                )}
              </div>
            )}
          </div>
        </div>
      ))}

      {picking ? (
        <div className="overflow-hidden rounded-xl border border-border">
          <div className="flex">
            <div className="w-40 shrink-0 border-r border-border bg-muted/40 p-1">
              {GROUPS.map((g, gi) => (
                <button
                  key={g.label}
                  type="button"
                  onClick={() => setGroup(gi)}
                  className={cn("w-full rounded-md px-2 py-1.5 text-left text-xs", group === gi ? "bg-card font-medium" : "text-muted-foreground")}
                >
                  {g.label}
                </button>
              ))}
            </div>
            <div className="flex-1 p-1">
              {group === GROUPS.length - 1 ? (
                <>
                  {fields.map((f) => (
                    <button
                      key={f.slug}
                      type="button"
                      onClick={() => add("custom_field", f.slug)}
                      className="w-full rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted"
                    >
                      {f.name}
                    </button>
                  ))}
                  {fields.length === 0 && <p className="px-2 py-1.5 text-xs text-muted-foreground">Todavía no tienes campos</p>}
                  <button type="button" onClick={() => add("variable")} className="w-full rounded-md px-2 py-1.5 text-left text-sm text-muted-foreground hover:bg-muted">
                    Variable…
                  </button>
                </>
              ) : (
                GROUPS[group].fields.map((f) => (
                  <button key={f.id} type="button" onClick={() => add(f.id)} className="w-full rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted">
                    {f.label}
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setPicking(true)}
          className="w-full rounded-xl border border-dashed border-sky-400 py-2 text-sm font-medium text-sky-600 hover:bg-sky-50 dark:hover:bg-sky-950/30"
        >
          + Condición
        </button>
      )}

      <p className="text-xs text-muted-foreground">
        En el lienzo, conecta la salida <b>Sí</b> y la salida <b>No</b> a lo que debe pasar en cada caso.
      </p>
    </div>
  );
}
