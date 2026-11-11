// @covers api:public-api api:api-keys api:bookings
import type { APIRequestContext } from "@playwright/test";
import { expect, test } from "@playwright/test";

import { grantNorthwindApi } from "../fixtures/api-grant";
import { northwind, stamp } from "../fixtures/own-data";
import { useSession } from "../fixtures/sessions";
import { ignoreHTTPSErrors, NORTHWIND_ORG, urls } from "../playwright.config";

/**
 * The storefront API end to end (plan 2026-11-10-001, U7): a business's own
 * website, on an origin of its own, reads a service's free times with a
 * publishable key and books one with a storefront token its server minted
 * with a secret key. The booking lands in the team's diary.
 *
 * The "website" is a page Playwright serves itself at TEST_ORIGIN, so the
 * calls are real cross-origin browser calls: CORS and the origin lists are
 * the browser's to enforce. The keys, and a service of its own with its
 * own times, are made for the test on Northwind and put away after.
 */
const TEST_ORIGIN = "http://localhost:4599";

/** Turn the public API's kill switches on for Northwind, as staff would. */
async function switchOn(
    browser: import("@playwright/test").Browser,
    idempotency: string,
) {
    const context = await browser.newContext({ ignoreHTTPSErrors });
    try {
        const staff = await context.newPage();
        await useSession(staff, "staff");
        for (const flag of ["API_STOREFRONT", "API_SECRET"]) {
            const res = await staff.request.put(
                `${urls.API_URL}/admin/flags/${flag}/organizations/${NORTHWIND_ORG}`,
                {
                    headers: { origin: urls.APP_URL },
                    data: {
                        enabled: true,
                        reason: "Browser test of the storefront API",
                        idempotencyKey: `${flag}-${idempotency}`,
                    },
                },
            );
            expect(res.ok(), `switch on ${flag}: ${await res.text()}`).toBe(
                true,
            );
        }
    } finally {
        await context.close();
    }
}

async function makeKey(
    request: APIRequestContext,
    body: Record<string, unknown>,
): Promise<{ id: string; token: string }> {
    const nw = northwind(request);
    const made = await nw.post<{ key: { id: string }; token: string }>(
        "/api-keys",
        body,
    );
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
    "a website books through the storefront API with a publishable key and a minted token",
    { tag: "@serial" },
    async ({ browser, page }, testInfo) => {
        await switchOn(browser, stamp(testInfo));
        api = await grantNorthwindApi(browser, testInfo);
        await useSession(page);
        const nw = northwind(page.request);
        const label = stamp(testInfo);

        // A free service of the test's own, open every day, all day.
        const service = await nw.post<{ id: string }>("/services", {
            name: `E2E Storefront ${label}`,
            durationMinutes: 30,
            timezone: "Asia/Kolkata",
            locationType: "ONLINE",
            meetingUrl: "https://meet.example.com/e2e-storefront",
            showOnBookingPage: true,
        });
        await nw.put(`/services/${service.id}/rules`, {
            rules: [0, 1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({
                dayOfWeek,
                startMinute: 0,
                endMinute: 1440,
            })),
        });
        const pk = await makeKey(page.request, {
            kind: "PUBLISHABLE",
            name: `E2E site ${label}`,
            allowedOrigins: [TEST_ORIGIN],
        });
        const sk = await makeKey(page.request, {
            kind: "SECRET",
            name: `E2E server ${label}`,
            scope: ["storefront:mint"],
        });
        const email = `sf-${label}@example.com`.toLowerCase();

        try {
            // The business's server mints the visitor's token.
            const minted = await page.request.post(
                `${urls.API_URL}/v1/storefront-tokens`,
                {
                    headers: { authorization: `Bearer ${sk.token}` },
                    data: { publishableKeyId: pk.id },
                },
            );
            expect(minted.status(), await minted.text()).toBe(201);
            const { token } = (await minted.json()) as { token: string };

            // The website, on its own origin.
            await page.route(`${TEST_ORIGIN}/**`, (route) =>
                route.fulfill({
                    contentType: "text/html",
                    body: "<!doctype html><title>Shop</title><h1>Shop</h1>",
                }),
            );
            await page.goto(`${TEST_ORIGIN}/`);

            const result = await page.evaluate(
                async ({ api, pk, token, serviceId, email }) => {
                    const base = `${api}/v1/storefront`;
                    const days = await fetch(
                        `${base}/${pk}/services/${serviceId}/days`,
                    );
                    if (!days.ok) return { step: "days", status: days.status };
                    const body = (await days.json()) as {
                        days: { starts: { startAt: string }[] }[];
                    };
                    const starts = body.days.flatMap((d) => d.starts);
                    // Try the free times in order until one is ours.
                    for (const start of starts.slice(0, 5)) {
                        const res = await fetch(`${base}/write/bookings`, {
                            method: "POST",
                            headers: {
                                authorization: `Bearer ${token}`,
                                "content-type": "application/json",
                            },
                            body: JSON.stringify({
                                serviceId,
                                startAt: start.startAt,
                                name: "Storefront Visitor",
                                email,
                            }),
                        });
                        if (res.status !== 409) {
                            return {
                                step: "book",
                                status: res.status,
                                booking: (await res.json()) as {
                                    startAt?: string;
                                    state?: string;
                                },
                            };
                        }
                    }
                    return { step: "book", status: 409 };
                },
                {
                    api: urls.API_URL,
                    pk: pk.token,
                    token,
                    serviceId: service.id,
                    email,
                },
            );
            expect(result, JSON.stringify(result)).toMatchObject({
                step: "book",
                status: 201,
                booking: { state: "CONFIRMED" },
            });

            // A publishable key never writes, even from its own origin.
            const write = await page.evaluate(
                async ({ api, pk }) =>
                    (
                        await fetch(`${api}/v1/storefront/${pk}/services`, {
                            method: "POST",
                        }).catch(() => null)
                    )?.status ?? "blocked",
                { api: urls.API_URL, pk: pk.token },
            );
            expect([403, "blocked"]).toContain(write);

            // The booking is in the team's diary.
            await expect
                .poll(async () => {
                    const list = await nw.get<
                        | { bookerEmail?: string | null }[]
                        | { data: { bookerEmail?: string | null }[] }
                    >(`/services/${service.id}/bookings`);
                    const rows = Array.isArray(list) ? list : list.data;
                    return rows.some((b) => b.bookerEmail === email);
                })
                .toBe(true);
        } finally {
            for (const key of [pk, sk]) {
                await page.request.post(
                    `${urls.API_URL}/organizations/${NORTHWIND_ORG}/api-keys/${key.id}/revoke`,
                    { headers: nw.headers },
                );
            }
            await nw.delete(`/services/${service.id}`);
        }
    },
);
