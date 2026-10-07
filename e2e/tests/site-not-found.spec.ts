// @covers site:/[slug] site:/[slug]/[postSlug] site:/shop
import { expect, test } from "@playwright/test";

import { urls } from "../playwright.config";

/**
 * A path a live site doesn't have answers 404, not a soft 404 (UX-071).
 *
 * The renderer's segment loading state streamed every page from its first
 * byte, so a page that called `notFound()` had already sent 200. It reads
 * nothing: Northwind's live site, as the seed publishes it.
 */
const renderer = new URL(urls.RENDERER_URL);
const northwind = `${renderer.protocol}//northwind.${renderer.host}`;

test("an unknown page, post or product on a live site is a 404", async ({
    request,
}) => {
    for (const path of [
        "/no-such-page-here",
        "/no-such-page-here/nor-this",
        "/shop/no-such-product-here",
    ]) {
        const res = await request.get(`${northwind}${path}`, {
            maxRedirects: 0,
        });
        expect(res.status(), path).toBe(404);
    }
    // And the home page still serves.
    expect((await request.get(`${northwind}/`)).status()).toBe(200);
});
