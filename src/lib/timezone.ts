import { cookies } from "next/headers";

import { DEFAULT_TIME_ZONE, TIME_ZONE_COOKIE } from "./timezone-constants";

export { DEFAULT_TIME_ZONE, TIME_ZONE_COOKIE };

/**
 * Resolve the timezone to use for month math on the server.  Reads the
 * `ft_tz` cookie (set by <TimeZoneSync/> from the browser) and falls back to
 * the app default.  This keeps server-rendered "current month" consistent
 * with the user's local time.
 */
export async function getRequestTimeZone(): Promise<string> {
  const store = await cookies();
  return store.get(TIME_ZONE_COOKIE)?.value || DEFAULT_TIME_ZONE;
}
