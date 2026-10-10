import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
    faviconResponse,
    noIconResponse,
    PLAIN_ICON_PATH,
    plainIconResponse,
    previewIconMetadata,
    siteIconMetadata,
    siteIconOf,
} from "./site-icon";

const OWN = "https://media.saroh.test/org/o1/site-image/icon.png";
const LOGO = "https://media.saroh.test/org/o1/business-logo/logo.webp";

const own = { url: OWN, type: "image/png", source: "site" as const };
const logo = { url: LOGO, type: "image/webp", source: "business" as const };
const rye = {
    name: "Rye & Co.",
    variables: {
        "--site-accent": "150 33% 18%",
        "--site-accent-fg": "0 0% 98%",
    },
};

describe("the icon a public read sends", () => {
    it("is read as it is sent", () => {
        expect(siteIconOf(own)).toEqual(own);
        expect(siteIconOf(logo)).toEqual(logo);
    });

    it("is none from an API that predates icons, or for a site with none", () => {
        expect(siteIconOf(undefined)).toBeNull();
        expect(siteIconOf(null)).toBeNull();
        expect(siteIconOf("x")).toBeNull();
        expect(siteIconOf({})).toBeNull();
    });

    it("keeps only a web address, and only a type an icon may be", () => {
        expect(siteIconOf({ url: "javascript:alert(1)" })).toBeNull();
        expect(siteIconOf({ url: "data:image/png;base64,AAAA" })).toBeNull();
        expect(siteIconOf({ url: "/relative.png" })).toBeNull();
        expect(siteIconOf({ url: OWN, type: "image/svg+xml" })).toEqual({
            url: OWN,
            type: null,
            source: "site",
        });
    });
});

describe("a page's icons", () => {
    it("the site's own: the uploaded image as it is, with its type, for the tab and the phone", () => {
        expect(siteIconMetadata(own)).toEqual({
            icon: [{ url: OWN, type: "image/png" }],
            apple: [{ url: OWN, type: "image/png" }],
        });
    });

    it("the business logo, when the site has none of its own", () => {
        expect(siteIconMetadata(logo)).toEqual({
            icon: [{ url: LOGO, type: "image/webp" }],
            apple: [{ url: LOGO, type: "image/webp" }],
        });
    });

    it("neither: the plain tile on the site's own host, and no touch icon", () => {
        expect(siteIconMetadata(null)).toEqual({
            icon: [
                { url: PLAIN_ICON_PATH, type: "image/svg+xml", sizes: "any" },
            ],
        });
        expect(PLAIN_ICON_PATH).toBe("/site-icon.svg");
    });

    it("declares no type it does not know", () => {
        expect(siteIconMetadata({ ...own, type: null })).toEqual({
            icon: [{ url: OWN }],
            apple: [{ url: OWN }],
        });
    });

    it("a draft preview carries the tile in the link, having no host to serve it", () => {
        expect(previewIconMetadata(own, rye)).toEqual(siteIconMetadata(own));
        const plain = previewIconMetadata(null, rye) as {
            icon: { url: string; type: string }[];
        };
        expect(plain.icon).toHaveLength(1);
        expect(plain.icon[0].type).toBe("image/svg+xml");
        expect(decodeURIComponent(plain.icon[0].url)).toContain(">R</text>");
    });
});

describe("/favicon.ico on a merchant's host", () => {
    it("forwards to the site's own icon", () => {
        const res = faviconResponse(own, rye);
        expect(res.status).toBe(302);
        expect(res.headers.get("location")).toBe(OWN);
        expect(res.headers.get("cache-control")).toBe("public, max-age=300");
    });

    it("forwards to the business logo when the site has none", () => {
        const res = faviconResponse(logo, rye);
        expect(res.status).toBe(302);
        expect(res.headers.get("location")).toBe(LOGO);
    });

    it("is the plain tile itself with neither: the site's initial in its own colours", async () => {
        const res = faviconResponse(null, rye);
        expect(res.status).toBe(200);
        expect(res.headers.get("content-type")).toBe(
            "image/svg+xml; charset=utf-8",
        );
        const svg = await res.text();
        expect(svg).toContain(">R</text>");
        expect(svg).toContain("hsl(150 33% 18%)");
        expect(svg).toBe(await plainIconResponse(rye).text());
    });

    it("is a 404 with no live site", () => {
        const res = noIconResponse();
        expect(res.status).toBe(404);
        expect(res.headers.get("cache-control")).toBe("no-store");
    });
});

describe("a merchant's site never shows Saroh's mark", () => {
    const app = join(__dirname, "..", "app");

    it("the app ships no icon file of its own for Next to serve on every host", () => {
        // `app/favicon.ico` was the framework's default mark, served on
        // every merchant's address until DEC-120.
        const files = readdirSync(app);
        expect(
            files.filter((f) => /^(favicon|icon|apple-icon)\d*\./.test(f)),
        ).toEqual([]);
        expect(existsSync(join(app, "..", "public", "favicon.ico"))).toBe(
            false,
        );
    });

    it("the plain tile has no Saroh colour, name or drawn mark", async () => {
        const svg = await faviconResponse(null, {
            name: "Saroh fan club",
        }).text();
        expect(svg).not.toMatch(/saroh/i);
        expect(svg).not.toMatch(/#D98A15|#1C1C1A|<path|<image/i);
    });
});
