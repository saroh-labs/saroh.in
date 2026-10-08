import { readdirSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { config } from "@/middleware";

/**
 * The sign-in gate must not catch what `public/` serves: `next/image` asks
 * for those files without the visitor's cookies, so a redirect to sign-in
 * there drew every template thumbnail as a broken image. Read as Next reads
 * this form of matcher: one pattern, anchored, against the path.
 */
const gated = (pathname: string) =>
    config.matcher.some((m) => new RegExp(`^${m}$`).test(pathname));

function publicFiles(dir: string, base = ""): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
        entry.isDirectory()
            ? publicFiles(path.join(dir, entry.name), `${base}/${entry.name}`)
            : [`${base}/${entry.name}`],
    );
}

describe("middleware matcher", () => {
    it("lets every image in public/ through", () => {
        const images = publicFiles(path.resolve(__dirname, "../public")).filter(
            (f) => /\.(png|jpe?g|gif|webp|avif|svg|ico)$/.test(f),
        );
        expect(images).toContain("/templates/blogs.webp");
        expect(images.filter(gated)).toEqual([]);
    });

    it("still gates the app's pages", () => {
        for (const page of [
            "/",
            "/orders",
            "/sites/new",
            "/settings/modules",
        ]) {
            expect(gated(page)).toBe(true);
        }
    });
});
