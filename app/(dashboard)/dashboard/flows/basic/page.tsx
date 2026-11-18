import { getWorkspace } from "@/lib/workspace";
import { AutomationSubnav } from "@/components/automation/automation-subnav";
import { BasicAutomationsView, type BasicFlow } from "./basic-view";

function triggerTypesOf(nodes: unknown): string[] {
  if (!Array.isArray(nodes)) return [];
  return nodes
    .filter((n) => n && typeof n === "object" && (n as { type?: string }).type === "trigger")
    .map((n) => String(((n as { data?: Record<string, unknown> }).data ?? {}).triggerType ?? "keyword"));
}

export default async function BasicAutomationsPage() {
  const { workspace, supabase } = await getWorkspace();
  const { data: flows } = await supabase
    .from("flows")
    .select("id, name, status, nodes, updated_at")
    .eq("workspace_id", workspace.id)
    .neq("status", "archived")
    .order("updated_at", { ascending: false });

  const list: BasicFlow[] = (flows ?? []).map((f) => ({
    id: f.id,
    name: f.name,
    status: f.status,
    triggerTypes: triggerTypesOf(f.nodes),
  }));

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-border px-8 py-6">
        <h1 className="text-2xl font-bold">Automatización</h1>
      </div>
      <div className="flex min-h-0 flex-1">
        <AutomationSubnav active="basic" />
        <div className="flex-1 overflow-auto px-8 py-6">
          <BasicAutomationsView flows={list} />
        </div>
      </div>
    </div>
  );
}
