import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const ZERNIO_API = "https://zernio.com/api/v1";

export interface InstagramPostSummary {
  id: string;
  picture: string | null;
  content: string | null;
  permalink: string | null;
  createdTime: string | null;
}

/**
 * GET /api/v1/instagram/posts?cursor=...
 *
 * Lists the workspace's Instagram posts and Reels (newest first) so the comment
 * trigger can show thumbnails to pick from, like ManyChat's "Publicación o Reel
 * específico". The `id` returned is the same post ID that comment webhooks
 * carry, so it can be stored directly in the trigger's postIds.
 */
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: membership } = await supabase
    .from("workspace_members")
    .select("workspace_id, workspaces(*)")
    .eq("user_id", user.id)
    .limit(1)
    .single();

  const workspace = membership?.workspaces as
    | { id: string; late_api_key_encrypted: string | null }
    | null
    | undefined;
  if (!workspace) return NextResponse.json({ error: "No workspace" }, { status: 404 });
  if (!workspace.late_api_key_encrypted) {
    return NextResponse.json({ error: "Zernio API key not configured" }, { status: 400 });
  }

  const { data: channels } = await supabase
    .from("channels")
    .select("late_account_id")
    .eq("workspace_id", workspace.id)
    .eq("platform", "instagram")
    .eq("is_active", true);

  const accountIds = (channels ?? []).map((c) => c.late_account_id).filter(Boolean);
  if (accountIds.length === 0) {
    return NextResponse.json({ posts: [], nextCursor: null });
  }

  const cursor = request.nextUrl.searchParams.get("cursor");
  const params = new URLSearchParams({
    platform: "instagram",
    limit: "30",
    sortBy: "date",
    sortOrder: "desc",
  });
  if (accountIds.length === 1) params.set("accountId", accountIds[0]);
  if (cursor) params.set("cursor", cursor);

  try {
    const res = await fetch(`${ZERNIO_API}/inbox/comments?${params.toString()}`, {
      headers: { Authorization: `Bearer ${workspace.late_api_key_encrypted}` },
      cache: "no-store",
    });
    if (!res.ok) {
      const text = await res.text();
      console.error("[instagram/posts] Zernio error", res.status, text);
      return NextResponse.json({ error: "No se pudieron cargar las publicaciones" }, { status: 502 });
    }
    const body = (await res.json()) as {
      data?: Array<Record<string, unknown>>;
      pagination?: { hasMore?: boolean; nextCursor?: string | null };
    };

    const seen = new Set<string>();
    const posts: InstagramPostSummary[] = [];
    for (const item of body.data ?? []) {
      const id = typeof item.id === "string" ? item.id : null;
      if (!id || seen.has(id) || item.isAd === true) continue;
      seen.add(id);
      posts.push({
        id,
        picture: typeof item.picture === "string" ? item.picture : null,
        content: typeof item.content === "string" ? item.content : null,
        permalink: typeof item.permalink === "string" ? item.permalink : null,
        createdTime: typeof item.createdTime === "string" ? item.createdTime : null,
      });
    }

    return NextResponse.json({
      posts,
      nextCursor: body.pagination?.hasMore ? body.pagination?.nextCursor ?? null : null,
    });
  } catch (err) {
    console.error("[instagram/posts] fetch failed", err);
    return NextResponse.json({ error: "No se pudieron cargar las publicaciones" }, { status: 502 });
  }
}
