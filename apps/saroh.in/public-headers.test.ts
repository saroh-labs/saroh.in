import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import nextConfig from "./next.config.js";

/**
 * `public/_headers`: the headers Cloudflare puts on files it serves without
 * running the Worker (12 Oct 2026). Until it existed every fingerprinted
 * script, stylesheet and font went out as `max-age=0, must-revalidate`, so
 * a returning visitor asked for each one again on every page.
 */
function rules(): Map<string, Map<string, string>> {
    const text = fs.readFileSync(
        path.join(__dirname, "public/_headers"),
        "utf8",
    );
    const found = new Map<string, Map<string, string>>();
    let current: Map<string, string> | null = null;
    for (const raw of text.split("\n")) {
        if (!raw.trim() || raw.trimStart().startsWith("#")) continue;
        if (!/^\s/.test(raw)) {
            current = new Map();
            found.set(raw.trim(), current);
            continue;
        }
        const at = raw.indexOf(":");
        current?.set(
            raw.slice(0, at).trim().toLowerCase(),
            raw.slice(at + 1).trim(),
        );
    }
    return found;
}

describe("public/_headers", () => {
    const all = rules();

    it("lets a browser keep Next's fingerprinted files for a year", () => {
        expect(all.get("/_next/static/*")?.get("cache-control")).toBe(
            "public, max-age=31536000, immutable",
        );
    });

    it("lets a browser keep a screenshot, but not for ever: a name is reused", () => {
        const cache = all.get("/shots/*")?.get("cache-control") ?? "";
        expect(cache).toMatch(/^public, max-age=\d+/);
        expect(cache).not.toContain("immutable");
    });

    it("gives every file the security headers the pages get, no weaker", async () => {
        const everything = all.get("/*");
        const pages = (await nextConfig.headers?.())?.find(
            (rule) => rule.source === "/:path*",
        );
        expect(pages?.headers.length).toBeGreaterThan(0);
        for (const header of pages?.headers ?? []) {
            expect(everything?.get(header.key.toLowerCase()), header.key).toBe(
                header.value,
            );
        }
    });

    it("never keeps this public site out of search, and caches no page", () => {
        for (const [pattern, headers] of Array.from(all)) {
            expect(headers.has("x-robots-tag"), pattern).toBe(false);
        }
        // Only files under their own folders are told how long to be kept.
        expect(all.get("/*")?.has("cache-control")).toBe(false);
    });
});
