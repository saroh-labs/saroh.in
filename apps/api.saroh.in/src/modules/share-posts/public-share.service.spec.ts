// The share pictures' routes (#1375 U5, #1378 U6): each kind is drawn only
// while the live site shows it, anything else is a 404, and an unknown
// style or size is Photo on a Post. The database, the public reads and the
// renderer are stood in for; the drawing has its own specs (`cards/`).
jest.mock("@saroh/database", () => ({
    ...jest.requireActual("@saroh/database"),
    prisma: {
        discount: { findFirst: jest.fn() },
        sharePost: { findUnique: jest.fn() },
        site: { findFirst: jest.fn() },
    },
}));
jest.mock("./cards/card-renderer", () => ({
    renderCard: jest.fn(() => Promise.resolve(Buffer.from("png"))),
}));

import "reflect-metadata";

import { NotFoundException } from "@nestjs/common";
import { prisma } from "@saroh/database";

import type { CardRender } from "./cards/card-renderer";
import { renderCard } from "./cards/card-renderer";
import {
    classWhen,
    offerUntil,
    PublicShareService,
} from "./public-share.service";

const db = prisma as unknown as {
    discount: { findFirst: jest.Mock };
    sharePost: { findUnique: jest.Mock };
    site: { findFirst: jest.Mock };
};
const drawn = renderCard as jest.Mock<Promise<Buffer>, [CardRender]>;

const ORG = "org1";
const MEDIA = "https://media.saroh.test";

function setup() {
    const sites = {
        getPublicationBySiteId: jest.fn((siteId: string) =>
            siteId === "site_1"
                ? Promise.resolve({
                      organizationId: ORG,
                      primaryHost: "rye.saroh.app",
                      icon: null,
                      snapshot: {
                          site: {
                              name: "Rye & Co.",
                              styleVariables: { "--site-accent": "16 60% 40%" },
                          },
                      },
                  })
                : Promise.reject(new NotFoundException()),
        ),
        getPublicPost: jest.fn((_site: string, slug: string) =>
            slug === "diwali-hours"
                ? Promise.resolve({
                      snapshot: {
                          post: { title: "Diwali hours", image: null },
                      },
                  })
                : Promise.reject(new NotFoundException()),
        ),
    };
    const product = {
        name: "Cardamom bun box",
        price: "360.00",
        currency: "INR",
        images: [
            {
                kind: "photo",
                url: `${MEDIA}/org/${ORG}/product-image/bun.webp`,
                posterUrl: null,
            },
        ],
    };
    const catalogue = {
        product: jest.fn((_site: string, slug: string) =>
            slug === "bun"
                ? Promise.resolve(product)
                : Promise.reject(new NotFoundException()),
        ),
        list: jest.fn(() => Promise.resolve({ products: [] })),
    };
    const page = {
        open: true,
        currency: "INR",
        services: [
            {
                id: "svc_1",
                name: "Haircut",
                kind: "one",
                durationMinutes: 45,
                priceCents: 80000,
                currency: "INR",
            },
            {
                id: "cls_1",
                name: "Morning yoga",
                kind: "class",
                durationMinutes: 60,
                priceCents: null,
                currency: null,
            },
        ],
    };
    const bookings = {
        publicBookingPage: jest.fn(() => Promise.resolve(page)),
    };
    const timetable = {
        read: jest.fn(() =>
            Promise.resolve({
                sessions: [
                    { serviceId: "cls_1", date: "2026-11-15", time: "07:00" },
                ],
            }),
        ),
    };
    const media = {
        readReadyObjectStart: jest.fn(() =>
            Promise.resolve({
                bytes: new Uint8Array([7]),
                contentType: "image/png",
            }),
        ),
    };
    const storage = {
        getPublicUrl: (key: string) => `${MEDIA}/${key}`,
        readObjectStart: jest.fn(() => Promise.resolve(new Uint8Array([1, 2]))),
    };
    const service = new PublicShareService(
        sites as never,
        catalogue as never,
        bookings as never,
        timetable as never,
        media as never,
        storage as never,
    );
    return { service, sites, catalogue, page, storage, media };
}

const missing = (work: Promise<unknown>) =>
    expect(work).rejects.toBeInstanceOf(NotFoundException);

beforeEach(() => {
    drawn.mockClear();
    db.discount.findFirst.mockReset();
    db.sharePost.findUnique.mockReset();
    db.site.findFirst.mockReset();
});

