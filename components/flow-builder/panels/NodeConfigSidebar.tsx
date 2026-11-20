"use client";

import { useCallback, useEffect } from "react";
import { X, Trash2, Zap, MessageSquare, GitBranch, Clock, Cog, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Edge, Node } from "@xyflow/react";

import { TriggerPanel } from "./TriggerPanel";
import { SendMessagePanel } from "./SendMessagePanel";
import { ConditionPanel } from "./ConditionPanel";
import { DelayPanel } from "./DelayPanel";
import { ActionPanel } from "./ActionPanel";
import { ActionsListPanel } from "./ActionsListPanel";
import { AiResponsePanel } from "./AiResponsePanel";
import { AiStepPanel } from "./AiStepPanel";

interface NodeConfigSidebarProps {
  node: Node;
  nodes: Node[];
  edges: Edge[];
  onChange: (nodeId: string, data: Record<string, unknown>) => void;
  onClose: () => void;
  onDelete: (nodeId: string) => void;
  flowId?: string;
}

// BFS backwards over edges; the visited set makes cycles terminate.
function getUpstreamNodeIds(nodeId: string, edges: Edge[]): Set<string> {
  const upstream = new Set<string>();
  const queue = [nodeId];
  for (let i = 0; i < queue.length; i++) {
    const current = queue[i];
    for (const edge of edges) {
      if (edge.target !== current || upstream.has(edge.source)) continue;
      upstream.add(edge.source);
      queue.push(edge.source);
    }
  }
  return upstream;
}

function getFlowVariables({
  node,
  nodes,
  edges,
}: {
  node: Node;
  nodes: Node[];
  edges: Edge[];
}): string[] {
  const variables = ["nombre", "nombre_completo", "usuario", "message"];

  const triggerNode = nodes.find((n) => n.type === "trigger");
  const triggerType = (triggerNode?.data as Record<string, unknown> | undefined)
    ?.triggerType as string | undefined;
  if (triggerType === "comment_keyword") {
    variables.push("comment_id", "comment_text", "commenter_name", "post_id");
  }

  // Producer-derived variables are only offered when the producing node runs before this one.
  const upstreamIds = getUpstreamNodeIds(node.id, edges);

  if (nodes.some((n) => n.type === "aiResponse" && upstreamIds.has(n.id))) {
    variables.push("ai_response");
  }

  for (const n of nodes) {
    if (n.type !== "httpRequest" || !upstreamIds.has(n.id)) continue;
    const responseVariable = (n.data as Record<string, unknown>)
      .responseVariable as string | undefined;
    if (responseVariable && !variables.includes(responseVariable)) {
      variables.push(responseVariable);
    }
  }

  return variables;
}

const nodeTypeConfig: Record<string, { label: string; icon: typeof Cog; color: string; borderColor: string }> = {
  trigger: {
    label: "Disparador",
    icon: Zap,
    color: "bg-emerald-500",
    borderColor: "border-emerald-500",
  },
  sendMessage: {
    label: "Mensaje de Instagram",
    icon: MessageSquare,
    color: "bg-blue-500",
    borderColor: "border-blue-500",
  },
  condition: {
    label: "Condición",
    icon: GitBranch,
    color: "bg-amber-500",
    borderColor: "border-amber-500",
  },
  delay: {
    label: "Retraso",
    icon: Clock,
    color: "bg-purple-500",
    borderColor: "border-purple-500",
  },
  aiResponse: {
    label: "Respuesta con IA",
    icon: Sparkles,
    color: "bg-violet-500",
    borderColor: "border-violet-500",
  },
  actions: {
    label: "Acciones",
    icon: Zap,
    color: "bg-amber-500",
    borderColor: "border-amber-500",
  },
  action: {
    label: "Acción",
    icon: Cog,
    color: "bg-muted0",
    borderColor: "border-muted-foreground",
  },
};

