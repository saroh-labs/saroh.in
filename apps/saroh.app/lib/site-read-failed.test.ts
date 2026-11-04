import type * as React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/env", () => ({
    env: {
        API_URL: "https://api.test",
        NEXT_PUBLIC_ROOT_DOMAIN: "saroh.app",
    },
}));
vi.mock("next/headers", () => ({
    headers: () => Promise.resolve(new Headers()),
}));
vi.mock("@/lib/page-cache/site-rules", () => ({ dontCachePage: vi.fn() }));
// One request, as the server's `cache` gives one: its value is shared.
vi.mock("react", async (original) => ({
    ...(await original<typeof React>()),
    cache: (make: () => unknown) => {
        let made: unknown;
        const memo = () => (made ??= make());
        memo.reset = () => (made = undefined);
        return memo;
    },
}));

import { getSiteForHost, siteReadFailed } from "./publication";

const answer = (status: number) =>
    Promise.resolve(new Response("{}", { status }));

describe("asking whether a host's read failed, after its read", () => {
    beforeEach(() => vi.unstubAllGlobals());

    it("answers 404 both ways with no failure, and reads both at once", async () => {
        const seen: string[] = [];
        let open = 0;
        let most = 0;
        vi.stubGlobal(
            "fetch",
            vi.fn(async (url: string) => {
                seen.push(url);
                most = Math.max(most, ++open);
                await Promise.resolve();
                open -= 1;
                return answer(404);
            }),
        );
        await expect(siteReadFailed("shop.example.com")).resolves.toBe(false);
        expect(seen).toHaveLength(2);
        expect(most).toBe(2);
    });

    it("doesn't read again once this request's site read has failed", async () => {
        const fetched = vi.fn(() => answer(500));
        vi.stubGlobal("fetch", fetched);
        await getSiteForHost("rye.saroh.app");
        fetched.mockClear();
        await expect(siteReadFailed("rye.saroh.app")).resolves.toBe(true);
        expect(fetched).not.toHaveBeenCalled();
    });
});
