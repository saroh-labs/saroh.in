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
import { getWaitlistClaim } from "./waitlist-claim";

/** A waitlist offer's claim link, read for the site it opens on (#1149). */

const CLAIM = {
    state: "open",
    business: "Pulse Fitness",
    serviceId: "svc_spin",
    service: "Spin",
    startAt: "2026-10-27T12:30:00.000Z",
    heldUntil: "2026-10-27T11:00:00.000Z",
    timezone: "Asia/Kolkata",
    placesLeft: 0,
    rejoin: false,
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
        host: "pulse.saroh.app",
        "cf-connecting-ip": "203.0.113.7",
    });
});
afterEach(() => {
    globalThis.fetch = realFetch;
});

describe("getWaitlistClaim", () => {
    it("reads the claim for this site, uncached and signed for the visitor", async () => {
        answer(Response.json(CLAIM));
        expect(await getWaitlistClaim("site_pulse", "v1.cl1.1.sig")).toEqual({
            ok: true,
            claim: CLAIM,
        });
        expect(sent[0]?.url).toMatch(
            /\/public\/sites\/site_pulse\/waitlist-claim\/v1\.cl1\.1\.sig$/,
        );
        expect(sent[0]?.init?.cache).toBe("no-store");
        const headers = sent[0]?.init?.headers as Record<string, string>;
        expect(headers[SITE_RELAY_HEADER]).toMatch(/^v1\./);
    });

    it("reads unsigned when this server has no relay secret", async () => {
        relay.missingSecret = true;
        answer(Response.json(CLAIM));
        expect((await getWaitlistClaim("site_pulse", "t")).ok).toBe(true);
        const headers = sent[0]?.init?.headers as Record<string, string>;
        expect(headers[SITE_RELAY_HEADER]).toBeUndefined();
    });

    it("is missing for another business's link, or none at all", async () => {
        answer(new Response("{}", { status: 404 }));
        expect(await getWaitlistClaim("site_pulse", "t")).toEqual({
            ok: false,
            reason: "missing",
        });
    });

    it("is unavailable, never an error, when the read fails or answers nonsense", async () => {
        for (const response of [
            new Response("nope", { status: 500 }),
            new Response("nope", { status: 429 }),
            Response.json({ state: "open" }),
            new Error("ECONNREFUSED"),
        ]) {
            answer(response);
            expect(await getWaitlistClaim("site_pulse", "t")).toEqual({
                ok: false,
                reason: "unavailable",
            });
        }
    });
});
