import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/env", () => ({
    env: {
        API_URL: "https://api.test",
        NEXT_PUBLIC_ROOT_DOMAIN: "saroh.app",
    },
}));

import { getMovedTo, movedAddressOf } from "./publication";

/**
 * An old web address that forwards (DEC-069, L3). The layout asks only on
 * a miss; anything but a good answer is null, and the page then 404s as it
 * always did.
 */

function answer(status: number, body: unknown) {
    const fetch = vi.fn(() =>
        Promise.resolve(
            new Response(JSON.stringify(body), {
                status,
                headers: { "content-type": "application/json" },
            }),
        ),
    );
    vi.stubGlobal("fetch", fetch);
    return fetch;
}

afterEach(() => {
    vi.unstubAllGlobals();
});

describe("movedAddressOf", () => {
    it("is the platform address a host names", () => {
        expect(movedAddressOf("rye.saroh.app")).toBe("rye");
        expect(movedAddressOf("Rye.Saroh.App:3005")).toBe("rye");
    });

    it("is null for a custom hostname, the apex, www and deeper names", () => {
        expect(movedAddressOf("shop.rye.in")).toBeNull();
        expect(movedAddressOf("saroh.app")).toBeNull();
        expect(movedAddressOf("www.saroh.app")).toBeNull();
        expect(movedAddressOf("a.rye.saroh.app")).toBeNull();
        expect(movedAddressOf(null)).toBeNull();
    });
});

describe("getMovedTo", () => {
    it("asks the API for the address and returns the new origin", async () => {
        const fetch = answer(200, { to: "https://rye-bakery.saroh.app" });
        await expect(getMovedTo("rye.saroh.app", "signed")).resolves.toBe(
            "https://rye-bakery.saroh.app",
        );
        const [url, init] = fetch.mock.calls[0] as unknown as [
            string,
            RequestInit & { headers: Record<string, string> },
        ];
        expect(url).toBe("https://api.test/public/sites/moved/rye");
        expect(init.cache).toBe("no-store");
        expect(init.headers["x-saroh-relay"]).toBe("signed");
    });

    it("is null on a 404, and the page 404s as today", async () => {
        answer(404, { message: "This address hasn't moved" });
        await expect(getMovedTo("rye.saroh.app")).resolves.toBeNull();
    });

    it("is null on an API error, and never throws", async () => {
        answer(500, {});
        await expect(getMovedTo("rye.saroh.app")).resolves.toBeNull();
        vi.stubGlobal(
            "fetch",
            vi.fn(() => Promise.reject(new Error("ECONNREFUSED"))),
        );
        await expect(getMovedTo("rye.saroh.app")).resolves.toBeNull();
    });

    it("is null for an answer that isn't an http(s) origin elsewhere", async () => {
        answer(200, { to: "javascript:alert(1)" });
        await expect(getMovedTo("rye.saroh.app")).resolves.toBeNull();
        answer(200, { to: 42 });
        await expect(getMovedTo("rye.saroh.app")).resolves.toBeNull();
        // Never a hop to the host the visitor is already on.
        answer(200, { to: "https://rye.saroh.app" });
        await expect(getMovedTo("rye.saroh.app")).resolves.toBeNull();
    });

    it("never asks for a custom hostname", async () => {
        const fetch = answer(200, { to: "https://rye-bakery.saroh.app" });
        await expect(getMovedTo("shop.rye.in")).resolves.toBeNull();
        expect(fetch).not.toHaveBeenCalled();
    });
});
