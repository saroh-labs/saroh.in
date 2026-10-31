import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

import { searchRedirects } from "./redirects.js";
import {
    docExists,
    familyOf,
    parseAnswer,
    readPublishList,
    toolExists,
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
        // Free tools are publish-controlled too (#1253).
        expect(
            parseAnswer({ live: ["/tools/qr-code-maker"], takenOff: [] }),
        ).toEqual({ live: ["/tools/qr-code-maker"], takenOff: [] });
        expect(() =>
            parseAnswer({ live: ["/tools/a/b"], takenOff: [] }),
        ).toThrow();
    });
});

describe("parseAnswer and the page groups on the shared kit", () => {
    it("takes /gst/, /guides/ and /downloads/ pages, as the API does, and still refuses any other group", () => {
        const list = {
            live: ["/gst/a", "/guides/b"],
            takenOff: [{ path: "/downloads/c", at: "x" }],
        };
        expect(parseAnswer(list)).toEqual(list);
        expect(() =>
            parseAnswer({ live: ["/blog/x"], takenOff: [] }),
        ).toThrow();
        expect(() =>
            parseAnswer({ live: ["/gst/a/b"], takenOff: [] }),
        ).toThrow();
    });
});

describe("toolExists", () => {
    it("finds a tool's content file, the app's own tools included", () => {
        expect(toolExists("no-show-cost-calculator")).toBe(true);
        expect(toolExists("qr-code-maker")).toBe(true);
        expect(toolExists("no-such-tool")).toBe(false);
    });
});

describe("docExists", () => {
    const state = (body: unknown) => {
        const file = join(mkdtempSync(join(tmpdir(), "state-")), "s.json");
        writeFileSync(file, JSON.stringify(body));
        return file;
    };

    it("is true only for a page this build drew, not one held by its checks", () => {
        const file = state({
            v: 1,
            docs: {
                built: ["/guides/reduce-no-shows"],
                held: [{ path: "/gst/x", why: ["Facts to confirm"] }],
            },
        });
        expect(docExists("/guides/reduce-no-shows", file)).toBe(true);
        expect(docExists("/gst/x", file)).toBe(false);
    });

    it("is false without a snapshot (not a production build)", () => {
        expect(docExists("/gst/a", join(tmpdir(), "no-such-state.json"))).toBe(
            false,
        );
        expect(docExists("/gst/a", state({ v: 1 }))).toBe(false);
    });

    it("sends a taken-off guide to /guides while a guide is built, else Home, in one hop", () => {
        const list = (live: string[]) => ({
            preview: false,
            live,
            takenOff: [{ path: "/guides/booking-deposits", at: "x" }],
        });
        const built = state({
            v: 1,
            docs: { built: ["/guides/reduce-no-shows"], held: [] },
        });
        const held = state({ v: 1, docs: { built: [], held: [] } });
        const go = (file: string) =>
            searchRedirects(
                list(["/guides/reduce-no-shows"]),
                familyOf,
                toolExists,
                (p) => docExists(p, file),
            );
        expect(go(built)).toEqual([
            {
                source: "/guides/booking-deposits",
                destination: "/guides",
                statusCode: 302,
            },
        ]);
        // The live guide was held back: /guides isn't built, so Home.
        expect(go(held)[0]?.destination).toBe("/");
    });
});

describe("familyOf", () => {
    it("reads a page's family from its content file, null for a page not in the code", () => {
        expect(familyOf("salons")).toBe("Beauty");
        expect(familyOf("yoga-studios")).toBe("Fitness and classes");
        expect(familyOf("no-such-page")).toBeNull();
    });
});
