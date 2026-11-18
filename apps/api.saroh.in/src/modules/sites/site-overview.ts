import { Injectable, NotFoundException } from "@nestjs/common";
import { prisma } from "@saroh/database";
import { DateTime } from "luxon";

import type { OrganizationContext } from "../../common/types/organization-context";
import {
    ENQUIRY_SUBMITTED_TYPE,
    SITE_PAID_TYPE,
    SITE_STARTED_TYPE,
    SITE_VISIT_TYPE,
} from "../analytics/event-contract";
import { periodWindows } from "../analytics/period";
import { AuditAction } from "../audit/audit.service";
import { businessTimezone } from "../bookings/staff-availability";
import { allows, authorize } from "../organizations/organization-policy";
import { modulePageState } from "./module-pages";
import type { PageHealth } from "./page-health";
import { pageHealth } from "./page-health";
import { reviewerScope } from "./site-access";

/**
 * A site's Overview (plan 2026-11-18-001 U4): what it brought in over the
 * last 7 days, what needs doing, and what happened to it lately. Also the
 * two lines All sites shows on each card (`siteCardExtras`).
 *
 * Results are read from the daily rollups (DEC-075) for the business's last
 * 7 days, its own calendar, the way Insights reads them (`sources.service`),
 * so the two say the same numbers. A part whose module is off is left out
 * (A3), never shown as 0.
 */

/** Rows shown in Activity. */
export const ACTIVITY_LIMIT = 8;

export interface OverviewResults {
    /** The 7 days, `2026-11-10` to `2026-11-16`, in the business's zone. */
    from: string;
    to: string;
    days: { date: string; visits: number }[];
    visits: number;
    questions: number;
    /** A checkout opened; null when neither bookings nor the shop is on. */
    started: number | null;
    /** Paid online on the site; null when neither is on. */
    paid: number | null;
    /** What the site takes, for the words ("bookings started", "orders"). */
    sells: { bookings: boolean; shop: boolean };
}

export type ActivityKind =
    | "published"
    | "restored"
    | "test_link_live"
    | "post_published"
    | "page_settings"
    | "saved"
    | "approval_on"
    | "approval_off"
    | "look_updated"
    | "draft_rolled_back";

export interface ActivityEntry {
    kind: ActivityKind;
    at: string;
    /** Who, by name; null when nobody is recorded (A4: earlier changes). */
    by: string | null;
    /** A post's or page's title, for the kinds that are about one. */
    subject: string | null;
}

export interface SiteOverview {
    /** Null for someone who may not read Insights (`analytics:read`). */
    results: OverviewResults | null;
    needsDoing: PageHealth[];
    activity: ActivityEntry[];
    lastPublished: { at: string; by: string | null } | null;
}

/** All sites' card: visits and the last thing done (U3's `SiteSummary`). */
export interface SiteCardExtras {
    visitsLast7Days: number | null;
    lastActivity: {
        kind: "edited" | "published";
        by: string | null;
        at: string;
    } | null;
}

const AUDIT_KINDS: Partial<Record<string, ActivityKind>> = {
    [AuditAction.SitePublishApprovalOn]: "approval_on",
    [AuditAction.SitePublishApprovalOff]: "approval_off",
    [AuditAction.SiteTemplateUpgrade]: "look_updated",
    [AuditAction.SiteDraftRolledBack]: "draft_rolled_back",
};

const RESULT_TYPES = [
    SITE_VISIT_TYPE,
    SITE_STARTED_TYPE,
    ENQUIRY_SUBMITTED_TYPE,
    SITE_PAID_TYPE,
];

/** The rollups are kept by UTC day: the window's first and last days. */
function dayBounds(w: { fromDate: string; toDate: string }) {
    return {
        gte: new Date(`${w.fromDate}T00:00:00Z`),
        lte: new Date(`${w.toDate}T00:00:00Z`),
    };
}

/** Fold the rollup totals into the results line. Pure. */
export function foldResults(
    rows: readonly { date: Date; type: string; count: number }[],
    window: { fromDate: string; toDate: string },
    sells: { bookings: boolean; shop: boolean },
): OverviewResults {
    const start = DateTime.fromISO(window.fromDate, { zone: "utc" });
    const days = Array.from({ length: 7 }, (_, i) => ({
        date: start.plus({ days: i }).toISODate() ?? "",
        visits: 0,
    }));
    const byDate = new Map(days.map((d) => [d.date, d]));
    const sum: Record<string, number> = {};
    for (const row of rows) {
        sum[row.type] = (sum[row.type] ?? 0) + row.count;
        if (row.type === SITE_VISIT_TYPE) {
            const day = byDate.get(row.date.toISOString().slice(0, 10));
            if (day) day.visits += row.count;
        }
    }
    const sellsAny = sells.bookings || sells.shop;
    return {
        from: window.fromDate,
        to: window.toDate,
        days,
        visits: sum[SITE_VISIT_TYPE] ?? 0,
        questions: sum[ENQUIRY_SUBMITTED_TYPE] ?? 0,
        started: sellsAny ? (sum[SITE_STARTED_TYPE] ?? 0) : null,
        paid: sellsAny ? (sum[SITE_PAID_TYPE] ?? 0) : null,
        sells,
    };
}

