"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Instagram, Link2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useFlowStats } from "../flow-stats-context";

interface NodeButton {
  title: string;
  type: string;
  payload?: string;
  url?: string;
}

export interface SendMessageNodeProps {
  label?: string;
  messages?: Array<{
    text?: string;
    imageUrl?: string;
    mediaUrl?: string;
    mediaType?: string;
    quickReplies?: Array<{ title: string; payload: string }>;
    buttons?: NodeButton[];
    carousel?: { elements: Array<{ title: string; buttons?: NodeButton[] }> };
    delaySeconds?: number;
    block?: string;
  }>;
}

/**
 * Instagram message step, drawn like ManyChat's: a card with the message
 * preview and one connector per button/quick reply, so each button leads
 * straight to its own next step. The bottom connector is "Siguiente paso".
 */
export function SendMessageNode({ id, data, selected }: NodeProps) {
  const stats = useFlowStats();
  const step = stats?.nodes[id];
  const nodeData = data as SendMessageNodeProps;
  const label = nodeData.label || "Enviar mensaje";
  const messages = nodeData.messages ?? [];

  const choices: Array<{ title: string; handle: string | null; kind: "button" | "quick" | "url" }> = [];
  for (const m of messages) {
    for (const b of m.buttons ?? []) {
      if (b.type === "url") choices.push({ title: b.title, handle: null, kind: "url" });
      else if (b.payload) choices.push({ title: b.title, handle: `btn:${b.payload}`, kind: "button" });
    }
    for (const el of m.carousel?.elements ?? []) {
      for (const b of el.buttons ?? []) {
        if (b.type === "url") choices.push({ title: b.title, handle: null, kind: "url" });
        else if (b.payload) choices.push({ title: b.title, handle: `btn:${b.payload}`, kind: "button" });
      }
    }
    for (const q of m.quickReplies ?? []) {
      if (q.payload) choices.push({ title: q.title, handle: `btn:${q.payload}`, kind: "quick" });
    }
  }

  return (
    <div
      className={cn(
        "w-64 rounded-2xl border bg-card shadow-sm transition-shadow",
        selected ? "border-emerald-500 shadow-md" : "border-border",
      )}
    >
      <Handle type="target" position={Position.Left} className="!h-3 !w-3 !border-2 !border-border !bg-white" />

      <div className="flex items-center gap-2 px-3 pt-3">
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-fuchsia-500 to-orange-400 text-white">
          <Instagram className="h-3.5 w-3.5" />
        </span>
        <div className="min-w-0">
          <p className="text-[10px] leading-none text-muted-foreground">Instagram</p>
          <p className="truncate text-sm font-semibold">{label}</p>
        </div>
      </div>

      <div className="space-y-1.5 p-3">
        {messages.length === 0 && (
          <div className="rounded-xl border border-dashed border-border px-3 py-3 text-center text-xs text-muted-foreground">
            Añadir texto
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className="rounded-xl bg-muted/60 px-3 py-2 text-xs text-foreground">
            {m.delaySeconds ? (
              <p className="text-muted-foreground">⏱ Retraso de {m.delaySeconds} s</p>
            ) : m.text ? (
              <p className="line-clamp-3 whitespace-pre-wrap">{m.text}</p>
            ) : m.carousel ? (
              <p className="text-muted-foreground">Galería · {m.carousel.elements.length} tarjetas</p>
            ) : m.mediaUrl || m.imageUrl || (m.block && m.block !== "text") ? (
              <p className="text-muted-foreground">
                {m.mediaType === "video" ? "Video" : m.mediaType === "audio" ? "Audio" : m.mediaType === "file" ? "PDF" : "Imagen"}
              </p>
            ) : (
              <p className="italic text-muted-foreground">Mensaje vacío</p>
            )}
          </div>
        ))}

        {choices.map((c, i) => (
          <div
            key={`${c.handle ?? "url"}-${i}`}
            className={cn(
              "relative flex items-center justify-center gap-1 rounded-lg border px-3 py-1.5 text-center text-xs font-medium",
              c.kind === "quick" ? "rounded-full border-border" : "border-border bg-card",
            )}
          >
            {c.kind === "url" && <Link2 className="h-3 w-3 text-muted-foreground" />}
            <span className="truncate">{c.title || "Botón sin título"}</span>
            {c.handle && stats && (step?.sent ?? 0) > 0 && (
              <span
                className="ml-1 shrink-0 text-[10px] font-normal text-muted-foreground"
                title="Personas que tocaron este botón"
              >
                {stats.buttons[c.handle] ?? 0} clics
              </span>
            )}
            {c.handle && (
              <Handle
                type="source"
                id={c.handle}
                position={Position.Right}
                className="!-right-1.5 !h-3 !w-3 !border-2 !border-emerald-500 !bg-white"
              />
            )}
          </div>
        ))}
      </div>

      <div className="relative flex items-center justify-between border-t border-border px-3 py-2">
        <span className="text-[10px] text-muted-foreground" title="Personas que recibieron este paso · CTR = personas que tocaron un botón ÷ enviados">
          {stats ? `Enviados ${step?.sent ?? 0}${choices.some((c) => c.handle) ? ` · CTR ${step?.ctr ?? 0}%` : ""}` : ""}
        </span>
        <span className="text-[10px] text-muted-foreground">Siguiente paso</span>
        <Handle
          type="source"
          position={Position.Right}
          className="!-right-1.5 !h-3 !w-3 !border-2 !border-border !bg-white"
        />
      </div>
    </div>
  );
}
