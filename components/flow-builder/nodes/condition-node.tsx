"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Filter } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ConditionNodeProps {
  label?: string;
  conditions?: Array<{ field: string; operator: string; value: string; fieldSlug?: string }>;
  logic?: "and" | "or";
}

const FIELD: Record<string, string> = {
  tag: "Etiqueta",
  email: "Correo",
  sequence: "Secuencia",
  current_time: "Hora actual",
  first_name: "Nombre",
  full_name: "Nombre completo",
  username: "Usuario",
  custom_field: "Campo",
  variable: "Variable",
};

const OP: Record<string, string> = {
  has: "tiene",
  has_not: "no tiene",
  equals: "es",
  not_equals: "no es",
  contains: "contiene",
  not_contains: "no contiene",
  starts_with: "empieza con",
  exists: "tiene valor",
  not_exists: "está vacío",
  gt: ">",
  lt: "<",
  gte: "después de",
};

/** ManyChat-style condition card with "Sí" and "No" connectors on the right. */
export function ConditionNode({ data, selected }: NodeProps) {
  const nodeData = data as ConditionNodeProps;
  const conditions = nodeData.conditions || [];
  const logic = nodeData.logic || "and";

  return (
    <div className={cn("w-60 rounded-2xl border bg-card shadow-sm", selected ? "border-sky-500 shadow-md" : "border-border")}>
      <Handle type="target" position={Position.Left} className="!h-3 !w-3 !border-2 !border-border !bg-white" />
      <div className="flex items-center gap-2 rounded-t-2xl bg-cyan-200 px-3 py-2 text-cyan-950 dark:bg-cyan-800 dark:text-cyan-50">
        <Filter className="h-3.5 w-3.5" />
        <p className="text-sm font-semibold">{nodeData.label || "Condición"}</p>
      </div>
      <div className="space-y-1 p-3">
        {conditions.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border px-3 py-2 text-center text-xs text-muted-foreground">Haga clic para añadir una condición</p>
        ) : (
          conditions.slice(0, 3).map((c, i) => (
            <p key={i} className="truncate rounded-lg bg-sky-50 px-2.5 py-1.5 text-xs text-sky-900 dark:bg-sky-950/30 dark:text-sky-200">
              {i > 0 && <b className="mr-1 uppercase">{logic === "and" ? "y" : "o"}</b>}
              {FIELD[c.field] ?? c.field}
              {c.fieldSlug ? ` ${c.fieldSlug}` : ""} {OP[c.operator] ?? c.operator} {c.value}
            </p>
          ))
        )}
      </div>
      <div className="relative flex items-center justify-end border-t border-border px-3 py-2">
        <span className="text-[11px] font-medium text-emerald-600">Sí</span>
        <Handle type="source" id="yes" position={Position.Right} className="!-right-1.5 !h-3 !w-3 !border-2 !border-emerald-500 !bg-white" />
      </div>
      <div className="relative flex items-center justify-end border-t border-border px-3 py-2">
        <span className="text-[11px] font-medium text-red-500">No</span>
        <Handle type="source" id="no" position={Position.Right} className="!-right-1.5 !h-3 !w-3 !border-2 !border-red-500 !bg-white" />
      </div>
    </div>
  );
}
