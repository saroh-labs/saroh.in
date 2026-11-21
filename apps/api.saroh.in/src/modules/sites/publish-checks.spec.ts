import {
    checkBeforePublish,
    checkSectionPrices,
    photosWithoutDescription,
    type CheckService,
} from "./publish-checks";
import { checkSite, type FlagPageInput } from "./site-flags";

const SERVICES: CheckService[] = [
    { id: "s_trial", name: "Trial", priceCents: 250000, currency: "INR" },
    {
        id: "s_hd",
        name: "HD bridal makeup",
        priceCents: 1800000,
        currency: "INR",
    },
    {
        id: "s_consult",
        name: "Skin consultation",
        priceCents: null,
        currency: null,
    },
    { id: "s_yoga", name: "Yoga class", priceCents: 50000, currency: "INR" },
];

function page(
    sections: { type: string; content: unknown; hidden?: boolean }[],
    over: Partial<FlagPageInput> = {},
): FlagPageInput {
    return {
        id: "page_1",
        path: "/",
        title: "Home",
        hidden: false,
        sections: sections.map((s) => ({ ...s, hidden: s.hidden ?? false })),
        ...over,
    };
}

const types = (content: unknown, services = SERVICES) =>
    checkSectionPrices(content, services).map((f) => f.type);

describe("prices match Services", () => {
    it("flags a typed price for a service that Services prices differently, with both prices", () => {
        const [flag] = checkSectionPrices(
            {
                heading: "Packages",
                items: [{ title: "Trial", value: "₹2,000" }],
            },
            SERVICES,
        );
        expect(flag.type).toBe("priceMismatch");
        expect(flag.field).toBe("items");
        expect(flag.message).toContain("₹2,000");
        expect(flag.message).toContain("₹2,500");
    });

    it("is quiet when the typed price is Services' price", () => {
        expect(
            types({ items: [{ title: "HD bridal makeup", value: "₹18,000" }] }),
        ).toEqual([]);
        expect(
            types({ value: "<p>HD bridal makeup for Rs. 18000.</p>" }),
        ).toEqual([]);
    });

    it("reads a sentence, not the whole paragraph", () => {
        expect(
            types({
                intro: "HD bridal makeup is ₹18,000. Our studio opened in 2019 and parking costs ₹50.",
            }),
        ).toEqual([]);
    });

    it("leaves a sentence naming two services alone", () => {
        expect(
            types({ intro: "Trial and HD bridal makeup together: ₹19,000" }),
        ).toEqual([]);
    });

    it("compares a Lookbook photo's typed price with the service it links to", () => {
        const flags = checkSectionPrices(
            {
                images: [
                    {
                        src: "/a.jpg",
                        alt: "Bride",
                        name: "Our signature look",
                        fromPrice: "From ₹15,000",
                        link: { kind: "service", serviceId: "s_hd" },
                    },
                ],
            },
            SERVICES,
        );
        expect(flags.map((f) => f.type)).toEqual(["priceMismatch"]);
        expect(flags[0].message).toContain("HD bridal makeup");
    });

    it("never flags a price on a block that reads Services live", () => {
        const flags = checkBeforePublish(
            [
                page([
                    {
                        type: "servicesList",
                        content: { intro: "Trial ₹2,000", serviceIds: [] },
                    },
                ]),
            ],
            SERVICES,
        );
        expect(flags).toEqual([]);
    });

    it("can't mismatch a service with no price", () => {
        expect(types({ intro: "Skin consultation ₹500" })).toEqual([]);
    });
});

