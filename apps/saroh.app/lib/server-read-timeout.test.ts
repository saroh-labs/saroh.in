import { beforeEach, describe, expect, it, vi } from "vitest";

const shop = vi.hoisted(() => ({ refused: vi.fn() }));

vi.mock("@/env", () => ({
    env: {
        API_URL: "https://api.test",
        NEXT_PUBLIC_ROOT_DOMAIN: "saroh.app",
    },
}));
vi.mock("next/headers", () => ({
    headers: () => Promise.resolve(new Headers({ host: "rye.saroh.app" })),
}));
vi.mock("@/lib/page-cache/site-rules", () => ({
    dontCachePage: shop.refused,
    listsProducts: vi.fn(),
}));

import { SERVER_READ_TIMEOUT_MS } from "./api-url";
import { getBookingPage, getBookingVisit } from "./booking-page";
import { getCatalogue } from "./catalogue";
import {
    getPublishedPost,
    getSiteForHost,
    readPublishedPosts,
    siteReadFailed,
} from "./publication";
import { getCheckoutOptions } from "./shop-checkout";
import { getSiteContact } from "./site-contact";
import { getFooterFacts } from "./site-footer";
import { getPublicPlans } from "./site-plans";

/**
 * A read that hangs: the API takes longer than a page may wait. The timer
 * itself is the platform's, so it is stood in for: the read's signal has
 * already gone, and `fetch` rejects as it would then. What is under test is
 * that every reader asks for the one timeout and takes the abort as a failure.
 */
const timeout = vi.fn(() => AbortSignal.abort(new Error("TimeoutError")));

beforeEach(() => {
    shop.refused.mockClear();
    timeout.mockClear();
    vi.stubGlobal("AbortSignal", { ...AbortSignal, timeout });
    vi.stubGlobal(
        "fetch",
        vi.fn((_url: string, init?: RequestInit) =>
            init?.signal?.aborted
                ? Promise.reject(new Error("aborted"))
                : Promise.reject(new Error("a read with no timeout")),
        ),
    );
});

describe("a server read the API doesn't answer in time", () => {
    it("is the booking page's failure, not a hung page", async () => {
        await expect(getBookingPage("site_1")).resolves.toEqual({
            ok: false,
            reason: "unavailable",
        });
        expect(timeout).toHaveBeenCalledWith(SERVER_READ_TIMEOUT_MS);
    });

    it("is the catalogue's and the plans' failure", async () => {
        await expect(getCatalogue("site_1")).resolves.toMatchObject({
            ok: false,
            reason: "unavailable",
        });
        await expect(getPublicPlans("site_1")).resolves.toMatchObject({
            failed: true,
        });
        await expect(getCheckoutOptions("site_1")).resolves.toBeNull();
        expect(shop.refused).toHaveBeenCalled();
    });

    it("draws the header's and footer's facts without them, and isn't kept", async () => {
        await expect(getBookingVisit("site_1")).resolves.toBeNull();
        await getSiteContact("site_1");
        await getFooterFacts("site_1");
        expect(shop.refused).toHaveBeenCalledWith("visit unavailable");
        expect(shop.refused).toHaveBeenCalledWith("contact unavailable");
        expect(shop.refused).toHaveBeenCalledWith("footer unavailable");
    });

    it("is a failed site read, and failed posts", async () => {
        await expect(getSiteForHost("rye.saroh.app")).resolves.toBeNull();
        await expect(siteReadFailed("rye.saroh.app")).resolves.toBe(true);
        await expect(readPublishedPosts("site_1")).resolves.toBeNull();
        await expect(getPublishedPost("site_1", "a")).rejects.toThrow();
    });

    it("waits about 8 seconds, from one constant", () => {
        expect(SERVER_READ_TIMEOUT_MS).toBe(8_000);
    });
});
