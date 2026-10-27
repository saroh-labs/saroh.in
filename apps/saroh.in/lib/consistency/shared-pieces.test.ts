import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * One of each piece on saroh.in (DEC-195): reuse the shared component,
 * never redraw it.
 *
 * Each rule names a piece that is drawn (or a helper that is written) in ONE
 * place, its `home`. A file outside the home that draws it again fails.
 * Today's copies are on the rule's `allow` list, each with its reason and the
 * step of the de-duplication plan
 * (`docs/plans/2026-10-27-001-saroh-in-dedupe-audit.md`, "Step plan") that
 * removes it. The list only shrinks: an entry whose file no longer draws the
 * piece (or no longer exists, after a move) fails too, so the step that fixes
 * a file deletes its line. A path that moves (step 2) moves here with it.
 *
 * A clone checker can't see these: a redraw shares no lines with the
 * original (the /for/ plan teaser, 27 Oct). `pnpm check:dupes` covers the
 * copy-paste kind.
 */

const APP = path.resolve(__dirname, "../..");
const PKG = path.resolve(APP, "../../packages/search-pages");
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
            !/\.(fixture|test-kit)\.tsx?$/.test(name) &&
            !name.endsWith(".gen.ts") &&
            !name.endsWith(".d.ts")
        ) {
            out.push(full);
        }
    }
    return out;
}

