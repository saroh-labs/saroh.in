import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
    BLOCKER_COPY,
    BLOCKER_FALLBACK,
    blockerSentence,
    moduleErrorSentence,
    refusalSentence,
} from "./blocker-copy";

/**
 * DEC-057's guard: a raw code is never rendered to a merchant. Two halves:
 * every code the API's capabilities module can send has words here, and
 * nothing in the app renders a `.code` straight onto the screen.
 */

const APP = fileURLToPath(new URL("../../", import.meta.url));
const CAPABILITIES = fileURLToPath(
    new URL("../../../api.saroh.in/src/modules/capabilities/", import.meta.url),
);

function files(dir: string, ext: RegExp): string[] {
    return readdirSync(dir).flatMap((name) => {
        if (name === "node_modules" || name.startsWith(".")) return [];
        const path = join(dir, name);
        if (statSync(path).isDirectory()) return files(path, ext);
        return ext.test(name) ? [path] : [];
    });
}

/**
 * Every code the API's capabilities module can put in a blocker, a
 * refusal or a turn-off line: `code: "X"`, the readiness helpers'
 * `setup("X", …)` / `attention(X, …)`, and the constants they take.
 */
function apiCodes(): Set<string> {
    const codes = new Set<string>();
    const CODE = "[A-Z][A-Z0-9_]{3,}";
    const patterns = [
        new RegExp(`code:\\s*"(${CODE})"`, "g"),
        new RegExp(`(?:setup|attention)\\(\\s*"?(${CODE})\\b`, "g"),
        new RegExp(`blockers\\.push\\(\\{\\s*code:\\s*"(${CODE})"`, "g"),
    ];
    for (const file of files(CAPABILITIES, /\.ts$/)) {
        if (/\.(spec|test)\.ts$/.test(file)) continue;
        const source = readFileSync(file, "utf8");
        for (const pattern of patterns) {
            for (const match of Array.from(source.matchAll(pattern))) {
                if (match[1]) codes.add(match[1]);
            }
        }
    }
    return codes;
}

describe("the words for every module code (DEC-057)", () => {
    it("finds the API's codes, so the check below is not empty", () => {
        const codes = apiCodes();
        expect(codes.size).toBeGreaterThan(20);
        for (const gate of [
            "UNAUTHORIZED",
            "ROLLOUT_DISABLED",
            "ORG_MODULE_DISABLED",
            "PROJECT_MODULE_UNSELECTED",
            "ENTITLEMENT_REQUIRED",
        ]) {
            expect(codes).toContain(gate);
        }
    });

    it("has merchant words for every code the API can send", () => {
        const missing = Array.from(apiCodes()).filter(
            (c) => !(c in BLOCKER_COPY),
        );
        expect(missing).toEqual([]);
    });

    it("never words a code as a code", () => {
        for (const [code, words] of Object.entries(BLOCKER_COPY)) {
            expect(words, code).not.toMatch(/\b[A-Z]{2,}(?:_[A-Z0-9]+)+\b/);
            expect(words.trim().length, code).toBeGreaterThan(10);
        }
        expect(BLOCKER_FALLBACK).not.toMatch(/[A-Z]{2,}_/);
    });

    it("says the API's sentence first, then its own, and never the code", () => {
        expect(
            blockerSentence({ code: "CRM_NO_PIPELINE", message: "Make one." }),
        ).toBe("Make one.");
        expect(blockerSentence({ code: "ROLLOUT_DISABLED" })).toBe(
            BLOCKER_COPY.ROLLOUT_DISABLED,
        );
        expect(
            blockerSentence({ code: "ORG_MODULE_DISABLED", message: "  " }),
        ).toBe(BLOCKER_COPY.ORG_MODULE_DISABLED);
        // A code this app has never heard of: no fallthrough to the code.
        const unknown = blockerSentence({ code: "SOME_NEW_GATE" });
        expect(unknown).toBe(BLOCKER_FALLBACK);
        expect(unknown).not.toContain("SOME_NEW_GATE");
    });
});

/**
 * What holds a module's code: a blocker, a refusal, a readiness step, an
 * impact line, or the module itself. A discount's code (`d.code`) or a
 * country's (`c.code`) is the merchant's own words and is left alone.
 */
