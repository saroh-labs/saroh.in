import {
    BadRequestException,
    HttpException,
    Injectable,
    NotFoundException,
    Optional,
} from "@nestjs/common";
import { prisma, runInOrgContext } from "@saroh/database";
import { DateTime } from "luxon";

import { LiveReadCache } from "../../common/live-read-cache";
import type { GstOnPrice } from "../invoices/gst-price";
import { loadPriceTerms } from "../invoices/price-terms";
import { appointmentsOpen } from "./appointments-open";
import type { PublicDays } from "./public-booking-page";
import { offeredOnSite, publicDays } from "./public-booking-page";
import { secondsUntil } from "./public-today";
import { FixedWindowRateLimiter } from "./rate-limiter";
import { onceReads } from "./reservation";
import { serviceCharge } from "./service-price";
import { businessTimezone } from "./staff-availability";

/**
 * The week's class sessions for a site's Timetable block (industry templates
 * U2): every class the booking page offers, or the ones the section names,
 * for the next seven days.
 *
 * THE SESSIONS ARE THE BOOKING PAGE'S OWN, as On today's are (G18): each
 * class's week is read through {@link publicDays} — the read the booking
 * page draws its days from — and listed as it comes back, full sessions
 * included, so a time on the timetable is always one the booking page
 * offers and "Full" is the booking page's answer.
 *
 * An explicit allow-list, like every public read: a class's name, length
 * and price (the services list's own: the price typed and the GST in or on
 * it, DEC-172 U7), a start, who takes it by DISPLAY name (ADR-008) and its
 * places left. Never who is off, or why, or anything about other bookers.
 */

/** How many days the timetable shows: a week, from today. */
export const TIMETABLE_DAYS = 7;

/** The section contract's cap on the classes a timetable names. */
export const TIMETABLE_MAX_IDS = 24;

/** How long one site's week is kept and shared, as On today's (review #4). */
export const TIMETABLE_KEPT_MS = 30_000;

/** Page views per visitor per minute, as On today and Visit us allow. */
const READS_PER_WINDOW = 120;
const READ_WINDOW_MS = 60_000;

/** One class session on the timetable. */
export interface TimetableSession {
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
    /** Places left; 0 is Full. */
    placesLeft: number;
    /** How many the class takes, for "nearly full". */
    capacity: number;
    /**
     * The class's price as the business typed it (x 100), and its currency,
     * as the services list serves them; null for none (never "0").
     */
    priceCents: number | null;
    currency: string | null;
    /** The GST in or on that price; null for none. */
    gst: GstOnPrice | null;
}

/** What the Timetable block reads. */
export interface PublicTimetable {
    /** The business's zone (DEC-033); India when none is set. */
    timezone: string;
    /** The seven days from today, `YYYY-MM-DD` in that zone, in order. */
    days: string[];
    /** Soonest first. Empty: the block draws nothing on the live site. */
    sessions: TimetableSession[];
}

interface ClassRow {
    id: string;
    name: string;
    durationMinutes: number;
    priceCents: number | null;
    currency: string | null;
    gst: GstOnPrice | null;
}

/** Every miss looks the same. */
function notFound(): never {
    throw new NotFoundException("Nothing to show here");
}

/**
 * `?services=a,b` as a list: trimmed, de-duplicated, at most the contract's
 * cap. Absent or empty means every class.
 */
export function timetableIds(raw: unknown): string[] {
    if (raw === undefined) return [];
    // `?services=a&services=b` arrives as an array; one comma list only.
    if (typeof raw !== "string") {
        throw new BadRequestException(
            "services must be a comma-separated list",
        );
    }
    const ids = [
        ...new Set(
            raw
                .split(",")
                .map((id) => id.trim())
                .filter(Boolean),
        ),
    ];
    if (ids.length > TIMETABLE_MAX_IDS) {
        throw new BadRequestException(
            `At most ${TIMETABLE_MAX_IDS} classes at a time`,
        );
    }
    return ids;
}

/** One class's week as sessions, every one of them, Full included. */
export function timetableRows(
    service: ClassRow,
    days: PublicDays,
): TimetableSession[] {
    return days.days.flatMap((day) =>
        day.starts.map((start) => {
            const local = DateTime.fromISO(start.startAt, {
                zone: days.timezone,
            });
            return {
                serviceId: service.id,
                serviceName: service.name,
                durationMinutes: service.durationMinutes,
                startAt: start.startAt,
                date: local.toISODate() ?? day.date,
                time: local.toFormat("HH:mm"),
                staffName: start.staffName,
                placesLeft: Math.max(0, start.placesLeft ?? 0),
                capacity: days.capacity,
                priceCents: service.priceCents,
                currency: service.currency,
                gst: service.gst,
            };
        }),
    );
}

/** Soonest first; two classes at one minute by name, so the order is stable. */
export function sortSessions(rows: TimetableSession[]): TimetableSession[] {
    return [...rows].sort(
        (a, b) =>
            a.startAt.localeCompare(b.startAt) ||
            a.serviceName.localeCompare(b.serviceName),
    );
}

