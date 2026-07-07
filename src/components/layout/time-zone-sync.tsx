"use client";

import { useEffect } from "react";

import { DEFAULT_TIME_ZONE, TIME_ZONE_COOKIE } from "@/lib/timezone-constants";

/**
 * Persists the browser's local timezone in a cookie so server components can
 * compute "current month" in the user's actual timezone (instead of UTC).
 */
export function TimeZoneSync() {
  useEffect(() => {
    const tz =
      Intl.DateTimeFormat().resolvedOptions().timeZone || DEFAULT_TIME_ZONE;
    if (document.cookie.includes(`${TIME_ZONE_COOKIE}=`)) return;
    document.cookie = `${TIME_ZONE_COOKIE}=${tz};path=/;max-age=31536000;samesite=lax`;
  }, []);

  return null;
}
