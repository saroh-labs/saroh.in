// @covers app:/open api:ai api:media api:products
import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import { pressUntil } from "../fixtures/press";
import { useSession } from "../fixtures/sessions";
import type { Storefront } from "../fixtures/throwaway-products";
import { removeProducts, takeProduct } from "../fixtures/throwaway-products";
import { urls } from "../playwright.config";

/**
 * Images in Ask AI (owner, 22 Nov): a picture attached in the box goes up
 * through the media pipeline as a chat image, the question is asked with it,
 * and "use this as the photo of product …" comes back as a draft card with
 * the picture in its Now and New rows. Nothing changes until Apply; Apply
 * puts the photo on the product and makes it one of Your photos.
 *
 * The answer is the stack's script (`AI_PROVIDER_FAKE`, `fake-script.ts`).
 * The upload: this stack's storage is the in-memory adapter, whose upload
 * address resolves nowhere, so the browser's PUT is answered here, with the
 * page's CSP bypassed for that host (as `photo-sizes.spec.ts`). One person
 * runs one turn at a time, so it is `@serial`.
 */
test.use({ bypassCSP: true });

const NW: Storefront = { organizationId: "seed_org", storeId: "seed_store" };
const UPLOAD_HOST = /^https:\/\/memory\.object-storage\.test\//;
const orgHeader = {
    "x-organization-id": NW.organizationId,
    origin: urls.APP_URL,
};

/** A small PNG drawn in the page. */
async function picture(page: Page): Promise<Buffer> {
    const base64 = await page.evaluate(async () => {
        const canvas = document.createElement("canvas");
        canvas.width = 640;
        canvas.height = 480;
        const ctx = canvas.getContext("2d");
        if (!ctx) return "";
        ctx.fillStyle = "#c9784a";
        ctx.fillRect(0, 0, 640, 480);
        ctx.fillStyle = "#2f2a26";
        ctx.fillRect(120, 120, 400, 240);
        const blob = await new Promise<Blob | null>((r) =>
            canvas.toBlob(r, "image/png"),
        );
        if (!blob) return "";
        const bytes = new Uint8Array(await blob.arrayBuffer());
        let text = "";
        for (const b of bytes) text += String.fromCharCode(b);
        return btoa(text);
    });
    return Buffer.from(base64, "base64");
}

test.describe("Ask AI: images", { tag: "@serial" }, () => {
    test("an attached picture is asked with, drafted onto a product and applied only on Apply", async ({
        page,
        isMobile,
    }, testInfo) => {
        test.setTimeout(120_000);
        const name = `E2E Ask AI Photo ${testInfo.project.name}`;
        const filename = `e2e-ask-ai-${testInfo.project.name}.png`;
        await useSession(page);
        const id = await takeProduct(page.request, NW, name, {
            price: "120.00",
            status: "DRAFT",
        });
        await page.route(UPLOAD_HOST, (route) =>
            route.fulfill({
                status: 200,
                headers: { "access-control-allow-origin": "*" },
                body: "",
            }),
        );
        try {
            await page.goto(`/open/${NW.organizationId}`);
            const entry = page
                .getByRole("button", { name: /^Ask AI/ })
                .filter({ visible: true });
            const panel = page.getByRole("dialog", { name: "Ask AI" });
            await pressUntil(entry, panel);

            // Attach: the picture is made ready, uploaded, and counted.
            await panel.locator("input[data-ask-ai-images]").setInputFiles({
                name: filename,
                mimeType: "image/png",
                buffer: await picture(page),
            });
            await expect(panel.getByText("1 of 10")).toBeVisible();
            await expect(
                panel.getByRole("button", { name: /^Remove / }),
            ).toBeVisible();

            await panel
                .getByRole("textbox", { name: "Ask a question" })
                .fill(`Use this image as the photo of product ${id}`);
            await panel
                .getByRole("button", { name: "Ask", exact: true })
                .click();

            // The sent message shows its picture; the answer is a draft card
            // with the picture in New, and the product is unchanged.
            await expect(
                panel.getByRole("list", { name: "1 image sent" }),
            ).toBeVisible();
            const card = panel.locator("[data-photo-words]");
            await expect(card).toBeVisible();
            await expect(card.locator("img")).toHaveCount(1);
            await expect(card).toContainText("No photo");
            await expect(card).toContainText("A test photo");
            await expect(panel).toContainText("Not applied yet");
            const before = await page.request.get(
                `${urls.API_URL}/stores/${NW.storeId}/products/${id}/images`,
                { headers: orgHeader },
            );
            expect(await before.json()).toEqual([]);

            await panel.getByRole("button", { name: "Apply" }).click();
            await expect(panel).toContainText("Saved · shows in your shop");
            const after = await page.request.get(
                `${urls.API_URL}/stores/${NW.storeId}/products/${id}/images`,
                { headers: orgHeader },
            );
            expect(await after.json()).toHaveLength(1);
            if (isMobile) {
                // The panel is as wide as the screen: nothing runs off it.
                const box = await card.boundingBox();
                expect(box?.x ?? 0).toBeGreaterThanOrEqual(0);
            }
        } finally {
            await removeProducts(page.request, NW, name);
            const library = await page.request.get(
                `${urls.API_URL}/organizations/${NW.organizationId}/media`,
                { headers: orgHeader },
            );
            const rows = (await library.json()) as {
                id: string;
                filename: string;
            }[];
            for (const m of rows.filter((r) =>
                r.filename.startsWith("e2e-ask-ai-"),
            )) {
                await page.request.delete(
                    `${urls.API_URL}/organizations/${NW.organizationId}/media/${m.id}`,
                    { headers: orgHeader },
                );
            }
        }
    });
});