/**
 * The public timetable read for a site.
 *
 * The Site is resolved FIRST and its organization derived from it; the
 * class ids the caller sends only narrow that organization's own classes
 * on offer, so an id from another business finds nothing. Everything after
 * runs in that organization's RLS context, limited per visitor. A deleted
 * or unknown site is a 404; a site need not be published, so a draft
 * preview shows the same week.
 */
@Injectable()
export class PublicTimetableService {
    constructor(
        // Not a DI provider — a per-instance default that tests can replace.
        @Optional()
        private readonly limiter: FixedWindowRateLimiter = new FixedWindowRateLimiter(
            READS_PER_WINDOW,
            READ_WINDOW_MS,
        ),
        // Not a DI provider either: one per process, replaceable in tests.
        @Optional()
        private readonly kept: LiveReadCache<PublicTimetable> = new LiveReadCache(
            TIMETABLE_KEPT_MS,
        ),
    ) {}

    /**
     * What a visitor sees: one week per site and choice of classes, at
     * most {@link TIMETABLE_KEPT_MS} old. A place taken in that window may
     * still count as free until the next read, and booking the last one
     * twice is refused honestly by the booking. A week is worked out again
     * sooner when its first day is over or its first session has begun.
     */
    async read(
        siteId: string,
        serviceIds: readonly string[],
        callerHash: string | undefined,
        now: Date = new Date(),
    ): Promise<PublicTimetable> {
        if (!this.limiter.take(callerHash ?? `site:${siteId}`)) {
            throw new HttpException(
                "Too many requests. Try again shortly.",
                429,
            );
        }
        return this.kept.get(
            timetableKey(siteId, serviceIds),
            () => this.workOut(siteId, serviceIds, now),
            now.getTime(),
            weekStillTrue,
        );
    }

    /**
     * How much longer a shared cache may keep this week: what is left of
     * the window, and never past its first session or midnight.
     */
    secondsLeft(
        siteId: string,
        serviceIds: readonly string[],
        week: PublicTimetable,
        now: Date = new Date(),
    ): number {
        const at = now.getTime();
        return Math.min(
            this.kept.secondsLeft(timetableKey(siteId, serviceIds), at),
            secondsUntil(
                at,
                week.sessions.map((s) => new Date(s.startAt).getTime()),
                week.timezone,
            ),
        );
    }

    private async workOut(
        siteId: string,
        serviceIds: readonly string[],
        now: Date,
    ): Promise<PublicTimetable> {
        const site = await prisma.site.findFirst({
            where: { id: siteId, deletedAt: null },
            select: { organizationId: true },
        });
        if (!site) notFound();
        const { organizationId } = site;

        return runInOrgContext(organizationId, async () => {
            const zone = await businessTimezone(prisma, organizationId);
            const first = DateTime.fromJSDate(now, { zone }).startOf("day");
            const days = Array.from(
                { length: TIMETABLE_DAYS },
                (_, i) => first.plus({ days: i }).toISODate() ?? "",
            );
            const open = await appointmentsOpen(organizationId);
            const found = open
                ? await prisma.service.findMany({
                      where: {
                          ...offeredOnSite(organizationId, siteId),
                          // A class: more than one place (U19's rule).
                          capacity: { gt: 1 },
                          ...(serviceIds.length > 0
                              ? { id: { in: [...serviceIds] } }
                              : {}),
                      },
                      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
                      select: {
                          id: true,
                          name: true,
                          durationMinutes: true,
                          priceCents: true,
                          currency: true,
                          gstRate: true,
                          gstPriceMode: true,
                      },
                  })
                : [];
            // Each row's price as the services list says it (DEC-172 U7).
            const terms =
                found.length > 0
                    ? await loadPriceTerms(prisma, organizationId)
                    : null;
            const classes: ClassRow[] = found.map((row) => ({
                id: row.id,
                name: row.name,
                durationMinutes: row.durationMinutes,
                priceCents: row.priceCents,
                currency: row.currency,
                gst: terms ? serviceCharge(row, terms).gst : null,
            }));

            // A class the booking page would refuse (no one takes it, say)
            // leaves the timetable without it, not without the week. The
            // business's own reads are made once for every class.
            const once = onceReads();
            const rows = (
                await Promise.all(
                    classes.map((service) =>
                        publicDays(service.id, now, TIMETABLE_DAYS, {
                            once,
                        }).then(
                            (week) => timetableRows(service, week),
                            () => [] as TimetableSession[],
                        ),
                    ),
                )
            ).flat();

            return { timezone: zone, days, sessions: sortSessions(rows) };
        });
    }
}

/** The same classes in any order are one question. */
function timetableKey(siteId: string, serviceIds: readonly string[]): string {
    return `${siteId}|${[...serviceIds].sort().join(",")}`;
}

/**
 * Whether a kept week is still true at `now`: it still starts today, and
 * none of its sessions has begun.
 */
export function weekStillTrue(week: PublicTimetable, now: number): boolean {
    const today = DateTime.fromMillis(now, { zone: week.timezone }).toISODate();
    if (week.days[0] !== today) return false;
    return !week.sessions.some((s) => new Date(s.startAt).getTime() <= now);
}
