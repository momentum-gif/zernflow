"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Copy,
  Download,
  Folder,
  FolderInput,
  FolderPlus,
  Loader2,
  MoreHorizontal,
  Pencil,
  RotateCcw,
  Trash2,
} from "lucide-react";
import { ConfirmDialog } from "@/components/confirm-dialog";
import type { Json } from "@/lib/types/database";

const itemClass = "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted";

function useAction() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function run(url: string, init: RequestInit, errMsg: string): Promise<unknown | null> {
    setBusy(true);
    try {
      const res = await fetch(url, init);
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        alert((body as { error?: string } | null)?.error || errMsg);
        return null;
      }
      router.refresh();
      return body;
    } catch {
      alert(errMsg);
      return null;
    } finally {
      setBusy(false);
    }
  }
  return { busy, run };
}

function Menu({
  busy,
  label,
  children,
}: {
  busy: boolean;
  label: string;
  children: (close: () => void) => React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <span
      className="relative"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
    >
      <button
        onClick={() => setOpen((o) => !o)}
        disabled={busy}
        className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted disabled:opacity-50"
        aria-label={label}
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <MoreHorizontal className="h-4 w-4" />}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-9 z-50 w-48 rounded-lg border border-border bg-card p-1 shadow-lg">
            {children(() => setOpen(false))}
          </div>
        </>
      )}
    </span>
  );
}

