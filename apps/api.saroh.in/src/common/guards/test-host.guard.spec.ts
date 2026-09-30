/**
 * The test-release write guard (DEC-071, KTD-8): a public write whose
 * browser Origin or verified relay names a test host is a 409
 * `TEST_RELEASE`; everything else passes to the route.
 */
const findUnique = jest.fn();
jest.mock("@saroh/database", () => ({
    prisma: { domain: { findUnique: (...a: unknown[]) => findUnique(...a) } },
    outsideOrgContext: (fn: () => unknown) => fn(),
}));

import type { ExecutionContext } from "@nestjs/common";
import { ConflictException, Controller, Post } from "@nestjs/common";
import { Reflector } from "@nestjs/core";

import { signSiteRelay } from "../../modules/site-accounts/site-relay";
import { AllowOnTestRelease } from "../decorators/allow-on-test-release.decorator";
import { TEST_RELEASE_REFUSAL, TestHostWriteGuard } from "./test-host.guard";

const ROOT = "saroh.app";
const SECRET = "test-relay-secret";

@Controller("public/sites")
class FakeController {
    @Post(":siteId/checkout")
    start(): void {}

    @Post(":siteId/checkout/quote")
    @AllowOnTestRelease()
    quote(): void {}
}

function ctx(req: {
    method: string;
    path: string;
    headers?: Record<string, string | undefined>;
    handler?: "start" | "quote";
}): ExecutionContext {
    const request = { headers: {}, ...req };
    const handler = FakeController.prototype[req.handler ?? "start"];
    return {
        switchToHttp: () => ({ getRequest: () => request }),
        getHandler: () => handler,
        getClass: () => FakeController,
    } as unknown as ExecutionContext;
}

const relayFor = (host: string, secret = SECRET) =>
    signSiteRelay({ address: "203.0.113.9", host }, secret);

