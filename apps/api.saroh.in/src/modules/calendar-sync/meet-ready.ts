import { prisma } from "@saroh/database";

import { SCOPES } from "./google/google-calendar.port";

/**
 * Whether a service in this business may make Google Meet links with no
 * typed link to fall back on (KTD8): someone here has Google Calendar
 * connected with events allowed. A booking taken by anyone else falls back
 * to the service's typed link, if it has one.
 */
export async function googleMeetReady(
    organizationId: string,
): Promise<boolean> {
    const connected = await prisma.googleCalendarConnection.count({
        where: {
            organizationId,
            status: "CONNECTED",
            scopes: { has: SCOPES.events },
        },
    });
    return connected > 0;
}
