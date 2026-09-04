import {
    checkPage,
    checkSite,
    FLAGS_AWAITING_NAVIGATION,
    type FlagPageInput,
    type FlagSiteInput,
    type FlagType,
} from "./site-flags";

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

function site(over: Partial<FlagSiteInput> = {}): FlagSiteInput {
    return {
        navigation: null,
        pages: [],
        // Set so the site-wide checks stay quiet unless a test asks for them.
        seoDescription: "A real description.",
        published: false,
        hasUnpublishedChanges: false,
        ...over,
    };
}

const types = (flags: { type: FlagType }[]) => flags.map((f) => f.type);

describe("the nine flag types", () => {
    it("names all nine, and none is waiting on data any more", () => {
        // The vocabulary is the spec's. Two need the Navigation model from §3,
        // which is not built — recorded rather than silently absent.
        // Since #206 every one of the nine has the data it needs.
        expect(FLAGS_AWAITING_NAVIGATION).toEqual([]);
    });
});

describe("empty required fields", () => {
    it("flags a hero with no heading, a button with no label, and an empty form", () => {
        const flags = checkPage(
            page([
                { type: "hero", content: { heading: "  " } },
                { type: "cta", content: { label: "", href: "/about" } },
                { type: "enquiry", content: { fields: [] } },
            ]),
            ["/", "/about"],
        );
        expect(
            flags.filter((f) => f.type === "emptyRequiredField"),
        ).toHaveLength(3);
    });

    it("points at the field, so the panel can mark it", () => {
        const [flag] = checkPage(
            page([{ type: "hero", content: { heading: "" } }]),
            ["/"],
        );
        expect(flag.field).toBe("heading");
        expect(flag.sectionIndex).toBe(0);
    });
});

describe("placeholder text", () => {
    it("catches text nobody ships on purpose", () => {
        for (const heading of [
            "Lorem ipsum dolor sit amet",
            "Your heading here",
            "TODO write this",
            "xxxx",
        ]) {
            const flags = checkPage(
                page([
                    {
                        type: "hero",
                        content: { heading, image: { src: "x.jpg" } },
                    },
                ]),
                ["/"],
            );
            expect(types(flags)).toContain("placeholderText");
        }
    });

    it("stays quiet on ordinary copy", () => {
        // A placeholder check that fires on real writing trains people to
        // ignore every flag, which costs more than the ones it catches.
        for (const heading of [
            "Packaging, storage and safety supplies",
            "Rooms available this weekend",
            "Today at the counter",
        ]) {
            const flags = checkPage(
                page([
                    {
                        type: "hero",
                        content: { heading, image: { src: "x.jpg" } },
                    },
                ]),
                ["/"],
            );
            expect(types(flags)).not.toContain("placeholderText");
        }
    });

    it("reads the words in rich text, not the markup", () => {
        const flags = checkPage(
            page([
                {
                    type: "richText",
                    content: {
                        format: "html",
                        value: "<p><strong>Lorem ipsum</strong> dolor</p>",
                    },
                },
            ]),
            ["/"],
        );
        expect(types(flags)).toContain("placeholderText");
    });

    it("treats markup-only rich text as empty", () => {
        const flags = checkPage(
            page([
                {
                    type: "richText",
                    content: { format: "html", value: "<p></p><br/>" },
                },
            ]),
            ["/"],
        );
        expect(types(flags)).toContain("emptyRequiredField");
    });
});

describe("missing images", () => {
    it("flags a hero with no image and a gallery with none", () => {
        const flags = checkPage(
            page([
                { type: "hero", content: { heading: "Hello" } },
                { type: "gallery", content: { images: [] } },
            ]),
            ["/"],
        );
        expect(flags.filter((f) => f.type === "missingImage")).toHaveLength(2);
    });
});

describe("broken links", () => {
    it("flags an internal link to a page that does not exist", () => {
        const flags = checkPage(
            page([{ type: "cta", content: { label: "Go", href: "/nope" } }]),
            ["/", "/about"],
        );
        expect(types(flags)).toContain("brokenLink");
    });

    it("accepts a real page, ignoring its query and fragment", () => {
        for (const href of ["/about", "/about#hours", "/about?utm=x", "/"]) {
            const flags = checkPage(
                page([{ type: "cta", content: { label: "Go", href } }]),
                ["/", "/about"],
            );
            expect(types(flags)).not.toContain("brokenLink");
        }
    });

    it("says nothing about external links", () => {
        // Checking one means a network request: a pre-publish screen that
        // stalls on someone else's slow server, or wrongly calls a live site
        // broken, is worse than staying quiet.
        const flags = checkPage(
            page([
                {
                    type: "cta",
                    content: { label: "Go", href: "https://example.com/gone" },
                },
            ]),
            ["/"],
        );
        expect(types(flags)).not.toContain("brokenLink");
    });
});

