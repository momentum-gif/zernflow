# ZernFlow: contexto para Claude

Lee este archivo completo antes de tocar nada.

## Quién es el dueño y cómo hablarle

- Enrique, hispanohablante (El Salvador, usa voseo). **Respondé siempre en español.**
- No es técnico. Explicaciones simples, sin jerga. En tareas técnicas (servidores, Vercel, Supabase, claves): **un paso por mensaje** y esperar su respuesta.
- Nunca le pidas que pegue contraseñas o claves en el chat; él las escribe directo en el servicio.
- No compres ni actives crédito pago de IA (Vercel AI Gateway): perdería el plan gratis.

## Qué es este proyecto

Fork de ZernFlow que automatiza DMs y comentarios de Instagram. Reemplaza a ManyChat.

- Repo: `momentum-gif/zernflow`. Se trabaja y se sube **directo a `main`**.
- Web: https://zernflow-flame.vercel.app (Vercel, deploy automático al hacer push).
- Base de datos: Supabase (con RLS).
- Conexión con Instagram: Zernio (API "late").
- IA: Vercel AI Gateway (plan gratis de $5/mes, solo algunos modelos). La clave la guardó Enrique en la configuración del workspace.
- Instagram principal: @ennrique.lopez. Cuenta de prueba para comentar y escribir: walter07609.
- Cron externo en cron-job.org, cada minuto: `/api/cron/jobs` y `/api/cron/sequences`.

## Regla de oro: copia literal de ManyChat

- ZernFlow debe ser una **copia exhaustiva y literal de ManyChat**: interfaz, orden, opciones, textos y comportamiento.
- Excepción: lo que dependa de límites de Instagram o Zernio, o de servicios propios de ManyChat.
- **No agregues nada que ManyChat no permita.** Palabras de Enrique: "si no es posible en ManyChat, por algo será".
- La única extra aprobada es el botón "Automatizaciones" del Inbox (enviar un flujo a mano).
- Ante la duda, verificá en su cuenta real de ManyChat. La suele tener abierta en el navegador integrado.
- **No publiques ni actives nada en su ManyChat real** que pueda actuar sobre su Instagram.

## Reglas de Meta (para evitar bloqueos)

- **Una sola respuesta privada por comentario**, dentro de los 7 días.
- Mensajes automáticos solo dentro de las **24 h** desde el último mensaje del contacto.
- **Entre 24 h y 7 días:** solo mensajes manuales, con la etiqueta HUMAN_AGENT.
- **Después de 7 días:** bloqueado.
- Límite de 750 respuestas privadas por hora.
- Si algo choca con estas reglas, se bloquea y se avisa en la interfaz, igual que ManyChat.

## Cómo subir cambios

```bash
git pull -q --rebase origin main
git -c user.name="momentum-gif" -c user.email="momentum-gif@users.noreply.github.com" commit -m "..."
git -c push.negotiate=true push -q origin HEAD:main
# verificar el deploy:
gh api repos/momentum-gif/zernflow/commits/$(git rev-parse HEAD)/status --jq '.state'
```

- Si el build falla, los logs están en Vercel.
- Es típico un error de TypeScript en casts de joins de Supabase sin FK. Se arregla con `as unknown as`.

## Mapa del código (lo más importante)

### Motor: `lib/flow-engine/engine.ts`

- **`sendMessage`:** calcula un "gate".
  - Si el flujo vino de un comentario, va **una respuesta privada** que junta todos los textos y la pregunta.
  - Si la ventana está cerrada o la respuesta privada ya se usó, pausa.
  - Si no, envío normal.
- **Pregunta del bloque de mensaje** (`askMessageQuestion`): guarda `__last_question` y programa un job `input_timeout`. Ese job sigue la salida roja `noreply`.
- **Handles de salida:**
  - `reply` (amarilla, solo puede ir a Acciones).
  - `noreply` (roja, el seguimiento).
  - `split-<i>` (randomizador).
  - `btn:<payload>`.
  - `yes`/`no`.
  - Sin id = "Siguiente paso".