function load(root: string, dirs: string[]): Source[] {
    return dirs
        .flatMap((d) => sources(path.join(root, d)))
        .map((file) => ({
            rel: path.relative(root, file).split(path.sep).join("/"),
            // Comments describe old looks; only code is held to the rule.
            code: readFileSync(file, "utf8")
                .replace(/\/\*[\s\S]*?\*\//g, "")
                .replace(/^\s*\/\/.*$/gm, ""),
        }));
}

const SITE = load(APP, ["app", "components", "lib", "content"]);
const PACKAGE = load(PKG, ["src"]);

interface Rule {
    name: string;
    pattern: RegExp;
    /** Where the piece lives: exact files, or folders ending in "/". */
    home: string[];
    /** Today's copies: file → why, and the step that removes it. */
    allow: Record<string, string>;
    files: Source[];
}

const atHome = (rule: Rule, rel: string) =>
    rule.home.some((h) => (h.endsWith("/") ? rel.startsWith(h) : rel === h));

/** Files outside the rule's home and allow list that draw the piece. */
function offenders(rule: Rule, files: Source[] = rule.files) {
    return files
        .filter(
            (f) =>
                !atHome(rule, f.rel) &&
                !(f.rel in rule.allow) &&
                rule.pattern.test(f.code),
        )
        .map((f) => f.rel);
}

/** Allow-list entries that no longer draw the piece: delete them. */
function stale(rule: Rule) {
    return Object.keys(rule.allow).filter((rel) => {
        const file = rule.files.find((f) => f.rel === rel);
        return !file || !rule.pattern.test(file.code);
    });
}

const each = (reason: string, files: string[]) =>
    Object.fromEntries(files.map((f) => [f, reason]));

// One class run: the characters a Tailwind class list can hold, so a
// pattern stays inside one string.
const RUN = "[^\"'`]*";
const both = (a: string, b: string) =>
    new RegExp(`${a}${RUN}${b}|${b}${RUN}${a}`);

const RULES: Rule[] = [
    {
        name: "the focus ring is ring() from lib/ring.ts (C1)",
        pattern: /focus-visible:\[outline-style:solid\]/,
        home: ["lib/ring.ts"],
        allow: {},
        files: SITE,
    },
    {
        name: "a question list is Faq (V3)",
        pattern: /<details\b/,
        home: ["components/shared/sections/faq.tsx"],
        allow: {},
        files: SITE,
    },
    {
        name: "a breadcrumb is Breadcrumbs (V2, A4)",
        pattern: /aria-label="Breadcrumbs?"/,
        home: ["components/shared/nav/breadcrumbs.tsx"],
        allow: {},
        files: SITE,
    },
    {
        name: "the Ink closing band is CtaBand (V4, A10)",
        pattern: both("\\brounded-mk-band\\b", "\\bbg-foreground\\b"),
        home: ["components/shared/sections/cta-band.tsx"],
        allow: {
            "components/about/about-page.tsx":
                "step 6 (V4): About's closing band (its 56px title, no body) becomes CtaBand; its सह name band is its own Ink block and stays",
        },
        files: SITE,
    },
    {
        name: "a section's H2 is SectionHeading / Section (A8)",
        pattern: /<h2\b[^>]*?font-display[^>]*?text-mk-h2/,
        home: ["components/shared/sections/section-heading.tsx"],
        allow: {},
        files: SITE,
    },
    {
        name: "a Saffron text link is TextLink (V1, A2)",
        pattern: both("\\btext-brand-700\\b", "\\bno-underline\\b"),
        home: ["components/shared/links/text-link.tsx"],
        allow: {},
        files: SITE,
    },
    {
        name: 'a muted link is TextLink tone="quiet" (A3)',
        pattern: new RegExp(
            `\\btext-muted-foreground\\b${RUN}\\bno-underline\\b${RUN}hover:text-foreground`,
        ),
        home: ["components/shared/links/text-link.tsx"],
        allow: {},
        files: SITE,
    },
    {
        name: "an email shape is isEmailShape() from lib/email-shape.ts (B1)",
        pattern: /\[\^\\s@\]/,
        home: ["lib/email-shape.ts"],
        allow: {},
        files: SITE,
    },
    {
        name: "the clipboard is copyText from @saroh/ui (A17)",
        pattern: /navigator\.clipboard/,
        home: [],
        allow: {},
        files: SITE,
    },
    {
        name: "an Ink button is Button / ButtonLink (V10, A14)",
        pattern: new RegExp(
            `\\bcursor-pointer\\b${RUN}\\bbg-foreground\\b${RUN}\\btext-background\\b|\\bbg-foreground\\b${RUN}\\bcursor-pointer\\b${RUN}\\btext-background\\b|<button\\b[^>]*?className=[^>]*?\\bbg-foreground\\b`,
        ),
        // ChoiceChip's chosen state is Ink too.
        home: [
            "components/shared/buttons/button.tsx",
            "components/shared/fields/choice-chips.tsx",
        ],
        allow: {},
        files: SITE,
    },
    {
        name: "a plan's price is drawn by PlanCards only (A1, the teaser)",
        pattern: /\btext-mk-price\b/,
        home: ["components/pricing/plan-cards.tsx"],
        allow: {},
        files: SITE,
    },
    {
        name: "plan card data reaches the page through PricingCards (A1)",
        pattern: /\bPlanCardView\b/,
        // The pricing feature (cards, the two tables, the staff preview)
        // and the lib that builds the views; a page elsewhere takes
        // PricingCards.
        home: ["components/pricing/", "lib/"],
        allow: {},
        files: SITE,
    },
    {
        name: "a small caps label is Eyebrow (V12)",
        pattern: both("\\buppercase\\b", "tracking-\\[0\\.1em\\]"),
        home: ["components/shared/sections/eyebrow.tsx"],
        allow: each(
            'step 6 (V12): its own small caps become Eyebrow tone="muted" size="sm"',
            [
                "app/(standalone)/waitlist/page.tsx",
                "components/pricing/plan-table.tsx",
                "components/resources/on-this-page.tsx",
                "components/resources/side-nav.tsx",
                "components/solution/solution-segment.tsx",
            ],
        ),
        files: SITE,
    },
    {
        name: "a page title is PageTitle, its size a token (V6, A7)",
        pattern: /text-\[clamp\(/,
        home: ["components/shared/sections/page-title.tsx"],
        allow: {
            "app/(standalone)/waitlist/page.tsx":
                "keep: the waitlist's 68px opening line is a paragraph of its own design, not a page title",
            "components/about/about-page.tsx":
                "keep: About's 'Where' H2 (30-40px) is its own; its closing band title waits on V4 (CtaBand), not in step 6's picks",
            "components/tools/link-preview/saroh-share-preview.tsx":
                "keep: the 'Share Saroh' card's H2 (30-38px) is a card title, not a page title",
        },
        files: SITE,
    },
    {
        name: "a reading column is Container width (V7, A23)",
        pattern: /max-w-\[(?:720|760|768|860|900)px\]/,
        home: ["components/shared/layout/container.tsx"],
        allow: {},
        files: SITE,
    },
    {
        name: "a link card's hover is CardLink's (V5)",
        pattern: /hover:shadow-mk-(?:lift|card)\b/,
        home: ["components/shared/links/card-link.tsx"],
        allow: each(
            "step 6 (V5): its own card hover becomes CardLink (Ink border + shadow-mk-lift)",
            [
                "app/(site)/integrations/page.tsx",
                "components/templates/template-card.tsx",
            ],
        ),
        files: SITE,
    },
    {
        name: 'a "Coming soon" badge is Pill tone="soon" (A19)',
        pattern: /\bbg-mk-soon\b/,
        home: ["components/shared/links/pill.tsx"],
        allow: {
            "components/pricing/plan-cards.tsx":
                "keep: the staff preview's changed-part highlight, not a badge",
        },
        files: SITE,
    },
    {
        name: "a choice chip is ChoiceChip (V9, A13)",
        pattern: both("\\bh-9\\b", "\\brounded-full\\b"),
        home: ["components/shared/fields/choice-chips.tsx"],
        allow: {},
        files: SITE,
    },
    {
        name: "a text field is fieldClasses() (V11, A15)",
        pattern: /placeholder:text-/,
        home: ["components/shared/fields/"],
        allow: {},
        files: SITE,
    },
    {
        name: '"See it in action" is written in content/ only (A6)',
        pattern: /See it in action/,
        home: ["content/"],
        allow: {},
        files: SITE,
    },
    {
        name: "a value read once in the browser is useBrowserValue() (B7)",
        pattern: /=\s*\(\)\s*=>\s*\(\)\s*=>\s*undefined\b/,
        home: ["lib/use-browser-value.ts"],
        allow: {},
        files: SITE,
    },
    {
        name: "a posted body is read with readPosted() from lib/relay.ts (B9)",
        pattern: /\breq\.json\(\)/,
        home: ["lib/relay.ts"],
        allow: {},
        files: SITE,
    },
    {
        name: "a day is formatted by lib/format/ (B4)",
        pattern:
            /toLocaleDateString|toLocaleString\(\s*"en-|Intl\.DateTimeFormat/,
        home: ["lib/format/"],
        allow: {},
        files: SITE,
    },
    {
        name: '"a, b and c" is sentenceList() (B5)',
        pattern: /\.slice\(0,\s*-1\)\.join\(", "\)/,
        home: ["lib/format/"],
        allow: {},
        files: SITE,
    },
    {
        name: "arrow keys in a row are nextIndex() from lib/roving.ts (B6)",
        pattern: /"Arrow(?:Right|Left)"/,
        home: ["lib/roving.ts"],
        allow: {},
        files: SITE,
    },
    {
        name: "a file download is the package's saveFile() (B8)",
        pattern: /URL\.createObjectURL/,
        home: [],
        allow: {
            "components/tools/qr-code-maker/qr-download.ts":
                "keep: svgToPng's object URL is the image it draws, not a download (saveFile comes from @saroh/search-pages/download)",
        },
        files: SITE,
    },

    // packages/search-pages: the package can't import saroh.in, so it keeps
    // its own single copy of each piece.
    {
        name: 'package: the start button\'s label comes from the site, not "Start free" (A12, B2)',
        pattern: /Start free/,
        home: [],
        allow: each(
            "step 3 (A12, B2): the label comes in with the start link; its default fallback's file becomes this rule's home",
            [
                "src/components/search-page.tsx",
                "src/components/tool-page.tsx",
                "src/components/tools-hub.tsx",
            ],
        ),
        files: PACKAGE,
    },
    {
        name: "package: crumbs, questions and the closing band are page-parts.tsx (A11)",
        pattern: /\b(?:sp|tp)-(?:crumb|faq|cta)\b/,
        home: ["src/components/page-parts.tsx"],
        allow: each(
            "step 7 (A11): its own crumb, FAQ and band become the package's one set of parts",
            [
                "src/components/search-page.tsx",
                "src/components/tool-page.tsx",
                "src/components/tools-hub.tsx",
            ],
        ),
        files: PACKAGE,
    },
    {
        name: "package: an email shape is email-gate.tsx's (B1)",
        pattern: /\[\^\\s@\]/,
        home: ["src/tools/email-gate.tsx"],
        allow: {},
        files: PACKAGE,
    },
    {
        name: "package: the clipboard is td-parts.tsx's (A17)",
        pattern: /navigator\.clipboard/,
        home: ["src/tools/td-parts.tsx"],
        allow: {},
        files: PACKAGE,
    },
    {
        name: "package: a file download is download.ts's saveFile() (B8)",
        pattern: /URL\.createObjectURL/,
        home: ["src/tools/download.ts"],
        allow: {},
        files: PACKAGE,
    },
];

describe("one of each piece on saroh.in (DEC-195)", () => {
    for (const rule of RULES) {
        it(rule.name, () => {
            expect(offenders(rule)).toEqual([]);
            expect(stale(rule)).toEqual([]);
        });
    }

    it("every allow-list entry gives its reason", () => {
        for (const rule of RULES) {
            for (const [rel, why] of Object.entries(rule.allow)) {
                expect(why.length, `${rule.name}: ${rel}`).toBeGreaterThan(20);
            }
        }
    });
});

describe("the scan catches a redraw", () => {
    const rule = (start: string) => {
        const found = RULES.find((r) => r.name.startsWith(start));
        if (!found) throw new Error(`no rule "${start}"`);
        return found;
    };

    it("a page that draws its own plan card fails (the /for/ teaser, 27 Oct)", () => {
        const teaser: Source = {
            rel: "components/solution/plan-teaser-card.tsx",
            code: `
                import type { PlanCardView } from "@/lib/pricing-model";
                export function PlanTeaserCard({ plan }: { plan: PlanCardView }) {
                    return (
                        <div className="grid gap-3 rounded-[18px] border p-7">
                            <h3>{plan.name}</h3>
                            <span className="font-display text-mk-price-lg font-bold">{plan.price}</span>
                        </div>
                    );
                }`,
        };
        expect(offenders(rule("a plan's price"), [teaser])).toEqual([
            teaser.rel,
        ]);
        expect(offenders(rule("plan card data"), [teaser])).toEqual([
            teaser.rel,
        ]);
    });

    it("a page that draws its own closing band fails", () => {
        const band: Source = {
            rel: "components/home/home-band.tsx",
            code: `<div className="flex flex-wrap items-end justify-between gap-10 rounded-mk-band bg-foreground p-mk-band text-background" />`,
        };
        expect(offenders(rule("the Ink closing band"), [band])).toEqual([
            band.rel,
        ]);
    });

    it("the piece's own home passes", () => {
        const home: Source = {
            rel: "components/pricing/plan-cards.tsx",
            code: `<span className="font-display text-mk-price-lg" />`,
        };
        expect(offenders(rule("a plan's price"), [home])).toEqual([]);
    });
});
