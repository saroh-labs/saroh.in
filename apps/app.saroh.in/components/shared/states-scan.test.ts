/**
 * The named states stay the only way a screen says "nothing here",
 * "couldn't load", "you can't", "turned off" or "comes with a plan" (UX
 * audit, 10 Oct 2026). "Nothing here yet" was drawn seven ways and a failed
 * read as an empty box because the nearest markup was a hand-drawn dashed
 * card. These read the app's source and fail on the ways it drifted.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(__dirname, "../..");

function sources(dirs: string[], match: RegExp): [string, string][] {
    const files: string[] = [];
    const walk = (dir: string) => {
        for (const name of readdirSync(dir)) {
            if (name === "node_modules" || name.startsWith(".")) continue;
            const full = path.join(dir, name);
            if (statSync(full).isDirectory()) walk(full);
            else if (match.test(name) && !/\.test\.tsx?$/.test(name)) {
                files.push(full);
            }
        }
    };
    for (const dir of dirs) walk(path.join(root, dir));
    return files.map((f) => [path.relative(root, f), readFileSync(f, "utf8")]);
}

const screens = sources(["app", "components"], /\.tsx$/);
/** Code only: a comment may quote the wording it replaced. */
const all = sources(["app", "components", "lib"], /\.tsx?$/).map(
    ([f, text]): [string, string] => [
        f,
        text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, ""),
    ],
);

/** The opening tag of each `<Name …>` in a file, props and all. */
function openings(text: string, name: string): string[] {
    const out: string[] = [];
    const tag = new RegExp(`<${name}\\b`, "g");
    for (let m = tag.exec(text); m; m = tag.exec(text)) {
        let depth = 0;
        let i = m.index + m[0].length;
        for (; i < text.length; i++) {
            const c = text[i];
            if (c === "{") depth++;
            else if (c === "}") depth--;
            else if (depth === 0 && c === ">") break;
        }
        out.push(text.slice(m.index, i + 1));
    }
    return out;
}

describe("an empty state", () => {
    it("is never a hand-drawn dashed box", () => {
        // A dashed border with "No … yet" beside it is the shared card,
        // drawn again by hand. `EmptyState` has three sizes for it.
        const found = screens
            .filter(([, text]) => {
                const dashed = /border-dashed/g;
                for (let m = dashed.exec(text); m; m = dashed.exec(text)) {
                    const near = text.slice(m.index, m.index + 600);
                    if (/>\s*No\s[^<>{}]{1,60}\syet\b/.test(near)) return true;
                }
                return false;
            })
            .map(([f]) => f);
        expect(found).toEqual([]);
    });

    it("is never used for a denial", () => {
        // A lock, or the denial's words, on the empty card reads as
        // "nothing here yet" to someone who was in fact stopped.
        const denial =
            /<Lock\b|can(?:'|’|&apos;)t (?:open|see|change)|Your role|doesn(?:'|’|&apos;)t (?:include|reach)|no access|not allowed|permission/i;
        const found = screens.flatMap(([f, text]) =>
            openings(text, "EmptyState")
                .filter((tag) => denial.test(tag))
                .map(() => f),
        );
        expect(found).toEqual([]);
    });

    it("has a title of its own, not a whole sentence", () => {
        // "Leads appear here as enquiries come in." is a description. The
        // title is "No leads yet".
        const found = screens.flatMap(([f, text]) =>
            openings(text, "DataView")
                .filter((tag) => /\bempty="[^"]{40,}"/.test(tag))
                .map(() => f),
        );
        expect(found).toEqual([]);
    });
});

describe("a failed read", () => {
    const boundaries = screens.filter(
        ([f]) => f.endsWith("/error.tsx") && f !== "app/error.tsx",
    );

    it("has a boundary on every section, and each goes through SectionError", () => {
        expect(boundaries.length).toBeGreaterThan(40);
        const found = boundaries
            .filter(([, text]) => !/SectionError\b/.test(text))
            .map(([f]) => f);
        expect(found).toEqual([]);
    });

    it("tries again by reading again, never by redrawing", () => {
        // Next's `reset` redraws the failed read. `retry` fetches.
        const found = boundaries
            .filter(([, text]) =>
                /\breset\b/.test(text.replace(/\/\*[\s\S]*?\*\//g, "")),
            )
            .map(([f]) => f);
        expect(found).toEqual([]);
    });

    it("is titled one way, and never in a developer's words", () => {
        const found = boundaries
            .filter(([, text]) =>
                /could not be loaded|couldn't be loaded|failed to render|display problem|usually temporary|come at it fresh/i.test(
                    text.replace(/\/\*[\s\S]*?\*\//g, ""),
                ),
            )
            .map(([f]) => f);
        expect(found).toEqual([]);
    });

    it.each([
        ["reload the page", /\b[Rr]e(?:load|fresh) (?:the|this) page\b/],
        ["reload to try again", /\bReload to (?:try|change)\b/],
        ["Retry", />\s*Retry\s*</],
    ])("never tells anyone to %s", (_, pattern) => {
        const found = all
            .filter(([, text]) => pattern.test(text))
            .map(([f]) => f);
        expect(found).toEqual([]);
    });
});

describe("a plan prompt", () => {
    it.each([
        ["Upgrade to {plan}", /`Upgrade to \$\{[^}]+\}`\s*:/],
        ["Choose a plan, as a link", />\s*Choose a plan\s*</],
        ["See Plan and billing", /See Plan and billing/],
        ["See your plan", /See your plan/],
        ["See plans, written by hand", /"See plans"/],
        ["the off state's old button", /Manage capabilities/],
    ])("is labelled by planLabel, never %s", (_, pattern) => {
        const found = all
            .filter(([, text]) => pattern.test(text))
            .map(([f]) => f);
        expect(found).toEqual([]);
    });
});

describe("a not-found page", () => {
    it("is titled “{Thing} not found”", () => {
        const pages = screens.filter(([f]) => f.endsWith("/not-found.tsx"));
        expect(pages.length).toBeGreaterThanOrEqual(8);
        const found = pages
            .filter(([, text]) => !/title="[A-Z][a-z ]+ not found"/.test(text))
            .map(([f]) => f);
        expect(found).toEqual([]);
    });
});
