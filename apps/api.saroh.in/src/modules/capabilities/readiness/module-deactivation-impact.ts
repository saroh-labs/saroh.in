/**
 * What turning a module off touches, with real counts (round-2 F13, R12,
 * default 56). "Turn off Appointments?" answers "3 upcoming bookings stay
 * booked; the booking page stops taking new ones", read at the moment of
 * asking.
 *
 * Every sentence says only what ships. Each one was checked against the
 * code that acts when the module is off:
 * - Appointments: the booking page refuses new bookings (`appointmentsOpen`),
 *   and bookings already made are untouched.
 * - Class packs: new sales stop at the desk and online (`assertClassPacksOn`),
 *   a customer can't spend a pack online (`redeem-pack.ts`), and the team
 *   still can.
 * - Payments: renewals wait (`subscription-renew.handler.ts`), so nobody is
 *   charged; subscribing is refused; the site's plans 404
 *   (`paymentsOffered`); an invoice's pay link keeps working.
 * - Commerce: the site's shop, product pages and Product grid 404
 *   (`commerceOpen`), and checkout is refused.
 * - Website: nothing public reads the module, so a live site stays up as
 *   last published.
 * - A published Shop or Book page leaves the live site's menu, and its
 *   address says it isn't available, while its module is off (G15, G19:
 *   `publicModulePageStates` on every public read). The line names the
 *   page by its title, which is also its menu name.
 * - The account area's tabs follow the module (`account-home.service.ts`),
 *   and only while the area itself is on (`SITE_ACCOUNT_AREA`).
 *
 * Counts respect the viewer: a count is read only for someone who may read
 * what it counts, and otherwise the line says what stops without a number,
 * or is left out. A count that fails to read says it couldn't count; it is
 * never shown as zero, and it never stops the module going off (only a
 * deactivation blocker does).
 */
import type { prisma } from "@saroh/database";

import type { OrgAction } from "../../organizations/organization-actions";
import { accountAreaOn } from "../../site-accounts/account-area";
import { shopRolloutOn } from "../../sites/sells-from";
import { PLANS_ON_SALE } from "../../subscriptions/plan-on-sale";
import type { ModuleKey } from "../module-registry";
import type {
    DeactivationImpactItem,
    ReadinessInput,
} from "./module-readiness.port";

type Db = typeof prisma;

/** What a line read: a number, and the names behind it when there are few. */
export interface Counted {
    count: number;
    names?: string[];
}

/**
 * One line of the confirm. `say` gets:
 * - the count, when it was read;
 * - `null`, when reading it failed;
 * - `undefined`, when there is nothing to count or the viewer may not read it.
 * It returns null to leave the line out.
 */
interface ImpactLine {
    code: string;
    /** Any one of these lets the viewer see the number. Empty: nothing to count. */
    reads: readonly OrgAction[];
    /** Whether the line applies at all (the account area, the shop). */
    applies?: (organizationId: string) => boolean | Promise<boolean>;
    read?: (db: Db, organizationId: string, now: Date) => Promise<Counted>;
    say: (counted: Counted | null | undefined) => string | null;
}

/** "1 upcoming booking" / "3 upcoming bookings". */
function n(count: number, one: string, many: string): string {
    return `${count} ${count === 1 ? one : many}`;
}

/** "Hill Road" / "Hill Road and Online". */
function names(list: readonly string[]): string {
    if (list.length <= 1) return list[0] ?? "";
    return `${list.slice(0, -1).join(", ")} and ${list[list.length - 1]}`;
}

async function counted(p: Promise<number>): Promise<Counted> {
    return { count: await p };
}

/** A site the public can see: not deleted, and published at least once. */
const LIVE_SITE = { deletedAt: null, currentPublicationId: { not: null } };

/**
 * The live title of a published module page of `kind`, or null when the
 * snapshot has none. A blank title reads as the kind's own word.
 */
function modulePageTitle(
    snapshot: unknown,
    kind: string,
    fallback: string,
): string | null {
    const pages = (snapshot as { pages?: unknown } | null)?.pages;
    if (!Array.isArray(pages)) return null;
    for (const entry of pages) {
        const page = entry as { kind?: unknown; title?: unknown } | null;
        if (page?.kind !== kind) continue;
        const title = typeof page.title === "string" ? page.title.trim() : "";
        return title === "" ? fallback : title;
    }
    return null;
}

