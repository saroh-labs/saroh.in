import { prisma } from "@saroh/database";

import { googleBusyAllowed } from "./calendar-allowed";
import { SCOPES } from "./google/google-calendar.port";

/**
 * Whether a service in this business may make Google Meet links with no
 * typed link to fall back on (KTD8): Google Calendar is on for it (the
 * flag and the plan, GC-18), and someone here who may still sync
 * (GC-03) has it connected with events allowed. A booking taken by anyone
 * else falls back to the service's typed link, if it has one.
 */
export async function googleMeetReady(
    organizationId: string,
): Promise<boolean> {
    const allowed = await googleBusyAllowed(organizationId);
    if (!allowed || allowed.size === 0) return false;
    const connected = await prisma.googleCalendarConnection.count({
        where: {
            organizationId,
            status: "CONNECTED",
            scopes: { has: SCOPES.events },
            membershipId: { in: [...allowed] },
        },
    });
    return connected > 0;
}
