"use client";

import { useReactFlow, type NodeProps } from "@xyflow/react";
import { StickyNote } from "lucide-react";

/** "Comentario" from ManyChat's Extras: a sticky note on the canvas. Never runs. */
export function NoteNode({ id, data }: NodeProps) {
  const { updateNodeData } = useReactFlow();
  const text = typeof (data as { text?: unknown }).text === "string" ? (data as { text: string }).text : "";
  return (
    <div className="w-56 rounded-lg border border-amber-300 bg-amber-100 p-2 shadow-sm dark:border-amber-700 dark:bg-amber-900/40">
      <div className="mb-1 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-300">
        <StickyNote className="h-3 w-3" /> Comentario
      </div>
      <textarea
        value={text}
        onChange={(e) => updateNodeData(id, { text: e.target.value })}
        placeholder="Escribe una nota…"
        rows={4}
        className="nodrag w-full resize-none bg-transparent text-xs text-amber-950 placeholder:text-amber-700/60 focus:outline-none dark:text-amber-50"
      />
    </div>
  );
}
