"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Sparkles,
  MessageSquare,
  HelpCircle,
  UserPlus,
  GitBranch,
  Loader2,
  BookmarkPlus,
  ArrowLeft,
} from "lucide-react";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { refreshButtonPayloads } from "@/lib/flow-payloads";

// --- Template types ---

interface TemplateNode {
  id: string;
  type: string;
  position: { x: number; y: number };
  data: Record<string, unknown>;
}

interface TemplateEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
}

interface FlowTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  icon: React.ElementType;
  iconColor: string;
  iconBg: string;
  nodes: TemplateNode[];
  edges: TemplateEdge[];
}

// --- Built-in templates ---

const P = (x: number, y: number) => ({ x, y });
const edge = (source: string, target: string, sourceHandle?: string): TemplateEdge => ({
  id: `e-${source}-${sourceHandle ?? "next"}-${target}`,
  source,
  target,
  ...(sourceHandle ? { sourceHandle } : {}),
});

/** Templates modelled on ManyChat's "Plantillas", in Spanish. */
const templates: FlowTemplate[] = [
  {
    id: "comment-dm-links",
    name: "Enlaces de DM automáticos desde los comentarios",
    description:
      "Envía un enlace cuando la gente comenta una publicación o reel. Responde el comentario en público y manda el DM con un botón.",
    category: "Comentarios",
    icon: MessageSquare,
    iconColor: "text-fuchsia-600",
    iconBg: "bg-fuchsia-100",
    nodes: [
      { id: "t1", type: "trigger", position: P(0, 80), data: { triggerType: "comment_keyword", keywords: [] } },
      {
        id: "m1",
        type: "sendMessage",
        position: P(340, 40),
        data: {
          label: "Mensaje 1",
          messages: [
            {
              text: "¡Hola {{nombre}}! 👋 Gracias por comentar. Toca el botón y te envío el enlace 👇",
              buttons: [{ title: "Envíame el enlace", type: "postback", payload: "btn_tpl_link1" }],
            },
          ],
        },
      },
      {
        id: "m2",
        type: "sendMessage",
        position: P(700, 40),
        data: {
          label: "Enlace",
          messages: [
            {
              text: "Aquí lo tienes 👇",
              buttons: [{ title: "Abrir enlace", type: "url", url: "https://" }],
            },
          ],
        },
      },
    ],
    edges: [edge("t1", "m1"), edge("m1", "m2", "btn:btn_tpl_link1")],
  },
  {
    id: "story-leads",
    name: "Generar leads con historias",
    description:
      "Usa ofertas por tiempo limitado en tus historias: cuando alguien responde, le pides su correo y le envías el regalo.",
    category: "Historias",
    icon: UserPlus,
    iconColor: "text-orange-600",
    iconBg: "bg-orange-100",
    nodes: [
      { id: "t1", type: "trigger", position: P(0, 80), data: { triggerType: "story_reply", anyComment: true } },
      {
        id: "c1",
        type: "action",
        position: P(340, 60),
        data: {
          actionType: "collectInput",
          question: "¡Gracias por responder, {{nombre}}! 🙌 ¿A qué correo te envío el regalo?",
          inputType: "email",
          variableName: "email",
          retryText: "Ese correo no parece válido. ¿Me lo escribes de nuevo? 🙏",
        },
      },
      {
        id: "m1",
        type: "sendMessage",
        position: P(700, 60),
        data: {
          label: "Confirmación",
          messages: [{ text: "¡Listo! Te lo envié a {{email}} 📩" }],
        },
      },
    ],
    edges: [edge("t1", "c1"), edge("c1", "m1")],
  },
  {
    id: "answer-all-dms",
    name: "Responde todos tus DMs",
    description: "Envía respuestas automáticas cuando te escriben un DM que no coincide con ninguna otra automatización.",
    category: "DM",
    icon: HelpCircle,
    iconColor: "text-blue-600",
    iconBg: "bg-blue-100",
    nodes: [
      { id: "t1", type: "trigger", position: P(0, 80), data: { triggerType: "default" } },
      {
        id: "m1",
        type: "sendMessage",
        position: P(340, 60),
        data: {
          label: "Respuesta",
          messages: [{ text: "¡Gracias por escribir, {{nombre}}! 🙌 Te respondo personalmente muy pronto." }],
        },
      },
    ],
    edges: [edge("t1", "m1")],
  },
  {
    id: "affiliate-links",
    name: "Enviar enlaces de productos afiliados",
    description: "Cuando alguien te escribe una palabra clave, recibe tus enlaces de productos con botones.",
    category: "DM",
    icon: GitBranch,
    iconColor: "text-emerald-600",
    iconBg: "bg-emerald-100",
    nodes: [
      { id: "t1", type: "trigger", position: P(0, 80), data: { triggerType: "keyword", keywords: [{ value: "LINKS", matchType: "contains" }] } },
      {
        id: "m1",
        type: "sendMessage",
        position: P(340, 60),
        data: {
          label: "Mis productos",
          messages: [
            {
              text: "¡Aquí tienes mis recomendaciones! 🛍️",
              buttons: [
                { title: "Producto 1", type: "url", url: "https://" },
                { title: "Producto 2", type: "url", url: "https://" },
              ],
            },
          ],
        },
      },
    ],
    edges: [edge("t1", "m1")],
  },
  {
    id: "comments-to-followers",
    name: "Convierte comentarios en clientes",
    description:
      "Responde el comentario, ofrece tu recurso por DM y etiqueta a quien lo toca para seguirle después con una secuencia.",
    category: "Comentarios",
    icon: Sparkles,
    iconColor: "text-violet-600",
    iconBg: "bg-violet-100",
    nodes: [
      { id: "t1", type: "trigger", position: P(0, 80), data: { triggerType: "comment_keyword", keywords: [] } },
      {
        id: "m1",
        type: "sendMessage",
        position: P(340, 40),
        data: {
          label: "Oferta",
          messages: [
            {
              text: "¡Hola {{nombre}}! Vi tu comentario 🙌 ¿Quieres que te envíe la guía gratis?",
              buttons: [{ title: "¡Sí, quiero! ✅", type: "postback", payload: "btn_tpl_yes1" }],
            },
          ],
        },
      },
      { id: "a1", type: "action", position: P(700, 40), data: { actionType: "addTag", tagName: "interesado" } },
      {
        id: "m2",
        type: "sendMessage",
        position: P(1020, 40),
        data: { label: "Guía", messages: [{ text: "Aquí está tu guía 👇", buttons: [{ title: "Abrir guía", type: "url", url: "https://" }] }] },
      },
    ],
    edges: [edge("t1", "m1"), edge("m1", "a1", "btn:btn_tpl_yes1"), edge("a1", "m2")],
  },
];

