import { beforeEach, describe, expect, it, vi } from "vitest";

import * as route from "./route";

const SECRET = "test-only-revalidate-secret-0123456789abcdef";
const env = vi.hoisted(() => ({
    PRICING_REVALIDATE_SECRET: undefined as string | undefined,
}));
vi.mock("@/env", () => ({ env }));
const revalidatePath = vi.hoisted(() => vi.fn());
vi.mock("next/cache", () => ({ revalidatePath }));

const post = (
    headers: Record<string, string> = {},
    url = "https://www.saroh.test/api/revalidate",
) =>
    route.POST(
        new Request(url, {
            method: "POST",
            headers,
            body: JSON.stringify({ path: "/anything" }),
        }),
    );

beforeEach(() => {
    revalidatePath.mockClear();
    env.PRICING_REVALIDATE_SECRET = SECRET;
    vi.spyOn(console, "error").mockImplementation(() => undefined);
});

/** The pricing revalidation hook's contract (KTD-10). */
describe("POST /api/revalidate", () => {
    it("the right secret refreshes the fixed list, ignoring any path given", () => {
        const res = post(
            { "x-saroh-revalidate": SECRET },
            "https://www.saroh.test/api/revalidate?path=/x",
        );
        expect(res.status).toBe(200);
        expect(revalidatePath.mock.calls).toEqual([
            ["/pricing", undefined],
            ["/", undefined],
            ["/features/[slug]", "page"],
            ["/solutions/[slug]", "page"],
            ["/waitlist", undefined],
        ]);
        expect(res.headers.get("cache-control")).toBe("no-store");
    });

    it("a wrong or missing secret is a 401 and refreshes nothing", () => {
        expect(post({ "x-saroh-revalidate": `${SECRET}x` }).status).toBe(401);
        expect(post().status).toBe(401);
        expect(revalidatePath).not.toHaveBeenCalled();
    });

    it("refuses everything while the secret is unset", () => {
        env.PRICING_REVALIDATE_SECRET = undefined;
        expect(post({ "x-saroh-revalidate": "" }).status).toBe(401);
        expect(revalidatePath).not.toHaveBeenCalled();
    });

    it("answers POST only (Next sends 405 for the rest)", () => {
        expect(Object.keys(route).filter((k) => /^[A-Z]+$/.test(k))).toEqual([
            "POST",
        ]);
    });
});
