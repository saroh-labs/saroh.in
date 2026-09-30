import { BadRequestException, NotFoundException } from "@nestjs/common";
import type { PageKind, Prisma } from "@saroh/database";
import { prisma } from "@saroh/database";
import type { TemplateContext } from "@saroh/templates";

import type { OrganizationContext } from "../../common/types/organization-context";
import { reservedAgainst, reservedPathFor } from "./page-kinds";

/**
 * Tenancy guards and write plumbing shared by every sites surface.
 *
 * These were five private methods on SitesService that never touched `this` —
 * the only state that class holds is the EntitlementService, used by exactly
 * one method. Which is why a 2,198-line service could not be split: four spec
 * files (sites-editing, sites-pages, sites-review, site-settings) already
 * describe the seams, but every candidate service needed assertSiteInOrg and
 * there was nowhere for it to live that was not the class itself.
 *
 * They belong together beyond that convenience. Each one is the same kind of
 * statement — this site is in this org, this page is in this site, this path is
 * free, this draft exists — and every org-scoped write must make it before
 * touching a row. Reading them in one file is how you check none is missing.
 */

// The reserved addresses live with the page kinds (pure, so the flag engine
// reads them without the database); re-exported here beside the guard that
// enforces them.
export {
    RESERVED_PAGE_PATHS,
    reservedAgainst,
    reservedPathFor,
} from "./page-kinds";

/** An address as a single lowercase, hyphenated segment, or "" for none. */
function pathSegment(text: string): string {
    const collapsed = text
        .toLowerCase()
        .normalize("NFKD")
        .replace(/[^a-z0-9\s-]/g, "")
        .trim()
        .replace(/[\s-]+/g, "-")
        .slice(0, 60);
    // Trimmed by index, as `slugify` in sites.service does (js/polynomial-redos).
    let start = 0;
    let end = collapsed.length;
    while (start < end && collapsed[start] === "-") start++;
    while (end > start && collapsed[end - 1] === "-") end--;
    return collapsed.slice(start, end);
}

/**
 * A free address to offer instead of one that is taken or reserved: the
 * first of `candidates` no page holds and no route owns, else the last with
 * a number after it. Suggested, never applied: the merchant picks.
 */
export async function suggestFreePath(
    siteId: string,
    candidates: readonly string[],
): Promise<string> {
    const taken = new Set(
        (
            await prisma.page.findMany({
                where: { siteId },
                select: { path: true },
            })
        ).map((p) => p.path),
    );
    const usable = (p: string) =>
        p.length > 1 && !taken.has(p) && reservedPathFor(p) === null;
    const tried = candidates.filter((c) => c.startsWith("/") && c.length > 1);
    const found = tried.find(usable);
    if (found) return found;
    const base = tried[tried.length - 1] ?? "/page";
    for (let n = 2; n < 100; n++) {
        if (usable(`${base}-${n}`)) return `${base}-${n}`;
    }
    return `${base}-${Date.now().toString(36)}`;
}

/**
 * Refuse an address a page of `kind` can't have on this site: one another
 * page holds, or one a route owns (G14). Each refusal says what the address
 * is for, and offers another in `details.suggestion`.
 *
 * `title` is the page's, so the suggestion for a page reads like it
 * ("Book a walkthrough" → /book-a-walkthrough); `alternatives` are addresses
 * to offer first (a Contact page's /contact-us).
 */
export async function assertPathIsFree(
    siteId: string,
    path: string,
    options: {
        kind?: PageKind;
        title?: string;
        alternatives?: readonly string[];
    } = {},
) {
    const kind = options.kind ?? "FREE";
    const fromTitle = options.title ? `/${pathSegment(options.title)}` : "";
    const reserved = reservedPathFor(path);
    if (reserved && reservedAgainst(path, kind)) {
        const rest = path.slice(reserved.root.length);
        const suggestion = await suggestFreePath(siteId, [
            ...(options.alternatives ?? []),
            fromTitle,
            rest,
            `${reserved.root}-info`,
        ]);
        throw new BadRequestException({
            message: `${reserved.root} is ${reserved.purpose}, so a page can't use ${path}. Pick another path, such as ${suggestion}.`,
            details: { field: "path", reason: "reserved", suggestion },
        });
    }
    const clash = await prisma.page.findFirst({
        where: { siteId, path },
        select: { title: true },
    });
    if (clash) {
        const suggestion = await suggestFreePath(siteId, [
            ...(options.alternatives ?? []),
            fromTitle,
            path,
        ]);
        throw new BadRequestException({
            message: `The path ${path} is already used by "${clash.title}". Pick another path, such as ${suggestion}.`,
            details: { field: "path", reason: "taken", suggestion },
        });
    }
}

