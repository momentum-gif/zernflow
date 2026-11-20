import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/v1/flows/:flowId/contacts?trigger=<triggerId>
 * The people who entered this automation (ManyChat's "Envíos" / "Contactos
 * únicos" list), with whether we have their e-mail and phone.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ flowId: string }> }) {
  const { flowId } = await params;
  const trigger = request.nextUrl.searchParams.get("trigger");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const ids = new Set<string>();
  for (let from = 0; from < 100_000; from += 1000) {
    let q = supabase
      .from("analytics_events")
      .select("contact_id, metadata")
      .eq("flow_id", flowId)
      .eq("event_type", "flow_started")
      .not("contact_id", "is", null);
    if (trigger) q = q.contains("metadata", { triggerId: trigger });
    const { data } = await q.range(from, from + 999);
    for (const r of data ?? []) if (r.contact_id) ids.add(r.contact_id);
    if (!data || data.length < 1000) break;
  }
  if (!ids.size) return NextResponse.json({ contacts: [] });

  const list = [...ids];
  const contacts: Array<{ id: string; display_name: string | null; avatar_url: string | null; email: string | null; phone: boolean }> = [];
  const { data: phoneDefs } = await supabase.from("custom_field_definitions").select("id").eq("type", "phone");
  const phoneIds = new Set(((phoneDefs ?? []) as Array<{ id: string }>).map((d) => d.id));

  for (let i = 0; i < list.length; i += 200) {
    const chunk = list.slice(i, i + 200);
    const { data } = await supabase
      .from("contacts")
      .select("id, display_name, avatar_url, email, metadata, contact_custom_fields(field_id, value)")
      .in("id", chunk);
    for (const c of (data ?? []) as unknown as Array<{
      id: string;
      display_name: string | null;
      avatar_url: string | null;
      email: string | null;
      metadata: { phone?: string } | null;
      contact_custom_fields: Array<{ field_id: string; value: string }>;
    }>) {
      contacts.push({
        id: c.id,
        display_name: c.display_name,
        avatar_url: c.avatar_url,
        email: c.email,
        phone: !!c.metadata?.phone || c.contact_custom_fields.some((f) => phoneIds.has(f.field_id) && f.value),
      });
    }
  }
  return NextResponse.json({ contacts });
}
