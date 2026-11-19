"use client";

import { Handle, Position, useReactFlow, type NodeProps } from "@xyflow/react";
import { getNodeId } from "../flow-node-defaults";
import { Zap } from "lucide-react";
import { cn } from "@/lib/utils";

export interface TriggerNodeProps {
  label?: string;
  triggerType?: string;
  keywords?: Array<{ value: string; matchType: string }>;
  alsoMatchInDms?: boolean;
}

const triggerLabels: Record<string, string> = {
  keyword: "El usuario envía un mensaje",
  postback: "El usuario toca un botón",
  quick_reply: "El usuario toca una respuesta rápida",
  welcome: "Mensaje de bienvenida",
  default: "Respuesta predeterminada",
  story_reply: "El usuario responde a tu historia",
  story_mention: "El usuario te menciona en su historia",
  ref_url: "El usuario hace clic en un enlace de referencia",
  contact_created: "Nuevo contacto creado",
  tag_added: "Se aplica una etiqueta",
  tag_removed: "Se elimina una etiqueta",
  custom_field_changed: "Cambia un campo personalizado",
  system_field_changed: "Cambia el correo del contacto",
  date_time: "Fecha/Hora de un campo",
  sequence_subscribed: "Entra a una secuencia",
  sequence_unsubscribed: "Sale de una secuencia",
  comment_keyword: "El usuario comenta tu publicación o Reel",
};

export function TriggerNode({ id, data, selected }: NodeProps) {
  const { getNode, getEdges, setNodes, setEdges } = useReactFlow();
  const nodeData = data as TriggerNodeProps;

  // "+ Nuevo disparador": another way to start this same automation.
  function addTrigger(e: React.MouseEvent) {
    e.stopPropagation();
    const self = getNode(id);
    const target = getEdges().find((ed) => ed.source === id)?.target;
    const newId = getNodeId();
    setNodes((nds) => [
      ...nds,
      {
        id: newId,
        type: "trigger",
        position: { x: self?.position.x ?? 0, y: (self?.position.y ?? 0) + 200 },
        data: { triggerType: "keyword", keywords: [] },
        selected: true,
      },
    ]);
    if (target) {
      setEdges((eds) => [
        ...eds,
        { id: `e_${newId}_${target}`, source: newId, target, animated: true, style: { stroke: "var(--border)", strokeWidth: 2 } },
      ]);
    }
  }
  const triggerType = nodeData.triggerType || "keyword";
  const title = triggerLabels[triggerType] || "Disparador";
  const d = data as Record<string, unknown>;
  const kw = nodeData.keywords ?? [];
  const detail =
    triggerType === "comment_keyword" || triggerType === "story_reply"
      ? d.anyComment === true
        ? "Cualquier comentario"
        : kw.length
          ? `Palabras: ${kw.slice(0, 3).map((k) => k.value).join(", ")}${kw.length > 3 ? ` +${kw.length - 3}` : ""}`
          : "Configura el disparador"
      : kw.length
        ? `Palabras: ${kw.slice(0, 3).map((k) => k.value).join(", ")}`
        : null;

  return (
    <div
      className={cn(
        "w-64 rounded-2xl border bg-card shadow-sm transition-shadow",
        selected ? "border-emerald-500 shadow-md" : "border-border"
      )}
    >
      <div className="flex items-center gap-2 px-3 pt-3 text-sm font-medium">
        <Zap className="h-4 w-4" /> Cuando...
      </div>
      <div className="p-3">
        <div className="rounded-xl bg-muted/60 px-3 py-2">
          <div className="flex items-start justify-between gap-2">
            <p className="text-xs font-medium text-foreground">{title}</p>
            {(nodeData as { active?: boolean }).active === false && (
              <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[9px] text-muted-foreground">Desactivado</span>
            )}
          </div>
          {nodeData.label && <p className="mt-0.5 text-[11px] text-muted-foreground">{nodeData.label}</p>}
          {detail && <p className="mt-0.5 text-[11px] text-muted-foreground">{detail}</p>}
        </div>
        <button
          onClick={addTrigger}
          className="nodrag mt-2 w-full rounded-xl border border-dashed border-border py-2 text-xs font-medium text-blue-600 hover:border-blue-400"
        >
          + Nuevo disparador
        </button>
      </div>
      <div className="relative flex items-center justify-end border-t border-border px-3 py-2">
        <span className="text-[10px] text-muted-foreground">Entonces</span>
        <Handle
          type="source"
          position={Position.Right}
          className="!-right-1.5 !h-3 !w-3 !border-2 !border-border !bg-white"
        />
      </div>
    </div>
  );
}