export function NodeConfigSidebar({ node, nodes, edges, onChange, onClose, onDelete, flowId }: NodeConfigSidebarProps) {
  const nodeType = node.type || "action";
  const config = nodeTypeConfig[nodeType] || nodeTypeConfig.action;
  const Icon = config.icon;

  // Close on Escape
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onClose();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const handleChange = useCallback(
    (data: Record<string, unknown>) => {
      onChange(node.id, data);
    },
    [node.id, onChange]
  );

  const handleLabelChange = useCallback(
    (label: string) => {
      onChange(node.id, { ...node.data, label });
    },
    [node.id, node.data, onChange]
  );

  function renderPanel() {
    const data = node.data as Record<string, unknown>;
    switch (nodeType) {
      case "trigger":
        return (
          <TriggerPanel
            key={node.id}
            data={data}
            onChange={handleChange}
            flowId={flowId}
            nodeId={node.id}
            onDeleteNode={() => onDelete(node.id)}
            onClosePanel={onClose}
          />
        );
      case "sendMessage":
        return (
          <SendMessagePanel
            data={data}
            onChange={handleChange}
            availableVariables={getFlowVariables({ node, nodes, edges })}
            nodeId={node.id}
          />
        );
      case "condition":
        return <ConditionPanel data={data} onChange={handleChange} />;
      case "delay":
        return <DelayPanel data={data} onChange={handleChange} />;
      case "aiResponse":
        // Old free-prompt nodes keep their editor; new ones are ManyChat's AI Step.
        return data.systemPrompt && !data.aiStep && !Array.isArray(data.tasks) ? (
          <AiResponsePanel data={data} onChange={handleChange} />
        ) : (
          <AiStepPanel data={data} onChange={handleChange} nodeId={node.id} />
        );
      case "action":
        return <ActionPanel data={data} onChange={handleChange} nodeId={node.id} />;
      case "actions":
        return <ActionsListPanel data={data} onChange={handleChange} />;
      default:
        return (
          <p className="text-sm text-muted-foreground">
            No configuration panel available for this node type.
          </p>
        );
    }
  }

  // ManyChat colours the editor header by step type.
  const headerBg: Record<string, string> = {
    trigger: "bg-emerald-100 dark:bg-emerald-950/50",
    sendMessage: "bg-fuchsia-100 dark:bg-fuchsia-950/50",
    actions: "bg-amber-100 dark:bg-amber-950/50",
    condition: "bg-cyan-100 dark:bg-cyan-950/50",
    aiResponse: "bg-gradient-to-r from-amber-50 via-rose-50 to-violet-100 dark:from-violet-950/50 dark:to-violet-950/50",
    delay: "bg-red-100 dark:bg-red-950/50",
    action: "bg-lime-100 dark:bg-lime-950/50",
  };
  const isRandomizer = nodeType === "action" && (node.data as { actionType?: string }).actionType === "abSplit";
  if (isRandomizer) headerBg.action = "bg-[#e4dcfb] dark:bg-purple-900/60";
  const isSmartDelay = nodeType === "action" && (node.data as { actionType?: string }).actionType === "smartDelay";
  if (isSmartDelay) headerBg.action = "bg-red-200 dark:bg-red-900/60";
  const isStartFlow = nodeType === "action" && (node.data as { actionType?: string }).actionType === "goToFlow";
  if (isStartFlow) headerBg.action = "bg-lime-200 dark:bg-lime-900/60";
  const defaultTitle = isRandomizer
    ? "Aleatorizador"
    : isSmartDelay
      ? "Pausa inteligente"
      : isStartFlow
        ? "Iniciar Automatización"
    : nodeType === "aiResponse"
      ? "AI Step"
    : nodeType === "sendMessage"
      ? "Enviar mensaje"
      : nodeType === "trigger"
        ? "Disparador"
        : config.label;

  return (
    <div data-node-sidebar className="flex w-[360px] shrink-0 flex-col border-r border-border bg-card shadow-lg">
      {/* Header */}
      <div className={cn("flex items-center gap-2 px-3 py-3", headerBg[nodeType] ?? "bg-muted")}>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg p-1.5 text-foreground/70 hover:bg-black/5"
          aria-label="Cerrar"
        >
          <X className="h-4 w-4" />
        </button>
        <input
          type="text"
          value={((node.data as Record<string, unknown>).label as string) || ""}
          onChange={(e) => handleLabelChange(e.target.value)}
          placeholder={defaultTitle}
          className="min-w-0 flex-1 bg-transparent text-center text-lg font-bold text-foreground placeholder:text-foreground focus:outline-none"
          title="Cambiar el nombre del paso"
        />
        <button
          type="button"
          onClick={() => onDelete(node.id)}
          className="rounded-lg p-1.5 text-foreground/50 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-950"
          title="Eliminar paso"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      {/* Panel Content */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {renderPanel()}
      </div>

    </div>
  );
}
