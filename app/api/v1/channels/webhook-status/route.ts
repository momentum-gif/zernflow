import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createZernioClient } from "@/lib/zernio-client";

/**
 * GET /api/v1/channels/webhook-status
 * Diagnostics: how Zernio has ZernFlow's webhook registered (never the secret)
 * and its latest deliveries, to see why comments/DMs stop arriving.
 */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: membership } = await supabase
    .from("workspace_members")
    .select("workspaces(late_api_key_encrypted)")
    .eq("user_id", user.id)
    .limit(1)
    .single();
  const key = (membership?.workspaces as unknown as { late_api_key_encrypted: string | null } | null)?.late_api_key_encrypted;
  if (!key) return NextResponse.json({ error: "Zernio no configurado" }, { status: 400 });

  const zernio = createZernioClient(key);
  const settings = await zernio.webhooks.getWebhookSettings();
  const webhooks = ((settings?.data?.webhooks ?? []) as Array<Record<string, unknown>>).map((w) => {
    const rest = { ...w };
    delete rest.secret;
    return { ...rest, hasSecret: !!w.secret };
  });

  let logs: unknown = null;
  try {
    const l = await zernio.webhooks.getWebhookLogs({ query: { limit: 15 } as never });
    logs = ((l?.data as { logs?: Array<Record<string, unknown>> } | undefined)?.logs ?? []).map((x) => {
      const r = { ...x };
      delete r.payload;
      delete r.requestBody;
      return r;
    });
  } catch (err) {
    logs = { error: String(err) };
  }

  return NextResponse.json({ webhooks, logs });
}