/**
 * The live sites that publish a module page of `kind` (G19), with the
 * pages' titles: what leaves the site's menu when the module goes off.
 * Read from each site's current publication, which is what the public sees.
 */
async function liveModulePages(
    db: Db,
    organizationId: string,
    kind: string,
    fallback: string,
): Promise<Counted> {
    const sites = await db.site.findMany({
        where: { organizationId, ...LIVE_SITE },
        select: { currentPublication: { select: { snapshot: true } } },
    });
    const titles: string[] = [];
    let count = 0;
    for (const site of sites) {
        const title = modulePageTitle(
            site.currentPublication?.snapshot,
            kind,
            fallback,
        );
        if (title === null) continue;
        count += 1;
        if (!titles.includes(title)) titles.push(title);
    }
    return { count, names: titles };
}

/** "Your website stops showing Shop." — the module page leaving the site. */
function stopsShowing(fallback: string) {
    return (c: Counted | null | undefined): string | null => {
        if (c === undefined) return null;
        if (c === null)
            return `We couldn't check your website. If it has a ${fallback} page, it stops showing.`;
        if (c.count === 0) return null;
        const shown = c.names?.length ? names(c.names) : fallback;
        return c.count === 1
            ? `Your website stops showing ${shown}.`
            : `Your ${c.count} websites stop showing ${shown}.`;
    };
}

