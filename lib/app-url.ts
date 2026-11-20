/**
 * Public base URL of this deployment, for webhooks and tracked links.
 * Never falls back to localhost on a real deployment: a webhook registered at
 * http://localhost:3000 silently drops every comment and DM.
 */
export function appBaseUrl(request?: Request): string | null {
  const fromEnv = (process.env.NEXT_PUBLIC_APP_URL || "").trim().replace(/\/+$/, "");
  if (fromEnv && !/localhost|127\.0\.0\.1/.test(fromEnv)) return fromEnv;
  const prod = (process.env.VERCEL_PROJECT_PRODUCTION_URL || "").trim();
  if (prod) return `https://${prod.replace(/^https?:\/\//, "").replace(/\/+$/, "")}`;
  if (request) {
    const origin = new URL(request.url).origin;
    if (!/localhost|127\.0\.0\.1/.test(origin)) return origin;
  }
  return fromEnv || null;
}
