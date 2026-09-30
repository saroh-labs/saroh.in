// @covers site:/pay/[token] site:/pay/o/[token] api:invoices api:payments
import type { APIRequestContext } from "@playwright/test";
import { expect, test } from "@playwright/test";

import { northwind, stamp } from "../fixtures/own-data";
import { useSession } from "../fixtures/sessions";
import { urls } from "../playwright.config";

/**
 * Pay pages on the business's own address (DEC-069, plan L6).
 *
 * A pay link opens at `<its host>/pay/<token>`: on the renderer's apex, as
 * every link issued so far does, and on a business's own host, which the
 * renderer serves with the same page. Opened on another business's host, the
 * page sends the customer to the link's own address (the API's `payUrl`),
 * so Northwind's invoice never shows under Rye's name.
 *
 * `PAY_LINK_ON_SITE` decides that address: off (the default, and this
 * stack), it is the apex, so Northwind's own host sends there too; on, it
 * is Northwind's host. The spec asserts against whatever `payUrl` says.
 *
 * Runs on Northwind with an invoice it issues itself; Rye & Co.'s host is
 * only visited, never written to.
 */

const renderer = new URL(urls.RENDERER_URL);
const hostOf = (sub: string) => `${renderer.protocol}//${sub}.${renderer.host}`;
const NORTHWIND = hostOf("northwind");
const RYE = hostOf("rye-and-co");

/** An issued Northwind invoice and its fresh pay link's token. */
async function issuedInvoice(
    request: APIRequestContext,
    tag: string,
): Promise<{ number: string; token: string }> {
    const nw = northwind(request);
    const contact = await nw.post<{ id: string }>("/contacts", {
        email: `l6-${tag}@example.test`,
        firstName: "Tara",
        lastName: `Pay ${tag}`,
    });
    const draft = await nw.post<{ id: string }>("/invoices", {
        contactId: contact.id,
        currency: "INR",
        lines: [
            {
                description: `Tasting menu (${tag})`,
                quantity: 1,
                unitPrice: "800",
            },
        ],
    });
    await nw.post(`/invoices/${draft.id}/issue`);
    const { url } = await nw.post<{ url: string }>(
        `/invoices/${draft.id}/pay-link`,
    );
    const read = await nw.get<{ number: string | null }>(
        `/invoices/${draft.id}`,
    );
    const token = new URL(url).pathname.split("/").pop() ?? "";
    return { number: read.number ?? "", token };
}

/** Where the API says the link lives. */
async function payUrlOf(
    request: APIRequestContext,
    token: string,
): Promise<URL> {
    const res = await request.get(`${urls.API_URL}/public/invoices/${token}`);
    expect(res.ok(), await res.text()).toBe(true);
    const { payUrl } = (await res.json()) as { payUrl?: string };
    expect(payUrl, "the pay read says where its link lives").toBeTruthy();
    return new URL(payUrl ?? "");
}

test.describe("pay links on the business's own address (L6)", () => {
    test("the apex link and Northwind's own host open the same invoice", async ({
        page,
    }, testInfo) => {
        await useSession(page);
        const request = page.request;
        const { number, token } = await issuedInvoice(request, stamp(testInfo));
        const home = await payUrlOf(request, token);
        // This stack's own renderer, never a live address to leave for.
        expect(
            home.hostname === renderer.hostname ||
                home.hostname.endsWith(`.${renderer.hostname}`),
            `payUrl ${home.href} is on this stack's renderer (${renderer.host}): set the API's RENDERER_URL`,
        ).toBe(true);
        const heading = page.getByRole("heading", {
            name: `Invoice ${number}`,
        });

        // Every link issued before DEC-069: the apex, served as it was.
        await page.goto(`${urls.RENDERER_URL}/pay/${token}`);
        await expect(heading).toBeVisible();
        await expect.poll(() => new URL(page.url()).host).toBe(renderer.host);

        // The business's own host: the same page, or on to the link's home.
        await page.goto(`${NORTHWIND}/pay/${token}`);
        await expect(heading).toBeVisible();
        await expect.poll(() => new URL(page.url()).host).toBe(home.host);
    });

    test("another business's host sends the customer to the link's own", async ({
        page,
    }, testInfo) => {
        await useSession(page);
        const request = page.request;
        const { number, token } = await issuedInvoice(request, stamp(testInfo));
        const home = await payUrlOf(request, token);

        // A 307 to exactly payUrl, still a credential: no referrer, no index.
        const hop = await request.get(`${RYE}/pay/${token}`, {
            maxRedirects: 0,
        });
        expect(hop.status()).toBe(307);
        expect(hop.headers().location).toBe(home.href);
        expect(hop.headers()["referrer-policy"]).toBe("no-referrer");

        await page.goto(`${RYE}/pay/${token}`);
        await expect(
            page.getByRole("heading", { name: `Invoice ${number}` }),
        ).toBeVisible();
        await expect.poll(() => new URL(page.url()).host).toBe(home.host);
    });

    test("an order's pay path is served on a tenant host too", async ({
        request,
    }) => {
        // No such link: the order pay page's own "no longer works", on the
        // business's host, never the site's 404 or the account area's.
        const res = await request.get(`${NORTHWIND}/pay/o/not-a-token`, {
            maxRedirects: 0,
        });
        expect(res.status()).toBe(200);
        expect(await res.text()).toContain("This link no longer works");
    });
});
