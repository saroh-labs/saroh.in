// @covers api:sites api:admin site:/
import { expect, test } from "@playwright/test";

import { setNorthwindLook } from "../fixtures/site-look";
import { urls } from "../playwright.config";

/**
 * A look per site, behind `SITE_LOOKS` (DEC-172, plan U2, #1086).
 *
 * Through the one helper every per-look spec uses (`fixtures/site-look.ts`):
 * it turns the flag on for Northwind alone, sets the look in the draft and
 * puts both back. What a look draws is U4's and later units'; this checks
 * the contract they stand on: the flag gates choosing, never keeping or
 * clearing, and a publish carries the look's safe colours to the live
 * site, while Classic carries none.
 *
 * @serial: it changes and publishes Northwind's site style.
 */

const renderer = new URL(urls.RENDERER_URL);
const SITE = `${renderer.protocol}//northwind.${renderer.host}`;

test.describe("a look per site", { tag: "@serial" }, () => {
    test("publishes a look's safe colours, and Classic comes back without them", async ({
        browser,
        page,
    }, testInfo) => {
        test.setTimeout(120_000);
        const look = await setNorthwindLook(browser, "quiet", testInfo);
        try {
            await look.publish();
            await expect
                .poll(
                    async () => {
                        const res = await page.request.get(`${SITE}/`);
                        return (await res.text()).includes(
                            "--site-accent-text",
                        );
                    },
                    { timeout: 30_000 },
                )
                .toBe(true);
        } finally {
            await look.restore();
        }
        await expect
            .poll(
                async () => {
                    const res = await page.request.get(`${SITE}/`);
                    return (await res.text()).includes("--site-accent-text");
                },
                { timeout: 30_000 },
            )
            .toBe(false);
    });

    test("with the flag off, keeps or clears a look but refuses another", async ({
        browser,
    }, testInfo) => {
        const look = await setNorthwindLook(browser, "quiet", testInfo);
        try {
            await look.flag(false);

            const kept = await look.saveLook("quiet");
            expect(kept.status()).toBe(200);

            const another = await look.saveLook("folio");
            expect(another.status()).toBe(400);
            expect(await another.json()).toMatchObject({
                details: { field: "look", code: "look-not-available" },
            });

            const classic = await look.saveLook(null);
            expect(classic.status()).toBe(200);
            const body = (await classic.json()) as {
                style: Record<string, unknown>;
            };
            expect(body.style).not.toHaveProperty("look");

            // From Classic, with the flag off: refused.
            const fromClassic = await look.saveLook("quiet");
            expect(fromClassic.status()).toBe(400);
        } finally {
            await look.restore();
        }
    });
});
