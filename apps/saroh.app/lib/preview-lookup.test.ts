import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/env", () => ({ env: { API_URL: "https://api.test" } }));

import { getPreviewByToken } from "./publication";

/**
 * A draft preview reads module states as the live site does (G19), so the
 * preview's menu and module pages match what publishing would show.
 */

const SNAPSHOT = {
    site: { name: "Rye", slug: "rye" },
    pages: [{ path: "/shop", title: "Shop", kind: "SHOP", sections: [] }],
    publishedAt: "2026-09-28T10:00:00.000Z",
};

function answer(body: unknown) {
    vi.stubGlobal(
        "fetch",
        vi.fn(() =>
            Promise.resolve(
                new Response(JSON.stringify(body), {
                    status: 200,
                    headers: { "content-type": "application/json" },
                }),
            ),
        ),
    );
}

afterEach(() => {
    vi.unstubAllGlobals();
});

describe("getPreviewByToken (G19)", () => {
    it("carries which module pages show now", async () => {
        answer({
            snapshot: SNAPSHOT,
            siteId: "site_1",
            expiresAt: "2026-10-05T10:00:00.000Z",
            modules: { SHOP: "off", BOOK: "maybe" },
        });
        const preview = await getPreviewByToken("tok");
        expect(preview.ok && preview.modules).toEqual({ SHOP: "off" });
    });

    it("reads none from an API that predates it: every page shows", async () => {
        answer({
            snapshot: SNAPSHOT,
            siteId: "site_1",
            expiresAt: "2026-10-05T10:00:00.000Z",
        });
        const preview = await getPreviewByToken("tok");
        expect(preview.ok).toBe(true);
        expect(preview.ok && preview.modules).toBeNull();
    });
});
