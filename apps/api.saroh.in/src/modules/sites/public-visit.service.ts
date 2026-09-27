import {
    HttpException,
    Injectable,
    NotFoundException,
    Optional,
} from "@nestjs/common";
import { prisma, runInOrgContext } from "@saroh/database";

import { FixedWindowRateLimiter } from "../bookings/rate-limiter";
import { businessTimezone } from "../bookings/staff-availability";

/**
 * The public read of a business's place (G8): what a site's Visit us block
 * shows, and what the booking page's header reuses (E6). The ONE copy, so the
 * two can never disagree about the public address, hours or phone.
 *
 * An explicit allow-list: a place's name, its address, the business's public
 * phone, the week and the time zone. Nothing about orders, stock, payments or
 * people ever leaves here.
 */
export interface PublicVisit {
    /** `storefront` — a SHOP storefront; `business` — the profile fallback. */
    source: "storefront" | "business";
    storeId: string | null;
    name: string;
    address: string | null;
    /**
     * The business's public phone. Always null today: no business record
     * keeps a public phone yet, and a number taken from anywhere else (a
     * contact email's owner, a member) would publish something the merchant
     * never offered. The Call button stays hidden until one exists.
     */
    phone: string | null;
    hours: PublicOpeningDay[] | null;
    /** The business's zone (DEC-033); India when none is set. */
    timezone: string;
}

type Weekday = "MON" | "TUE" | "WED" | "THU" | "FRI" | "SAT" | "SUN";

/** One day of the week as Settings › Hours writes it (DEC-034). */
export interface PublicOpeningDay {
    day: Weekday;
    open: string;
    close: string;
    closed: boolean;
}

const WEEKDAYS: readonly string[] = [
    "MON",
    "TUE",
    "WED",
    "THU",
    "FRI",
    "SAT",
    "SUN",
];
const CLOCK = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Page views per visitor per minute: a busy browse is fine, a scraper not. */
const READS_PER_WINDOW = 120;
const READ_WINDOW_MS = 60_000;

/** Every miss looks the same: unknown site, another business's store alike. */
function notFound(): never {
    throw new NotFoundException("Nothing to show here");
}

/**
 * The stored week, re-checked on the way out rather than trusted: the column
 * is JSON, and a malformed day would otherwise reach every visitor. Anything
 * that isn't seven-or-fewer well-formed days reads as "no hours saved" —
 * saying nothing beats saying something false.
 */
export function publicWeek(value: unknown): PublicOpeningDay[] | null {
    if (!Array.isArray(value) || value.length === 0) return null;
    const days: PublicOpeningDay[] = [];
    for (const raw of value as unknown[]) {
        if (typeof raw !== "object" || raw === null) return null;
        const d = raw as Record<string, unknown>;
        if (
            typeof d.day !== "string" ||
            !WEEKDAYS.includes(d.day) ||
            typeof d.open !== "string" ||
            !CLOCK.test(d.open) ||
            typeof d.close !== "string" ||
            !CLOCK.test(d.close) ||
            typeof d.closed !== "boolean"
        ) {
            return null;
        }
        days.push({
            day: d.day as Weekday,
            open: d.open,
            close: d.close,
            closed: d.closed,
        });
    }
    return days;
}

/** A stored address, or null when it says nothing. */
function said(value: string | null | undefined): string | null {
    const trimmed = value?.trim();
    return trimmed === undefined || trimmed === "" ? null : trimmed;
}

/** The registered address as lines: street, then city and postcode. */
export function registeredAddress(profile: {
    addressLine1: string | null;
    addressLine2: string | null;
    city: string | null;
    postalCode: string | null;
}): string | null {
    const town = [said(profile.city), said(profile.postalCode)]
        .filter((part) => part !== null)
        .join(" ");
    const lines = [
        said(profile.addressLine1),
        said(profile.addressLine2),
        said(town),
    ].filter((line) => line !== null);
    return lines.length > 0 ? lines.join("\n") : null;
}

