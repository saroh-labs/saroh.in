import { beforeEach, describe, expect, it, vi } from "vitest";

const api: {
    base: string | null;
    fetch: ReturnType<typeof vi.fn<(path: string) => Promise<Response>>>;
} = vi.hoisted(() => ({
    base: "/organizations/org_1",
    fetch: vi.fn((_path: string) => Promise.resolve(new Response("png"))),
}));
vi.mock("@/lib/api/http", () => ({
    orgBase: () => Promise.resolve(api.base),
    apiFetch: (path: string) => api.fetch(path),
}));

import { getBookImage } from "./book-image-server";

beforeEach(() => {
    api.base = "/organizations/org_1";
    api.fetch.mockClear();
});

describe("the booking card through the app (#1375)", () => {
    it("asks the active business's signed-in route, carrying only the card's own params", async () => {
        await getBookImage(
            new URLSearchParams({
                headline: "Cake consults",
                style: "colour",
                size: "story",
                bg: "#3e5a45",
                w: "240",
                organizationId: "org_other",
                product: "x",
            }),
        );
        const path = api.fetch.mock.calls[0]?.[0] ?? "";
        const url = new URL(path, "https://api.example.com");
        expect(url.pathname).toBe("/organizations/org_1/share/book/image");
        expect(Object.fromEntries(url.searchParams)).toEqual({
            style: "colour",
            size: "story",
            bg: "#3e5a45",
            w: "240",
            headline: "Cake consults",
        });
    });

    it("asks nothing with no active business", async () => {
        api.base = null;
        expect(await getBookImage(new URLSearchParams())).toBeNull();
        expect(api.fetch).not.toHaveBeenCalled();
    });
});