describe("breaks at phone width", () => {
    it("flags a hero heading long enough to fill a handset", () => {
        const flags = checkPage(
            page([
                {
                    type: "hero",
                    content: {
                        heading:
                            "Packaging, storage, safety supplies and everything else a working warehouse needs",
                        image: { src: "x.jpg" },
                    },
                },
            ]),
            ["/"],
        );
        expect(types(flags)).toContain("phoneWidth");
    });

    it("leaves a normal heading alone — the sites do reflow", () => {
        const flags = checkPage(
            page([
                {
                    type: "hero",
                    content: {
                        heading: "Rooms available",
                        image: { src: "x.jpg" },
                    },
                },
            ]),
            ["/"],
        );
        expect(types(flags)).not.toContain("phoneWidth");
    });

    it("flags a four-image grid but not a three-image one", () => {
        const img = { src: "x.jpg" };
        const four = checkPage(
            page([
                {
                    type: "gallery",
                    content: { layout: "grid", images: [img, img, img, img] },
                },
            ]),
            ["/"],
        );
        const three = checkPage(
            page([
                {
                    type: "gallery",
                    content: { layout: "grid", images: [img, img, img] },
                },
            ]),
            ["/"],
        );
        expect(types(four)).toContain("phoneWidth");
        expect(types(three)).not.toContain("phoneWidth");
    });
});

describe("hidden sections", () => {
    it("raises nothing at all — a parked section is not a problem", () => {
        const flags = checkPage(
            page([
                {
                    type: "hero",
                    content: { heading: "", value: "" },
                    hidden: true,
                },
                { type: "gallery", content: { images: [] }, hidden: true },
            ]),
            ["/"],
        );
        // It is not on the live site, so telling the merchant its heading is
        // empty is telling them about a problem that does not exist.
        expect(flags).toEqual([]);
    });
});