- **Variables de sesión:** `__ci_expires_at`, `__ci_retries`, `__last_question`, `__pr_sent`, `__dm_replied`, `__ai_history`, `__ai_node`, `comment_id`, `post_id`, `nombre`.
- **`interpolateVariables`:** si `{{nombre}}` no tiene valor, lo quita (nunca se envía literal).

### Bloques y lógica

- **AI Step:**
  - Lógica en `lib/ai-step.ts`: cadena de modelos con respaldo, temperatura 0.2.
  - Termina cuando todos los campos obligatorios de las tareas están llenos.
  - Respeta el estilo del contexto (sin ¿¡, minúsculas).
  - Panel: `components/flow-builder/panels/AiStepPanel.tsx`, con vista previa que arranca desde la pregunta anterior.
- **Pausa inteligente:** `lib/smart-delay.ts`.
- **Validación antes de publicar:** `lib/flow-validation.ts`, con los mismos mensajes que ManyChat.
- **Disparadores:** `lib/flow-triggers.ts`.
  - El interruptor "Activa este disparador" guarda `data.active=false` en el nodo.
  - Ruta `/api/v1/flows/[flowId]/trigger-active`.
  - Si todos los disparadores están apagados, la automatización queda DETENIDA.
- **Editor:** `components/flow-builder/` (`flow-canvas.tsx`, `nodes/`, `panels/`).
  - React Flow dibuja las conexiones sin handle desde el **primer** handle en el DOM. Por eso "Siguiente paso" va primero en el DOM.
- **Mensajes manuales:** `app/api/v1/messages/route.ts` (aplica HUMAN_AGENT entre 24 h y 7 días).
- **Inbox:** `components/inbox/`. **Contactos:** `app/(dashboard)/dashboard/contacts/`.

## El negocio de Enrique (para escribir mensajes y prompts)

- Ayuda a **coaches fitness que facturan desde 2k € al mes** a escalar su servicio online en 90 días, con un embudo orgánico. Él hace todo, excepto grabar, editar y entregar el servicio del coach.
- Público: entrenadores online, o presenciales que quieren pasar a online. Se le habla **al coach**, no a su cliente.
- **Estilo de los mensajes:**
  - Natural, como un DM real: minúsculas, sin ¿¡, voseo.
  - Varios mensajes cortos.
  - **Sin botones.**

## Flujo "DPP" (apertura por comentario), ya probado en vivo y funcionando

1. **Disparador:** cualquier comentario.
2. **Apertura (respuesta privada):** "buenass? acabo de ver tu comentario / comentame así te guío mejor / tenés un negocio de coaching?"
3. **Seguimiento si no responde:** "{{nombre}}?", a los 7 días.
4. **AI Step 1, ¿es coach?:** confirma de forma natural. Máximo un mensaje extra; si queda en duda, cuenta como coach.
   - No coach → etiqueta "no calificado - NICHO" y fin, en silencio. Enrique borra esos contactos a mano.
5. **AI Step 2, facturación:**
   - La primera pregunta es directa; si no responde claro, una indirecta.
   - Máximo un mensaje extra; si queda en duda, cuenta como calificado.
   - Menos de 2k → etiqueta "no calificado - ADQ" y se le manda, de forma natural y sin botón, el link a una carpeta de recursos.
   - 2k o más → etiqueta "calificado - ADQ" y sigue con "ok pero a ver / cómo conseguís clientes ahora mismo?…"
6. **Desde ahí todo es manual**, con el botón Automatizaciones del Inbox: solución, llamada, calendario.

## Pendiente

- Confirmar que walter quedó con la etiqueta "calificado - ADQ" en Contactos, tras la prueba del 19/11/2026.
- Corregir textos del flujo: "Ok pero a ver" → minúscula; revisar "constando" → "costando" y "conseguir" → "conseguís".
- Armar los flujos manuales prearmados: Solución, Llamada, Calendario y 7 seguimientos. **Enrique ya tiene los textos de los seguimientos y los va a pasar.**
- Audios por dolor o problema frecuente (entre ellos, "referidos").
- Una apertura por reel.
- Que Enrique borre en su ManyChat los borradores de prueba "Referencia Claude (borrar)" y "Sin título".
