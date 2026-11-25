import "server-only";

import { accessRow, upgradeHref } from "@/lib/billing/access";
import { activeOrganizationOnce } from "@/lib/organizations/service";
import type { ServerRead } from "@/lib/query/route";
import { billingAccessOrNull } from "@/lib/saroh-billing/service";
import type { NoAsk } from "@/lib/settings/queries";

import type { GoogleCalendarScreen } from "./queries";
import { googleCalendarRead } from "./queries";
import { readGoogleCalendar } from "./service";
import type { CalendarStatus } from "./types";

/** Anyone in the business: the API says what their role, plan and diary allow. */
export async function mayReadGoogleCalendar(): Promise<boolean> {
    return !!(await activeOrganizationOnce());
}

/** Their Google Calendar as the page draws it, field by field: never a token. */
export function statusFacts(s: CalendarStatus): CalendarStatus {
    return {
        state: s.state,
        pausedBecause: s.pausedBecause,
        accounts: s.accounts.map((a) => ({
            id: a.id,
            googleEmail: a.googleEmail,
            state: a.state,
            calendars: a.calendars.map((c) => ({
                id: c.id,
                name: c.name,
                writeTo: c.writeTo,
                checkBusy: c.checkBusy,
            })),
            granted: {
                events: a.granted.events,
                freeBusy: a.granted.freeBusy,
                calendars: a.granted.calendars,
                meet: a.granted.meet,
            },
            busyRefreshedAt: a.busyRefreshedAt,
            behind: a.behind,
        })),
        bookingsGoTo: s.bookingsGoTo
            ? {
                  accountId: s.bookingsGoTo.accountId,
                  googleEmail: s.bookingsGoTo.googleEmail,
                  calendarId: s.bookingsGoTo.calendarId,
                  name: s.bookingsGoTo.name,
              }
            : null,
        accountsAllowed: s.accountsAllowed,
        meetAccess: s.meetAccess,
    };
}

export const googleCalendarServer: ServerRead<NoAsk, GoogleCalendarScreen> = {
    read: googleCalendarRead,
    service: async () => {
        const read = await readGoogleCalendar();
        // Switched off for the business: not there at all.
        if (read.kind === "off") return null;
        if (read.kind === "failed") {
            throw new Error("Google Calendar couldn't be read");
        }
        if (read.kind !== "ready") return read;
        // Where more Google accounts come from, by name only (DEC-233).
        const access = await billingAccessOrNull();
        const more = accessRow(access, "google-accounts")?.upgradeTo ?? null;
        return {
            kind: "ready",
            status: statusFacts(read.status),
            morePlan: more
                ? { name: more.name, href: upgradeHref(more.planId) }
                : null,
        };
    },
};
