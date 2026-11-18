import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/** PATCH { name } — rename a folder. */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ folderId: string }> }) {
  const { folderId } = await params;
  const supabase = await createClient();
  const { name } = (await request.json()) as { name?: string };
  if (!name?.trim()) return NextResponse.json({ error: "Falta el nombre" }, { status: 400 });
  // RLS limits this to folders of the caller's workspaces.
  const { data, error } = await supabase
    .from("automation_folders")
    .update({ name: name.trim().slice(0, 80) })
    .eq("id", folderId)
    .select("id, name")
    .single();
  if (error || !data) return NextResponse.json({ error: error?.message ?? "Not found" }, { status: 404 });
  return NextResponse.json(data);
}

/** DELETE — remove a folder; its automations move back to the root. */
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ folderId: string }> }) {
  const { folderId } = await params;
  const supabase = await createClient();
  const { error } = await supabase.from("automation_folders").delete().eq("id", folderId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
