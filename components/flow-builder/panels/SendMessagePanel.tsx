"use client";

import { useCallback, useRef, useState } from "react";
import {
  Plus,
  X,
  GripVertical,
  Image,
  Type,
  MousePointer,
  MessageCircle,
  LayoutGrid,
  AlignLeft,
  FileText,
  Clock,
  TextCursorInput,
  MoreHorizontal,
  Volume2,
  Video,
  RectangleHorizontal,
  GalleryHorizontal,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useReactFlow, useStore, type Edge } from "@xyflow/react";
import { NextStepPicker, useCreateConnectedStep } from "./NextStepPicker";
import { MediaUpload } from "./MediaUpload";

/** Hidden code that links a button to the step it is connected to (like ManyChat). */
export function newButtonPayload() {
  return `btn_${Math.random().toString(36).slice(2, 10)}`;
}

interface QuickReply {
  title: string;
  payload: string;
}

interface Button {
  title: string;
  type: "postback" | "url";
  payload?: string;
  url?: string;
}

interface CarouselElement {
  imageUrl?: string;
  title: string;
  subtitle?: string;
  buttons?: Button[];
}

interface Carousel {
  elements: CarouselElement[];
}

interface Message {
  text?: string;
  imageUrl?: string;
  // Media attachment. mediaType + mediaUrl supersede the legacy image-only imageUrl
  // and let a message send an image, video, or audio file.
  mediaUrl?: string;
  mediaType?: "image" | "video" | "audio" | "file";
  quickReplies?: QuickReply[];
  buttons?: Button[];
  carousel?: Carousel;
  /** ManyChat content block this message was added as (editor only). */
  block?: "text" | "image" | "video" | "audio" | "file" | "gallery" | "delay";
  /** "Retraso" block: seconds to wait before the next message. */
  delaySeconds?: number;
}

const BLOCK_LABEL: Record<string, string> = {
  text: "Texto",
  image: "Imagen",
  video: "Video",
  audio: "Audio",
  file: "PDF",
  gallery: "Galería",
  delay: "Retraso",
};

const EMOJIS = ["😀", "😂", "😍", "🥰", "😎", "🤩", "🙌", "👏", "🔥", "💪", "✅", "❤️", "👇", "👉", "📩", "🎁", "🚀", "💯", "✨", "📌", "🎉", "🙏", "😉", "🤔"];

interface QuestionData {
  text: string;
  inputType?: string;
  options?: string[];
  fieldSlug?: string;
  variableName?: string;
  retryText?: string;
  expireValue?: number;
  expireUnit?: "seconds" | "minutes" | "hours" | "days";
  retries?: number;
}

const NEW_QUESTION: QuestionData = { text: "", inputType: "text", expireValue: 30, expireUnit: "minutes", retries: 3 };

interface SendMessagePanelData {
  messages?: Message[];
  question?: QuestionData;
  [key: string]: unknown;
}

interface SendMessagePanelProps {
  data: Record<string, unknown>;
  onChange: (data: Record<string, unknown>) => void;
  availableVariables?: string[];
  /** Builder step id, so buttons can pick and create their next step. */
  nodeId?: string;
}

function VariablePicker({
  variables,
  onInsert,
}: {
  variables: string[];
  onInsert: (variable: string) => void;
}) {
  return (
    <div className="mt-1.5">
      <p className="text-[11px] text-muted-foreground/60">
        Toca una variable para insertarla. Por ejemplo, {"{{nombre}}"} se cambia por el
        nombre de la persona.
      </p>
      <div className="mt-1 flex flex-wrap gap-1.5">
        {variables.map((variable) => (
          <button
            key={variable}
            type="button"
            onClick={() => onInsert(variable)}
            className="rounded px-1.5 py-0.5 font-mono text-[11px] font-medium text-blue-500 hover:bg-blue-50"
          >
            {`{{${variable}}}`}
          </button>
        ))}
      </div>
    </div>
  );
}