/**
 * The extra condition a REVIEWER's site lookups carry (#276).
 *
 * REVIEWER holds org-wide `site:read` — the policy has no way to say "this
 * site" — so without this a reviewer invited to look at one page could list
 * every site the business has, read every publication and every draft note.
 * `SiteReviewer` is what narrows the role to what was actually asked of them.
 *
 * Spread into the `where` of every site lookup rather than enforced in a guard:
 * `listSites` and several services query Site directly, so a guard would be
 * something to forget. An empty object for every other role, so this costs
 * them nothing.
 *
 * A site with no grant does not 403, it 404s — the reviewer is not told which
 * other sites exist.
 */
export function reviewerScope(ctx: OrganizationContext): {
    reviewers?: { some: { userId: string } };
} {
    return ctx.role === "REVIEWER"
        ? { reviewers: { some: { userId: ctx.userId } } }
        : {};
}

export async function assertSiteInOrg(
    ctx: OrganizationContext,
    siteId: string,
): Promise<{ id: string; currentPublicationId: string | null }> {
    const site = await prisma.site.findFirst({
        where: {
            id: siteId,
            organizationId: ctx.organizationId,
            deletedAt: null,
            ...reviewerScope(ctx),
        },
        // Returns the row it already had to fetch. Callers that only need
        // the guard ignore it; version history needs to know which
        // publication is live, and a second query for a column this one
        // already read would be waste.
        select: { id: true, currentPublicationId: true },
    });
    if (!site) {
        throw new NotFoundException(`Site "${siteId}" not found`);
    }
    return site;
}

/** Prove `pageId` belongs to `siteId` in the ctx org, or 404. */
export async function assertPageInSite(
    ctx: OrganizationContext,
    siteId: string,
    pageId: string,
): Promise<void> {
    const page = await prisma.page.findFirst({
        where: {
            id: pageId,
            siteId,
            organizationId: ctx.organizationId,
        },
        select: { id: true },
    });
    if (!page) {
        throw new NotFoundException(`Page "${pageId}" not found`);
    }
}

/**
 * Get the page's latest DRAFT PageVersion, creating an empty one if none
 * exists. Takes a Prisma client/transaction so callers can run it inside a
 * write transaction. The caller must already have proven the page belongs
 * to the ctx org.
 */
export async function getOrCreateDraftVersion(
    client: Prisma.TransactionClient,
    ctx: OrganizationContext,
    pageId: string,
): Promise<{ id: string; revision: number }> {
    const existing = await client.pageVersion.findFirst({
        where: {
            pageId,
            organizationId: ctx.organizationId,
            status: "DRAFT",
        },
        orderBy: { createdAt: "desc" },
        // The revision travels with the id (#285): every caller that writes
        // sections has to check it, and one that had to ask separately could
        // read it outside the transaction that guards it.
        select: { id: true, revision: true },
    });
    if (existing) {
        return existing;
    }
    return client.pageVersion.create({
        data: {
            pageId,
            organizationId: ctx.organizationId,
            status: "DRAFT",
            createdByUserId: ctx.userId,
        },
        select: { id: true, revision: true },
    });
}

/**
 * Build the {@link TemplateContext} from the org's name + optional business
 * profile (S1-004). Only fields the profile actually carries are mapped;
 * `tagline`/`description` have no profile column yet, so builders fall back
 * to name-derived defaults.
 */
export async function buildTemplateContext(
    organizationId: string,
): Promise<TemplateContext> {
    const org = await prisma.organization.findUnique({
        where: { id: organizationId },
        select: {
            name: true,
            businessProfile: {
                select: {
                    legalName: true,
                    contactEmail: true,
                    website: true,
                },
            },
        },
    });
    if (!org) {
        // The guard proved membership in this org, so it must exist; a miss
        // here is a real integrity fault, not a client error.
        throw new NotFoundException(
            `Organization "${organizationId}" not found`,
        );
    }
    const profile = org.businessProfile;
    return {
        organizationName: org.name,
        legalName: profile?.legalName ?? undefined,
        contactEmail: profile?.contactEmail ?? undefined,
        websiteUrl: profile?.website ?? undefined,
    };
}
