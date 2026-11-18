import { getWorkspace } from "@/lib/workspace";
import { ContactsView } from "./contacts-view";

export default async function ContactsPage() {
  const { workspace, supabase } = await getWorkspace();

  const [contactsRes, tagsRes, fieldsRes, sequencesRes] = await Promise.all([
    supabase
      .from("contacts")
      .select(
        "*, contact_tags(tag_id, tags(id, name, color)), contact_custom_fields(field_id, value), contact_channels(platform_username)"
      )
      .eq("workspace_id", workspace.id)
      .order("created_at", { ascending: false })
      .limit(1000),
    supabase.from("tags").select("*").eq("workspace_id", workspace.id).order("name"),
    supabase.from("custom_field_definitions").select("id, name, slug, type").eq("workspace_id", workspace.id).order("name"),
    supabase.from("sequences").select("id, name").eq("workspace_id", workspace.id).order("name"),
  ]);

  return (
    <ContactsView
      contacts={(contactsRes.data ?? []) as never}
      tags={tagsRes.data ?? []}
      fields={fieldsRes.data ?? []}
      sequences={sequencesRes.data ?? []}
    />
  );
}