export function SendMessagePanel({ data: rawData, onChange, availableVariables, nodeId }: SendMessagePanelProps) {
  const data = rawData as SendMessagePanelData;
  const messages = data.messages || [];

  const updateMessage = useCallback(
    (index: number, updated: Message) => {
      const msgs = [...messages];
      msgs[index] = updated;
      onChange({ ...data, messages: msgs });
    },
    [data, messages, onChange]
  );

  const removeMessage = useCallback(
    (index: number) => {
      onChange({ ...data, messages: messages.filter((_, i) => i !== index) });
    },
    [data, messages, onChange]
  );

  return (
    <div className="space-y-4">
      {messages.map((message, msgIndex) => (
        <MessageEditor
          key={msgIndex}
          index={msgIndex}
          message={message}
          onChange={(updated) => updateMessage(msgIndex, updated)}
          onRemove={() => removeMessage(msgIndex)}
          canRemove={messages.length > 1}
          availableVariables={availableVariables}
          nodeId={nodeId}
        />
      ))}

      {data.question && (
        <QuestionBlock
          question={data.question}
          nodeId={nodeId}
          onChange={(q) => onChange({ ...data, question: q })}
          onRemove={() => {
            const { question: _q, ...rest } = data;
            onChange(rest);
          }}
        />
      )}

      <ContentBlockBar
        onAdd={(m) => onChange({ ...data, messages: [...messages, m] })}
        onAddQuestion={data.question ? undefined : () => onChange({ ...data, question: { ...NEW_QUESTION } })}
        nodeId={nodeId}
      />

      {messages.length === 0 && (
        <p className="text-center text-xs text-muted-foreground">
          Añade al menos un mensaje.
        </p>
      )}

      {nodeId && (
        <div className="rounded-lg border border-dashed border-border p-3">
          <NextStepPicker nodeId={nodeId} label="Elegir siguiente paso" />
        </div>
      )}

      {/* Platform hints */}
      <div className="rounded-lg border border-border bg-muted p-3">
        <p className="text-xs font-medium text-muted-foreground">Notas de Instagram</p>
        <ul className="mt-1.5 space-y-1 text-[11px] text-muted-foreground">
          <li>Máximo 3 botones por mensaje</li>
                    <li>Las respuestas rápidas desaparecen cuando la persona responde y solo van después de un texto sin botones</li>
          <li>Galería: hasta 10 tarjetas con imagen y botones</li>
          <li>
            Instagram solo deja escribir libremente dentro de las 24 h desde el
            último mensaje de la persona
          </li>
        </ul>
      </div>
    </div>
  );
}

