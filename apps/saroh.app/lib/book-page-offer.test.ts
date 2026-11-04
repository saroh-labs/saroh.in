import { describe, expect, it } from "vitest";

import {
    ALL_SERVICES_HREF,
    bookPageOffer,
    offeredByList,
} from "./book-page-offer";
import type { Section } from "./publication";

const service = (id: string) => ({
    id,
    name: id,
    description: null,
    durationMinutes: 30,
    priceCents: null,
    currency: null,
});
const [a, b, c, d] = ["a", "b", "c", "d"].map(service);
const OFFERED = [a, b, c, d];
const names = (r: { services: { id: string }[] }) =>
    r.services.map((s) => s.id).join();

const list = (serviceIds: string[], extra = {}): Section => ({
    type: "servicesList",
    contractVersion: 1,
    content: { serviceIds, ...extra },
});
const INTRO: Section = { type: "richText", contractVersion: 1, content: {} };

describe("what one stored list offers", () => {
    it("is everything when nothing it names is offered now", () => {
        expect(names(offeredByList(["gone"], OFFERED))).toBe("a,b,c,d");
        expect(offeredByList(["gone"], OFFERED).narrowed).toBe(false);
    });

    it("follows the list as written with every newer service", () => {
        // The Book page made with the first service: all later ones show.
        expect(names(offeredByList(["a"], OFFERED))).toBe("a,b,c,d");
        expect(names(offeredByList(["a", "b"], OFFERED))).toBe("a,b,c,d");
    });

    it("keeps the merchant's order, the new ones after it", () => {
        expect(names(offeredByList(["b", "a"], OFFERED))).toBe("b,a,c,d");
    });

    it("drops what isn't offered now and shows nothing it didn't read", () => {
        const offered = [a, c, d];
        expect(names(offeredByList(["a", "b", "c"], offered))).toBe("a,c,d");
    });

    it("keeps a real choice: a gap among the services offered", () => {
        const chosen = offeredByList(["a", "c"], OFFERED);
        expect(names(chosen)).toBe("a,c");
        expect(chosen.narrowed).toBe(true);
        expect(names(offeredByList(["d"], OFFERED))).toBe("d");
    });

    it("draws everything or says there is more: nothing is out of reach", () => {
        for (const ids of [["a"], ["b"], ["c", "a"], ["gone"], ["d", "a"]]) {
            const { services, narrowed } = offeredByList(ids, OFFERED);
            expect(narrowed || services.length === OFFERED.length).toBe(true);
        }
    });
});

describe("a Book page's sections", () => {
    it("feeds its list what the flow offers", () => {
        const { sections, serviceLists } = bookPageOffer(
            [INTRO, list(["gone"])],
            OFFERED,
        );
        expect(sections).toHaveLength(2);
        expect(serviceLists[0]).toBeUndefined();
        expect(serviceLists[1]).toEqual({ services: OFFERED, moreHref: null });
    });

    it("adds the list a page published without one never had", () => {
        const { sections, serviceLists } = bookPageOffer([INTRO], OFFERED);
        expect(sections.map((s) => s.type)).toEqual([
            "richText",
            "servicesList",
        ]);
        expect(serviceLists[1]?.services).toEqual(OFFERED);
    });

    it("leaves a page that books through its own block", () => {
        const booking: Section = {
            type: "booking",
            contractVersion: 1,
            content: {},
        };
        const { sections } = bookPageOffer([INTRO, booking], OFFERED);
        expect(sections).toHaveLength(2);
    });

    it("says there is more beside a merchant's choice", () => {
        const { serviceLists } = bookPageOffer([list(["a", "c"])], OFFERED);
        expect(serviceLists[0]?.moreHref).toBe(ALL_SERVICES_HREF);
    });

    it("says there is more beside one price card", () => {
        const { serviceLists } = bookPageOffer(
            [list(["a"], { variant: "priceCard" })],
            OFFERED,
        );
        expect(serviceLists[0]?.moreHref).toBe(ALL_SERVICES_HREF);
    });

    it("doesn't repeat a second list's services in the first", () => {
        const { serviceLists } = bookPageOffer(
            [list(["a"]), list(["c"])],
            OFFERED,
        );
        expect(serviceLists[0]?.services.map((s) => s.id)).toEqual([
            "a",
            "b",
            "d",
        ]);
        expect(serviceLists[1]?.services.map((s) => s.id)).toEqual(["c"]);
    });
});
