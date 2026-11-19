/**
 * ManyChat checks an automation before "Publicar En Vivo": if a step is
 * incomplete it does not publish, shows a red notice and opens that step.
 */
type AnyNode = { id: string; type?: string; data?: Record<string, unknown> };

export interface FlowProblem {
  nodeId: string;
  message: string;
}

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

export function validateFlow(nodes: AnyNode[]): FlowProblem | null {
  for (const n of nodes) {
    const d = (n.data ?? {}) as Record<string, any>;
    const problem = (message: string): FlowProblem => ({ nodeId: n.id, message });

    if (n.type === "sendMessage") {
      const messages = (Array.isArray(d.messages) ? d.messages : []) as Array<Record<string, any>>;
      const q = d.question as { text?: string } | undefined;
      if (messages.length === 0 && !q) return problem("Añade contenido al mensaje");
      for (const m of messages) {
        const block = m.block ?? (m.mediaType ? m.mediaType : m.carousel ? "gallery" : m.delaySeconds !== undefined ? "delay" : "text");
        if (block === "delay") continue;
        if (block === "gallery" || m.carousel) continue;
        if (["image", "video", "audio", "file"].includes(block)) {
          if (!str(m.mediaUrl)) return problem("Sube un archivo o elimina el bloque");
          continue;
        }
        if (!str(m.text)) return problem("Añade texto o elimina el bloque de texto");
        for (const b of (m.buttons ?? []) as Array<{ title?: string }>) {
          if (!str(b.title)) return problem("Añade un título al botón");
        }
      }
      if (q && !str(q.text)) return problem("Escribe la pregunta o elimina la recopilación de datos");
    }

    if (n.type === "aiResponse" && (d.aiStep === true || Array.isArray(d.tasks))) {
      const tasks = (Array.isArray(d.tasks) ? d.tasks : null) as Array<Record<string, any>> | null;
      if (!tasks || tasks.length === 0) return problem("Define las instrucciones del AI Step");
      for (const t of tasks) {
        if (!str(t.text)) return problem("Escribe la tarea o elimínala");
        if (t.saveField && !str(t.fieldSlug)) return problem("Selecciona campo de usuario para guardar");
      }
    }

    if (n.type === "condition") {
      const conds = (Array.isArray(d.conditions) ? d.conditions : []) as Array<Record<string, any>>;
      if (conds.length === 0) return problem("Añade al menos una condición");
      for (const c of conds) {
        if ((c.field === "custom_field" || c.field === "variable") && !str(c.fieldSlug)) {
          return problem("Elige el campo de la condición");
        }
        if ((c.field === "tag" || c.field === "sequence") && !str(c.value)) {
          return problem(c.field === "tag" ? "Escribe la etiqueta de la condición" : "Elige la secuencia de la condición");
        }
      }
    }

    if (n.type === "actions") {
      const actions = (Array.isArray(d.actions) ? d.actions : []) as Array<Record<string, any>>;
      if (actions.length === 0) return problem("Añade al menos una acción");
      for (const a of actions) {
        if ((a.type === "addTag" || a.type === "removeTag") && !str(a.tagName)) {
          return problem("Escribe el nombre de la etiqueta");
        }
      }
    }

    if (n.type === "action") {
      const type = d.actionType;
      if (type === "abSplit") {
        const paths = (Array.isArray(d.paths) ? d.paths : []) as Array<{ weight?: number }>;
        if (paths.length < 2) return problem("Por favor, añade al menos 2 variaciones");
        const total = paths.reduce((s, p) => s + (Number(p.weight) || 0), 0);
        if (total !== 100) return problem("Las rutas deben sumar hasta 100%. Ajusta tu distribución.");
      }
      if (type === "goToFlow" && !str(d.flowId)) return problem("Selecciona la automatización que quieres iniciar");
      if (type === "smartDelay" && d.mode === "date") {
        if ((d.dateMode ?? "specific") === "specific" && !str(d.date)) return problem("Selecciona una fecha y una hora");
        if (d.dateMode === "dynamic" && !str(d.dateField)) return problem("Selecciona el campo con la fecha");
      }
      if ((type === "addTag" || type === "removeTag") && !str(d.tagName)) return problem("Escribe el nombre de la etiqueta");
    }
  }
  return null;
}
