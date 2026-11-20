"use client";

import { useEffect, useState } from "react";
import { ChevronDown, ChevronRight, Loader2, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { bulkContacts } from "@/lib/actions/contacts";
import { useFlowStats } from "./flow-stats-context";
import { cn } from "@/lib/utils";

/* ManyChat's metrics while viewing a published automation:
 * - "Métricas clave" (nothing selected): Envíos, Contactos únicos, Correos
 *   electrónicos, Teléfonos, filterable by trigger.
 * - A step selected: how many people reached it and the Enviado / Entregado /
 *   Abierto / Clics table (Total and Único). */

const TRIGGER_LABEL: Record<string, string> = {
  comment_keyword: "El usuario comenta en tu Publicación o Reel",
  keyword: "El usuario envía un mensaje directo",
  welcome: "El usuario te escribe por primera vez",
  story_reply: "El usuario responde a tu Historia",
  story_mention: "El usuario te menciona en una Historia",
  ref_url: "El usuario hace clic en un enlace de referencia",
};

interface FlowContact {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  email: string | null;
  phone: boolean;
}

function ContactsModal({ title, contacts, onClose }: { title: string; contacts: FlowContact[]; onClose: () => void }) {
  const [tag, setTag] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center bg-black/40 pt-16" onClick={onClose}>
      <div className="w-full max-w-md rounded-xl border border-border bg-card shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 border-b border-border px-4 py-3">
          <p className="font-semibold">{title}</p>
          <input
            value={tag}
            onChange={(e) => setTag(e.target.value)}
            onKeyDown={async (e) => {
              if (e.key !== "Enter" || !tag.trim() || !contacts.length) return;
              setBusy(true);
              await bulkContacts(
                contacts.map((c) => c.id),
                "addTag",
                tag.trim()
              );
              setBusy(false);
              setDone(`Etiqueta "${tag.trim()}" añadida a ${contacts.length} contacto(s)`);
              setTag("");
            }}
            placeholder="Etiqueta estos contactos"
            className="min-w-0 flex-1 rounded-md border border-border bg-background px-2 py-1 text-sm"
          />
          {busy && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
          <button onClick={onClose} aria-label="Cerrar" className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>
        {done && <p className="border-b border-border bg-emerald-50 px-4 py-2 text-xs text-emerald-700 dark:bg-emerald-950/40">{done}</p>}
        <div className="max-h-[60vh] overflow-y-auto p-2">
          {contacts.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Ningún contacto encontrado</p>
          ) : (
            contacts.map((c) => (
              <div key={c.id} className="flex items-center gap-3 rounded-md px-2 py-1.5 hover:bg-muted">
                {c.avatar_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={c.avatar_url} alt="" className="h-7 w-7 rounded-full object-cover" />
                ) : (
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-muted text-xs">
                    {c.display_name?.[0]?.toUpperCase() ?? "?"}
                  </span>
                )}
                <span className="truncate text-sm">{c.display_name ?? "Sin nombre"}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function Tile({ label, value, suffix, onClick }: { label: string; value: number | string; suffix?: string; onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className="flex min-h-[84px] flex-col justify-between rounded-lg border border-border bg-card p-3 text-left enabled:hover:bg-muted"
    >
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="flex items-end justify-between">
        <span>
          <span className="text-xl font-semibold">{value}</span>
          {suffix && <span className="ml-1 text-xs text-muted-foreground">{suffix}</span>}
        </span>
        {onClick && <ChevronRight className="h-4 w-4 text-muted-foreground" />}
      </span>
    </button>
  );
}

export function KeyMetricsPanel({ flowId }: { flowId: string }) {
  const stats = useFlowStats();
  const [triggers, setTriggers] = useState<Array<{ id: string; label: string }>>([]);
  const [trigger, setTrigger] = useState<string>("");
  const [menu, setMenu] = useState(false);
  const [contacts, setContacts] = useState<FlowContact[] | null>(null);
  const [modal, setModal] = useState(false);

  useEffect(() => {
    createClient()
      .from("triggers")
      .select("id, type, config")
      .eq("flow_id", flowId)
      .then(({ data }) => {
        const rows = ((data ?? []) as Array<{ id: string; type: string; config: { event?: string } | null }>).filter(
          (t) => t.type !== "postback" && t.type !== "quick_reply"
        );
        setTriggers(rows.map((t) => ({ id: t.id, label: TRIGGER_LABEL[t.config?.event ?? ""] ?? TRIGGER_LABEL[t.type] ?? t.type })));
      });
  }, [flowId]);

  useEffect(() => {
    setContacts(null);
    fetch(`/api/v1/flows/${flowId}/contacts${trigger ? `?trigger=${trigger}` : ""}`)
      .then((r) => (r.ok ? r.json() : { contacts: [] }))
      .then((d) => setContacts(d.contacts ?? []))
      .catch(() => setContacts([]));
  }, [flowId, trigger]);

  const t = trigger ? stats?.triggers?.[trigger] : null;
  const runs = trigger ? t?.runs ?? 0 : stats?.runs ?? 0;
  const unique = trigger ? t?.unique ?? 0 : stats?.unique ?? 0;

  return (
    <div className="w-80 shrink-0 space-y-4 overflow-y-auto border-r border-border bg-background p-5">
      <h2 className="text-lg font-semibold">Métricas clave</h2>
      <div className="relative">
        <button
          onClick={() => setMenu((m) => !m)}
          className="flex max-w-full items-center gap-1 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted"
        >
          <span className="truncate">{trigger ? triggers.find((x) => x.id === trigger)?.label : "Todos los disparadores"}</span>
          <ChevronDown className="h-4 w-4 shrink-0" />
        </button>
        {menu && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setMenu(false)} />
            <div className="absolute left-0 top-10 z-50 w-72 rounded-lg border border-border bg-card p-1 text-sm shadow-lg">
              {[{ id: "", label: "Todos los disparadores" }, ...triggers].map((x) => (
                <button
                  key={x.id || "all"}
                  onClick={() => {
                    setTrigger(x.id);
                    setMenu(false);
                  }}
                  className={cn("flex w-full rounded-md px-2 py-1.5 text-left hover:bg-muted", trigger === x.id && "bg-muted")}
                >
                  {x.label}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Tile label="Envíos" value={runs} suffix="veces" onClick={() => setModal(true)} />
        <Tile label="Contactos únicos" value={unique} onClick={() => setModal(true)} />
        <Tile label="Correos electrónicos" value={contacts ? contacts.filter((c) => c.email).length : "…"} />
        <Tile label="Teléfonos" value={contacts ? contacts.filter((c) => c.phone).length : "…"} />
      </div>
      {modal && <ContactsModal title="Contactos" contacts={contacts ?? []} onClose={() => setModal(false)} />}
    </div>
  );
}

export function StepMetricsPanel({
  nodeId,
  title,
  isMessage,
  onClose,
}: {
  nodeId: string;
  title: string;
  isMessage: boolean;
  onClose: () => void;
}) {
  const stats = useFlowStats();
  const s = stats?.nodes[nodeId];
  const starters = stats?.unique ?? 0;
  const reached = isMessage ? s?.sent ?? 0 : s?.reached ?? 0;
  const pct = (n: number, d: number) => (d > 0 ? `${Math.round((n / d) * 100)}%` : "0%");
  const rows: Array<[string, number, number]> = [
    ["Enviado", s?.sentTotal ?? 0, s?.sent ?? 0],
    ["Entregado", s?.deliveredTotal ?? 0, s?.delivered ?? 0],
    ["Abierto", s?.readTotal ?? 0, s?.read ?? 0],
    ["Clics", s?.clickedTotal ?? 0, s?.clicked ?? 0],
  ];
  return (
    <div className="w-80 shrink-0 overflow-y-auto border-r border-border bg-background">
      <div className="relative bg-fuchsia-100 px-5 py-4 text-center dark:bg-fuchsia-950/40">
        <p className="truncate pr-6 font-semibold">{title}</p>
        <button onClick={onClose} aria-label="Cerrar" className="absolute right-3 top-4 text-muted-foreground hover:text-foreground">
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="space-y-4 p-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-lg font-semibold">{reached === 0 ? "Ningún contacto" : `${reached} contacto${reached === 1 ? "" : "s"}`}</p>
            <p className="text-xs text-muted-foreground">alcanzaron este paso</p>
          </div>
          <p className="text-lg font-semibold text-emerald-600">{pct(reached, starters)}</p>
        </div>
        {isMessage && (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-muted-foreground">
                <th className="py-1 text-left font-normal">Evento</th>
                <th className="py-1 text-right font-normal">Total</th>
                <th className="py-1 text-right font-normal">Único</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(([name, total, unique], i) => (
                <tr key={name} className="border-t border-border">
                  <td className="py-2">{name}</td>
                  <td className="py-2 text-right">
                    {total}
                    {i > 0 && <span className="block text-[11px] text-emerald-600">{pct(total, s?.sentTotal ?? 0)}</span>}
                  </td>
                  <td className="py-2 text-right">
                    {unique}
                    {i > 0 && <span className="block text-[11px] text-emerald-600">{pct(unique, s?.sent ?? 0)}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
