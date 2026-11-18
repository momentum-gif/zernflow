"use client";

import {
  Zap,
  MessageSquare,
  GitBranch,
  Clock,
  Tag,
  FileText,
  Globe,
  ArrowRightLeft,
  UserCheck,
  Bell,
  Shuffle,
  Hourglass,
  Sparkles,
  ListOrdered,
  StickyNote,
} from "lucide-react";
import type { DragEvent } from "react";

interface PaletteItem {
  type: string;
  nodeType: string;
  label: string;
  icon: typeof Zap;
  actionType?: string;
}

interface PaletteCategory {
  name: string;
  items: PaletteItem[];
}

const categories: PaletteCategory[] = [
  {
    name: "Paso inicial",
    items: [
      { type: "trigger", nodeType: "trigger", label: "Disparador", icon: Zap },
    ],
  },
  {
    name: "Contenido",
    items: [
      {
        type: "sendMessage",
        nodeType: "sendMessage",
        label: "Mensaje de Instagram",
        icon: MessageSquare,
      },
      {
        type: "action",
        nodeType: "collectInput",
        label: "Recopilación de datos",
        icon: FileText,
        actionType: "collectInput",
      },
      {
        type: "aiResponse",
        nodeType: "aiResponse",
        label: "Respuesta con IA",
        icon: Sparkles,
      },
    ],
  },
  {
    name: "Lógico",
    items: [
      { type: "condition", nodeType: "condition", label: "Condición", icon: GitBranch },
      { type: "delay", nodeType: "delay", label: "Retraso", icon: Clock },
      {
        type: "action",
        nodeType: "abSplit",
        label: "Aleatorizador",
        icon: Shuffle,
        actionType: "abSplit",
      },
      {
        type: "action",
        nodeType: "smartDelay",
        label: "Pausa inteligente",
        icon: Hourglass,
        actionType: "smartDelay",
      },
    ],
  },
  {
    name: "Acciones",
    items: [
      {
        type: "action",
        nodeType: "addTag",
        label: "Añadir etiqueta",
        icon: Tag,
        actionType: "addTag",
      },
      {
        type: "action",
        nodeType: "removeTag",
        label: "Quitar etiqueta",
        icon: Tag,
        actionType: "removeTag",
      },
      {
        type: "action",
        nodeType: "setCustomField",
        label: "Establecer campo",
        icon: FileText,
        actionType: "setCustomField",
      },
      {
        type: "action",
        nodeType: "httpRequest",
        label: "Solicitud externa",
        icon: Globe,
        actionType: "httpRequest",
      },
      {
        type: "action",
        nodeType: "goToFlow",
        label: "Iniciar automatización",
        icon: ArrowRightLeft,
        actionType: "goToFlow",
      },
      {
        type: "action",
        nodeType: "humanTakeover",
        label: "Pasar a un humano",
        icon: UserCheck,
        actionType: "humanTakeover",
      },
      {
        type: "action",
        nodeType: "subscribe",
        label: "Subscribe",
        icon: Bell,
        actionType: "subscribe",
      },
      {
        type: "action",
        nodeType: "unsubscribe",
        label: "Unsubscribe",
        icon: Bell,
        actionType: "unsubscribe",
      },
      {
        type: "action",
        nodeType: "enrollSequence",
        label: "Enroll in Sequence",
        icon: ListOrdered,
        actionType: "enrollSequence",
      },
    ],
  },
  {
    name: "Extras",
    items: [{ type: "note", nodeType: "note", label: "Comentario", icon: StickyNote }],
  }
];

function onDragStart(event: DragEvent, item: PaletteItem) {
  const data = JSON.stringify({
    type: item.type,
    nodeType: item.nodeType,
    actionType: item.actionType,
  });
  event.dataTransfer.setData("application/reactflow", data);
  event.dataTransfer.effectAllowed = "move";
}

export function NodePalette() {
  return (
    <div className="flex w-56 flex-col border-r border-border bg-card">
      <div className="border-b border-border px-4 py-3">
        <h2 className="text-sm font-semibold">Nodes</h2>
        <p className="text-xs text-muted-foreground">Drag to canvas</p>
      </div>
      <div className="flex-1 overflow-y-auto p-3">
        {categories.map((category) => (
          <div key={category.name} className="mb-4">
            <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              {category.name}
            </h3>
            <div className="space-y-1">
              {category.items.map((item) => {
                const Icon = item.icon;
                return (
                  <div
                    key={item.nodeType}
                    draggable
                    onDragStart={(e) => onDragStart(e, item)}
                    className="flex cursor-grab items-center gap-2.5 rounded-lg border border-border bg-background px-3 py-2 text-sm transition-colors hover:bg-accent hover:text-accent-foreground active:cursor-grabbing"
                  >
                    <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <span className="text-xs font-medium">{item.label}</span>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
