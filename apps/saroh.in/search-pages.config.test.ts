import { describe, expect, it, vi } from "vitest";

import {
    familyOf,
    parseAnswer,
    readPublishList,
} from "./search-pages.config.js";

/** A fetch that answers `body` (or throws `body` when it is an Error). */
function answering(...bodies: (unknown | Error)[]) {
    const calls: string[] = [];
    const fetcher = vi.fn((url: string) => {
        calls.push(url);
        const body = bodies.shift();
        if (body instanceof Error) return Promise.reject(body);
        return Promise.resolve(
            new Response(JSON.stringify(body), {
                status: body === undefined ? 500 : 200,
            }),
        );
    });
    return { fetcher: fetcher as unknown as typeof fetch, calls };
}

const LIST = {
    live: ["/for/salons"],
    takenOff: [{ path: "/for/yoga-studios", at: "2026-10-25T10:00:00Z" }],
};
const noSleep = () => Promise.resolve();

describe("readPublishList (DEC-193)", () => {
    it("reads GET /public/search-pages once and builds production from it", async () => {
        const { fetcher, calls } = answering(LIST);
        const list = await readPublishList(
            { VERCEL_ENV: "production", API_URL: "https://api.example.test" },
            fetcher,
        );
        expect(calls).toEqual(["https://api.example.test/public/search-pages"]);
        expect(list).toEqual({ preview: false, ...LIST });
    });

    it("fails a production build that can't read it, after retrying", async () => {
        const { fetcher, calls } = answering(
            new Error("down"),
            new Error("down"),
            new Error("down"),
        );
        await expect(
            readPublishList(
                {
                    VERCEL_ENV: "production",
                    API_URL: "https://api.example.test",
                },
                fetcher,
                [1, 1],
                noSleep,
            ),
        ).rejects.toThrow(/never guesses/);
        expect(calls).toHaveLength(3);
    });

    it("fails a production build without API_URL, or on an answer that isn't a list", async () => {
        await expect(
            readPublishList({ VERCEL_ENV: "production" }),
        ).rejects.toThrow(/API_URL/);
        const { fetcher } = answering({ live: "nope" });
        await expect(
            readPublishList(
                { VERCEL_ENV: "production", API_URL: "https://x.test" },
                fetcher,
                [],
            ),
        ).rejects.toThrow(/never guesses/);
    });

    it("rides out an API restart in production", async () => {
        const { fetcher } = answering(new Error("restarting"), LIST);
        const list = await readPublishList(
            { VERCEL_ENV: "production", API_URL: "https://x.test" },
            fetcher,
            [1],
            noSleep,
        );
        expect(list.live).toEqual(["/for/salons"]);
    });

    it("is a preview when RESOURCES_PREVIEW is on, whatever production says not", async () => {
        const { fetcher } = answering(LIST);
        expect(
            await readPublishList(
                {
                    VERCEL_ENV: "preview",
                    API_URL: "https://x.test",
                    RESOURCES_PREVIEW: "1",
                },
                fetcher,
            ),
        ).toEqual({ preview: true, ...LIST });
        // Production ignores the flag.
        const prod = answering(LIST);
        expect(
            (
                await readPublishList(
                    {
                        VERCEL_ENV: "production",
                        API_URL: "https://x.test",
                        RESOURCES_PREVIEW: "1",
                    },
                    prod.fetcher,
                )
            ).preview,
        ).toBe(false);
    });

    it("builds every page as a draft locally without an API, or when it is down", async () => {
        expect(await readPublishList({})).toEqual({
            preview: true,
            live: [],
            takenOff: [],
        });
        const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
        const { fetcher } = answering(new Error("down"));
        expect(
            await readPublishList({ API_URL: "https://x.test" }, fetcher),
        ).toEqual({ preview: true, live: [], takenOff: [] });
        warn.mockRestore();
    });

    it("with the list read and no flag, builds as production does", async () => {
        const { fetcher } = answering(LIST);
        expect(
            (await readPublishList({ API_URL: "https://x.test" }, fetcher))
                .preview,
        ).toBe(false);
    });
});

describe("parseAnswer", () => {
    it("drops a taken-off path that is live again, and refuses a path that isn't /for/<slug>", () => {
        expect(
            parseAnswer({
                live: ["/for/salons"],
                takenOff: [{ path: "/for/salons", at: "x" }],
            }),
        ).toEqual({ live: ["/for/salons"], takenOff: [] });
        expect(() =>
            parseAnswer({ live: ["/solutions/salons"], takenOff: [] }),
        ).toThrow();
        expect(() => parseAnswer(null)).toThrow();
    });
});

describe("familyOf", () => {
    it("reads a page's family from its content file, null for a page not in the code", () => {
        expect(familyOf("salons")).toBe("Beauty");
        expect(familyOf("yoga-studios")).toBe("Fitness and classes");
        expect(familyOf("no-such-page")).toBeNull();
    });
});
