import { defineRead } from "@/lib/query/define-read";
import { domainKey } from "@/lib/query/keys";

import type { CalendarRead, CalendarStatus } from "./types";

/**
 * Settings › Integrations › Google Calendar on React Query (DEC-259): the
 * person's own Google accounts here, as the page draws them, or why it
 * can't be shown. No OAuth token ever crosses: the API holds them, and an
 * account crosses field by field (`access.ts`). Switched off is the route's
 * 404 (the page's not-found); a failed read its 503 (`error.tsx`).
 */
export type GoogleCalendarScreen =
    | Exclude<
          CalendarRead,
          { kind: "off" } | { kind: "failed" } | { kind: "ready" }
      >
    | {
          kind: "ready";
          status: CalendarStatus;
          /** The plan with more Google accounts, by name (never a count). */
          morePlan: { name: string; href: string } | null;
      };

export const googleCalendarRead = defineRead<GoogleCalendarScreen>()({
    key: (orgId) => domainKey("settings", orgId, "google-calendar"),
    route: { path: "/api/settings/integrations/google-calendar", params: {} },
    tier: "settings",
});