const json = (body: unknown): RequestInit => ({
  method: "PUT",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

/* --------------------------- automation row menu -------------------------- */

export function AutomationRowMenu({
  flow,
  folders,
}: {
  flow: {
    id: string;
    name: string;
    nodes: Json;
    edges: Json;
    description?: string | null;
    version?: number;
    folder_id?: string | null;
  };
  folders: Array<{ id: string; name: string }>;
}) {
  const { busy, run } = useAction();
  const [moving, setMoving] = useState(false);

  function rename(close: () => void) {
    close();
    const name = window.prompt("Nuevo nombre", flow.name);
    if (!name?.trim() || name.trim() === flow.name) return;
    run(`/api/v1/flows/${flow.id}`, json({ name: name.trim() }), "No se pudo renombrar.");
  }

  async function duplicate(close: () => void) {
    close();
    const created = (await run(
      "/api/v1/flows",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: `${flow.name} (copia)`,
          description: flow.description ?? null,
          nodes: flow.nodes,
          edges: flow.edges,
        }),
      },
      "No se pudo duplicar.",
    )) as { id?: string } | null;
    // ManyChat keeps the copy in the same folder.
    if (created?.id && flow.folder_id) {
      await run(`/api/v1/flows/${created.id}`, json({ folder_id: flow.folder_id }), "No se pudo mover la copia.");
    }
  }

  function exportFlow(close: () => void) {
    close();
    const blob = new Blob(
      [
        JSON.stringify(
          {
            name: flow.name,
            description: flow.description || null,
            nodes: flow.nodes,
            edges: flow.edges,
            version: flow.version || 1,
            exportedAt: new Date().toISOString(),
            source: "zernflow",
          },
          null,
          2,
        ),
      ],
      { type: "application/json" },
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${flow.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.flow.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <Menu busy={busy} label={`Acciones de ${flow.name}`}>
      {(close) =>
        moving ? (
          <>
            <p className="px-2 py-1 text-xs font-semibold text-muted-foreground">Mover a</p>
            <button
              className={itemClass}
              onClick={() => {
                close();
                setMoving(false);
                run(`/api/v1/flows/${flow.id}`, json({ folder_id: null }), "No se pudo mover.");
              }}
            >
              <Folder className="h-3.5 w-3.5" /> Mis automatizaciones
            </button>
            {folders.map((f) => (
              <button
                key={f.id}
                className={itemClass}
                disabled={f.id === flow.folder_id}
                onClick={() => {
                  close();
                  setMoving(false);
                  run(`/api/v1/flows/${flow.id}`, json({ folder_id: f.id }), "No se pudo mover.");
                }}
              >
                <Folder className="h-3.5 w-3.5" /> {f.name}
              </button>
            ))}
          </>
        ) : (
          <>
            <button className={itemClass} onClick={() => rename(close)}>
              <Pencil className="h-3.5 w-3.5" /> Renombrar
            </button>
            <button className={itemClass} onClick={() => duplicate(close)}>
              <Copy className="h-3.5 w-3.5" /> Duplicar
            </button>
            <button className={itemClass} onClick={() => setMoving(true)}>
              <FolderInput className="h-3.5 w-3.5" /> Mover a
            </button>
            <button className={itemClass} onClick={() => exportFlow(close)}>
              <Download className="h-3.5 w-3.5" /> Exportar
            </button>
            <button
              className={`${itemClass} text-red-600`}
              onClick={() => {
                close();
                run(`/api/v1/flows/${flow.id}`, json({ status: "archived" }), "No se pudo eliminar.");
              }}
            >
              <Trash2 className="h-3.5 w-3.5" /> Eliminar
            </button>
          </>
        )
      }
    </Menu>
  );
}

/* ------------------------------ trash actions ----------------------------- */

export function TrashRowActions({ flow }: { flow: { id: string; name: string } }) {
  const { busy, run } = useAction();
  const [confirm, setConfirm] = useState(false);
  return (
    <span className="flex items-center gap-1" onClick={(e) => e.preventDefault()}>
      <button
        disabled={busy}
        onClick={() => run(`/api/v1/flows/${flow.id}`, json({ status: "draft" }), "No se pudo restaurar.")}
        className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1 text-xs font-medium hover:bg-muted"
      >
        <RotateCcw className="h-3 w-3" /> Restaurar
      </button>
      <button
        disabled={busy}
        onClick={() => setConfirm(true)}
        className="inline-flex items-center gap-1 rounded-md border border-red-200 px-2.5 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
      >
        <Trash2 className="h-3 w-3" /> Eliminar definitivamente
      </button>
      <ConfirmDialog
        open={confirm}
        title="Eliminar definitivamente"
        message={`"${flow.name}", sus disparadores, versiones e historial se borrarán para siempre. No se puede deshacer.`}
        confirmLabel="Eliminar"
        destructive
        onConfirm={() => {
          setConfirm(false);
          run(`/api/v1/flows/${flow.id}`, { method: "DELETE" }, "No se pudo eliminar.");
        }}
        onCancel={() => setConfirm(false)}
      />
    </span>
  );
}

/* --------------------------------- folders -------------------------------- */

export function NewFolderButton({ disabled }: { disabled?: boolean }) {
  const { busy, run } = useAction();
  return (
    <button
      disabled={busy || disabled}
      title={disabled ? "Falta activar las carpetas en Supabase" : undefined}
      onClick={() => {
        const name = window.prompt("Nombre de la carpeta");
        if (!name?.trim()) return;
        run(
          "/api/v1/automation-folders",
          { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) },
          "No se pudo crear la carpeta.",
        );
      }}
      className="inline-flex w-60 items-center justify-center gap-2 rounded-lg border border-dashed border-blue-400 px-4 py-2 text-sm font-medium text-blue-600 hover:bg-blue-50 disabled:opacity-50"
    >
      <FolderPlus className="h-4 w-4" /> Nueva carpeta
    </button>
  );
}

export function FolderRowMenu({ folder }: { folder: { id: string; name: string } }) {
  const { busy, run } = useAction();
  return (
    <Menu busy={busy} label={`Acciones de ${folder.name}`}>
      {(close) => (
        <>
          <button
            className={itemClass}
            onClick={() => {
              close();
              const name = window.prompt("Nuevo nombre", folder.name);
              if (!name?.trim()) return;
              run(
                `/api/v1/automation-folders/${folder.id}`,
                { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) },
                "No se pudo renombrar.",
              );
            }}
          >
            <Pencil className="h-3.5 w-3.5" /> Renombrar
          </button>
          <button
            className={`${itemClass} text-red-600`}
            onClick={() => {
              close();
              if (!window.confirm(`¿Eliminar la carpeta "${folder.name}"? Sus automatizaciones vuelven a Mis automatizaciones.`)) return;
              run(`/api/v1/automation-folders/${folder.id}`, { method: "DELETE" }, "No se pudo eliminar.");
            }}
          >
            <Trash2 className="h-3.5 w-3.5" /> Eliminar carpeta
          </button>
        </>
      )}
    </Menu>
  );
}
