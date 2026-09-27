import {
    HttpException,
    Injectable,
    NotFoundException,
    Optional,
} from "@nestjs/common";
import { prisma, runInOrgContext } from "@saroh/database";
import { DateTime } from "luxon";

import type { PublicOpeningDay } from "../sites/public-visit.service";
import { publicWeek } from "../sites/public-visit.service";
import { appointmentsOpen } from "./appointments-open";
import { closedDates, closuresAhead } from "./closed-dates";
import type { PublicDays } from "./public-booking-page";
import { offeredOnSite, publicDays } from "./public-booking-page";
import { FixedWindowRateLimiter } from "./rate-limiter";
import { businessTimezone } from "./staff-availability";

/**
 * "On today" on a merchant's home page (G18, R15): the next classes and the
 * next free appointment times today, and what the hero's open-or-closed
 * line needs to say "Open now · closes 9pm" or "Closed · opens Mon 8am".
 *
 * THE TIMES ARE THE BOOKING PAGE'S OWN. Each service's today is read through
 * {@link publicDays} — the very read the booking page draws its days from —
 * for one day, and listed as it comes back. Nothing here snaps or rounds, so
 * when the booking page's starts change (E6's half hours, default 41) On
 * today follows without a change here, and a time shown in On today is
 * always one the booking page offers.
 *
 * An explicit allow-list, like every public read: a service's name and
 * length, a start, a person's DISPLAY name (ADR-008) and a class's places
 * left. Never who is off, or why, or anything about other bookers.
 */

/** How many rows the panel shows. */
export const TODAY_ITEMS = 4;

/** Page views per visitor per minute, as the Visit us read allows. */
const READS_PER_WINDOW = 120;
const READ_WINDOW_MS = 60_000;

/** One row of On today. */
export interface TodayItem {
    /** A class session (places) or a one-to-one free start. */
    kind: "class" | "one";
    serviceId: string;
    serviceName: string;
    durationMinutes: number;
    startAt: string;
    /** `YYYY-MM-DD` in the business's zone — the booking link's `date`. */
    date: string;
    /** `HH:MM` in the business's zone — the booking link's `start`. */
    time: string;
    /** Who takes it, by display name only (ADR-008). */
    staffName: string | null;
    /** A class's places left (0 is Full); null for a one-to-one. */
    placesLeft: number | null;
}

/** What the home page's On today and open-or-closed line read. */
export interface PublicToday {
    /** The business's zone (DEC-033); India when none is set. */
    timezone: string;
    /** Today, `YYYY-MM-DD`, in that zone. */
    date: string;
    /**
     * Whether On today has anything to say at all: Appointments on and at
     * least one service on the booking page (default 138). False, the hero
     * stays full-width: a shop-only business gets no panel.
     */
    appointments: boolean;
    /** Whether any service offered is a class — "On today" vs "Free today". */
    classes: boolean;
    items: TodayItem[];
    /** The business's week (DEC-034), for the open-or-closed line. */
    hours: PublicOpeningDay[] | null;
    /**
     * Days ahead (from today) on which the business is closed for the whole
     * of its hours (E3), so the line never says "opens" on a closed day.
     */
    closedDates: string[];
}

/** Every miss looks the same. */
function notFound(): never {
    throw new NotFoundException("Nothing to show here");
}

interface ServiceRow {
    id: string;
    name: string;
    durationMinutes: number;
}

/**
 * One service's today as rows: a class's every session (Full included, as
 * the design draws it), a one-to-one's free starts. Its places and who
 * takes it are the booking page's answer, word for word.
 */
export function todayRows(
    service: ServiceRow,
    days: PublicDays,
    today: string,
): TodayItem[] {
    const day = days.days.find((d) => d.date === today);
    if (!day) return [];
    return day.starts.map((start) => {
        const local = DateTime.fromISO(start.startAt, { zone: days.timezone });
        return {
            kind: days.kind,
            serviceId: service.id,
            serviceName: service.name,
            durationMinutes: service.durationMinutes,
            startAt: start.startAt,
            date: local.toISODate() ?? today,
            time: local.toFormat("HH:mm"),
            staffName: start.staffName,
            placesLeft: days.kind === "class" ? start.placesLeft : null,
        };
    });
}

