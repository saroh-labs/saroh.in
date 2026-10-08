import { cardLines, parseCatalog } from "@saroh/pricing-catalog";

import { fakeCatalog } from "../../../test/fixtures/pricing-catalog";
import type { PublicPricing } from "./public-catalog";
import { etagMatches, pricingEtag, publicCatalog } from "./public-catalog";

describe("publicCatalog", () => {
    const retiredC = () =>
        fakeCatalog((c) => {
            c.plans[2]!.retired = true;
        });

    it("leaves out retired plans and their cells", () => {
        const out = publicCatalog(retiredC());
        expect(out.plans.map((p) => p.id)).toEqual(["free", "b"]);
        for (const m of out.modules) {
            expect(Object.keys(m.cells)).not.toContain("c");
        }
    });

    it("leaves out modules hidden from the pricing page, their add-ons, and an emptied group", () => {
        const c = fakeCatalog((x) => {
            const themes = x.modules.find((m) => m.id === "themes")!;
            themes.pricing = "hidden";
        });
        const out = publicCatalog(c);
        expect(out.modules.map((m) => m.id)).toEqual([
            "products",
            "invoicing",
            "members",
        ]);
        expect(out.addons.map((a) => a.id)).toEqual(["things-pack", "bills"]);
        expect(out.groups.map((g) => g.id)).toEqual(["sell", "team"]);
    });

    it("keeps coming-soon modules", () => {
        const out = publicCatalog(fakeCatalog());
        expect(out.modules.find((m) => m.id === "themes")?.pricing).toBe(
            "soon",
        );
    });

    it("drops the dashboard rail wiring", () => {
        const out = publicCatalog(fakeCatalog());
        const products = out.modules.find((m) => m.id === "products")!;
        expect(products).not.toHaveProperty("menu");
        expect(products).not.toHaveProperty("child");
    });

    it("still validates, and gives every offered plan the same card lines", () => {
        const c = retiredC();
        const out = parseCatalog(JSON.parse(JSON.stringify(publicCatalog(c))));
        for (const p of out.plans) {
            expect(cardLines(out, p.id)).toEqual(cardLines(c, p.id));
        }
    });
});

describe("pricing ETag", () => {
    const body = (version: number): PublicPricing => ({
        version,
        goLiveAt: "2026-10-01T00:00:00.000Z",
        preview: false,
        catalog: publicCatalog(fakeCatalog()),
    });

    it("is the same for the same body and differs for another", () => {
        expect(pricingEtag(body(1))).toBe(pricingEtag(body(1)));
        expect(pricingEtag(body(1))).not.toBe(pricingEtag(body(2)));
        expect(pricingEtag(body(1))).toMatch(/^W\/"[A-Za-z0-9_-]+"$/);
    });

    it("matches If-None-Match, weak or strong, in a list, or *", () => {
        const tag = pricingEtag(body(1));
        const bare = tag.replace(/^W\//, "");
        expect(etagMatches(tag, tag)).toBe(true);
        expect(etagMatches(bare, tag)).toBe(true);
        expect(etagMatches(`"x", ${tag}`, tag)).toBe(true);
        expect(etagMatches("*", tag)).toBe(true);
        expect(etagMatches('"x"', tag)).toBe(false);
        expect(etagMatches(undefined, tag)).toBe(false);
    });
});