/** A storefront that is a place a customer can walk into, and still open. */
const OPEN_SHOP = {
    deletedAt: null,
    settings: { is: { kind: "SHOP" } },
} as const;

/**
 * Serves one place for a site (G8), or the business's own facts when it has
 * no shop (E6).
 *
 * The Site is resolved FIRST and its organization derived from it; nothing
 * the caller sends names a business (backend-auth-and-access: "derive the
 * organization; never accept it"). Every later read runs in that
 * organization's RLS context, AND filters on it, so a store id from another
 * business is a 404 twice over. A site that is deleted is a 404. It need not
 * be published: a preview of a site not yet live shows its Visit us too, and
 * a place and its hours are what the business shows the public anyway.
 */
@Injectable()
export class PublicVisitService {
    constructor(
        // Not a DI provider — a per-instance default that tests can replace.
        @Optional()
        private readonly limiter: FixedWindowRateLimiter = new FixedWindowRateLimiter(
            READS_PER_WINDOW,
            READ_WINDOW_MS,
        ),
    ) {}

    /**
     * `storeId` given: that storefront, only while it belongs to the site's
     * business, is a SHOP and isn't closed. Omitted: the business's first
     * open SHOP, else the business profile — the registered address and the
     * business's hours.
     */
    async read(
        siteId: string,
        storeId: string | undefined,
        callerHash: string | undefined,
    ): Promise<PublicVisit> {
        // Keyed on the visitor, like the other public reads; a caller the
        // platform gives no address for shares one bucket per site.
        if (!this.limiter.take(callerHash ?? `site:${siteId}`)) {
            throw new HttpException(
                "Too many requests. Try again shortly.",
                429,
            );
        }
        const site = await prisma.site.findFirst({
            where: { id: siteId, deletedAt: null },
            select: {
                organizationId: true,
                organization: { select: { name: true } },
            },
        });
        if (!site) notFound();
        const { organizationId } = site;

        return runInOrgContext(organizationId, async () => {
            const timezone = await businessTimezone(prisma, organizationId);
            const shop = await prisma.store.findFirst({
                where: {
                    organizationId,
                    ...OPEN_SHOP,
                    ...(storeId === undefined ? {} : { id: storeId }),
                },
                orderBy: [{ createdAt: "asc" }, { id: "asc" }],
                select: {
                    id: true,
                    name: true,
                    settings: {
                        select: { address: true, openingHours: true },
                    },
                },
            });
            if (shop) {
                return {
                    source: "storefront",
                    storeId: shop.id,
                    name: shop.name,
                    address: said(shop.settings?.address),
                    phone: null,
                    hours: publicWeek(shop.settings?.openingHours),
                    timezone,
                };
            }
            // A named store that isn't this business's open shop: never
            // served, and never swapped for another place.
            if (storeId !== undefined) notFound();
            return this.business(
                organizationId,
                site.organization.name,
                timezone,
            );
        });
    }

    /**
     * No shop: the business's own facts. The hours are the business's week —
     * the first storefront's, which Settings › Hours writes to every
     * storefront (DEC-034), online ones included. No storefront at all: no
     * hours, rather than a guess.
     */
    private async business(
        organizationId: string,
        name: string,
        timezone: string,
    ): Promise<PublicVisit> {
        const [profile, first] = await Promise.all([
            prisma.businessProfile.findUnique({
                where: { organizationId },
                select: {
                    addressLine1: true,
                    addressLine2: true,
                    city: true,
                    postalCode: true,
                },
            }),
            prisma.store.findFirst({
                where: { organizationId, deletedAt: null },
                orderBy: [{ createdAt: "asc" }, { id: "asc" }],
                select: { settings: { select: { openingHours: true } } },
            }),
        ]);
        return {
            source: "business",
            storeId: null,
            name,
            address: profile ? registeredAddress(profile) : null,
            phone: null,
            hours: publicWeek(first?.settings?.openingHours),
            timezone,
        };
    }
}
