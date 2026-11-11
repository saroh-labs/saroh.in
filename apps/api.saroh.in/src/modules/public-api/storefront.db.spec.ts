/**
 * The storefront API over HTTP against a real Postgres (plan 2026-11-10-001,
 * U7): reads with a publishable key and their hosted links, the key being
 * read-only, minting a storefront token with a secret key, and a visitor's
 * writes with it: a booking that lands in the workspace, a slot that has
 * gone, an expired token, another business's token, an origin outside the
 * token's list, and payments without a provider.
 *
 * Built as main.ts builds it where it matters: the CORS delegate,
 * OriginGuard, OrgRlsInterceptor and the exception filter. Caps and kill
 * switches are fixtures. Runs in the integration project
 * (TEST_DATABASE_URL), and with TEST_RLS=on.
 */
jest.mock("../../common/guards/better-auth.guard", () => ({
    BetterAuthGuard: class BetterAuthGuard {},
}));
jest.mock("@saroh/auth", () => ({
    isTrustedOrigin: (origin: string): boolean => {
        try {
            return new URL(origin).origin.endsWith(".saroh.in");
        } catch {
            return false;
        }
    },
}));

import { randomBytes } from "node:crypto";
import { request as httpRequest } from "node:http";

import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import type { ApiKeyKind } from "@saroh/database";
import { prisma } from "@saroh/database";

import { giveBusinessDetails } from "../../../test/business-details";
import { corsDelegate } from "../../common/cors";
import { AllExceptionsFilter } from "../../common/filters/all-exceptions.filter";
import { OriginGuard } from "../../common/guards/origin.guard";
import { OrgRlsInterceptor } from "../../common/interceptors/org-rls.interceptor";
import { env } from "../../env";
import { ApiKeyGuard } from "../api-keys/api-key.guard";
import { ApiKeysModule } from "../api-keys/api-keys.module";
import {
    displayPrefix,
    mintToken,
    STOREFRONT_SCOPE,
    tokenDigest,
} from "../api-keys/api-keys.service";
import { keyContextCache } from "../api-keys/key-context.cache";
import type { EntitlementService } from "../billing/entitlement.service";
import { PublicBookingsService } from "../bookings/public-bookings.service";
import { FixedWindowRateLimiter } from "../bookings/rate-limiter";
import { EnquiryService } from "../enquiry/enquiry.service";
import { FeatureFlagService } from "../feature-flags/feature-flags.service";
import { PublicCheckoutService } from "../orders/public-checkout.service";
import { PaymentsService } from "../payments/payments.service";
import {
    FakeMerchantProvider,
    FakeProviderFactory,
} from "../payments/providers/fake.provider";
import { PublicInvoicesService } from "../payments/public-invoices.service";
import { PublicCatalogueService } from "../products/public-catalogue.service";
import { CapsService } from "../rate-limits/caps";
import { LimitsService } from "../rate-limits/limits.service";
import { SitesService } from "../sites/sites.service";
import { PublicPlansService } from "../subscriptions/public-plans.service";
import { StorefrontTokenGuard } from "./storefront-token.guard";
import { StorefrontTokensService } from "./storefront-tokens.service";
import {
    StorefrontController,
    StorefrontTokensController,
    StorefrontWriteController,
} from "./storefront.controller";
import { StorefrontService } from "./storefront.service";

const mutableEnv = env as {
    APIKEY_ENC_KEY?: string;
    TRUST_PROXY?: string;
    PAYMENTS_ENC_KEY?: string;
};
const before = { ...mutableEnv };

// Fixture cap: an obviously fake number, never a plan's.
const CAP = 1_000;
const SITE = "https://shop.example.com";
const MONDAY = 1;

const tag = `${process.pid}x${Date.now() % 100000}`;
let seq = 0;
const uniq = (label: string) => `${label}-${tag}-${++seq}`;

/** The next Monday at `hour`:00 UTC, `weeksOut` weeks on. */
function nextMonday(hour: number, weeksOut = 1): Date {
    const d = new Date();
    d.setUTCHours(0, 0, 0, 0);
    const ahead = (MONDAY - d.getUTCDay() + 7) % 7 || 7;
    d.setUTCDate(d.getUTCDate() + ahead + (weeksOut - 1) * 7);
    d.setUTCHours(hour);
    return d;
}

let app: INestApplication;
let port: number;

