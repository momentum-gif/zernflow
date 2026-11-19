"use client";

import { askText, askConfirm } from "@/components/dialogs";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Filter, Search, X, Users, Pause, Play, CheckCircle2, Hash, AtSign, MessageCircle, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { setContactTag, setContactField, setContactPaused, bulkContacts } from "@/lib/actions/contacts";
import { enrollContact } from "@/lib/actions/sequences";

interface Tag {
  id: string;
  name: string;
  color: string | null;
}
interface FieldDef {
  id: string;
  name: string;
  slug: string;
  type: string;
}
interface Contact {
  id: string;
  display_name: string | null;
  email: string | null;
  avatar_url: string | null;
  is_subscribed: boolean;
  last_interaction_at: string | null;
  created_at: string;
  contact_tags: Array<{ tag_id: string; tags: Tag | null }>;
  contact_custom_fields: Array<{ field_id: string; value: string }>;
  contact_channels: Array<{ platform_username: string | null }>;
}

type Cond =
  | { kind: "tag"; op: "is" | "is_not"; value: string }
  | { kind: "field"; key: string; op: "is" | "is_not" | "contains" | "has" | "empty" | "after" | "before"; value: string };

function ago(iso: string | null) {
  if (!iso) return "—";
  const s = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return `hace ${s} segundos`;
  const m = Math.round(s / 60);
  if (m < 60) return `hace ${m} minutos`;
  const h = Math.round(m / 60);
  if (h < 24) return `hace ${h} horas`;
  const d = Math.round(h / 24);
  return d < 30 ? `hace ${d} días` : new Date(iso).toLocaleDateString();
}

const SYSTEM_FIELDS: Array<{ key: string; name: string; date?: boolean }> = [
  { key: "display_name", name: "Nombre completo" },
  { key: "email", name: "Correo electrónico" },
  { key: "username", name: "Usuario de Instagram" },
  { key: "is_subscribed", name: "Suscrito" },
  { key: "last_interaction_at", name: "Última interacción", date: true },
  { key: "created_at", name: "Suscrito desde", date: true },
];

const OP_LABEL: Record<string, string> = {
  is: "es",
  is_not: "no es",
  contains: "contiene",
  has: "tiene algún valor",
  empty: "está vacío",
  after: "después de",
  before: "antes de",
};

function fieldValue(c: Contact, key: string, fields: FieldDef[]): string {
  if (key === "display_name") return c.display_name ?? "";
  if (key === "email") return c.email ?? "";
  if (key === "username") return c.contact_channels.find((x) => x.platform_username)?.platform_username ?? "";
  if (key === "is_subscribed") return c.is_subscribed ? "sí" : "no";
  if (key === "last_interaction_at") return c.last_interaction_at ?? "";
  if (key === "created_at") return c.created_at;
  const def = fields.find((f) => f.slug === key);
  return (def && c.contact_custom_fields.find((x) => x.field_id === def.id)?.value) || "";
}

function matches(c: Contact, cond: Cond, fields: FieldDef[]): boolean {
  if (cond.kind === "tag") {
    const has = c.contact_tags.some((t) => t.tags?.name === cond.value);
    return cond.op === "is" ? has : !has;
  }
  const v = fieldValue(c, cond.key, fields).toLowerCase();
  const want = cond.value.toLowerCase();
  switch (cond.op) {
    case "is":
      return v === want;
    case "is_not":
      return v !== want;
    case "contains":
      return v.includes(want);
    case "has":
      return !!v;
    case "empty":
      return !v;
    case "after":
      return !!v && !!want && new Date(v) > new Date(want);
    case "before":
      return !!v && !!want && new Date(v) < new Date(want);
  }
}

function condLabel(cond: Cond, fields: FieldDef[]) {
  if (cond.kind === "tag") return `Etiqueta ${OP_LABEL[cond.op]} ${cond.value || "…"}`;
  const name = SYSTEM_FIELDS.find((f) => f.key === cond.key)?.name ?? fields.find((f) => f.slug === cond.key)?.name ?? cond.key;
  return `${name} ${OP_LABEL[cond.op]}${cond.op === "has" || cond.op === "empty" ? "" : ` ${cond.value || "…"}`}`;
}

