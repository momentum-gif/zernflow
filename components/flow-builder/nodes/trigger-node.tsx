"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";
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
  sequence_subscribed: "Entra a una secuencia",
  sequence_unsubscribed: "Sale de una secuencia",
  comment_keyword: "El usuario comenta tu publicación o Reel",
};

export function TriggerNode({ data, selected }: NodeProps) {
  const nodeData = data as TriggerNodeProps;
  const triggerType = nodeData.triggerType || "keyword";
  const label = nodeData.label || triggerLabels[triggerType] || "Trigger";

  return (
    <div
      className={cn(
        "w-56 rounded-lg border bg-card shadow-sm transition-shadow",
        selected ? "border-emerald-500 shadow-md" : "border-border"
      )}
    >
      <div className="flex items-center gap-2 rounded-t-lg bg-emerald-500 px-3 py-2 text-white">
        <Zap className="h-3.5 w-3.5" />
        <span className="text-xs font-semibold">Trigger</span>
      </div>
      <div className="p-3">
        <div className="flex items-center gap-1.5">
          <p className="text-sm font-medium">{label}</p>
          {triggerType === "comment_keyword" && nodeData.alsoMatchInDms === true && (
            <span className="rounded-sm bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
              Also in DMs
            </span>
          )}
        </div>
        {triggerType === "comment_keyword" && (
          <p className="mt-1 text-xs text-muted-foreground">
            {(data as Record<string, unknown>).anyComment === true
              ? "Cualquier comentario"
              : nodeData.keywords?.length
                ? `Palabras: ${nodeData.keywords.slice(0, 3).map((k) => k.value).join(", ")}${nodeData.keywords.length > 3 ? ` +${nodeData.keywords.length - 3}` : ""}`
                : "Configura el disparador"}
          </p>
        )}
        {triggerType !== "comment_keyword" && nodeData.keywords && nodeData.keywords.length > 0 && (
          <p className="mt-1 text-xs text-muted-foreground">
            Keywords:{" "}
            {nodeData.keywords
              .slice(0, 3)
              .map((k) => k.value)
              .join(", ")}
            {nodeData.keywords.length > 3 && ` +${nodeData.keywords.length - 3} more`}
          </p>
        )}
        {!nodeData.keywords?.length && triggerType !== "keyword" && triggerType !== "comment_keyword" && (
          <p className="mt-1 text-xs text-muted-foreground">
            {triggerLabels[triggerType] || triggerType}
          </p>
        )}
      </div>
      <Handle
        type="source"
        position={Position.Bottom}
        className="!h-3 !w-3 !border-2 !border-emerald-500 !bg-white"
      />
    </div>
  );
}
