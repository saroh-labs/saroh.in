import { Injectable } from "@nestjs/common";
import { prisma } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import { authorize } from "../organizations/organization-policy";
import { busyPeople } from "./busy-people";
import { readRange } from "./busy-range";
import { businessPause, googleBusyConnections } from "./calendar-allowed";
import type { CalendarBusyView } from "./dto";

/** Rows kept per read, so a very busy calendar can't make a huge answer. */
const BUSY_READ_MAX_ROWS = 2000;

/**
 * Each connected person's Google busy times for the days the Bookings
 * calendar shows (BKVGoogle): start and end per person on the diary, and
 * nothing else. Never an event's title, attendees, calendar or the
 * person's Google address (Settings promises "Saroh sees busy or free,
 * never what an event is"): the table holds only intervals, and this read
 * selects only them.
 *
 * Scoped to the business from the request context, never to an id the
 * caller sent. Anyone who may read the bookings (a Member included) sees
 * everyone's blocks. With the flag or the plan off, or for a person whose
 * connection is paused, nothing is returned for them, exactly what slot
 * reads count (`googleBusyConnections`): a block drawn is a block that
 * takes the time away.
 */
@Injectable()
export class CalendarBusyReadService {
    async busy(
        ctx: OrganizationContext,
        fromRaw: string | undefined,
        toRaw: string | undefined,
    ): Promise<CalendarBusyView> {
        authorize(ctx, "booking:read");
        const { from, to } = readRange(fromRaw, toRaw);
        const organizationId = ctx.organizationId;
        if (await businessPause(organizationId)) {
            return { on: false, busy: [], people: [] };
        }
        const allowed = await googleBusyConnections(organizationId);
        const [rows, connections] = await Promise.all([
            allowed && allowed.size > 0
                ? prisma.googleCalendarBusy.findMany({
                      where: {
                          organizationId,
                          connectionId: { in: [...allowed] },
                          startAt: { lt: to },
                          endAt: { gt: from },
                      },
                      orderBy: { startAt: "asc" },
                      take: BUSY_READ_MAX_ROWS,
                      select: { staffId: true, startAt: true, endAt: true },
                  })
                : [],
            prisma.googleCalendarConnection.findMany({
                where: {
                    organizationId,
                    status: { in: ["CONNECTED", "LAPSED"] },
                    membership: { staffMember: { isNot: null } },
                },
                select: {
                    id: true,
                    status: true,
                    membership: {
                        select: { staffMember: { select: { id: true } } },
                    },
                },
            }),
        ]);
        return {
            on: true,
            busy: rows.map((r) => ({
                staffId: r.staffId,
                startAt: r.startAt.toISOString(),
                endAt: r.endAt.toISOString(),
            })),
            people: busyPeople(connections, allowed),
        };
    }
}