beforeAll(async () => {
    // Throwaway keys for this run only, never values in the repo.
    mutableEnv.APIKEY_ENC_KEY = randomBytes(32).toString("base64");
    mutableEnv.PAYMENTS_ENC_KEY = randomBytes(32).toString("hex");
    mutableEnv.TRUST_PROXY = "cloudflare";
    const payments = new PaymentsService(
        new FakeProviderFactory(new FakeMerchantProvider("RAZORPAY")),
    );
    const generous = () => new FixedWindowRateLimiter(1_000);
    const moduleRef = await Test.createTestingModule({
        imports: [ApiKeysModule],
        controllers: [
            StorefrontWriteController,
            StorefrontController,
            StorefrontTokensController,
        ],
        providers: [
            StorefrontService,
            StorefrontTokensService,
            StorefrontTokenGuard,
            {
                provide: PublicCatalogueService,
                useValue: new PublicCatalogueService(generous()),
            },
            {
                provide: PublicBookingsService,
                useValue: new PublicBookingsService(generous()),
            },
            {
                provide: PublicPlansService,
                useValue: new PublicPlansService(generous()),
            },
            {
                provide: SitesService,
                useValue: new SitesService({
                    check: jest.fn().mockResolvedValue(true),
                    can: jest.fn().mockResolvedValue(true),
                    getEntitlements: jest.fn(),
                } as unknown as EntitlementService),
            },
            { provide: EnquiryService, useValue: new EnquiryService() },
            {
                provide: PublicInvoicesService,
                useValue: new PublicInvoicesService(payments),
            },
            {
                provide: PublicCheckoutService,
                useValue: new PublicCheckoutService(payments),
            },
        ],
    })
        .overrideProvider(CapsService)
        .useValue({ rpm: () => Promise.resolve(CAP) })
        .overrideProvider(LimitsService)
        .useValue(new LimitsService(null))
        .overrideProvider(FeatureFlagService)
        .useValue({ isEnabled: () => Promise.resolve(true) })
        .compile();
    app = moduleRef.createNestApplication({ logger: false });
    const guard = app.get(ApiKeyGuard);
    app.enableCors(
        corsDelegate(["https://app.saroh.in"], (t) => guard.allowedOrigins(t)),
    );
    app.useGlobalGuards(new OriginGuard());
    app.useGlobalInterceptors(new OrgRlsInterceptor());
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.listen(0, "127.0.0.1");
    port = (app.getHttpServer().address() as { port: number }).port;
});

afterAll(async () => {
    await app?.close();
    Object.assign(mutableEnv, before);
});

beforeEach(() => keyContextCache.clear());

type Answer = {
    status: number;
    headers: Record<string, string | string[] | undefined>;
    body: { error?: { code?: string } } & Record<string, unknown>;
};

function call(
    method: string,
    path: string,
    headers: Record<string, string> = {},
    body?: unknown,
): Promise<Answer> {
    const payload = body === undefined ? undefined : JSON.stringify(body);
    return new Promise((resolve, reject) => {
        const req = httpRequest(
            {
                host: "127.0.0.1",
                port,
                method,
                path,
                headers: {
                    ...(payload ? { "content-type": "application/json" } : {}),
                    ...headers,
                },
            },
            (res) => {
                let text = "";
                res.on("data", (c: Buffer) => (text += c.toString()));
                res.on("end", () =>
                    resolve({
                        status: res.statusCode ?? 0,
                        headers: res.headers,
                        body: text ? JSON.parse(text) : {},
                    }),
                );
            },
        );
        req.on("error", reject);
        if (payload) req.write(payload);
        req.end();
    });
}

/** A business with a published site at `<address>.saroh.app` and one free, one-hour service on Monday mornings. */
async function business(name: string) {
    const org = await prisma.organization.create({
        data: { name, slug: uniq("u7-org") },
    });
    const user = await prisma.user.create({
        data: { email: `${uniq("owner")}@example.com`, name: "Owner" },
    });
    await prisma.membership.create({
        data: { organizationId: org.id, userId: user.id, role: "OWNER" },
    });
    await prisma.businessProfile.create({
        data: { organizationId: org.id, timezone: "UTC" },
    });
    await giveBusinessDetails(org.id);
    const address = uniq("u7");
    const site = await prisma.site.create({
        data: {
            organizationId: org.id,
            name,
            slug: uniq("u7-site"),
            subdomain: address,
        },
    });
    const publication = await prisma.publication.create({
        data: {
            siteId: site.id,
            organizationId: org.id,
            snapshot: {},
            templateId: "blank",
            templateVersion: 1,
        },
    });
    await prisma.site.update({
        where: { id: site.id },
        data: { currentPublicationId: publication.id },
    });
    const service = await prisma.service.create({
        data: {
            organizationId: org.id,
            name: "Consultation",
            durationMinutes: 60,
            capacity: 1,
            timezone: "UTC",
            availabilityRules: {
                create: {
                    organizationId: org.id,
                    dayOfWeek: MONDAY,
                    startMinute: 6 * 60,
                    endMinute: 9 * 60,
                },
            },
        },
    });
    return { id: org.id, owner: user.id, address, serviceId: service.id };
}