const LINES: Partial<Record<ModuleKey, readonly ImpactLine[]>> = {
    APPOINTMENTS: [
        {
            code: "APPOINTMENTS_UPCOMING_BOOKINGS",
            reads: ["booking:read"],
            read: (db, organizationId, now) =>
                counted(
                    db.booking.count({
                        where: {
                            organizationId,
                            startAt: { gt: now },
                            OR: [
                                { status: "CONFIRMED" },
                                // A pay-now hold still holding its place.
                                {
                                    status: "PENDING",
                                    holdExpiresAt: { gt: now },
                                },
                            ],
                        },
                    }),
                ),
            say: (c) => {
                if (c === undefined)
                    return "Bookings already made stay booked; the booking page stops taking new ones.";
                if (c === null)
                    return "We couldn't count your upcoming bookings. They stay booked; the booking page stops taking new ones.";
                if (c.count === 0)
                    return "The booking page stops taking new bookings.";
                return `${n(c.count, "upcoming booking stays", "upcoming bookings stay")} booked; the booking page stops taking new ones.`;
            },
        },
        {
            code: "APPOINTMENTS_SITE_BOOK_PAGE",
            reads: ["site:read"],
            read: (db, organizationId) =>
                liveModulePages(db, organizationId, "BOOK", "Book"),
            say: stopsShowing("Book"),
        },
        {
            code: "APPOINTMENTS_ACCOUNT_TAB",
            reads: [],
            applies: () => accountAreaOn(),
            say: () =>
                "Your customers' accounts on your site lose their Bookings tab.",
        },
    ],
    COURSES: [
        {
            code: "COURSES_ENROLMENTS",
            reads: ["course:read"],
            read: (db, organizationId) =>
                counted(
                    db.courseEnrollment.count({
                        where: { organizationId, status: "ACTIVE" },
                    }),
                ),
            say: (c) => {
                if (c === undefined)
                    return "Everyone enrolled keeps their seat and booked sessions.";
                if (c === null)
                    return "We couldn't count your enrolments. Everyone enrolled keeps their seat and booked sessions.";
                if (c.count === 0) return null;
                return `${n(c.count, "enrolment keeps its", "enrolments keep their")} seat and booked sessions.`;
            },
        },
    ],
    CLASS_PACKS: [
        {
            code: "CLASS_PACKS_CREDITS_LEFT",
            reads: ["pack:read"],
            read: async (db, organizationId, now) => {
                const live = await db.packPurchase.findMany({
                    where: { organizationId, expiresAt: { gt: now } },
                    select: {
                        credits: true,
                        _count: {
                            select: {
                                redemptions: { where: { reversedAt: null } },
                            },
                        },
                    },
                });
                return {
                    count: live.filter((p) => p.credits > p._count.redemptions)
                        .length,
                };
            },
            say: (c) => {
                const stops =
                    "New packs stop selling, and customers can't use theirs online.";
                if (c === undefined)
                    return `Packs already sold keep their classes, and your team can still use them at the desk. ${stops}`;
                if (c === null)
                    return `We couldn't count the packs with classes left. They keep them, and your team can still use them at the desk. ${stops}`;
                if (c.count === 0)
                    return "Packs stop selling, online and at the desk.";
                return `${n(c.count, "pack", "packs")} with classes left keep them, and your team can still use them at the desk. ${stops}`;
            },
        },
    ],
    PAYMENTS: [
        {
            code: "PAYMENTS_LIVE_SUBSCRIPTIONS",
            reads: ["subscription:read"],
            read: (db, organizationId) =>
                counted(
                    db.customerSubscription.count({
                        where: {
                            organizationId,
                            status: "ACTIVE",
                            cancelAtPeriodEnd: false,
                        },
                    }),
                ),
            say: (c) => {
                if (c === undefined)
                    return "Live subscriptions stop renewing until it's back on. Nobody is charged in between.";
                if (c === null)
                    return "We couldn't count your live subscriptions. Any that are live stop renewing until it's back on; nobody is charged in between.";
                if (c.count === 0) return null;
                return `${n(c.count, "live subscription stops", "live subscriptions stop")} renewing until it's back on. Nobody is charged in between.`;
            },
        },
        {
            code: "PAYMENTS_AUTOPAY",
            reads: ["subscription:read"],
            read: (db, organizationId) =>
                counted(
                    db.paymentMandate.count({
                        where: { organizationId, status: "ACTIVE" },
                    }),
                ),
            say: (c) => {
                if (c === undefined) return null;
                if (c === null)
                    return "We couldn't count the subscriptions on autopay. Autopay stays set up and takes nothing until it's back on.";
                if (c.count === 0) return null;
                return `Autopay stays set up on ${n(c.count, "subscription", "subscriptions")}, and takes nothing until it's back on.`;
            },
        },
        {
            code: "PAYMENTS_UNPAID_INVOICES",
            reads: ["invoice:read"],
            read: (db, organizationId) =>
                counted(
                    db.invoice.count({
                        where: {
                            organizationId,
                            status: "ISSUED",
                            kind: "INVOICE",
                        },
                    }),
                ),
            say: (c) => {
                if (c === undefined) return null;
                if (c === null)
                    return "We couldn't count your unpaid invoices. They stay open, and their pay links still work.";
                if (c.count === 0) return null;
                return `${n(c.count, "unpaid invoice stays", "unpaid invoices stay")} open, and ${c.count === 1 ? "its pay link still works" : "their pay links still work"}.`;
            },
        },
        {
            code: "PAYMENTS_SITE_PLANS",
            reads: ["subscription:read"],
            read: async (db, organizationId) => {
                const live = await db.site.count({
                    where: { organizationId, ...LIVE_SITE },
                });
                if (live === 0) return { count: 0 };
                return counted(
                    db.subscriptionPlan.count({
                        where: { organizationId, ...PLANS_ON_SALE },
                    }),
                );
            },
            say: (c) => {
                if (c === undefined) return null;
                if (c === null)
                    return "We couldn't check the plans on your site. Any it shows stop showing, and nobody new can subscribe.";
                if (c.count === 0) return null;
                return `Your site stops showing your ${n(c.count, "plan", "plans")}, and nobody new can subscribe.`;
            },
        },
    ],
    COMMERCE: [
        {
            code: "COMMERCE_STOREFRONTS",
            reads: ["store:read"],
            read: async (db, organizationId) => {
                const where = { organizationId, deletedAt: null };
                const [count, few] = await Promise.all([
                    db.store.count({ where }),
                    db.store.findMany({
                        where,
                        select: { name: true },
                        orderBy: { createdAt: "asc" },
                        take: 2,
                    }),
                ]);
                return {
                    count,
                    names: count <= 2 ? few.map((s) => s.name) : undefined,
                };
            },
            say: (c) => {
                if (c === undefined)
                    return "Your storefronts stop taking orders.";
                if (c === null)
                    return "We couldn't read your storefronts. They stop taking orders.";
                if (c.count === 0) return null;
                if (c.names?.length === c.count)
                    return `${names(c.names)} ${c.count === 1 ? "stops" : "stop"} taking orders.`;
                return `Your ${c.count} storefronts stop taking orders.`;
            },
        },
        {
            code: "COMMERCE_PUBLISHED_PRODUCTS",
            reads: ["store:read"],
            read: (db, organizationId) =>
                counted(
                    db.product.count({
                        where: { organizationId, status: "PUBLISHED" },
                    }),
                ),
            say: (c) => {
                if (c === undefined) return null;
                if (c === null)
                    return "We couldn't count your published products. They stop selling.";
                if (c.count === 0) return null;
                return `${n(c.count, "published product stops", "published products stop")} selling.`;
            },
        },
        {
            code: "COMMERCE_SITE_SHOP",
            reads: ["site:read"],
            applies: (organizationId) => shopRolloutOn(organizationId),
            read: (db, organizationId) =>
                counted(
                    db.site.count({
                        where: {
                            organizationId,
                            ...LIVE_SITE,
                            storefrontId: { not: null },
                        },
                    }),
                ),
            say: (c) => {
                if (c === undefined) return null;
                if (c === null)
                    return "We couldn't check your site's shop. If it has one, the shop, product pages and Product grid stop showing.";
                if (c.count === 0) return null;
                if (c.count === 1)
                    return "Your site's shop, product pages and Product grid stop showing.";
                return `The shop, product pages and Product grid stop showing on ${c.count} sites.`;
            },
        },
        {
            code: "COMMERCE_SITE_SHOP_PAGE",
            reads: ["site:read"],
            // A Shop page exists only once the shop is rolled out (DEC-057).
            applies: (organizationId) => shopRolloutOn(organizationId),
            read: (db, organizationId) =>
                liveModulePages(db, organizationId, "SHOP", "Shop"),
            say: stopsShowing("Shop"),
        },
        {
            code: "COMMERCE_ACCOUNT_TAB",
            reads: [],
            applies: () => accountAreaOn(),
            say: () =>
                "Your customers' accounts on your site lose their Orders tab.",
        },
    ],
    WEBSITE: [
        {
            code: "WEBSITE_LIVE_SITES",
            reads: ["site:read"],
            read: (db, organizationId) =>
                counted(
                    db.site.count({ where: { organizationId, ...LIVE_SITE } }),
                ),
            say: (c) => {
                if (c === undefined) return null;
                if (c === null)
                    return "We couldn't count your live sites. Any that are live stay up as last published.";
                if (c.count === 0) return null;
                if (c.count === 1)
                    return "Your live site stays up as last published; changes wait until it's back on.";
                return `Your ${c.count} live sites stay up as last published; changes wait until it's back on.`;
            },
        },
    ],
};

