import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { readTrackedLink } from "@/lib/tracked-link";

/**
 * GET /r/<token> — a link button was tapped: count it ("Se le hizo clic") and
 * send the person to the real URL right away.
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const info = readTrackedLink(token);
  if (!info) return new NextResponse("Enlace no válido", { status: 404 });

  after(async () => {
    try {
      const supabase = await createServiceClient();
      await supabase.from("analytics_events").insert({
        workspace_id: info.w,
        flow_id: info.f,
        contact_id: info.c,
        event_type: "button_clicked",
        metadata: { nodeId: info.n, handle: info.h, url: info.u },
      });
    } catch (err) {
      console.error("[r] click tracking failed:", err);
    }
  });

  return NextResponse.redirect(info.u, 302);
}
