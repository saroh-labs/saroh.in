import type { Prisma } from "@saroh/database";
import { prisma } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import { ReviewRoute } from "./review-route";
import type {
    TestReleaseLinkPurpose,
    TestReleaseLinkState,
} from "./test-release-links";
import {
    platformTestHost,
    testReleaseLinkState,
    testReleaseUrl,
} from "./test-release-links";
import type { VerdictRow } from "./test-release-review";
import { releaseStanding, releaseVerdicts } from "./test-release-review";

/**
 * What the API says about a test release (DEC-071, T2): the shapes every
 * test-release answer returns, and the one place a row becomes one. A link's
 * token never appears here; only a link's creator receives it, once, in
 * `withToken`.
 */

export type TestReleaseStatus = "ready" | "scheduled" | "live" | "discarded";

export interface TestReleaseLinkView {
    id: string;
    purpose: TestReleaseLinkPurpose;
    state: TestReleaseLinkState;
    createdAt: Date;
    expiresAt: Date;
    revokedAt: Date | null;
    lastUsedAt: Date | null;
    createdBy: { name: string | null };
}

/**
 * A link as its creator receives it, once. The raw token is in `url` (and
 * each of `urls`) and nowhere else: the database holds its hash, so no list
 * or later read can hand it to anyone (#284).
 */
export interface CreatedTestReleaseLinkView extends TestReleaseLinkView {
    /** The link on the first test host, or null when the site has none. */
    url: string | null;
    /** The link on every test host the site has. */
    urls: string[];
}

/**
 * Where a release stands with its reviewers, bound to its fingerprint
 * (KTD-10, `test-release-review.ts`): the verdicts given on a release with
 * these bytes, never the draft's.
 */
export interface TestReleaseStanding {
    outstanding: boolean;
    /** The route going live by the caller would take now. */
    route: ReviewRoute;
    /**
     * An approved test release, for the caller going live: approved by
     * someone else, and nothing asked since (`releaseApproved`).
     */
    approved: boolean;
    latest: { outcome: string; at: Date; by: string | null } | null;
}

export interface TestReleaseView {
    id: string;
    number: number;
    name: string;
    note: string | null;
    status: TestReleaseStatus;
    createdAt: Date;
    createdBy: { name: string | null };
    /**
     * The draft has moved on since this was made: the current draft would
     * not freeze to the same bytes.
     */
    draftChangedSince: boolean;
    standing: TestReleaseStanding;
    schedule: {
        goLiveAt: Date;
        zone: string | null;
        by: { name: string | null };
    } | null;
    wentLiveAt: Date | null;
    livePublicationId: string | null;
    discardedAt: Date | null;
    /** What the last scheduled attempt did, when one has run. */
    lastGoLive: { outcome: string; reason: string | null } | null;
    links: TestReleaseLinkView[];
}

export interface TestReleaseList {
    /** The hosts this site's test releases are served on. */
    testHosts: string[];
    releases: TestReleaseView[];
}

export interface CreatedTestReleaseView {
    release: TestReleaseView;
    link: CreatedTestReleaseLinkView;
}

/**
 * What going live did (T7). `replaced` is the version that was live until
 * now, so the answer can say "replaced the version published 3:10pm by
 * Asha"; null when the site had never been published.
 */
export interface TestReleaseGoLiveView {
    publicationId: string;
    publishedAt: Date;
    /** The review route it took (#278), and whether that was a bypass. */
    route: ReviewRoute;
    bypassed: boolean;
    replaced: {
        publicationId: string;
        publishedAt: Date;
        publishedBy: { name: string | null };
    } | null;
    release: TestReleaseView;
}

export const linkSelect = {
    id: true,
    purpose: true,
    createdAt: true,
    expiresAt: true,
    revokedAt: true,
    lastUsedAt: true,
    createdByUserId: true,
} as const;

export const releaseSelect = {
    id: true,
    number: true,
    name: true,
    note: true,
    fingerprint: true,
    createdAt: true,
    createdByUserId: true,
    discardedAt: true,
    wentLiveAt: true,
    livePublicationId: true,
    goLiveAt: true,
    goLiveZone: true,
    scheduledByUserId: true,
    lastGoLiveOutcome: true,
    lastGoLiveReason: true,
    links: { orderBy: { createdAt: "desc" }, select: linkSelect },
} as const satisfies Prisma.SiteTestReleaseSelect;

export type ReleaseRow = Prisma.SiteTestReleaseGetPayload<{
    select: typeof releaseSelect;
}>;
type LinkRow = ReleaseRow["links"][number];

