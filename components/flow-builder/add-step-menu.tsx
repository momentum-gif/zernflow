"use client";

import { useState } from "react";
import { useReactFlow } from "@xyflow/react";
import {
  ArrowRightLeft,
  Filter,
  Hourglass,
  Instagram,
  Minus,
  Play,
  Plus,
  Shuffle,
  Sparkles,
  StickyNote,
  Wand2,
  Zap,
} from "lucide-react";
import { getDefaultData, getNodeId } from "./flow-node-defaults";

/**
 * ManyChat's canvas controls: the blue "+" (Paso inicial / Contenido / IA /
 * Lógico / Extras), auto-arrange, zoom, and the "Tocar un paso para editar" hint.
 */
const GROUPS: Array<{
  title: string;
  items: Array<{ label: string; type: string; actionType?: string; icon: typeof Zap; color: string }>;
}> = [
  { title: "Paso inicial", items: [{ label: "Disparador", type: "trigger", icon: Play, color: "text-emerald-600" }] },
  {
    title: "Contenido",
    items: [
      { label: "Instagram", type: "sendMessage", icon: Instagram, color: "text-fuchsia-600" },
      { label: "Iniciar Automatización", type: "action", actionType: "goToFlow", icon: ArrowRightLeft, color: "text-lime-600" },
    ],
  },
  { title: "IA", items: [{ label: "AI Step", type: "aiResponse", icon: Sparkles, color: "text-violet-600" }] },
  {
    title: "Lógico",
    items: [
      { label: "Acciones", type: "actions", icon: Zap, color: "text-amber-500" },
      { label: "Condición", type: "condition", icon: Filter, color: "text-sky-600" },
      { label: "Aleatorizador", type: "action", actionType: "abSplit", icon: Shuffle, color: "text-purple-600" },
      { label: "Pausa inteligente", type: "action", actionType: "smartDelay", icon: Hourglass, color: "text-red-500" },
    ],
  },
  { title: "Extras", items: [{ label: "Comentario", type: "note", icon: StickyNote, color: "text-amber-600" }] },
];

export function CanvasControls({
  wrapper,
  onAdded,
  onArrange,
}: {
  wrapper: React.RefObject<HTMLDivElement | null>;
  onAdded: (id: string) => void;
  onArrange: () => void;
}) {
  const [open, setOpen] = useState(false);
  const { setNodes, screenToFlowPosition, zoomIn, zoomOut } = useReactFlow();

  function add(type: string, actionType?: string) {
    const rect = wrapper.current?.getBoundingClientRect();
    const center = screenToFlowPosition({
      x: (rect?.left ?? 0) + (rect?.width ?? 800) / 2 - 120,
      y: (rect?.top ?? 0) + (rect?.height ?? 600) / 2 - 80,
    });
    const id = getNodeId();
    setNodes((nds) => [...nds, { id, type, position: center, data: getDefaultData(type, actionType) }]);
    setOpen(false);
    onAdded(id);
  }

  const round = "flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground shadow-sm hover:bg-muted";

  return (
    <>
      <div className="pointer-events-none absolute inset-x-0 top-3 z-10 flex justify-center">
        <span className="rounded-md bg-muted px-3 py-1 text-xs text-muted-foreground shadow-sm">👇 Toca un paso para editarlo</span>
      </div>

      <div className="absolute right-4 top-4 z-20 flex flex-col items-end gap-3">
        <button
          onClick={() => setOpen((o) => !o)}
          className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-600 text-white shadow-lg hover:bg-blue-700"
          aria-label="Añadir paso"
        >
          <Plus className="h-6 w-6" />
        </button>
        {open && (
          <>
            <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
            <div className="absolute right-0 top-14 z-40 max-h-[70vh] w-80 overflow-y-auto rounded-xl border border-border bg-card p-4 shadow-2xl">
              {GROUPS.map((g) => (
                <div key={g.title} className="mb-4 last:mb-0">
                  <p className="mb-2 text-sm font-semibold text-foreground">{g.title}</p>
                  <div className="grid grid-cols-2 gap-2">
                    {g.items.map((it) => (
                      <button
                        key={it.label}
                        onClick={() => add(it.type, it.actionType)}
                        className="flex items-center gap-2 rounded-lg border border-dashed border-border px-3 py-2.5 text-left text-sm hover:border-blue-400"
                      >
                        <it.icon className={`h-4 w-4 shrink-0 ${it.color}`} />
                        <span className="leading-tight">{it.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        <div className="mt-4 flex flex-col gap-2">
          <button onClick={onArrange} className={round} title="Organizar los pasos automáticamente">
            <Wand2 className="h-4 w-4" />
          </button>
          <button onClick={() => zoomIn()} className={round} title="Ampliar">
            <Plus className="h-4 w-4" />
          </button>
          <button onClick={() => zoomOut()} className={round} title="Reducir">
            <Minus className="h-4 w-4" />
          </button>
        </div>
      </div>
    </>
  );
}

/** Lay steps out left-to-right by distance from the triggers (ManyChat's magic wand). */
export function arrangeNodes<N extends { id: string; type?: string; position: { x: number; y: number } }>(
  nodes: N[],
  edges: Array<{ source: string; target: string }>,
): N[] {
  const level = new Map<string, number>();
  const queue: string[] = [];
  for (const n of nodes) {
    if (n.type === "trigger") {
      level.set(n.id, 0);
      queue.push(n.id);
    }
  }
  for (let i = 0; i < queue.length; i++) {
    const id = queue[i];
    for (const e of edges) {
      if (e.source !== id || level.has(e.target)) continue;
      level.set(e.target, (level.get(id) ?? 0) + 1);
      queue.push(e.target);
    }
  }
  const maxLevel = Math.max(0, ...level.values());
  const columns = new Map<number, number>();
  return nodes.map((n) => {
    const col = level.get(n.id) ?? (n.type === "note" ? -1 : maxLevel + 1);
    const row = columns.get(col) ?? 0;
    columns.set(col, row + 1);
    return { ...n, position: { x: col * 380, y: row * 320 } };
  });
}
