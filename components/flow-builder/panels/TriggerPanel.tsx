"use client";

import { cn } from "@/lib/utils";

import { useCallback, useState } from "react";
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
}: TriggerPanelProps & { flowId?: string; nodeId?: string }) {
  const data = rawData as TriggerPanelData;
  const triggerType = data.triggerType || "keyword";
  const keywords = data.keywords || [];
  const [newKeyword, setNewKeyword] = useState("");
  const [newMatchType, setNewMatchType] = useState<"exact" | "contains" | "startsWith">("contains");
  // An empty "Cuando..." block opens the trigger list right away, like ManyChat.
  const [pickerOpen, setPickerOpen] = useState(triggerType === "none");
  const currentOption = findTriggerOption(triggerType);

  const handleTriggerTypeChange = useCallback(
    (type: string) => {
      // A different trigger starts its own setup from step 1.
      onChange({ ...data, triggerType: type, wizardDone: false });
    },
    [data, onChange]
  );

  const addKeyword = useCallback(() => {
    const trimmed = newKeyword.trim();
    if (!trimmed) return;
    const updated: Keyword[] = [...keywords, { value: trimmed, matchType: newMatchType }];
    onChange({ ...data, keywords: updated });
    setNewKeyword("");
  }, [data, keywords, newKeyword, newMatchType, onChange]);

  const removeKeyword = useCallback(
    (index: number) => {
      const updated = keywords.filter((_, i) => i !== index);
      onChange({ ...data, keywords: updated });
    },
    [data, keywords, onChange]
  );

  const updateKeywordMatchType = useCallback(
    (index: number, matchType: "exact" | "contains" | "startsWith") => {
      const updated = keywords.map((k, i) => (i === index ? { ...k, matchType } : k));
      onChange({ ...data, keywords: updated });
    },
    [data, keywords, onChange]
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
            <span className="block text-xs text-muted-foreground">{currentOption?.category ?? "Disparador"}</span>
            <span className="block text-sm font-medium text-foreground">
              {triggerType === "none" ? "Agrega un disparador" : currentOption?.title ?? triggerType}
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
              }).catch(() => {});
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
    </div>
  );
}