describe("a live item's picture", () => {
    it("draws a live product with its price, its own photo from storage and the site's look", async () => {
        const { service, storage } = setup();
        const png = await service.item(
            "site_1",
            "product",
            "bun",
            { style: "price", size: "story" },
            "v",
        );
        expect(png).toEqual(Buffer.from("png"));
        expect(drawn.mock.calls[0]?.[0]).toMatchObject({
            style: "price",
            size: "story",
            name: "Cardamom bun box",
            price: "₹360",
            business: "Rye & Co.",
            address: "rye.saroh.app",
            variables: { "--site-accent": "16 60% 40%" },
            photo: new Uint8Array([1, 2]),
        });
        // Read from storage by its key, never fetched from the address.
        expect(storage.readObjectStart).toHaveBeenCalledWith(
            `org/${ORG}/product-image/bun.webp`,
            expect.any(Number),
        );
    });

    it("draws an unknown style or size as Photo on a Post", async () => {
        const { service } = setup();
        await service.item(
            "site_1",
            "product",
            "bun",
            { style: "poster", size: "huge" },
            "v",
        );
        expect(drawn.mock.calls[0]?.[0]).toMatchObject({
            style: "photo",
            size: "post",
        });
    });

    it("is a 404 for a draft or unknown product, an unknown kind, or a site that isn't live", async () => {
        const { service } = setup();
        await missing(service.item("site_1", "product", "draft-loaf", {}, "v"));
        await missing(service.item("site_1", "booking", "b_1", {}, "v"));
        await missing(service.item("site_gone", "product", "bun", {}, "v"));
        expect(drawn).not.toHaveBeenCalled();
    });

    it("draws a service with its price and length, and a class with when it next meets", async () => {
        const { service } = setup();
        await service.item("site_1", "service", "svc_1", {}, "v");
        expect(drawn.mock.calls[0]?.[0]).toMatchObject({
            name: "Haircut",
            price: "₹800",
            unit: "45 min",
        });
        await service.item("site_1", "service", "cls_1", {}, "v");
        expect(drawn.mock.calls[1]?.[0]).toMatchObject({
            name: "Morning yoga",
            price: null,
            unit: "Next class Sun 15 Nov, 07:00",
        });
    });

    it("is a 404 for a service the booking page doesn't offer, or when bookings are off", async () => {
        const { service, page } = setup();
        await missing(service.item("site_1", "service", "svc_other", {}, "v"));
        page.open = false;
        await missing(service.item("site_1", "service", "svc_1", {}, "v"));
        await missing(service.item("site_1", "book", "page", {}, "v"));
    });

    it("draws a live blog post with Read more, and the booking page as Book your slot", async () => {
        const { service } = setup();
        await service.item("site_1", "post", "diwali-hours", {}, "v");
        expect(drawn.mock.calls[0]?.[0]).toMatchObject({
            name: "Diwali hours",
            cta: "Read more",
            kindLabel: "From the blog",
        });
        await missing(service.item("site_1", "post", "a-draft", {}, "v"));
        await service.item("site_1", "book", "page", {}, "v");
        expect(drawn.mock.calls[1]?.[0]).toMatchObject({
            name: "Book your slot",
            price: null,
            cta: "Book now",
            kindLabel: "Bookings",
        });
    });

    it("never draws a headline from the public address", async () => {
        const { service } = setup();
        await service.item(
            "site_1",
            "book",
            "page",
            { headline: "Anything anyone types" },
            "v",
        );
        expect(drawn.mock.calls[0]?.[0].name).toBe("Book your slot");
        await service.item(
            "site_1",
            "product",
            "bun",
            { headline: "Anything" },
            "v",
        );
        expect(drawn.mock.calls[1]?.[0].name).toBe("Cardamom bun box");
    });
});

