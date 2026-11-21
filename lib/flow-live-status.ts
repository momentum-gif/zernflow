/**
 * ManyChat shows LIVE / STOPPED for what is published, not for unpublished edits.
 * An automation is live when it has at least one active trigger row (the rows are
 * only rewritten on "Publicar en vivo" and by the "Activa este disparador" switch).
 * Button/quick-reply rows don't count: they only continue a conversation.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function liveFlowIds(supabase: any, flowIds: string[]): Promise<Set<string>> {
  if (flowIds.length === 0) return new Set();
  const { data } = await supabase
    .from("triggers")
    .select("flow_id, type")
    .in("flow_id", flowIds)
    .eq("is_active", true);
  return new Set(
    ((data ?? []) as Array<{ flow_id: string; type: string }>)
      .filter((t) => t.type !== "postback" && t.type !== "quick_reply")
      .map((t) => t.flow_id)
  );
}