/** The codes a module's confirm can say, for tests and the app. */
export function impactCodes(key: ModuleKey): string[] {
    return (LINES[key] ?? []).map((l) => l.code);
}

/**
 * Read one module's lines. Lines are read side by side, and each fails on
 * its own: a failed count becomes its "couldn't count" sentence and never
 * takes another line, or the whole confirm, down with it.
 */
export async function deactivationImpactOf(
    db: Db,
    key: ModuleKey,
    input: ReadinessInput,
    now: Date = new Date(),
): Promise<DeactivationImpactItem[]> {
    const may = input.may ?? (() => true);
    const lines = await Promise.all(
        (LINES[key] ?? []).map(async (line) => {
            try {
                if (line.applies && !(await line.applies(input.organizationId)))
                    return null;
            } catch {
                // Not knowing whether a line applies: leave it out rather
                // than claim something that may not be true.
                return null;
            }
            const permitted =
                line.reads.length > 0 && line.reads.some((a) => may(a));
            let got: Counted | null | undefined;
            if (line.read && permitted) {
                try {
                    got = await line.read(db, input.organizationId, now);
                } catch {
                    got = null;
                }
            }
            const message = line.say(got);
            if (!message) return null;
            const item: DeactivationImpactItem = {
                code: line.code,
                moduleKey: key,
                message,
            };
            if (line.read && permitted) item.count = got ? got.count : null;
            return item;
        }),
    );
    return lines.filter((l): l is DeactivationImpactItem => l !== null);
}
