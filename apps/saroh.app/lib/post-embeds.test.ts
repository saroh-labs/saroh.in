import { beforeEach, describe, expect, it, vi } from "vitest";

import {
    embedsIn,
    fillContents,
    fillPostEmbeds,
} from "@/components/post-embeds";

import { getBookingPage } from "./booking-page";
import { shopFetch } from "./catalogue";
import { dontCachePage } from "./page-cache/site-rules";
import { resolvePostEmbeds } from "./post-embeds";

/**
 * A post's cards (U15b) are read when the page renders: the live price,
 * nothing for a service or product that's gone, and a post without cards
 * exactly as it was. The reads are mocked.
 */

vi.mock("@/env", () => ({
    env: { API_URL: "https://api.test", NEXT_PUBLIC_ROOT_DOMAIN: "saroh.app" },
}));
vi.mock("./booking-page", () => ({ getBookingPage: vi.fn() }));
vi.mock("./catalogue", () => ({ shopFetch: vi.fn() }));
vi.mock("./page-cache/site-rules", () => ({
    dontCachePage: vi.fn(),
    listsProducts: vi.fn(),
    showsServicesOffered: vi.fn(),
}));

const svc = (id: string) => `<div data-embed="service" data-id="${id}"></div>`;
const prod = (id: string) => `<div data-embed="product" data-id="${id}"></div>`;

const trial = {
    id: "svc1",
    name: "Trial session",
    description: null,
    durationMinutes: 90,
    kind: "one" as const,
    capacity: 1,
    priceCents: 250000,
    currency: "INR",
};

const offered = (services: (typeof trial)[]) =>
    vi.mocked(getBookingPage).mockResolvedValue({
        ok: true,
        page: { services } as never,
    });

const lipstick = {
    slug: "matte-lipstick",
    name: "Matte <lipstick>",
    currency: "INR",
    price: "650.00",
    mrp: null,
    priceFrom: false,
    image: null,
    variantTitles: [],
    blurb: null,
    soldOut: false,
};

beforeEach(() => {
    vi.clearAllMocks();
});

describe("resolvePostEmbeds", () => {
    it("leaves a post with no cards unchanged and reads nothing", async () => {
        const html = "<h2>Before</h2><p>Bring <strong>two</strong> photos.</p>";
        expect(await resolvePostEmbeds(html, "site-1")).toBe(html);
        expect(getBookingPage).not.toHaveBeenCalled();
        expect(shopFetch).not.toHaveBeenCalled();
    });

    it("draws a service card with the price Services has now", async () => {
        offered([trial]);
        const before = await resolvePostEmbeds(`<p>A</p>${svc("svc1")}`, "s");
        expect(before).toContain("Trial session");
        expect(before).toContain("₹2,500");
        expect(before).toContain('href="/book?service=svc1"');
        expect(before).not.toContain("data-embed");

        offered([{ ...trial, priceCents: 300000 }]);
        const after = await resolvePostEmbeds(`<p>A</p>${svc("svc1")}`, "s");
        expect(after).toContain("₹3,000");
        expect(after).not.toContain("₹2,500");
    });

    it("draws nothing for a service that's gone, and keeps the words", async () => {
        offered([]);
        expect(await resolvePostEmbeds(`<p>A</p>${svc("svc1")}`, "s")).toBe(
            "<p>A</p>",
        );
    });

    it("draws nothing and isn't kept when the booking read fails", async () => {
        vi.mocked(getBookingPage).mockResolvedValue({
            ok: false,
            reason: "unavailable",
        });
        expect(await resolvePostEmbeds(svc("svc1"), "s")).toBe("");
        expect(dontCachePage).toHaveBeenCalled();
    });

    it("draws a product from the shop, escaped, and drops a deleted one", async () => {
        vi.mocked(shopFetch).mockImplementation((path: string) =>
            Promise.resolve(
                new Response(
                    JSON.stringify({
                        products: path.includes("ids=p1") ? [lipstick] : [],
                    }),
                ),
            ),
        );
        const out = await resolvePostEmbeds(prod("p1") + prod("gone"), "s");
        expect(out).toContain("Matte &lt;lipstick&gt;");
        expect(out).toContain('href="/shop/matte-lipstick"');
        expect(out).toContain("₹650");
        expect(out.match(/data-post-card/g)).toHaveLength(1);
    });
});

describe("embedsIn and fillPostEmbeds", () => {
    it("finds each card once, inside a quote too", () => {
        expect(
            embedsIn(
                `${svc("a")}<blockquote>${svc("a")}${prod("b")}</blockquote>`,
            ),
        ).toEqual({ service: ["a"], product: ["b"], book: [], offer: [] });
    });

    it("never draws a marker it didn't write", () => {
        const odd = '<div data-embed="service" data-id="a" style="x"></div>';
        expect(fillPostEmbeds(odd, { services: null, products: null })).toBe(
            odd,
        );
    });
});

describe("a post's own blocks (W2)", () => {
    it("draws a Book now button from the service offered now, else nothing", async () => {
        offered([trial]);
        const out = await resolvePostEmbeds(
            '<div data-embed="book" data-id="svc1"></div><div data-embed="book" data-id="gone"></div>',
            "s",
        );
        expect(out).toBe(
            '<p data-button="link"><a href="/book?service=svc1" aria-label="Book now: Trial session">Book now</a></p>',
        );
    });

    it("draws a live offer, escaped, and nothing for an ended one", async () => {
        const fetch = vi.fn((url: string) =>
            Promise.resolve(
                url.endsWith("/offers/d1")
                    ? new Response(
                          JSON.stringify({
                              name: "Buns <b>",
                              headline: "20% off",
                              until: "until 30 Nov",
                              code: "BUN20",
                          }),
                      )
                    : new Response("{}", { status: 404 }),
            ),
        );
        vi.stubGlobal("fetch", fetch);
        const out = await resolvePostEmbeds(
            '<div data-embed="offer" data-id="d1"></div><div data-embed="offer" data-id="d2"></div>',
            "s",
        );
        vi.unstubAllGlobals();
        expect(out).toContain("20% off · Buns &lt;b&gt;");
        expect(out).toContain("until 30 Nov · Code BUN20");
        expect(out.match(/data-post-card/g)).toHaveLength(1);
        expect(fetch.mock.calls[0]?.[0]).toBe(
            "https://api.test/public/sites/s/offers/d1",
        );
    });

    it("lists the headings in the contents block and anchors them", () => {
        const out = fillContents(
            '<div data-contents="headings"></div><h2>Before you come</h2><p>x</p><h2 style="text-align: center">Before you come</h2>',
        );
        expect(out).toContain('<h2 id="before-you-come">Before you come</h2>');
        expect(out).toContain(
            '<h2 id="before-you-come-2" style="text-align: center">',
        );
        expect(out).toContain('href="#before-you-come-2"');
        expect(fillContents("<h2>A</h2>")).toBe("<h2>A</h2>");
        expect(
            fillContents('<div data-contents="headings"></div><p>x</p>'),
        ).toBe("<p>x</p>");
    });
});
