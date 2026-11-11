/**
 * The storefront API's db specs' shared setup (plan 2026-11-10-001, U7):
 * the app built as main.ts builds it where it matters (the CORS delegate,
 * OriginGuard, OrgRlsInterceptor and the exception filter), a business with
 * a published site, keys, a minted storefront token, and an HTTP caller.
 * Caps and kill switches are fixtures.
 *
 * A spec calls `useStorefrontApp()` at its top level and keeps its own
 * `jest.mock`s of `BetterAuthGuard` and `@saroh/auth` (they must be hoisted
 * in the spec itself).
 */
import { randomBytes } from "node:crypto";
import { request as httpRequest } from "node:http";

import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import type { ApiKeyKind } from "@saroh/database";
import { prisma } from "@saroh/database";
import type { z } from "zod";

import { corsDelegate } from "../../src/common/cors";
import { AllExceptionsFilter } from "../../src/common/filters/all-exceptions.filter";
import { OriginGuard } from "../../src/common/guards/origin.guard";
import { IdempotencyService } from "../../src/common/idempotency/idempotency.service";
import { OrgRlsInterceptor } from "../../src/common/interceptors/org-rls.interceptor";
import { env } from "../../src/env";
import { ApiKeyGuard } from "../../src/modules/api-keys/api-key.guard";
import { ApiKeysModule } from "../../src/modules/api-keys/api-keys.module";
import {
    displayPrefix,
    mintToken,
    STOREFRONT_SCOPE,
    tokenDigest,
} from "../../src/modules/api-keys/api-keys.service";
import { keyContextCache } from "../../src/modules/api-keys/key-context.cache";
import type { EntitlementService } from "../../src/modules/billing/entitlement.service";
import { PublicBookingsService } from "../../src/modules/bookings/public-bookings.service";
import { FixedWindowRateLimiter } from "../../src/modules/bookings/rate-limiter";
import { EnquiryService } from "../../src/modules/enquiry/enquiry.service";
import { FeatureFlagService } from "../../src/modules/feature-flags/feature-flags.service";
import { PublicCheckoutService } from "../../src/modules/orders/public-checkout.service";
import { PaymentsService } from "../../src/modules/payments/payments.service";
import {
    FakeMerchantProvider,
    FakeProviderFactory,
} from "../../src/modules/payments/providers/fake.provider";
import { PublicInvoicesService } from "../../src/modules/payments/public-invoices.service";
import { PublicCatalogueService } from "../../src/modules/products/public-catalogue.service";
import { StorefrontTokenGuard } from "../../src/modules/public-api/storefront-token.guard";
import { StorefrontTokensService } from "../../src/modules/public-api/storefront-tokens.service";
import {
    StorefrontController,
    StorefrontTokensController,
    StorefrontWriteController,
} from "../../src/modules/public-api/storefront.controller";
import { StorefrontService } from "../../src/modules/public-api/storefront.service";
import { CapsService } from "../../src/modules/rate-limits/caps";
import { LimitsService } from "../../src/modules/rate-limits/limits.service";
import { SitesService } from "../../src/modules/sites/sites.service";
import { PublicPlansService } from "../../src/modules/subscriptions/public-plans.service";
import { giveBusinessDetails } from "../business-details";

const mutableEnv = env as {
    APIKEY_ENC_KEY?: string;
    TRUST_PROXY?: string;
    PAYMENTS_ENC_KEY?: string;
};

// Fixture cap: an obviously fake number, never a plan's.
const CAP = 1_000;
export const SITE = "https://shop.example.com";
const MONDAY = 1;

export const tag = `${process.pid}x${Date.now() % 100000}`;
let seq = 0;
export const uniq = (label: string) => `${label}-${tag}-${++seq}`;

/** The next Monday at `hour`:00 UTC, `weeksOut` weeks on. */
export function nextMonday(hour: number, weeksOut = 1): Date {
    const d = new Date();
    d.setUTCHours(0, 0, 0, 0);
    const ahead = (MONDAY - d.getUTCDay() + 7) % 7 || 7;
    d.setUTCDate(d.getUTCDate() + ahead + (weeksOut - 1) * 7);
    d.setUTCHours(hour);
    return d;
}

/** The provider every business's payments go through in these specs. */
export const fakeProvider = new FakeMerchantProvider("RAZORPAY");
export const payments = new PaymentsService(
    new FakeProviderFactory(fakeProvider),
);

let app: INestApplication;
let port: number;

/** Build the app before the spec's tests, and close it after. */
export function useStorefrontApp(): void {
    const before = { ...mutableEnv };
    beforeAll(async () => {
        // Throwaway keys for this run only, never values in the repo.
        mutableEnv.APIKEY_ENC_KEY = randomBytes(32).toString("base64");
        mutableEnv.PAYMENTS_ENC_KEY = randomBytes(32).toString("hex");
        mutableEnv.TRUST_PROXY = "cloudflare";
        const generous = () => new FixedWindowRateLimiter(1_000);
        const moduleRef = await Test.createTestingModule({
            imports: [ApiKeysModule],
            controllers: [
                StorefrontWriteController,
                StorefrontController,
                StorefrontTokensController,
            ],
            providers: [
                IdempotencyService,
                StorefrontService,
                StorefrontTokensService,
                StorefrontTokenGuard,
                {
                    provide: PublicCatalogueService,
                    useValue: new PublicCatalogueService(generous()),
                },
                {
                    provide: PublicBookingsService,
                    useValue: new PublicBookingsService(
                        generous(),
                        undefined,
                        payments,
                    ),
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
            corsDelegate(["https://app.saroh.in"], (t) =>
                guard.allowedOrigins(t),
            ),
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
}

export type Answer = {
    status: number;
    headers: Record<string, string | string[] | undefined>;
    body: {
        error?: { code?: string; message?: string; requestId?: string };
    } & Record<string, unknown>;
};

export function call(
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
export async function business(name: string) {
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
    return {
        id: org.id,
        owner: user.id,
        address,
        siteId: site.id,
        serviceId: service.id,
    };
}

export async function keyFor(
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

/** A real answer is exactly its contract schema: parsing drops nothing (review #2). */
export function exactly(schema: z.ZodType, body: unknown) {
    expect(schema.parse(body)).toEqual(body);
}

export const bearer = (token: string) => ({ authorization: `Bearer ${token}` });

/**
 * A storefront token minted over HTTP, as a business's server would, for
 * the visitor it knows by `email` (none: an enquiries-only token).
 */
export async function mint(
    org: { id: string; owner: string },
    email: string | null = "asha@example.com",
) {
    const pk = await keyFor(org, "PUBLISHABLE");
    const sk = await keyFor(org, "SECRET");
    const minted = await call(
        "POST",
        "/v1/storefront-tokens",
        bearer(sk.token),
        {
            publishableKeyId: pk.id,
            ...(email ? { visitor: { email } } : {}),
        },
    );
    expect(minted.status).toBe(201);
    return { pk, sk, token: minted.body.token as string, minted };
}

export function booking(
    serviceId: string,
    startAt: Date,
    email: string | undefined = "asha@example.com",
) {
    return {
        serviceId,
        startAt: startAt.toISOString(),
        name: "Asha Rao",
        email,
    };
}
