import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * The words on every page of this app, read from its source (UX audit,
 * 10 Oct).
 *
 * - One name for one act: "Sign in" and "Sign out", never "Log in". Routes
 *   keep their names (`/login`), and so do identifiers.
 * - Saroh's words (`PRODUCT.md`): business, never workspace or organization.
 *   Location, never storefront.
 * - Plain sentences: no em dash and no semicolon in anything a person reads.
 *
 * Comments are not copy and are skipped. So is anything that is an address
 * or a class list rather than a sentence.
 */

const APP = path.resolve(__dirname, "..");
const DIRS = ["app", "components", "lib"];

function sources(): string[] {
    return DIRS.flatMap((dir) =>
        readdirSync(path.join(APP, dir), { recursive: true })
            .map(String)
            .filter((f) => /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f))
            .map((f) => path.join(dir, f)),
    );
}

/** The file with its comments blanked, line numbers kept. */
function withoutComments(text: string): string {
    return (
        text
            // Block comments, JSX ones included.
            .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
            // Line comments: `//` at the start of a line or after a space,
            // so the `//` in "https://" is left alone.
            .replace(/(^|\s)\/\/.*$/gm, "$1")
    );
}

const STRINGS =
    /"((?:[^"\\\n]|\\.)*)"|'((?:[^'\\\n]|\\.)*)'|`((?:[^`\\]|\\.)*)`/g;

/** A line of JSX text: words and punctuation, no code. */
const JSX_TEXT = /^[A-Za-z&][^={}()<>`]*$/;

/** What a person could read on this line or in this string. */
function readable(file: string): { line: number; text: string }[] {
    const code = withoutComments(readFileSync(path.join(APP, file), "utf8"));
    const found: { line: number; text: string }[] = [];
    const lineOf = (index: number) => code.slice(0, index).split("\n").length;

    for (const match of code.matchAll(STRINGS)) {
        // Whichever of the three quote styles matched.
        const text = match.slice(1).find(Boolean) ?? "";
        // A sentence has a space in it. An address, a key or a code has not.
        if (!/\s/.test(text.trim())) continue;
        found.push({ line: lineOf(match.index), text });
    }
    code.split("\n").forEach((raw, index) => {
        const text = raw.trim();
        if (text && JSX_TEXT.test(text) && /\s/.test(text)) {
            found.push({ line: index + 1, text });
        }
    });
    return found;
}

/** The sentence without its addresses and interpolations. */
function prose(text: string): string {
    return (
        text
            // An entity (`&apos;`) is a letter on the page, not a semicolon.
            .replace(/&\w+;/g, "'")
            .replace(/\$\{[^}]*\}/g, " ")
            .split(/\s+/)
            .filter(
                (word) => !/[/=_]/.test(word) && !/^[a-z-]+:[a-z[]/.test(word),
            )
            .join(" ")
    );
}

function offences(test: (text: string) => boolean): string[] {
    return sources().flatMap((file) =>
        readable(file)
            .filter(({ text }) => test(prose(text)))
            .map(({ line, text }) => `${file}:${line}  ${text.trim()}`),
    );
}

describe("the words on every accounts page", () => {
    it("reads a useful number of files", () => {
        expect(sources().length).toBeGreaterThan(30);
        // The scan sees the copy it is meant to judge.
        const seen = readable("components/auth/login-form.tsx").map(
            (r) => r.text,
        );
        expect(seen).toContain("Welcome back.");
        expect(seen.some((t) => t.includes("Sign in"))).toBe(true);
    });

    it("says Sign in and Sign out, never Log in", () => {
        expect(
            offences((t) =>
                /\blog(ged|ging|s)? ?(in|out)\b|\blog-?in\b/i.test(t),
            ),
        ).toEqual([]);
    });

    it("says business and location, never workspace, organization or storefront", () => {
        expect(
            offences((t) =>
                /\bworkspaces?\b|\borgani[sz]ations?\b|\bstorefronts?\b/i.test(
                    t,
                ),
            ),
        ).toEqual([]);
    });

    it("has no em dash", () => {
        expect(offences((t) => t.includes("—"))).toEqual([]);
    });

    it("has no semicolon in a sentence", () => {
        expect(offences((t) => /[A-Za-z,.]; ?[A-Za-z]/.test(t))).toEqual([]);
    });
});
