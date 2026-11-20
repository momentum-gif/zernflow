"use client";

import { useState, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { X, Hash, AtSign, CheckCircle2, Pause, Play, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { setContactTag, setContactField, setContactPaused } from "@/lib/actions/contacts";
import { enrollContact } from "@/lib/actions/sequences";
import type { InboxConversation } from "./conversation-list";

interface Tag {
  id: string;
  name: string;
  color: string | null;
}

interface Details {
  contactId: string;
  displayName: string | null;
  email: string | null;
  avatarUrl: string | null;
  isSubscribed: boolean;
  createdAt: string;
  username: string | null;
  tagIds: string[];
  sequences: string[];
  fields: Array<{ id: string; name: string; slug: string; value: string }>;
}

function ago(iso: string) {
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (d < 1) return "hoy";
  if (d === 1) return "hace 1 día";
  if (d < 30) return `hace ${d} días`;
  const m = Math.floor(d / 30);
  return m === 1 ? "hace 1 mes" : `hace ${m} meses`;
}

export function ContactPanel({
  contactId,
  conversation,
  tags,
  sequences,
  onClose,
}: {
  contactId: string;
  conversation: InboxConversation;
  tags: Tag[];
  sequences: Array<{ id: string; name: string }>;
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [d, setD] = useState<Details | null>(null);
  const [addingTag, setAddingTag] = useState(false);
  const [newTag, setNewTag] = useState("");
  const [paused, setPaused] = useState(conversation.is_automation_paused);

  useEffect(() => setPaused(conversation.is_automation_paused), [conversation.is_automation_paused]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const supabase = createClient();
      const [contactRes, tagsRes, valuesRes, defsRes, channelsRes, enrRes] = await Promise.all([
        supabase.from("contacts").select("*").eq("id", contactId).single(),
        supabase.from("contact_tags").select("tag_id").eq("contact_id", contactId),
        supabase.from("contact_custom_fields").select("field_id, value").eq("contact_id", contactId),
        supabase.from("custom_field_definitions").select("id, name, slug").eq("workspace_id", conversation.workspace_id).order("name"),
        supabase.from("contact_channels").select("platform_username").eq("contact_id", contactId),
        supabase.from("sequence_enrollments").select("sequences(name)").eq("contact_id", contactId).eq("status", "active"),
      ]);
      if (cancelled || !contactRes.data) return;
      const c = contactRes.data;
      const values = new Map(((valuesRes.data ?? []) as Array<{ field_id: string; value: string }>).map((v) => [v.field_id, v.value]));
      setD({
        contactId,
        displayName: c.display_name,
        email: c.email,
        avatarUrl: c.avatar_url,
        isSubscribed: c.is_subscribed,
        createdAt: c.created_at,
        username: ((channelsRes.data ?? []) as Array<{ platform_username: string | null }>).find((x) => x.platform_username)?.platform_username ?? null,
        tagIds: ((tagsRes.data ?? []) as Array<{ tag_id: string }>).map((t) => t.tag_id),
        sequences: ((enrRes.data ?? []) as unknown as Array<{ sequences: { name: string } | null }>)
          .map((e) => e.sequences?.name ?? "")
          .filter(Boolean),
        fields: ((defsRes.data ?? []) as Array<{ id: string; name: string; slug: string }>).map((f) => ({
          ...f,
          value: values.get(f.id) ?? "",
        })),
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [contactId, conversation.workspace_id, conversation.contacts?.contact_tags]);

  const run = (fn: () => Promise<unknown>) =>
    start(async () => {
      await fn();
      router.refresh();
    });

  const details = d?.contactId === contactId ? d : null;
  const [first, ...rest] = (details?.displayName ?? "").trim().split(/\s+/);

  return (
    <div className="flex h-full w-80 shrink-0 flex-col border-l border-border bg-background">
      <div className="flex h-14 shrink-0 items-center justify-end border-b border-border px-3">
        <button onClick={onClose} aria-label="Contraer barra de usuario" className="rounded-md p-1 text-muted-foreground hover:bg-accent">
          <X className="h-4 w-4" />
        </button>
      </div>

      {!details ? (
        <div className="flex flex-1 items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="flex-1 space-y-5 overflow-y-auto p-4 text-sm">
          <div className="flex items-center gap-3">
            {details.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={details.avatarUrl} alt="" className="h-12 w-12 rounded-full object-cover" />
            ) : (
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-lg font-semibold">
                {details.displayName?.[0]?.toUpperCase() ?? "?"}
              </div>
            )}
            <div className="min-w-0">
              <p className="truncate font-semibold">{details.displayName ?? "Sin nombre"}</p>
              <p className="flex items-center gap-1 text-xs">
                <CheckCircle2 className={cn("h-3.5 w-3.5", details.isSubscribed ? "text-emerald-600" : "text-muted-foreground")} />
                {details.isSubscribed ? "Suscrito" : "No suscrito"}
              </p>
            </div>
          </div>

          <div className="space-y-1.5 text-xs text-muted-foreground">
            <p className="flex items-center gap-2">
              <Hash className="h-3.5 w-3.5" /> {details.contactId.slice(0, 8)}
            </p>
            {details.username && (
              <a
                href={`https://www.instagram.com/${details.username}`}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-2 text-blue-600"
              >
                <AtSign className="h-3.5 w-3.5" /> {details.username}
              </a>
            )}
            <p>Suscrito {ago(details.createdAt)}</p>
          </div>

          <section className="flex items-center justify-between">
            <p className="font-medium">Automatizaciones</p>
            <button
              disabled={pending}
              onClick={() =>
                run(async () => {
                  await setContactPaused(contactId, !paused);
                  setPaused(!paused);
                })
              }
              className="flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-xs hover:bg-muted disabled:opacity-60"
            >
              {paused ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
              {paused ? "Reanudar" : "Pausar"}
            </button>
          </section>

          <section>
            <p className="mb-2 font-medium">Etiquetas de contacto</p>
            <div className="flex flex-wrap gap-1.5">
              {details.tagIds.map((id) => {
                const t = tags.find((x) => x.id === id);
                if (!t) return null;
                return (
                  <span key={id} className="flex items-center gap-1 rounded-full bg-muted px-2.5 py-0.5 text-xs">
                    {t.name}
                    <button
                      onClick={() =>
                        run(async () => {
                          await setContactTag(contactId, t.name, "remove");
                          setD((x) => (x ? { ...x, tagIds: x.tagIds.filter((y) => y !== id) } : x));
                        })
                      }
                      className="hover:text-red-500"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                );
              })}
            </div>
            {addingTag ? (
              <div className="mt-2">
                <input
                  autoFocus
                  list="inbox-tags"
                  value={newTag}
                  onChange={(e) => setNewTag(e.target.value)}
                  onBlur={() => !newTag && setAddingTag(false)}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") setAddingTag(false);
                    if (e.key === "Enter" && newTag.trim()) {
                      const name = newTag.trim();
                      setNewTag("");
                      setAddingTag(false);
                      run(async () => {
                        await setContactTag(contactId, name, "add");
                        const id = tags.find((t) => t.name === name)?.id;
                        if (id) setD((x) => (x ? { ...x, tagIds: [...new Set([...x.tagIds, id])] } : x));
                      });
                    }
                  }}
                  placeholder="Nombre de la etiqueta"
                  className="w-full rounded-md border border-border bg-card px-2 py-1 text-xs"
                />
                <datalist id="inbox-tags">
                  {tags.map((t) => (
                    <option key={t.id} value={t.name} />
                  ))}
                </datalist>
              </div>
            ) : (
              <button onClick={() => setAddingTag(true)} className="mt-2 text-xs text-blue-600 hover:underline">
                + Añadir etiqueta
              </button>
            )}
          </section>

          <section>
            <p className="mb-1 font-medium">Suscrito a secuencias</p>
            {details.sequences.length > 0 && <p className="mb-1 text-xs text-muted-foreground">{details.sequences.join(", ")}</p>}
            {sequences.length > 0 && (
              <select
                value=""
                onChange={(e) => {
                  const id = e.target.value;
                  const name = sequences.find((s) => s.id === id)?.name;
                  if (id)
                    run(async () => {
                      await enrollContact(id, contactId, conversation.channel_id);
                      if (name) setD((x) => (x ? { ...x, sequences: [...new Set([...x.sequences, name])] } : x));
                    });
                }}
                className="bg-transparent text-xs text-blue-600"
              >
                <option value="">Suscribirse</option>
                {sequences.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            )}
          </section>

          <section>
            <p className="mb-1 font-medium">Aceptación de ingreso a través de</p>
            <p className="text-xs capitalize text-muted-foreground">{conversation.platform}</p>
          </section>

          <section>
            <p className="mb-2 font-medium">Campos del sistema</p>
            <div className="flex flex-wrap gap-1.5 text-xs">
              <span className="rounded-full bg-muted px-2.5 py-1">
                Nombre: <b>{first || "No establecido"}</b>
              </span>
              <span className="rounded-full bg-muted px-2.5 py-1">
                Apellido: <b>{rest.join(" ") || "No establecido"}</b>
              </span>
              {details.email && (
                <span className="rounded-full bg-muted px-2.5 py-1">
                  Correo: <b>{details.email}</b>
                </span>
              )}
            </div>
          </section>

          <section>
            <p className="mb-2 font-medium">Campos personalizados</p>
            {details.fields.length === 0 ? (
              <p className="text-xs text-muted-foreground">Todavía no tenés campos personalizados.</p>
            ) : (
              <div className="space-y-2">
                {details.fields.map((f) => (
                  <label key={f.id} className="block rounded-md border border-border px-3 py-1.5">
                    <span className="block text-[11px] text-muted-foreground">{f.name}:</span>
                    <input
                      defaultValue={f.value}
                      onBlur={(e) => {
                        const v = e.target.value;
                        if (v !== f.value) run(() => setContactField(contactId, f.slug, v));
                      }}
                      placeholder="No establecido"
                      className="w-full bg-transparent text-xs focus:outline-none"
                    />
                  </label>
                ))}
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
