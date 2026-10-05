import { headers } from "next/headers";
import { cache } from "react";

import type { ModulePageStates } from "@saroh/site-blocks";

import { env } from "@/env";
import { modulePageStatesOf } from "@/lib/module-pages";
import { servedHost } from "@/lib/origin";
import { classifySiteHost } from "@/lib/site-host-mode";
import { relayFor, SITE_RELAY_HEADER } from "@/lib/site-relay";
import { TEST_RELEASE_HEADER } from "@/lib/test-host";
import { serverApiUrl } from "./api-url";

/**
 * A test release, as its test host shows it (DEC-071, T5).
 *
 *   GET /public/sites/test-release?host=<host>
 *   x-saroh-test-token: <token>
 *
 * The token rides in a header, never in the path, so no access log carries
 * it. The call carries the signed visitor relay (ADR-011), so the API's
 * per-visitor limit counts the visitor rather than this server. Uncached:
 * a revoke, a discard or a go-live is honoured on the very next request.
 *
 * The API answers only for a host that classifies as test, a token for the
 * site that host names, and a business with test releases on (else 404);
 * a link that stopped working is a 410 naming why.
 */

const API_URL = serverApiUrl();

/** The header the API reads the token from (KTD-6). */
export const TEST_TOKEN_HEADER = "x-saroh-test-token";

/** Why a test host shows no release. The gate says it in words. */
export type TestReleaseGone =
    "missing" | "expired" | "revoked" | "discarded" | "live" | "unavailable";

/** The release a link opens, as the bar names it. */
export interface TestReleaseInfo {
    name: string;
    number: number;
    /** ISO date-time the release was made. */
    madeAt: string;
}

export type TestReleaseLookup =
    | {
          ok: true;
          /** The frozen snapshot; `lib/publication.ts` gives it its type. */
          snapshot: object;
          /** The REAL site's id: every live read (shop, booking) keys on it. */
          siteId: string;
          modules: ModulePageStates | null;
          release: TestReleaseInfo;
          /** The live site's address; null if it has never been published. */
          liveUrl: string | null;
      }
    | { ok: false; reason: TestReleaseGone; liveUrl: string | null };

const GONE_REASONS = new Set<TestReleaseGone>([
    "expired",
    "revoked",
    "discarded",
    "live",
]);

/** A URL the page may link to: http(s) only. */
function safeUrl(value: unknown): string | null {
    if (typeof value !== "string") return null;
    try {
        const url = new URL(value);
        return url.protocol === "https:" || url.protocol === "http:"
            ? url.toString()
            : null;
    } catch {
        return null;
    }
}

/** The release behind a response body, or null when it is not one. */
function releaseOf(value: unknown): TestReleaseInfo | null {
    if (!value || typeof value !== "object") return null;
    const r = value as Record<string, unknown>;
    if (typeof r.name !== "string" || typeof r.number !== "number") {
        return null;
    }
    return {
        name: r.name,
        number: r.number,
        madeAt: typeof r.madeAt === "string" ? r.madeAt : "",
    };
}

/**
 * Read the release `token` opens on `host`. Never throws: a network failure,
 * a 5xx or a rate limit is `unavailable`, which the gate says differently
 * from a link that does not open anything.
 *
 * `relay`, when given, is the signed visitor relay for this request.
 */
export async function fetchTestRelease(
    host: string,
    token: string,
    relay: string | null,
): Promise<TestReleaseLookup> {
    const sent: Record<string, string> = {
        accept: "application/json",
        [TEST_TOKEN_HEADER]: token,
    };
    if (relay) sent[SITE_RELAY_HEADER] = relay;

    let res: Response;
    try {
        res = await fetch(
            `${API_URL}/public/sites/test-release?host=${encodeURIComponent(host)}`,
            { cache: "no-store", headers: sent },
        );
    } catch {
        return { ok: false, reason: "unavailable", liveUrl: null };
    }

    if (res.status === 410) {
        // The api's error envelope: { error: { message, details: { reason } } }.
        const body = (await res.json().catch(() => null)) as {
            error?: { details?: { reason?: string; liveUrl?: string } };
        } | null;
        const reason = body?.error?.details?.reason as TestReleaseGone;
        return {
            ok: false,
            reason: GONE_REASONS.has(reason) ? reason : "expired",
            liveUrl: safeUrl(body?.error?.details?.liveUrl),
        };
    }
    if (res.status === 404)
        return { ok: false, reason: "missing", liveUrl: null };
    if (!res.ok) return { ok: false, reason: "unavailable", liveUrl: null };

    const body = (await res.json().catch(() => null)) as {
        snapshot?: unknown;
        siteId?: string;
        modules?: unknown;
        release?: unknown;
        liveUrl?: unknown;
    } | null;
    const release = releaseOf(body?.release);
    if (
        !body?.snapshot ||
        typeof body.snapshot !== "object" ||
        typeof body.siteId !== "string" ||
        !release
    ) {
        return { ok: false, reason: "unavailable", liveUrl: null };
    }
    return {
        ok: true,
        snapshot: body.snapshot,
        siteId: body.siteId,
        modules: modulePageStatesOf(body.modules),
        release,
        liveUrl: safeUrl(body.liveUrl),
    };
}

/** The renderer's apex, as the host classifier wants it. */
export function rootDomain(): string {
    return env.NEXT_PUBLIC_ROOT_DOMAIN ?? "saroh.app";
}

/**
 * The release this request's test host shows, read once per request (the
 * layout, the page and their metadata share it). The token is the one the
 * middleware passed on from the host's cookie; without it there is nothing
 * to show.
 */
export const getTestRelease = cache(async function getTestRelease(
    host: string,
): Promise<TestReleaseLookup> {
    const requestHeaders = await headers();
    const token = requestHeaders.get(TEST_RELEASE_HEADER);
    if (!token) return { ok: false, reason: "missing", liveUrl: null };
    let relay: string | null = null;
    try {
        relay = relayFor(requestHeaders, host);
    } catch {
        // No SITE_RELAY_SECRET here: read unsigned rather than not at all.
    }
    return fetchTestRelease(host, token, relay);
});

/**
 * Whether this request is on a test host (KTD-8): call first in every write
 * action, beside `siteOrigin()`, and refuse. True for a host shaped like a
 * test host whatever else is true, and for a request the middleware marked,
 * so it fails closed.
 */
export async function testMode(): Promise<boolean> {
    const requestHeaders = await headers();
    if (requestHeaders.get(TEST_RELEASE_HEADER)) return true;
    const host = servedHost(requestHeaders);
    return (
        host !== null && classifySiteHost(host, rootDomain()).mode === "test"
    );
}
