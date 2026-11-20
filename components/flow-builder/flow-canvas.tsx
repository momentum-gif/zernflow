"use client";

import { askConfirm } from "@/components/dialogs";

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
import { Check, ChevronRight, Copy, Redo2, Rocket, Loader2, History, Play, Download, Trash2, MoreVertical, Undo2 } from "lucide-react";
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

type Flow = Database["public"]["Tables"]["flows"]["Row"];

import { NoteNode } from "./nodes/note-node";
import { getDefaultData, getNodeId } from "./flow-node-defaults";
import { ActionsNode } from "./nodes/actions-node";
import { FlowStatsProvider } from "./flow-stats-context";
import { KeyMetricsPanel, StepMetricsPanel } from "./metrics-panels";
import { PreviewSimulator } from "./preview-simulator";
import { ConnectDropMenu, type PendingConnection } from "./connect-drop-menu";
import { validateFlow } from "@/lib/flow-validation";
import { isFlowStopped } from "@/lib/flow-triggers";
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
  // Like ManyChat, a published automation opens on its metrics; "Editar" switches to the editor.
  const [viewMode, setViewMode] = useState(false);
  const [metricsOpen, setMetricsOpen] = useState(true);
  const [versionPanelOpen, setVersionPanelOpen] = useState(false);
  const [testPanelOpen, setTestPanelOpen] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  // ManyChat-style notices after "Publicar En Vivo" (red = problem, green = live).
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 4500);
    return () => clearTimeout(t);
  }, [notice]);
  // What was last published, to show "✓ Guardado" on the button until something changes.
  const contentKey = (ns: Node[], es: Edge[]) =>
    JSON.stringify([
      ns.map((n) => [n.id, n.type, n.data]),
      es.map((e) => [e.source, e.sourceHandle ?? null, e.target]),
    ]);
  const [publishedKey, setPublishedKey] = useState<string | null>(null);
  const publishedInit = useRef(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [pendingConnection, setPendingConnection] = useState<PendingConnection | null>(null);
  const [deleting, setDeleting] = useState(false);

  const selectedNode = selectedNodeId
    ? nodes.find((n) => n.id === selectedNodeId) || null
    : null;

  // ManyChat-style phone preview for message steps and the comment trigger.
  const [igUsername, setIgUsername] = useState<string | undefined>();
  useEffect(() => {
    fetch("/api/v1/channels")
      .then((r) => (r.ok ? r.json() : []))
      .then((channels: Array<{ platform: string; username: string | null; is_active: boolean }>) =>
        setIgUsername(channels.find((c) => c.platform === "instagram" && c.is_active)?.username ?? undefined)
      )
      .catch(() => {});
  }, []);

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

  // Autosave like ManyChat ("Guardado"), plus undo / redo of canvas changes.
  const firstRender = useRef(true);
  const history = useRef<{ past: Array<{ nodes: Node[]; edges: Edge[] }>; future: Array<{ nodes: Node[]; edges: Edge[] }> }>({
    past: [],
    future: [],
  });
  const restoring = useRef(false);
  const lastSnapshot = useRef<{ nodes: Node[]; edges: Edge[] }>({ nodes: initialNodes, edges: initialEdges });
  const [, forceHistoryRender] = useState(0);

  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    const t = setTimeout(() => {
      if (!restoring.current) {
        history.current.past.push(lastSnapshot.current);
        if (history.current.past.length > 50) history.current.past.shift();
        history.current.future = [];
      }
      restoring.current = false;
      lastSnapshot.current = { nodes, edges };
      forceHistoryRender((n) => n + 1);
      saveFlow();
    }, 1200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes, edges, flowName]);

  const undo = () => {
    const prev = history.current.past.pop();
    if (!prev) return;
    history.current.future.push(lastSnapshot.current);
    restoring.current = true;
    setNodes(prev.nodes);
    setEdges(prev.edges);
  };
  const redo = () => {
    const nxt = history.current.future.pop();
    if (!nxt) return;
    history.current.past.push(lastSnapshot.current);
    restoring.current = true;
    setNodes(nxt.nodes);
    setEdges(nxt.edges);
  };
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
    // Like ManyChat: check every step first; if one is incomplete, open it and stop.
    const problem = validateFlow(nodes as never);
    if (problem) {
      setSelectedNodeId(problem.nodeId);
      setNotice({ ok: false, text: problem.message });
      return;
    }
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
      setPublishedKey(contentKey(nodes, edges));
      setNotice({ ok: true, text: "La automatización está activa" });
      router.refresh();
    } finally {
      setPublishing(false);
    }
  }, [saveFlow, flow.id, nodes, edges]);

  // On open: compare with the last published version. If nothing changed, the
  // button shows "✓ Guardado" and (like ManyChat) the automation opens on its
  // metrics; with unpublished changes it opens in the editor.
  useEffect(() => {
    if (publishedInit.current) return;
    publishedInit.current = true;
    if (flow.status !== "published") return;
    const here = contentKey(nodes, edges);
    supabase
      .from("flow_versions")
      .select("nodes, edges")
      .eq("flow_id", flow.id)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data: v }) => {
        const vNodes = (Array.isArray(v?.nodes) ? v!.nodes : []) as unknown as Node[];
        const vEdges = (Array.isArray(v?.edges) ? v!.edges : []) as unknown as Edge[];
        if (v && contentKey(vNodes, vEdges) === here) {
          setPublishedKey(here);
          setViewMode(true);
        }
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const upToDate = publishedKey !== null && publishedKey === contentKey(nodes, edges);
  const stopped = flow.status === "published" && isFlowStopped(nodes);

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
            {stopped ? "DETENIDA" : flow.status === "published" ? "ACTIVO" : flow.status === "archived" ? "EN PAPELERA" : "BORRADOR"}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {saveError && (
            <span className="text-xs font-medium text-destructive">
              {saveError}
            </span>
          )}
          {!saveError && (
            <span className="text-xs text-muted-foreground">
              {saving ? "Guardando…" : lastSaved ? "✓ Guardado" : ""}
            </span>
          )}
          <button
            onClick={undo}
            disabled={history.current.past.length === 0}
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-accent disabled:opacity-30"
            title="Deshacer"
          >
            <Undo2 className="h-4 w-4" />
          </button>
          <button
            onClick={redo}
            disabled={history.current.future.length === 0}
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-accent disabled:opacity-30"
            title="Rehacer"
          >
            <Redo2 className="h-4 w-4" />
          </button>
          <div className="mx-1 h-5 w-px bg-border" />
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
            onClick={handlePublish}
            disabled={publishing || upToDate}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-white transition-colors",
              upToDate ? "bg-blue-600/40" : "bg-blue-600 hover:bg-blue-700 disabled:opacity-50"
            )}
          >
            {publishing ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : upToDate ? (
              <Check className="h-3.5 w-3.5" />
            ) : (
              <Rocket className="h-3.5 w-3.5" />
            )}
            {upToDate ? "Guardado" : "Publicar en vivo"}
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
                      if (!(await askConfirm("¿Volver a la última versión publicada? Se perderán los cambios sin publicar.", { destructive: true }))) return;
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

      {notice && (
        <div
          className={cn(
            "fixed bottom-6 right-6 z-[60] flex max-w-xs items-start gap-3 rounded-lg px-4 py-3 text-sm text-white shadow-xl",
            notice.ok ? "bg-emerald-700" : "bg-red-700"
          )}
        >
          <span className="flex-1">{notice.text}</span>
          <button type="button" onClick={() => setNotice(null)} className="opacity-80 hover:opacity-100" aria-label="Cerrar">
            ✕
          </button>
        </div>
      )}

      {/* Canvas area */}
      <div className="flex flex-1 overflow-hidden">
        {viewMode &&
          !versionPanelOpen &&
          (selectedNode ? (
            <StepMetricsPanel
              nodeId={selectedNode.id}
              title={String((selectedNode.data as { label?: string })?.label || (selectedNode.type === "sendMessage" ? "Enviar mensaje" : "Paso"))}
              isMessage={selectedNode.type === "sendMessage"}
              onClose={closeSidebar}
            />
          ) : metricsOpen ? (
            <KeyMetricsPanel flowId={flow.id} />
          ) : null)}
        {!viewMode && selectedNode && !versionPanelOpen && (
          <NodeConfigSidebar
            node={selectedNode}
            nodes={nodes}
            edges={edges}
            onChange={onNodeDataChange}
            onClose={closeSidebar}
            onDelete={deleteNode}
            flowId={flow.id}
          />
        )}
        <div ref={reactFlowWrapper} className="relative flex-1">
          {viewMode && !selectedNode && !versionPanelOpen && (
            <button
              onClick={() => setMetricsOpen((o) => !o)}
              title={metricsOpen ? "Ocultar métricas" : "Mostrar métricas"}
              aria-label={metricsOpen ? "Ocultar métricas" : "Mostrar métricas"}
              className="absolute left-2 top-1/2 z-20 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-card text-muted-foreground shadow-sm hover:text-foreground"
            >
              {metricsOpen ? "‹" : "›"}
            </button>
          )}
          {viewMode && (
            <div className="absolute left-1/2 top-3 z-20 flex -translate-x-1/2 items-center gap-3 rounded-md border border-amber-300 bg-amber-50 px-4 py-1.5 text-sm text-amber-900 shadow-sm dark:border-amber-700 dark:bg-amber-950/60 dark:text-amber-100">
              Está viendo una versión publicada
              <button
                onClick={() => {
                  setViewMode(false);
                  setSelectedNodeId(null);
                }}
                className="font-medium text-blue-600 underline-offset-2 hover:underline"
              >
                Editar
              </button>
            </div>
          )}
          {!viewMode && pendingConnection && (
            <ConnectDropMenu
              pending={pendingConnection}
              onClose={() => setPendingConnection(null)}
              onCreated={(id) => setSelectedNodeId(id)}
            />
          )}
          {!viewMode && (
            <CanvasControls
              wrapper={reactFlowWrapper}
              onAdded={(id) => setSelectedNodeId(id)}
              onArrange={() => setNodes((nds) => arrangeNodes(nds, edges))}
            />
          )}
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            // ManyChat: "Acción en respuesta" can only be connected to an Actions step.
            isValidConnection={(c) =>
              c.sourceHandle !== "reply" || nodes.find((n) => n.id === c.target)?.type === "actions"
            }
            onConnectEnd={(event, state) => {
              if (state.isValid || !state.fromNode) return;
              const point = "changedTouches" in event ? event.changedTouches[0] : event;
              setPendingConnection({
                source: state.fromNode.id,
                sourceHandle: state.fromHandle?.id ?? null,
                screen: { x: point.clientX, y: point.clientY },
                from: state.from ? { x: state.from.x, y: state.from.y } : null,
              });
            }}
            onDrop={onDrop}
            onDragOver={onDragOver}
            onNodeClick={onNodeClick}
            onPaneClick={onPaneClick}
            nodeTypes={nodeTypes}
            fitView
            nodesDraggable={!viewMode}
            nodesConnectable={!viewMode}
            edgesReconnectable={!viewMode}
            deleteKeyCode={viewMode ? null : ["Backspace", "Delete"]}
            proOptions={{ hideAttribution: true }}
            className="bg-background"
          >
            <Background gap={16} size={1} className="!bg-background" />
          </ReactFlow>
        </div>
        {versionPanelOpen && (
          <VersionHistoryPanel
            flowId={flow.id}
            currentVersion={flow.version}
            onClose={() => setVersionPanelOpen(false)}
            onRestore={() => router.refresh()}
          />
        )}
        {testPanelOpen && (
          <PreviewSimulator
            nodes={nodes}
            edges={edges}
            username={igUsername}
            onClose={() => setTestPanelOpen(false)}
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
