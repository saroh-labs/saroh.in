import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * One of each piece on accounts.saroh.in (DEC-195, joined by DEC-199):
 * reuse the shared component, never redraw it. Wired as saroh.in's scan
 * (`apps/saroh.in/lib/consistency/shared-pieces.test.ts`).
 *
 * Each rule names a piece drawn (or a helper written) in ONE place, its
 * `home`. A file outside the home that draws it again fails. `allow` holds
 * the copies left, each with why; it only shrinks: an entry whose file no
 * longer draws the piece fails too. `pnpm check:dupes` covers the
 * copy-paste kind.
 */

const APP = path.resolve(__dirname, "../..");
const SKIP = new Set(["node_modules", ".next", ".turbo", ".open-next"]);

interface Source {
    rel: string;
    code: string;
}

function sources(dir: string, out: string[] = []): string[] {
    for (const name of readdirSync(dir)) {
        if (SKIP.has(name)) continue;
        const full = path.join(dir, name);
        if (statSync(full).isDirectory()) sources(full, out);
        else if (
            /\.tsx?$/.test(name) &&
            !/\.(test|spec)\.tsx?$/.test(name) &&
            !/test-kit\.tsx?$/.test(name) &&
            !name.endsWith(".d.ts")
        ) {
            out.push(full);
        }
    }
    return out;
}

const FILES: Source[] = ["app", "components", "lib"]
    .flatMap((d) => sources(path.join(APP, d)))
    .map((file) => ({
        rel: path.relative(APP, file).split(path.sep).join("/"),
        // Comments describe old looks; only code is held to the rule.
        code: readFileSync(file, "utf8")
            .replace(/\/\*[\s\S]*?\*\//g, "")
            .replace(/^\s*\/\/.*$/gm, ""),
    }));

interface Rule {
    name: string;
    pattern: RegExp;
    /** Where the piece lives here, if anywhere: files, or folders ending "/". */
    home: string[];
    /** Today's copies: file → why. */
    allow: Record<string, string>;
}

const atHome = (rule: Rule, rel: string) =>
    rule.home.some((h) => (h.endsWith("/") ? rel.startsWith(h) : rel === h));

function offenders(rule: Rule) {
    return FILES.filter(
        (f) =>
            !atHome(rule, f.rel) &&
            !(f.rel in rule.allow) &&
            rule.pattern.test(f.code),
    ).map((f) => f.rel);
}

function stale(rule: Rule) {
    return Object.keys(rule.allow).filter((rel) => {
        const file = FILES.find((f) => f.rel === rel);
        return !file || !rule.pattern.test(file.code);
    });
}

const RULES: Rule[] = [
    {
        name: "a settings card is Section / Row from @saroh/ui/settings-rows",
        pattern: /\bCard(Header|Title|Description)\b/,
        home: [],
        allow: {},
    },
    {
        name: "a side sheet is FormSheet from @saroh/ui/form-sheet",
        pattern: /<SheetContent\b/,
        home: [],
        allow: {},
    },
    {
        name: "a dialog that saves is FormDialog, a confirm is ConfirmDialog",
        pattern: /from "@saroh\/ui\/(alert-dialog|dialog)"/,
        home: [],
        allow: {
            "components/billing-profiles/move-dialog.tsx":
                "the Move dialog's two steps (choose, then authorise the payment) and its RadioCards; to FormDialog when it is next changed",
        },
    },
    {
        name: "a breadcrumb is PageHeader's",
        pattern: /aria-label="Breadcrumbs?"/,
        home: [],
        allow: {},
    },
    {
        name: "an either/or is ChipGroup or RadioCards from @saroh/ui/choice-group",
        pattern: /\bRadioGroupItem\b/,
        home: [],
        allow: {},
    },
    {
        name: "the account area's page title is PageHeader (the sign-in pages' is AuthHeading)",
        pattern: /<h1\b/,
        home: ["components/auth/field.tsx"],
        allow: {
            "app/(auth)/forgot-password/sent/page.tsx":
                "a sign-in page's own heading; to AuthHeading when the sign-in pages are next changed",
            "app/(auth)/invite/[token]/page.tsx":
                "a sign-in page's own heading; to AuthHeading when the sign-in pages are next changed",
            "app/(auth)/reset-password/done/page.tsx":
                "a sign-in page's own heading; to AuthHeading when the sign-in pages are next changed",
            "app/staff-invite/page.tsx":
                "the staff invite's own heading; to AuthHeading when it is next changed",
        },
    },
    {
        name: "every phone field in accounts is locked to +91 (DEC-199)",
        pattern: /<PhoneInput\b(?:(?!lockCountry)[^>])*\/>/,
        home: [],
        allow: {},
    },
    {
        name: "a day is day() from lib/day.ts",
        pattern: /\.toLocale(Date|Time)?String\(/,
        home: ["lib/day.ts"],
        allow: {},
    },
    {
        name: "a list of names is namesList()",
        pattern: /\.join\(", "\)/,
        home: ["lib/billing-profiles.ts"],
        allow: {
            "app/(auth)/invite/[token]/page.tsx":
                "a role's grants, a list of permissions rather than names; to namesList when the invite is next changed",
            "lib/staff-invite-words.ts":
                "its own copy of namesList; to namesList when staff invites are next changed",
        },
    },
    {
        name: "the API is reached through lib/api.ts",
        pattern: /\bfetch\(/,
        home: ["lib/api.ts"],
        allow: {
            "lib/phone-sign-in.ts":
                "the browser's phone calls, with the session cookie (lib/api.ts is server-only); one browser client when it is next changed",
            "lib/invitations.ts": "a browser call to the API; as above",
            "lib/sign-in-options.ts": "a public, signed-out read; as above",
            "lib/signup-viewed.ts": "a public, signed-out beacon; as above",
            "lib/staff-invite.ts": "a browser call to the API; as above",
        },
    },
];

describe("one of each piece on accounts.saroh.in (DEC-195)", () => {
    it.each(RULES.map((r) => [r.name, r] as const))("%s", (_name, rule) => {
        expect(offenders(rule)).toEqual([]);
        expect(stale(rule)).toEqual([]);
    });
});
