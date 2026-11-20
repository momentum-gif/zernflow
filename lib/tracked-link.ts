import { createHmac, timingSafeEqual } from "crypto";

/**
 * Tracked links for link buttons, like ManyChat: the button opens
 * <app>/r/<token>, which counts the tap and redirects to the real URL.
 * The token is signed so nobody can use ZernFlow as an open redirect.
 */
export interface LinkInfo {
  /** destination */
  u: string;
  /** flow id */
  f: string;
  /** node id */
  n: string | null;
  /** contact id */
  c: string;
  /** workspace id */
  w: string;
  /** button handle for per-button counts */
  h: string;
}

function secret() {
  return process.env.LINK_SECRET || process.env.CRON_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || "";
}

function sign(payload: string) {
  return createHmac("sha256", secret()).update(payload).digest("base64url").slice(0, 22);
}

export function trackedLink(url: string, info: Omit<LinkInfo, "u">): string {
  const base = (process.env.NEXT_PUBLIC_APP_URL || "").trim().replace(/\/+$/, "");
  if (!base || !secret() || !/^https?:\/\//i.test(url)) return url;
  const payload = Buffer.from(JSON.stringify({ ...info, u: url })).toString("base64url");
  return `${base}/r/${payload}.${sign(payload)}`;
}

export function readTrackedLink(token: string): LinkInfo | null {
  const dot = token.lastIndexOf(".");
  if (dot < 1 || !secret()) return null;
  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = sign(payload);
  if (sig.length !== expected.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  try {
    const info = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as LinkInfo;
    return /^https?:\/\//i.test(info.u) ? info : null;
  } catch {
    return null;
  }
}
