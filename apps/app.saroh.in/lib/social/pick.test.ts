import { describe, expect, it } from "vitest";

import { cardsFor } from "@/lib/share-item/share";

import { addressOf, fixedChoices, pageChoices } from "./links";
import type { PickRow, PickSources } from "./pick";
import { filterRows, pickRows } from "./pick";

const LINKS = {
    site: "https://rye.example.com",
    shop: "https://rye.example.com/shop",
    book: "https://rye.example.com/book",
};

const SOURCES: PickSources = {
    products: [
        {
            id: "p1",
            name: "Cardamom bun box",
            slug: "cardamom-bun-box",
            status: "PUBLISHED",
            price: "360",
            currency: "INR",
            image: "https://media.example.com/buns.jpg",
            updatedAt: "2026-11-10T10:00:00Z",
        },
        {
            id: "p2",
            name: "Stollen",
            slug: "stollen",
            status: "DRAFT",
            price: "900",
            currency: "INR",
            image: null,
            updatedAt: "2026-11-11T10:00:00Z",
        },
        {
            id: "p3",
            name: "Old loaf",
            slug: "old-loaf",
            status: "ARCHIVED",
            price: "90",
            currency: "INR",
            image: null,
            updatedAt: "2026-11-11T10:00:00Z",
        },
    ],
    services: [
        {
            id: "s1",
            name: "Sourdough class",
            status: "ACTIVE",
            showOnBookingPage: true,
            capacity: 8,
            priceCents: 150000,
            currency: "INR",
            updatedAt: "2026-11-09T10:00:00Z",
        },
        {
            id: "s2",
            name: "Staff tasting",
            status: "ACTIVE",
            showOnBookingPage: false,
            capacity: 1,
            priceCents: null,
            currency: null,
            updatedAt: "2026-11-09T10:00:00Z",
        },
    ],
    posts: [
        {
            id: "b1",
            title: "How we shape a cardamom bun",
            slug: "how-we-shape",
            excerpt: "A 4-minute read",
            image: "https://media.example.com/cover.jpg",
            live: true,
            publishedAt: "2026-11-09T08:00:00Z",
            createdAt: "2026-11-08T08:00:00Z",
        },
        {
            id: "b2",
            title: "Our Christmas menu",
            slug: "christmas",
            excerpt: null,
            image: null,
            live: false,
            publishedAt: null,
            createdAt: "2026-11-12T08:00:00Z",
        },
    ],
    offers: [
        {
            id: "d1",
            code: "BUNS20",
            description: "20% off cardamom buns",
            kind: "PERCENTAGE",
            percent: "20",
            amount: null,
            currency: null,
            endsAt: "2026-11-15T18:00:00Z",
            state: "ACTIVE",
        },
        {
            id: "d2",
            code: "OLD10",
            description: null,
            kind: "PERCENTAGE",
            percent: "10",
            amount: null,
            currency: null,
            endsAt: "2026-10-01T18:00:00Z",
            state: "EXPIRED",
        },
    ],
    booking: { state: "live", url: LINKS.book },
    links: LINKS,
    postsPrefix: null,
};

const itemOf = (row: { item: PickRow["item"] }) => {
    if (!row.item) throw new Error("A draft");
    return row.item;
};

const byKey = (key: string) => {
    const row = pickRows(SOURCES).find((r) => r.key === key);
    if (!row) throw new Error(`No row ${key}`);
    return row;
};