describe("whole-site flags", () => {
    it("flags a missing search description", () => {
        const flags = checkSite(site({ seoDescription: "   " }));
        expect(types(flags)).toContain("missingSeoDescription");
    });

    it("mentions unpublished changes only once something is live", () => {
        const never = checkSite(
            site({ published: false, hasUnpublishedChanges: true }),
        );
        const live = checkSite(
            site({ published: true, hasUnpublishedChanges: true }),
        );
        // Before the first publish the whole site is unpublished; saying so is
        // not news.
        expect(types(never)).not.toContain("unpublishedChanges");
        expect(types(live)).toContain("unpublishedChanges");
    });

    it("carries the page each flag belongs to, and null for site-wide ones", () => {
        const flags = checkSite(
            site({
                seoDescription: null,
                pages: [
                    page([{ type: "hero", content: { heading: "" } }], {
                        id: "page_9",
                        path: "/about",
                    }),
                ],
            }),
        );
        const seo = flags.find((f) => f.type === "missingSeoDescription");
        const hero = flags.find((f) => f.type === "emptyRequiredField");
        expect(seo?.pageId).toBeNull();
        expect(hero?.pageId).toBe("page_9");
    });

    it("reports unpublished changes for a change that lives on the page, not in a draft", () => {
        // Hiding, renaming and moving a page all alter the snapshot publish
        // would write, and none of them touch a PageVersion. The check used to
        // compare version timestamps alone, so a merchant could hide a page and
        // be told nothing was waiting — leaving it live.
        const flags = checkSite(
            site({
                published: true,
                hasUnpublishedChanges: true,
                pages: [page([])],
            }),
        );
        expect(flags.map((f) => f.type)).toContain("unpublishedChanges");
    });

    it("checks a v2 button by what it does, and names the actual problem (#207)", () => {
        const flags = checkSite(
            site({
                pages: [
                    page([
                        // a page that is not on the site
                        {
                            type: "cta",
                            content: {
                                label: "Go",
                                action: { kind: "page", pageId: "nope" },
                            },
                        },
                        // a phone number that is not one
                        {
                            type: "cta",
                            content: {
                                label: "Call",
                                action: { kind: "call", number: "ring me" },
                            },
                        },
                        // an address that is not one
                        {
                            type: "cta",
                            content: {
                                label: "Write",
                                action: {
                                    kind: "email",
                                    address: "not-an-email",
                                },
                            },
                        },
                        // and three that are fine
                        {
                            type: "cta",
                            content: {
                                label: "Home",
                                action: { kind: "page", pageId: "page_1" },
                            },
                        },
                        {
                            type: "cta",
                            content: {
                                label: "Chat",
                                action: {
                                    kind: "whatsapp",
                                    number: "+91 98450 12345",
                                },
                            },
                        },
                        {
                            type: "cta",
                            content: {
                                label: "Site",
                                action: {
                                    kind: "url",
                                    href: "https://example.com",
                                },
                            },
                        },
                    ]),
                ],
            }),
        );
        const byIndex = (i: number) =>
            flags.filter((f) => f.sectionIndex === i).map((f) => f.message);
        expect(byIndex(0)).toEqual([
            "This button points at a page that is not on this site.",
        ]);
        expect(byIndex(1)).toEqual([
            "This button has no phone number to call.",
        ]);
        expect(byIndex(2)).toEqual([
            "This button has no email address to write to.",
        ]);
        expect(byIndex(3)).toEqual([]);
        expect(byIndex(4)).toEqual([]);
        expect(byIndex(5)).toEqual([]);
    });

    it("treats a button pointing at a HIDDEN page as broken, because for a visitor it is", () => {
        const flags = checkSite(
            site({
                pages: [
                    page([
                        {
                            type: "cta",
                            content: {
                                label: "About",
                                action: { kind: "page", pageId: "page_hidden" },
                            },
                        },
                    ]),
                    page([], {
                        id: "page_hidden",
                        path: "/about",
                        hidden: true,
                    }),
                ],
            }),
        );
        expect(flags.map((f) => f.type)).toContain("brokenLink");
    });

    it("still checks a v1 button by its href, so nothing published regresses", () => {
        const flags = checkSite(
            site({
                pages: [
                    page([
                        {
                            type: "cta",
                            content: { label: "Go", href: "/missing" },
                        },
                    ]),
                ],
            }),
        );
        expect(flags.map((f) => f.type)).toContain("brokenLink");
    });

    it("flags a menu entry that points at a hidden page (#206)", () => {
        const flags = checkSite(
            site({
                navigation: {
                    items: [{ pageId: "page_1" }, { pageId: "page_hidden" }],
                },
                pages: [
                    page([]),
                    page([], {
                        id: "page_hidden",
                        path: "/about",
                        title: "About",
                        hidden: true,
                    }),
                ],
            }),
        );
        expect(flags.map((f) => f.type)).toContain("hiddenButLinked");
    });

    it("flags a visible page the menu leaves out, but never the home page", () => {
        const flags = checkSite(
            site({
                navigation: { items: [{ pageId: "page_1" }] },
                pages: [
                    page([]),
                    page([], { id: "page_2", path: "/about", title: "About" }),
                ],
            }),
        );
        const missing = flags.filter((f) => f.type === "pageNotInNavigation");
        expect(missing.map((f) => f.pageId)).toEqual(["page_2"]);
    });

    it("says once that there is no menu, rather than once per page", () => {
        const flags = checkSite(
            site({
                pages: [
                    page([]),
                    page([], { id: "page_2", path: "/about" }),
                    page([], { id: "page_3", path: "/book" }),
                ],
            }),
        );
        expect(
            flags.filter((f) => f.type === "pageNotInNavigation"),
        ).toHaveLength(1);
    });

    it("raises nothing on a hidden page", () => {
        // A hidden page is not on the live site, so its empty heading is not a
        // problem a visitor can meet. Flagging it would fill the pre-publish
        // check with noise from work deliberately set aside — the same rule
        // that already keeps hidden SECTIONS quiet.
        const flags = checkSite(
            site({
                pages: [
                    page([{ type: "hero", content: { heading: "" } }], {
                        id: "page_hidden",
                        path: "/about",
                        hidden: true,
                    }),
                ],
            }),
        );
        expect(flags.filter((f) => f.pageId === "page_hidden")).toEqual([]);
    });

    it("treats a link to a hidden page as broken, because for a visitor it is", () => {
        // Hiding a page that something still points at turns that button into
        // a dead link on a live site. The merchant has to be told BEFORE they
        // publish, not by a customer afterwards.
        const flags = checkSite(
            site({
                pages: [
                    page([
                        {
                            type: "cta",
                            content: {
                                label: "Read about us",
                                href: "/about",
                            },
                        },
                    ]),
                    page([], {
                        id: "page_hidden",
                        path: "/about",
                        hidden: true,
                    }),
                ],
            }),
        );
        expect(flags.map((f) => f.type)).toContain("brokenLink");
    });

    it("resolves links against every page on the site, not just the one being checked", () => {
        const flags = checkSite(
            site({
                pages: [
                    page([], { id: "p1", path: "/" }),
                    page(
                        [
                            {
                                type: "cta",
                                content: { label: "x", href: "/contact" },
                            },
                        ],
                        {
                            id: "p2",
                            path: "/about",
                        },
                    ),
                    page([], { id: "p3", path: "/contact" }),
                ],
            }),
        );
        expect(types(flags)).not.toContain("brokenLink");
    });
});

describe("the contract the spec sets", () => {
    it("never throws, whatever the content is", () => {
        // "Nothing blocks publishing. All flags are advisory." A check that
        // could throw would be a check that blocks.
        for (const content of [null, undefined, 42, "text", [], { a: 1 }]) {
            expect(() =>
                checkPage(page([{ type: "hero", content }]), ["/"]),
            ).not.toThrow();
        }
    });

    it("says nothing about a section type it has no checks for", () => {
        const flags = checkPage(page([{ type: "somethingNew", content: {} }]), [
            "/",
        ]);
        expect(flags).toEqual([]);
    });
});
