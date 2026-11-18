"use client";

import { useEffect, useRef, useState } from "react";
import type { Edge, Node } from "@xyflow/react";
import { ChevronLeft, RotateCcw, Send, X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * ManyChat's "Vista previa": an Instagram phone where you play the whole
 * automation — tap the buttons, answer questions — step by step.
 */

type Item =
  | { kind: "bot"; text?: string; media?: string; buttons?: string[]; cards?: Array<{ title: string; buttons: string[] }> }
  | { kind: "user"; text: string }
  | { kind: "system"; text: string };

type Waiting =
  | { kind: "choices"; nodeId: string; choices: Array<{ title: string; handle: string | null; url?: string }> }
  | { kind: "input"; nodeId: string; question: string }
  | { kind: "branch"; nodeId: string; options: Array<{ title: string; handle: string }> }
  | null;

const SAMPLE: Record<string, string> = {
  nombre: "Ana",
  nombre_completo: "Ana García",
  usuario: "ana.garcia",
  message: "Hola",
};

const fill = (t: string, vars: Record<string, string>) =>
  t.replace(/\{\{(\w+)\}\}/g, (m, k: string) => vars[k] ?? m);

const ACTION_NAMES: Record<string, string> = {
  addTag: "Añadir etiqueta",
  removeTag: "Eliminar etiqueta",
  setCustomField: "Establecer campo",
  clearCustomField: "Borrar campo",
  deleteContact: "Eliminar contacto",
  enrollSequence: "Suscribir a secuencia",
  unenrollSequence: "Cancelar secuencia",
  httpRequest: "Solicitud externa",
  pauseAutomations: "Pausar automatizaciones",
  openConversation: "Marcar conversación abierta",
  closeConversation: "Marcar conversación cerrada",
  goToFlow: "Iniciar otra automatización",
  humanTakeover: "Pasar a un humano",
};

export function PreviewSimulator({
  nodes,
  edges,
  username,
  onClose,
}: {
  nodes: Node[];
  edges: Edge[];
  username?: string;
  onClose: () => void;
}) {
  const [items, setItems] = useState<Item[]>([]);
  const [waiting, setWaiting] = useState<Waiting>(null);
  const [vars, setVars] = useState<Record<string, string>>(SAMPLE);
  const [draft, setDraft] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  const triggers = nodes.filter((n) => n.type === "trigger");
  const [triggerId, setTriggerId] = useState(triggers[0]?.id ?? "");

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [items, waiting]);

  const next = (id: string, handle?: string | null) =>
    edges.find((e) => e.source === id && (handle ? e.sourceHandle === handle : !e.sourceHandle || e.sourceHandle === "default"))
      ?.target;

  function run(startId: string | undefined, acc: Item[], v: Record<string, string>) {
    let id = startId;
    let guard = 0;
    while (id && guard++ < 40) {
      const node = nodes.find((n) => n.id === id);
      if (!node) break;
      const d = node.data as Record<string, any>;

      if (node.type === "sendMessage") {
        const choices: Array<{ title: string; handle: string | null; url?: string }> = [];
        for (const m of (d.messages ?? []) as Array<Record<string, any>>) {
          if (m.delaySeconds) {
            acc.push({ kind: "system", text: `⏱ escribiendo… (${m.delaySeconds} s)` });
            continue;
          }
          const buttons = (m.buttons ?? []) as Array<{ title: string; type: string; payload?: string; url?: string }>;
          const cards = (m.carousel?.elements ?? []) as Array<{ title: string; buttons?: Array<{ title: string; type: string; payload?: string; url?: string }> }>;
          acc.push({
            kind: "bot",
            text: m.text ? fill(m.text, v) : undefined,
            media: m.mediaUrl || m.imageUrl ? (m.mediaType === "file" ? "📄 PDF" : m.mediaType === "video" ? "🎬 Video" : m.mediaType === "audio" ? "🎧 Audio" : "🖼 Imagen") : undefined,
            buttons: buttons.map((b) => b.title || "Botón"),
            cards: cards.length ? cards.map((c) => ({ title: c.title || "Tarjeta", buttons: (c.buttons ?? []).map((b) => b.title) })) : undefined,
          });
          for (const b of [...buttons, ...cards.flatMap((c) => c.buttons ?? [])]) {
            choices.push({ title: b.title || "Botón", handle: b.type === "url" ? null : b.payload ? `btn:${b.payload}` : null, url: b.url });
          }
          for (const q of (m.quickReplies ?? []) as Array<{ title: string; payload: string }>) {
            choices.push({ title: q.title || "Respuesta", handle: q.payload ? `btn:${q.payload}` : null });
          }
        }
        if (choices.length > 0) {
          setItems([...acc]);
          setVars(v);
          setWaiting({ kind: "choices", nodeId: node.id, choices });
          return;
        }
        id = next(node.id);
        continue;
      }

      if (node.type === "action" && d.actionType === "collectInput") {
        if (d.question) acc.push({ kind: "bot", text: fill(String(d.question), v), buttons: d.inputType === "choice" ? d.options : undefined });
        setItems([...acc]);
        setVars(v);
        setWaiting({ kind: "input", nodeId: node.id, question: String(d.variableName || "respuesta") });
        return;
      }

      if (node.type === "condition") {
        acc.push({ kind: "system", text: "🔀 Condición: elige qué camino probar" });
        setItems([...acc]);
        setVars(v);
        setWaiting({ kind: "branch", nodeId: node.id, options: [{ title: "Sí", handle: "yes" }, { title: "No", handle: "no" }] });
        return;
      }

      if (node.type === "action" && d.actionType === "abSplit") {
        // Like ManyChat: the randomizer picks a variation by its percentage.
        const paths = (d.paths ?? [{ name: "A", weight: 50 }, { name: "B", weight: 50 }]) as Array<{ name: string; weight: number }>;
        const total = paths.reduce((s, p) => s + (Number(p.weight) || 0), 0);
        let r = Math.random() * (total || 1);
        let pick = paths.length - 1;
        for (let i = 0; i < paths.length; i++) {
          r -= Number(paths[i].weight) || 0;
          if (r < 0) { pick = i; break; }
        }
        acc.push({ kind: "system", text: `🔀 Aleatorizador → ${paths[pick]?.name ?? "A"}` });
        id = next(node.id, `split-${pick}`);
        continue;
      }

      if (node.type === "actions") {
        const names = ((d.actions ?? []) as Array<{ type: string; tagName?: string }>).map(
          (a) => `${ACTION_NAMES[a.type] ?? a.type}${a.tagName ? `: ${a.tagName}` : ""}`,
        );
        acc.push({ kind: "system", text: `⚡ ${names.join(" · ") || "Acciones"}` });
      } else if (node.type === "action") {
        acc.push({ kind: "system", text: `⚡ ${ACTION_NAMES[d.actionType] ?? (d.actionType === "smartDelay" ? "Pausa inteligente" : "Acción")}` });
        if (d.actionType === "goToFlow" || d.actionType === "humanTakeover") break;
      } else if (node.type === "delay") {
        acc.push({ kind: "system", text: `⏱ Retraso de ${d.duration ?? ""} ${d.unit ?? ""}` });
      } else if (node.type === "aiResponse") {
        acc.push({ kind: "bot", text: "🤖 (Respuesta generada por IA)" });
      }
      id = next(node.id);
    }
    acc.push({ kind: "system", text: "Fin de la automatización" });
    setItems([...acc]);
    setVars(v);
    setWaiting(null);
  }

  function start() {
    const trig = nodes.find((n) => n.id === triggerId);
    if (!trig) return;
    const d = trig.data as Record<string, any>;
    const acc: Item[] = [];
    const kw = (d.keywords?.[0]?.value as string | undefined) ?? "Hola";
    if (d.triggerType === "comment_keyword") {
      acc.push({ kind: "system", text: `💬 ${SAMPLE.usuario} comentó: "${d.anyComment ? "¡Me interesa!" : kw}"` });
      const reply = typeof d.replyText === "string" ? d.replyText.split("||").filter((r: string) => r.trim())[0] : undefined;
      if (reply && d.replyEnabled !== false) acc.push({ kind: "system", text: `↩️ Respuesta pública: "${fill(reply, SAMPLE)}"` });
    } else if (d.triggerType === "story_reply") {
      acc.push({ kind: "user", text: `↪︎ Respondió a tu historia: ${d.anyComment === false ? kw : "😍"}` });
    } else if (d.triggerType === "keyword") {
      acc.push({ kind: "user", text: kw });
    } else if (d.triggerType === "story_mention") {
      acc.push({ kind: "system", text: "📸 Te mencionó en su historia" });
    } else if (d.triggerType === "ref_url") {
      acc.push({ kind: "system", text: `🔗 Abrió tu enlace ?ref=${d.ref ?? ""}` });
    } else {
      acc.push({ kind: "system", text: "▶️ Inicia la automatización" });
    }
    run(next(trig.id), acc, { ...SAMPLE });
  }

  useEffect(() => {
    start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [triggerId]);

  function choose(title: string, handle: string | null, url?: string) {
    if (!waiting) return;
    const acc: Item[] = [...items, { kind: "user", text: title }];
    if (url !== undefined && !handle) {
      acc.push({ kind: "system", text: `🌐 Abre ${url || "el enlace"}` });
      setItems(acc);
      return;
    }
    run(handle ? next(waiting.nodeId, handle) : undefined, acc, vars);
  }

  function answer() {
    if (!waiting || waiting.kind !== "input" || !draft.trim()) return;
    const v = { ...vars, [waiting.question]: draft.trim() };
    const acc: Item[] = [...items, { kind: "user", text: draft.trim() }];
    setDraft("");
    run(next(waiting.nodeId), acc, v);
  }

  return (
    <div className="flex w-[340px] shrink-0 flex-col border-l border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <p className="text-sm font-semibold">Vista previa</p>
        <div className="flex items-center gap-1">
          <button onClick={start} className="rounded p-1.5 text-muted-foreground hover:bg-muted" title="Reiniciar">
            <RotateCcw className="h-4 w-4" />
          </button>
          <button onClick={onClose} className="rounded p-1.5 text-muted-foreground hover:bg-muted" aria-label="Cerrar">
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {triggers.length > 1 && (
        <div className="border-b border-border px-4 py-2">
          <select value={triggerId} onChange={(e) => setTriggerId(e.target.value)} className="w-full rounded border border-border bg-card px-2 py-1 text-xs">
            {triggers.map((t, i) => (
              <option key={t.id} value={t.id}>
                Disparador {i + 1}: {String((t.data as { label?: string; triggerType?: string }).label || (t.data as { triggerType?: string }).triggerType)}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="flex min-h-0 flex-1 items-center justify-center p-4">
        <div className="flex h-full max-h-[620px] w-full flex-col overflow-hidden rounded-[2rem] border-[6px] border-neutral-900 bg-neutral-950 text-white shadow-xl">
          <div className="flex items-center gap-2 border-b border-neutral-800 px-3 py-2.5">
            <ChevronLeft className="h-4 w-4 text-neutral-400" />
            <span className="h-6 w-6 rounded-full bg-gradient-to-br from-fuchsia-500 to-orange-400" />
            <span className="text-xs font-semibold">{username ?? "tu_cuenta"}</span>
          </div>

          <div ref={scrollRef} className="flex-1 space-y-2 overflow-y-auto px-3 py-3 text-[12px]">
            {items.map((it, i) =>
              it.kind === "system" ? (
                <p key={i} className="text-center text-[10px] text-neutral-500">
                  {it.text}
                </p>
              ) : it.kind === "user" ? (
                <div key={i} className="flex justify-end">
                  <span className="max-w-[80%] rounded-2xl bg-blue-600 px-3 py-2">{it.text}</span>
                </div>
              ) : (
                <div key={i} className="max-w-[85%] overflow-hidden rounded-2xl bg-neutral-800">
                  {it.media && <div className="flex h-24 items-center justify-center bg-neutral-700 text-[11px]">{it.media}</div>}
                  {it.text && <p className="whitespace-pre-wrap px-3 py-2">{it.text}</p>}
                  {it.buttons?.map((b, j) => (
                    <div key={j} className="border-t border-neutral-700 py-1.5 text-center font-semibold">
                      {b}
                    </div>
                  ))}
                  {it.cards && (
                    <div className="flex gap-2 overflow-x-auto p-2">
                      {it.cards.map((c, j) => (
                        <div key={j} className="w-32 shrink-0 rounded-xl bg-neutral-700 p-2 text-[10px]">
                          <p className="font-semibold">{c.title}</p>
                          {c.buttons.map((b, k) => (
                            <p key={k} className="mt-1 border-t border-neutral-600 pt-1 text-center">
                              {b}
                            </p>
                          ))}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ),
            )}
          </div>

          {waiting && waiting.kind !== "input" && (
            <div className="flex flex-wrap justify-center gap-1.5 border-t border-neutral-800 p-2">
              {(waiting.kind === "choices" ? waiting.choices : waiting.options.map((o) => ({ ...o, url: undefined }))).map(
                (c, i) => (
                  <button
                    key={i}
                    onClick={() => choose(c.title, c.handle, "url" in c ? c.url : undefined)}
                    className={cn("rounded-full border border-neutral-600 px-3 py-1 text-[11px] hover:bg-neutral-800")}
                  >
                    {c.title}
                  </button>
                ),
              )}
            </div>
          )}

          <div className="flex items-center gap-2 border-t border-neutral-800 px-3 py-2">
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && answer()}
              disabled={waiting?.kind !== "input"}
              placeholder={waiting?.kind === "input" ? "Escribe tu respuesta…" : "Mensaje…"}
              className="flex-1 rounded-full bg-neutral-800 px-3 py-1.5 text-[11px] text-white placeholder:text-neutral-500 focus:outline-none disabled:opacity-60"
            />
            <button onClick={answer} disabled={waiting?.kind !== "input"} className="text-blue-400 disabled:opacity-40" aria-label="Enviar">
              <Send className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
      <p className="px-4 pb-3 text-center text-[10px] text-muted-foreground">
        Es una simulación: no se envía nada a Instagram.
      </p>
    </div>
  );
}
