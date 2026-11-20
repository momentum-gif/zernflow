"use client";

import { useRef, useState } from "react";
import { Volume2, Image as ImageIcon, FileText, Video, Loader2, X } from "lucide-react";
import { cn } from "@/lib/utils";

type Kind = "audio" | "image" | "video" | "file";

const SPEC: Record<Kind, { word: string; accept: string; formats: string; maxMb: number; Icon: typeof Volume2 }> = {
  audio: { word: "audio", accept: ".m4a,.wav,.aac,audio/mp4,audio/x-m4a,audio/wav,audio/x-wav,audio/aac", formats: "m4a, x-m4a, wav, x-wav, aac - 25 MB max", maxMb: 25, Icon: Volume2 },
  image: { word: "imagen", accept: "image/png,image/jpeg,image/gif", formats: "png, jpeg, gif - 8 MB max", maxMb: 8, Icon: ImageIcon },
  video: { word: "video", accept: "video/mp4,video/quicktime,video/webm", formats: "mp4, mov, webm - 25 MB max", maxMb: 25, Icon: Video },
  file: { word: "PDF", accept: "application/pdf", formats: "pdf - 25 MB max", maxMb: 25, Icon: FileText },
};

export async function uploadFile(file: File): Promise<string> {
  const type = file.type || "application/octet-stream";
  // Direct upload to storage (no size limit from our server)…
  try {
    const res = await fetch("/api/v1/media/presign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filename: file.name, contentType: type, size: file.size }),
    });
    const body = await res.json();
    if (!res.ok) throw new Error(body.error || "presign");
    const put = await fetch(body.uploadUrl, { method: "PUT", headers: { "Content-Type": type }, body: file });
    if (!put.ok) throw new Error("put");
    return body.publicUrl as string;
  } catch {
    // …or through our server when the browser can't reach storage directly.
    const form = new FormData();
    form.append("file", file);
    const res = await fetch("/api/v1/media/upload", { method: "POST", body: form });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || !body.publicUrl) throw new Error(body.error || "No se pudo subir el archivo");
    return body.publicUrl as string;
  }
}

/** ManyChat's "Cargar o arrastra audio" box. */
export function MediaUpload({ kind, url, onChange }: { kind: Kind; url?: string; onChange: (url: string) => void }) {
  const spec = SPEC[kind];
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [drag, setDrag] = useState(false);

  async function handle(file?: File | null) {
    if (!file) return;
    if (file.size > spec.maxMb * 1024 * 1024) {
      setError(`El archivo pesa más de ${spec.maxMb} MB`);
      return;
    }
    setError(null);
    setBusy(true);
    try {
      onChange(await uploadFile(file));
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo subir el archivo");
    } finally {
      setBusy(false);
    }
  }

  if (url) {
    return (
      <div className="relative rounded-lg border border-border p-3">
        <button
          type="button"
          onClick={() => onChange("")}
          className="absolute right-1.5 top-1.5 rounded p-0.5 text-muted-foreground hover:text-red-500"
          aria-label="Quitar archivo"
        >
          <X className="h-3.5 w-3.5" />
        </button>
        {kind === "audio" ? (
          <audio controls src={url} className="w-full" />
        ) : kind === "image" ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt="" className="max-h-48 w-full rounded object-contain" />
        ) : kind === "video" ? (
          <video controls src={url} className="max-h-48 w-full rounded" />
        ) : (
          <a href={url} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-sm text-blue-600">
            <FileText className="h-4 w-4" /> Ver PDF
          </a>
        )}
      </div>
    );
  }

  return (
    <div>
      <div
        onClick={() => !busy && input.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          handle(e.dataTransfer.files?.[0]);
        }}
        className={cn(
          "flex cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border border-dashed px-3 py-5 text-center",
          drag ? "border-blue-500 bg-blue-50/50 dark:bg-blue-950/20" : "border-border"
        )}
      >
        {busy ? <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /> : <spec.Icon className="h-5 w-5 text-muted-foreground" />}
        <p className="text-sm">
          {busy ? (
            "Subiendo…"
          ) : (
            <>
              <span className="text-blue-600">Cargar</span> o arrastra {spec.word}
            </>
          )}
        </p>
        <p className="text-[11px] text-muted-foreground">{spec.formats}</p>
        <input
          ref={input}
          type="file"
          accept={spec.accept}
          className="hidden"
          onChange={(e) => {
            handle(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
      </div>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}
