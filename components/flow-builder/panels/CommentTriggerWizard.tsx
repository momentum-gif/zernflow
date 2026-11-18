"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, ChevronLeft, Loader2, Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Comment trigger editor laid out like ManyChat's "Comentarios de publicaciones
 * o reels" trigger: a 3-step wizard (post → keywords → public reply) that ends
 * in a numbered summary with an "Editar" button.
 *
 * Node data written here (read by lib/flow-triggers.ts):
 *   postScope       "specific" | "any" | "next"
 *   postIds         string[]                (specific)
 *   selectedPosts   {id, picture}[]         (thumbnails for the summary)
 *   knownPostIds    string[]                (next: posts that already existed)
 *   anyComment      boolean
 *   keywords        {value, matchType}[]    (comments that include)
 *   excludeKeywords string[]                (comments that exclude)
 *   replyEnabled    boolean
 *   replyText       "a||b||c"               (one picked at random)
 *   wizardDone      boolean
 */

type PostScope = "specific" | "any" | "next";

interface Keyword {
  value: string;
  matchType: "exact" | "contains" | "startsWith";
}

interface Post {
  id: string;
  picture: string | null;
  content: string | null;
}

interface Props {
  data: Record<string, unknown>;
  onChange: (data: Record<string, unknown>) => void;
}

const DEFAULT_REPLIES = [
  "¡Te lo envié por DM! Revisa tus mensajes 📬",
  "Ya te escribí, ¡ve a revisarlo! 🚀",
  "¡Listo! Mira tus DMs 📤",
];

function readScope(data: Record<string, unknown>): PostScope {
  const s = data.postScope;
  if (s === "specific" || s === "any" || s === "next") return s;
  // Nodes created before the wizard: postIds meant "specific", none meant "any".
  return Array.isArray(data.postIds) && data.postIds.length > 0 ? "specific" : "any";
}

function readReplies(data: Record<string, unknown>): string[] {
  return typeof data.replyText === "string" && data.replyText.length > 0
    ? data.replyText.split("||")
    : [];
}

function readReplyEnabled(data: Record<string, unknown>): boolean {
  if (typeof data.replyEnabled === "boolean") return data.replyEnabled;
  return readReplies(data).some((r) => r.trim());
}

export function CommentTriggerWizard({ data, onChange }: Props) {
  const scope = readScope(data);
  const postIds = Array.isArray(data.postIds) ? (data.postIds as string[]) : [];
  const selectedPosts = Array.isArray(data.selectedPosts)
    ? (data.selectedPosts as Array<{ id: string; picture: string | null }>)
    : [];
  const keywords = Array.isArray(data.keywords) ? (data.keywords as Keyword[]) : [];
  const excludeKeywords = Array.isArray(data.excludeKeywords)
    ? (data.excludeKeywords as string[])
    : [];
  const anyComment = data.anyComment === true;
  const replyEnabled = readReplyEnabled(data);
  const replies = readReplies(data);

  // A brand-new node opens on step 1; an already configured one opens on the summary.
  const [step, setStep] = useState<0 | 1 | 2 | 3>(data.wizardDone === true ? 0 : 1);

  const update = useCallback(
    (patch: Record<string, unknown>) => onChange({ ...data, ...patch }),
    [data, onChange],
  );

  if (step === 0) {
    return (
      <Summary
        scope={scope}
        selectedPosts={selectedPosts}
        postCount={postIds.length}
        anyComment={anyComment}
        keywords={keywords}
        excludeKeywords={excludeKeywords}
        replyEnabled={replyEnabled}
        replies={replies}
        onEdit={() => setStep(1)}
      />
    );
  }

  return (
    <div className="flex flex-col">
      <div className="mb-4">
        <p className="text-xs text-muted-foreground">Paso {step} de 3</p>
        <div className="mt-1.5 h-1 w-full rounded-full bg-muted">
          <div
            className="h-1 rounded-full bg-emerald-500 transition-all"
            style={{ width: `${(step / 3) * 100}%` }}
          />
        </div>
      </div>

      {step === 1 && (
        <StepPost
          scope={scope}
          postIds={postIds}
          onChange={update}
          onContinue={() => setStep(2)}
        />
      )}
      {step === 2 && (
        <StepKeywords
          anyComment={anyComment}
          keywords={keywords}
          excludeKeywords={excludeKeywords}
          onChange={update}
          onBack={() => setStep(1)}
          onContinue={() => setStep(3)}
        />
      )}
      {step === 3 && (
        <StepReply
          replyEnabled={replyEnabled}
          replies={replies}
          onChange={update}
          onBack={() => setStep(2)}
          onSave={() => {
            update({ wizardDone: true });
            setStep(0);
          }}
        />
      )}
    </div>
  );
}