async function keyFor(
    org: { id: string; owner: string },
    kind: ApiKeyKind,
    scope?: string[],
) {
    const token = mintToken(kind);
    const row = await prisma.apiKey.create({
        data: {
            organizationId: org.id,
            createdByUserId: org.owner,
            kind,
            edition: "INDIA",
            name: "Fixture key",
            prefix: displayPrefix(token),
            tokenDigest: tokenDigest(token),
            scope:
                kind === "SECRET"
                    ? (scope ?? ["storefront:mint"])
                    : [...STOREFRONT_SCOPE],
            allowedOrigins: kind === "SECRET" ? [] : [SITE],
        },
    });
    return { token, id: row.id };
}

const bearer = (token: string) => ({ authorization: `Bearer ${token}` });

/** A storefront token minted over HTTP, as a business's server would. */
async function mint(org: { id: string; owner: string }) {
    const pk = await keyFor(org, "PUBLISHABLE");
    const sk = await keyFor(org, "SECRET");
    const minted = await call(
        "POST",
        "/v1/storefront-tokens",
        bearer(sk.token),
        {
            publishableKeyId: pk.id,
        },
    );
    expect(minted.status).toBe(201);
    return { pk, sk, token: minted.body.token as string, minted };
}

function booking(serviceId: string, startAt: Date, email = "asha@example.com") {
    return {
        serviceId,
        startAt: startAt.toISOString(),
        name: "Asha Rao",
        email,
    };
}

