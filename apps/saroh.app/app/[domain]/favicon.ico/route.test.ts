import { beforeEach, describe, expect, it, vi } from "vitest";

import { GET as plainTile } from "../site-icon.svg/route";
import { GET } from "./route";

const site = vi.hoisted((): { resolved: unknown } => ({ resolved: null }));

vi.mock("@/lib/publication", () => ({
    getSiteForHost: vi.fn(() => Promise.resolve(site.resolved)),
}));

const OWN = "https://media.saroh.test/org/o1/site-image/icon.png";
const LOGO = "https://media.saroh.test/org/o1/business-logo/logo.png";

function resolved(icon: unknown, mode: "live" | "test" = "live") {
    return {
        siteId: "site_1",
        modules: null,
        mode,
        release: null,
        icon,
        snapshot: {
            site: {
                name: "Northwind Supply",
                slug: "northwind",
                styleVariables: {
                    "--site-accent": "210 40% 30%",
                    "--site-accent-fg": "0 0% 98%",
                },
            },
            pages: [],
        },
    };
}

const ask = (handler: typeof GET, host = "northwind.saroh.app") =>
    handler(new Request(`https://${host}/favicon.ico`), {
        params: Promise.resolve({ domain: host }),
    });

describe("/favicon.ico for a merchant's host", () => {
    beforeEach(() => {
        site.resolved = null;
    });

    it("forwards to the site's own icon", async () => {
        site.resolved = resolved({
            url: OWN,
            type: "image/png",
            source: "site",
        });
        const res = await ask(GET);
        expect(res.status).toBe(302);
        expect(res.headers.get("location")).toBe(OWN);
    });

    it("forwards to the business logo when the site has none of its own", async () => {
        site.resolved = resolved({
            url: LOGO,
            type: "image/png",
            source: "business",
        });
        const res = await ask(GET);
        expect(res.status).toBe(302);
        expect(res.headers.get("location")).toBe(LOGO);
    });

    it("answers the plain tile with neither, and never Saroh's mark", async () => {
        site.resolved = resolved(null);
        const res = await ask(GET);
        expect(res.status).toBe(200);
        expect(res.headers.get("content-type")).toContain("image/svg+xml");
        const svg = await res.text();
        expect(svg).toContain(">N</text>");
        expect(svg).toContain("hsl(210 40% 30%)");
        expect(svg).not.toMatch(/saroh/i);
    });

    it("shows a test release's icon on its test host", async () => {
        site.resolved = resolved(
            { url: OWN, type: "image/png", source: "site" },
            "test",
        );
        const res = await ask(GET, "test--northwind.saroh.app");
        expect(res.headers.get("location")).toBe(OWN);
    });

    it("is a 404 for a host with no live site", async () => {
        const res = await ask(GET, "nobody.saroh.app");
        expect(res.status).toBe(404);
    });
});

describe("/site-icon.svg for a merchant's host", () => {
    it("is the plain tile, even once the site has an icon of its own", async () => {
        site.resolved = resolved({
            url: OWN,
            type: "image/png",
            source: "site",
        });
        const res = await ask(plainTile);
        expect(res.status).toBe(200);
        expect(res.headers.get("content-type")).toContain("image/svg+xml");
        expect(await res.text()).toContain(">N</text>");
    });

    it("is a 404 for a host with no live site", async () => {
        site.resolved = null;
        expect((await ask(plainTile, "nobody.saroh.app")).status).toBe(404);
    });
});
