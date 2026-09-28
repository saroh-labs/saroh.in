import type { prisma } from "@saroh/database";

import type { HomeReviewPage, HomeReviewSite } from "./home-model";
import { personName } from "./home-model";

/**
 * A Reviewer's Home (round 2, F9): the sites they were asked to review, the
 * pages on each, and the notes still open — and nothing else.
 *
 * A Reviewer is brought in to look at named sites (#276), so this reads only
 * what `SiteReviewer` grants them and never another source: no module
 * readiness, no orders, bookings or money, and no site they weren't given.
 * The grant is the whole of the scope, as `reviewerScope` makes it for every
 * other site read.
 */

type Db = typeof prisma;

/** How many pages a site lists on Home before "N more pages". */
export const REVIEW_PAGE_LIMIT = 5;

/** The verdicts that say where a review stands; BYPASSED is publish's own. */
const VERDICTS = ["REQUESTED", "APPROVED", "CHANGES_REQUESTED"];

/**
 * The sites `userId` may review in `organizationId`, oldest grant first,
 * each with its visible pages (home first), who asked for the review and
 * when while it waits on them, and the notes still open.
 */
export async function readReviews(
    db: Db,
    organizationId: string,
    userId: string,
): Promise<HomeReviewSite[]> {
    const grants = await db.siteReviewer.findMany({
        where: {
            organizationId,
            userId,
            // The site must be this business's and not deleted: a grant
            // is never a way to see anything else.
            site: { organizationId, deletedAt: null },
        },
        orderBy: { createdAt: "asc" },
        select: {
            site: {
                select: {
                    id: true,
                    name: true,
                    subdomain: true,
                    currentPublicationId: true,
                    pages: {
                        // Hidden pages are left out of what goes live, so
                        // they aren't what anyone is asked to read.
                        where: { hidden: false },
                        orderBy: [{ isHome: "desc" }, { path: "asc" }],
                        select: { id: true, title: true, path: true },
                    },
                },
            },
        },
    });
    if (grants.length === 0) return [];
    const siteIds = grants.map((g) => g.site.id);

    const [latest, notes] = await Promise.all([
        // The newest verdict per site: a REQUESTED one nobody has answered
        // is a review waiting on them (the Review tab's "In review").
        db.siteApproval.findMany({
            where: {
                organizationId,
                siteId: { in: siteIds },
                outcome: { in: VERDICTS },
            },
            orderBy: { createdAt: "desc" },
            distinct: ["siteId"],
            select: {
                siteId: true,
                outcome: true,
                createdAt: true,
                by: { select: { name: true, email: true } },
            },
        }),
        db.siteComment.groupBy({
            by: ["siteId", "pageId"],
            where: {
                organizationId,
                siteId: { in: siteIds },
                resolvedAt: null,
            },
            _count: { _all: true },
        }),
    ]);

    const asked = new Map(latest.map((row) => [row.siteId, row]));
    const open = new Map<string, number>();
    for (const row of notes) {
        const n = row._count._all;
        open.set(row.siteId, (open.get(row.siteId) ?? 0) + n);
        if (row.pageId) open.set(`${row.siteId}:${row.pageId}`, n);
    }

    return grants.map(({ site }) => {
        const href = `/sites/${site.id}/review`;
        const request = asked.get(site.id);
        const waiting = request?.outcome === "REQUESTED";
        const pages: HomeReviewPage[] = site.pages
            .slice(0, REVIEW_PAGE_LIMIT)
            .map((page) => ({
                id: page.id,
                title: page.title.trim() || page.path,
                path: page.path,
                openNotes: open.get(`${site.id}:${page.id}`) ?? 0,
                href: `${href}?page=${encodeURIComponent(page.id)}`,
            }));
        return {
            id: site.id,
            name: site.name.trim() || "Untitled site",
            href,
            requestedBy: waiting
                ? personName({
                      firstName: request.by.name,
                      email: request.by.email,
                  })
                : null,
            requestedAt: waiting ? request.createdAt.toISOString() : null,
            openNotes: open.get(site.id) ?? 0,
            pages,
            pageCount: site.pages.length,
            subdomain: site.subdomain,
            live: site.currentPublicationId !== null,
        };
    });
}