describe("the booking page's card for the business's own people", () => {
    it("draws the sheet's headline on its own live site, as text, capped", async () => {
        const { service } = setup();
        db.site.findFirst.mockResolvedValue({ id: "site_1" });
        await service.bookForOrganization(
            ORG,
            { headline: "  Cake consults\nopen <b>Saturday</b>  ", w: "240" },
            "u",
        );
        expect(db.site.findFirst).toHaveBeenLastCalledWith(
            expect.objectContaining({
                where: expect.objectContaining({ organizationId: ORG }),
            }),
        );
        expect(drawn.mock.calls[0]?.[0]).toMatchObject({
            name: "Cake consults open <b>Saturday</b>",
            cta: "Book now",
            width: 240,
        });
        await service.bookForOrganization(
            ORG,
            { headline: "a".repeat(200) },
            "u",
        );
        expect(drawn.mock.calls[1]?.[0].name).toHaveLength(90);
        for (const headline of ["   ", ["x"], 7]) {
            await service.bookForOrganization(ORG, { headline }, "u");
            expect(drawn.mock.calls.at(-1)?.[0].name).toBe("Book your slot");
        }
    });

    it("is a 404 with no live site, or when bookings are off", async () => {
        const { service, page } = setup();
        db.site.findFirst.mockResolvedValueOnce(null);
        await missing(service.bookForOrganization(ORG, {}, "u"));
        db.site.findFirst.mockResolvedValue({ id: "site_1" });
        page.open = false;
        await missing(service.bookForOrganization(ORG, {}, "u"));
        expect(drawn).not.toHaveBeenCalled();
    });
    it("passes valid card colours and a thumbnail width, and ignores anything else", async () => {
        const { service } = setup();
        await service.item(
            "site_1",
            "product",
            "bun",
            { bg: "#3E5A45", fg: "#f4ebdd", w: "240" },
            "v",
        );
        expect(drawn.mock.calls[0]?.[0]).toMatchObject({
            ground: "#3e5a45",
            ink: "#f4ebdd",
            width: 240,
        });
        for (const query of [
            { bg: "red", fg: "#fff", w: "2000" },
            { bg: "#3e5a45;x", fg: "url(x)", w: "abc" },
            { bg: ["#000000"], w: "10" },
        ]) {
            await service.item("site_1", "product", "bun", query, "v");
            expect(drawn.mock.calls.at(-1)?.[0]).toMatchObject({
                ground: null,
                ink: null,
                width: null,
            });
        }
    });

    it("passes a curated font, and the site's own faces otherwise", async () => {
        const { service } = setup();
        await service.item("site_1", "book", "page", { font: "mukta" }, "v");
        expect(drawn.mock.calls[0]?.[0].fonts.heading).toBe("Mukta");
        await service.item("site_1", "book", "page", { font: "comic" }, "v");
        expect(drawn.mock.calls[1]?.[0].fonts.heading).toBeNull();
    });
});

describe("an offer's picture", () => {
    const discount = (over: Record<string, unknown> = {}) => ({
        code: "BUN20",
        description: null,
        kind: "PERCENTAGE",
        percentBps: 2000,
        amount: null,
        currency: null,
        appliesTo: "PRODUCT",
        startsAt: null,
        endsAt: null,
        usageLimit: null,
        products: [{ product: { slug: "bun" } }],
        _count: { redemptions: 0 },
        ...over,
    });

    it("draws a live discount on a product with its old and new price and its code", async () => {
        const { service } = setup();
        db.discount.findFirst.mockResolvedValue(discount());
        await service.item("site_1", "offer", "d_1", { style: "offer" }, "v");
        expect(db.discount.findFirst).toHaveBeenCalledWith(
            expect.objectContaining({
                where: { id: "d_1", organizationId: ORG },
            }),
        );
        expect(drawn.mock.calls[0]?.[0]).toMatchObject({
            name: "Cardamom bun box",
            offer: {
                headline: "20% off",
                was: "₹360",
                now: "₹288",
                code: "BUN20",
            },
        });
    });

    it("draws the product being shared, and only one the discount is on", async () => {
        const { service, catalogue } = setup();
        db.discount.findFirst.mockResolvedValue(discount());
        await service.item(
            "site_1",
            "offer",
            "d_1",
            { style: "offer", product: "bun" },
            "v",
        );
        // The product asked for is looked for among the discount's own.
        expect(db.discount.findFirst).toHaveBeenCalledWith(
            expect.objectContaining({
                select: expect.objectContaining({
                    products: expect.objectContaining({
                        where: {
                            product: { status: "PUBLISHED", slug: "bun" },
                        },
                    }),
                }),
            }),
        );
        expect(catalogue.product).toHaveBeenLastCalledWith(
            "site_1",
            "bun",
            "v",
        );
        expect(drawn.mock.calls[0]?.[0]).toMatchObject({
            name: "Cardamom bun box",
        });
        // A product the discount isn't on: its products come back empty.
        db.discount.findFirst.mockResolvedValueOnce(discount({ products: [] }));
        await missing(
            service.item("site_1", "offer", "d_1", { product: "rye" }, "v"),
        );
    });

    it("draws a discount on the whole shop only while the shop is open", async () => {
        const { service, catalogue } = setup();
        db.discount.findFirst.mockResolvedValue(
            discount({
                appliesTo: "BUSINESS",
                products: [],
                kind: "FIXED_AMOUNT",
                percentBps: null,
                amount: "50.00",
                currency: "INR",
            }),
        );
        await service.item("site_1", "offer", "d_1", {}, "v");
        expect(drawn.mock.calls[0]?.[0]).toMatchObject({
            name: "Rye & Co.",
            offer: { headline: "₹50 off", code: "BUN20" },
        });
        catalogue.list.mockRejectedValueOnce(new NotFoundException());
        await missing(service.item("site_1", "offer", "d_1", {}, "v"));
    });

    it("is a 404 for an offer not yet started, ended, used up, another business's, or on a product the shop doesn't sell", async () => {
        const { service } = setup();
        const day = 86_400_000;
        for (const over of [
            { startsAt: new Date(Date.now() + day) },
            { endsAt: new Date(Date.now() - day) },
            { usageLimit: 3, _count: { redemptions: 3 } },
            { products: [{ product: { slug: "draft-loaf" } }] },
            { products: [] },
        ]) {
            db.discount.findFirst.mockResolvedValueOnce(discount(over));
            await missing(service.item("site_1", "offer", "d_1", {}, "v"));
        }
        // Another business's: the read is scoped to this site's, so none.
        db.discount.findFirst.mockResolvedValueOnce(null);
        await missing(service.item("site_1", "offer", "d_other", {}, "v"));
        expect(drawn).not.toHaveBeenCalled();
    });

    it("says when it ends", () => {
        const now = new Date("2026-11-12T10:00:00Z");
        expect(offerUntil(null, now)).toBeNull();
        expect(offerUntil(new Date("2026-11-15T00:00:00Z"), now)).toBe(
            "this week only",
        );
        expect(offerUntil(new Date("2026-11-30T00:00:00Z"), now)).toBe(
            "until 30 Nov",
        );
        expect(classWhen("2026-11-15", "07:00")).toBe("Sun 15 Nov, 07:00");
    });
});

