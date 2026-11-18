"use server";

import { getWorkspace } from "@/lib/workspace";
import { createServiceClient } from "@/lib/supabase/server";
import { fireContactEvent } from "@/lib/contact-events";
import { revalidatePath } from "next/cache";

async function ownContact(contactId: string) {
  const { workspace, supabase } = await getWorkspace();
  const { data } = await supabase
    .from("contacts")
    .select("id")
    .eq("id", contactId)
    .eq("workspace_id", workspace.id)
    .single();
  if (!data) throw new Error("Contacto no encontrado");
  return { workspace, supabase };
}

/** ManyChat "+ Añadir etiqueta" / quitar etiqueta on a contact. */
export async function setContactTag(contactId: string, tagName: string, action: "add" | "remove") {
  const name = tagName.trim();
  if (!name) return;
  const { workspace, supabase } = await ownContact(contactId);
  const { data: tag } = await supabase
    .from("tags")
    .upsert({ workspace_id: workspace.id, name }, { onConflict: "workspace_id,name" })
    .select("id")
    .single();
  if (!tag) throw new Error("No se pudo guardar la etiqueta");
  if (action === "add") {
    await supabase.from("contact_tags").upsert({ contact_id: contactId, tag_id: tag.id }, { onConflict: "contact_id,tag_id" });
  } else {
    await supabase.from("contact_tags").delete().eq("contact_id", contactId).eq("tag_id", tag.id);
  }
  const service = await createServiceClient();
  await fireContactEvent(service, {
    workspaceId: workspace.id,
    contactId,
    event: action === "add" ? "tag_added" : "tag_removed",
    detail: { tagName: name },
  });
  revalidatePath("/dashboard/contacts");
}

/** Edit a custom field ("Campos personalizados") or the e-mail of a contact. */
export async function setContactField(contactId: string, fieldSlug: string, value: string) {
  const { workspace, supabase } = await ownContact(contactId);
  const service = await createServiceClient();
  if (fieldSlug === "email") {
    await supabase.from("contacts").update({ email: value.trim() || null }).eq("id", contactId);
    await fireContactEvent(service, { workspaceId: workspace.id, contactId, event: "system_field_changed", detail: { fieldSlug: "email" } });
    return;
  }
  if (fieldSlug === "display_name") {
    await supabase.from("contacts").update({ display_name: value.trim() || null }).eq("id", contactId);
    return;
  }
  const { data: def } = await supabase
    .from("custom_field_definitions")
    .select("id")
    .eq("workspace_id", workspace.id)
    .eq("slug", fieldSlug)
    .single();
  if (!def) throw new Error("Campo no encontrado");
  if (value.trim()) {
    await supabase
      .from("contact_custom_fields")
      .upsert({ contact_id: contactId, field_id: def.id, value: value.trim() }, { onConflict: "contact_id,field_id" });
  } else {
    await supabase.from("contact_custom_fields").delete().eq("contact_id", contactId).eq("field_id", def.id);
  }
  await fireContactEvent(service, { workspaceId: workspace.id, contactId, event: "custom_field_changed", detail: { fieldSlug } });
}

/** "Pausar Automatizaciones" / "Reanudar automatizaciones" for a contact. */
export async function setContactPaused(contactId: string, paused: boolean) {
  const { supabase } = await ownContact(contactId);
  await supabase.from("conversations").update({ is_automation_paused: paused }).eq("contact_id", contactId);
}

/** "Acciones masivas": add/remove a tag or delete many contacts. */
export async function bulkContacts(contactIds: string[], action: "addTag" | "removeTag" | "delete", tagName?: string) {
  if (action === "delete") {
    const { workspace, supabase } = await getWorkspace();
    await supabase.from("contacts").delete().in("id", contactIds).eq("workspace_id", workspace.id);
    revalidatePath("/dashboard/contacts");
    return;
  }
  for (const id of contactIds) {
    await setContactTag(id, tagName ?? "", action === "addTag" ? "add" : "remove");
  }
}
