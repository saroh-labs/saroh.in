// @covers api:public-api api:api-keys api:products api:bookings api:customers
import type { APIRequestContext, Browser } from "@playwright/test";
import { expect, test } from "@playwright/test";

import { grantNorthwindApi } from "../fixtures/api-grant";
import { northwind, stamp } from "../fixtures/own-data";
import { useSession } from "../fixtures/sessions";
import { ignoreHTTPSErrors, NORTHWIND_ORG, urls } from "../playwright.config";

/**
 * The secret `/v1` API end to end (plan 2026-11-10-001, U8): a business's
 * server, with a secret key, makes a product (once, however often it
 * retries with the same Idempotency-Key), lists it, adds a customer that
 * never comes back with anything sensitive, books a service and cancels
 * the booking; a read-only key can't write. Everything is made for the
 * test on Northwind and put away after.
 */

/** Turn the secret API's kill switch on for Northwind, as staff would. */
async function switchOn(browser: Browser, idempotency: string) {
    const context = await browser.newContext({ ignoreHTTPSErrors });
    try {
        const staff = await context.newPage();
        await useSession(staff, "staff");
        const res = await staff.request.put(
            `${urls.API_URL}/admin/flags/API_SECRET/organizations/${NORTHWIND_ORG}`,
            {
                headers: { origin: urls.APP_URL },
                data: {
                    enabled: true,
                    reason: "Browser test of the secret API",
                    idempotencyKey: `API_SECRET-v1-${idempotency}`,
                },
            },
        );
        expect(res.ok(), `switch on API_SECRET: ${await res.text()}`).toBe(
            true,
        );
    } finally {
        await context.close();
    }
}

async function makeKey(
    request: APIRequestContext,
    name: string,
    scope: string[],
): Promise<{ id: string; token: string }> {
    const made = await northwind(request).post<{
        key: { id: string };
        token: string;
    }>("/api-keys", { kind: "SECRET", name, scope });
    return { id: made.key.id, token: made.token };
}

// @serial: it grants Northwind the API's plan rows, which every API spec
// reads; afterEach ends them even when the test fails.
let api: { restore: () => Promise<void> } | undefined;
test.afterEach(async () => {
    await api?.restore();
    api = undefined;
});

test(
    "a business's server runs its catalogue, customers and bookings through /v1",
    { tag: "@serial" },
    async ({ browser, page }, testInfo) => {
        const label = stamp(testInfo);
        await switchOn(browser, label);
        api = await grantNorthwindApi(browser, testInfo);
        await useSession(page);
        const nw = northwind(page.request);
        const storefronts = await nw.get<{ id: string }[]>("/storefronts");
        const storefront = storefronts[0];
        expect(storefront, "Northwind has a storefront").toBeTruthy();

        const service = await nw.post<{ id: string }>("/services", {
            name: `E2E v1 ${label}`,
            durationMinutes: 30,
            timezone: "Asia/Kolkata",
        });
        await nw.put(`/services/${service.id}/rules`, {
            rules: [0, 1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({
                dayOfWeek,
                startMinute: 0,
                endMinute: 1440,
            })),
        });
        const sk = await makeKey(page.request, `E2E server ${label}`, [
            "store:read",
            "store:write",
            "contact:read",
            "contact:write",
            "booking:read",
            "booking:write",
        ]);
        const readOnly = await makeKey(page.request, `E2E reader ${label}`, [
            "store:read",
        ]);
        const v1 = (
            token: string,
            method: string,
            path: string,
            data?: unknown,
            extra: Record<string, string> = {},
        ) =>
            page.request.fetch(`${urls.API_URL}/v1${path}`, {
                method,
                headers: { authorization: `Bearer ${token}`, ...extra },
                ...(data === undefined ? {} : { data }),
            });
        const made: { product?: string; customer?: string } = {};

        try {
            // A product, sent twice with one Idempotency-Key: made once.
            const body = {
                name: `E2E v1 loaf ${label}`,
                price: { amountMinor: 18_000, currency: "INR" },
                storefrontId: storefront.id,
            };
            const retry = { "idempotency-key": `v1-product-${label}` };
            const first = await v1(sk.token, "POST", "/products", body, retry);
            expect(first.status(), await first.text()).toBe(201);
            const product = (await first.json()) as { id: string };
            made.product = product.id;
            const again = await v1(sk.token, "POST", "/products", body, retry);
            expect(await again.json()).toEqual(product);

            const read = await v1(sk.token, "GET", `/products/${product.id}`);
            expect(await read.json()).toMatchObject({
                id: product.id,
                price: { amountMinor: 18_000, currency: "INR" },
            });

            // A read-only key reads, and can't write.
            expect(
                (await v1(readOnly.token, "GET", "/products?limit=1")).status(),
            ).toBe(200);
            const refused = await v1(readOnly.token, "POST", "/products", body);
            expect(refused.status()).toBe(403);
            expect(await refused.json()).toMatchObject({
                error: { code: "forbidden" },
            });

            // A customer: a fixed list of fields, nothing sensitive.
            const customer = await v1(sk.token, "POST", "/customers", {
                email: `v1-${label}@example.com`.toLowerCase(),
                firstName: "Meera",
            });
            expect(customer.status(), await customer.text()).toBe(201);
            const person = (await customer.json()) as Record<string, unknown>;
            made.customer = String(person.id);
            expect(Object.keys(person)).not.toContain("attention");

            // A booking, then cancelled under the business's policy.
            const start = new Date(Date.now() + 3 * 86_400_000);
            start.setUTCMinutes(start.getUTCMinutes() < 30 ? 30 : 0, 0, 0);
            const booked = await v1(sk.token, "POST", "/bookings", {
                serviceId: service.id,
                startAt: start.toISOString(),
                contactId: made.customer,
            });
            expect(booked.status(), await booked.text()).toBe(201);
            const booking = (await booked.json()) as { id: string };
            const cancelled = await v1(
                sk.token,
                "POST",
                `/bookings/${booking.id}/cancel`,
            );
            expect(cancelled.status()).toBe(200);
            expect(await cancelled.json()).toMatchObject({
                status: "cancelled",
                money: { refund: null },
            });
        } finally {
            for (const key of [sk, readOnly]) {
                await page.request.post(
                    `${urls.API_URL}/organizations/${NORTHWIND_ORG}/api-keys/${key.id}/revoke`,
                    { headers: nw.headers },
                );
            }
            // Best effort: a person with a booking on record may be kept.
            for (const path of [
                made.product && `/products/${made.product}`,
                made.customer && `/contacts/${made.customer}`,
            ]) {
                if (!path) continue;
                await page.request.delete(
                    `${urls.API_URL}/organizations/${NORTHWIND_ORG}${path}`,
                    { headers: nw.headers },
                );
            }
            await nw.delete(`/services/${service.id}`);
        }
    },
);