/** Newest first, at most `limit`. Pure. */
export function newestFirst(
    entries: readonly ActivityEntry[],
    limit = ACTIVITY_LIMIT,
): ActivityEntry[] {
    return [...entries]
        .sort((a, b) => b.at.localeCompare(a.at))
        .slice(0, limit);
}

async function userNames(
    ids: readonly (string | null | undefined)[],
): Promise<Map<string, string>> {
    const unique = [...new Set(ids.filter((id): id is string => !!id))];
    if (unique.length === 0) return new Map();
    const users = await prisma.user.findMany({
        where: { id: { in: unique } },
        select: { id: true, name: true, email: true },
    });
    return new Map(users.map((u) => [u.id, u.name ?? u.email]));
}

async function readResults(
    organizationId: string,
    siteId: string,
    now: Date,
): Promise<OverviewResults> {
    const zone = await businessTimezone(prisma, organizationId);
    const w = periodWindows("7d", now, zone);
    const [rows, book, shop] = await Promise.all([
        prisma.analyticsDailyAggregate.findMany({
            where: {
                organizationId,
                siteId,
                type: { in: RESULT_TYPES },
                dimension: "",
                date: dayBounds(w),
            },
            select: { date: true, type: true, count: true },
        }),
        modulePageState("BOOK", organizationId),
        modulePageState("SHOP", organizationId),
    ]);
    return foldResults(rows, w, {
        bookings: book.state === "on",
        shop: shop.state === "on",
    });
}

@Injectable()
export class SiteOverviewService {
    /** One site's Overview. `site:read`; a reviewer only of their sites. */
    async read(
        ctx: OrganizationContext,
        siteId: string,
        now: Date = new Date(),
    ): Promise<SiteOverview> {
        authorize(ctx, "site:read");
        const organizationId = ctx.organizationId;
        const site = await prisma.site.findFirst({
            where: {
                id: siteId,
                organizationId,
                deletedAt: null,
                ...reviewerScope(ctx),
            },
            select: {
                socialImageUrl: true,
                currentPublication: {
                    select: { publishedAt: true, publishedByUserId: true },
                },
                pages: {
                    orderBy: { createdAt: "asc" },
                    select: {
                        id: true,
                        title: true,
                        path: true,
                        hidden: true,
                        kind: true,
                        inMenu: true,
                        noindex: true,
                        seoDescription: true,
                        shareImageUrl: true,
                        shareImageMediaId: true,
                        settingsEditedAt: true,
                        settingsEditedByUserId: true,
                        versions: {
                            where: { status: "DRAFT" },
                            orderBy: { createdAt: "desc" },
                            take: 1,
                            select: {
                                revision: true,
                                updatedAt: true,
                                sections: {
                                    orderBy: { order: "asc" },
                                    select: {
                                        type: true,
                                        content: true,
                                        hidden: true,
                                    },
                                },
                            },
                        },
                    },
                },
            },
        });
        if (!site) throw new NotFoundException(`Site "${siteId}" not found`);

        const [results, publications, audits] = await Promise.all([
            allows(ctx, "analytics:read")
                ? readResults(organizationId, siteId, now)
                : null,
            prisma.publication.findMany({
                where: { siteId, organizationId, kind: "LIVE" },
                orderBy: { publishedAt: "desc" },
                take: ACTIVITY_LIMIT,
                select: {
                    publishedAt: true,
                    publishedByUserId: true,
                    postId: true,
                    sourcePublicationId: true,
                    post: { select: { title: true } },
                    wentLiveFor: { select: { id: true } },
                },
            }),
            prisma.auditEvent.findMany({
                where: {
                    organizationId,
                    targetType: "site",
                    targetId: siteId,
                    outcome: "SUCCESS",
                    action: { in: Object.keys(AUDIT_KINDS) },
                },
                orderBy: { createdAt: "desc" },
                take: ACTIVITY_LIMIT,
                select: { action: true, actorUserId: true, createdAt: true },
            }),
        ]);

        const names = await userNames([
            site.currentPublication?.publishedByUserId,
            ...publications.map((p) => p.publishedByUserId),
            ...audits.map((a) => a.actorUserId),
            ...site.pages.map((p) => p.settingsEditedByUserId),
        ]);
        const nameOf = (id: string | null | undefined) =>
            id ? (names.get(id) ?? null) : null;

        const entries: ActivityEntry[] = [
            ...publications.map((p): ActivityEntry => ({
                kind: p.postId
                    ? "post_published"
                    : p.wentLiveFor
                      ? "test_link_live"
                      : p.sourcePublicationId
                        ? "restored"
                        : "published",
                at: p.publishedAt.toISOString(),
                by: nameOf(p.publishedByUserId),
                subject: p.post?.title ?? null,
            })),
            ...audits.flatMap((a): ActivityEntry[] => {
                const kind = AUDIT_KINDS[a.action];
                return kind
                    ? [
                          {
                              kind,
                              at: a.createdAt.toISOString(),
                              by: nameOf(a.actorUserId),
                              subject: null,
                          },
                      ]
                    : [];
            }),
            ...site.pages.flatMap((page): ActivityEntry[] => {
                const out: ActivityEntry[] = [];
                const draft =
                    page.versions.length > 0 ? page.versions[0] : null;
                // Revision 0 is the page as it was made: nothing saved yet.
                if (draft && draft.revision > 0) {
                    out.push({
                        kind: "saved",
                        at: draft.updatedAt.toISOString(),
                        by: null,
                        subject: page.title,
                    });
                }
                if (page.settingsEditedAt) {
                    out.push({
                        kind: "page_settings",
                        at: page.settingsEditedAt.toISOString(),
                        by: nameOf(page.settingsEditedByUserId),
                        subject: page.title,
                    });
                }
                return out;
            }),
        ];

        return {
            results,
            needsDoing: pageHealth(
                site.pages.map((page) => ({
                    ...page,
                    sections: page.versions[0]?.sections ?? [],
                })),
                site,
            ),
            activity: newestFirst(entries),
            lastPublished: site.currentPublication
                ? {
                      at: site.currentPublication.publishedAt.toISOString(),
                      by: nameOf(site.currentPublication.publishedByUserId),
                  }
                : null,
        };
    }
}

