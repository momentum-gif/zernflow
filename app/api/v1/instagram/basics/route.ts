import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const ZERNIO_API = "https://zernio.com/api/v1";

interface IceBreaker {
  question: string;
  flowId: string | null;
}

interface MenuItem {
  title: string;
  type: "flow" | "url";
  flowId: string | null;
  url: string | null;
}

const FLOW_PREFIX = "zf_flow:";

async function getContext() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };

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
  if (!workspace) return { error: NextResponse.json({ error: "No workspace" }, { status: 404 }) };
  if (!workspace.late_api_key_encrypted) {
    return { error: NextResponse.json({ error: "Falta la API key de Zernio" }, { status: 400 }) };
  }

  const { data: channel } = await supabase
    .from("channels")
    .select("late_account_id")
    .eq("workspace_id", workspace.id)
    .eq("platform", "instagram")
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();
  if (!channel?.late_account_id) {
    return { error: NextResponse.json({ error: "No hay una cuenta de Instagram conectada" }, { status: 400 }) };
  }

  return { apiKey: workspace.late_api_key_encrypted, accountId: channel.late_account_id };
}

async function zernio(apiKey: string, path: string, init?: RequestInit) {
  const res = await fetch(`${ZERNIO_API}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", ...(init?.headers ?? {}) },
    cache: "no-store",
  });
  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { ok: res.ok, status: res.status, body };
}

/** Find the first array of objects carrying `key` anywhere in a response. */
function findItems(value: unknown, key: string): Array<Record<string, unknown>> {
  if (Array.isArray(value)) {
    if (value.some((v) => v && typeof v === "object" && key in (v as object))) {
      return value as Array<Record<string, unknown>>;
    }
    for (const v of value) {
      const found = findItems(v, key);
      if (found.length) return found;
    }
    return [];
  }
  if (value && typeof value === "object") {
    for (const v of Object.values(value as Record<string, unknown>)) {
      const found = findItems(v, key);
      if (found.length) return found;
    }
  }
  return [];
}

function flowIdFromPayload(payload: unknown): string | null {
  return typeof payload === "string" && payload.startsWith(FLOW_PREFIX) ? payload.slice(FLOW_PREFIX.length) : null;
}

/** GET — current conversation starters (ice breakers) and main menu. */
export async function GET() {
  const ctx = await getContext();
  if ("error" in ctx) return ctx.error;

  const [ib, menu] = await Promise.all([
    zernio(ctx.apiKey, `/accounts/${ctx.accountId}/instagram-ice-breakers`),
    zernio(ctx.apiKey, `/accounts/${ctx.accountId}/messenger-menu`),
  ]);

  const iceBreakers: IceBreaker[] = ib.ok
    ? findItems(ib.body, "question").map((i) => ({
        question: String(i.question ?? ""),
        flowId: flowIdFromPayload(i.payload),
      }))
    : [];

  const menuItems: MenuItem[] = menu.ok
    ? findItems(menu.body, "title").map((i) => {
        const isUrl = String(i.type ?? "") === "web_url";
        return {
          title: String(i.title ?? ""),
          type: isUrl ? "url" : "flow",
          flowId: isUrl ? null : flowIdFromPayload(i.payload),
          url: isUrl ? String(i.url ?? "") : null,
        };
      })
    : [];

  return NextResponse.json({ iceBreakers, menuItems });
}

/** PUT { iceBreakers?: IceBreaker[], menuItems?: MenuItem[] } */
export async function PUT(request: NextRequest) {
  const ctx = await getContext();
  if ("error" in ctx) return ctx.error;
  const body = (await request.json()) as { iceBreakers?: IceBreaker[]; menuItems?: MenuItem[] };

  if (body.iceBreakers) {
    const items = body.iceBreakers
      .filter((i) => i.question.trim() && i.flowId)
      .slice(0, 4)
      .map((i) => ({ question: i.question.trim().slice(0, 80), payload: `${FLOW_PREFIX}${i.flowId}` }));

    const res =
      items.length === 0
        ? await zernio(ctx.apiKey, `/accounts/${ctx.accountId}/instagram-ice-breakers`, { method: "DELETE" })
        : await zernio(ctx.apiKey, `/accounts/${ctx.accountId}/instagram-ice-breakers`, {
            method: "PUT",
            body: JSON.stringify({ ice_breakers: items }),
          });
    if (!res.ok) {
      console.error("[instagram/basics] ice breakers", res.status, res.body);
      return NextResponse.json({ error: "Instagram no aceptó los introductores de conversación" }, { status: 502 });
    }
  }

  if (body.menuItems) {
    const actions = body.menuItems
      .filter((i) => i.title.trim() && (i.type === "url" ? i.url : i.flowId))
      .slice(0, 3)
      .map((i) =>
        i.type === "url"
          ? { type: "web_url", title: i.title.trim().slice(0, 30), url: i.url }
          : { type: "postback", title: i.title.trim().slice(0, 30), payload: `${FLOW_PREFIX}${i.flowId}` },
      );

    const res =
      actions.length === 0
        ? await zernio(ctx.apiKey, `/accounts/${ctx.accountId}/messenger-menu`, { method: "DELETE" })
        : await zernio(ctx.apiKey, `/accounts/${ctx.accountId}/messenger-menu`, {
            method: "PUT",
            body: JSON.stringify({
              persistent_menu: [{ locale: "default", composer_input_disabled: false, call_to_actions: actions }],
            }),
          });
    if (!res.ok) {
      console.error("[instagram/basics] menu", res.status, res.body);
      return NextResponse.json({ error: "Instagram no aceptó el menú principal" }, { status: 502 });
    }
  }

  return NextResponse.json({ ok: true });
}