describe("pickRows (SGPick*)", () => {
    it("lists each kind live with its own page and its cards", () => {
        const product = byKey("product:p1");
        expect(product.item?.url).toBe(
            "https://rye.example.com/shop/cardamom-bun-box",
        );
        expect(cardsFor(itemOf(product))).toEqual([
            "photo",
            "price",
            "simple",
            "colour",
        ]);
        const service = byKey("service:s1");
        expect(service.line).toBe("Class · ₹1,500");
        expect(service.item?.url).toBe(
            "https://rye.example.com/book?service=s1",
        );
        const post = byKey("post:b1");
        expect(post.item?.url).toBe(
            "https://rye.example.com/blog/how-we-shape",
        );
        expect(cardsFor(itemOf(post))).toEqual(["photo", "colour", "simple"]);
        const offer = byKey("offer:d1");
        expect(offer.line).toContain("code BUNS20");
        expect(cardsFor(itemOf(offer))).toEqual(["offer", "simple", "colour"]);
        const book = byKey("book:page");
        expect(cardsFor(itemOf(book))).toEqual(["colour", "photo", "simple"]);
    });

    it("keeps drafts, greyed with nothing to share", () => {
        expect(byKey("product:p2").item).toBeNull();
        expect(byKey("product:p2").line).toBe("Product · not published");
        expect(byKey("post:b2").item).toBeNull();
    });

    it("never lists what has no page: archived, team-only, expired offers", () => {
        const keys = pickRows(SOURCES).map((r) => r.key);
        expect(keys).not.toContain("product:p3");
        expect(keys).not.toContain("service:s2");
        expect(keys).not.toContain("offer:d2");
    });

    it("puts the booking page first, then the rest recent first", () => {
        const keys = pickRows(SOURCES).map((r) => r.key);
        expect(keys[0]).toBe("book:page");
        expect(keys.indexOf("product:p2")).toBeLessThan(
            keys.indexOf("product:p1"),
        );
    });

    it("grey everything when the site's pages aren't live", () => {
        const rows = pickRows({
            ...SOURCES,
            booking: { state: "draft", url: null },
            links: { site: null, shop: null, book: null },
        });
        expect(rows.every((r) => r.item === null)).toBe(true);
    });

    it("filters by kind and search", () => {
        const rows = pickRows(SOURCES);
        expect(filterRows(rows, "post", "").map((r) => r.key)).toEqual([
            "post:b2",
            "post:b1",
        ]);
        expect(filterRows(rows, "all", "CARDAMOM").map((r) => r.key)).toEqual(
            expect.arrayContaining(["product:p1", "post:b1", "offer:d1"]),
        );
    });
});

describe("link choices (SGOwn Link)", () => {
    it("offers Home, Booking page and Shop only while live, as paths", () => {
        expect(fixedChoices({ links: LINKS, pages: [] })).toEqual([
            { value: "home", label: "Home", path: "/" },
            { value: "book", label: "Booking page", path: "/book" },
            { value: "shop", label: "Shop", path: "/shop" },
        ]);
        expect(
            fixedChoices({
                links: { ...LINKS, shop: null, book: null },
                pages: [],
            }).map((c) => c.value),
        ).toEqual(["home"]);
        expect(
            fixedChoices({
                links: { site: null, shop: null, book: null },
                pages: [],
            }),
        ).toEqual([]);
    });

    it("offers the site's shown pages, never home, hidden or module pages", () => {
        const pages = pageChoices({
            links: LINKS,
            pages: [
                {
                    id: "1",
                    path: "/",
                    title: "Home",
                    isHome: true,
                    hidden: false,
                },
                {
                    id: "2",
                    path: "/work-with-us",
                    title: "Work with us",
                    isHome: false,
                    hidden: false,
                    kind: "FREE",
                },
                {
                    id: "3",
                    path: "/secret",
                    title: "Secret",
                    isHome: false,
                    hidden: true,
                },
                {
                    id: "4",
                    path: "/shop",
                    title: "Shop",
                    isHome: false,
                    hidden: false,
                    kind: "SHOP",
                },
            ],
        });
        expect(pages).toEqual([
            { value: "page:2", label: "Work with us", path: "/work-with-us" },
        ]);
        expect(
            pageChoices({ links: { ...LINKS, site: null }, pages: [] }),
        ).toEqual([]);
        expect(addressOf("https://rye.example.com/", "/work-with-us")).toBe(
            "https://rye.example.com/work-with-us",
        );
    });
});
