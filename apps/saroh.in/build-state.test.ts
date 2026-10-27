import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { prebuild } from "./search-pages.config.js";

/**
 * The build's fallback (`build-state.config.js`): a production build that can't
 * read the API reuses the live site's snapshot of what it was last built
 * with, and warns; with neither, it fails.
 */

const API = "https://api.example.test";
const SITE = "https://site.example.test";
const LIST = {
    live: ["/for/salons"],
    takenOff: [{ path: "/for/yoga-studios", at: "2026-10-25T10:00:00Z" }],
};
const PRICING = { version: 3, goLiveAt: "2026-10-17T02:30:00Z", catalog: {} };
const SNAPSHOT = {
    v: 1,
    builtAt: "2026-10-25T09:00:00.000Z",
    commit: "abc123",
    searchPages: { live: ["/for/gyms"], takenOff: [] },
    pricing: { version: 2, goLiveAt: null, catalog: { from: "snapshot" } },
};
const PROD = {
    VERCEL_ENV: "production",
    API_URL: API,
    NEXT_PUBLIC_LAUNCH_MODE: "open",
    LIVE_SITE_URL: SITE,
    GITHUB_SHA: "def456",
};

/** A fetch whose answer depends on the URL: `api` for the API, `site` for the live snapshot. */
function routes(api: "up" | "down", site: unknown) {
    const calls: string[] = [];
    const fetcher = vi.fn((url: string) => {
        calls.push(url);
        if (new URL(url).origin === API) {
            if (api === "down") return Promise.reject(new Error("down"));
            const body = url.endsWith("/public/pricing") ? PRICING : LIST;
            return Promise.resolve(new Response(JSON.stringify(body)));
        }
        if (site instanceof Error) return Promise.reject(site);
        if (site === null) {
            return Promise.resolve(new Response("not found", { status: 404 }));
        }
        return Promise.resolve(new Response(JSON.stringify(site)));
    });
    return { fetcher: fetcher as unknown as typeof fetch, calls };
}

const noSleep = () => Promise.resolve();
let dir: string;
let at: { stateFile: string; pricingFile: string; now: Date };
const read = (file: string) =>
    JSON.parse(fs.readFileSync(file, "utf8")) as Record<string, unknown>;
let log: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "build-state-"));
    at = {
        stateFile: path.join(dir, "public/_build/state.json"),
        pricingFile: path.join(dir, ".build-pricing.json"),
        now: new Date("2026-10-26T12:00:00Z"),
    };
    log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
});
afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
    vi.restoreAllMocks();
});

describe("a production build", () => {
    it("API up: builds from it and writes the snapshot of both answers", async () => {
        const { fetcher, calls } = routes("up", SNAPSHOT);
        const list = await prebuild(PROD, fetcher, [1], noSleep, at);
        expect(list).toEqual({ preview: false, ...LIST });
        expect(calls.some((u) => new URL(u).origin === SITE)).toBe(false);
        expect(read(at.stateFile)).toEqual({
            v: 1,
            builtAt: "2026-10-26T12:00:00.000Z",
            dataAsOf: "2026-10-26T12:00:00.000Z",
            commit: "def456",
            searchPages: LIST,
            pricing: PRICING,
        });
        expect(read(at.pricingFile)).toEqual({ pricing: PRICING });
        expect(log).not.toHaveBeenCalledWith(
            expect.stringContaining("::warning"),
        );
    });

    it("API down, live snapshot valid: builds from it, fetched once, and warns", async () => {
        const { fetcher, calls } = routes("down", SNAPSHOT);
        const list = await prebuild(PROD, fetcher, [1], noSleep, at);
        expect(list).toEqual({ preview: false, ...SNAPSHOT.searchPages });
        expect(read(at.pricingFile)).toEqual({ pricing: SNAPSHOT.pricing });
        expect(
            calls.filter((u) => u === `${SITE}/_build/state.json`),
        ).toHaveLength(1);
        expect(log).toHaveBeenCalledWith(
            "::warning title=API unreachable::API unreachable: built with the live site's last published lists from 2026-10-25T09:00:00.000Z. Publishes made since then are not in this build; deploy again when the API is back.",
        );
        // This build's own snapshot carries what it used, for the next one.
        expect(read(at.stateFile).searchPages).toEqual(SNAPSHOT.searchPages);
        // …and the data's real age, so a second fallback names it too.
        expect(read(at.stateFile).dataAsOf).toBe(SNAPSHOT.builtAt);
    });

    it("a second fallback in a row still names when the data was read", async () => {
        const second = {
            ...SNAPSHOT,
            builtAt: "2026-10-26T08:00:00.000Z",
            dataAsOf: "2026-10-25T09:00:00.000Z",
        };
        const { fetcher } = routes("down", second);
        await prebuild(PROD, fetcher, [1], noSleep, at);
        expect(log).toHaveBeenCalledWith(
            expect.stringContaining("lists from 2026-10-25T09:00:00.000Z."),
        );
        expect(read(at.stateFile).dataAsOf).toBe("2026-10-25T09:00:00.000Z");
    });

    it("API down, no live snapshot: fails", async () => {
        const { fetcher } = routes("down", null);
        await expect(prebuild(PROD, fetcher, [1], noSleep, at)).rejects.toThrow(
            /never guesses.*status 404|status 404.*never guesses/,
        );
        expect(fs.existsSync(at.stateFile)).toBe(false);
    });

    it("API down, the live snapshot unreachable: fails", async () => {
        const { fetcher } = routes("down", new Error("offline"));
        await expect(prebuild(PROD, fetcher, [1], noSleep, at)).rejects.toThrow(
            /offline/,
        );
    });

    it("API down, the live snapshot invalid: fails", async () => {
        for (const bad of [
            { v: 2, builtAt: "x", searchPages: LIST, pricing: null },
            {
                ...SNAPSHOT,
                searchPages: { live: ["/not-a-page"], takenOff: [] },
            },
            { ...SNAPSHOT, searchPages: undefined },
        ]) {
            const { fetcher } = routes("down", bad);
            await expect(
                prebuild(PROD, fetcher, [1], noSleep, at),
            ).rejects.toThrow(/search-pages failed/);
        }
    });

    it("before early access opens, pricing isn't read", async () => {
        const { fetcher, calls } = routes("up", SNAPSHOT);
        await prebuild(
            { ...PROD, NEXT_PUBLIC_LAUNCH_MODE: "waitlist" },
            fetcher,
            [1],
            noSleep,
            at,
        );
        expect(calls.some((u) => u.endsWith("/public/pricing"))).toBe(false);
        expect(read(at.stateFile).pricing).toBeNull();
    });
});

describe("any other build", () => {
    it("never falls back, writes no snapshot and removes a stale one", async () => {
        fs.mkdirSync(path.dirname(at.stateFile), { recursive: true });
        fs.writeFileSync(at.stateFile, "{}");
        fs.writeFileSync(at.pricingFile, "{}");
        const { fetcher, calls } = routes("down", SNAPSHOT);
        const list = await prebuild(
            { ...PROD, VERCEL_ENV: "preview" },
            fetcher,
            [1],
            noSleep,
            at,
        );
        expect(list).toEqual({ preview: true, live: [], takenOff: [] });
        expect(calls.some((u) => new URL(u).origin === SITE)).toBe(false);
        expect(fs.existsSync(at.stateFile)).toBe(false);
        expect(fs.existsSync(at.pricingFile)).toBe(false);
    });
});
