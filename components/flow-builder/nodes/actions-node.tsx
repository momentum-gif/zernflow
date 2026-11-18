"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { actionTitle } from "../panels/ActionsListPanel";

/** ManyChat-style "Acciones" step: a card listing the actions it performs. */
export function ActionsNode({ data, selected }: NodeProps) {
  const actions = (Array.isArray((data as { actions?: unknown }).actions)
    ? (data as { actions: Array<{ type: string; tagName?: string; fieldSlug?: string }> }).actions
    : []) as Array<{ type: string; tagName?: string; fieldSlug?: string }>;
  const label = (data as { label?: string }).label || "Acciones";

  return (
    <div
      className={cn(
        "w-60 rounded-2xl border bg-card shadow-sm",
        selected ? "border-amber-500 shadow-md" : "border-border",
      )}
    >
      <Handle type="target" position={Position.Left} className="!h-3 !w-3 !border-2 !border-border !bg-white" />
      <div className="flex items-center gap-2 rounded-t-2xl bg-amber-200 px-3 py-2 text-amber-950 dark:bg-amber-800 dark:text-amber-50">
        <Zap className="h-3.5 w-3.5" />
        <p className="text-sm font-semibold">{label}</p>
      </div>
      <div className="space-y-1 p-3">
        {actions.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border px-3 py-2 text-center text-xs text-muted-foreground">
            Haga clic para añadir una acción
          </div>
        ) : (
          actions.map((a, i) => (
            <div key={i} className="truncate rounded-lg bg-amber-50 px-2.5 py-1.5 text-xs text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
              {actionTitle(a.type)}
              {a.tagName ? `: ${a.tagName}` : a.fieldSlug ? `: ${a.fieldSlug}` : ""}
            </div>
          ))
        )}
      </div>
      <div className="relative flex items-center justify-end border-t border-border px-3 py-2">
        <span className="text-[10px] text-muted-foreground">Siguiente paso</span>
        <Handle type="source" position={Position.Right} className="!-right-1.5 !h-3 !w-3 !border-2 !border-border !bg-white" />
      </div>
    </div>
  );
}
