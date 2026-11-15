import { describe, expect, it, vi } from "vitest";

import { photoData, sharePhoto } from "./share-photo";

/** A share picture's photos (#1375 U5): only what next/og can draw. */

vi.mock("@/env", () => ({
    env: { NEXT_PUBLIC_SITE_MEDIA_URL: "https://media.saroh.test" },
}));
vi.mock("@opennextjs/cloudflare", () => ({
    getCloudflareContext: () => {
        throw new Error("not on Cloudflare");
    },
}));

const answer = (type: string, body = new Uint8Array([1, 2, 3])) =>
    vi.fn(() =>
        Promise.resolve(
            new Response(body, { headers: { "content-type": type } }),
        ),
    );

describe("photoData", () => {
    it("turns a PNG or JPEG into a data address", async () => {
        expect(await photoData("https://m/x.png", answer("image/png"))).toBe(
            "data:image/png;base64,AQID",
        );
        expect(
            await photoData("https://m/x.jpg", answer("image/jpeg")),
        ).toMatch(/^data:image\/jpeg;base64,/);
    });

    it("gives none for a format it can't draw, a failed fetch or no photo", async () => {
        expect(await photoData("https://m/x.webp", answer("image/webp"))).toBe(
            null,
        );
        const fails = vi.fn(() => Promise.reject(new Error("down")));
        expect(await photoData("https://m/x.png", fails)).toBe(null);
        expect(await photoData(null)).toBe(null);
    });
});

describe("sharePhoto", () => {
    const WEBP = "https://media.saroh.test/org/org1/product-image/bun.webp";

    it("asks the site's image route for a WebP cover as a JPEG, on the site's own host", async () => {
        const self = vi.fn((_request: Request) =>
            Promise.resolve(
                new Response(new Uint8Array([9]), {
                    headers: { "content-type": "image/jpeg" },
                }),
            ),
        );
        expect(await sharePhoto(WEBP, "rye.saroh.app", self)).toBe(
            "data:image/jpeg;base64,CQ==",
        );
        const [asked] = self.mock.calls[0] ?? [
            new Request("https://none.test"),
        ];
        expect(asked.url).toBe(
            "https://rye.saroh.app/_img/1200/org/org1/product-image/bun.webp",
        );
        expect(asked.headers.get("accept")).toBe("image/jpeg,image/png");
    });

    it("fetches anything that isn't the business's own media as it is", async () => {
        const self = vi.fn();
        const original = vi.spyOn(globalThis, "fetch").mockResolvedValue(
            new Response(new Uint8Array([1]), {
                headers: { "content-type": "image/png" },
            }),
        );
        expect(
            await sharePhoto(
                "https://elsewhere.test/a.png",
                "rye.saroh.app",
                self,
            ),
        ).toBe("data:image/png;base64,AQ==");
        expect(self).not.toHaveBeenCalled();
        original.mockRestore();
    });

    it("goes without the rendition off Cloudflare, and a WebP then draws the tile", async () => {
        const original = vi.spyOn(globalThis, "fetch").mockResolvedValue(
            new Response(new Uint8Array([1]), {
                headers: { "content-type": "image/webp" },
            }),
        );
        expect(await sharePhoto(WEBP, "rye.saroh.app")).toBe(null);
        original.mockRestore();
    });
});