/**
 * The rows the panel shows, soonest first, at most {@link TODAY_ITEMS}.
 *
 * One-to-one times are said once each: three services free at 10:00 are one
 * "10:00" row, the first service's, as the design lists them — the panel is
 * a glance at when, and the booking page says what else fits. Classes are
 * each their own row.
 */
export function pickToday(
    rows: readonly TodayItem[],
    limit: number = TODAY_ITEMS,
): TodayItem[] {
    const seen = new Set<string>();
    const picked: TodayItem[] = [];
    const sorted = [...rows].sort(
        (a, b) =>
            a.startAt.localeCompare(b.startAt) ||
            // A class before a free slot at the same minute.
            (a.kind === b.kind ? 0 : a.kind === "class" ? -1 : 1),
    );
    for (const row of sorted) {
        if (picked.length >= limit) break;
        if (row.kind === "one") {
            if (seen.has(row.startAt)) continue;
            seen.add(row.startAt);
        }
        picked.push(row);
    }
    return picked;
}

/**
 * The public today read for a site (G18).
 *
 * The Site is resolved FIRST and its organization derived from it; nothing
 * the caller sends names a business. Everything after runs in that
 * organization's RLS context (`runInOrgContext`), and is limited per visitor
 * like the other public reads. A deleted or unknown site is a 404. Like the
 * Visit us read, the site need not be published: a draft preview shows the
 * same panel.
 */
@Injectable()
export class PublicTodayService {
    constructor(
        // Not a DI provider — a per-instance default that tests can replace.
        @Optional()
        private readonly limiter: FixedWindowRateLimiter = new FixedWindowRateLimiter(
            READS_PER_WINDOW,
            READ_WINDOW_MS,
        ),
    ) {}

    async read(
        siteId: string,
        callerHash: string | undefined,
        now: Date = new Date(),
    ): Promise<PublicToday> {
        if (!this.limiter.take(callerHash ?? `site:${siteId}`)) {
            throw new HttpException(
                "Too many requests. Try again shortly.",
                429,
            );
        }
        const site = await prisma.site.findFirst({
            where: { id: siteId, deletedAt: null },
            select: { organizationId: true },
        });
        if (!site) notFound();
        const { organizationId } = site;

        return runInOrgContext(organizationId, async () => {
            const zone = await businessTimezone(prisma, organizationId);
            const start = DateTime.fromJSDate(now, { zone }).startOf("day");
            const date = start.toISODate() ?? "";
            const [open, store, closures] = await Promise.all([
                appointmentsOpen(organizationId),
                // The business's week: Settings › Hours writes the same one
                // to every storefront (DEC-034), so the first one says it.
                prisma.store.findFirst({
                    where: { organizationId, deletedAt: null },
                    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
                    select: { settings: { select: { openingHours: true } } },
                }),
                // The same closures, read the same way, as Visit us (G-2).
                closuresAhead(prisma, organizationId, zone, now),
            ]);
            const hours = publicWeek(store?.settings?.openingHours);
            const shut = closedDates(hours, closures, zone, now);

            const services: (ServiceRow & { capacity: number })[] = open
                ? await prisma.service.findMany({
                      where: offeredOnSite(organizationId, siteId),
                      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
                      select: {
                          id: true,
                          name: true,
                          durationMinutes: true,
                          capacity: true,
                      },
                  })
                : [];

            // One service the booking page would refuse (no one takes it,
            // say) leaves On today without it, not without the panel.
            const rows = (
                await Promise.all(
                    services.map((service) =>
                        publicDays(service.id, now, 1).then(
                            (days) => todayRows(service, days, date),
                            () => [] as TodayItem[],
                        ),
                    ),
                )
            ).flat();

            return {
                timezone: zone,
                date,
                appointments: services.length > 0,
                classes: services.some((s) => s.capacity > 1),
                items: pickToday(rows),
                hours,
                closedDates: shut,
            };
        });
    }
}
