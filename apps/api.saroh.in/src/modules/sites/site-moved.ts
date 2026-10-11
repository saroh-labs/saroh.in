import { HttpException, NotFoundException } from "@nestjs/common";
import type { Prisma } from "@saroh/database";
import { prisma } from "@saroh/database";

import { FixedWindowRateLimiter } from "../bookings/rate-limiter";
import { publicSiteOnline } from "../organizations/organization-lifecycle.policy";
import { platformOrigin } from "./site-origin";

/**
 * Where an old web address forwards to (DEC-069, plan L2 and L3).
 *
 * After a change of address the old one is held for the business in
 * `AddressReservation` and, while `redirectUntil` lasts, forwards to the site
 * it served. The renderer asks here only when a host has no live site
 * (KTD-5), and answers the visitor with a 307 to the same path on `to`.
 *
 * Read outside any business's context, like the renderer's other host
 * lookups (`Site.subdomain`, `Domain.hostname`): the visitor names only a
 * host. A live row isn't a secret — anyone could follow the redirect — so
 * the answer carries nothing but the new origin.
 */

/** What the renderer gets for a moved address. */
export interface SiteMoved {
    /** The site's origin now: its verified custom domain, else its address. */
    to: string;
}

// As generous as the other public site reads (`public-visit.service.ts`):
// the renderer asks once per miss, and a limit only slows a scraper down.
const READS_PER_WINDOW = 120;
const READ_WINDOW_MS = 60_000;

const defaultLimiter = new FixedWindowRateLimiter(
    READS_PER_WINDOW,
    READ_WINDOW_MS,
);

type Db = Pick<Prisma.TransactionClient, "addressReservation" | "domain">;

/**
 * `{ to }` while `address` forwards: a row whose `redirectUntil` is still
 * ahead, naming a site that isn't deleted and still has somewhere to be
 * found (a custom domain or an address). Anything else is a 404, the same
 * one for an address that never existed, so the answer says nothing more.
 */
export async function siteMovedTo(
    raw: string,
    callerKey: string | undefined,
    opts: {
        limiter?: FixedWindowRateLimiter;
        now?: Date;
        db?: Db;
    } = {},
): Promise<SiteMoved> {
    const address = raw.trim().toLowerCase();
    const limiter = opts.limiter ?? defaultLimiter;
    if (!limiter.take(callerKey ?? `moved:${address}`)) {
        throw new HttpException("Too many requests. Try again shortly.", 429);
    }
    const db = opts.db ?? prisma;
    const now = opts.now ?? new Date();
    const row = await db.addressReservation.findUnique({
        where: { address },
        select: {
            redirectUntil: true,
            site: {
                select: {
                    id: true,
                    organizationId: true,
                    subdomain: true,
                    deletedAt: true,
                    organization: { select: { lifecycleStatus: true } },
                },
            },
        },
    });
    const site = row?.site;
    if (!row?.redirectUntil || row.redirectUntil <= now || !site) notFound();
    if (site.deletedAt) notFound();
    // Offline with its business (#921): an old address leads nowhere.
    if (!publicSiteOnline(site.organization.lifecycleStatus)) notFound();

    const domain = await db.domain.findFirst({
        where: {
            organizationId: site.organizationId,
            siteId: site.id,
            status: "VERIFIED",
        },
        orderBy: { verifiedAt: "asc" },
        select: { hostname: true },
    });
    if (domain) return { to: `https://${domain.hostname}` };
    // Never forward an address to itself: a site whose address is this one
    // again would loop (a change back deletes the row, but be sure).
    if (!site.subdomain || site.subdomain === address) notFound();
    return { to: platformOrigin(site.subdomain) };
}

function notFound(): never {
    throw new NotFoundException("This address hasn't moved");
}
