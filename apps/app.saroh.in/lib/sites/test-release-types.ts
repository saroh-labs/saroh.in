/**
 * What the API says about a site's test releases (DEC-071, T2, T8, T10), as
 * the editor reads it: the answers of `/sites/:siteId/test-releases`, dates
 * as strings. Mirrored, not imported: the app never reaches the API's code.
 * The words the editor says about them are `test-releases.ts`.
 */

export type TestReleaseStatus = "ready" | "scheduled" | "live" | "discarded";

/** Why a link does not open its release; `ended` is its release's doing. */
export type TestReleaseLinkState = "active" | "expired" | "revoked" | "ended";

export interface TestReleaseLink {
    id: string;
    /** SHARE: made to send to someone. OPEN: made for whoever opened it. */
    purpose: "SHARE" | "OPEN";
    state: TestReleaseLinkState;
    createdAt: string;
    expiresAt: string;
    revokedAt: string | null;
    lastUsedAt: string | null;
    createdBy: { name: string | null };
}

/** A link as its maker receives it, once: the only time its address exists. */
export interface CreatedTestReleaseLink extends TestReleaseLink {
    url: string | null;
    urls: string[];
}

/** Where a release stands with its reviewers, bound to its own bytes. */
export interface TestReleaseStanding {
    outstanding: boolean;
    /** The route going live by this person would take now. */
    route: string;
    /** Approved by someone other than this person, and nothing asked since. */
    approved: boolean;
    latest: { outcome: string; at: string; by: string | null } | null;
}

export interface TestRelease {
    id: string;
    number: number;
    name: string;
    note: string | null;
    status: TestReleaseStatus;
    createdAt: string;
    createdBy: { name: string | null };
    /** The draft would not freeze to the same bytes now. */
    draftChangedSince: boolean;
    standing: TestReleaseStanding;
    schedule: {
        goLiveAt: string;
        zone: string | null;
        by: { name: string | null };
    } | null;
    wentLiveAt: string | null;
    livePublicationId: string | null;
    discardedAt: string | null;
    /** What the last scheduled attempt did, when one has run. */
    lastGoLive: { outcome: string; reason: string | null } | null;
    links: TestReleaseLink[];
}

export interface TestReleaseList {
    /** Where this site's releases are served; empty when it has no address. */
    testHosts: string[];
    /** The business's time zone, the one a schedule is read in. */
    zone: string;
    releases: TestRelease[];
}

/**
 * The editor's read of its releases. `off` while `SITE_TEST_RELEASES` is off
 * for the business (the API answers 404), when the surface is hidden
 * (DEC-057's spirit, KTD-16). `failed` is said, never read as "none yet".
 */
export type TestReleasesRead =
    | { state: "off" }
    | { state: "failed" }
    | { state: "on"; list: TestReleaseList };

/** What going live did: the version it replaced, for the toast. */
export interface GoLiveResult {
    publishedAt: string;
    bypassed: boolean;
    overridden: boolean;
    replaced: {
        publishedAt: string;
        publishedBy: { name: string | null };
    } | null;
    release: TestRelease;
}
