import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type * as SiteRelay from "./site-relay";

const req = vi.hoisted(() => ({ headers: new Headers() }));
const relay = vi.hoisted(() => ({ missingSecret: false }));

vi.mock("./site-relay", async (importOriginal) => {
    const real = await importOriginal<typeof SiteRelay>();
    return {
        ...real,
        relayFor: (headers: Headers, host: string) => {
            if (relay.missingSecret) {
                throw new Error("SITE_RELAY_SECRET is not set.");
            }
            return real.relayFor(headers, host);
        },
    };
});

vi.mock("next/headers", () => ({
    headers: () => Promise.resolve(req.headers),
}));

import { getBookingVisit } from "./booking-page";
import { SITE_RELAY_HEADER } from "./site-relay";

const VISIT = {
    source: "business",
    storeId: null,
    name: "Kavi Dental",
    address: "12th Main, Indiranagar\nBengaluru 560038",
    phone: "+918040992210",
    hours: null,
    timezone: "Asia/Kolkata",
    closedDates: [],
};

let sent: { url: string; init?: RequestInit }[];
const realFetch = globalThis.fetch;

function answer(response: Response | Error) {
    sent = [];
    globalThis.fetch = vi.fn((url: string, init?: RequestInit) => {
        sent.push({ url, init });
        return response instanceof Error
            ? Promise.reject(response)
            : Promise.resolve(response);
    }) as unknown as typeof fetch;
}

beforeEach(() => {
    relay.missingSecret = false;
    req.headers = new Headers({
        host: "kavi.saroh.app",
        "cf-connecting-ip": "203.0.113.7",
    });
});
afterEach(() => {
    globalThis.fetch = realFetch;
});

describe("getBookingVisit (E6)", () => {
    it("reads the site's public visit, signed for the visitor", async () => {
        answer(Response.json(VISIT));
        expect(await getBookingVisit("site_kavi")).toEqual(VISIT);
        expect(sent[0]?.url).toMatch(/\/public\/sites\/site_kavi\/visit$/);
        const headers = sent[0]?.init?.headers as Record<string, string>;
        expect(headers[SITE_RELAY_HEADER]).toMatch(/^v1\./);
        expect(sent[0]?.init?.cache).toBe("no-store");
    });

    it("reads unsigned when this server has no relay secret", async () => {
        relay.missingSecret = true;
        answer(Response.json(VISIT));
        expect(await getBookingVisit("site_kavi")).toEqual(VISIT);
        const headers = sent[0]?.init?.headers as Record<string, string>;
        expect(headers[SITE_RELAY_HEADER]).toBeUndefined();
    });

    it("is null — never an error — when the read fails or answers nonsense", async () => {
        answer(new Response("nope", { status: 500 }));
        expect(await getBookingVisit("site_kavi")).toBeNull();
        answer(new Response("nope", { status: 429 }));
        expect(await getBookingVisit("site_kavi")).toBeNull();
        answer(Response.json({ name: "Kavi Dental" }));
        expect(await getBookingVisit("site_kavi")).toBeNull();
        answer(new Error("ECONNREFUSED"));
        expect(await getBookingVisit("site_kavi")).toBeNull();
    });
});