describe("TestHostWriteGuard", () => {
    const guard = new TestHostWriteGuard(new Reflector(), {
        rootDomain: ROOT,
        relaySecret: () => SECRET,
    });

    beforeEach(() => {
        findUnique.mockReset();
        findUnique.mockResolvedValue(null);
    });

    async function refusal(context: ExecutionContext): Promise<unknown> {
        return guard.canActivate(context).then(
            () => null,
            (error: unknown) => error,
        );
    }

    it("refuses an enquiry from a test host's Origin with 409 TEST_RELEASE", async () => {
        const error = await refusal(
            ctx({
                method: "POST",
                path: "/public/forms/form_1/submit",
                headers: { origin: "https://test--acme.saroh.app" },
            }),
        );
        expect(error).toBeInstanceOf(ConflictException);
        expect((error as ConflictException).getResponse()).toEqual(
            TEST_RELEASE_REFUSAL,
        );
        expect(TEST_RELEASE_REFUSAL.details.code).toBe("TEST_RELEASE");
    });

    it("lets the same enquiry through from the live host", async () => {
        await expect(
            guard.canActivate(
                ctx({
                    method: "POST",
                    path: "/public/forms/form_1/submit",
                    headers: { origin: "https://acme.saroh.app" },
                }),
            ),
        ).resolves.toBe(true);
    });

    it("refuses on the Referer when there is no Origin", async () => {
        await expect(
            refusal(
                ctx({
                    method: "POST",
                    path: "/public/forms/form_1/submit",
                    headers: {
                        referer: "https://test--acme.saroh.app/contact",
                    },
                }),
            ),
        ).resolves.toBeInstanceOf(ConflictException);
    });

    it("refuses a checkout relayed for a test host, and lets its quote through", async () => {
        const headers = { "x-saroh-relay": relayFor("test--acme.saroh.app") };
        await expect(
            refusal(
                ctx({
                    method: "POST",
                    path: "/public/sites/site_1/checkout",
                    headers,
                }),
            ),
        ).resolves.toBeInstanceOf(ConflictException);
        await expect(
            guard.canActivate(
                ctx({
                    method: "POST",
                    path: "/public/sites/site_1/checkout/quote",
                    headers,
                    handler: "quote",
                }),
            ),
        ).resolves.toBe(true);
    });

    it("ignores a forged relay naming a test host, leaving the route's own 401", async () => {
        await expect(
            guard.canActivate(
                ctx({
                    method: "POST",
                    path: "/public/sites/site_1/checkout",
                    headers: {
                        "x-saroh-relay": relayFor(
                            "test--acme.saroh.app",
                            "someone-elses-secret",
                        ),
                    },
                }),
            ),
        ).resolves.toBe(true);
    });

    it("a forged live relay cannot hide a test Origin", async () => {
        await expect(
            refusal(
                ctx({
                    method: "POST",
                    path: "/public/forms/form_1/submit",
                    headers: {
                        origin: "https://test--acme.saroh.app",
                        "x-saroh-relay": relayFor("acme.saroh.app"),
                    },
                }),
            ),
        ).resolves.toBeInstanceOf(ConflictException);
    });

    it("refuses a custom domain's test host, unless a verified domain claims it exactly", async () => {
        const context = () =>
            ctx({
                method: "POST",
                path: "/public/forms/form_1/submit",
                headers: { origin: "https://test.shop.acme.com" },
            });
        await expect(refusal(context())).resolves.toBeInstanceOf(
            ConflictException,
        );
        // A merchant whose real domain is `test.shop.acme.com` writes live.
        findUnique.mockResolvedValue({ status: "VERIFIED", siteId: "site_1" });
        await expect(guard.canActivate(context())).resolves.toBe(true);
    });

    it("passes reads, private routes, webhooks and the checkout return", async () => {
        const origin = "https://test--acme.saroh.app";
        for (const method of ["GET", "HEAD", "OPTIONS"]) {
            await expect(
                guard.canActivate(
                    ctx({
                        method,
                        path: "/public/sites/site_1/catalogue",
                        headers: { origin },
                    }),
                ),
            ).resolves.toBe(true);
        }
        for (const path of [
            "/organizations/org_1/leads",
            "/public/webhooks/razorpay/org_1",
            "/public/billing/webhooks/razorpay",
            "/public/payments/return",
        ]) {
            await expect(
                guard.canActivate(
                    ctx({ method: "POST", path, headers: { origin } }),
                ),
            ).resolves.toBe(true);
        }
        // A prefix only exempts its own path segment.
        await expect(
            refusal(
                ctx({
                    method: "POST",
                    path: "/public/paymentsx",
                    headers: { origin },
                }),
            ),
        ).resolves.toBeInstanceOf(ConflictException);
    });

    it("refuses every write verb, and ignores a query string on the path", async () => {
        for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
            await expect(
                refusal(
                    ctx({
                        method,
                        path: "/public/site-accounts/me?x=1",
                        headers: { origin: "https://test--acme.saroh.app" },
                    }),
                ),
            ).resolves.toBeInstanceOf(ConflictException);
        }
    });

    it("passes a write with no origin at all, and an unparseable one", async () => {
        for (const origin of [undefined, "null", "not a url"]) {
            await expect(
                guard.canActivate(
                    ctx({
                        method: "POST",
                        path: "/public/forms/form_1/submit",
                        headers: { origin },
                    }),
                ),
            ).resolves.toBe(true);
        }
    });

    it("ignores every relay when this instance has no relay secret", async () => {
        const noSecret = new TestHostWriteGuard(new Reflector(), {
            rootDomain: ROOT,
            relaySecret: () => {
                throw new Error("SITE_RELAY_SECRET is not set");
            },
        });
        await expect(
            noSecret.canActivate(
                ctx({
                    method: "POST",
                    path: "/public/sites/site_1/checkout",
                    headers: {
                        "x-saroh-relay": relayFor("test--acme.saroh.app"),
                    },
                }),
            ),
        ).resolves.toBe(true);
    });
});
