import { instantiateTemplate, listTemplates } from "@saroh/templates";

import {
    ADDRESS_MISSING_MESSAGE,
    checkAddress,
    checkPage,
    checkShop,
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

describe("the text block's photo (G7)", () => {
    const text = (image?: unknown, hidden = false) =>
        page([
            {
                type: "richText",
                content: { format: "html", value: "<p>Our story</p>", image },
                hidden,
            },
        ]);

    it("flags a photo with no description, pointing at the photo", () => {
        const flags = checkPage(
            text({ src: "https://cdn.example.com/a.jpg", alt: "  " }),
            ["/"],
        );
        expect(flags).toHaveLength(1);
        expect(flags[0]).toMatchObject({
            type: "emptyRequiredField",
            field: "image",
            sectionIndex: 0,
        });
        expect(flags[0].message).toMatch(/no description/);
    });

    it("flags a photo whose alt was never written at all", () => {
        const flags = checkPage(
            text({ src: "https://cdn.example.com/a.jpg" }),
            ["/"],
        );
        expect(types(flags)).toEqual(["emptyRequiredField"]);
    });

    it("says nothing once the photo is described", () => {
        const flags = checkPage(
            text({ src: "https://cdn.example.com/a.jpg", alt: "The counter" }),
            ["/"],
        );
        expect(flags).toEqual([]);
    });

    it("says nothing about a text block with no photo — it is optional", () => {
        expect(checkPage(text(), ["/"])).toEqual([]);
    });

    it("says nothing about a hidden text block's photo", () => {
        expect(
            checkPage(text({ src: "https://cdn.example.com/a.jpg" }, true), [
                "/",
            ]),
        ).toEqual([]);
    });

    it("reaches the pre-publish check, not only the rail", () => {
        const flags = checkSite(
            site({
                pages: [text({ src: "https://cdn.example.com/a.jpg" })],
            }),
        );
        expect(flags.map((f) => [f.type, f.field])).toContainEqual([
            "emptyRequiredField",
            "image",
        ]);
    });
});

describe("a project's photo and link (K11)", () => {
    const projects = (items: unknown[], hidden = false) =>
        page([{ type: "projects", content: { items }, hidden }]);

    it("flags a photo with no description, naming the project", () => {
        const flags = checkPage(
            projects([
                {
                    title: "Menus for a bakery",
                    image: { src: "https://cdn.example.com/a.jpg", alt: " " },
                },
            ]),
            ["/"],
        );
        expect(flags).toHaveLength(1);
        expect(flags[0]).toMatchObject({
            type: "emptyRequiredField",
            field: "items",
            sectionIndex: 0,
        });
        expect(flags[0].message).toMatch(
            /"Menus for a bakery".*no description/,
        );
    });

    it("flags each undescribed photo, and none that are described", () => {
        const flags = checkPage(
            projects([
                { title: "A", image: { src: "https://x/a.jpg" } },
                { title: "B", image: { src: "https://x/b.jpg", alt: "B" } },
                { title: "C" },
                { title: "D", image: { src: "https://x/d.jpg" } },
            ]),
            ["/"],
        );
        expect(flags.map((f) => f.message)).toEqual([
            expect.stringMatching(/"A"/),
            expect.stringMatching(/"D"/),
        ]);
    });

    it("flags a link to a page that is not on the site", () => {
        const flags = checkPage(
            projects([
                { title: "A", link: "/work/menus" },
                { title: "B", link: "/about" },
                { title: "C", link: "https://example.com/c" },
            ]),
            ["/", "/about"],
        );
        expect(flags.map((f) => [f.type, f.field])).toEqual([
            ["brokenLink", "items"],
        ]);
        expect(flags[0].message).toMatch(/\/work\/menus/);
    });

    it("says nothing about a hidden block", () => {
        expect(
            checkPage(
                projects(
                    [{ title: "A", image: { src: "https://x/a.jpg" } }],
                    true,
                ),
                ["/"],
            ),
        ).toEqual([]);
    });

    it("reaches the pre-publish check, not only the rail", () => {
        const flags = checkSite(
            site({
                pages: [
                    projects([
                        { title: "A", image: { src: "https://x/a.jpg" } },
                    ]),
                ],
            }),
        );
        expect(flags.map((f) => [f.type, f.field])).toContainEqual([
            "emptyRequiredField",
            "items",
        ]);
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

    it("flags a four-image grid named as a gallery@2 variant", () => {
        const img = { src: "x.jpg" };
        const flags = checkPage(
            page([
                {
                    type: "gallery",
                    content: { variant: "grid", images: [img, img, img, img] },
                },
            ]),
            ["/"],
        );
        expect(types(flags)).toContain("phoneWidth");
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

describe("example text left in an added block", () => {
    it("names the example words still on the page", () => {
        const flags = checkPage(
            page([
                {
                    type: "hero",
                    content: {
                        heading: "Fresh bread, baked every morning",
                        subheading: "Our own words.",
                    },
                },
            ]),
            ["/"],
        );
        const example = flags.find(
            (f) =>
                f.type === "placeholderText" && f.message.includes("example"),
        );
        expect(example?.message).toContain(
            '"Fresh bread, baked every morning"',
        );
        expect(example?.sectionIndex).toBe(0);
    });

    it("finds an example paragraph kept inside the merchant's own rich text", () => {
        const flags = checkPage(
            page([
                {
                    type: "richText",
                    content: {
                        format: "html",
                        value: "<p>Our story.</p><p>We have been on the same corner since 1998.</p>",
                    },
                },
            ]),
            ["/"],
        );
        expect(types(flags)).toContain("placeholderText");
    });

    it("stays quiet once the merchant has written their own", () => {
        const flags = checkPage(
            page([
                {
                    type: "hero",
                    content: {
                        heading: "Packaging, storage and safety supplies",
                    },
                },
            ]),
            ["/"],
        );
        expect(flags.some((f) => f.message.includes("example"))).toBe(false);
    });

    it("does not check a hidden block", () => {
        const flags = checkPage(
            page([
                {
                    type: "hero",
                    hidden: true,
                    content: { heading: "Fresh bread, baked every morning" },
                },
            ]),
            ["/"],
        );
        expect(flags).toEqual([]);
    });
});

describe("module pages and reserved addresses (G14)", () => {
    const reserved = (flags: { type: FlagType; pageId: string | null }[]) =>
        flags.filter((f) => f.type === "reservedAddress");

    it("flags a free-form page at /book: it can't be seen, and says why", () => {
        const flags = checkSite(
            site({
                pages: [
                    page([], { id: "home" }),
                    page([], {
                        id: "walk",
                        path: "/book",
                        title: "Book a walkthrough",
                    }),
                ],
            }),
        );
        expect(reserved(flags)).toEqual([
            {
                type: "reservedAddress",
                message:
                    "This page can't be seen: /book is your booking page. Change its path so visitors can reach it.",
                pageId: "walk",
                sectionIndex: null,
                field: "path",
            },
        ]);
    });

    it("flags pages under /book and at /checkout, but not a Book page at /book", () => {
        const flags = checkSite(
            site({
                pages: [
                    page([], { id: "under", path: "/book/intro" }),
                    page([], { id: "pay", path: "/checkout" }),
                    page([], { id: "book", path: "/book", kind: "BOOK" }),
                    page([], { id: "trial", path: "/book-a-trial" }),
                ],
            }),
        );
        expect(reserved(flags).map((f) => f.pageId)).toEqual(["under", "pay"]);
    });

    it("leaves a hidden page at /book, and a page at /shop, to their own checks", () => {
        const flags = checkSite(
            site({
                pages: [
                    page([], { id: "gone", path: "/book", hidden: true }),
                    page([], { id: "range", path: "/shop" }),
                ],
            }),
        );
        expect(reserved(flags)).toEqual([]);
    });

    it("flags a free-form page at /account, which the account area's route owns (G15)", () => {
        const flags = checkSite(
            site({
                pages: [
                    page([], { id: "acct", path: "/account" }),
                    page([], { id: "accounts", path: "/accounts" }),
                ],
            }),
        );
        expect(reserved(flags).map((f) => [f.pageId, f.message])).toEqual([
            [
                "acct",
                "This page can't be seen: /account is where your customers see their account. Change its path so visitors can reach it.",
            ],
        ]);
    });

    it("doesn't ask for a module page, or one kept out of the menu, to be added to it", () => {
        const flags = checkSite(
            site({
                navigation: { items: [{ pageId: "home" }] },
                pages: [
                    page([], { id: "home" }),
                    page([], { id: "book", path: "/book", kind: "BOOK" }),
                    page([], { id: "quiet", path: "/quiet", inMenu: false }),
                    page([], { id: "about", path: "/about", title: "About" }),
                ],
            }),
        );
        const notInMenu = flags.filter((f) => f.type === "pageNotInNavigation");
        expect(notInMenu.map((f) => f.pageId)).toEqual(["about"]);
    });

    it("doesn't say a menu is missing when every other page decided its own", () => {
        const flags = checkSite(
            site({
                pages: [
                    page([], { id: "home" }),
                    page([], {
                        id: "journal",
                        path: "/journal",
                        kind: "JOURNAL",
                    }),
                ],
            }),
        );
        expect(types(flags)).not.toContain("pageNotInNavigation");
    });

    it("never flags the Shop page for sitting at the shop's address", () => {
        const flags = checkShop({
            storefrontChosen: true,
            candidates: 1,
            isShopPath: (p) => p === "/shop" || p.startsWith("/shop/"),
            pages: [
                { id: "shop", path: "/shop", hidden: false, kind: "SHOP" },
                { id: "range", path: "/shop/range", hidden: false },
            ],
        });
        expect(flags.map((f) => f.pageId)).toEqual(["range"]);
    });

    it("says 'your online shop' and 'location', never 'storefront' (DEC-069, L12)", () => {
        const flags = checkShop({
            storefrontChosen: false,
            candidates: 2,
            isShopPath: (p) => p === "/shop" || p.startsWith("/shop/"),
            pages: [{ id: "range", path: "/shop/range", hidden: false }],
        });
        expect(flags.map((f) => f.message)).toEqual([
            "Pick which location your online shop sells from. Until you do, the shop and its products don't show on the site.",
            "/shop/range is where your online shop lives. This page keeps showing there for now. Change its path so the shop can open.",
        ]);
    });
});

describe("checkAddress (DEC-069, L5)", () => {
    it("raises nothing for a site with a web address", () => {
        expect(checkAddress("rye")).toEqual([]);
    });

    it("blocks publishing a site with no web address", () => {
        expect(checkAddress(null)).toEqual([
            {
                type: "addressMissing",
                message: ADDRESS_MISSING_MESSAGE,
                pageId: null,
                sectionIndex: null,
                field: "subdomain",
                blocking: true,
            },
        ]);
        expect(ADDRESS_MISSING_MESSAGE).toMatch(
            /^Choose a web address before publishing/,
        );
    });

    it("leaves every other flag advisory", () => {
        const flags = [
            ...checkSite(site({ seoDescription: null, pages: [page([])] })),
            ...checkShop({
                storefrontChosen: false,
                candidates: 2,
                isShopPath: () => false,
                pages: [],
            }),
        ];
        expect(flags.length).toBeGreaterThan(0);
        expect(flags.some((f) => f.blocking)).toBe(false);
    });
});

describe("the industry templates' blocks (U2)", () => {
    it("asks no image of the No hero look, and names a brief when one is wanted", () => {
        const none = checkPage(
            page([
                {
                    type: "hero",
                    content: { variant: "none", heading: "Writing" },
                },
            ]),
            ["/"],
        );
        expect(types(none)).not.toContain("missingImage");

        const briefed = checkPage(
            page([
                {
                    type: "hero",
                    content: {
                        variant: "fullBleed",
                        heading: "Bread, the slow way",
                        imageBrief: "Loaves on the counter at dawn",
                    },
                },
            ]),
            ["/"],
        );
        const missing = briefed.find((f) => f.type === "missingImage");
        expect(missing?.message).toMatch(/Loaves on the counter at dawn/);
    });

    it("asks for a person's photo description, and checks their button", () => {
        const flags = checkPage(
            page([
                {
                    type: "person",
                    content: {
                        name: "Anika",
                        image: { src: "https://x/a.jpg", alt: "" },
                        cta: {
                            label: "Book",
                            action: { kind: "url", href: "/nowhere" },
                        },
                    },
                },
            ]),
            ["/"],
        );
        expect(flags.map((f) => [f.type, f.field])).toEqual(
            expect.arrayContaining([
                ["emptyRequiredField", "image"],
                ["brokenLink", "cta"],
            ]),
        );
    });
});

describe("a template's placeholder words (template polish)", () => {
    const placeholders = (sections: { type: string; content: unknown }[]) =>
        checkPage(page(sections), ["/"]).filter(
            (f) => f.type === "placeholderText",
        );

    it("names a person, points, text and work still in a template's words", () => {
        const flags = placeholders([
            {
                type: "person",
                content: {
                    name: "Iron & Oak",
                    bio: "A placeholder. Say what they coach, how long they have done it.",
                },
            },
            {
                type: "person",
                content: {
                    name: "Dr Priya",
                    credentials: [
                        "Your degree — the subject, where you studied and the year",
                    ],
                },
            },
            {
                type: "features",
                content: {
                    items: [
                        {
                            title: "Day rate",
                            body: "Your day rate, what it is for, and any minimum.",
                        },
                    ],
                },
            },
            {
                type: "richText",
                content: {
                    value: "<h2>The studio</h2><p>Say how much work is taken on in a year.</p>",
                },
            },
            {
                type: "projects",
                content: { items: [{ title: "Your lead project" }] },
            },
        ]);
        expect(flags.map((f) => f.sectionIndex)).toEqual([0, 1, 2, 3, 4]);
        expect(flags[0].message).toContain(
            '("A placeholder. Say what they coach',
        );
        expect(flags[4].message).toContain('"Your lead project"');
    });

    it("finds it in a team member, a callout or a fact", () => {
        const flags = placeholders([
            {
                type: "person",
                content: {
                    variant: "team",
                    name: "Devika",
                    people: [{ name: "Your second coach" }],
                },
            },
            {
                type: "richText",
                content: {
                    value: "<p>Our story.</p>",
                    callout: { text: "Placeholders: replace this." },
                },
            },
            {
                type: "features",
                content: {
                    variant: "facts",
                    items: [{ title: "In practice", value: "A placeholder" }],
                },
            },
        ]);
        expect(flags).toHaveLength(3);
    });

    it("leaves an owner's own words alone, and a photo brief, which is a note to them", () => {
        const flags = placeholders([
            {
                type: "person",
                content: {
                    name: "Anika Rao",
                    role: "Clinical dietician",
                    bio: "Say hello at the desk when you arrive.\nYour first visit is free.",
                    imageBrief: "Write two or three words about the light",
                },
            },
            {
                type: "features",
                content: {
                    items: [
                        {
                            title: "Your order, your way",
                            body: "Write to us any time; we answer within a day.",
                        },
                    ],
                },
            },
            {
                type: "projects",
                content: {
                    items: [
                        {
                            title: "A shopfront in Bandra",
                            imageBrief: "A placeholder for the photo",
                        },
                    ],
                },
            },
        ]);
        expect(flags).toEqual([]);
    });

    it("says it once for a text block that already says placeholder", () => {
        const flags = placeholders([
            {
                type: "richText",
                content: {
                    value: "<p>This is a placeholder for your story.</p>",
                },
            },
        ]);
        expect(flags).toHaveLength(1);
        expect(flags[0].field).toBe("value");
    });

    it("flags every industry template's person, features, text and projects laid down as placeholders", () => {
        const ctx = {
            organizationName: "Sample business",
            modules: ["WEBSITE", "APPOINTMENTS", "COMMERCE", "POSTS"],
            serviceIds: ["svc_1"],
        };
        let checked = 0;
        for (const template of listTemplates()) {
            const made = instantiateTemplate(template, ctx);
            for (const p of made.pages) {
                const flagged = new Set(
                    checkPage(
                        page(
                            p.sections.map((s) => ({
                                type: s.type,
                                content: s.content,
                            })),
                            { path: p.path },
                        ),
                        made.pages.map((x) => x.path),
                    )
                        .filter((f) => f.type === "placeholderText")
                        .map((f) => f.sectionIndex),
                );
                p.sections.forEach((s, i) => {
                    const text = JSON.stringify(s.content);
                    if (
                        ["person", "features", "richText", "projects"].includes(
                            s.type,
                        ) &&
                        /A placeholder|This is a placeholder/.test(text)
                    ) {
                        checked++;
                        expect({
                            template: template.id,
                            path: p.path,
                            index: i,
                            flagged: flagged.has(i),
                        }).toMatchObject({ flagged: true });
                    }
                });
            }
        }
        // Not a vacuous pass: the templates do ship such sections.
        expect(checked).toBeGreaterThan(5);
    });
});
