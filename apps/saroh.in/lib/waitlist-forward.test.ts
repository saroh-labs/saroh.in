import { describe, expect, it } from "vitest";

import {
    forwardHeaders,
    joinBody,
    RELAY_HEADER,
    relaySecret,
    signRelay,
    visitorAddress,
    visitorCountry,
} from "./waitlist-forward";

const DEV = "saroh-dev-insecure-site-relay-secret-not-for-production";

/** How `/api/waitlist` forwards a join (plan U30). */
describe("signRelay", () => {
    /**
     * The vector the API's `site-relay.spec.ts` and saroh.app's
     * `site-relay.test.ts` pin: a format change here that the API does not
     * make fails here.
     */
    it("signs the vector the API pins", () => {
        expect(
            signRelay(
                {
                    address: "203.0.113.7",
                    host: "kavi.saroh.app",
                    now: 1_790_000_000_000,
                },
                DEV,
            ),
        ).toBe(
            "v1.1790000000.MjAzLjAuMTEzLjc.a2F2aS5zYXJvaC5hcHA.gWBw2J0VLDl6pASl_GPNQIo-Uyh2iB9ORmVNYgUQykw",
        );
    });
});

describe("forwardHeaders", () => {
    const at = 1_790_000_000_000;

    it("signs Cloudflare's address for the API's limit", () => {
        const headers = new Headers({ "cf-connecting-ip": "198.51.100.7" });
        const out = forwardHeaders({
            headers,
            host: "www.saroh.in",
            secret: DEV,
            now: at,
        });
        expect(out[RELAY_HEADER]).toBe(
            signRelay(
                { address: "198.51.100.7", host: "www.saroh.in", now: at },
                DEV,
            ),
        );
    });

    it("never reads or passes on a client-sent X-Forwarded-For or x-real-ip", () => {
        const honest = forwardHeaders({
            headers: new Headers({ "cf-connecting-ip": "198.51.100.7" }),
            host: "www.saroh.in",
            secret: DEV,
            now: at,
        });
        const spoofed = forwardHeaders({
            headers: new Headers({
                "cf-connecting-ip": "198.51.100.7",
                "x-real-ip": "6.6.6.6",
                "x-forwarded-for": "1.2.3.4, 5.6.7.8",
            }),
            host: "www.saroh.in",
            secret: DEV,
            now: at,
        });
        expect(spoofed).toEqual(honest);
        expect(Object.keys(spoofed).map((k) => k.toLowerCase())).not.toContain(
            "x-forwarded-for",
        );
    });

    it("sends no relay when Cloudflare gave no address, or there is no secret", () => {
        const onlySpoof = new Headers({
            "x-forwarded-for": "1.2.3.4",
            "x-real-ip": "1.2.3.5",
        });
        expect(
            forwardHeaders({ headers: onlySpoof, host: "h", secret: DEV }),
        ).toEqual({ "Content-Type": "application/json" });
        expect(
            forwardHeaders({
                headers: new Headers({ "cf-connecting-ip": "198.51.100.7" }),
                host: "h",
                secret: null,
            }),
        ).toEqual({ "Content-Type": "application/json" });
    });

    it("reads only Cloudflare's address: anything else a visitor can send", () => {
        expect(
            visitorAddress(
                new Headers({
                    "cf-connecting-ip": "203.0.113.4",
                    "x-real-ip": "172.70.1.1",
                }),
            ),
        ).toBe("203.0.113.4");
        expect(
            visitorAddress(new Headers({ "cf-connecting-ip": "2001:db8::1" })),
        ).toBe("2001:db8::1");
        expect(
            visitorAddress(new Headers({ "x-real-ip": "198.51.100.7" })),
        ).toBeNull();
        expect(
            visitorAddress(new Headers({ "x-forwarded-for": "198.51.100.7" })),
        ).toBeNull();
    });

    it("ignores an address header that is not an address", () => {
        expect(
            visitorAddress(new Headers({ "cf-connecting-ip": "<script>" })),
        ).toBeNull();
    });
});

