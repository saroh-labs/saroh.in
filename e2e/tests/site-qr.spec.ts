// @covers site:/q/[id] site:/book api:sites
import type { APIRequestContext, TestInfo } from "@playwright/test";
import { expect, test } from "@playwright/test";

import { northwind } from "../fixtures/own-data";
import { useSession } from "../fixtures/sessions";
import { urls } from "../playwright.config";

/**
 * A QR code's short link on a live site, end to end: the owner makes a code
 * for the booking page through the API, a phone opens `/q/<code>` on the
 * site's address, and the workspace's list shows the scan.
 *
 * Only a real stack answers these: the redirect's Location must be absolute
 * on the edge runtime (a relative one throws there), the site's server must
 * sign the visitor relay the API accepts, and the count must be written,
 * not only read back as 0.
 *
 * The test owns its data: its own code on Northwind's site, found by id,
 * and retired at the end. It reads no count but that code's.
 */
const renderer = new URL(urls.RENDERER_URL);
const LIVE = `${renderer.protocol}//northwind.${renderer.host}`;

const PHONE =
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";

interface QrCode {
    id: string;
    code: string;
    link: string | null;
    retired: boolean;
    target: { kind: string; path: string | null };
    scans: { total: number; last7Days: number };
}

async function northwindSite(request: APIRequestContext): Promise<string> {
    const sites =
        await northwind(request).get<
            { id: string; subdomain: string | null }[]
        >("/sites");
    const site = sites.find((s) => s.subdomain === "northwind");
    expect(site, "Northwind has its site at northwind").toBeTruthy();
    return site?.id ?? "";
}

/**
 * A visitor address of this test's own (198.18.0.0/15, the benchmarking
 * range), in the one header the renderer reads, as Cloudflare's edge would
 * send it: the scan limit counts each address, and desk and phone run at
 * the same moment.
 */
function visitor(testInfo: TestInfo): Record<string, string> {
    const worker = testInfo.parallelIndex % 256;
    const last = Math.floor(Math.random() * 254) + 1;
    return {
        "cf-connecting-ip": `198.18.${worker}.${last}`,
        "user-agent": PHONE,
    };
}

test("a QR code's short link counts the scan and opens the booking page", async ({
    page,
    request,
}, testInfo) => {
    await useSession(page);
    const nw = northwind(page.request);
    const siteId = await northwindSite(page.request);
    const codes = `/sites/${siteId}/qr-codes`;
    const mine = async (id: string) => {
        const list = await nw.get<{ codes: QrCode[] }>(codes);
        return list.codes.find((c) => c.id === id);
    };

    const made = await nw.post<QrCode>(codes, {
        targetKind: "BOOK",
        place: "COUNTER",
        label: "Scan to book",
    });
    try {
        expect(made.code).toMatch(/^[0-9a-z]{3,6}$/);
        expect(made.target).toMatchObject({ kind: "BOOK", path: "/book" });
        expect(made.scans).toEqual({ total: 0, last7Days: 0 });
        // The link is on the business's Saroh address.
        const link = new URL(made.link ?? "");
        expect(link.hostname).toBe(`northwind.${renderer.hostname}`);
        expect(link.pathname).toBe(`/q/${made.code}`);

        const short = `${LIVE}/q/${made.code}`;
        const headers = visitor(testInfo);

        // A scan: 302, an absolute Location on the address asked, the tag.
        const first = await request.get(short, { maxRedirects: 0, headers });
        expect(first.status()).toBe(302);
        const location = first.headers().location;
        expect(location).toBe(`${LIVE}/book?src=qr-${made.code}`);
        expect(new URL(location).origin).toBe(new URL(LIVE).origin);
        expect(first.headers()["cache-control"]).toContain("no-store");

        // The list shows it, and a second scan is a second count: nothing
        // answered the second from a cache.
        await expect
            .poll(async () => (await mine(made.id))?.scans.total)
            .toBe(1);
        const second = await request.get(short, { maxRedirects: 0, headers });
        expect(second.status()).toBe(302);
        await expect
            .poll(async () => (await mine(made.id))?.scans)
            .toEqual({ total: 2, last7Days: 2 });

        // Asking only for the headers forwards the same way, uncounted.
        const head = await request.head(short, { maxRedirects: 0, headers });
        expect(head.status()).toBe(302);
        expect(head.headers().location).toBe(location);
        expect((await mine(made.id))?.scans.total).toBe(2);

        // A code the site doesn't have is its 404, not a redirect.
        const unknown = await request.get(`${LIVE}/q/zzzzzz`, {
            maxRedirects: 0,
            headers,
        });
        expect(unknown.status()).toBe(404);

        // In a browser, the visitor lands on the booking page with the tag
        // on the address.
        await page.setExtraHTTPHeaders({
            "cf-connecting-ip": headers["cf-connecting-ip"] ?? "",
        });
        await page.goto(short);
        await expect(page).toHaveURL(`${LIVE}/book?src=qr-${made.code}`);

        // Retired: paper still opens the site, at its home page, untagged.
        const total = (await mine(made.id))?.scans.total ?? 0;
        const retired = await nw.post<QrCode>(`${codes}/${made.id}/retire`);
        expect(retired.retired).toBe(true);
        const after = await request.get(short, { maxRedirects: 0, headers });
        expect(after.status()).toBe(302);
        expect(after.headers().location).toBe(`${LIVE}/`);
        expect((await mine(made.id))?.scans.total).toBe(total);
    } finally {
        // Leave nothing live behind on Northwind's site.
        await nw.post(`${codes}/${made.id}/retire`);
    }
});