const HOLDER = String.raw`[\w.?!]*(?:blocker|refusal|step|impact|item|module|reason|gate|\b[br](?=[.?]))[\w.?!]*`;

describe("nothing renders a code straight to the screen (DEC-057)", () => {
    it("has no `{blocker.code}` or `${blocker.code}` in the app", () => {
        const rendered = [
            // JSX text: `{blocker.code}` — not an attribute (`key={b.code}`).
            new RegExp(String.raw`(?<![=\w])\{\s*${HOLDER}\.code\s*\}`, "i"),
            // A template: `${blocker.code}`.
            new RegExp(String.raw`\$\{\s*${HOLDER}\.code\s*\}`, "i"),
            // `?? blocker.code` as the last resort for words.
            new RegExp(String.raw`\?\?\s*${HOLDER}\.code\b`, "i"),
        ];
        const offenders: string[] = [];
        for (const file of [
            ...files(join(APP, "components"), /\.tsx?$/),
            ...files(join(APP, "app"), /\.tsx?$/),
            ...files(join(APP, "lib"), /\.tsx?$/),
        ]) {
            if (/\.test\.tsx?$/.test(file)) continue;
            const path = relative(APP, file);
            const lines = readFileSync(file, "utf8").split("\n");
            lines.forEach((line, i) => {
                if (rendered.some((r) => r.test(line))) {
                    offenders.push(`${path}:${i + 1}: ${line.trim()}`);
                }
            });
        }
        expect(offenders).toEqual([]);
    });

    it("would catch one", () => {
        const line = "<span>{step?.message ?? step.code}</span>";
        const holder = new RegExp(String.raw`\?\?\s*${HOLDER}\.code\b`, "i");
        expect(holder.test(line)).toBe(true);
        expect(
            new RegExp(
                String.raw`(?<![=\w])\{\s*${HOLDER}\.code\s*\}`,
                "i",
            ).test("<p>{blocker.code}</p>"),
        ).toBe(true);
        expect(
            new RegExp(
                String.raw`(?<![=\w])\{\s*${HOLDER}\.code\s*\}`,
                "i",
            ).test("<p>{d.code}</p>"),
        ).toBe(false);
        expect(
            new RegExp(String.raw`\$\{\s*${HOLDER}\.code\s*\}`, "i").test(
                "`${res.data.code} is ready`",
            ),
        ).toBe(false);
        expect(
            new RegExp(String.raw`\$\{\s*${HOLDER}\.code\s*\}`, "i").test(
                "`${b.code} is off`",
            ),
        ).toBe(true);
    });
});

describe("a refused module write's words (DEC-057)", () => {
    it("keeps the API's own sentence", () => {
        expect(
            moduleErrorSentence(
                "Class packs needs Bookings. Turn on Bookings first.",
            ),
        ).toBe("Class packs needs Bookings. Turn on Bookings first.");
    });

    it("turns a bare code into its words, never the code", () => {
        expect(moduleErrorSentence("ROLLOUT_DISABLED")).toBe(
            BLOCKER_COPY.ROLLOUT_DISABLED,
        );
        expect(moduleErrorSentence("MODULE_DEACTIVATION_BLOCKED")).toBe(
            BLOCKER_FALLBACK,
        );
    });

    it("says the role line for a permission key", () => {
        expect(
            moduleErrorSentence(
                'Role "MEMBER" may not perform "module:manage"',
            ),
        ).toBe(BLOCKER_COPY.UNAUTHORIZED);
    });

    it("says the fallback for a key, a status or an empty message", () => {
        for (const said of [
            "Unknown module: SOMETHING",
            "PUT /modules/CRM failed: 500",
            "Internal server error",
            "",
            null,
        ]) {
            const out = moduleErrorSentence(
                said,
                "Could not update the module.",
            );
            expect(out).toBe("Could not update the module.");
        }
    });

    it("reads a refusal's first blocker before its message", () => {
        expect(
            refusalSentence({
                error: "MODULE_DEACTIVATION_BLOCKED",
                blockers: [{ code: "COMMERCE_OPEN_ORDERS" }],
            }),
        ).toBe(BLOCKER_COPY.COMMERCE_OPEN_ORDERS);
        expect(refusalSentence({ error: "ROLLOUT_DISABLED" })).not.toMatch(
            /ROLLOUT_DISABLED/,
        );
    });
});
