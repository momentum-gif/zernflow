"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";
import {
  Tag,
  FileText,
  Globe,
  ArrowRightLeft,
  UserCheck,
  Bell,
  Shuffle,
  Split,
  Hourglass,
  Cog,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { NodeType } from "@/lib/types/database";
import { randomizerColor, randomizerLetter } from "../randomizer-colors";

export interface ActionNodeProps {
  label?: string;
  actionType?: NodeType;
  tagName?: string;
  action?: "add" | "remove";
  fieldSlug?: string;
  value?: string;
  method?: string;
  url?: string;
  flowId?: string;
  message?: string;
  paths?: Array<{ name: string; weight: number }>;
  timeout?: number;
  timeoutUnit?: string;
}

const actionConfig: Record<
  string,
  { icon: typeof Cog; label: string; color: string }
> = {
  addTag: {
    icon: Tag,
    label: "Añadir etiqueta",
    color: "bg-gray-500",
  },
  removeTag: {
    icon: Tag,
    label: "Quitar etiqueta",
    color: "bg-gray-500",
  },
  setCustomField: {
    icon: FileText,
    label: "Establecer campo",
    color: "bg-gray-500",
  },
  httpRequest: {
    icon: Globe,
    label: "Solicitud externa",
    color: "bg-gray-500",
  },
  goToFlow: {
    icon: ArrowRightLeft,
    label: "Iniciar automatización",
    color: "bg-gray-500",
  },
  humanTakeover: {
    icon: UserCheck,
    label: "Pasar a un humano",
    color: "bg-gray-500",
  },
  subscribe: {
    icon: Bell,
    label: "Suscribir",
    color: "bg-gray-500",
  },
  unsubscribe: {
    icon: Bell,
    label: "Cancelar suscripción",
    color: "bg-gray-500",
  },
  commentReply: {
    icon: Cog,
    label: "Responder comentario",
    color: "bg-gray-500",
  },
  privateReply: {
    icon: Cog,
    label: "Respuesta privada",
    color: "bg-gray-500",
  },
  abSplit: {
    icon: Shuffle,
    label: "Aleatorizador",
    color: "bg-gray-500",
  },
  collectInput: {
    icon: FileText,
    label: "Recopilación de datos",
    color: "bg-gray-500",
  },
  smartDelay: {
    icon: Hourglass,
    label: "Pausa inteligente",
    color: "bg-gray-500",
  },
};

function getSummary(nodeData: ActionNodeProps): string | null {
  const type = nodeData.actionType;
  if (!type) return null;

  switch (type) {
    case "addTag":
      return nodeData.tagName ? `Add "${nodeData.tagName}"` : null;
    case "removeTag":
      return nodeData.tagName ? `Remove "${nodeData.tagName}"` : null;
    case "setCustomField":
      return nodeData.fieldSlug
        ? `${nodeData.fieldSlug} = ${nodeData.value || "..."}`
        : null;
    case "httpRequest":
      return nodeData.url
        ? `${nodeData.method || "GET"} ${nodeData.url}`
        : null;
    case "goToFlow":
      return nodeData.flowId ? `Flow: ${nodeData.flowId.slice(0, 8)}...` : null;
    case "humanTakeover":
      return nodeData.message || "Hand off to agent";
    case "subscribe":
      return "Subscribe contact";
    case "unsubscribe":
      return "Unsubscribe contact";
    case "abSplit":
      if (nodeData.paths && nodeData.paths.length > 0) {
        return nodeData.paths.map((p) => `${p.name}: ${p.weight}%`).join(", ");
      }
      return null;
    case "smartDelay":
      return nodeData.timeout
        ? `Wait up to ${nodeData.timeout} ${nodeData.timeoutUnit || "minutes"}`
        : null;
    default:
      return null;
  }
}

export function ActionNode({ data, selected }: NodeProps) {
  const nodeData = data as ActionNodeProps;
  const actionType = nodeData.actionType || "addTag";
  const config = actionConfig[actionType] || {
    icon: Cog,
    label: "Action",
    color: "bg-gray-500",
  };
  const Icon = config.icon;
  const label = nodeData.label || config.label;
  const summary = getSummary(nodeData);

  const isAbSplit = actionType === "abSplit";
  const paths = isAbSplit ? nodeData.paths || [] : [];

  // ManyChat "Aleatorizador": light-purple header, one row per variation (letter … %),
  // each with its own coloured connector on the right.
  if (isAbSplit) {
    const rows = paths.length > 0 ? paths : [{ name: "A", weight: 50 }, { name: "B", weight: 50 }];
    return (
      <div
        className={cn(
          "w-56 rounded-2xl border-2 bg-card shadow-sm",
          selected ? "border-emerald-500 shadow-md" : "border-transparent ring-1 ring-border"
        )}
      >
        <Handle type="target" position={Position.Left} className="!h-3 !w-3 !border-2 !border-border !bg-white" />
        <div className="flex items-center gap-2 rounded-t-2xl bg-[#e4dcfb] px-3 py-2 text-foreground dark:bg-purple-900/60">
          <Split className="h-4 w-4 rotate-90 text-[rgb(127,83,224)]" />
          <p className="text-sm font-medium">{nodeData.label || "Aleatorizador"}</p>
        </div>
        <div className="py-1">
          {rows.map((path, i) => (
            <div key={i} className="relative flex items-center justify-between px-4 py-2 text-sm">
              <span>{randomizerLetter(i)}</span>
              <span>{path.weight}%</span>
              <Handle
                type="source"
                id={`split-${i}`}
                position={Position.Right}
                className="!-right-[7px] !h-3 !w-3 !border-2 !bg-white"
                style={{ borderColor: randomizerColor(i) }}
              />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "w-56 rounded-lg border bg-card shadow-sm transition-shadow",
        selected ? "border-gray-400 shadow-md" : "border-border"
      )}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="!h-3 !w-3 !border-2 !border-gray-400 !bg-white"
      />
      <div
        className={cn(
          "flex items-center gap-2 rounded-t-lg px-3 py-2 text-white",
          config.color
        )}
      >
        <Icon className="h-3.5 w-3.5" />
        <span className="text-xs font-semibold">{config.label}</span>
      </div>
      <div className="p-3">
        <p className="text-sm font-medium">{label}</p>
        {summary ? (
          <p className="mt-1 truncate text-xs text-muted-foreground">{summary}</p>
        ) : (
          <p className="mt-1 text-xs text-muted-foreground italic">Not configured</p>
        )}
      </div>
      {isAbSplit && paths.length > 0 ? (
        <>
          {paths.map((path, i) => (
            <Handle
              key={path.name}
              type="source"
              position={Position.Right}
              id={`split-${i}`}
              style={{ top: `${((i + 1) / (paths.length + 1)) * 100}%` }}
              className="!h-3 !w-3 !border-2 !border-gray-400 !bg-white"
            />
          ))}
        </>
      ) : (
        <Handle
          type="source"
          position={Position.Right}
          className="!h-3 !w-3 !border-2 !border-gray-400 !bg-white"
        />
      )}
    </div>
  );
}
