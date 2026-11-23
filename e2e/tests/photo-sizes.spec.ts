// @covers app:/open app:/commerce/products/[productId]/edit api:media api:products pkg:block-contract
import type { APIRequestContext, Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import { useSession } from "../fixtures/sessions";
import type { Storefront } from "../fixtures/throwaway-products";
import { removeProducts, takeProduct } from "../fixtures/throwaway-products";
import { urls } from "../playwright.config";

/**
 * A photo is made ready on the merchant's device (DEC-246): re-drawn as
 * WebP without its camera metadata, a full copy and smaller ones, and a
 * ThumbHash blur, before a byte goes up.
 *
 * On Northwind, a throwaway product's editor takes a phone photo (a JPEG
 * carrying an Exif block with a location marker). What goes up is checked
 * as the browser sends it: every file a WebP, none with the Exif block or
 * the marker. The library then has the photo's size, its blur and its
 * copies' widths, and the editor's tile draws the 480 copy. The product is
 * never saved; the photo is deleted and the product taken away after.
 *
 * The upload: this stack's storage is the in-memory adapter, whose upload
 * address resolves nowhere, so the browser's PUTs are answered (and read)
 * here, with the page's CSP bypassed for that host (as `site-icon.spec.ts`).
 */
test.use({ bypassCSP: true });

const NW: Storefront = { organizationId: "seed_org", storeId: "seed_store" };
const UPLOAD_HOST = /^https:\/\/memory\.object-storage\.test\//;
const MARKER = "SAROH-E2E-GPS-12.9716N-77.5946E";
const orgHeader = {
    "x-organization-id": NW.organizationId,
    origin: urls.APP_URL,
};

interface LibraryItem {
    id: string;
    filename: string;
    contentType: string;
    width: number | null;
    height: number | null;
    placeholder: string | null;
    widths: number[];
}

/** A 1600 × 1200 JPEG drawn in the page, with an Exif block put in. */
async function phonePhoto(page: Page): Promise<Buffer> {
    const base64 = await page.evaluate(async () => {
        const canvas = document.createElement("canvas");
        canvas.width = 1600;
        canvas.height = 1200;
        const ctx = canvas.getContext("2d");
        if (!ctx) return "";
        const g = ctx.createLinearGradient(0, 0, 1600, 1200);
        g.addColorStop(0, "#c9784a");
        g.addColorStop(1, "#2f2a26");
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, 1600, 1200);
        const blob = await new Promise<Blob | null>((r) =>
            canvas.toBlob(r, "image/jpeg", 0.9),
        );
        if (!blob) return "";
        const bytes = new Uint8Array(await blob.arrayBuffer());
        let text = "";
        for (const b of bytes) text += String.fromCharCode(b);
        return btoa(text);
    });
    const jpeg = Buffer.from(base64, "base64");
    // APP1 "Exif": a big-endian TIFF header, an empty IFD, then the marker.
    const payload = Buffer.concat([
        Buffer.from("Exif\0\0", "latin1"),
        Buffer.from([0x4d, 0x4d, 0, 0x2a, 0, 0, 0, 8, 0, 0, 0, 0, 0, 0]),
        Buffer.from(MARKER, "latin1"),
    ]);
    const app1 = Buffer.alloc(4);
    app1.writeUInt16BE(0xffe1, 0);
    app1.writeUInt16BE(payload.length + 2, 2);
    return Buffer.concat([
        jpeg.subarray(0, 2),
        app1,
        payload,
        jpeg.subarray(2),
    ]);
}

async function library(request: APIRequestContext): Promise<LibraryItem[]> {
    const res = await request.get(
        `${urls.API_URL}/organizations/${NW.organizationId}/media`,
        { headers: orgHeader },
    );
    expect(res.ok()).toBe(true);
    return (await res.json()) as LibraryItem[];
}

test.describe("a photo made ready on the device (DEC-246)", () => {
    test("goes up as WebP copies with no camera metadata, with its blur and sizes", async ({
        page,
    }, testInfo) => {
        test.setTimeout(120_000);
        const name = `E2E Photo Sizes ${testInfo.project.name}`;
        const filename = `e2e-phone-${testInfo.project.name}.jpg`;
        await useSession(page);
        const id = await takeProduct(page.request, NW, name, {
            price: "120.00",
            status: "DRAFT",
        });

        const sent: Buffer[] = [];
        await page.route(UPLOAD_HOST, async (route) => {
            const body = route.request().postDataBuffer();
            if (body) sent.push(body);
            await route.fulfill({
                status: 200,
                headers: { "access-control-allow-origin": "*" },
                body: "",
            });
        });

        let mediaId: string | null = null;
        try {
            await page.goto(`/open/${NW.organizationId}`);
            await page.goto(`/commerce/products/${id}/edit`);
            const photo = await phonePhoto(page);
            expect(photo.includes(Buffer.from(MARKER))).toBe(true);
            await page
                .locator('input[type="file"][accept*="video"]')
                .first()
                .setInputFiles({
                    name: filename,
                    mimeType: "image/jpeg",
                    buffer: photo,
                });

            // The tile draws the 480 copy, not the full photo.
            await expect(
                page.locator('img[src*="@480.webp"]').first(),
            ).toBeVisible();

            // The full copy and the 480 and 1200 ones (1600 wide: no 1920).
            expect(sent).toHaveLength(3);
            for (const file of sent) {
                expect(file.subarray(0, 4).toString("latin1")).toBe("RIFF");
                expect(file.subarray(8, 12).toString("latin1")).toBe("WEBP");
                expect(file.includes(Buffer.from("Exif"))).toBe(false);
                expect(file.includes(Buffer.from(MARKER))).toBe(false);
            }

            const item = (await library(page.request)).find(
                (m) => m.filename === filename.replace(/\.jpg$/, ".webp"),
            );
            expect(item, "the photo is in the library").toBeTruthy();
            mediaId = item?.id ?? null;
            expect(item).toMatchObject({
                contentType: "image/webp",
                width: 1600,
                height: 1200,
                widths: [480, 1200],
            });
            expect(item?.placeholder).toMatch(/^[A-Za-z0-9+/]+=*$/);
        } finally {
            if (mediaId) {
                await page.request.delete(
                    `${urls.API_URL}/organizations/${NW.organizationId}/media/${mediaId}`,
                    { headers: orgHeader },
                );
            }
            await removeProducts(page.request, NW, name);
        }
    });
});
