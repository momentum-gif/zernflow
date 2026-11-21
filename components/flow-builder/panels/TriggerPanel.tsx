"use client";

import { cn } from "@/lib/utils";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, X } from "lucide-react";
import { CommentTriggerWizard } from "./CommentTriggerWizard";
import { TriggerPickerModal, findTriggerOption } from "./TriggerPicker";
import { ContactEventPanel, DateTimeTriggerPanel, RefUrlPanel, StoryMentionInfo, StoryReplyWizard } from "./DmEventTriggerPanels";

interface Keyword {
  value: string;
  matchType: "exact" | "contains" | "startsWith";
}

interface TriggerPanelData {
  triggerType?: string;
  keywords?: Keyword[];
  payload?: string;
  alsoMatchInDms?: boolean;
  [key: string]: unknown;
}

interface TriggerPanelProps {
  data: Record<string, unknown>;
  onChange: (data: Record<string, unknown>) => void;
}



const matchTypes: Array<{ value: "exact" | "contains" | "startsWith"; label: string }> = [
  { value: "exact", label: "Es exactamente" },
  { value: "contains", label: "Contiene" },
  { value: "startsWith", label: "Empieza con" },
];

export function TriggerPanel({
  data: rawData,
  onChange,
  flowId,
  nodeId,
  onDeleteNode,
  onClosePanel,
}: TriggerPanelProps & {
  flowId?: string;
  nodeId?: string;
  onDeleteNode?: () => void;
  onClosePanel?: () => void;
}) {
  const router = useRouter();
  const data = rawData as TriggerPanelData;
  // ManyChat: "El usuario envía un mensaje" is only created once it has a keyword
  // ("Cancelar" / "Crear"). Until then the keywords live here, not in the flow.
  const [draft, setDraft] = useState<Keyword[] | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const triggerType = draft ? "keyword" : data.triggerType || "keyword";
  const keywords = draft ?? data.keywords ?? [];
  const [newKeyword, setNewKeyword] = useState("");
  const [newMatchType, setNewMatchType] = useState<"exact" | "contains" | "startsWith">("contains");
  // An empty "Cuando..." block opens the trigger list right away, like ManyChat.
  const [pickerOpen, setPickerOpen] = useState(triggerType === "none");
  const currentOption = findTriggerOption(data.triggerType || "keyword");

  const handleTriggerTypeChange = useCallback(
    (type: string) => {
      if (type === "keyword" && !(data.triggerType === "keyword" && (data.keywords ?? []).length > 0)) {
        setDraft([]);
        return;
      }
      setDraft(null);
      // A different trigger starts its own setup from step 1.
      const { pending: _pending, ...rest } = data;
      onChange({ ...rest, triggerType: type, wizardDone: false });
    },
    [data, onChange]
  );

  const setKeywords = useCallback(
    (updated: Keyword[]) => {
      if (draft) setDraft(updated);
      else onChange({ ...data, keywords: updated });
    },
    [draft, data, onChange]
  );

  const createDraft = () => {
    if (!draft || draft.length === 0) {
      setToast("Por favor, proporciona una palabra clave.");
      setTimeout(() => setToast(null), 4000);
      return;
    }
    const { pending: _pending, ...rest } = data;
    onChange({ ...rest, triggerType: "keyword", keywords: draft, wizardDone: false });
    setDraft(null);
  };

  const cancelDraft = () => {
    setDraft(null);
    if (data.pending === true) onDeleteNode?.();
    else onClosePanel?.();
  };

  const addKeyword = useCallback(() => {
    const trimmed = newKeyword.trim();
    if (!trimmed) return;
    setKeywords([...keywords, { value: trimmed, matchType: newMatchType }]);
    setNewKeyword("");
  }, [keywords, newKeyword, newMatchType, setKeywords]);

  const removeKeyword = useCallback(
    (index: number) => {
      setKeywords(keywords.filter((_, i) => i !== index));
    },
    [keywords, setKeywords]
  );

  const updateKeywordMatchType = useCallback(
    (index: number, matchType: "exact" | "contains" | "startsWith") => {
      setKeywords(keywords.map((k, i) => (i === index ? { ...k, matchType } : k)));
    },
    [keywords, setKeywords]
  );

  const showKeywords = triggerType === "keyword";
  const showPayload = triggerType === "postback" || triggerType === "quick_reply";

  return (
    <div className="space-y-5">
      {/* Trigger (ManyChat-style picker) */}
      <div>
        <button
          type="button"
          onClick={() => setPickerOpen(true)}
          className="flex w-full items-center justify-between gap-3 rounded-xl border border-border bg-card p-3 text-left hover:border-emerald-500"
        >
          <span className="min-w-0">
            <span className="block text-xs text-muted-foreground">{(draft ? findTriggerOption("keyword") : currentOption)?.category ?? "Disparador"}</span>
            <span className="block text-sm font-medium text-foreground">
              {triggerType === "none" ? "Agrega un disparador" : (draft ? findTriggerOption("keyword") : currentOption)?.title ?? triggerType}
            </span>
          </span>
          <span className="shrink-0 text-xs font-medium text-emerald-600">{triggerType === "none" ? "Elegir" : "Cambiar"}</span>
        </button>
        <TriggerPickerModal
          open={pickerOpen}
          onClose={() => setPickerOpen(false)}
          onSelect={handleTriggerTypeChange}
        />
      </div>

      {triggerType === "story_reply" && (
        <div className="border-t border-border pt-5">
          <StoryReplyWizard key="story_reply" data={data} onChange={onChange} />
        </div>
      )}
      {triggerType === "ref_url" && (
        <div className="border-t border-border pt-5">
          <RefUrlPanel data={data} onChange={onChange} />
        </div>
      )}
      {triggerType === "date_time" && (
        <div className="border-t border-border pt-5">
          <DateTimeTriggerPanel data={data} onChange={onChange} />
        </div>
      )}
      {currentOption?.category === "Evento de contactos" && triggerType !== "date_time" && (
        <div className="border-t border-border pt-5">
          <ContactEventPanel data={data} onChange={onChange} event={triggerType} />
        </div>
      )}
      {triggerType === "story_mention" && (
        <div className="border-t border-border pt-5">
          <StoryMentionInfo />
        </div>
      )}

      {/* Keywords Section */}
      {showKeywords && (
        <div>
          <label className="mb-2 block text-xs font-semibold text-foreground">
            El mensaje contiene estas palabras clave
          </label>

          {/* Existing keywords */}
          {keywords.length > 0 && (
            <div className="mb-3 space-y-2">
              {keywords.map((keyword, index) => (
                <div
                  key={index}
                  className="flex items-center gap-2 rounded-lg border border-border bg-card p-2"
                >
                  <span className="flex-1 truncate text-sm text-foreground">
                    {keyword.value}
                  </span>
                  <select
                    value={keyword.matchType}
                    onChange={(e) =>
                      updateKeywordMatchType(index, e.target.value as "exact" | "contains" | "startsWith")
                    }
                    className="rounded border border-border bg-muted px-2 py-1 text-xs text-foreground"
                  >
                    {matchTypes.map((m) => (
                      <option key={m.value} value={m.value}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => removeKeyword(index)}
                    className="rounded p-1 text-muted-foreground/60 hover:bg-muted hover:text-muted-foreground"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Add new keyword */}
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={newKeyword}
              onChange={(e) => setNewKeyword(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addKeyword();
                }
              }}
              placeholder="Escribe una palabra clave..."
              className="flex-1 rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/60 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
            <select
              value={newMatchType}
              onChange={(e) => setNewMatchType(e.target.value as "exact" | "contains" | "startsWith")}
              className="rounded-lg border border-border bg-card px-2 py-2 text-xs text-foreground focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            >
              {matchTypes.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={addKeyword}
              disabled={!newKeyword.trim()}
              className="rounded-lg bg-emerald-500 p-2 text-white transition-colors hover:bg-emerald-600 disabled:opacity-40"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>
          {!draft && triggerType === "keyword" && keywords.length === 0 && (
            <p className="mt-2 text-xs font-medium text-red-500">Por favor, proporciona una palabra clave.</p>
          )}
          {draft && (
            <div className="mt-5 flex items-center justify-between border-t border-border pt-4">
              <button
                type="button"
                onClick={cancelDraft}
                className="rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-accent"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={createDraft}
                className="rounded-lg bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
              >
                Crear
              </button>
            </div>
          )}
          {toast && (
            <div className="fixed bottom-6 right-6 z-[60] flex max-w-xs items-start gap-3 rounded-lg bg-red-700 px-4 py-3 text-sm text-white shadow-xl">
              <span className="flex-1">{toast}</span>
              <button type="button" onClick={() => setToast(null)} aria-label="Cerrar">✕</button>
            </div>
          )}

          {keywords.length === 0 && (
            <p className="mt-2 text-xs text-muted-foreground">
              Agrega las palabras que inician esta automatización. Pulsa Enter o + para agregar.
            </p>
          )}

        </div>
      )}

      {triggerType === "comment_keyword" && (
        <div className="border-t border-border pt-5">
          <CommentTriggerWizard key="comment_keyword" data={data} onChange={onChange} />
        </div>
      )}

      {/* Payload Section */}
      {showPayload && (
        <div>
          <label className="mb-2 block text-xs font-semibold text-foreground">
            Código del botón (payload)
          </label>
          <input
            type="text"
            value={data.payload || ""}
            onChange={(e) => onChange({ ...data, payload: e.target.value })}
            placeholder="Ej: LISTO"
            className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/60 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          />
          <p className="mt-1.5 text-xs text-muted-foreground">
            Debe ser igual al código del {triggerType === "postback" ? "botón" : "botón de respuesta rápida"} en el mensaje.
          </p>
        </div>
      )}
      {/* ManyChat: "Activa este disparador" (off = the automation stops answering it). */}
      {!draft && data.triggerType !== "none" && (
      <div className="flex items-center justify-between gap-3 border-t border-border pt-4">
        <span className="text-sm">Activa este disparador</span>
        <button
          type="button"
          role="switch"
          aria-checked={(rawData as { active?: boolean }).active !== false}
          onClick={() => {
            const next = (rawData as { active?: boolean }).active === false;
            onChange({ ...rawData, active: next });
            if (flowId && nodeId) {
              fetch(`/api/v1/flows/${flowId}/trigger-active`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ nodeId, active: next }),
              })
                .then(() => router.refresh())
                .catch(() => {});
            }
          }}
          className={cn(
            "relative h-5 w-9 shrink-0 rounded-full transition-colors",
            (rawData as { active?: boolean }).active !== false ? "bg-blue-600" : "bg-neutral-600"
          )}
        >
          <span
            className={cn(
              "absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all",
              (rawData as { active?: boolean }).active !== false ? "left-[18px]" : "left-0.5"
            )}
          />
        </button>
      </div>
      )}
    </div>
  );
}
