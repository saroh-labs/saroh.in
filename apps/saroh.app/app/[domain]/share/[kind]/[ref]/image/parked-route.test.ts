import { beforeEach, describe, expect, it, vi } from "vitest";

import type * as ShareCard from "@/lib/share-card";
import { shareCard } from "@/lib/share-card";

import { GET } from "./parked-route";

/**
 * The share picture's route (#1375 U1): a live product or service on this
 * site is a PNG anyone may fetch; anything else is a 404. The data layer
 * and next/og's renderer are stood in for; the card's layout has its own
 * test (`lib/share-card.test.ts`).
 */

const data = vi.hoisted(
    (): {
        site: unknown;
        product: unknown;
        booking: unknown;
        drawn: unknown[];
    } => ({ site: null, product: null, booking: null, drawn: [] }),
);

vi.mock("@/lib/publication", () => ({
    getSiteForHost: vi.fn(() => Promise.resolve(data.site)),
}));
vi.mock("@/lib/catalogue", () => ({
    getCatalogueProduct: vi.fn((_site: string, slug: string) =>
        Promise.resolve(
            slug === "sourdough" && data.product
                ? { ok: true, data: data.product }
                : { ok: false, reason: "missing" },
        ),
    ),
}));
vi.mock("@/lib/booking-page", () => ({
    getBookingPage: vi.fn(() => Promise.resolve(data.booking)),
}));
vi.mock("next/og", () => ({
    ImageResponse: class extends Response {
        constructor(
            element: unknown,
            options: { headers?: Record<string, string> },
        ) {
            data.drawn.push(element);
            super("png", {
                headers: { "content-type": "image/png", ...options.headers },
            });
        }
    },
}));
vi.mock("@/lib/share-card", async (load) => {
    const real = await load<typeof ShareCard>();
    return { ...real, shareCard: vi.fn(real.shareCard) };
});

function site(mode: "live" | "test" = "live") {
    return {
        siteId: "site_1",
        mode,
        modules: null,
        icon: null,
        release: null,
        snapshot: {
            site: {
                name: "Rye & Co.",
                styleVariables: { "--site-accent": "16 60% 40%" },
            },
            pages: [],
        },
    };
}

const PRODUCT = {
    slug: "sourdough",
    name: "Country sourdough",
    currency: "INR",
    price: "320.00",
    images: [],
};

function service(over: Record<string, unknown> = {}) {
    return {
        id: "svc_1",
        name: "Haircut",
        priceCents: 80000,
        currency: "INR",
        ...over,
    };
}

const ask = (kind: string, ref: string) =>
    GET(new Request(`https://rye.saroh.app/share/${kind}/${ref}/image`), {
        params: Promise.resolve({ domain: "rye.saroh.app", kind, ref }),
    });

beforeEach(() => {
    data.site = site();
    data.product = PRODUCT;
    data.booking = {
        ok: true,
        page: { open: true, currency: "INR", services: [service()] },
    };
    data.drawn.length = 0;
    vi.mocked(shareCard).mockClear();
});

describe("/share/<kind>/<ref>/image", () => {
    it("draws a live product as a PNG anyone may fetch, kept briefly", async () => {
        const res = await ask("product", "sourdough");
        expect(res.status).toBe(200);
        expect(res.headers.get("content-type")).toBe("image/png");
        expect(res.headers.get("access-control-allow-origin")).toBe("*");
        expect(res.headers.get("cache-control")).toBe("public, max-age=300");
        expect(vi.mocked(shareCard).mock.calls[0]?.[0]).toMatchObject({
            name: "Country sourdough",
            price: "₹320",
            business: "Rye & Co.",
            photo: null,
            variables: { "--site-accent": "16 60% 40%" },
        });
    });

    it("is a 404 for a draft or unknown product, which the shop doesn't sell", async () => {
        // The API answers by slug for this site only, so another business's
        // product slug is unknown here too.
        expect((await ask("product", "not-ours")).status).toBe(404);
        data.product = null;
        expect((await ask("product", "sourdough")).status).toBe(404);
        expect(shareCard).not.toHaveBeenCalled();
    });

    it("draws a service with its price, and no price line without one", async () => {
        expect((await ask("service", "svc_1")).status).toBe(200);
        expect(vi.mocked(shareCard).mock.calls[0]?.[0]).toMatchObject({
            name: "Haircut",
            price: "₹800",
        });
        data.booking = {
            ok: true,
            page: {
                open: true,
                currency: "INR",
                services: [service({ priceCents: null })],
            },
        };
        await ask("service", "svc_1");
        expect(vi.mocked(shareCard).mock.calls[1]?.[0]).toMatchObject({
            price: null,
        });
    });

    it("is a 404 for a service the booking page doesn't offer, or when bookings are off", async () => {
        expect((await ask("service", "svc_other")).status).toBe(404);
        data.booking = {
            ok: true,
            page: { open: false, currency: "INR", services: [service()] },
        };
        expect((await ask("service", "svc_1")).status).toBe(404);
    });

    it("is a 404 for any other kind, no live site, or a test host", async () => {
        expect((await ask("offer", "x")).status).toBe(404);
        data.site = null;
        expect((await ask("product", "sourdough")).status).toBe(404);
        data.site = site("test");
        expect((await ask("product", "sourdough")).status).toBe(404);
    });

    it("says try again, not 404, when the read failed", async () => {
        data.booking = { ok: false, reason: "unavailable" };
        const res = await ask("service", "svc_1");
        expect(res.status).toBe(503);
        expect(res.headers.get("cache-control")).toBe("no-store");
    });
});
