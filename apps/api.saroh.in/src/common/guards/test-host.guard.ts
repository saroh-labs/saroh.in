import type { CanActivate, ExecutionContext } from "@nestjs/common";
import { ConflictException, Injectable } from "@nestjs/common";
import type { Reflector } from "@nestjs/core";

import {
    SITE_RELAY_HEADER,
    verifySiteRelay,
} from "../../modules/site-accounts/site-relay";
import { siteRelaySecret } from "../../modules/site-accounts/site-secrets";
import { siteHostMode } from "../../modules/sites/site-host-mode";
import { ALLOW_ON_TEST_RELEASE } from "../decorators/allow-on-test-release.decorator";

/** What a refused call answers: a 409 a client can branch on. */
export const TEST_RELEASE_REFUSAL = {
    message: "This is a test release. Nothing here is ordered, booked or paid.",
    details: { code: "TEST_RELEASE", reason: "test-release" },
} as const;

interface GuardedRequest {
    method?: string;
    path?: string;
    originalUrl?: string;
    url?: string;
    headers: Record<string, string | string[] | undefined>;
}

export interface TestHostWriteGuardOptions {
    /** The renderer's apex; `siteRootDomain()` when absent. */
    rootDomain?: string;
    /** The relay secret; `siteRelaySecret()` when absent. */
    relaySecret?: () => string;
}

/**
 * Refuse every public write that comes from a test release (DEC-071, KTD-8).
 *
 * A test release (`test--<address>.saroh.app`, `test.<custom domain>`) shows
 * the whole site with live products, prices and times, but it must never
 * take a real order, booking, payment, plan, pack, waitlist place, enquiry
 * or sign-in. The renderer stops each of those in its UI (T6); this guard is
 * the API's own refusal, so a missed action, or a block that posts straight
 * from the browser, still cannot reach the database.
 *
 * A non-GET `/public/*` request is refused with 409 `TEST_RELEASE` when
 * either of these classifies as a test host (`siteHostMode`, KTD-7):
 *  - the browser's `Origin` (or, absent that, its `Referer`);
 *  - the host in a VERIFIED `x-saroh-relay` (saroh.app's server calls). A
 *    relay that does not check is ignored, so a forged one can turn test
 *    mode neither on nor off; the route's own guard answers it.
 *
 * What always passes:
 *  - GET, HEAD and OPTIONS;
 *  - anything outside `/public/`;
 *  - provider webhooks and the checkout return (`/public/webhooks`,
 *    `/public/billing/webhooks`, `/public/payments`), which carry no
 *    browser origin from a test host;
 *  - a route marked `@AllowOnTestRelease()`, for read-shaped POSTs.
 *
 * `test-host-routes.spec.ts` lists every public write, so a new one is
 * refused on a test host unless someone decides otherwise on the record.
 *
 * This is not a boundary against someone calling the live API on purpose:
 * those routes are public for the live site anyway. It keeps the claim
 * "nothing here is real" true for everyone using the test release.
 */
@Injectable()
export class TestHostWriteGuard implements CanActivate {
    static readonly SAFE = new Set(["GET", "HEAD", "OPTIONS"]);

    /** Public routes a test host never reaches with a browser origin. */
    static readonly EXEMPT_PREFIXES = [
        "/public/webhooks",
        "/public/billing/webhooks",
        "/public/payments",
    ] as const;

    constructor(
        private readonly reflector: Reflector,
        private readonly options: TestHostWriteGuardOptions = {},
    ) {}

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const req = context.switchToHttp().getRequest<GuardedRequest>();
        const method = (req.method ?? "GET").toUpperCase();
        if (TestHostWriteGuard.SAFE.has(method)) return true;

        const path = pathOf(req);
        if (!path.startsWith("/public/")) return true;
        if (TestHostWriteGuard.isExempt(path)) return true;

        const allowed = this.reflector.getAllAndOverride<boolean | undefined>(
            ALLOW_ON_TEST_RELEASE,
            [context.getHandler(), context.getClass()],
        );
        if (allowed === true) return true;

        for (const host of this.candidateHosts(req)) {
            const { mode } = await siteHostMode(host, this.options.rootDomain);
            if (mode === "test") {
                throw new ConflictException(TEST_RELEASE_REFUSAL);
            }
        }
        return true;
    }

    /** True for a path under one of {@link EXEMPT_PREFIXES}. */
    static isExempt(path: string): boolean {
        return TestHostWriteGuard.EXEMPT_PREFIXES.some(
            (prefix) => path === prefix || path.startsWith(`${prefix}/`),
        );
    }

    /** The hosts this request speaks for: its browser origin and its relay. */
    private candidateHosts(req: GuardedRequest): string[] {
        const hosts: string[] = [];
        const origin =
            header(req.headers.origin) ?? header(req.headers.referer);
        const originHost = origin ? hostOf(origin) : null;
        if (originHost) hosts.push(originHost);

        const relay = header(req.headers[SITE_RELAY_HEADER]);
        if (relay) {
            const checked = this.verifiedRelayHost(relay);
            if (checked) hosts.push(checked);
        }
        return hosts;
    }

    private verifiedRelayHost(relay: string): string | null {
        try {
            const secret = (this.options.relaySecret ?? siteRelaySecret)();
            return verifySiteRelay(relay, secret)?.host ?? null;
        } catch {
            // No secret on this instance: no relay can check, so none counts.
            return null;
        }
    }
}

/** The request path without the query string. */
function pathOf(req: GuardedRequest): string {
    const raw = req.path ?? req.originalUrl ?? req.url ?? "/";
    const q = raw.indexOf("?");
    return q === -1 ? raw : raw.slice(0, q);
}

/** First value of a possibly-array header, or undefined when absent/empty. */
function header(value: string | string[] | undefined): string | undefined {
    const v = Array.isArray(value) ? value[0] : value;
    return v && v.trim() !== "" ? v.trim() : undefined;
}

/** The host of an origin or URL, or null for `null` and anything unparseable. */
function hostOf(value: string): string | null {
    if (value === "null") return null;
    try {
        return new URL(value).host || null;
    } catch {
        return null;
    }
}