describe("an own post's picture", () => {
    const post = {
        organizationId: ORG,
        headline: "नई टाइमिंग सोमवार से",
        mediaId: "m_1",
        style: "simple",
        size: "story",
    };

    it("draws the post's headline and photo on its business's live site, in its saved style", async () => {
        const { service, media } = setup();
        db.sharePost.findUnique.mockResolvedValue(post);
        db.site.findFirst.mockResolvedValue({ id: "site_1" });
        await service.own("sp_1", {}, "v");
        expect(media.readReadyObjectStart).toHaveBeenCalledWith(
            ORG,
            "m_1",
            expect.any(Number),
        );
        expect(drawn.mock.calls[0]?.[0]).toMatchObject({
            name: "नई टाइमिंग सोमवार से",
            style: "simple",
            size: "story",
            photo: new Uint8Array([7]),
        });
        await service.own("sp_1", { style: "photo", size: "square" }, "v");
        expect(drawn.mock.calls[1]?.[0]).toMatchObject({
            style: "photo",
            size: "square",
        });
    });

    it("is a 404 for an unknown post, or one whose business has no live site", async () => {
        const { service } = setup();
        db.sharePost.findUnique.mockResolvedValueOnce(null);
        await missing(service.own("sp_none", {}, "v"));
        db.sharePost.findUnique.mockResolvedValueOnce(post);
        db.site.findFirst.mockResolvedValueOnce(null);
        await missing(service.own("sp_1", {}, "v"));
        expect(db.site.findFirst).toHaveBeenCalledWith(
            expect.objectContaining({
                where: expect.objectContaining({
                    organizationId: ORG,
                    currentPublication: { kind: "LIVE" },
                }),
            }),
        );
        expect(drawn).not.toHaveBeenCalled();
    });
});

describe("photos", () => {
    it("reads only the business's own photos at the address storage gives them", async () => {
        const { service, storage } = setup();
        const { catalogue } = {
            catalogue: (
                service as unknown as { catalogue: { product: jest.Mock } }
            ).catalogue,
        };
        for (const url of [
            "https://evil.test/org/org1/product-image/bun.webp",
            `${MEDIA}/org/org2/product-image/bun.webp`,
        ]) {
            catalogue.product.mockResolvedValueOnce({
                name: "x",
                price: "1.00",
                currency: "INR",
                images: [{ kind: "photo", url, posterUrl: null }],
            });
            await service.item("site_1", "product", "bun", {}, "v");
        }
        expect(storage.readObjectStart).not.toHaveBeenCalled();
        expect(drawn.mock.calls.map(([c]) => c.photo)).toEqual([null, null]);
    });
});
