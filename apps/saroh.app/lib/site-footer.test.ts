import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const req = vi.hoisted(() => ({ headers: new Headers() }));

vi.mock("next/headers", () => ({
    headers: () => Promise.resolve(req.headers),
}));

import {
    footerFacts,
    getFooterFacts,
    siteSeller,
    soldByFor,
} from "./site-footer";

const realFetch = globalThis.fetch;
let urls: string[];

function answer(response: Response | Error) {
    urls = [];
    globalThis.fetch = vi.fn((url: string) => {
        urls.push(url);
        return response instanceof Error
            ? Promise.reject(response)
            : Promise.resolve(response);
    }) as unknown as typeof fetch;
}

beforeEach(() => {
    req.headers = new Headers({ host: "kavi.saroh.app" });
});
afterEach(() => {
    globalThis.fetch = realFetch;
});

describe("footerFacts (DEC-101, DEC-102)", () => {
    it("links Made with Saroh with a Free business's referral code", () => {
        expect(
            footerFacts({ email: null, credit: { referralCode: "k7m2p9qa" } }),
        ).toMatchObject({
            email: null,
            credit: { href: "https://saroh.in/?ref=k7m2p9qa" },
        });
    });

    it("draws no credit on a paid plan, and the email only when there is one", () => {
        expect(
            footerFacts({ email: "hi@kavi.example", credit: null }),
        ).toMatchObject({ email: "hi@kavi.example", credit: null });
        expect(footerFacts({ email: "  ", credit: null }).email).toBeNull();
    });

    it("reads anything malformed as nothing to add", () => {
        for (const body of [
            null,
            "x",
            { credit: { referralCode: "<script>" } },
            { credit: "k7m2p9qa" },
        ]) {
            expect(footerFacts(body)).toMatchObject({
                email: null,
                credit: null,
            });
        }
    });
});

describe("getFooterFacts", () => {
    it("reads the site's footer facts", async () => {
        answer(
            Response.json({
                email: "hi@kavi.example",
                credit: { referralCode: "k7m2p9qa" },
            }),
        );
        expect(await getFooterFacts("site_kavi")).toMatchObject({
            email: "hi@kavi.example",
            credit: { href: "https://saroh.in/?ref=k7m2p9qa" },
        });
        expect(urls[0]).toMatch(/\/public\/sites\/site_kavi\/footer$/);
    });

    it("fails toward no credit when the read fails", async () => {
        answer(new Response("", { status: 500 }));
        expect(await getFooterFacts("site_a")).toMatchObject({
            email: null,
            credit: null,
        });
        answer(new Error("down"));
        expect(await getFooterFacts("site_b")).toMatchObject({
            email: null,
            credit: null,
        });
    });
});

describe("who the customer is buying from (DEC-118)", () => {
    const facts = footerFacts({
        email: "hi@rye.example",
        credit: null,
        seller: {
            legalName: " Rye Foods LLP ",
            address: "12 Hill Road, Bengaluru 560001, Karnataka",
            phone: "+919845012345",
            gstin: "never read",
        },
    });

    it("reads the legal name, the registered address and the phone, nothing else", () => {
        expect(facts.seller).toEqual({
            legalName: "Rye Foods LLP",
            address: "12 Hill Road, Bengaluru 560001, Karnataka",
            phone: "+919845012345",
        });
        expect(footerFacts({ email: null, credit: null }).seller).toEqual({
            legalName: null,
            address: null,
            phone: null,
        });
    });

    it("says Sold by where the shop serves and Run by where it doesn't", () => {
        expect(siteSeller(facts, "Rye & Co.", true)).toEqual({
            lead: "Sold by",
            name: "Rye Foods LLP",
            address: "12 Hill Road, Bengaluru 560001, Karnataka",
            email: "hi@rye.example",
            phone: "+919845012345",
        });
        expect(soldByFor(facts, "Rye & Co.", false)).toBe(
            "Run by Rye Foods LLP",
        );
    });

    it("falls back to the site's name, alone, when nothing is set or read", () => {
        const bare = footerFacts({ email: null, credit: null });
        expect(soldByFor(bare, "Kavi Dental", false)).toBe(
            "Run by Kavi Dental",
        );
        expect(siteSeller(null, "Kavi Dental", true)).toEqual({
            lead: "Sold by",
            name: "Kavi Dental",
            address: null,
            email: null,
            phone: null,
        });
    });
});
