// @covers app:/sites/[siteId]/publish-requests/[requestId] app:/open api:mcp api:sites api:api-keys
import type { APIRequestContext, Browser, TestInfo } from "@playwright/test";
import { expect, test } from "@playwright/test";

import type { OwnBusiness } from "../fixtures/own-business";
import { makeBusiness } from "../fixtures/own-business";
import { stamp } from "../fixtures/own-data";
import { useSession } from "../fixtures/sessions";
import { ignoreHTTPSErrors, urls } from "../playwright.config";

/**
 * An AI app can't publish (DEC-215 as amended 12 Nov 2026): it prepares a
 * publish with `preview_publish` and hands the person a link; the person
 * publishes, or says no, on the publish request screen, desk and phone.
 * Everything is on a business of the spec's own (Asha's), with its own
 * website and a secret key with the AI switch on, so nothing another spec
 * reads is touched.
 *
 * @serial: it turns the MCP's global kill switch on for the stack (as
 * staff do), and puts it back as it was afterwards.
 */

const reason = "Browser test: an AI app's publish request";

/** Staff, in their own browser context, for the switches and grants. */
async function asStaff<T>(
    browser: Browser,
    run: (request: APIRequestContext) => Promise<T>,
): Promise<T> {
    const context = await browser.newContext({ ignoreHTTPSErrors });
    try {
        const staff = await context.newPage();
        await useSession(staff, "staff");
        return await run(staff.request);
    } finally {
        await context.close();
    }
}

const staffHeaders = { origin: urls.APP_URL };

async function setGlobalMcp(
    request: APIRequestContext,
    enabled: boolean,
    testInfo: TestInfo,
) {
    const res = await request.put(`${urls.API_URL}/admin/flags/API_MCP`, {
        headers: staffHeaders,
        data: {
            enabled,
            reason,
            idempotencyKey: `mcp-global-${enabled}-${stamp(testInfo)}`,
        },
    });
    expect(res.ok(), `API_MCP global: ${await res.text()}`).toBe(true);
}

/** The business may use secret keys and the MCP, and has a website. */
async function openUp(
    browser: Browser,
    business: OwnBusiness,
    testInfo: TestInfo,
) {
    await asStaff(browser, async (request) => {
        for (const flag of ["API_SECRET", "API_MCP", "MODULE_WEBSITE"]) {
            const res = await request.put(
                `${urls.API_URL}/admin/flags/${flag}/organizations/${business.id}`,
                {
                    headers: staffHeaders,
                    data: {
                        enabled: true,
                        reason,
                        idempotencyKey: `${flag}-${stamp(testInfo)}`,
                    },
                },
            );
            expect(res.ok(), `${flag}: ${await res.text()}`).toBe(true);
        }
        for (const moduleKey of ["api-secret", "api-keys"]) {
            const res = await request.post(
                `${urls.API_URL}/admin/organizations/${business.id}/overrides/modules`,
                {
                    headers: staffHeaders,
                    data: {
                        kind: "grant",
                        moduleKey,
                        reason,
                        idempotencyKey: `grant-${moduleKey}-${stamp(testInfo)}`,
                    },
                },
            );
            expect(res.ok(), `grant ${moduleKey}: ${await res.text()}`).toBe(
                true,
            );
        }
    });
}

const ownerHeaders = (business: OwnBusiness) => ({
    "x-organization-id": business.id,
    origin: urls.APP_URL,
});

/** The MCP's address on this stack: the API's host with `mcp.` for `api.`. */
const mcpHost = () => new URL(urls.API_URL).host.replace(/^api\./, "mcp.");

/** One MCP tool call with the key, as an AI app makes it. */
async function callTool(
    request: APIRequestContext,
    key: string,
    name: string,
    args: Record<string, unknown>,
) {
    const res = await request.post(`${urls.API_URL}/mcp`, {
        headers: {
            host: mcpHost(),
            authorization: `Bearer ${key}`,
            accept: "application/json, text/event-stream",
            "mcp-protocol-version": "2025-11-25",
        },
        data: {
            jsonrpc: "2.0",
            id: 1,
            method: "tools/call",
            params: { name, arguments: args },
        },
    });
    const text = await res.text();
    expect(res.ok(), `${name}: ${text}`).toBe(true);
    const json = text.startsWith("{")
        ? text
        : text
              .split("\n")
              .filter((l) => l.startsWith("data:"))
              .map((l) => l.slice(5))
              .join("");
    const body = JSON.parse(json) as {
        result?: { isError?: boolean; structuredContent?: unknown };
    };
    expect(body.result?.isError, json).toBeFalsy();
    return body.result?.structuredContent as Record<string, string>;
}

