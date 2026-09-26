import type { NextRequest } from "next/server";

/** Vercel cron requests carry `Authorization: Bearer <CRON_SECRET>`. */
export function cronAuthError(request: NextRequest): { error: string; status: number } | null {
  const secret = process.env.CRON_SECRET;
  if (!secret) return { error: "CRON_SECRET is not configured on the server.", status: 500 };
  const auth = request.headers.get("authorization") ?? request.headers.get("x-cron-secret");
  if (auth !== `Bearer ${secret}` && auth !== secret) return { error: "Unauthorized", status: 401 };
  return null;
}