export function testReleaseStatus(release: {
    discardedAt: Date | null;
    wentLiveAt: Date | null;
    goLiveAt: Date | null;
}): TestReleaseStatus {
    if (release.wentLiveAt) return "live";
    if (release.discardedAt) return "discarded";
    if (release.goLiveAt) return "scheduled";
    return "ready";
}

type Names = Map<string, string | null>;

function nameOf(names: Names, userId: string | null): { name: string | null } {
    return { name: userId ? (names.get(userId) ?? null) : null };
}

export function toLinkView(
    link: LinkRow,
    release: { discardedAt: Date | null; wentLiveAt: Date | null },
    names: Names,
    now: Date,
): TestReleaseLinkView {
    return {
        id: link.id,
        purpose: link.purpose as TestReleaseLinkPurpose,
        state: testReleaseLinkState(link, release, now),
        createdAt: link.createdAt,
        expiresAt: link.expiresAt,
        revokedAt: link.revokedAt,
        lastUsedAt: link.lastUsedAt,
        createdBy: nameOf(names, link.createdByUserId),
    };
}

export function toReleaseView(
    row: ReleaseRow,
    ctx: OrganizationContext,
    currentFingerprint: string,
    /** Every verdict on the site, newest first (`readVerdicts`). */
    verdicts: VerdictRow[],
    names: Names,
    now: Date,
): TestReleaseView {
    // The release's own fingerprint, not the draft's (KTD-10): a verdict on
    // this release is about these bytes, whatever the draft does next. The
    // same rule going live and the schedule ask.
    const standing = releaseStanding(verdicts, row, ctx.userId);
    const mine = releaseVerdicts(verdicts, row);
    const latest = mine.length > 0 ? mine[0] : null;
    return {
        id: row.id,
        number: row.number,
        name: row.name,
        note: row.note,
        status: testReleaseStatus(row),
        createdAt: row.createdAt,
        createdBy: nameOf(names, row.createdByUserId),
        draftChangedSince: row.fingerprint !== currentFingerprint,
        standing: {
            outstanding: standing.outstanding,
            route: standing.route,
            approved: standing.route === ReviewRoute.Approved,
            latest: latest
                ? {
                      outcome: latest.outcome,
                      at: latest.createdAt,
                      by: nameOf(names, latest.byUserId).name,
                  }
                : null,
        },
        schedule:
            row.goLiveAt && !row.wentLiveAt && !row.discardedAt
                ? {
                      goLiveAt: row.goLiveAt,
                      zone: row.goLiveZone,
                      by: nameOf(names, row.scheduledByUserId),
                  }
                : null,
        wentLiveAt: row.wentLiveAt,
        livePublicationId: row.livePublicationId,
        discardedAt: row.discardedAt,
        lastGoLive: row.lastGoLiveOutcome
            ? { outcome: row.lastGoLiveOutcome, reason: row.lastGoLiveReason }
            : null,
        links: row.links.map((link) => toLinkView(link, row, names, now)),
    };
}

/** Every user a set of rows names. */
export function peopleIn(rows: ReleaseRow[], verdicts: VerdictRow[]): string[] {
    const ids = new Set<string>();
    for (const row of rows) {
        ids.add(row.createdByUserId);
        if (row.scheduledByUserId) ids.add(row.scheduledByUserId);
        for (const link of row.links) ids.add(link.createdByUserId);
        // Only the newest verdict on a release is named.
        const mine = releaseVerdicts(verdicts, row);
        if (mine.length > 0) ids.add(mine[0].byUserId);
    }
    return [...ids];
}

/**
 * Users by id, as "name, else email". User ids on these rows are plain
 * columns (a person leaving Saroh never takes the record with them), so a
 * missing user reads as no name.
 */
export async function namesFor(ids: string[]): Promise<Names> {
    if (ids.length === 0) return new Map();
    const users = await prisma.user.findMany({
        where: { id: { in: ids } },
        select: { id: true, name: true, email: true },
    });
    return new Map(users.map((u) => [u.id, u.name ?? u.email]));
}

/** The hosts a site's releases are served on (see `platformTestHost`). */
export function testHosts(subdomain: string | null): string[] {
    const host = platformTestHost(subdomain);
    return host ? [host] : [];
}

export function withToken(
    link: TestReleaseLinkView,
    token: string,
    hosts: string[],
): CreatedTestReleaseLinkView {
    const urls = hosts.map((host) => testReleaseUrl(host, token));
    return { ...link, url: urls[0] ?? null, urls };
}
