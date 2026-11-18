"use client";

import {
  ReactFlow,
  Background,


  addEdge,
  useNodesState,
  useEdgesState,
  type Connection,
  type Node,
  type Edge,
  type NodeTypes,
  ReactFlowProvider,
  useReactFlow,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { useCallback, useEffect, useRef, useState, type DragEvent } from "react";
import { useRouter } from "next/navigation";
import { ChevronRight, Copy, Save, Rocket, Loader2, History, Play, Download, Trash2, MoreVertical, Undo2 } from "lucide-react";
import { refreshButtonPayloads } from "@/lib/flow-payloads";
import { cn } from "@/lib/utils";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { createClient } from "@/lib/supabase/client";
import type { Database, FlowStatus, Json } from "@/lib/types/database";

import { TriggerNode } from "./nodes/trigger-node";
import { SendMessageNode } from "./nodes/send-message-node";
import { ConditionNode } from "./nodes/condition-node";
import { DelayNode } from "./nodes/delay-node";
import { ActionNode } from "./nodes/action-node";
import { AiResponseNode } from "./nodes/AiResponseNode";
import { NodeConfigSidebar } from "./panels/NodeConfigSidebar";
import { VersionHistoryPanel } from "./panels/VersionHistoryPanel";
import { TestPanel } from "./panels/TestPanel";

type Flow = Database["public"]["Tables"]["flows"]["Row"];

import { NoteNode } from "./nodes/note-node";
import { getDefaultData, getNodeId } from "./flow-node-defaults";
import { ActionsNode } from "./nodes/actions-node";
import { FlowStatsProvider } from "./flow-stats-context";
import { PhonePreview } from "./phone-preview";
import { CanvasControls, arrangeNodes } from "./add-step-menu";

const nodeTypes: NodeTypes = {
  trigger: TriggerNode,
  sendMessage: SendMessageNode,
  condition: ConditionNode,
  delay: DelayNode,
  action: ActionNode,
  aiResponse: AiResponseNode,
  note: NoteNode,
  actions: ActionsNode,
};

interface FlowCanvasProps {
  flow: Flow;
}

function FlowCanvasInner({ flow }: FlowCanvasProps) {
  const router = useRouter();
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const { screenToFlowPosition } = useReactFlow();
  const supabase = createClient();

  const initialNodes: Node[] = Array.isArray(flow.nodes)
    ? (flow.nodes as unknown as Node[])
    : [];
  const initialEdges: Edge[] = Array.isArray(flow.edges)
    ? (flow.edges as unknown as Edge[])
    : [];

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const [flowName, setFlowName] = useState(flow.name);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [versionPanelOpen, setVersionPanelOpen] = useState(false);
  const [testPanelOpen, setTestPanelOpen] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const selectedNode = selectedNodeId
    ? nodes.find((n) => n.id === selectedNodeId) || null
    : null;

  // ManyChat-style phone preview for message steps and the comment trigger.
  const [previewHidden, setPreviewHidden] = useState(false);
  const [igUsername, setIgUsername] = useState<string | undefined>();
  useEffect(() => {
    fetch("/api/v1/channels")
      .then((r) => (r.ok ? r.json() : []))
      .then((channels: Array<{ platform: string; username: string | null; is_active: boolean }>) =>
        setIgUsername(channels.find((c) => c.platform === "instagram" && c.is_active)?.username ?? undefined)
      )
      .catch(() => {});
  }, []);
  const showPreview =
    !!selectedNode &&
    !previewHidden &&
    (selectedNode.type === "sendMessage" ||
      (selectedNode.type === "trigger" &&
        (selectedNode.data as { triggerType?: string }).triggerType === "comment_keyword"));

  const onConnect = useCallback(
    (connection: Connection) => {
      setEdges((eds) =>
        addEdge(
          {
            ...connection,
            animated: true,
            style: { stroke: "var(--border)", strokeWidth: 2 },
          },
          eds
        )
      );
    },
    [setEdges]
  );

  const onDragOver = useCallback((event: DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }, []);

  const onDrop = useCallback(
    (event: DragEvent) => {
      event.preventDefault();

      const raw = event.dataTransfer.getData("application/reactflow");
      if (!raw) return;

      const { type, nodeType, actionType } = JSON.parse(raw) as {
        type: string;
        nodeType: string;
        actionType?: string;
      };

      const position = screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });

      const newNode: Node = {
        id: getNodeId(),
        type,
        position,
        data: getDefaultData(type, actionType || nodeType),
      };

      setNodes((nds) => [...nds, newNode]);
    },
    [screenToFlowPosition, setNodes]
  );

  const onNodeClick = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      // Notes are edited in place; they have no settings panel.
      if (node.type === "note") return;
      setSelectedNodeId(node.id);
    },
    []
  );

  const onPaneClick = useCallback(() => {
    setSelectedNodeId(null);
  }, []);

  const onNodeDataChange = useCallback(
    (nodeId: string, newData: Record<string, unknown>) => {
      setNodes((nds) =>
        nds.map((n) =>
          n.id === nodeId ? { ...n, data: newData } : n
        )
      );
    },
    [setNodes]
  );

  const closeSidebar = useCallback(() => {
    setSelectedNodeId(null);
  }, []);

  const deleteNode = useCallback(
    (nodeId: string) => {
      setNodes((nds) => nds.filter((n) => n.id !== nodeId));
      setEdges((eds) => eds.filter((e) => e.source !== nodeId && e.target !== nodeId));
      setSelectedNodeId(null);
    },
    [setNodes, setEdges]
  );

  const saveFlow = useCallback(
    async (status?: FlowStatus) => {
      if (status === "published") {
        setPublishing(true);
      } else {
        setSaving(true);
      }

      try {
        const update: Database["public"]["Tables"]["flows"]["Update"] = {
          name: flowName,
          nodes: nodes as unknown as Json,
          edges: edges as unknown as Json,
          updated_at: new Date().toISOString(),
        };

        if (status) {
          update.status = status;
          if (status === "published") {
            update.published_at = new Date().toISOString();
          }
        }

        const { error } = await supabase
          .from("flows")
          .update(update)
          .eq("id", flow.id);

        if (error) {
          console.error("Failed to save flow:", error);
          setSaveError("Failed to save");
          setTimeout(() => setSaveError(null), 3000);
          return;
        }

        setSaveError(null);
        setLastSaved(new Date());
      } finally {
        setSaving(false);
        setPublishing(false);
      }
    },
    [flowName, nodes, edges, flow.id, supabase]
  );

  const handleSave = useCallback(() => saveFlow(), [saveFlow]);
  const handleDelete = useCallback(async () => {
    setDeleting(true);
    try {
      // Like ManyChat, "Eliminar" sends it to the Papelera (restorable).
      const res = await fetch(`/api/v1/flows/${flow.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "archived" }),
      });
      if (!res.ok) {
        console.error("Failed to delete flow");
        setSaveError("Failed to delete");
        setTimeout(() => setSaveError(null), 3000);
        setDeleting(false);
        return;
      }
      router.push("/dashboard/flows");
    } catch (err) {
      console.error("Failed to delete flow:", err);
      setSaveError("Failed to delete");
      setTimeout(() => setSaveError(null), 3000);
      setDeleting(false);
    }
  }, [flow.id, router]);
  const handlePublish = useCallback(async () => {
    setPublishing(true);
    try {
      // First save the current state
      await saveFlow();
      // Then call the publish API which increments version and saves snapshot
      const res = await fetch(`/api/v1/flows/${flow.id}/publish`, {
        method: "POST",
      });
      if (!res.ok) {
        console.error("Failed to publish flow");
        setSaveError("Failed to publish");
        setTimeout(() => setSaveError(null), 3000);
        return;
      }
      setSaveError(null);
      setLastSaved(new Date());
      router.refresh();
    } finally {
      setPublishing(false);
    }
  }, [saveFlow, flow.id]);

  return (
    <div className="flex h-full flex-col">
      {/* Toolbar */}
      <div className="flex items-center justify-between border-b border-border bg-card px-4 py-2">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push("/dashboard/flows")}
            className="rounded-lg px-1.5 py-1 text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground"
          >
            Automatizaciones
          </button>
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            value={flowName}
            onChange={(e) => setFlowName(e.target.value)}
            className="w-auto max-w-[260px] border-none bg-transparent text-sm font-semibold outline-none focus:ring-0"
            style={{ width: `${Math.max(flowName.length, 8)}ch` }}
            placeholder="Nombre de la automatización"
          />
          <span
            className={cn(
              "inline-flex rounded px-1.5 py-0.5 text-[10px] font-semibold",
              flow.status === "published"
                ? "bg-emerald-100 text-emerald-800"
                : "bg-muted text-muted-foreground"
            )}
          >
            {flow.status === "published" ? "ACTIVO" : flow.status === "archived" ? "EN PAPELERA" : "BORRADOR"}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {saveError && (
            <span className="text-xs font-medium text-destructive">
              {saveError}
            </span>
          )}
          {!saveError && lastSaved && (
            <span className="text-xs text-muted-foreground">
              ✓ Guardado {lastSaved.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </span>
          )}
          <button
            onClick={() => {
              setTestPanelOpen(!testPanelOpen);
              if (!testPanelOpen) {
                setVersionPanelOpen(false);
                setSelectedNodeId(null);
              }
            }}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors",
              testPanelOpen
                ? "border-primary bg-primary/10 text-primary"
                : "border-border bg-background hover:bg-accent"
            )}
          >
            <Play className="h-3.5 w-3.5" />
            Vista previa
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-sm font-medium hover:bg-accent transition-colors disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            Guardar
          </button>
          <button
            onClick={handlePublish}
            disabled={publishing}
            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 transition-colors disabled:opacity-50"
          >
            {publishing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Rocket className="h-3.5 w-3.5" />}
            Publicar en vivo
          </button>

          <div className="relative">
            <button
              onClick={() => setMoreOpen((o) => !o)}
              className="rounded-lg border border-border p-2 text-muted-foreground hover:bg-accent"
              aria-label="Más acciones"
            >
              {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <MoreVertical className="h-4 w-4" />}
            </button>
            {moreOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setMoreOpen(false)} />
                <div className="absolute right-0 top-10 z-50 w-60 rounded-lg border border-border bg-card p-1 shadow-lg">
                  <button
                    className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted"
                    onClick={async () => {
                      setMoreOpen(false);
                      const res = await fetch("/api/v1/flows", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          name: `${flowName} (copia)`,
                          description: flow.description ?? null,
                          ...refreshButtonPayloads(nodes, edges),
                        }),
                      });
                      const created = await res.json().catch(() => null);
                      if (res.ok && created?.id) router.push(`/dashboard/flows/${created.id}`);
                      else alert("No se pudo duplicar.");
                    }}
                  >
                    <Copy className="h-3.5 w-3.5" /> Duplicar
                  </button>
                  <button
                    className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted"
                    onClick={() => {
                      setMoreOpen(false);
                      const exportData = {
                        name: flowName,
                        description: flow.description || null,
                        nodes,
                        edges,
                        version: flow.version || 1,
                        exportedAt: new Date().toISOString(),
                        source: "zernflow",
                      };
                      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement("a");
                      a.href = url;
                      a.download = `${flowName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.flow.json`;
                      a.click();
                      URL.revokeObjectURL(url);
                    }}
                  >
                    <Download className="h-3.5 w-3.5" /> Exportar
                  </button>
                  <button
                    className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted"
                    onClick={() => {
                      setMoreOpen(false);
                      setVersionPanelOpen(true);
                      setTestPanelOpen(false);
                      setSelectedNodeId(null);
                    }}
                  >
                    <History className="h-3.5 w-3.5" /> Mostrar historial de versiones
                  </button>
                  <button
                    className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-red-600 hover:bg-muted"
                    onClick={() => {
                      setMoreOpen(false);
                      setConfirmDelete(true);
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" /> Eliminar
                  </button>
                  <div className="my-1 border-t border-border" />
                  <button
                    className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-red-600 hover:bg-muted"
                    onClick={async () => {
                      setMoreOpen(false);
                      if (!window.confirm("¿Volver a la última versión publicada? Se perderán los cambios sin publicar.")) return;
                      const { createClient } = await import("@/lib/supabase/client");
                      const { data: v } = await createClient()
                        .from("flow_versions")
                        .select("nodes, edges")
                        .eq("flow_id", flow.id)
                        .order("version", { ascending: false })
                        .limit(1)
                        .maybeSingle();
                      if (!v) return alert("Esta automatización todavía no se ha publicado.");
                      setNodes((v.nodes as unknown as Node[]) ?? []);
                      setEdges((v.edges as unknown as Edge[]) ?? []);
                    }}
                  >
                    <Undo2 className="h-3.5 w-3.5" /> Revertir a la publicación
                  </button>
                </div>
              </>
            )}
          </div>
          <ConfirmDialog
            open={confirmDelete}
            title="Eliminar automatización"
            message={`"${flowName}" se moverá a la Papelera y dejará de funcionar. Puedes restaurarla desde allí.`}
            confirmLabel="Eliminar"
            destructive
            onConfirm={() => {
              setConfirmDelete(false);
              handleDelete();
            }}
            onCancel={() => setConfirmDelete(false)}
          />
        </div>
      </div>

      {/* Canvas area */}
      <div className="flex flex-1 overflow-hidden">
        <div ref={reactFlowWrapper} className="relative flex-1">
          <CanvasControls
            wrapper={reactFlowWrapper}
            onAdded={(id) => setSelectedNodeId(id)}
            onArrange={() => setNodes((nds) => arrangeNodes(nds, edges))}
          />
          {showPreview && selectedNode && (
            <PhonePreview
              key={selectedNode.id}
              node={selectedNode}
              nodes={nodes}
              edges={edges}
              username={igUsername}
              onClose={() => setPreviewHidden(true)}
            />
          )}
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onDrop={onDrop}
            onDragOver={onDragOver}
            onNodeClick={onNodeClick}
            onPaneClick={onPaneClick}
            nodeTypes={nodeTypes}
            fitView
            deleteKeyCode={["Backspace", "Delete"]}
            proOptions={{ hideAttribution: true }}
            className="bg-background"
          >
            <Background gap={16} size={1} className="!bg-background" />
          </ReactFlow>
        </div>
        {selectedNode && !versionPanelOpen && !testPanelOpen && (
          <NodeConfigSidebar
            node={selectedNode}
            nodes={nodes}
            edges={edges}
            onChange={onNodeDataChange}
            onClose={closeSidebar}
            onDelete={deleteNode}
          />
        )}
        {versionPanelOpen && (
          <VersionHistoryPanel
            flowId={flow.id}
            currentVersion={flow.version}
            onClose={() => setVersionPanelOpen(false)}
            onRestore={() => router.refresh()}
          />
        )}
        {testPanelOpen && (
          <TestPanel
            nodes={nodes}
            edges={edges}
            onClose={() => setTestPanelOpen(false)}
            onHighlightNode={(nodeId) => {
              // Scroll to and highlight the node
              const node = nodes.find((n) => n.id === nodeId);
              if (node) setSelectedNodeId(nodeId);
            }}
          />
        )}
      </div>
    </div>
  );
}

export function FlowCanvas({ flow }: FlowCanvasProps) {
  return (
    <ReactFlowProvider>
      <FlowStatsProvider flowId={flow.id}>
        <FlowCanvasInner flow={flow} />
      </FlowStatsProvider>
    </ReactFlowProvider>
  );
}
