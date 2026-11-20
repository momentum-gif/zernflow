import { getWorkspace } from "@/lib/workspace";
import { InboxView } from "./inbox-view";

export default async function InboxPage() {
  const { workspace, supabase, user } = await getWorkspace();

  const [convRes, tagsRes, seqRes] = await Promise.all([
    supabase
      .from("conversations")
      .select("*, contacts(*, contact_tags(tag_id))")
      .eq("workspace_id", workspace.id)
      .order("last_message_at", { ascending: false, nullsFirst: false })
      .limit(1000),
    supabase.from("tags").select("id, name, color").eq("workspace_id", workspace.id).order("name"),
    supabase.from("sequences").select("id, name").eq("workspace_id", workspace.id).order("name"),
  ]);

  return (
    <InboxView
      conversations={(convRes.data ?? []) as never}
      tags={tagsRes.data ?? []}
      sequences={seqRes.data ?? []}
      workspaceId={workspace.id}
      userId={user.id}
    />
  );
}
