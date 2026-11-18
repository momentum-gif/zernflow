"use client";

import { useState } from "react";
import { useReactFlow, useStore, type Edge, type Node } from "@xyflow/react";
import { ArrowRight, X } from "lucide-react";
import { getDefaultData, getNodeId } from "../flow-node-defaults";

/**
 * ManyChat's "Cuando se presiona este botón" / "Elegir Siguiente Paso": pick
 * what comes next and the step is created on the canvas already connected.
 */
const OPTIONS: Array<{ id: string; label: string; type: string; actionType?: string }> = [
  { id: "sendMessage", label: "Instagram", type: "sendMessage" },
  { id: "aiResponse", label: "AI Step", type: "aiResponse" },
  { id: "actions", label: "Realizar acciones", type: "actions" },
  { id: "condition", label: "Condición", type: "condition" },
  { id: "abSplit", label: "Aleatorizador", type: "action", actionType: "abSplit" },
  { id: "smartDelay", label: "Pausa inteligente", type: "action", actionType: "smartDelay" },
  { id: "goToFlow", label: "Iniciar otra automatización", type: "action", actionType: "goToFlow" },
  { id: "collectInput", label: "Recopilación de datos", type: "action", actionType: "collectInput" },
];

const NODE_NAMES: Record<string, string> = {
  sendMessage: "Instagram",
  aiResponse: "AI Step",
  actions: "Acciones",
  condition: "Condición",
  delay: "Retraso",
  trigger: "Disparador",
};

function nodeName(n: Node) {
  const d = n.data as { label?: string; actionType?: string };
  if (d.label) return d.label;
  if (n.type === "action") {
    return OPTIONS.find((o) => o.actionType === d.actionType)?.label ?? "Acción";
  }
  return NODE_NAMES[n.type ?? ""] ?? "Paso";
}

export function NextStepPicker({
  nodeId,
  handle,
  label = "Cuando se presiona este botón",
}: {
  nodeId: string;
  /** "btn:<payload>" for a button, undefined for the step's "Siguiente paso". */
  handle?: string;
  label?: string;
}) {
  const { getNode, getNodes, setNodes, setEdges } = useReactFlow();
  const edges = useStore((s) => s.edges) as Edge[];
  const nodes = useStore((s) => s.nodes) as Node[];
  const [choosingExisting, setChoosingExisting] = useState(false);

  const matches = (e: Edge) => e.source === nodeId && (handle ? e.sourceHandle === handle : !e.sourceHandle);
  const current = edges.find(matches);
  const target = current ? nodes.find((n) => n.id === current.target) : undefined;

  function connect(targetId: string) {
    setEdges((eds) => [
      ...eds.filter((e) => !matches(e)),
      {
        id: `e_${nodeId}_${handle ?? "next"}_${targetId}`,
        source: nodeId,
        target: targetId,
        ...(handle ? { sourceHandle: handle } : {}),
        animated: true,
        style: { stroke: "var(--border)", strokeWidth: 2 },
      },
    ]);
  }

  function create(option: (typeof OPTIONS)[number]) {
    const source = getNode(nodeId);
    const siblings = edges.filter((e) => e.source === nodeId).length;
    const id = getNodeId();
    setNodes((nds) => [
      ...nds,
      {
        id,
        type: option.type,
        position: {
          x: (source?.position.x ?? 0) + 360,
          y: (source?.position.y ?? 0) + siblings * 140,
        },
        data: getDefaultData(option.type, option.actionType),
      },
    ]);
    connect(id);
  }

  if (target) {
    return (
      <div>
        <p className="mb-1 text-[11px] text-muted-foreground">{label}</p>
        <div className="flex items-center justify-between gap-2 rounded-lg border border-emerald-300 bg-emerald-50/50 px-2.5 py-1.5 text-xs dark:border-emerald-800 dark:bg-emerald-950/20">
          <span className="flex min-w-0 items-center gap-1.5">
            <ArrowRight className="h-3 w-3 shrink-0 text-emerald-600" />
            <span className="truncate font-medium">{nodeName(target)}</span>
          </span>
          <button
            type="button"
            onClick={() => setEdges((eds) => eds.filter((e) => !matches(e)))}
            className="text-muted-foreground hover:text-red-500"
            aria-label="Desconectar"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      </div>
    );
  }

  const others = getNodes().filter((n) => n.id !== nodeId && n.type !== "trigger" && n.type !== "note");

  return (
    <div>
      <p className="mb-1 text-[11px] text-muted-foreground">{label}</p>
      {choosingExisting ? (
        <select
          autoFocus
          defaultValue=""
          onChange={(e) => {
            if (e.target.value) connect(e.target.value);
            setChoosingExisting(false);
          }}
          onBlur={() => setChoosingExisting(false)}
          className="w-full rounded border border-border bg-card px-2 py-1.5 text-xs"
        >
          <option value="">Elegir paso…</option>
          {others.map((n) => (
            <option key={n.id} value={n.id}>
              {nodeName(n)}
            </option>
          ))}
        </select>
      ) : (
        <select
          value=""
          onChange={(e) => {
            const v = e.target.value;
            if (v === "__existing") return setChoosingExisting(true);
            const opt = OPTIONS.find((o) => o.id === v);
            if (opt) create(opt);
          }}
          className="w-full rounded border border-dashed border-border bg-card px-2 py-1.5 text-xs text-muted-foreground"
        >
          <option value="">+ Elegir siguiente paso…</option>
          {OPTIONS.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
          <option value="__existing">Seleccionar paso existente</option>
        </select>
      )}
    </div>
  );
}