function MessageEditor({
  index,
  message,
  onChange,
  onRemove,
  canRemove,
  availableVariables,
  nodeId,
}: {
  index: number;
  message: Message;
  onChange: (m: Message) => void;
  onRemove: () => void;
  canRemove: boolean;
  availableVariables?: string[];
  nodeId?: string;
}) {
  const isCarouselMode = !!message.carousel;
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const insertVariable = useCallback(
    (variable: string) => {
      const token = `{{${variable}}}`;
      const textarea = textareaRef.current;
      const text = message.text || "";
      const caret = textarea?.selectionStart ?? text.length;
      onChange({
        ...message,
        text: text.slice(0, caret) + token + text.slice(caret),
      });
      // Restore focus and place the caret after the inserted token
      requestAnimationFrame(() => {
        if (!textarea) return;
        textarea.focus();
        textarea.setSelectionRange(caret + token.length, caret + token.length);
      });
    },
    [message, onChange]
  );

  const toggleMode = useCallback(() => {
    if (isCarouselMode) {
      // Switch to text mode: remove carousel
      const { carousel: _, ...rest } = message;
      onChange({ ...rest, text: rest.text || "" });
    } else {
      // Switch to carousel mode: remove text-mode fields, add empty carousel
      onChange({
        carousel: {
          elements: [{ title: "", subtitle: "", imageUrl: "" }],
        },
      });
    }
  }, [isCarouselMode, message, onChange]);

  // Quick replies
  const addQuickReply = useCallback(() => {
    const replies = message.quickReplies || [];
    onChange({ ...message, quickReplies: [...replies, { title: "", payload: newButtonPayload() }] });
  }, [message, onChange]);

  const updateQuickReply = useCallback(
    (i: number, updated: QuickReply) => {
      const replies = [...(message.quickReplies || [])];
      replies[i] = updated;
      onChange({ ...message, quickReplies: replies });
    },
    [message, onChange]
  );

  const removeQuickReply = useCallback(
    (i: number) => {
      const replies = (message.quickReplies || []).filter((_, idx) => idx !== i);
      onChange({ ...message, quickReplies: replies.length > 0 ? replies : undefined });
    },
    [message, onChange]
  );

  // Buttons
  const addButton = useCallback(() => {
    const buttons = message.buttons || [];
    onChange({ ...message, buttons: [...buttons, { title: "", type: "postback", payload: newButtonPayload() }] });
  }, [message, onChange]);

  const updateButton = useCallback(
    (i: number, updated: Button) => {
      const buttons = [...(message.buttons || [])];
      buttons[i] = updated;
      onChange({ ...message, buttons });
    },
    [message, onChange]
  );

  const removeButton = useCallback(
    (i: number) => {
      const buttons = (message.buttons || []).filter((_, idx) => idx !== i);
      onChange({ ...message, buttons: buttons.length > 0 ? buttons : undefined });
    },
    [message, onChange]
  );

  const block = message.block;
  const charLimit = (message.buttons?.length ?? 0) > 0 ? 640 : 1000;

  if (block === "delay") {
    return (
      <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card px-3 py-2.5">
        <span className="text-xs font-semibold text-muted-foreground">Retraso</span>
        <select
          value={String(message.delaySeconds ?? 3)}
          onChange={(e) => onChange({ ...message, delaySeconds: Number(e.target.value) })}
          className="flex-1 rounded border border-border bg-card px-2 py-1 text-xs"
        >
          {[1, 2, 3, 5, 8, 10, 15, 20].map((n) => (
            <option key={n} value={n}>
              Esperar {n} {n === 1 ? "segundo" : "segundos"} (muestra &quot;escribiendo…&quot;)
            </option>
          ))}
        </select>
        <button type="button" onClick={onRemove} className="text-muted-foreground hover:text-red-500" aria-label="Quitar">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  }

  if (block === "image" || block === "video" || block === "audio" || block === "file") {
    return (
      <div className="rounded-lg border border-border bg-card p-3">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-xs font-semibold text-muted-foreground">{BLOCK_LABEL[block]}</span>
          <button type="button" onClick={onRemove} className="text-muted-foreground hover:text-red-500" aria-label="Quitar">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
        <MediaUpload
          kind={block}
          url={message.mediaUrl ?? ""}
          onChange={(url) => onChange({ ...message, mediaUrl: url, mediaType: block })}
        />
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-card">
      {/* Message header */}
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <div className="flex items-center gap-2">
          <GripVertical className="h-3.5 w-3.5 text-muted-foreground/60" />
          <span className="text-xs font-semibold text-muted-foreground">
            {block ? BLOCK_LABEL[block] : `Mensaje ${index + 1}`}
          </span>
        </div>
        {(canRemove || !!block) && (
          <button
            type="button"
            onClick={onRemove}
            className="rounded p-1 text-muted-foreground/60 hover:bg-muted hover:text-muted-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* Mode toggle (only for messages created before content blocks) */}
      <div className={cn("flex border-b border-border", block && "hidden")}>
        <button
          type="button"
          onClick={() => isCarouselMode && toggleMode()}
          className={cn(
            "flex flex-1 items-center justify-center gap-1.5 py-2 text-xs font-medium transition-colors",
            !isCarouselMode
              ? "border-b-2 border-blue-500 text-blue-600"
              : "text-muted-foreground/60 hover:text-muted-foreground"
          )}
        >
          <Type className="h-3 w-3" />
          Texto
        </button>
        <button
          type="button"
          onClick={() => !isCarouselMode && toggleMode()}
          className={cn(
            "flex flex-1 items-center justify-center gap-1.5 py-2 text-xs font-medium transition-colors",
            isCarouselMode
              ? "border-b-2 border-blue-500 text-blue-600"
              : "text-muted-foreground/60 hover:text-muted-foreground"
          )}
        >
          <LayoutGrid className="h-3 w-3" />
          Galería
        </button>
      </div>

      <div className="space-y-4 p-3">
        {isCarouselMode ? (
          <CarouselEditor
            carousel={message.carousel!}
            onChange={(carousel) => onChange({ ...message, carousel })}
          />
        ) : (
          <>
            {/* Text */}
            <div>
              <div className="mb-1.5 flex items-center gap-1.5">
                <Type className="h-3 w-3 text-muted-foreground/60" />
                <label className="text-xs font-medium text-muted-foreground">Texto</label>
              </div>
              <div className="rounded-lg border border-border bg-card focus-within:border-blue-500 focus-within:ring-1 focus-within:ring-blue-500">
                <textarea
                  ref={textareaRef}
                  value={message.text || ""}
                  maxLength={charLimit}
                  onChange={(e) => onChange({ ...message, text: e.target.value })}
                  placeholder="Introduce tu texto…"
                  rows={3}
                  className="w-full resize-none rounded-t-lg bg-transparent px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none"
                />
                <TextToolbar
                  variables={availableVariables ?? []}
                  remaining={charLimit - (message.text?.length ?? 0)}
                  onInsert={(token) => {
                    const textarea = textareaRef.current;
                    const text = message.text || "";
                    const caret = textarea?.selectionStart ?? text.length;
                    onChange({ ...message, text: (text.slice(0, caret) + token + text.slice(caret)).slice(0, charLimit) });
                    requestAnimationFrame(() => {
                      if (!textarea) return;
                      textarea.focus();
                      textarea.setSelectionRange(caret + token.length, caret + token.length);
                    });
                  }}
                />
              </div>
            </div>

            {/* Media (image / video / audio) — older combined messages only */}
            <div className={cn(block && "hidden")}>
              <div className="mb-1.5 flex items-center gap-1.5">
                <Image className="h-3 w-3 text-muted-foreground/60" />
                <label className="text-xs font-medium text-muted-foreground">URL del archivo (imagen, video o audio)</label>
              </div>
              <div className="flex gap-2">
                <select
                  value={message.mediaType || "image"}
                  onChange={(e) =>
                    onChange({
                      ...message,
                      mediaType: e.target.value as "image" | "video" | "audio",
                    })
                  }
                  className="rounded-lg border border-border bg-card px-2 py-2 text-sm text-foreground focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  <option value="image">Imagen</option>
                  <option value="video">Video</option>
                  <option value="audio">Audio</option>
                </select>
                <input
                  type="url"
                  value={message.mediaUrl ?? message.imageUrl ?? ""}
                  onChange={(e) =>
                    onChange({
                      ...message,
                      mediaUrl: e.target.value || undefined,
                      mediaType: message.mediaType || "image",
                      // Clear the legacy image-only field so the two don't diverge.
                      imageUrl: undefined,
                    })
                  }
                  placeholder="https://example.com/file.mp4"
                  className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/60 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground/60">
                Sends an image, video, or audio file with this message.
              </p>
            </div>

            {/* Quick Replies */}
            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <MessageCircle className="h-3 w-3 text-muted-foreground/60" />
                  <label className="text-xs font-medium text-muted-foreground">
                    Respuestas rápidas
                  </label>
                </div>
                <button
                  type="button"
                  onClick={addQuickReply}
                  className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium text-blue-500 hover:bg-blue-50"
                >
                  <Plus className="h-3 w-3" />
                  Añadir
                </button>
              </div>
              {(message.quickReplies || []).map((qr, i) => (
                <div key={i} className="mb-2 flex items-center gap-2">
                  <input
                    type="text"
                    value={qr.title}
                    onChange={(e) => updateQuickReply(i, { ...qr, title: e.target.value })}
                    placeholder="Texto de la respuesta"
                    className="flex-1 rounded border border-border bg-card px-2 py-1.5 text-xs text-foreground placeholder:text-muted-foreground/60 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                  {nodeId && qr.payload ? (
                    <div className="flex-1">
                      <NextStepPicker nodeId={nodeId} handle={`btn:${qr.payload}`} label="Al tocarla" />
                    </div>
                  ) : (
                    <input
                      type="text"
                      value={qr.payload}
                      onChange={(e) => updateQuickReply(i, { ...qr, payload: e.target.value })}
                      placeholder="Código"
                      className="flex-1 rounded border border-border bg-card px-2 py-1.5 text-xs text-foreground placeholder:text-muted-foreground/60 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  )}
                  <button
                    type="button"
                    onClick={() => removeQuickReply(i)}
                    className="rounded p-1 text-muted-foreground/60 hover:bg-muted hover:text-muted-foreground"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>

            {/* Buttons */}
            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <MousePointer className="h-3 w-3 text-muted-foreground/60" />
                  <label className="text-xs font-medium text-muted-foreground">
                    Botones
                  </label>
                </div>
                <button
                  type="button"
                  onClick={addButton}
                  className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium text-blue-500 hover:bg-blue-50"
                >
                  <Plus className="h-3 w-3" />
                  Añadir
                </button>
              </div>
              {(message.buttons || []).map((btn, i) => (
                <div
                  key={i}
                  className="mb-2 rounded-lg border border-border bg-muted p-2.5"
                >
                  <div className="mb-2 flex items-center gap-2">
                    <input
                      type="text"
                      value={btn.title}
                      onChange={(e) => updateButton(i, { ...btn, title: e.target.value })}
                      placeholder="Título del botón"
                      className="flex-1 rounded border border-border bg-card px-2 py-1.5 text-xs text-foreground placeholder:text-muted-foreground/60 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                    <button
                      type="button"
                      onClick={() => removeButton(i)}
                      className="rounded p-1 text-muted-foreground/60 hover:bg-muted hover:text-muted-foreground"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                  <div className="space-y-2">
                    <div>
                      <p className="mb-1 text-[11px] text-muted-foreground">Cuando se presiona este botón</p>
                      <select
                        value={btn.type}
                        onChange={(e) => {
                          const type = e.target.value as "postback" | "url";
                          updateButton(i, {
                            ...btn,
                            type,
                            payload: type === "postback" ? btn.payload || newButtonPayload() : undefined,
                            url: type === "url" ? btn.url || "" : undefined,
                          });
                        }}
                        className="w-full rounded border border-border bg-card px-2 py-1.5 text-xs text-foreground focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      >
                        <option value="postback">Ir a un paso de la automatización</option>
                        <option value="url">Abrir sitio web</option>
                      </select>
                    </div>
                    {btn.type === "postback" ? (
                      nodeId && btn.payload ? (
                        <NextStepPicker nodeId={nodeId} handle={`btn:${btn.payload}`} label="Siguiente paso" />
                      ) : (
                        <input
                          type="text"
                          value={btn.payload || ""}
                          onChange={(e) => updateButton(i, { ...btn, payload: e.target.value })}
                          placeholder="Código del botón"
                          className="w-full rounded border border-border bg-card px-2 py-1.5 text-xs text-foreground placeholder:text-muted-foreground/60 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                        />
                      )
                    ) : (
                      <input
                        type="url"
                        value={btn.url || ""}
                        onChange={(e) => updateButton(i, { ...btn, url: e.target.value })}
                        placeholder="https://yourwebsite.com"
                        className="w-full rounded border border-border bg-card px-2 py-1.5 text-xs text-foreground placeholder:text-muted-foreground/60 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                    )}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function CarouselEditor({
  carousel,
  onChange,
}: {
  carousel: Carousel;
  onChange: (c: Carousel) => void;
}) {
  const elements = carousel.elements || [];

  const addCard = useCallback(() => {
    onChange({
      elements: [...elements, { title: "", subtitle: "", imageUrl: "" }],
    });
  }, [elements, onChange]);

  const updateCard = useCallback(
    (i: number, updated: CarouselElement) => {
      const els = [...elements];
      els[i] = updated;
      onChange({ elements: els });
    },
    [elements, onChange]
  );

  const removeCard = useCallback(
    (i: number) => {
      onChange({ elements: elements.filter((_, idx) => idx !== i) });
    },
    [elements, onChange]
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <LayoutGrid className="h-3 w-3 text-muted-foreground/60" />
          <label className="text-xs font-medium text-muted-foreground">
            Cards ({elements.length})
          </label>
        </div>
        <button
          type="button"
          onClick={addCard}
          className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium text-blue-500 hover:bg-blue-50"
        >
          <Plus className="h-3 w-3" />
          Añadir tarjeta
        </button>
      </div>

      {elements.map((el, i) => (
        <CarouselCardEditor
          key={i}
          index={i}
          element={el}
          onChange={(updated) => updateCard(i, updated)}
          onRemove={() => removeCard(i)}
          canRemove={elements.length > 1}
        />
      ))}

      {elements.length === 0 && (
        <p className="text-center text-xs text-muted-foreground">
          Add at least one card to the carousel.
        </p>
      )}
    </div>
  );
}

function CarouselCardEditor({
  index,
  element,
  onChange,
  onRemove,
  canRemove,
}: {
  index: number;
  element: CarouselElement;
  onChange: (el: CarouselElement) => void;
  onRemove: () => void;
  canRemove: boolean;
}) {
  const buttons = element.buttons || [];

  const addButton = useCallback(() => {
    if (buttons.length >= 3) return;
    onChange({
      ...element,
      buttons: [...buttons, { title: "", type: "postback", payload: newButtonPayload() }],
    });
  }, [element, buttons, onChange]);

  const updateButton = useCallback(
    (i: number, updated: Button) => {
      const btns = [...buttons];
      btns[i] = updated;
      onChange({ ...element, buttons: btns });
    },
    [element, buttons, onChange]
  );

  const removeButton = useCallback(
    (i: number) => {
      const btns = buttons.filter((_, idx) => idx !== i);
      onChange({ ...element, buttons: btns.length > 0 ? btns : undefined });
    },
    [element, buttons, onChange]
  );

  return (
    <div className="rounded-lg border border-border bg-muted p-2.5">
      {/* Card header */}
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[11px] font-semibold text-muted-foreground">
          Card {index + 1}
        </span>
        {canRemove && (
          <button
            type="button"
            onClick={onRemove}
            className="rounded p-0.5 text-muted-foreground/60 hover:bg-accent hover:text-muted-foreground"
          >
            <X className="h-3 w-3" />
          </button>
        )}
      </div>

      <div className="space-y-2">
        {/* Image URL */}
        <div>
          <div className="mb-1 flex items-center gap-1">
            <Image className="h-2.5 w-2.5 text-muted-foreground/60" />
            <label className="text-[11px] font-medium text-muted-foreground">URL de la imagen</label>
          </div>
          <input
            type="url"
            value={element.imageUrl || ""}
            onChange={(e) =>
              onChange({ ...element, imageUrl: e.target.value || undefined })
            }
            placeholder="https://example.com/image.png"
            className="w-full rounded border border-border bg-card px-2 py-1.5 text-xs text-foreground placeholder:text-muted-foreground/60 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>

        {/* Title */}
        <div>
          <label className="mb-1 block text-[11px] font-medium text-muted-foreground">
            Título
          </label>
          <input
            type="text"
            value={element.title}
            onChange={(e) => onChange({ ...element, title: e.target.value })}
            placeholder="Título (máx. 80 caracteres)"
            maxLength={80}
            className="w-full rounded border border-border bg-card px-2 py-1.5 text-xs text-foreground placeholder:text-muted-foreground/60 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>

        {/* Subtitle */}
        <div>
          <label className="mb-1 block text-[11px] font-medium text-muted-foreground">
            Subtítulo
          </label>
          <input
            type="text"
            value={element.subtitle || ""}
            onChange={(e) =>
              onChange({ ...element, subtitle: e.target.value || undefined })
            }
            placeholder="Subtítulo"
            className="w-full rounded border border-border bg-card px-2 py-1.5 text-xs text-foreground placeholder:text-muted-foreground/60 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>

        {/* Buttons */}
        <div>
          <div className="mb-1 flex items-center justify-between">
            <div className="flex items-center gap-1">
              <MousePointer className="h-2.5 w-2.5 text-muted-foreground/60" />
              <label className="text-[11px] font-medium text-muted-foreground">
                Buttons ({buttons.length}/3)
              </label>
            </div>
            {buttons.length < 3 && (
              <button
                type="button"
                onClick={addButton}
                className="flex items-center gap-0.5 rounded px-1 py-0.5 text-[10px] font-medium text-blue-500 hover:bg-blue-50"
              >
                <Plus className="h-2.5 w-2.5" />
                Añadir
              </button>
            )}
          </div>
          {buttons.map((btn, i) => (
            <div
              key={i}
              className="mb-1.5 rounded border border-border bg-card p-2"
            >
              <div className="mb-1.5 flex items-center gap-1.5">
                <input
                  type="text"
                  value={btn.title}
                  onChange={(e) =>
                    updateButton(i, { ...btn, title: e.target.value })
                  }
                  placeholder="Título del botón"
                  className="flex-1 rounded border border-border bg-card px-2 py-1 text-[11px] text-foreground placeholder:text-muted-foreground/60 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
                <button
                  type="button"
                  onClick={() => removeButton(i)}
                  className="rounded p-0.5 text-muted-foreground/60 hover:bg-muted hover:text-muted-foreground"
                >
                  <X className="h-2.5 w-2.5" />
                </button>
              </div>
              <div className="flex items-center gap-1.5">
                <select
                  value={btn.type}
                  onChange={(e) => {
                    const type = e.target.value as "postback" | "url";
                    updateButton(i, {
                      ...btn,
                      type,
                      payload:
                        type === "postback" ? btn.payload || newButtonPayload() : undefined,
                      url: type === "url" ? btn.url || "" : undefined,
                    });
                  }}
                  className="rounded border border-border bg-card px-1.5 py-1 text-[11px] text-foreground focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  <option value="postback">Ir a un paso</option>
                  <option value="url">Abrir sitio web</option>
                </select>
                {btn.type === "postback" ? (
                  <input
                    type="text"
                    value={btn.payload || ""}
                    onChange={(e) =>
                      updateButton(i, { ...btn, payload: e.target.value })
                    }
                    placeholder="Código del botón"
                    className="flex-1 rounded border border-border bg-card px-2 py-1 text-[11px] text-foreground placeholder:text-muted-foreground/60 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                ) : (
                  <input
                    type="url"
                    value={btn.url || ""}
                    onChange={(e) =>
                      updateButton(i, { ...btn, url: e.target.value })
                    }
                    placeholder="https://..."
                    className="flex-1 rounded border border-border bg-card px-2 py-1 text-[11px] text-foreground placeholder:text-muted-foreground/60 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ───────── ManyChat content blocks ───────── */

function TextToolbar({
  variables,
  remaining,
  onInsert,
}: {
  variables: string[];
  remaining: number;
  onInsert: (token: string) => void;
}) {
  const [open, setOpen] = useState<"emoji" | "vars" | null>(null);
  return (
    <div className="relative flex items-center justify-end gap-1 border-t border-border px-2 py-1">
      <button
        type="button"
        onClick={() => setOpen(open === "emoji" ? null : "emoji")}
        className="rounded px-1.5 py-0.5 text-sm hover:bg-muted"
        aria-label="Emojis"
      >
        😊
      </button>
      <button
        type="button"
        onClick={() => setOpen(open === "vars" ? null : "vars")}
        className="rounded px-1.5 py-0.5 font-mono text-xs text-muted-foreground hover:bg-muted"
        aria-label="Insertar variable"
      >
        {"{ }"}
      </button>
      <span className={cn("min-w-[2.5rem] text-right text-[11px] tabular-nums", remaining < 20 ? "text-red-500" : "text-muted-foreground")}>
        {remaining}
      </span>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(null)} />
          <div className="absolute right-0 top-8 z-50 w-56 rounded-lg border border-border bg-card p-2 shadow-lg">
            {open === "emoji" ? (
              <div className="grid grid-cols-8 gap-1">
                {EMOJIS.map((e) => (
                  <button key={e} type="button" onClick={() => onInsert(e)} className="rounded p-0.5 text-base hover:bg-muted">
                    {e}
                  </button>
                ))}
              </div>
            ) : (
              <div className="space-y-0.5">
                <p className="px-1 pb-1 text-[11px] text-muted-foreground">Insertar dato del contacto</p>
                {(variables.length ? variables : ["nombre", "nombre_completo", "usuario"]).map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => {
                      onInsert(`{{${v}}}`);
                      setOpen(null);
                    }}
                    className="block w-full rounded px-2 py-1 text-left text-xs hover:bg-muted"
                  >
                    {v.replace(/_/g, " ")} <span className="font-mono text-muted-foreground">{`{{${v}}}`}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function ContentBlockBar({
  onAdd,
  onAddQuestion,
  nodeId,
}: {
  onAdd: (m: Message) => void;
  onAddQuestion?: () => void;
  nodeId?: string;
}) {
  const [more, setMore] = useState(false);
  const item =
    "flex w-full items-center gap-3 rounded-lg border border-dashed border-border px-3 py-2.5 text-left hover:border-blue-400";
  const Row = ({ icon: Icon, title, desc }: { icon: typeof AlignLeft; title: string; desc: string }) => (
    <>
      <Icon className="h-5 w-5 shrink-0 text-muted-foreground" />
      <span className="min-w-0">
        <span className="block text-sm">{title}</span>
        <span className="block text-[11px] text-muted-foreground">{desc}</span>
      </span>
    </>
  );
  return (
    <div>
      <p className="mb-2 text-xs text-muted-foreground">Añade uno de los bloques de contenido:</p>
      <div className="space-y-2">
        <button type="button" className={item} onClick={() => onAdd({ block: "text", text: "" })}>
          <Row icon={AlignLeft} title="Texto" desc="Añadir texto y botones simples" />
        </button>
        <button type="button" className={item} onClick={() => onAdd({ block: "image", mediaType: "image", mediaUrl: "" })}>
          <Row icon={Image} title="Imagen" desc="Aumentar la participación con elementos visuales" />
        </button>
        <button type="button" className={item} onClick={() => onAdd({ block: "file", mediaType: "file", mediaUrl: "" })}>
          <Row icon={FileText} title="PDF" desc="Añade archivos PDF a tu mensaje" />
        </button>
        <button type="button" className={item} onClick={() => onAdd({ block: "delay", delaySeconds: 3 })}>
          <Row icon={Clock} title="Retraso" desc="Espera unos segundos entre los textos" />
        </button>
        {nodeId && (
          <button
            type="button"
            className={cn(item, !onAddQuestion && "cursor-not-allowed opacity-50")}
            onClick={() => (onAddQuestion ? onAddQuestion() : undefined)}
            title={onAddQuestion ? undefined : "Este mensaje ya tiene una pregunta"}
          >
            <Row icon={TextCursorInput} title="Recopilación de datos" desc="Recopila correos electrónicos, teléfonos y más" />
          </button>
        )}
        <div className="relative">
          <button type="button" className={item} onClick={() => setMore((m) => !m)}>
            <Row icon={MoreHorizontal} title="Más" desc="Ver todas las opciones disponibles" />
          </button>
          {more && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setMore(false)} />
              <div className="absolute bottom-full left-0 z-50 mb-1 w-64 space-y-2 rounded-lg border border-border bg-card p-2 shadow-lg">
                {(
                  [
                    [Volume2, "Audio", "Envía fragmentos de voz en el chat", { block: "audio", mediaType: "audio", mediaUrl: "" }],
                    [Video, "Vídeo", "Compartir vídeo en el chat", { block: "video", mediaType: "video", mediaUrl: "" }],
                    [RectangleHorizontal, "Tarjeta", "Añadir imágenes con botones", { block: "gallery", carousel: { elements: [{ title: "", subtitle: "", imageUrl: "" }] } }],
                    [GalleryHorizontal, "Galería", "Añadir hasta 10 imágenes con botones", { block: "gallery", carousel: { elements: [{ title: "", subtitle: "", imageUrl: "" }, { title: "", subtitle: "", imageUrl: "" }] } }],
                  ] as Array<[typeof AlignLeft, string, string, Message]>
                ).map(([icon, title, desc, msg]) => (
                  <button
                    key={title}
                    type="button"
                    onClick={() => {
                      onAdd(msg);
                      setMore(false);
                    }}
                    className={item}
                  >
                    <Row icon={icon} title={title} desc={desc} />
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

const INPUT_TYPES: Array<[string, string]> = [
  ["text", "Texto"],
  ["number", "Número"],
  ["email", "Correo electrónico"],
  ["phone", "Teléfono"],
  ["url", "URL"],
  ["date", "Fecha"],
  ["datetime", "Fecha y hora"],
  ["choice", "Elección múltiple"],
  ["name", "Nombre completo"],
  ["first_name", "Nombre"],
  ["last_name", "Apellido"],
];

/**
 * ManyChat's question block inside "Enviar mensaje": the automation pauses until
 * the contact answers. "Acción en respuesta" runs on a valid answer and
 * "Si el contacto no ha respondido" when the time runs out.
 */
function QuestionBlock({
  question,
  nodeId,
  onChange,
  onRemove,
}: {
  question: QuestionData;
  nodeId?: string;
  onChange: (q: QuestionData) => void;
  onRemove: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const { setEdges } = useReactFlow();
  const edges = useStore((st) => st.edges) as Edge[];
  const createStep = useCreateConnectedStep(nodeId ?? "");
  const set = (patch: Partial<QuestionData>) => onChange({ ...question, ...patch });
  const typeLabel = INPUT_TYPES.find(([v]) => v === (question.inputType ?? "text"))?.[1] ?? "Texto";
  const options = question.options ?? [];
  const hasReply = !!nodeId && edges.some((e) => e.source === nodeId && e.sourceHandle === "reply");
  const field = "w-full rounded-md border border-border bg-card px-2.5 py-1.5 text-sm focus:border-blue-500 focus:outline-none";

  return (
    <div className="group relative rounded-lg border border-border p-3">
      <button
        type="button"
        onClick={() => {
          if (nodeId) {
            setEdges((eds) =>
              eds.filter((e) => !(e.source === nodeId && (e.sourceHandle === "reply" || e.sourceHandle === "noreply")))
            );
          }
          onRemove();
        }}
        className="absolute right-1.5 top-1.5 hidden rounded p-0.5 text-muted-foreground hover:text-red-500 group-hover:block"
        aria-label="Eliminar pregunta"
      >
        <X className="h-3.5 w-3.5" />
      </button>
      <textarea
        rows={2}
        maxLength={640}
        value={question.text}
        onChange={(e) => set({ text: e.target.value })}
        placeholder="Introduce una pregunta..."
        className="w-full resize-none rounded-md border border-border bg-muted/40 px-2.5 py-2 text-sm focus:border-blue-500 focus:outline-none"
      />
      <button
        type="button"
        onClick={() => setEditing((v) => !v)}
        className="mt-2 w-full rounded-md border border-border py-1.5 text-center text-sm hover:bg-muted"
      >
        Respuesta del contacto: <span className="font-medium text-blue-600">{typeLabel}</span>
      </button>
      <p className="mt-1.5 text-center text-[11px] text-muted-foreground">
        Nota: La automatización se pausa hasta que el contacto responde
      </p>

      {/* ManyChat "+ Añadir respuesta inmediata": quick replies sent with the question. */}
      <div className="mt-2 flex flex-wrap justify-center gap-1.5">
        {options.map((o, i) => (
          <span key={i} className="flex items-center gap-1 rounded-full border border-blue-400 px-2 py-0.5">
            <input
              value={o}
              maxLength={20}
              onChange={(e) => set({ options: options.map((x, j) => (j === i ? e.target.value : x)) })}
              placeholder="Respuesta"
              className="w-24 bg-transparent text-center text-xs text-blue-600 focus:outline-none"
            />
            <button
              type="button"
              onClick={() => set({ options: options.filter((_, j) => j !== i) })}
              className="text-muted-foreground hover:text-red-500"
              aria-label="Quitar respuesta"
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        {options.length < 13 && (
          <button
            type="button"
            onClick={() => set({ options: [...options, ""] })}
            className="rounded-full border border-border px-3 py-1 text-xs text-muted-foreground hover:bg-muted"
          >
            + Añadir respuesta inmediata
          </button>
        )}
      </div>

      {editing && (
        <div className="mt-3 space-y-4 rounded-lg border border-border bg-card p-3 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold">Editar recopilación de datos</p>
            <button type="button" onClick={() => setEditing(false)} className="text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          </div>

          <div>
            <p className="mb-1 text-xs font-medium">Tipo de respuesta</p>
            <select value={question.inputType ?? "text"} onChange={(e) => set({ inputType: e.target.value })} className={field}>
              {INPUT_TYPES.map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </div>

          <div>
            <p className="mb-1 text-xs font-medium">Guardar respuesta en un campo personalizado</p>
            <input
              value={question.fieldSlug ?? ""}
              onChange={(e) => set({ fieldSlug: e.target.value })}
              placeholder="Nombre del campo (opcional)"
              className={field}
            />
            <input
              value={question.variableName ?? ""}
              onChange={(e) => set({ variableName: e.target.value.replace(/[^\w]/g, "_") })}
              placeholder="Variable para usar en mensajes, ej. respuesta"
              className={cn(field, "mt-1.5")}
            />
          </div>

          <div>
            <p className="mb-1 text-xs font-medium">Acciones de entrada exitosa</p>
            {nodeId && hasReply ? (
              <NextStepPicker nodeId={nodeId} handle="reply" label="Acción en respuesta" />
            ) : nodeId ? (
              <button
                type="button"
                onClick={() => createStep("actions", undefined, "reply")}
                className="w-full rounded-lg border border-dashed border-border py-2 text-sm hover:bg-muted"
              >
                <span className="text-amber-500">⚡</span> Realizar acciones
              </button>
            ) : null}
          </div>

          <div className="space-y-2 border-t border-border pt-3">
            <p className="text-xs font-semibold">Si el contacto no ha respondido</p>
            <p className="text-xs text-muted-foreground">La recopilación de datos expira en</p>
            <div className="flex gap-2">
              <input
                type="number"
                min={1}
                value={question.expireValue ?? 30}
                onChange={(e) => set({ expireValue: Math.max(1, parseInt(e.target.value) || 1) })}
                className={cn(field, "w-20")}
              />
              <select
                value={question.expireUnit ?? "minutes"}
                onChange={(e) => set({ expireUnit: e.target.value as QuestionData["expireUnit"] })}
                className={field}
              >
                <option value="seconds">Segundos</option>
                <option value="minutes">Minutos</option>
                <option value="hours">Horas</option>
                <option value="days">Días</option>
              </select>
            </div>
            <p className="text-xs text-muted-foreground">
              Puedes iniciar otra automatización una vez que haya caducado sin una respuesta:
            </p>
            {nodeId && <NextStepPicker nodeId={nodeId} handle="noreply" variant="button" />}
          </div>

          <div className="flex flex-wrap items-center gap-1.5 border-t border-border pt-3 text-xs">
            Reintentar
            <input
              type="number"
              min={0}
              max={10}
              value={question.retries ?? 3}
              onChange={(e) => set({ retries: Math.max(0, Math.min(10, parseInt(e.target.value) || 0)) })}
              className="w-12 rounded border border-border bg-card px-1.5 py-0.5 text-center"
            />
            veces si la respuesta del usuario no es válida.
          </div>
          <input
            value={question.retryText ?? ""}
            onChange={(e) => set({ retryText: e.target.value })}
            placeholder="Mensaje si la respuesta no es válida (opcional)"
            className={field}
          />
        </div>
      )}
    </div>
  );
}
