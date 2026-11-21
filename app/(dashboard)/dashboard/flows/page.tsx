import { getWorkspace } from "@/lib/workspace";
import Link from "next/link";
import { ChevronRight, Folder, GitBranch, Plug, Search, Sparkles, Trash2 } from "lucide-react";
import { CreateFlowButton } from "@/components/create-flow-button";
import { ImportFlowButton } from "@/components/flow-actions";
import { AutomationSubnav } from "@/components/automation/automation-subnav";
import {
  AutomationRowMenu,
  FolderRowMenu,
  NewFolderButton,
  TrashRowActions,
} from "@/components/automation/automation-list";
import type { Json } from "@/lib/types/database";
import { computeFlowStats } from "@/lib/automation-stats";
import { liveFlowIds } from "@/lib/flow-live-status";

const statusBadge: Record<string, { label: string; classes: string }> = {
  published: { label: "ACTIVO", classes: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400" },
  draft: { label: "BORRADOR", classes: "bg-muted text-muted-foreground" },
  stopped: { label: "DETENIDA", classes: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300" },
  archived: { label: "EN PAPELERA", classes: "bg-muted text-muted-foreground" },
};

function timeAgo(dateString: string) {
  const diff = Date.now() - new Date(dateString).getTime();
  const min = Math.round(diff / 60000);
  if (min < 1) return "hace un momento";
  if (min < 60) return `hace ${min} ${min === 1 ? "minuto" : "minutos"}`;
  const h = Math.round(min / 60);
  if (h < 24) return `hace ${h} ${h === 1 ? "hora" : "horas"}`;
  const d = Math.round(h / 24);
  if (d < 30) return `hace ${d} ${d === 1 ? "día" : "días"}`;
  return new Date(dateString).toLocaleDateString("es", { day: "numeric", month: "short", year: "numeric" });
}

interface FlowRow {
  id: string;
  name: string;
  description: string | null;
  status: string;
  updated_at: string;
  version: number;
  nodes: Json;
  edges: Json;
  folder_id?: string | null;
}

export default async function FlowsPage({
  searchParams,
}: {
  searchParams: Promise<{ folder?: string; view?: string; q?: string }>;
}) {
  const { folder: folderId, view, q } = await searchParams;
  const inTrash = view === "trash";
  const { workspace, supabase } = await getWorkspace();

  const [{ data: rawFlows }, { count: channelCount }, foldersRes] = await Promise.all([
    supabase.from("flows").select("*").eq("workspace_id", workspace.id).order("updated_at", { ascending: false }),
    supabase
      .from("channels")
      .select("*", { count: "exact", head: true })
      .eq("workspace_id", workspace.id)
      .eq("is_active", true),
    supabase.from("automation_folders").select("id, name").eq("workspace_id", workspace.id).order("name"),
  ]);

  // Folders need migration 00018; without it the list simply has no folders.
  const foldersEnabled = !foldersRes.error;
  const folders = foldersRes.data ?? [];
  const currentFolder = folderId ? folders.find((f) => f.id === folderId) : undefined;
  const all = (rawFlows ?? []) as unknown as FlowRow[];
  const query = (q ?? "").trim().toLowerCase();

  const flows = all.filter((f) => {
    if (inTrash) return f.status === "archived";
    if (f.status === "archived") return false;
    if (query) return f.name.toLowerCase().includes(query);
    return (f.folder_id ?? null) === (currentFolder?.id ?? null);
  });
  const trashCount = all.filter((f) => f.status === "archived").length;
  const live = await liveFlowIds(supabase, flows.filter((f) => f.status === "published").map((f) => f.id));

  // "Ejecuciones" and "CTR" per automation (same definitions as the builder and Analytics).
  const stats = new Map<string, { runs: number; ctr: number | null }>();
  if (!inTrash) {
    await Promise.all(
      flows.map(async (f) => {
        const st = await computeFlowStats(supabase, f.id, undefined, { light: true });
        stats.set(f.id, { runs: st.runs, ctr: st.ctr });
      }),
    );
  }

  const showFolders = !inTrash && !currentFolder && !query;
  const title = inTrash ? "Papelera" : currentFolder ? currentFolder.name : "Mis automatizaciones";

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-border px-8 py-6">
        <h1 className="text-2xl font-bold">Automatización</h1>
      </div>

      <div className="flex min-h-0 flex-1">
        <AutomationSubnav active="flows" />
        <div className="flex-1 overflow-auto px-8 py-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="flex items-center gap-2 text-xl font-bold">
              {(currentFolder || inTrash) && (
                <>
                  <Link href="/dashboard/flows" className="font-normal text-muted-foreground hover:text-foreground">
                    Mis automatizaciones
                  </Link>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </>
              )}
              {title}
            </h2>
            {!inTrash && (
              <div className="flex items-center gap-2">
                <ImportFlowButton />
                <Link
                  href="/dashboard/flows/templates"
                  className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
                >
                  <Sparkles className="h-4 w-4" /> Plantillas
                </Link>
                <CreateFlowButton />
              </div>
            )}
          </div>

          {!inTrash && (
            <div className="mt-5 flex flex-wrap items-start justify-between gap-3">
              <div className="space-y-3">
                <form action="/dashboard/flows" className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <input
                    name="q"
                    defaultValue={q ?? ""}
                    placeholder="Buscar todas las automatizaciones"
                    className="w-60 rounded-lg border border-border bg-card py-2 pl-9 pr-3 text-sm focus:border-blue-500 focus:outline-none"
                  />
                </form>
                {showFolders && <NewFolderButton disabled={!foldersEnabled} />}
              </div>
              <Link
                href="/dashboard/flows?view=trash"
                className="inline-flex items-center gap-1.5 text-sm font-medium text-blue-600 hover:underline"
              >
                <Trash2 className="h-4 w-4" /> Papelera{trashCount > 0 ? ` (${trashCount})` : ""}
              </Link>
            </div>
          )}

          {(channelCount ?? 0) === 0 && !inTrash && (
            <div className="mt-6 flex items-center gap-4 rounded-xl border border-dashed border-border bg-card p-5">
              <Plug className="h-5 w-5 text-primary" />
              <p className="flex-1 text-sm">Conecta un canal para que tus automatizaciones puedan enviar y recibir mensajes.</p>
              <Link
                href="/dashboard/channels"
                className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
              >
                Conectar
              </Link>
            </div>
          )}

          <div className="mt-6 rounded-xl border border-border bg-card pb-1">
            <div className="grid grid-cols-[1fr_110px_80px_150px_48px] items-center gap-2 border-b border-border px-4 py-2.5 text-xs font-medium text-muted-foreground">
              <span>Nombre</span>
              <span className="text-right">{inTrash ? "" : "Ejecuciones"}</span>
              <span className="text-right">{inTrash ? "" : "CTR"}</span>
              <span>Modificado</span>
              <span />
            </div>

            {showFolders &&
              folders.map((f) => (
                <Link
                  key={f.id}
                  href={`/dashboard/flows?folder=${f.id}`}
                  className="grid grid-cols-[1fr_110px_80px_150px_48px] items-center gap-2 border-b border-border px-4 py-3 hover:bg-muted/40"
                >
                  <span className="flex items-center gap-2 text-sm font-medium">
                    <Folder className="h-4 w-4 text-muted-foreground" /> {f.name}
                    <span className="text-xs font-normal text-muted-foreground">
                      ({all.filter((x) => x.folder_id === f.id && x.status !== "archived").length})
                    </span>
                  </span>
                  <span />
                  <span />
                  <span />
                  <FolderRowMenu folder={f} />
                </Link>
              ))}

            {flows.map((flow) => {
              const badge =
                flow.status === "published" && !live.has(flow.id)
                  ? statusBadge.stopped
                  : statusBadge[flow.status] ?? statusBadge.draft;
              const s = stats.get(flow.id);
              const ctr = s && s.ctr !== null ? `${s.ctr}%` : "n/a";
              const row = (
                <>
                  <span className="flex min-w-0 items-center gap-2">
                    <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold ${badge.classes}`}>
                      {badge.label}
                    </span>
                    <span className="truncate text-sm font-medium">{flow.name}</span>
                  </span>
                  <span className="text-right text-sm tabular-nums">{inTrash ? "" : (s?.runs ?? 0)}</span>
                  <span className="text-right text-sm tabular-nums">{inTrash ? "" : ctr}</span>
                  <span className="text-sm text-muted-foreground">{timeAgo(flow.updated_at)}</span>
                </>
              );
              return inTrash ? (
                <div
                  key={flow.id}
                  className="grid grid-cols-[1fr_110px_80px_150px_48px] items-center gap-2 border-b border-border px-4 py-3 last:border-b-0"
                >
                  {row}
                  <span />
                  <div className="col-span-5 -mt-1 flex justify-end">
                    <TrashRowActions flow={flow} />
                  </div>
                </div>
              ) : (
                <Link
                  key={flow.id}
                  href={`/dashboard/flows/${flow.id}`}
                  className="grid grid-cols-[1fr_110px_80px_150px_48px] items-center gap-2 border-b border-border px-4 py-3 last:border-b-0 hover:bg-muted/40"
                >
                  {row}
                  <AutomationRowMenu flow={flow} folders={folders} />
                </Link>
              );
            })}

            {flows.length === 0 && !(showFolders && folders.length > 0) && (
              <div className="p-12 text-center">
                <GitBranch className="mx-auto h-8 w-8 text-muted-foreground" />
                <p className="mt-3 text-sm text-muted-foreground">
                  {inTrash
                    ? "La papelera está vacía."
                    : query
                      ? "No hay automatizaciones con ese nombre."
                      : "Todavía no hay automatizaciones aquí."}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
