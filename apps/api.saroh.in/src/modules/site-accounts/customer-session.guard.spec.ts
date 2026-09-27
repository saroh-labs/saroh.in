import type { ExecutionContext } from "@nestjs/common";
import { NotFoundException, UnauthorizedException } from "@nestjs/common";

import type {
    CustomerContext,
    CustomerRequest,
} from "./customer-context.decorator";
import {
    CUSTOMER_SESSION_HEADER,
    CustomerSessionGuard,
} from "./customer-session.guard";
import type { SessionsService } from "./sessions.service";
import type { SiteHost } from "./site-host";
import { resolveSiteHost } from "./site-host";
import { SITE_RELAY_HEADER, signSiteRelay } from "./site-relay";
import { siteRelaySecret } from "./site-secrets";

jest.mock("./site-host", () => ({ resolveSiteHost: jest.fn() }));

/**
 * The customer session guard without a database (round-2 plan A, A3): the
 * relay, the token header, and what it sets on the request. The session's
 * own checks (another site, revoked, expired, sliding) are
 * `customer-rls.db.spec.ts`.
 */
const HOST = "kavi.saroh.app";
const SITE: SiteHost = {
    siteId: "site_kavi",
    organizationId: "org_kavi",
    host: HOST,
    businessName: "Kavi Dental",
    businessCreatedAt: new Date("2026-01-01"),
};
const CUSTOMER: CustomerContext = {
    organizationId: "org_kavi",
    siteId: "site_kavi",
    accountId: "acc_1",
    contactId: "contact_1",
    sessionId: "session_1",
};

const resolveHost = resolveSiteHost as jest.MockedFunction<
    typeof resolveSiteHost
>;

function setup(found: CustomerContext | null = CUSTOMER) {
    const resolve = jest.fn().mockResolvedValue(found);
    const guard = new CustomerSessionGuard({
        resolve,
    } as unknown as SessionsService);
    return { guard, resolve };
}

function request(headers: Record<string, string | undefined>) {
    const req: CustomerRequest & { organizationContext?: unknown } = {
        headers,
    };
    const context = {
        switchToHttp: () => ({ getRequest: () => req }),
    } as unknown as ExecutionContext;
    return { req, context };
}

const relay = (host = HOST) =>
    signSiteRelay({ address: "203.0.113.7", host }, siteRelaySecret());

beforeEach(() => {
    resolveHost.mockReset();
    resolveHost.mockResolvedValue(SITE);
});

describe("CustomerSessionGuard", () => {
    it("signs the customer in and sets customerContext, never organizationContext", async () => {
        const { guard, resolve } = setup();
        const { req, context } = request({
            [SITE_RELAY_HEADER]: relay(),
            [CUSTOMER_SESSION_HEADER]: "tok",
        });
        await expect(guard.canActivate(context)).resolves.toBe(true);
        expect(resolveHost).toHaveBeenCalledWith(HOST);
        expect(resolve).toHaveBeenCalledWith("tok", SITE);
        expect(req.customerContext).toEqual(CUSTOMER);
        expect(req.organizationContext).toBeUndefined();
    });

    it("refuses a request without the site's relay, before looking at the token", async () => {
        const { guard, resolve } = setup();
        const { context } = request({ [CUSTOMER_SESSION_HEADER]: "tok" });
        await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
            UnauthorizedException,
        );
        expect(resolve).not.toHaveBeenCalled();
    });

    it("refuses a relay signed with another secret", async () => {
        const { guard } = setup();
        const { context } = request({
            [SITE_RELAY_HEADER]: signSiteRelay(
                { address: "203.0.113.7", host: HOST },
                "another-secret",
            ),
            [CUSTOMER_SESSION_HEADER]: "tok",
        });
        await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
            UnauthorizedException,
        );
    });

    it("refuses a request with no session header", async () => {
        const { guard, resolve } = setup();
        const { context } = request({ [SITE_RELAY_HEADER]: relay() });
        await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
            UnauthorizedException,
        );
        expect(resolve).not.toHaveBeenCalled();
    });

    it("never reads a cookie: a workspace session signs nobody in", async () => {
        const { guard, resolve } = setup();
        const { context } = request({
            [SITE_RELAY_HEADER]: relay(),
            cookie: "__Secure-better-auth.session_token=staff; __Host-saroh_session=tok",
        });
        await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
            UnauthorizedException,
        );
        expect(resolve).not.toHaveBeenCalled();
    });

    it("refuses a token the session store doesn't accept for this site", async () => {
        const { guard } = setup(null);
        const { req, context } = request({
            [SITE_RELAY_HEADER]: relay(),
            [CUSTOMER_SESSION_HEADER]: "tok",
        });
        await expect(guard.canActivate(context)).rejects.toMatchObject({
            response: { details: { reason: "signed-out" } },
        });
        expect(req.customerContext).toBeUndefined();
    });

    it("answers 404 for a host with no published site", async () => {
        const { guard } = setup();
        resolveHost.mockRejectedValue(new NotFoundException());
        const { context } = request({
            [SITE_RELAY_HEADER]: relay("nowhere.saroh.app"),
            [CUSTOMER_SESSION_HEADER]: "tok",
        });
        await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
            NotFoundException,
        );
    });
});
