import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const req = vi.hoisted(() => ({ headers: new Headers() }));

vi.mock("next/headers", () => ({
    headers: () => Promise.resolve(req.headers),
}));

import { getSiteContact } from "./site-contact";

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

const NONE = { phone: null, email: null, places: [], social: [] };

beforeEach(() => {
    req.headers = new Headers({ host: "rye.saroh.app" });
});
afterEach(() => {
    globalThis.fetch = realFetch;
});

describe("getSiteContact (DEC-125)", () => {
    it("reads the site's public contact, keeping only what may be drawn", async () => {
        answer(
            Response.json({
                phone: "+919845012345",
                email: "hello@rye.example.com",
                places: [
                    {
                        source: "location",
                        name: "Indiranagar",
                        address: "12th Main",
                        hours: null,
                        mapUrl: "https://maps.app.goo.gl/AbC123xyZ",
                    },
                ],
                social: [
                    {
                        network: "instagram",
                        url: "https://www.instagram.com/rye",
                    },
                    { network: "x", url: "https://evil.example/rye" },
                ],
            }),
        );
        const contact = await getSiteContact("site_a");
        expect(urls[0]).toMatch(/\/public\/sites\/site_a\/contact$/);
        expect(contact).toEqual({
            phone: "+919845012345",
            email: "hello@rye.example.com",
            places: [
                {
                    source: "location",
                    name: "Indiranagar",
                    address: "12th Main",
                    hours: null,
                    mapUrl: "https://maps.app.goo.gl/AbC123xyZ",
                },
            ],
            social: [
                { network: "instagram", url: "https://www.instagram.com/rye" },
            ],
        });
    });

    it("draws nothing when the read fails, rather than taking the page down", async () => {
        answer(new Response("nope", { status: 500 }));
        expect(await getSiteContact("site_b")).toEqual(NONE);
        answer(new Error("offline"));
        expect(await getSiteContact("site_c")).toEqual(NONE);
        answer(Response.json({ phone: 3 }));
        expect(await getSiteContact("site_d")).toEqual(NONE);
    });
});
