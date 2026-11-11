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

import {
    storefrontBooking,
    storefrontProduct,
    storefrontProducts,
    storefrontServices,
    storefrontSlots,
} from "@saroh/api-contract";
import { prisma } from "@saroh/database";

import {
    bearer,
    booking,
    business,
    call,
    exactly,
    keyFor,
    mint,
    nextMonday,
    SITE,
    uniq,
    useStorefrontApp,
} from "../../../test/fixtures/storefront";
import { tokenDigest } from "../api-keys/api-keys.service";

useStorefrontApp();

describe("storefront reads (publishable key)", () => {
    it("lists the services with each one's hosted booking link", async () => {
        const org = await business("Pulse Fitness");
        const pk = await keyFor(org, "PUBLISHABLE");
        const read = await call("GET", `/v1/storefront/${pk.token}/services`, {
            origin: SITE,
        });
        expect(read.status).toBe(200);
        expect(read.headers["cache-control"]).toMatch(/max-age=30/);
        exactly(storefrontServices, read.body);
        expect(read.body).toEqual({
            data: [
                expect.objectContaining({
                    id: org.serviceId,
                    name: "Consultation",
                    hostedUrl: `https://${org.address}.saroh.app/book?service=${org.serviceId}`,
                }),
            ],
            nextCursor: null,
        });
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
        const sourdough = await prisma.product.findFirstOrThrow({
            where: { organizationId: org.id, slug: "sourdough" },
        });
        const list = await call("GET", `/v1/storefront/${pk.token}/products`);
        expect(list.status).toBe(200);
        exactly(storefrontProducts, list.body);
        expect(list.body.data).toEqual([
            expect.objectContaining({
                id: sourdough.id,
                slug: "sourdough",
                price: { amountMinor: 30_000, currency: "INR" },
                hostedUrl: `${shop}/sourdough`,
            }),
        ]);
        expect(list.body.nextCursor).toBeNull();
        const one = await call(
            "GET",
            `/v1/storefront/${pk.token}/products/sourdough`,
        );
        expect(one.status).toBe(200);
        exactly(storefrontProduct, one.body);
        expect(one.body).toMatchObject({
            id: sourdough.id,
            hostedUrl: `${shop}/sourdough`,
        });
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
        exactly(storefrontSlots, own.body);
        expect((own.body.data as unknown[]).length).toBeGreaterThan(1);
        // One at a time, the next page starting after the first.
        const first = await call(
            "GET",
            `/v1/storefront/${pk.token}/services/${a.serviceId}/availability?${q}&limit=1`,
        );
        const data = own.body.data as { startAt: string }[];
        expect(first.body.data).toEqual([data[0]]);
        const second = await call(
            "GET",
            `/v1/storefront/${pk.token}/services/${a.serviceId}/availability?${q}&limit=1&cursor=${String(first.body.nextCursor)}`,
        );
        expect(second.body.data).toEqual([data[1]]);
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
            // Readable from the listed origin: the browser test expects
            // exactly this 403, not a CORS failure.
            expect(answer.headers["access-control-allow-origin"]).toBe(SITE);
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
        exactly(storefrontBooking, booked.body);
        expect(booked.body).toMatchObject({
            serviceName: "Consultation",
            state: "confirmed",
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
            // No email: the token's.
            booking(org.serviceId, startAt, undefined),
        );
        expect(again.status).toBe(409);
        expect(again.body.error?.code).toBe("conflict");
        expect(typeof again.body.error?.message).toBe("string");
        expect(typeof again.body.error?.requestId).toBe("string");
    });

    it("books and orders only as the visitor the token was minted for", async () => {
        const org = await business("Rye");
        const { token } = await mint(org, "Asha@Example.com");
        const row = await prisma.storefrontToken.findFirstOrThrow({
            where: { organizationId: org.id },
        });
        expect(row.visitorEmail).toBe("asha@example.com");
        const order = {
            name: "Ravi",
            email: "ravi@example.com",
            lines: [{ productId: "product_1", quantity: 1 }],
            fulfilment: "pickup",
            payment: "on_handover",
        };
        for (const [path, body] of [
            [
                "bookings",
                booking(org.serviceId, nextMonday(6), "ravi@example.com"),
            ],
            [
                "holds",
                booking(org.serviceId, nextMonday(7), "ravi@example.com"),
            ],
            ["orders", order],
        ] as const) {
            const refused = await call(
                "POST",
                `/v1/storefront/write/${path}`,
                bearer(token),
                body,
            );
            expect(refused.status).toBe(403);
            expect(refused.body.error?.code).toBe("visitor_email_mismatch");
        }
        // A token minted with no visitor can't book or order at all.
        const { token: anonymous } = await mint(org, null);
        const bare = await call(
            "POST",
            "/v1/storefront/write/bookings",
            bearer(anonymous),
            booking(org.serviceId, nextMonday(6)),
        );
        expect(bare.status).toBe(403);
        expect(bare.body.error?.code).toBe("visitor_email_required");
        const noEmailOrder = await call(
            "POST",
            "/v1/storefront/write/orders",
            bearer(anonymous),
            { ...order, email: undefined },
        );
        expect(noEmailOrder.status).toBe(403);
        expect(noEmailOrder.body.error?.code).toBe("visitor_email_required");
        // Nothing written for anyone.
        expect(
            await prisma.booking.count({ where: { organizationId: org.id } }),
        ).toBe(0);
        expect(
            await prisma.order.count({ where: { organizationId: org.id } }),
        ).toBe(0);
        expect(
            await prisma.contact.count({ where: { organizationId: org.id } }),
        ).toBe(0);
        // The same email in another case is the visitor's own.
        const own = await call(
            "POST",
            "/v1/storefront/write/bookings",
            bearer(token),
            booking(org.serviceId, nextMonday(6), "ASHA@example.com"),
        );
        expect(own.status).toBe(201);
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
                lines: [{ productId: "product_1", quantity: 1 }],
                fulfilment: "pickup",
            },
        );
        expect(order.status).toBe(409);
        expect(order.body.error?.code).toBe("payments_unavailable");
        expect(
            await prisma.booking.count({ where: { organizationId: org.id } }),
        ).toBe(0);
    });

    it("books once for one Idempotency-Key, per token; another request with it is a 409", async () => {
        const org = await business("Pulse Fitness");
        const { token } = await mint(org);
        const headers = { ...bearer(token), "idempotency-key": uniq("sf") };
        const body = booking(org.serviceId, nextMonday(6));
        const first = await call(
            "POST",
            "/v1/storefront/write/bookings",
            headers,
            body,
        );
        expect(first.status).toBe(201);
        const again = await call(
            "POST",
            "/v1/storefront/write/bookings",
            headers,
            body,
        );
        expect(again.status).toBe(201);
        expect(again.body).toEqual(first.body);
        expect(
            await prisma.booking.count({ where: { organizationId: org.id } }),
        ).toBe(1);
        const different = await call(
            "POST",
            "/v1/storefront/write/bookings",
            headers,
            booking(org.serviceId, nextMonday(7)),
        );
        expect(different.status).toBe(409);
        expect(different.body.error?.code).toBe("conflict");
        // The body field is gone: one way to say it, the header.
        const old = await call(
            "POST",
            "/v1/storefront/write/bookings",
            bearer(token),
            { ...body, idempotencyKey: "old-style-key" },
        );
        expect(old.status).toBe(400);
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

    it("refuses a write body with a field it doesn't know: 400, nothing written", async () => {
        const org = await business("Rye");
        const { token } = await mint(org);
        const form = await prisma.form.create({
            data: { organizationId: org.id, name: "Contact", fields: [] },
        });
        const extra = { isAdmin: true };
        for (const [path, body] of [
            [
                "bookings",
                { ...booking(org.serviceId, nextMonday(6)), ...extra },
            ],
            [
                "holds",
                {
                    ...booking(org.serviceId, nextMonday(6)),
                    pay: "now",
                    ...extra,
                },
            ],
            [
                "holds/release",
                { holdToken: "a-hold-token-that-is-long", ...extra },
            ],
            ["payments", { holdToken: "a-hold-token-that-is-long", ...extra }],
            [
                "orders",
                {
                    name: "Asha Rao",
                    lines: [{ productId: "product_1", quantity: 1 }],
                    fulfilment: "pickup",
                    payment: "on_handover",
                    ...extra,
                },
            ],
            [`forms/${form.id}/submissions`, { data: {}, ...extra }],
        ] as const) {
            const answer = await call(
                "POST",
                `/v1/storefront/write/${path}`,
                bearer(token),
                body,
            );
            expect({ path, status: answer.status }).toEqual({
                path,
                status: 400,
            });
            expect(answer.body.error?.code).toBe("invalid_request");
        }
        expect(
            await prisma.booking.count({ where: { organizationId: org.id } }),
        ).toBe(0);
        expect(
            await prisma.order.count({ where: { organizationId: org.id } }),
        ).toBe(0);
    });
});
