// @covers app:/settings/share app:/open site:/q/[id] api:sites api:organizations api:billing
import type { APIRequestContext, TestInfo } from "@playwright/test";
import { expect, test } from "@playwright/test";

import { expectNothingHiddenSideways } from "../fixtures/hidden-sideways";
import { northwind, stamp } from "../fixtures/own-data";
import { useSession } from "../fixtures/sessions";
import { NORTHWIND_ORG, urls } from "../playwright.config";

/**
 * Settings › Share › QR codes, end to end (plan U5): the owner makes a code
 * in the maker, a phone opens its short link on the site's address, and the
 * list on the same screen shows the scan.
 *
 * Only a real stack and a real browser answer these: that what is on screen
 * before "Make this code" is a sample with no link, that the link shown
 * after it is one the site's `/q/<code>` really answers, that the count the
 * list reads is the one that scan wrote, that a download is a real file
 * (the PNG is drawn on a canvas from the SVG), and that the three columns
 * and the list fit a phone with nothing hidden sideways.
 *
 * The test owns its data: its own code on Northwind's site, placed
 * "Other…" with a stamp no other test shares (so the maker never matches
 * another test's code, and desk and phone don't meet), found by that stamp
 * and retired at the end. It reads no count but that code's.
 */
const renderer = new URL(urls.RENDERER_URL);
const LIVE = `${renderer.protocol}//northwind.${renderer.host}`;

const PHONE =
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";

interface QrCode {
    id: string;
    code: string;
    placeNote: string | null;
    retired: boolean;
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
 * range), in the header the renderer reads: the scan limit counts each
 * address, and desk and phone run at the same moment.
 */
function visitor(testInfo: TestInfo): Record<string, string> {
    const worker = testInfo.parallelIndex % 256;
    const last = Math.floor(Math.random() * 254) + 1;
    return {
        "cf-connecting-ip": `198.18.${worker}.${last}`,
        "user-agent": PHONE,
    };
}

test("the owner makes a QR code, a phone scans it, and the list counts it", async ({
    page,
    request,
}, testInfo) => {
    const note = `Shelf ${stamp(testInfo)}`;
    await useSession(page);
    const nw = northwind(page.request);
    const siteId = await northwindSite(page.request);
    const codes = `/sites/${siteId}/qr-codes`;
    const mine = async () =>
        (await nw.get<{ codes: QrCode[] }>(codes)).codes.find(
            (c) => c.placeNote === note,
        );

    try {
        await page.goto(`/open/${NORTHWIND_ORG}`);
        await page.goto("/settings/share");
        await expect(
            page.getByRole("heading", { name: "Share", level: 2 }),
        ).toBeVisible();
        await expect(
            page.getByRole("heading", { name: "QR codes", exact: true }),
        ).toBeVisible();

        // What it opens, and where it goes: this test's own place.
        await page.getByRole("radio", { name: /^Website/ }).click();
        await page.getByRole("radio", { name: "Other…" }).click();
        await page.getByLabel("Where is that?").fill(note);

        // Until it is made, the code on screen is a sample with no link.
        const card = page.locator("[data-qr-card]");
        await expect(card).toHaveAttribute("data-qr-card", "sample");
        await expect(card.locator("[data-qr-link]")).toHaveCount(0);
        await expect(card).toContainText(
            "Your UPI QR stays separate. This one opens your page, not a payment.",
        );

        if (testInfo.project.name.startsWith("phone")) {
            // The three columns stack; nothing is cut off sideways.
            await expectNothingHiddenSideways(page);
        }

        await page.getByRole("button", { name: "Make this code" }).click();
        await expect(card).toHaveAttribute("data-qr-card", "code");
        const link = card.locator("[data-qr-link]");
        await expect(link).toHaveText(/\/q\/[0-9a-z]{3,6}$/);
        const shown = (await link.textContent()) ?? "";
        const code = shown.slice(shown.lastIndexOf("/") + 1);
        // On the business's Saroh address, as the API made it.
        expect(shown).toBe(`northwind.${renderer.host}/q/${code}`);

        // The list has it, placed where this test put it, unscanned.
        const row = page.locator(`[data-qr-row="${code}"]`);
        await expect(row).toContainText(note);
        await expect(row).toContainText("Website");
        await expect(row.locator("[data-qr-scans]")).toHaveText("0");

        // The files are real: the SVG as it is, the PNG drawn from it.
        for (const [name, ext] of [
            ["Download SVG", "svg"],
            ["Download PNG", "png"],
        ] as const) {
            const [download] = await Promise.all([
                page.waitForEvent("download"),
                page.getByRole("button", { name, exact: true }).click(),
            ]);
            expect(download.suggestedFilename()).toMatch(
                new RegExp(`^northwind[a-z0-9-]*-qr-${code}\\.${ext}$`),
            );
        }

        // A phone scans the printed code: the site forwards it, tagged.
        const scan = await request.get(`${LIVE}/q/${code}`, {
            maxRedirects: 0,
            headers: visitor(testInfo),
        });
        expect(scan.status()).toBe(302);
        expect(scan.headers().location).toContain(`src=qr-${code}`);

        // And the list on this screen shows that scan.
        await expect(async () => {
            await page.reload();
            await expect(
                page.locator(`[data-qr-row="${code}"] [data-qr-scans]`),
            ).toHaveText("1", { timeout: 5_000 });
        }).toPass();

        if (testInfo.project.name.startsWith("phone")) {
            // The list is cards here: every value in view, none sideways.
            await expect(row).toContainText("Scans");
            await expectNothingHiddenSideways(page);
        }

        // Retiring asks first, and says where the printed code will go.
        await row
            .getByRole("button", { name: `Retire the ${note} code` })
            .click();
        const dialog = page.getByRole("alertdialog");
        await expect(dialog).toContainText("will land on your home page");
        await dialog.getByRole("button", { name: "Retire code" }).click();
        await expect(row).toHaveCount(0);
        await expect(page.locator(`[data-qr-retired="${code}"]`)).toContainText(
            note,
        );
        await expect.poll(async () => (await mine())?.retired).toBe(true);
    } finally {
        // Leave nothing live behind on Northwind's site.
        const left = await mine();
        if (left && !left.retired) {
            await nw.post(`${codes}/${left.id}/retire`);
        }
    }
});
