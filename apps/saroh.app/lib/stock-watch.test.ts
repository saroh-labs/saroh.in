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

import { SITE_RELAY_HEADER } from "./site-relay";
import { getStockWatch } from "./stock-watch";

/** A "Stop waiting" link, read for the site it opens on (#1155). */

const VIEW = {
    state: "waiting",
    business: "Northwind Goods",
    product: "Linen shirt (Blue / M)",
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
        host: "northwind.saroh.app",
        "cf-connecting-ip": "203.0.113.7",
    });
});
afterEach(() => {
    globalThis.fetch = realFetch;
});

describe("getStockWatch", () => {
    it("reads the watch for this site, uncached and signed for the visitor", async () => {
        answer(Response.json(VIEW));
        expect(await getStockWatch("site_nw", "v1.w1.sig")).toEqual({
            ok: true,
            view: VIEW,
        });
        expect(sent[0]?.url).toMatch(
            /\/public\/sites\/site_nw\/stock-watch\/v1\.w1\.sig$/,
        );
        expect(sent[0]?.init?.cache).toBe("no-store");
        const headers = sent[0]?.init?.headers as Record<string, string>;
        expect(headers[SITE_RELAY_HEADER]).toMatch(/^v1\./);
    });

    it("reads unsigned when this server has no relay secret", async () => {
        relay.missingSecret = true;
        answer(Response.json(VIEW));
        expect((await getStockWatch("site_nw", "t")).ok).toBe(true);
        const headers = sent[0]?.init?.headers as Record<string, string>;
        expect(headers[SITE_RELAY_HEADER]).toBeUndefined();
    });

    it("is missing for another business's token, or none at all", async () => {
        answer(new Response("{}", { status: 404 }));
        expect(await getStockWatch("site_nw", "t")).toEqual({
            ok: false,
            reason: "missing",
        });
    });

    it("is unavailable, never an error, when the read fails or answers nonsense", async () => {
        for (const response of [
            new Response("nope", { status: 500 }),
            new Response("nope", { status: 429 }),
            Response.json({ state: "waiting" }),
            new Error("ECONNREFUSED"),
        ]) {
            answer(response);
            expect(await getStockWatch("site_nw", "t")).toEqual({
                ok: false,
                reason: "unavailable",
            });
        }
    });
});