/* ----------------------------- shared pieces ----------------------------- */

export function OptionCard({
  selected,
  title,
  onSelect,
  children,
}: {
  selected: boolean;
  title: string;
  onSelect: () => void;
  children?: React.ReactNode;
}) {
  return (
    <div
      onClick={onSelect}
      className={cn(
        "cursor-pointer rounded-xl border p-3 transition-colors",
        selected ? "border-emerald-500 ring-1 ring-emerald-500" : "border-border hover:border-input",
      )}
    >
      <p className="text-sm font-medium text-foreground">{title}</p>
      {selected && children && <div className="mt-3">{children}</div>}
    </div>
  );
}

export function Footer({
  onBack,
  primaryLabel,
  primaryDisabled,
  onPrimary,
}: {
  onBack?: () => void;
  primaryLabel: string;
  primaryDisabled?: boolean;
  onPrimary: () => void;
}) {
  return (
    <div className="mt-5 flex items-center justify-between gap-2 border-t border-border pt-4">
      {onBack ? (
        <button
          type="button"
          onClick={onBack}
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-border text-muted-foreground hover:bg-muted"
          aria-label="Atrás"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
      ) : (
        <span />
      )}
      <button
        type="button"
        onClick={onPrimary}
        disabled={primaryDisabled}
        className="rounded-lg bg-emerald-500 px-5 py-2 text-sm font-medium text-white hover:bg-emerald-600 disabled:opacity-40"
      >
        {primaryLabel}
      </button>
    </div>
  );
}

export function KeywordBox({
  label,
  values,
  onAdd,
  onRemove,
}: {
  label: React.ReactNode;
  values: string[];
  onAdd: (v: string) => void;
  onRemove: (i: number) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");

  const commit = () => {
    const v = draft.trim();
    if (v) onAdd(v);
    setDraft("");
    setAdding(false);
  };

  return (
    <div className="rounded-lg border border-border bg-card p-3" onClick={(e) => e.stopPropagation()}>
      <p className="mb-2 text-xs text-muted-foreground">{label}</p>
      <div className="flex flex-wrap items-center gap-1.5">
        {values.map((v, i) => (
          <span
            key={`${v}-${i}`}
            className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-xs text-foreground"
          >
            {v}
            <button
              type="button"
              onClick={() => onRemove(i)}
              className="text-muted-foreground hover:text-red-500"
              aria-label={`Quitar ${v}`}
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        {adding ? (
          <input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                commit();
              }
              if (e.key === "Escape") {
                setDraft("");
                setAdding(false);
              }
            }}
            onBlur={commit}
            placeholder="Escribe y pulsa Enter"
            className="w-36 rounded-full border border-emerald-500 bg-card px-2.5 py-1 text-xs text-foreground focus:outline-none"
          />
        ) : (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="inline-flex items-center gap-1 rounded-full border border-dashed border-input px-2.5 py-1 text-xs text-muted-foreground hover:border-emerald-500 hover:text-emerald-600"
          >
            <Plus className="h-3 w-3" /> Palabra clave
          </button>
        )}
      </div>
    </div>
  );
}

/* --------------------------------- step 1 -------------------------------- */

function usePosts() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (next?: string | null) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        "/api/v1/instagram/posts" + (next ? `?cursor=${encodeURIComponent(next)}` : ""),
      );
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Error");
      setPosts((prev) => {
        const seen = new Set(prev.map((p) => p.id));
        return [...prev, ...(body.posts as Post[]).filter((p) => !seen.has(p.id))];
      });
      setCursor(body.nextCursor ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudieron cargar las publicaciones");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(null);
  }, [load]);

  return { posts, cursor, loading, error, loadMore: () => load(cursor) };
}

