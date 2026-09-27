jest.mock("@saroh/database", () => ({
    Prisma: {},
    prisma: {},
    runInOrgContext: (_org: string, fn: () => unknown) => fn(),
}));
jest.mock("./site-host", () => ({
    resolveSiteHost: jest.fn(() =>
        Promise.resolve({
            siteId: "site_1",
            organizationId: "org_1",
            host: "kavi.saroh.app",
            businessName: "Kavi Dental",
            businessCreatedAt: new Date("2025-01-01"),
        }),
    ),
    businessPublicPhone: jest.fn(),
}));
jest.mock("../organizations/organization-lifecycle.gate", () => ({
    assertOrganizationOpen: jest.fn(() => Promise.resolve()),
}));

import { HttpException, HttpStatus } from "@nestjs/common";

import { FixedWindowRateLimiter } from "../bookings/rate-limiter";
import type { AccountLinkingService } from "./account-linking.service";
import type { ChallengeVerifier } from "./challenge";
import type { SiteCodeAlerts, SiteCodeDelivery } from "./code-delivery";
import type { SessionsService } from "./sessions.service";
import { SignInCodesService } from "./sign-in-codes.service";
import type { SiteRelay } from "./site-relay";

/**
 * Past the per-address code limit (re-review 2): with Turnstile configured
 * the next code needs the challenge (the flow is in
 * `sign-in.controller.db.spec.ts`); without it there is no challenge to ask,
 * so the address is refused until its window resets — before any read.
 */
describe("SignInCodesService past the address limit, with no challenge configured", () => {
    const relay = {
        host: "kavi.saroh.app",
        address: "203.0.113.7",
        clientHash: "client_1",
    } as SiteRelay;

    function service(limiter: FixedWindowRateLimiter) {
        const challenge = {
            configured: false,
            siteKey: null,
        } as unknown as ChallengeVerifier;
        return new SignInCodesService(
            {} as AccountLinkingService,
            {} as SessionsService,
            {} as SiteCodeDelivery,
            challenge,
            {} as SiteCodeAlerts,
            limiter,
            new FixedWindowRateLimiter(1_000, 600_000),
        );
    }

    it("refuses with 429 `limit` and when to try again, keyed per business and address", async () => {
        const limiter = new FixedWindowRateLimiter(1, 600_000);
        // The one allowed request in this window has gone.
        expect(limiter.take("org_1:client_1")).toBe(true);
        const take = jest.spyOn(limiter, "take");

        const refused = await service(limiter)
            .requestCode(relay, { email: "asha@example.in" })
            .then(
                () => null,
                (e: unknown) => e,
            );

        expect(take).toHaveBeenCalledWith("org_1:client_1", expect.any(Number));
        expect(refused).toBeInstanceOf(HttpException);
        const error = refused as HttpException;
        expect(error.getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
        const body = error.getResponse() as {
            details: { reason: string; retryAfter: number };
        };
        expect(body.details.reason).toBe("limit");
        expect(body.details.retryAfter).toBeGreaterThan(500);
        expect(body.details.retryAfter).toBeLessThanOrEqual(600);
    });
});
