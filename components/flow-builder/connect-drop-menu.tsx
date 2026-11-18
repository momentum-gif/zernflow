"use client";

import { useReactFlow } from "@xyflow/react";
import { getDefaultData, getNodeId } from "./flow-node-defaults";

/** Dropping a connection on empty canvas opens ManyChat's "+ Instagram / + Acciones / …" menu. */
export interface PendingConnection {
  source: string;
  sourceHandle: string | null;
  screen: { x: number; y: number };
}

const OPTIONS: Array<{ label: string; type: string; actionType?: string }> = [
  { label: "Instagram", type: "sendMessage" },
  { label: "AI Step", type: "aiResponse" },
  { label: "Acciones", type: "actions" },
  { label: "Condición", type: "condition" },
  { label: "Aleatorizador", type: "action", actionType: "abSplit" },
  { label: "Pausa inteligente", type: "action", actionType: "smartDelay" },
  { label: "Iniciar Automatización", type: "action", actionType: "goToFlow" },
];

export function ConnectDropMenu({
  pending,
  onClose,
  onCreated,
}: {
  pending: PendingConnection;
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const { setNodes, setEdges, screenToFlowPosition } = useReactFlow();

  function create(type: string, actionType?: string) {
    const id = getNodeId();
    const position = screenToFlowPosition({ x: pending.screen.x, y: pending.screen.y - 40 });
    setNodes((nds) => [...nds, { id, type, position, data: getDefaultData(type, actionType) }]);
    const handle = pending.sourceHandle ?? undefined;
    setEdges((eds) => [
      // One connector leads to one step, like ManyChat.
      ...eds.filter((e) => !(e.source === pending.source && (e.sourceHandle ?? undefined) === handle)),
      {
        id: `e_${pending.source}_${handle ?? "next"}_${id}`,
        source: pending.source,
        target: id,
        ...(handle ? { sourceHandle: handle } : {}),
        animated: true,
        style: { stroke: "var(--border)", strokeWidth: 2 },
      },
    ]);
    onClose();
    onCreated(id);
  }

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div
        className="fixed z-50 w-60 overflow-hidden rounded-xl border border-border bg-card shadow-2xl"
        style={{ left: pending.screen.x + 8, top: Math.max(8, pending.screen.y - 20) }}
      >
        {OPTIONS.map((o) => (
          <button
            key={o.label}
            onClick={() => create(o.type, o.actionType)}
            className="block w-full border-b border-dashed border-border px-4 py-2.5 text-left text-sm font-medium text-blue-600 hover:bg-muted"
          >
            + {o.label}
          </button>
        ))}
        <button onClick={onClose} className="block w-full px-4 py-2.5 text-left text-sm text-muted-foreground hover:bg-muted">
          Cancelar
        </button>
      </div>
    </>
  );
}