/** A business of its own, a website, and a key an AI app would use. */
async function setUp(
    browser: Browser,
    request: APIRequestContext,
    business: OwnBusiness,
    testInfo: TestInfo,
) {
    await openUp(browser, business, testInfo);
    const on = await request.put(
        `${urls.API_URL}/organizations/${business.id}/modules/WEBSITE`,
        { headers: ownerHeaders(business), data: { status: "ENABLED" } },
    );
    expect(on.ok(), `website on: ${await on.text()}`).toBe(true);
    const site = await request.post(
        `${urls.API_URL}/organizations/${business.id}/sites`,
        {
            headers: ownerHeaders(business),
            data: {
                name: `Site ${business.address}`,
                subdomain: business.address,
            },
        },
    );
    expect(site.ok(), `site: ${await site.text()}`).toBe(true);
    const siteId = ((await site.json()) as { id: string }).id;
    const made = await request.post(
        `${urls.API_URL}/organizations/${business.id}/api-keys`,
        {
            headers: ownerHeaders(business),
            data: {
                kind: "SECRET",
                name: `AI ${stamp(testInfo)}`,
                scope: ["site:read", "site:update", "site:publish"],
                aiEnabled: true,
            },
        },
    );
    expect(made.ok(), `key: ${await made.text()}`).toBe(true);
    const key = ((await made.json()) as { token: string }).token;
    return { siteId, key };
}

let mcpWasOn: boolean | null = null;
test.beforeEach(async ({ browser }, testInfo) => {
    await asStaff(browser, async (request) => {
        const res = await request.get(
            `${urls.API_URL}/admin/flags/API_MCP/explain`,
        );
        mcpWasOn = res.ok()
            ? ((await res.json()) as { value?: boolean }).value === true
            : false;
        if (!mcpWasOn) await setGlobalMcp(request, true, testInfo);
    });
});
test.afterEach(async ({ browser }, testInfo) => {
    if (mcpWasOn === false) {
        await asStaff(browser, (request) =>
            setGlobalMcp(request, false, testInfo),
        );
    }
    mcpWasOn = null;
});

test(
    "the person publishes what the AI app prepared, in Saroh",
    { tag: "@serial" },
    async ({ browser, page }, testInfo) => {
        const business = await makeBusiness(page, testInfo, "aipub");
        const { siteId, key } = await setUp(
            browser,
            page.request,
            business,
            testInfo,
        );
        const prepared = await callTool(page.request, key, "preview_publish", {
            site_id: siteId,
        });
        expect(prepared.will).toBe("go_live");
        const link = new URL(prepared.confirm_url);
        expect(link.pathname).toBe(`/open/${business.id}`);

        // The link opens the business and lands on the request; reading it
        // publishes nothing.
        await page.goto(`${link.pathname}${link.search}`);
        const screen = page.locator('[data-publish-request="open"]');
        await expect(screen).toBeVisible();
        await expect(screen).toContainText(`Site ${business.address}`);
        await expect(screen).toContainText("prepared this");
        await expect(
            screen.getByRole("button", { name: "Open the preview" }),
        ).toBeVisible();
        const before = await callTool(
            page.request,
            key,
            "get_publish_request",
            {
                site_id: siteId,
                request_id: prepared.request_id,
            },
        );
        expect(before.status).toBe("waiting");

        await screen
            .getByRole("button", { name: "Publish", exact: true })
            .click();
        const done = page.locator('[data-publish-request="published"]');
        await expect(done).toContainText("is live");

        const after = await callTool(page.request, key, "get_publish_request", {
            site_id: siteId,
            request_id: prepared.request_id,
        });
        expect(after.status).toBe("published");

        // Opened again, it says it was already answered, and offers nothing.
        await page.reload();
        await expect(
            page.locator('[data-publish-request="used"]'),
        ).toContainText("already published this");
        await expect(
            page.getByRole("button", { name: "Publish", exact: true }),
        ).toHaveCount(0);
    },
);

test(
    "Don't publish leaves the site as it was, and a replaced link says so",
    { tag: "@serial" },
    async ({ browser, page }, testInfo) => {
        const business = await makeBusiness(page, testInfo, "aino");
        const { siteId, key } = await setUp(
            browser,
            page.request,
            business,
            testInfo,
        );
        const first = await callTool(page.request, key, "preview_publish", {
            site_id: siteId,
        });
        const second = await callTool(page.request, key, "preview_publish", {
            site_id: siteId,
        });

        // The first link was replaced by the second.
        const old = new URL(first.confirm_url);
        await page.goto(`${old.pathname}${old.search}`);
        await expect(
            page.locator('[data-publish-request="expired"]'),
        ).toContainText("Ask the app to prepare it again.");

        const link = new URL(second.confirm_url);
        await page.goto(`${link.pathname}${link.search}`);
        await page
            .locator('[data-publish-request="open"]')
            .getByRole("button", { name: "Don't publish" })
            .click();
        await expect(
            page.locator('[data-publish-request="declined"]'),
        ).toContainText("Not published.");
        const status = await callTool(
            page.request,
            key,
            "get_publish_request",
            {
                site_id: siteId,
                request_id: second.request_id,
            },
        );
        expect(status.status).toBe("declined");
    },
);