describe("relaySecret", () => {
    it("uses the configured secret, the dev value in development and test, else none", () => {
        expect(relaySecret("x".repeat(32), "production")).toBe("x".repeat(32));
        expect(relaySecret(undefined, "development")).toBe(DEV);
        expect(relaySecret(undefined, "test")).toBe(DEV);
        expect(relaySecret(undefined, "production")).toBeNull();
        expect(relaySecret(undefined, undefined)).toBeNull();
    });
});

describe("joinBody", () => {
    it("passes on a saved template's slug, trimmed and bounded (U13)", () => {
        expect(
            joinBody({
                email: "a@b.in",
                business: "Iron & Oak",
                kind: "gym",
                src: "templates-gym",
                template: " gym ",
            })?.template,
        ).toBe("gym");
        expect(
            joinBody({ email: "a@b.in", business: "X", template: "" })
                ?.template,
        ).toBeUndefined();
        expect(
            joinBody({
                email: "a@b.in",
                business: "X",
                template: "x".repeat(99),
            })?.template,
        ).toHaveLength(40);
    });

    it("passes on the V2 form's fields, with its source", () => {
        expect(
            joinBody({
                email: " a@b.in ",
                business: "Glow Studio",
                kind: "salon",
                city: "",
                plan: "grow",
                src: "instagram",
                ref: "abcdefgh",
                extra: "dropped",
            }),
        ).toEqual({
            email: "a@b.in",
            business: "Glow Studio",
            kind: "salon",
            city: undefined,
            plan: "grow",
            source: "instagram",
            ref: "abcdefgh",
        });
    });

    it("records a V2 join with no source as direct", () => {
        expect(
            joinBody({ email: "a@b.in", business: "B", kind: "shop" })?.source,
        ).toBe("direct");
    });

    it("still takes an email-only signup from a V1 page left open, with its old source", () => {
        expect(joinBody({ email: "a@b.in" })).toEqual({
            email: "a@b.in",
            source: "saroh.in",
        });
    });

    it("takes the changelog's email-only join with its source (plan U4)", () => {
        expect(joinBody({ email: "a@b.in", src: "changelog" })).toEqual({
            email: "a@b.in",
            source: "changelog",
        });
    });

    it("refuses what is not a join", () => {
        expect(joinBody(null)).toBeNull();
        expect(joinBody({ business: "B" })).toBeNull();
        expect(joinBody("a@b.in")).toBeNull();
    });
});

describe("visitorCountry", () => {
    const h = (value?: string) =>
        new Headers(value === undefined ? {} : { "cf-ipcountry": value });

    it("reads the two letters Cloudflare sets", () => {
        expect(visitorCountry(h("IN"))).toBe("IN");
        expect(visitorCountry(h(" us "))).toBe("US");
    });

    it("reads only Cloudflare's country: Vercel's old header is a visitor's word", () => {
        expect(
            visitorCountry(
                new Headers({
                    "cf-ipcountry": "AE",
                    "x-vercel-ip-country": "IN",
                }),
            ),
        ).toBe("AE");
        expect(
            visitorCountry(new Headers({ "x-vercel-ip-country": "IN" })),
        ).toBeUndefined();
    });

    it("is unknown for Cloudflare's unknown and Tor codes", () => {
        expect(
            visitorCountry(new Headers({ "cf-ipcountry": "XX" })),
        ).toBeUndefined();
        expect(
            visitorCountry(new Headers({ "cf-ipcountry": "T1" })),
        ).toBeUndefined();
    });

    it("is unknown without the header, or with anything else in it", () => {
        expect(visitorCountry(h())).toBeUndefined();
        expect(visitorCountry(h(""))).toBeUndefined();
        expect(visitorCountry(h("IND"))).toBeUndefined();
        expect(visitorCountry(h("<x>"))).toBeUndefined();
    });
});