/** "+ Condición": Filtros generales / Campos del sistema / Campos personalizados. */
function ConditionPicker({ tags, fields, onAdd }: { tags: Tag[]; fields: FieldDef[]; onAdd: (c: Cond) => void }) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"general" | "system" | "custom">("general");
  const [draft, setDraft] = useState<Cond | null>(null);
  const [q, setQ] = useState("");

  const close = () => {
    setOpen(false);
    setDraft(null);
    setQ("");
  };

  return (
    <div className="relative">
      <button type="button" onClick={() => setOpen((o) => !o)} className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted">
        + Condición
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={close} />
          <div className="absolute left-0 top-10 z-40 w-[420px] rounded-lg border border-border bg-card shadow-xl">
            {!draft ? (
              <>
                <div className="m-2 flex items-center gap-2 rounded-md border border-blue-500 px-2 py-1.5">
                  <Search className="h-3.5 w-3.5 text-muted-foreground" />
                  <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} className="w-full bg-transparent text-sm focus:outline-none" />
                </div>
                <div className="flex">
                  <div className="w-40 space-y-0.5 p-2 text-sm">
                    {(
                      [
                        ["general", "Filtros generales"],
                        ["system", "Campos del sistema"],
                        ["custom", "Campos personalizados"],
                      ] as const
                    ).map(([k, l]) => (
                      <button
                        key={k}
                        type="button"
                        onClick={() => setTab(k)}
                        className={cn("block w-full rounded px-2 py-1.5 text-left", tab === k ? "bg-muted font-medium" : "hover:bg-muted/60")}
                      >
                        {l}
                      </button>
                    ))}
                  </div>
                  <div className="max-h-64 flex-1 overflow-y-auto border-l border-border p-2 text-sm">
                    {tab === "general" &&
                      "etiqueta".includes(q.toLowerCase()) && (
                        <button type="button" onClick={() => setDraft({ kind: "tag", op: "is", value: "" })} className="block w-full rounded px-2 py-1.5 text-left hover:bg-muted">
                          🏷 Etiqueta
                        </button>
                      )}
                    {tab === "system" &&
                      SYSTEM_FIELDS.filter((f) => f.name.toLowerCase().includes(q.toLowerCase())).map((f) => (
                        <button
                          key={f.key}
                          type="button"
                          onClick={() => setDraft({ kind: "field", key: f.key, op: f.date ? "after" : "is", value: "" })}
                          className="block w-full rounded px-2 py-1.5 text-left hover:bg-muted"
                        >
                          {f.name}
                        </button>
                      ))}
                    {tab === "custom" &&
                      (fields.length === 0 ? (
                        <p className="px-2 py-3 text-xs text-muted-foreground">Ningún campo encontrado</p>
                      ) : (
                        fields
                          .filter((f) => f.name.toLowerCase().includes(q.toLowerCase()))
                          .map((f) => (
                            <button
                              key={f.id}
                              type="button"
                              onClick={() => setDraft({ kind: "field", key: f.slug, op: "is", value: "" })}
                              className="block w-full rounded px-2 py-1.5 text-left hover:bg-muted"
                            >
                              {f.name}
                            </button>
                          ))
                      ))}
                  </div>
                </div>
              </>
            ) : (
              <div className="space-y-3 p-3 text-sm">
                <p className="font-medium">{condLabel({ ...draft, value: "" } as Cond, fields).replace(/ …$/, "")}</p>
                <select
                  value={draft.op}
                  onChange={(e) => setDraft({ ...draft, op: e.target.value } as Cond)}
                  className="w-full rounded-md border border-border bg-card px-2 py-1.5"
                >
                  {(draft.kind === "tag"
                    ? ["is", "is_not"]
                    : SYSTEM_FIELDS.find((f) => f.key === draft.key)?.date
                      ? ["after", "before", "has", "empty"]
                      : ["is", "is_not", "contains", "has", "empty"]
                  ).map((o) => (
                    <option key={o} value={o}>
                      {OP_LABEL[o]}
                    </option>
                  ))}
                </select>
                {draft.kind === "tag" ? (
                  <select
                    value={draft.value}
                    onChange={(e) => setDraft({ ...draft, value: e.target.value })}
                    className="w-full rounded-md border border-border bg-card px-2 py-1.5"
                  >
                    <option value="">Elige una etiqueta</option>
                    {tags.map((t) => (
                      <option key={t.id} value={t.name}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                ) : draft.op !== "has" && draft.op !== "empty" ? (
                  <input
                    type={SYSTEM_FIELDS.find((f) => f.key === draft.key)?.date ? "date" : "text"}
                    value={draft.value}
                    onChange={(e) => setDraft({ ...draft, value: e.target.value })}
                    className="w-full rounded-md border border-border bg-card px-2 py-1.5"
                  />
                ) : null}
                <div className="flex justify-end gap-2">
                  <button type="button" onClick={() => setDraft(null)} className="rounded-md px-3 py-1.5 text-muted-foreground hover:bg-muted">
                    Atrás
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onAdd(draft);
                      close();
                    }}
                    className="rounded-md bg-blue-600 px-3 py-1.5 font-medium text-white hover:bg-blue-700"
                  >
                    Aplicar
                  </button>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

/** ManyChat contact profile: tags, sequences, fields, automations, pause, start chat. */
function ContactProfile({
  contact,
  tags,
  fields,
  sequences,
  onClose,
}: {
  contact: Contact;
  tags: Tag[];
  fields: FieldDef[];
  sequences: Array<{ id: string; name: string }>;
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [extra, setExtra] = useState<{
    sequences: string[];
    flows: Array<{ name: string; at: string }>;
    conversationId: string | null;
    channelId: string | null;
    paused: boolean;
  } | null>(null);
  const [newTag, setNewTag] = useState("");
  const [addingTag, setAddingTag] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({});
  const username = contact.contact_channels.find((x) => x.platform_username)?.platform_username;
  const contactTags = contact.contact_tags.map((t) => t.tags).filter(Boolean) as Tag[];

  useEffect(() => {
    const supabase = createClient();
    (async () => {
      const [enr, ev, conv] = await Promise.all([
        supabase.from("sequence_enrollments").select("status, sequences(name)").eq("contact_id", contact.id).eq("status", "active"),
        supabase
          .from("analytics_events")
          .select("created_at, flow_id")
          .eq("contact_id", contact.id)
          .eq("event_type", "flow_started")
          .order("created_at", { ascending: false })
          .limit(50),
        supabase
          .from("conversations")
          .select("id, channel_id, is_automation_paused")
          .eq("contact_id", contact.id)
          .order("last_message_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);
      // analytics_events has no join to flows: look the names up separately.
      const rows = (ev.data ?? []) as unknown as Array<{ created_at: string; flow_id: string | null }>;
      const ids = [...new Set(rows.map((r) => r.flow_id).filter(Boolean))] as string[];
      const names = new Map<string, string>();
      if (ids.length) {
        const { data: fl } = await supabase.from("flows").select("id, name").in("id", ids);
        for (const f of (fl ?? []) as Array<{ id: string; name: string }>) names.set(f.id, f.name);
      }
      const seen = new Set<string>();
      const flows: Array<{ name: string; at: string }> = [];
      for (const r of rows) {
        const n = r.flow_id ? names.get(r.flow_id) : undefined;
        if (n && !seen.has(n)) {
          seen.add(n);
          flows.push({ name: n, at: r.created_at });
        }
      }
      const c = conv.data as unknown as { id: string; channel_id: string; is_automation_paused: boolean } | null;
      setExtra({
        sequences: ((enr.data ?? []) as unknown as Array<{ sequences: { name: string } | null }>).map((e) => e.sequences?.name ?? "").filter(Boolean),
        flows,
        conversationId: c?.id ?? null,
        channelId: c?.channel_id ?? null,
        paused: !!c?.is_automation_paused,
      });
    })();
  }, [contact.id]);

  const run = (fn: () => Promise<unknown>) =>
    start(async () => {
      await fn();
      router.refresh();
    });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6" onClick={onClose}>
      <div className="relative flex max-h-[85vh] w-full max-w-3xl overflow-hidden rounded-xl bg-card shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <button type="button" onClick={onClose} className="absolute right-3 top-3 text-muted-foreground hover:text-foreground">
          <X className="h-5 w-5" />
        </button>
        {/* Left column */}
        <div className="w-64 shrink-0 space-y-3 border-r border-border p-5 text-sm">
          <div className="flex aspect-square items-center justify-center overflow-hidden rounded-lg bg-muted text-4xl font-semibold">
            {contact.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={contact.avatar_url} alt="" className="h-full w-full object-cover" />
            ) : (
              (contact.display_name?.[0] ?? "?").toUpperCase()
            )}
          </div>
          <button
            type="button"
            disabled={!extra || pending}
            onClick={() =>
              run(async () => {
                await setContactPaused(contact.id, !extra?.paused);
                setExtra((x) => (x ? { ...x, paused: !x.paused } : x));
              })
            }
            className="flex w-full items-center justify-center gap-2 rounded-md border border-border py-2 hover:bg-muted disabled:opacity-60"
          >
            {extra?.paused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
            {extra?.paused ? "Reanudar Automatizaciones" : "Pausar Automatizaciones"}
          </button>
          <p className="flex items-center gap-2">
            <CheckCircle2 className={cn("h-4 w-4", contact.is_subscribed ? "text-emerald-600" : "text-muted-foreground")} />
            {contact.is_subscribed ? "Suscrito" : "No suscrito"}
          </p>
          <p className="flex items-center gap-2 text-muted-foreground">
            <Hash className="h-4 w-4" />
            <span className="truncate">{contact.id.slice(0, 8)}</span>
          </p>
          {username && (
            <a href={`https://instagram.com/${username}`} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-blue-600">
              <AtSign className="h-4 w-4" />
              {username}
            </a>
          )}
          <p className="text-xs text-muted-foreground">Suscrito {ago(contact.created_at)}</p>
          <button
            type="button"
            disabled={!extra?.conversationId}
            onClick={() => router.push(`/dashboard/inbox?c=${extra?.conversationId}`)}
            className="flex w-full items-center justify-center gap-2 rounded-md bg-blue-600 py-2 font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            <MessageCircle className="h-4 w-4" /> Iniciar Chat
          </button>
        </div>

        {/* Right column */}
        <div className="flex-1 space-y-5 overflow-y-auto p-5 text-sm">
          <h2 className="pr-8 text-lg font-semibold">{contact.display_name ?? "Sin nombre"}</h2>

          <section>
            <div className="mb-2 flex items-center justify-between">
              <p className="font-medium">Etiquetas de contacto</p>
              <button type="button" onClick={() => setAddingTag((v) => !v)} className="text-blue-600">
                + Añadir etiqueta
              </button>
            </div>
            {addingTag && (
              <div className="mb-2 flex gap-2">
                <input
                  autoFocus
                  list="zf-tags"
                  value={newTag}
                  onChange={(e) => setNewTag(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && newTag.trim()) {
                      run(() => setContactTag(contact.id, newTag, "add"));
                      setNewTag("");
                      setAddingTag(false);
                    }
                  }}
                  placeholder="Nombre de la etiqueta"
                  className="flex-1 rounded-md border border-border bg-card px-2 py-1"
                />
                <datalist id="zf-tags">
                  {tags.map((t) => (
                    <option key={t.id} value={t.name} />
                  ))}
                </datalist>
              </div>
            )}
            <div className="flex flex-wrap gap-1.5">
              {contactTags.length === 0 && <p className="text-xs text-muted-foreground">Sin etiquetas</p>}
              {contactTags.map((t) => (
                <span key={t.id} className="flex items-center gap-1 rounded-full bg-muted px-2.5 py-0.5 text-xs">
                  {t.name}
                  <button type="button" onClick={() => run(() => setContactTag(contact.id, t.name, "remove"))} className="hover:text-red-500">
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
          </section>

          <section>
            <div className="mb-2 flex items-center justify-between">
              <p className="font-medium">Suscrito a secuencias</p>
              {sequences.length > 0 && extra?.channelId && (
                <select
                  value=""
                  onChange={(e) => {
                    const id = e.target.value;
                    const channelId = extra?.channelId;
                    if (id && channelId) run(() => enrollContact(id, contact.id, channelId));
                  }}
                  className="bg-transparent text-blue-600"
                >
                  <option value="">Suscribirse</option>
                  {sequences.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              )}
            </div>
            <p className="text-xs text-muted-foreground">{extra ? extra.sequences.join(", ") || "Ninguna" : "…"}</p>
          </section>

          <section>
            <p className="mb-2 font-medium">Automatizaciones en las que entró</p>
            {!extra ? (
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            ) : extra.flows.length === 0 ? (
              <p className="text-xs text-muted-foreground">Ninguna todavía</p>
            ) : (
              <ul className="space-y-1">
                {extra.flows.map((f) => (
                  <li key={f.name} className="flex justify-between gap-2 text-xs">
                    <span className="truncate">{f.name}</span>
                    <span className="shrink-0 text-muted-foreground">{ago(f.at)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <p className="mb-2 font-medium">Campos del sistema</p>
            <div className="space-y-2">
              {(
                [
                  ["display_name", "Nombre completo", contact.display_name ?? ""],
                  ["email", "Correo electrónico", contact.email ?? ""],
                ] as const
              ).map(([key, label, initial]) => (
                <label key={key} className="block rounded-md border border-border px-3 py-1.5">
                  <span className="block text-[11px] text-muted-foreground">{label}:</span>
                  <input
                    defaultValue={initial}
                    onChange={(e) => setValues((v) => ({ ...v, [key]: e.target.value }))}
                    onBlur={() => values[key] !== undefined && values[key] !== initial && run(() => setContactField(contact.id, key, values[key]))}
                    className="w-full bg-transparent focus:outline-none"
                  />
                </label>
              ))}
            </div>
          </section>

          <section>
            <p className="mb-2 font-medium">Campos personalizados</p>
            {fields.length === 0 ? (
              <p className="text-xs text-muted-foreground">Todavía no tienes campos personalizados.</p>
            ) : (
              <div className="space-y-2">
                {fields.map((f) => {
                  const initial = contact.contact_custom_fields.find((x) => x.field_id === f.id)?.value ?? "";
                  return (
                    <label key={f.id} className="block rounded-md border border-border px-3 py-1.5">
                      <span className="block text-[11px] text-muted-foreground">{f.name}:</span>
                      <input
                        defaultValue={initial}
                        onChange={(e) => setValues((v) => ({ ...v, [f.slug]: e.target.value }))}
                        onBlur={() =>
                          values[f.slug] !== undefined && values[f.slug] !== initial && run(() => setContactField(contact.id, f.slug, values[f.slug]))
                        }
                        placeholder="Sin valor"
                        className="w-full bg-transparent focus:outline-none"
                      />
                    </label>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

export function ContactsView({
  contacts,
  tags,
  fields,
  sequences,
}: {
  contacts: Contact[];
  tags: Tag[];
  fields: FieldDef[];
  sequences: Array<{ id: string; name: string }>;
}) {
  const router = useRouter();
  const [showFilter, setShowFilter] = useState(false);
  const [conds, setConds] = useState<Cond[]>([]);
  const [logic, setLogic] = useState<"all" | "any">("all");
  const [searching, setSearching] = useState(false);
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState<Contact | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [pending, start] = useTransition();

  const tagCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of contacts) for (const t of c.contact_tags) if (t.tags) m.set(t.tags.name, (m.get(t.tags.name) ?? 0) + 1);
    return m;
  }, [contacts]);

  const list = useMemo(
    () =>
      contacts.filter((c) => {
        if (q) {
          const s = q.toLowerCase();
          const u = c.contact_channels.find((x) => x.platform_username)?.platform_username ?? "";
          if (![c.display_name ?? "", c.email ?? "", u].some((v) => v.toLowerCase().includes(s))) return false;
        }
        if (!conds.length) return true;
        return logic === "all" ? conds.every((x) => matches(c, x, fields)) : conds.some((x) => matches(c, x, fields));
      }),
    [contacts, q, conds, logic, fields]
  );

  // Keep the open profile fresh after edits.
  useEffect(() => {
    if (open) setOpen(contacts.find((c) => c.id === open.id) ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contacts]);

  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  async function bulk(action: "addTag" | "removeTag" | "delete") {
    const ids = [...selected];
    if (!ids.length) return;
    let tagName: string | undefined;
    if (action !== "delete") {
      tagName = (await askText(action === "addTag" ? "Etiqueta a añadir" : "Etiqueta a quitar")) ?? "";
      if (!tagName.trim()) return;
    } else if (!(await askConfirm(`¿Eliminar ${ids.length} contacto(s)? No se puede deshacer.`, { destructive: true }))) return;
    setBulkOpen(false);
    start(async () => {
      await bulkContacts(ids, action, tagName);
      setSelected(new Set());
      router.refresh();
    });
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border px-8 py-4">
        <h1 className="text-2xl font-semibold">Contactos</h1>
      </div>
      <div className="flex min-h-0 flex-1">
        {/* Left column: tags with their contacts (trazabilidad) */}
        <aside className="w-60 shrink-0 overflow-y-auto border-r border-border p-5 text-sm">
          <div className="mb-2 flex items-center justify-between">
            <p className="font-semibold">Etiquetas</p>
            <span className="text-xs italic text-muted-foreground">Contactos</span>
          </div>
          {tags.length === 0 ? (
            <p className="text-xs text-muted-foreground">Las etiquetas que pongas en tus automatizaciones aparecerán aquí.</p>
          ) : (
            <ul className="space-y-0.5">
              {tags.map((t) => (
                <li key={t.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setConds([{ kind: "tag", op: "is", value: t.name }]);
                      setShowFilter(true);
                    }}
                    className="flex w-full justify-between rounded px-2 py-1 text-left hover:bg-muted"
                  >
                    <span className="truncate">{t.name}</span>
                    <span className="text-muted-foreground">{tagCounts.get(t.name) ?? 0}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>

        <main className="min-w-0 flex-1 overflow-y-auto p-6">
          <div className="mb-3 flex items-center gap-4">
            <button
              type="button"
              onClick={() => setShowFilter((v) => !v)}
              className={cn("flex items-center gap-1.5 rounded-md px-2 py-1 text-sm", showFilter ? "bg-blue-50 text-blue-700 dark:bg-blue-950/40" : "hover:bg-muted")}
            >
              <Filter className="h-4 w-4" /> Filtro
            </button>
            {searching ? (
              <div className="flex items-center gap-1.5 rounded-md border border-border px-2 py-1">
                <Search className="h-4 w-4 text-muted-foreground" />
                <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar" className="w-48 bg-transparent text-sm focus:outline-none" />
                <button type="button" onClick={() => { setQ(""); setSearching(false); }}>
                  <X className="h-3.5 w-3.5 text-muted-foreground" />
                </button>
              </div>
            ) : (
              <button type="button" onClick={() => setSearching(true)} className="flex items-center gap-1.5 rounded-md px-2 py-1 text-sm hover:bg-muted">
                <Search className="h-4 w-4" /> Buscar
              </button>
            )}
            <span className="ml-auto text-xs text-muted-foreground">
              {selected.size} seleccionado del total de {list.length}
            </span>
            <div className="relative">
              <button
                type="button"
                disabled={!selected.size || pending}
                onClick={() => setBulkOpen((v) => !v)}
                className="rounded-md border border-border px-3 py-1.5 text-xs disabled:opacity-50"
              >
                {pending ? "Aplicando…" : "Acciones Masivas"}
              </button>
              {bulkOpen && (
                <div className="absolute right-0 top-9 z-30 w-48 rounded-md border border-border bg-card p-1 text-sm shadow-lg">
                  <button type="button" onClick={() => bulk("addTag")} className="block w-full rounded px-2 py-1.5 text-left hover:bg-muted">
                    Añadir etiqueta
                  </button>
                  <button type="button" onClick={() => bulk("removeTag")} className="block w-full rounded px-2 py-1.5 text-left hover:bg-muted">
                    Eliminar etiqueta
                  </button>
                  <button type="button" onClick={() => bulk("delete")} className="block w-full rounded px-2 py-1.5 text-left text-red-600 hover:bg-muted">
                    Eliminar contactos
                  </button>
                </div>
              )}
            </div>
          </div>

          {showFilter && (
            <div className="mb-3 space-y-2">
              {conds.length > 0 && (
                <p className="text-sm">
                  Solo contactos que coinciden{" "}
                  <select value={logic} onChange={(e) => setLogic(e.target.value as "all" | "any")} className="bg-transparent text-blue-600 underline">
                    <option value="all">todas las siguientes condiciones</option>
                    <option value="any">cualquiera de las siguientes condiciones</option>
                  </select>
                </p>
              )}
              <div className="flex flex-wrap items-center gap-2">
                {conds.map((c, i) => (
                  <span key={i} className="flex items-center gap-1 rounded-md border border-border bg-muted/60 px-2 py-1 text-xs">
                    {condLabel(c, fields)}
                    <button type="button" onClick={() => setConds((x) => x.filter((_, j) => j !== i))}>
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
                <ConditionPicker tags={tags} fields={fields} onAdd={(c) => setConds((x) => [...x, c])} />
              </div>
            </div>
          )}

          <div className="overflow-hidden rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="w-10 px-3 py-2.5">
                    <input
                      type="checkbox"
                      checked={list.length > 0 && list.every((c) => selected.has(c.id))}
                      onChange={(e) => setSelected(e.target.checked ? new Set(list.map((c) => c.id)) : new Set())}
                    />
                  </th>
                  <th className="px-3 py-2.5 font-medium">Avatar</th>
                  <th className="px-3 py-2.5 font-medium">Nombre</th>
                  <th className="px-3 py-2.5 font-medium">Etiquetas</th>
                  <th className="px-3 py-2.5 font-medium">Estado</th>
                  <th className="px-3 py-2.5 font-medium">Suscrito</th>
                </tr>
              </thead>
              <tbody>
                {list.map((c) => {
                  const ctags = c.contact_tags.map((t) => t.tags).filter(Boolean) as Tag[];
                  return (
                    <tr key={c.id} onClick={() => setOpen(c)} className="cursor-pointer border-b border-border last:border-0 hover:bg-muted/50">
                      <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                        <input type="checkbox" checked={selected.has(c.id)} onChange={() => toggle(c.id)} />
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-full bg-muted text-xs font-medium">
                          {c.avatar_url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={c.avatar_url} alt="" className="h-full w-full object-cover" />
                          ) : (
                            (c.display_name?.[0] ?? "?").toUpperCase()
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-2 font-medium">{c.display_name ?? "Sin nombre"}</td>
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap gap-1">
                          {ctags.slice(0, 3).map((t) => (
                            <span key={t.id} className="rounded-full bg-muted px-2 py-0.5 text-[11px]">
                              {t.name}
                            </span>
                          ))}
                          {ctags.length > 3 && <span className="text-[11px] text-muted-foreground">+{ctags.length - 3}</span>}
                        </div>
                      </td>
                      <td className="px-3 py-2">{c.is_subscribed ? "Suscrito" : "No suscrito"}</td>
                      <td className="px-3 py-2 text-muted-foreground">{ago(c.created_at)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {list.length === 0 && (
              <div className="flex flex-col items-center gap-2 py-16 text-sm text-muted-foreground">
                <Users className="h-8 w-8 opacity-40" />
                {contacts.length === 0
                  ? "Los contactos se crean solos cuando alguien te escribe o comenta."
                  : "Ningún contacto coincide con el filtro."}
              </div>
            )}
          </div>
        </main>
      </div>

      {open && <ContactProfile contact={open} tags={tags} fields={fields} sequences={sequences} onClose={() => setOpen(null)} />}
    </div>
  );
}
