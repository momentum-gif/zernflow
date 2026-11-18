import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

async function workspaceId() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { supabase, id: null };
  const { data } = await supabase
    .from("workspace_members")
    .select("workspace_id")
    .eq("user_id", user.id)
    .limit(1)
    .single();
  return { supabase, id: data?.workspace_id ?? null };
}

/** POST { name } — "Nueva carpeta". */
export async function POST(request: NextRequest) {
  const { supabase, id } = await workspaceId();
  if (!id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { name } = (await request.json()) as { name?: string };
  if (!name?.trim()) return NextResponse.json({ error: "Falta el nombre" }, { status: 400 });

  const { data, error } = await supabase
    .from("automation_folders")
    .insert({ workspace_id: id, name: name.trim().slice(0, 80) })
    .select("id, name")
    .single();
  if (error) {
    const needsMigration = /automation_folders/.test(error.message);
    return NextResponse.json(
      { error: needsMigration ? "Falta activar las carpetas en Supabase (migración 00018)." : error.message },
      { status: 500 },
    );
  }
  return NextResponse.json(data);
}
