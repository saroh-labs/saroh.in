import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const req = vi.hoisted(() => ({ headers: new Headers() }));

vi.mock("next/headers", () => ({
    headers: () => Promise.resolve(req.headers),
}));

import { footerFacts, getFooterFacts } from "./site-footer";

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
        ).toEqual({
            email: null,
            credit: { href: "https://saroh.in/?ref=k7m2p9qa" },
        });
    });

    it("draws no credit on a paid plan, and the email only when there is one", () => {
        expect(footerFacts({ email: "hi@kavi.example", credit: null })).toEqual(
            { email: "hi@kavi.example", credit: null },
        );
        expect(footerFacts({ email: "  ", credit: null }).email).toBeNull();
    });

    it("reads anything malformed as nothing to add", () => {
        for (const body of [
            null,
            "x",
            { credit: { referralCode: "<script>" } },
            { credit: "k7m2p9qa" },
        ]) {
            expect(footerFacts(body)).toEqual({ email: null, credit: null });
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
        expect(await getFooterFacts("site_kavi")).toEqual({
            email: "hi@kavi.example",
            credit: { href: "https://saroh.in/?ref=k7m2p9qa" },
        });
        expect(urls[0]).toMatch(/\/public\/sites\/site_kavi\/footer$/);
    });

    it("fails toward no credit when the read fails", async () => {
        answer(new Response("", { status: 500 }));
        expect(await getFooterFacts("site_a")).toEqual({
            email: null,
            credit: null,
        });
        answer(new Error("down"));
        expect(await getFooterFacts("site_b")).toEqual({
            email: null,
            credit: null,
        });
    });
});
