"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

export interface AiResponseNodeProps {
  label?: string;
  systemPrompt?: string;
  goal?: string;
  model?: string;
}

/** ManyChat "AI Step" card: Instagram · AI Step, its objective and "Siguiente paso". */
export function AiResponseNode({ data, selected }: NodeProps) {
  const d = data as AiResponseNodeProps;
  const summary = d.goal || d.systemPrompt;

  return (
    <div
      className={cn(
        "w-56 rounded-2xl border bg-card shadow-sm transition-shadow",
        selected ? "border-emerald-500 shadow-md" : "border-border"
      )}
    >
      <Handle type="target" position={Position.Left} className="!h-3 !w-3 !border-2 !border-border !bg-white" />
      <div className="flex items-center gap-2 px-3 pt-3">
        <span className="relative flex h-7 w-7 items-center justify-center">
          <Sparkles className="h-4 w-4" />
          <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-gradient-to-br from-fuchsia-500 to-orange-400" />
        </span>
        <div className="min-w-0">
          <p className="text-[10px] leading-none text-muted-foreground">Instagram</p>
          <p className="truncate text-sm font-semibold">{d.label || "AI Step"}</p>
        </div>
      </div>
      <div className="p-3">
        <div className="rounded-xl bg-muted/60 px-3 py-2 text-xs">
          {summary ? (
            <p className="line-clamp-3">{summary}</p>
          ) : (
            <p className="text-center text-muted-foreground">Definir instrucciones para el AI Step</p>
          )}
        </div>
      </div>
      <div className="relative flex items-center justify-end px-3 pb-2">
        <span className="text-[10px] text-muted-foreground">Siguiente paso</span>
        <Handle type="source" position={Position.Right} className="!-right-1.5 !h-3 !w-3 !border-2 !border-border !bg-white" />
      </div>
    </div>
  );
}