describe("storefront reads (publishable key)", () => {
    it("lists the services with each one's hosted booking link", async () => {
        const org = await business("Pulse Fitness");
        const pk = await keyFor(org, "PUBLISHABLE");
        const read = await call("GET", `/v1/storefront/${pk.token}/services`, {
            origin: SITE,
        });
        expect(read.status).toBe(200);
        expect(read.headers["cache-control"]).toMatch(/max-age=30/);
        expect(read.body.data).toEqual([
            expect.objectContaining({
                id: org.serviceId,
                name: "Consultation",
                hostedUrl: `https://${org.address}.saroh.app/book?service=${org.serviceId}`,
            }),
        ]);
    });

    it("lists the shop's products with their hosted pages; an unpublished product is 404", async () => {
        const org = await business("Rye & Co.");
        for (const key of ["SITE_SHOP", "MODULE_COMMERCE"]) {
            await prisma.featureFlag.upsert({
                where: { key },
                create: { key, enabledByDefault: false },
                update: {},
            });
            await prisma.featureFlagOverride.create({
                data: { flagKey: key, organizationId: org.id, enabled: true },
            });
        }
        const store = await prisma.store.create({
            data: {
                name: "Online",
                slug: uniq("u7-store"),
                organizationId: org.id,
            },
        });
        await prisma.site.updateMany({
            where: { organizationId: org.id },
            data: { storefrontId: store.id },
        });
        for (const [name, status] of [
            ["Sourdough", "PUBLISHED"],
            ["Draft loaf", "DRAFT"],
        ] as const) {
            const p = await prisma.product.create({
                data: {
                    organizationId: org.id,
                    name,
                    slug: name.toLowerCase().replace(/\s+/g, "-"),
                    price: "300.00",
                    currency: "INR",
                    status,
                    stockTracked: false,
                },
            });
            await prisma.productListing.create({
                data: {
                    organizationId: org.id,
                    storeId: store.id,
                    productId: p.id,
                },
            });
        }
        const pk = await keyFor(org, "PUBLISHABLE");
        const shop = `https://${org.address}.saroh.app/shop`;
        const list = await call("GET", `/v1/storefront/${pk.token}/products`);
        expect(list.status).toBe(200);
        expect(list.body.products).toEqual([
            expect.objectContaining({
                slug: "sourdough",
                hostedUrl: `${shop}/sourdough`,
            }),
        ]);
        const one = await call(
            "GET",
            `/v1/storefront/${pk.token}/products/sourdough`,
        );
        expect(one.status).toBe(200);
        expect(one.body.hostedUrl).toBe(`${shop}/sourdough`);
        expect(
            (
                await call(
                    "GET",
                    `/v1/storefront/${pk.token}/products/draft-loaf`,
                )
            ).status,
        ).toBe(404);
    });

    it("reads a service's slots, and 404s another business's service", async () => {
        const a = await business("Rye");
        const b = await business("Pulse");
        const pk = await keyFor(a, "PUBLISHABLE");
        const from = nextMonday(0).toISOString();
        const to = nextMonday(23).toISOString();
        const q = `from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
        const own = await call(
            "GET",
            `/v1/storefront/${pk.token}/services/${a.serviceId}/availability?${q}`,
        );
        expect(own.status).toBe(200);
        expect((own.body.data as unknown[]).length).toBeGreaterThan(0);
        const theirs = await call(
            "GET",
            `/v1/storefront/${pk.token}/services/${b.serviceId}/availability?${q}`,
        );
        expect(theirs.status).toBe(404);
        expect(theirs.body.error?.code).toBe("not_found");
    });

    it("is read-only: any other method gets 403", async () => {
        const org = await business("Rye");
        const pk = await keyFor(org, "PUBLISHABLE");
        for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
            const answer = await call(
                method,
                `/v1/storefront/${pk.token}/services`,
                { origin: SITE },
            );
            expect(answer.status).toBe(403);
            expect(answer.body.error?.code).toBe("forbidden");
        }
        // An unknown read is a 404, not a hole.
        expect(
            (await call("GET", `/v1/storefront/${pk.token}/nothing-here`))
                .status,
        ).toBe(404);
    });

    it("404s a business with no published site", async () => {
        const org = await business("Rye");
        await prisma.site.updateMany({
            where: { organizationId: org.id },
            data: { currentPublicationId: null },
        });
        const pk = await keyFor(org, "PUBLISHABLE");
        expect(
            (await call("GET", `/v1/storefront/${pk.token}/services`)).status,
        ).toBe(404);
    });
});

describe("storefront tokens", () => {
    it("mints a ~30-minute token with the publishable key's origins, keeping only its digest", async () => {
        const org = await business("Rye");
        const { token, minted } = await mint(org);
        expect(token).toMatch(/^st_live_[0-9A-Za-z]{43}$/);
        expect(minted.body.allowedOrigins).toEqual([SITE]);
        const left =
            new Date(minted.body.expiresAt as string).getTime() - Date.now();
        expect(left).toBeGreaterThan(25 * 60_000);
        expect(left).toBeLessThanOrEqual(30 * 60_000);
        const row = await prisma.storefrontToken.findFirstOrThrow({
            where: { organizationId: org.id },
        });
        expect(row.tokenDigest).toBe(tokenDigest(token));
        expect(JSON.stringify(row)).not.toContain(token);
    });

    it("refuses a secret key without storefront:mint, and a publishable key", async () => {
        const org = await business("Rye");
        const pk = await keyFor(org, "PUBLISHABLE");
        const sk = await keyFor(org, "SECRET", ["order:read"]);
        expect(
            (
                await call("POST", "/v1/storefront-tokens", bearer(sk.token), {
                    publishableKeyId: pk.id,
                })
            ).status,
        ).toBe(403);
        expect(
            (
                await call("POST", "/v1/storefront-tokens", bearer(pk.token), {
                    publishableKeyId: pk.id,
                })
            ).status,
        ).toBe(403);
    });

    it("won't copy another business's publishable key", async () => {
        const a = await business("Rye");
        const b = await business("Pulse");
        const theirs = await keyFor(b, "PUBLISHABLE");
        const sk = await keyFor(a, "SECRET");
        expect(
            (
                await call("POST", "/v1/storefront-tokens", bearer(sk.token), {
                    publishableKeyId: theirs.id,
                })
            ).status,
        ).toBe(404);
    });
});

describe("storefront writes (storefront token)", () => {
    it("books a free slot that appears in the workspace; the slot gone is a 409", async () => {
        const org = await business("Pulse Fitness");
        const { token } = await mint(org);
        const startAt = nextMonday(6);
        const booked = await call(
            "POST",
            "/v1/storefront/write/bookings",
            { ...bearer(token), origin: SITE },
            booking(org.serviceId, startAt),
        );
        expect(booked.status).toBe(201);
        expect(booked.body).toMatchObject({
            serviceName: "Consultation",
            state: "CONFIRMED",
            holdToken: null,
        });
        expect(booked.headers["access-control-allow-origin"]).toBe(SITE);
        // The business's own diary has it.
        const row = await prisma.booking.findFirstOrThrow({
            where: { organizationId: org.id, serviceId: org.serviceId },
        });
        expect(row.startAt.toISOString()).toBe(startAt.toISOString());
        expect(row.bookerEmail).toBe("asha@example.com");

        const again = await call(
            "POST",
            "/v1/storefront/write/bookings",
            bearer(token),
            booking(org.serviceId, startAt, "ravi@example.com"),
        );
        expect(again.status).toBe(409);
        expect(again.body.error?.code).toBe("conflict");
        expect(typeof again.body.error?.message).toBe("string");
        expect(typeof again.body.error?.requestId).toBe("string");
    });

    it("answers a write's preflight, and refuses an origin outside the token's list", async () => {
        const org = await business("Rye");
        const { token } = await mint(org);
        const preflight = await call(
            "OPTIONS",
            "/v1/storefront/write/bookings",
            {
                origin: SITE,
                "access-control-request-method": "POST",
                "access-control-request-headers": "authorization,content-type",
            },
        );
        expect(preflight.headers["access-control-allow-origin"]).toBe(SITE);
        expect(
            preflight.headers["access-control-allow-credentials"],
        ).toBeUndefined();
        const evil = await call(
            "POST",
            "/v1/storefront/write/bookings",
            { ...bearer(token), origin: "https://evil.example" },
            booking(org.serviceId, nextMonday(7)),
        );
        expect(evil.status).toBe(403);
        expect(
            await prisma.booking.count({ where: { organizationId: org.id } }),
        ).toBe(0);
    });

    it("401s an expired token, a made-up one and none at all", async () => {
        const org = await business("Rye");
        const { token } = await mint(org);
        await prisma.storefrontToken.updateMany({
            where: { organizationId: org.id },
            data: { expiresAt: new Date(Date.now() - 1_000) },
        });
        const body = booking(org.serviceId, nextMonday(6));
        for (const headers of [
            bearer(token),
            bearer(`st_live_${"x".repeat(43)}`),
            {},
        ]) {
            const answer = await call(
                "POST",
                "/v1/storefront/write/bookings",
                headers,
                body,
            );
            expect(answer.status).toBe(401);
            expect(answer.body.error?.code).toBe("unauthorized");
        }
    });

    it("401s a token once its secret key is revoked", async () => {
        const org = await business("Rye");
        const { token, sk } = await mint(org);
        await prisma.apiKey.update({
            where: { id: sk.id },
            data: { revokedAt: new Date() },
        });
        expect(
            (
                await call(
                    "POST",
                    "/v1/storefront/write/bookings",
                    bearer(token),
                    booking(org.serviceId, nextMonday(6)),
                )
            ).status,
        ).toBe(401);
    });

    it("can't book at another business with a token from this one", async () => {
        const a = await business("Rye");
        const b = await business("Pulse");
        const { token } = await mint(a);
        const answer = await call(
            "POST",
            "/v1/storefront/write/bookings",
            bearer(token),
            booking(b.serviceId, nextMonday(6)),
        );
        expect(answer.status).toBe(404);
        expect(
            await prisma.booking.count({ where: { organizationId: b.id } }),
        ).toBe(0);
    });

    it("refuses holds, payments and online orders with 409 payments_unavailable without a provider", async () => {
        const org = await business("Rye");
        const { token } = await mint(org);
        const hold = await call(
            "POST",
            "/v1/storefront/write/holds",
            bearer(token),
            booking(org.serviceId, nextMonday(6)),
        );
        expect(hold.status).toBe(409);
        expect(hold.body.error?.code).toBe("payments_unavailable");
        const pay = await call(
            "POST",
            "/v1/storefront/write/payments",
            bearer(token),
            {
                holdToken: "a-hold-token-that-is-long",
            },
        );
        expect(pay.status).toBe(409);
        expect(pay.body.error?.code).toBe("payments_unavailable");
        const order = await call(
            "POST",
            "/v1/storefront/write/orders",
            bearer(token),
            {
                name: "Asha Rao",
                email: "asha@example.com",
                lines: [{ listingId: "listing_1", quantity: 1 }],
                fulfilment: "PICKUP",
                idempotencyKey: "order-key-1",
            },
        );
        expect(order.status).toBe(409);
        expect(order.body.error?.code).toBe("payments_unavailable");
        expect(
            await prisma.booking.count({ where: { organizationId: org.id } }),
        ).toBe(0);
    });

    it("refuses a bad body with 400 invalid_request", async () => {
        const org = await business("Rye");
        const { token } = await mint(org);
        const answer = await call(
            "POST",
            "/v1/storefront/write/bookings",
            bearer(token),
            { serviceId: org.serviceId, startAt: "soon" },
        );
        expect(answer.status).toBe(400);
        expect(answer.body.error?.code).toBe("invalid_request");
    });
});