export function TemplatesView({ workspaceId }: { workspaceId: string }) {
  const router = useRouter();
  const [creating, setCreating] = useState<string | null>(null);
  const pendingRef = useRef(false);

  async function handleUseTemplate(template: FlowTemplate) {
    if (pendingRef.current) return;
    pendingRef.current = true;
    setCreating(template.id);

    try {
      const res = await fetch("/api/v1/flows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: template.name,
          description: template.description,
          ...refreshButtonPayloads(template.nodes, template.edges),
        }),
      });

      if (!res.ok) {
        throw new Error("Failed to create flow");
      }

      const flow = await res.json();
      router.push(`/dashboard/flows/${flow.id}`);
    } catch (err) {
      console.error("Failed to create flow from template:", err);
      pendingRef.current = false;
      setCreating(null);
    }
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="border-b border-border px-8 py-6">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <Link
                href="/dashboard/flows"
                className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                <ArrowLeft className="h-4 w-4" />
                Mis automatizaciones
              </Link>
            </div>
            <h1 className="text-2xl font-bold">Plantillas</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Empieza con una automatización lista y adáptala a lo que necesitas
            </p>
          </div>
          <button
            disabled
            className="inline-flex items-center gap-2 rounded-lg border border-dashed border-border px-4 py-2 text-sm font-medium text-muted-foreground cursor-not-allowed opacity-60"
            title="Próximamente"
          >
            <BookmarkPlus className="h-4 w-4" />
            Guardar como plantilla
          </button>
        </div>
      </div>

      {/* Template gallery */}
      <div className="flex-1 overflow-auto p-8">
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {templates.map((template) => {
            const isCreating = creating === template.id;
            const Icon = template.icon;
            const nodeCount = template.nodes.length;

            return (
              <div
                key={template.id}
                className="group rounded-xl border border-border bg-card p-6 transition-colors hover:border-primary/50"
              >
                {/* Icon + category */}
                <div className="flex items-start justify-between">
                  <div
                    className={cn(
                      "flex h-10 w-10 items-center justify-center rounded-lg",
                      template.iconBg
                    )}
                  >
                    <Icon className={cn("h-5 w-5", template.iconColor)} />
                  </div>
                  <span className="rounded-full bg-muted px-2.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                    {template.category}
                  </span>
                </div>

                {/* Name + description */}
                <h3 className="mt-4 text-sm font-semibold group-hover:text-primary transition-colors">
                  {template.name}
                </h3>
                <p className="mt-2 text-xs text-muted-foreground leading-relaxed">
                  {template.description}
                </p>

                {/* Node count */}
                <div className="mt-4 flex items-center gap-1.5 text-xs text-muted-foreground">
                  <GitBranch className="h-3 w-3" />
                  <span>
                    {nodeCount} {nodeCount === 1 ? "paso" : "pasos"}
                  </span>
                </div>

                {/* Use template button */}
                <button
                  onClick={() => handleUseTemplate(template)}
                  disabled={!!creating}
                  className="mt-4 w-full rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50 transition-opacity"
                >
                  {isCreating ? (
                    <span className="inline-flex items-center gap-2">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Creando...
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-2">
                      <Sparkles className="h-3.5 w-3.5" />
                      Usar plantilla
                    </span>
                  )}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
