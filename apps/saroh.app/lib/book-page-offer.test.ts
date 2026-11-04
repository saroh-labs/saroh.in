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
    const names = (r: { id: string }[]) => r.map((s) => s.id).join();

    it("is everything when nothing it names is offered now", () => {
        expect(names(offeredByList(["gone"], OFFERED))).toBe("a,b,c,d");
    });

    it("follows the list as written with every newer service", () => {
        // The Book page made with the first service: all later ones show.
        expect(names(offeredByList(["a"], OFFERED))).toBe("a,b,c,d");
        expect(names(offeredByList(["a", "b"], OFFERED))).toBe("a,b,c,d");
    });

    it("keeps the merchant's order, the others after it", () => {
        expect(names(offeredByList(["b", "a"], OFFERED))).toBe("b,a,c,d");
    });

    it("drops what isn't offered now and shows nothing it didn't read", () => {
        const offered = [a, c, d];
        expect(names(offeredByList(["a", "b", "c"], offered))).toBe("a,c,d");
    });

    it("never narrows: a merchant's few still come first, with the rest", () => {
        expect(names(offeredByList(["a", "c"], OFFERED))).toBe("a,c,b,d");
        expect(names(offeredByList(["d"], OFFERED))).toBe("d,a,b,c");
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

    it("lists everything beside a merchant's few, with no link needed", () => {
        const { serviceLists } = bookPageOffer([list(["a", "c"])], OFFERED);
        expect(names(serviceLists[0] as never)).toBe("a,c,b,d");
        expect(serviceLists[0]?.moreHref).toBeNull();
    });

    it("keeps the merchant's display options on the list", () => {
        const options = {
            showPrices: false,
            buttonLabel: "Pick",
            layout: "rows",
        };
        const { sections } = bookPageOffer([list(["a"], options)], OFFERED);
        expect(sections[0]?.content).toMatchObject(options);
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

describe("a Book page with no list, that books through other blocks", () => {
    const booking = (serviceId?: string): Section => ({
        type: "booking",
        contractVersion: 1,
        content: { serviceId },
    });
    const timetable: Section = {
        type: "timetable",
        contractVersion: 1,
        content: {},
    };
    const types = (r: { sections: Section[] }) => r.sections.map((s) => s.type);

    it("keeps a Booking block when it reaches all that's offered", () => {
        const offer = bookPageOffer([INTRO, booking("a")], [a]);
        expect(types(offer)).toEqual(["richText", "booking"]);
    });

    it("lists what a Booking block doesn't reach, and not what it does", () => {
        const offer = bookPageOffer([booking("a")], OFFERED);
        expect(types(offer)).toEqual(["booking", "servicesList"]);
        expect(names(offer.serviceLists[1] as never)).toBe("b,c,d");
    });

    it("doesn't count a Booking block with no service", () => {
        const offer = bookPageOffer([booking()], OFFERED);
        expect(types(offer)).toEqual(["servicesList"]);
        expect(offer.serviceLists[0]?.services).toEqual(OFFERED);
    });

    it("drops a Booking block whose service is gone, and offers the rest", () => {
        const offer = bookPageOffer([booking("deleted")], OFFERED);
        expect(types(offer)).toEqual(["servicesList"]);
        expect(offer.serviceLists[0]?.services).toEqual(OFFERED);
    });

    it("keeps a Timetable that shows every class offered", () => {
        const offer = bookPageOffer([timetable], [a, b], undefined, [
            ["a", "b", "a"],
        ]);
        expect(types(offer)).toEqual(["timetable"]);
    });

    it("doesn't count a Timetable with stale ids or nothing to show", () => {
        for (const week of [[], ["deleted"], null]) {
            const offer = bookPageOffer([timetable], [a, b], undefined, [week]);
            expect(types(offer)).toEqual(["timetable", "servicesList"]);
            expect(offer.serviceLists[1]?.services).toEqual([a, b]);
        }
    });

    it("lists the one-to-one services a Timetable can't reach", () => {
        const offer = bookPageOffer([timetable], [a, b, c], undefined, [["a"]]);
        expect(types(offer)).toEqual(["timetable", "servicesList"]);
        expect(names(offer.serviceLists[1] as never)).toBe("b,c");
    });

    it("counts both blocks together", () => {
        const offer = bookPageOffer(
            [timetable, booking("b")],
            [a, b],
            undefined,
            [["a"], undefined],
        );
        expect(types(offer)).toEqual(["timetable", "booking"]);
    });

    it("leaves a merchant's own list to carry the offer", () => {
        const offer = bookPageOffer([timetable, list(["a"])], [a, b]);
        expect(types(offer)).toEqual(["timetable", "servicesList"]);
        expect(names(offer.serviceLists[1] as never)).toBe("a,b");
    });
});