describe("a free claim that isn't", () => {
    it('flags "free trial" while Trial costs ₹2,500', () => {
        const [flag] = checkSectionPrices(
            { heading: "Book your free trial" },
            SERVICES,
        );
        expect(flag.type).toBe("freeClaim");
        expect(flag.field).toBe("heading");
        expect(flag.message).toContain("₹2,500");
    });

    it('flags "first class free" when the class is priced', () => {
        expect(types({ intro: "Your first class free!" })).toEqual([
            "freeClaim",
        ]);
    });

    it('is quiet on "free consultation" when the consultation has no price', () => {
        expect(types({ heading: "Free skin consultation" })).toEqual([]);
        expect(types({ heading: "Book a free consultation" })).toEqual([]);
    });

    it('is quiet on a "free" about something else in the sentence', () => {
        expect(
            types({
                intro: "Every package starts with a free chat and a ₹2,500 trial, taken off your package.",
            }),
        ).toEqual([]);
        expect(types({ heading: "Frizz-free hair after your trial" })).toEqual(
            [],
        );
    });

    it("still reads the own words of a block that reads Services live", () => {
        const flags = checkBeforePublish(
            [
                page([
                    {
                        type: "servicesList",
                        content: { intro: "Start with a free trial" },
                    },
                ]),
            ],
            SERVICES,
        );
        expect(flags.map((f) => f.type)).toEqual(["freeClaim"]);
    });
});

describe("photos without a description", () => {
    it("names each photo by its path", () => {
        expect(
            photosWithoutDescription({
                image: { src: "/hero.jpg", alt: "" },
                images: [
                    { src: "/a.jpg", alt: "Bride in red" },
                    { src: "/b.jpg" },
                ],
                imageBrief: "Morning light",
            }),
        ).toEqual([
            { path: "image", src: "/hero.jpg" },
            { path: "images.1", src: "/b.jpg" },
        ]);
    });

    it("flags it with the section and path Describe it writes to", () => {
        const flags = checkBeforePublish(
            [
                page([
                    { type: "hero", content: { heading: "Hi" } },
                    {
                        type: "gallery",
                        content: { images: [{ src: "/a.jpg", alt: " " }] },
                    },
                ]),
            ],
            [],
        );
        expect(flags).toEqual([
            expect.objectContaining({
                type: "photoNoDescription",
                pageId: "page_1",
                sectionIndex: 1,
                field: "images.0",
                photoSrc: "/a.jpg",
            }),
        ]);
    });

    it("skips hidden sections and hidden pages, and never blocks", () => {
        const hidden = checkBeforePublish(
            [
                page([
                    {
                        type: "gallery",
                        content: { images: [{ src: "/a.jpg" }] },
                        hidden: true,
                    },
                ]),
                page(
                    [{ type: "hero", content: { image: { src: "/b.jpg" } } }],
                    {
                        id: "page_2",
                        hidden: true,
                    },
                ),
            ],
            [],
        );
        expect(hidden).toEqual([]);
        const shown = checkBeforePublish(
            [page([{ type: "hero", content: { image: { src: "/b.jpg" } } }])],
            SERVICES,
        );
        expect(shown.every((f) => !f.blocking)).toBe(true);
    });
});

describe("every link works", () => {
    it("flags a link to a page that was deleted (checkSite's brokenLink)", () => {
        const flags = checkSite({
            pages: [
                page([
                    {
                        type: "cta",
                        content: { label: "See prices", href: "/prices" },
                    },
                ]),
            ],
            navigation: null,
            seoDescription: "-",
            published: false,
            hasUnpublishedChanges: false,
        });
        expect(flags.map((f) => f.type)).toContain("brokenLink");
    });
});

describe("all good", () => {
    it("says nothing for a page whose prices, claims and photos check out", () => {
        expect(
            checkBeforePublish(
                [
                    page([
                        {
                            type: "features",
                            content: {
                                items: [
                                    { title: "Trial", value: "₹2,500" },
                                    { title: "Free parking" },
                                ],
                            },
                        },
                        {
                            type: "hero",
                            content: {
                                image: { src: "/a.jpg", alt: "The salon" },
                            },
                        },
                    ]),
                ],
                SERVICES,
            ),
        ).toEqual([]);
    });
});