/**
 * The All sites card's two lines, for the sites the list already read:
 * visits over the business's last 7 days (null without `analytics:read`)
 * and the last edit or publish. Edits carry a name only where one is
 * recorded (a page's settings); a saved section has none until batch 2.
 */
export async function siteCardExtras(
    ctx: OrganizationContext,
    sites: readonly {
        id: string;
        currentPublication: {
            publishedAt: Date;
            publishedByUserId: string | null;
        } | null;
    }[],
    now: Date = new Date(),
): Promise<Map<string, SiteCardExtras>> {
    const out = new Map<string, SiteCardExtras>();
    if (sites.length === 0) return out;
    const organizationId = ctx.organizationId;
    const ids = sites.map((s) => s.id);

    const visitsRead = async () => {
        if (!allows(ctx, "analytics:read")) return null;
        const zone = await businessTimezone(prisma, organizationId);
        const rows = await prisma.analyticsDailyAggregate.groupBy({
            by: ["siteId"],
            where: {
                organizationId,
                siteId: { in: ids },
                type: SITE_VISIT_TYPE,
                dimension: "",
                date: dayBounds(periodWindows("7d", now, zone)),
            },
            _sum: { count: true },
        });
        return new Map(rows.map((r) => [r.siteId, r._sum.count ?? 0]));
    };

    const [visits, drafts, settings] = await Promise.all([
        visitsRead(),
        prisma.pageVersion.findMany({
            where: {
                organizationId,
                status: "DRAFT",
                revision: { gt: 0 },
                page: { siteId: { in: ids } },
            },
            select: { updatedAt: true, page: { select: { siteId: true } } },
        }),
        prisma.page.findMany({
            where: {
                organizationId,
                siteId: { in: ids },
                settingsEditedAt: { not: null },
            },
            select: {
                siteId: true,
                settingsEditedAt: true,
                settingsEditedByUserId: true,
            },
        }),
    ]);
    const names = await userNames([
        ...sites.map((s) => s.currentPublication?.publishedByUserId),
        ...settings.map((p) => p.settingsEditedByUserId),
    ]);

    type Last = NonNullable<SiteCardExtras["lastActivity"]>;
    const latest = new Map<string, Last>();
    const offer = (siteId: string, last: Last) => {
        const held = latest.get(siteId);
        if (!held || last.at > held.at) latest.set(siteId, last);
    };
    for (const s of sites) {
        const pub = s.currentPublication;
        if (pub) {
            offer(s.id, {
                kind: "published",
                by: pub.publishedByUserId
                    ? (names.get(pub.publishedByUserId) ?? null)
                    : null,
                at: pub.publishedAt.toISOString(),
            });
        }
    }
    for (const d of drafts) {
        offer(d.page.siteId, {
            kind: "edited",
            by: null,
            at: d.updatedAt.toISOString(),
        });
    }
    for (const p of settings) {
        if (!p.settingsEditedAt) continue;
        offer(p.siteId, {
            kind: "edited",
            by: p.settingsEditedByUserId
                ? (names.get(p.settingsEditedByUserId) ?? null)
                : null,
            at: p.settingsEditedAt.toISOString(),
        });
    }

    for (const id of ids) {
        out.set(id, {
            visitsLast7Days: visits ? (visits.get(id) ?? 0) : null,
            lastActivity: latest.get(id) ?? null,
        });
    }
    return out;
}