function StepPost({
  scope,
  postIds,
  onChange,
  onContinue,
}: {
  scope: PostScope;
  postIds: string[];
  onChange: (patch: Record<string, unknown>) => void;
  onContinue: () => void;
}) {
  const { posts, cursor, loading, error, loadMore } = usePosts();

  const togglePost = (post: Post) => {
    const isSelected = postIds.includes(post.id);
    const nextIds = isSelected ? postIds.filter((id) => id !== post.id) : [...postIds, post.id];
    const nextSelected = nextIds.map((id) => {
      const p = posts.find((x) => x.id === id);
      return { id, picture: p?.picture ?? null };
    });
    onChange({ postScope: "specific", postIds: nextIds, selectedPosts: nextSelected });
  };

  const chooseNext = () => {
    if (loading || error) return;
    // "Siguiente publicación": remember which posts already exist; the first
    // comment on a post that is not in this list locks the trigger to that post.
    onChange({ postScope: "next", knownPostIds: posts.map((p) => p.id), lockedPostId: null });
  };

  return (
    <>
      <h3 className="mb-4 text-lg font-semibold leading-snug text-foreground">
        ¿Qué publicación o Reel quiere usar en la automatización?
      </h3>

      <div className="space-y-2">
        <OptionCard
          selected={scope === "specific"}
          title="Publicación o Reel específico"
          onSelect={() => onChange({ postScope: "specific" })}
        >
          {loading && posts.length === 0 ? (
            <div className="flex justify-center py-6">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : error ? (
            <p className="py-4 text-center text-xs text-red-500">{error}</p>
          ) : posts.length === 0 ? (
            <p className="py-4 text-center text-xs text-muted-foreground">¡Aún no has publicado nada!</p>
          ) : (
            <>
              <div className="grid grid-cols-3 gap-1.5" onClick={(e) => e.stopPropagation()}>
                {posts.map((post) => {
                  const selected = postIds.includes(post.id);
                  return (
                    <button
                      key={post.id}
                      type="button"
                      onClick={() => togglePost(post)}
                      title={post.content ?? ""}
                      className={cn(
                        "relative aspect-[4/5] overflow-hidden rounded-md bg-muted",
                        selected && "ring-2 ring-emerald-500",
                      )}
                    >
                      {post.picture ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={post.picture} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <span className="flex h-full items-center justify-center p-1 text-[10px] text-muted-foreground">
                          {post.content?.slice(0, 40) || "Sin imagen"}
                        </span>
                      )}
                      {selected && (
                        <span className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500 text-white">
                          <Check className="h-3 w-3" />
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
              {cursor && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    loadMore();
                  }}
                  disabled={loading}
                  className="mt-2 w-full text-center text-xs font-medium text-emerald-600 hover:underline disabled:opacity-50"
                >
                  {loading ? "Cargando..." : "Mostrar más"}
                </button>
              )}
            </>
          )}
        </OptionCard>

        <OptionCard
          selected={scope === "any"}
          title="Todas las publicaciones o Reels"
          onSelect={() => onChange({ postScope: "any" })}
        />

        <OptionCard
          selected={scope === "next"}
          title="Siguiente publicación o Reel"
          onSelect={chooseNext}
        >
          <p className="text-xs text-muted-foreground">
            La automatización se activará en la próxima publicación o Reel que subas.
          </p>
        </OptionCard>
      </div>

      <Footer
        primaryLabel="Continuar"
        primaryDisabled={scope === "specific" && postIds.length === 0}
        onPrimary={onContinue}
      />
    </>
  );
}

/* --------------------------------- step 2 -------------------------------- */

function StepKeywords({
  anyComment,
  keywords,
  excludeKeywords,
  onChange,
  onBack,
  onContinue,
}: {
  anyComment: boolean;
  keywords: Keyword[];
  excludeKeywords: string[];
  onChange: (patch: Record<string, unknown>) => void;
  onBack: () => void;
  onContinue: () => void;
}) {
  return (
    <>
      <h3 className="mb-4 text-lg font-semibold leading-snug text-foreground">
        ¿Qué iniciará su automatización de DM?
      </h3>

      <div className="space-y-2">
        <OptionCard
          selected={!anyComment}
          title="Palabras clave específicas"
          onSelect={() => onChange({ anyComment: false })}
        >
          <div className="space-y-2">
            <KeywordBox
              label={
                <>
                  Los comentarios que <b>incluyen</b> estas palabras clave:
                </>
              }
              values={keywords.map((k) => k.value)}
              onAdd={(v) => onChange({ keywords: [...keywords, { value: v, matchType: "contains" }] })}
              onRemove={(i) => onChange({ keywords: keywords.filter((_, j) => j !== i) })}
            />
            <KeywordBox
              label={
                <>
                  Los comentarios que <b>excluyen</b> estas palabras clave:
                </>
              }
              values={excludeKeywords}
              onAdd={(v) => onChange({ excludeKeywords: [...excludeKeywords, v] })}
              onRemove={(i) => onChange({ excludeKeywords: excludeKeywords.filter((_, j) => j !== i) })}
            />
            <p className="text-xs text-muted-foreground">
              Las palabras clave no distinguen mayúsculas de minúsculas, por ejemplo, &quot;Hola&quot; y
              &quot;hola&quot; se reconocen como iguales.
            </p>
          </div>
        </OptionCard>

        <OptionCard
          selected={anyComment}
          title="Cualquier comentario"
          onSelect={() => onChange({ anyComment: true })}
        />
      </div>

      <Footer
        onBack={onBack}
        primaryLabel="Continuar"
        primaryDisabled={!anyComment && keywords.length === 0}
        onPrimary={onContinue}
      />
    </>
  );
}

/* --------------------------------- step 3 -------------------------------- */

function StepReply({
  replyEnabled,
  replies,
  onChange,
  onBack,
  onSave,
}: {
  replyEnabled: boolean;
  replies: string[];
  onChange: (patch: Record<string, unknown>) => void;
  onBack: () => void;
  onSave: () => void;
}) {
  const list = replies.length > 0 ? replies : DEFAULT_REPLIES;
  const setList = (next: string[]) => onChange({ replyText: next.join("||") });

  return (
    <>
      <h3 className="mb-4 text-lg font-semibold leading-snug text-foreground">
        ¿Quiere configurar una respuesta pública en el canal?
      </h3>

      <div className="space-y-2">
        <OptionCard
          selected={replyEnabled}
          title="Sí, múltiples respuestas aleatorias"
          onSelect={() =>
            onChange({ replyEnabled: true, replyText: (replies.length > 0 ? replies : DEFAULT_REPLIES).join("||") })
          }
        >
          <div className="space-y-2" onClick={(e) => e.stopPropagation()}>
            {list.map((r, i) => (
              <div key={i} className="flex items-start gap-1.5">
                <textarea
                  value={r}
                  rows={2}
                  onChange={(e) => {
                    const next = [...list];
                    next[i] = e.target.value.replace(/\|\|/g, "|");
                    setList(next);
                  }}
                  className="w-full resize-none rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
                {list.length > 1 && (
                  <button
                    type="button"
                    onClick={() => setList(list.filter((_, j) => j !== i))}
                    className="mt-2 text-muted-foreground hover:text-red-500"
                    aria-label="Quitar respuesta"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            ))}
            <button
              type="button"
              onClick={() => setList([...list, ""])}
              className="w-full rounded-lg border border-dashed border-input py-2 text-xs font-medium text-muted-foreground hover:border-emerald-500 hover:text-emerald-600"
            >
              + Nueva respuesta
            </button>
          </div>
        </OptionCard>

        <OptionCard selected={!replyEnabled} title="No" onSelect={() => onChange({ replyEnabled: false })} />
      </div>

      <Footer onBack={onBack} primaryLabel="Guardar" onPrimary={onSave} />
    </>
  );
}

/* -------------------------------- summary -------------------------------- */

function Summary({
  scope,
  selectedPosts,
  postCount,
  anyComment,
  keywords,
  excludeKeywords,
  replyEnabled,
  replies,
  onEdit,
}: {
  scope: PostScope;
  selectedPosts: Array<{ id: string; picture: string | null }>;
  postCount: number;
  anyComment: boolean;
  keywords: Keyword[];
  excludeKeywords: string[];
  replyEnabled: boolean;
  replies: string[];
  onEdit: () => void;
}) {
  const cleanReplies = replies.filter((r) => r.trim());

  return (
    <div className="flex flex-col">
      <div className="space-y-5">
        <section>
          <p className="mb-2 text-sm font-semibold text-foreground">
            <span className="mr-2 text-muted-foreground">1</span>Cuando alguien comenta sobre
          </p>
          <div className="rounded-xl border border-border p-3">
            <p className="text-sm text-foreground">
              {scope === "specific"
                ? "Publicación o Reel específico"
                : scope === "next"
                  ? "Siguiente publicación o Reel"
                  : "Todas las publicaciones o Reels"}
            </p>
            {scope === "specific" && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {selectedPosts.length > 0
                  ? selectedPosts.map((p) =>
                      p.picture ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img key={p.id} src={p.picture} alt="" className="h-16 w-14 rounded-md object-cover" />
                      ) : (
                        <span key={p.id} className="h-16 w-14 rounded-md bg-muted" />
                      ),
                    )
                  : postCount > 0 && (
                      <p className="text-xs text-muted-foreground">
                        {postCount} {postCount === 1 ? "publicación" : "publicaciones"}
                      </p>
                    )}
              </div>
            )}
          </div>
        </section>

        <section>
          <p className="mb-2 text-sm font-semibold text-foreground">
            <span className="mr-2 text-muted-foreground">2</span>Y su comentario
          </p>
          <div className="rounded-xl border border-border p-3 text-sm text-foreground">
            {anyComment ? (
              "Cualquier comentario"
            ) : (
              <>
                <p className="text-xs text-muted-foreground">Incluye:</p>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {keywords.map((k, i) => (
                    <span key={i} className="rounded-full bg-muted px-2.5 py-1 text-xs">
                      {k.value}
                    </span>
                  ))}
                </div>
              </>
            )}
            {excludeKeywords.length > 0 && (
              <>
                <p className="mt-2 text-xs text-muted-foreground">Excluye:</p>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {excludeKeywords.map((k, i) => (
                    <span key={i} className="rounded-full bg-muted px-2.5 py-1 text-xs">
                      {k}
                    </span>
                  ))}
                </div>
              </>
            )}
          </div>
        </section>

        <section>
          <p className="mb-2 text-sm font-semibold text-foreground">
            <span className="mr-2 text-muted-foreground">3</span>Responde también a su comentario
          </p>
          {replyEnabled && cleanReplies.length > 0 ? (
            <div className="space-y-2">
              {cleanReplies.map((r, i) => (
                <div key={i} className="rounded-xl border border-border p-3 text-sm text-foreground">
                  {r}
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-xl border border-border p-3 text-sm text-muted-foreground">No</div>
          )}
        </section>
      </div>

      <div className="mt-5 flex justify-end border-t border-border pt-4">
        <button
          type="button"
          onClick={onEdit}
          className="rounded-lg border border-border px-5 py-2 text-sm font-medium text-foreground hover:bg-muted"
        >
          Editar
        </button>
      </div>
    </div>
  );
}
