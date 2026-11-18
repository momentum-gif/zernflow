"use client";

import { useEffect, useState } from "react";
import { Check, Copy } from "lucide-react";
import { Footer, KeywordBox, OptionCard } from "./CommentTriggerWizard";

interface Keyword {
  value: string;
  matchType: "exact" | "contains" | "startsWith";
}

interface PanelProps {
  data: Record<string, unknown>;
  onChange: (data: Record<string, unknown>) => void;
}

/* ------------------------- Respuesta a las historias ------------------------- */

/**
 * Story reply trigger, laid out like ManyChat's: which story → which replies,
 * then a numbered summary with "Editar". Instagram does not let apps list a
 * profile's live Stories ahead of time, so "Historia específica" is not offered.
 */
export function StoryReplyWizard({ data, onChange }: PanelProps) {
  const keywords = Array.isArray(data.keywords) ? (data.keywords as Keyword[]) : [];
  const excludeKeywords = Array.isArray(data.excludeKeywords) ? (data.excludeKeywords as string[]) : [];
  const anyComment = data.anyComment !== false;
  const [step, setStep] = useState<0 | 1 | 2>(data.wizardDone === true ? 0 : 1);
  const update = (patch: Record<string, unknown>) => onChange({ ...data, ...patch });

  if (step === 0) {
    return (
      <div className="flex flex-col">
        <div className="space-y-5">
          <section>
            <p className="mb-2 text-sm font-semibold text-foreground">
              <span className="mr-2 text-muted-foreground">1</span>Cuando alguien responde a
            </p>
            <div className="rounded-xl border border-border p-3 text-sm text-foreground">Cualquier historia</div>
          </section>
          <section>
            <p className="mb-2 text-sm font-semibold text-foreground">
              <span className="mr-2 text-muted-foreground">2</span>Y su respuesta
            </p>
            <div className="rounded-xl border border-border p-3 text-sm text-foreground">
              {anyComment ? (
                "Cualquier respuesta"
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {keywords.map((k, i) => (
                    <span key={i} className="rounded-full bg-muted px-2.5 py-1 text-xs">
                      {k.value}
                    </span>
                  ))}
                </div>
              )}
              {excludeKeywords.length > 0 && (
                <p className="mt-2 text-xs text-muted-foreground">Excluye: {excludeKeywords.join(", ")}</p>
              )}
            </div>
          </section>
        </div>
        <div className="mt-5 flex justify-end border-t border-border pt-4">
          <button
            type="button"
            onClick={() => setStep(1)}
            className="rounded-lg border border-border px-5 py-2 text-sm font-medium text-foreground hover:bg-muted"
          >
            Editar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      <div className="mb-4">
        <p className="text-xs text-muted-foreground">Paso {step} de 2</p>
        <div className="mt-1.5 h-1 w-full rounded-full bg-muted">
          <div className="h-1 rounded-full bg-emerald-500 transition-all" style={{ width: `${(step / 2) * 100}%` }} />
        </div>
      </div>

      {step === 1 && (
        <>
          <h3 className="mb-4 text-lg font-semibold leading-snug text-foreground">
            ¿Qué historia quiere usar en la automatización?
          </h3>
          <div className="space-y-2">
            <OptionCard selected title="Cualquier historia" onSelect={() => {}}>
              <p className="text-xs text-muted-foreground">
                Se activa con las respuestas a cualquiera de tus historias, incluidas las destacadas.
              </p>
            </OptionCard>
            <div className="cursor-not-allowed rounded-xl border border-border p-3 opacity-60">
              <p className="flex items-center gap-2 text-sm font-medium text-foreground">
                Historia específica
                <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
                  NO DISPONIBLE
                </span>
              </p>
            </div>
          </div>
          <Footer primaryLabel="Continuar" onPrimary={() => setStep(2)} />
        </>
      )}

      {step === 2 && (
        <>
          <h3 className="mb-4 text-lg font-semibold leading-snug text-foreground">
            ¿Qué iniciará su automatización de DM?
          </h3>
          <div className="space-y-2">
            <OptionCard
              selected={!anyComment}
              title="Palabras clave específicas"
              onSelect={() => update({ anyComment: false })}
            >
              <div className="space-y-2">
                <KeywordBox
                  label={
                    <>
                      Las respuestas que <b>incluyen</b> estas palabras clave:
                    </>
                  }
                  values={keywords.map((k) => k.value)}
                  onAdd={(v) => update({ keywords: [...keywords, { value: v, matchType: "contains" }] })}
                  onRemove={(i) => update({ keywords: keywords.filter((_, j) => j !== i) })}
                />
                <KeywordBox
                  label={
                    <>
                      Las respuestas que <b>excluyen</b> estas palabras clave:
                    </>
                  }
                  values={excludeKeywords}
                  onAdd={(v) => update({ excludeKeywords: [...excludeKeywords, v] })}
                  onRemove={(i) => update({ excludeKeywords: excludeKeywords.filter((_, j) => j !== i) })}
                />
                <p className="text-xs text-muted-foreground">
                  Las palabras clave no distinguen mayúsculas de minúsculas.
                </p>
              </div>
            </OptionCard>
            <OptionCard selected={anyComment} title="Cualquier respuesta" onSelect={() => update({ anyComment: true })} />
          </div>
          <Footer
            onBack={() => setStep(1)}
            primaryLabel="Guardar"
            primaryDisabled={!anyComment && keywords.length === 0}
            onPrimary={() => {
              update({ wizardDone: true });
              setStep(0);
            }}
          />
        </>
      )}
    </div>
  );
}

/* ----------------------- URL de referencia de Instagram ---------------------- */

export function RefUrlPanel({ data, onChange }: PanelProps) {
  const ref = typeof data.ref === "string" ? data.ref : "";
  const [username, setUsername] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetch("/api/v1/channels")
      .then((r) => (r.ok ? r.json() : []))
      .then((channels: Array<{ platform: string; username: string | null; is_active: boolean }>) => {
        const ig = channels.find((c) => c.platform === "instagram" && c.is_active && c.username);
        setUsername(ig?.username ?? null);
      })
      .catch(() => setUsername(null));
  }, []);

  const link = `https://ig.me/m/${username ?? "tu_usuario"}?ref=${encodeURIComponent(ref || "tu-codigo")}`;

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold leading-snug text-foreground">URL de referencia de Instagram</h3>
      <p className="text-xs text-muted-foreground">
        Comparte este enlace en tu biografía, historias o en otras redes. Quien lo abra entra a tu chat de Instagram
        y se inicia esta automatización.
      </p>

      <div>
        <label className="mb-1.5 block text-xs font-semibold text-foreground">Código del enlace (ref)</label>
        <input
          value={ref}
          onChange={(e) =>
            onChange({ ...data, ref: e.target.value.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 60) })
          }
          placeholder="ej: guia-gratis"
          className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
        />
        <p className="mt-1 text-xs text-muted-foreground">Solo letras, números, guion y guion bajo.</p>
      </div>

      <div>
        <label className="mb-1.5 block text-xs font-semibold text-foreground">Tu enlace</label>
        <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2">
          <span className="min-w-0 flex-1 truncate text-sm text-foreground">{link}</span>
          <button
            type="button"
            disabled={!ref || !username}
            onClick={() => {
              navigator.clipboard.writeText(link).then(() => {
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              });
            }}
            className="flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-emerald-600 hover:bg-emerald-50 disabled:opacity-40"
          >
            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            {copied ? "Copiado" : "Copiar"}
          </button>
        </div>
        {!username && (
          <p className="mt-1 text-xs text-amber-600">No encontré tu cuenta de Instagram conectada.</p>
        )}
      </div>
    </div>
  );
}

/* --------------------- Respuesta a mención en una historia -------------------- */

export function StoryMentionInfo() {
  return (
    <div className="space-y-2">
      <h3 className="text-lg font-semibold leading-snug text-foreground">Mención en una historia</h3>
      <p className="text-sm text-muted-foreground">
        Se activa cuando alguien te menciona en su historia de Instagram. Conecta el siguiente paso para agradecerle o
        enviarle algo.
      </p>
    </div>
  );
}
