"use client";

/**
 * In-app replacements for window.prompt / window.confirm / window.alert.
 * The native ones are blocked in some browsers (e.g. embedded app browsers),
 * where they silently return null and the action never happens.
 * Mount <DialogHost /> once; then `await askText(...)` / `await askConfirm(...)`.
 */

import { useEffect, useRef, useState } from "react";

type Request =
  | { kind: "text"; title: string; value: string; resolve: (v: string | null) => void }
  | { kind: "confirm"; title: string; destructive?: boolean; resolve: (v: boolean) => void }
  | { kind: "alert"; title: string; resolve: () => void };

let push: ((r: Request) => void) | null = null;
const queue: Request[] = [];

function enqueue(r: Request) {
  if (push) push(r);
  else queue.push(r);
}

export function askText(title: string, value = ""): Promise<string | null> {
  return new Promise((resolve) => enqueue({ kind: "text", title, value, resolve }));
}

export function askConfirm(title: string, opts?: { destructive?: boolean }): Promise<boolean> {
  return new Promise((resolve) => enqueue({ kind: "confirm", title, destructive: opts?.destructive, resolve }));
}

export function showAlert(title: string): Promise<void> {
  return new Promise((resolve) => enqueue({ kind: "alert", title, resolve }));
}

export function DialogHost() {
  const [items, setItems] = useState<Request[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const okRef = useRef<HTMLButtonElement>(null);
  const current = items[0];

  useEffect(() => {
    push = (r) => setItems((xs) => [...xs, r]);
    if (queue.length) setItems((xs) => [...xs, ...queue.splice(0)]);
    // Route native alert() through the in-app dialog too.
    const nativeAlert = window.alert;
    window.alert = (msg?: unknown) => void showAlert(String(msg ?? ""));
    return () => {
      push = null;
      window.alert = nativeAlert;
    };
  }, []);

  useEffect(() => {
    if (!current) return;
    if (current.kind === "text") {
      setTimeout(() => inputRef.current?.select(), 0);
    } else {
      setTimeout(() => okRef.current?.focus(), 0);
    }
  }, [current]);

  if (!current) return null;

  function close(ok: boolean) {
    const r = current!;
    if (r.kind === "text") r.resolve(ok ? (inputRef.current?.value ?? "") : null);
    else if (r.kind === "confirm") r.resolve(ok);
    else r.resolve();
    setItems((xs) => xs.slice(1));
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center"
      onKeyDown={(e) => {
        if (e.key === "Escape") close(false);
      }}
    >
      <div className="fixed inset-0 bg-black/50" onClick={() => close(false)} />
      <form
        className="relative z-10 w-full max-w-sm rounded-xl border border-border bg-card p-6 shadow-lg"
        onSubmit={(e) => {
          e.preventDefault();
          close(true);
        }}
      >
        <h3 className="whitespace-pre-line text-sm font-semibold text-foreground">{current.title}</h3>
        {current.kind === "text" && (
          <input
            ref={inputRef}
            key={items.length + current.title}
            defaultValue={current.value}
            className="mt-3 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-blue-500"
          />
        )}
        <div className="mt-4 flex justify-end gap-2">
          {current.kind !== "alert" && (
            <button
              type="button"
              onClick={() => close(false)}
              className="rounded-lg border border-border px-3 py-1.5 text-sm font-medium hover:bg-accent"
            >
              Cancelar
            </button>
          )}
          <button
            ref={okRef}
            type="submit"
            className={`rounded-lg px-3 py-1.5 text-sm font-medium text-white ${
              current.kind === "confirm" && current.destructive ? "bg-red-600 hover:bg-red-700" : "bg-blue-600 hover:bg-blue-700"
            }`}
          >
            {current.kind === "text" ? "Guardar" : "Aceptar"}
          </button>
        </div>
      </form>
    </div>
  );
}
