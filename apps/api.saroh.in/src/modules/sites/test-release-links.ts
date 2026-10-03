import { randomBytes } from "node:crypto";

import { rendererHost } from "./site-origin";
import { hashPreviewToken } from "./site-preview-links.service";

/**
 * Test release links (DEC-071, KTD-6): the secret, its hash, and the address
 * it opens.
 *
 * The scheme is the preview link's (#284): 32 random bytes as base64url, only
 * the SHA-256 hex stored, the raw token handed back once. The links live in
 * their own table, so a draft preview token never opens a test host and a
 * test token never opens `/preview/<token>`.
 */

/** A shared link lasts 1, 7 or 30 days, as a preview link does. */
export const TEST_RELEASE_LINK_DAYS = [1, 7, 30] as const;
export type TestReleaseLinkDays = (typeof TEST_RELEASE_LINK_DAYS)[number];

/** The first link, made with the release. */
export const FIRST_LINK_DAYS: TestReleaseLinkDays = 7;

/**
 * "Open test release" from the workspace mints a short link for the person
 * opening it (Q5, T2), so nobody has to hold on to an old token.
 */
export const OPEN_LINK_HOURS = 12;

/** SHARE: made to send to someone. OPEN: made for the person opening it. */
export type TestReleaseLinkPurpose = "SHARE" | "OPEN";

/** Why a link does not open its release. */
export type TestReleaseLinkState =
    | "active"
    | "expired"
    | "revoked"
    /** Its release was discarded or has gone live (Q6). */
    | "ended";

/** A new secret: 32 random bytes, short enough to paste, safe in a URL. */
export function mintTestReleaseToken(): string {
    return randomBytes(32).toString("base64url");
}

/**
 * The stored form of a token: SHA-256, hex. The same function as the preview
 * link's, so there is one hashing rule to review; the tables keep them apart.
 */
export function hashTestReleaseToken(token: string): string {
    return hashPreviewToken(token);
}

export function testReleaseLinkState(
    link: { expiresAt: Date; revokedAt: Date | null },
    release: { discardedAt: Date | null; wentLiveAt: Date | null },
    now = new Date(),
): TestReleaseLinkState {
    if (link.revokedAt) return "revoked";
    if (release.discardedAt || release.wentLiveAt) return "ended";
    if (link.expiresAt.getTime() <= now.getTime()) return "expired";
    return "active";
}

/** One DNS label holds at most 63 characters. */
const MAX_LABEL = 63;
const TEST_PREFIX = "test--";

/**
 * The hosts a site's test releases are served on: `test--<address>` on the
 * renderer's apex (`test--northwind.saroh.app`, or `.saroh.app.localhost` in
 * development).
 *
 * None when the site has no address, or when `test--<address>` would not fit
 * one DNS label (an address over 57 characters, KTD-12).
 *
 * T3's `testHostsFor` (site-host-mode.ts) adds `test.<custom domain>` once
 * that host is set up (Q4); this is the platform host every site gets.
 */
export function platformTestHost(subdomain: string | null): string | null {
    if (!subdomain) return null;
    const label = `${TEST_PREFIX}${subdomain.toLowerCase()}`;
    if (label.length > MAX_LABEL) return null;
    return `${label}.${rendererHost()}`;
}

/** The address a link opens: the test host, with the token to set once. */
export function testReleaseUrl(host: string, token: string): string {
    return `https://${host}/?release=${encodeURIComponent(token)}`;
}
