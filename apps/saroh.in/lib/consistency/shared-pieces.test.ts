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
        allow: each(
            "step 3 (C1): its ring string becomes ring() from lib/ring.ts",
            [
                "app/(preview)/pricing/draft/page.tsx",
                "app/(standalone)/waitlist/page.tsx",
                "app/(v2)/changelog/[slug]/page.tsx",
                "app/(v2)/help/[slug]/page.tsx",
                "app/(v2)/help/page.tsx",
                "app/(v2)/integrations/[provider]/page.tsx",
                "app/(v2)/integrations/page.tsx",
                "app/site-tags.tsx",
                "components/v2/about/about-page.tsx",
                "components/v2/button.tsx",
                "components/v2/card-link.tsx",
                "components/v2/changelog/changelog-list.tsx",
                "components/v2/changelog/changelog-signup.tsx",
                "components/v2/contact/contact-form.tsx",
                "components/v2/contact/contact-page.tsx",
                "components/v2/customers/report-form.tsx",
                "components/v2/faq.tsx",
                "components/v2/feature/feature-hero.tsx",
                "components/v2/feature/feature-steps.tsx",
                "components/v2/help/help-search.tsx",
                "components/v2/help/help-vote.tsx",
                "components/v2/integrations/integration-steps.tsx",
                "components/v2/lightbox.tsx",
                "components/v2/mobile-menu.tsx",
                "components/v2/pill.tsx",
                "components/v2/pricing/billing-toggle.tsx",
                "components/v2/pricing/compare-table.tsx",
                "components/v2/pricing/gst-toggle.tsx",
                "components/v2/pricing/preview-controls.tsx",
                "components/v2/pricing/pricing-cards.tsx",
                "components/v2/pricing/usage-table.tsx",
                "components/v2/resources/prev-next.tsx",
                "components/v2/resources/side-nav.tsx",
                "components/v2/resources/styles.ts",
                "components/v2/screenshot-frame.tsx",
                "components/v2/site-footer.tsx",
                "components/v2/site-nav.tsx",
                "components/v2/solution/solution-hero.tsx",
                "components/v2/solution/solution-segment.tsx",
                "components/v2/templates/template-card.tsx",
                "components/v2/templates/template-viewer.tsx",
                "components/v2/templates/templates-gallery.tsx",
                "components/v2/tools/link-preview-tool.tsx",
                "components/v2/tools/qr-code-maker.tsx",
                "components/v2/tools/qr-maker-gate.tsx",
                "components/v2/tools/unlock-panel.tsx",
                "components/v2/waitlist/referral-link.tsx",
                "components/v2/waitlist/waitlist-done.tsx",
                "components/v2/waitlist/waitlist-form.tsx",
                "components/v2/welcome-forward.tsx",
                "components/v2/whatsapp-chat.tsx",
            ],
        ),
        files: SITE,
    },
    {
        name: "a question list is Faq (V3)",
        pattern: /<details\b/,
        home: ["components/v2/faq.tsx"],
        allow: {},
        files: SITE,
    },
    {
        name: "a breadcrumb is Breadcrumbs (V2, A4)",
        pattern: /aria-label="Breadcrumbs?"/,
        home: ["components/v2/resources/breadcrumbs.tsx"],
        allow: each(
            'step 6 (A4, V2): its own crumb list becomes Breadcrumbs current="brand"',
            [
                "app/(v2)/integrations/[provider]/page.tsx",
                "components/v2/feature/feature-hero.tsx",
                "components/v2/solution/solution-hero.tsx",
            ],
        ),
        files: SITE,
    },
    {
        name: "the Ink closing band is CtaBand (V4, A10)",
        pattern: both("\\brounded-mk-band\\b", "\\bbg-foreground\\b"),
        home: ["components/v2/cta-band.tsx"],
        allow: {
            "components/v2/about/about-page.tsx":
                "step 4 (A10): About's closing band becomes CtaBand (title only)",
            "components/v2/templates/templates-band.tsx":
                "step 4 (A10): the file goes, Templates uses CtaBand template",
        },
        files: SITE,
    },
    {
        name: "a section's H2 is SectionHeading / Section (A8)",
        pattern: /<h2\b[^>]*?font-display[^>]*?text-mk-h2/,
        home: ["components/v2/section-heading.tsx"],
        allow: each(
            "step 6 (A8): its raw H2 becomes Section / SectionHeading",
            [
                "app/(v2)/page.tsx",
                "components/v2/about/about-page.tsx",
                "components/v2/contact/contact-page.tsx",
                "components/v2/faq.tsx",
                "components/v2/home/home-pricing.tsx",
                "components/v2/pricing/compare-table.tsx",
                "components/v2/pricing/usage-table.tsx",
                "components/v2/solution/solution-pricing.tsx",
            ],
        ),
        files: SITE,
    },
    {
        name: "a Saffron text link is TextLink (V1, A2)",
        pattern: both("\\btext-brand-700\\b", "\\bno-underline\\b"),
        home: ["components/shared/links/text-link.tsx"],
        allow: each(
            "step 6 (A2, V1): its link class becomes TextLink (underline on hover, stays Saffron)",
            [
                "app/(preview)/pricing/draft/page.tsx",
                "app/(standalone)/waitlist/page.tsx",
                "app/(v2)/help/[slug]/page.tsx",
                "app/(v2)/help/page.tsx",
                "app/(v2)/integrations/[provider]/page.tsx",
                "components/v2/about/about-page.tsx",
                "components/v2/contact/contact-form.tsx",
                "components/v2/contact/contact-page.tsx",
                "components/v2/feature/feature-steps.tsx",
                "components/v2/pricing/pricing-cards.tsx",
                "components/v2/solution/solution-segment.tsx",
            ],
        ),
        files: SITE,
    },
    {
        name: 'a muted link is TextLink tone="quiet" (A3)',
        pattern: new RegExp(
            `\\btext-muted-foreground\\b${RUN}\\bno-underline\\b${RUN}hover:text-foreground`,
        ),
        home: ["components/shared/links/text-link.tsx"],
        allow: {
            ...each(
                'step 6 (A3): its quiet link becomes TextLink tone="quiet"',
                [
                    "app/(standalone)/waitlist/page.tsx",
                    "app/(v2)/integrations/[provider]/page.tsx",
                    "components/v2/feature/feature-hero.tsx",
                    "components/v2/site-footer.tsx",
                    "components/v2/solution/solution-hero.tsx",
                ],
            ),
            "components/v2/resources/styles.ts":
                "step 6 (A3): QUIET_LINK, the file is deleted",
        },
        files: SITE,
    },
    {
        name: "an email shape is isEmailShape() from lib/email-shape.ts (B1)",
        pattern: /\[\^\\s@\]/,
        home: ["lib/email-shape.ts"],
        allow: each(
            "step 3 (B1): its own regex (the CodeQL-flagged one) becomes isEmailShape()",
            [
                "components/v2/changelog/changelog-signup.tsx",
                "components/v2/tools/unlock-panel.tsx",
                "lib/business-report.ts",
                "lib/contact-message.ts",
                "lib/qr-code-maker.ts",
                "lib/waitlist.ts",
            ],
        ),
        files: SITE,
    },
    {
        name: "the clipboard is copyText from @saroh/ui (A17)",
        pattern: /navigator\.clipboard/,
        home: [],
        allow: each(
            "step 3 (A17): its own clipboard call becomes copyText from @saroh/ui",
            [
                "components/v2/tools/link-preview-tool.tsx",
                "components/v2/waitlist/referral-link.tsx",
            ],
        ),
        files: SITE,
    },
    {
        name: "an Ink button is Button / ButtonLink (V10, A14)",
        pattern: new RegExp(
            `\\bcursor-pointer\\b${RUN}\\bbg-foreground\\b${RUN}\\btext-background\\b|\\bbg-foreground\\b${RUN}\\bcursor-pointer\\b${RUN}\\btext-background\\b|<button\\b[^>]*?className=[^>]*?\\bbg-foreground\\b`,
        ),
        home: ["components/v2/button.tsx"],
        allow: each(
            "step 6 (A14, V10): its hand-drawn submit becomes <Button> (buttonClasses)",
            [
                "components/v2/changelog/changelog-signup.tsx",
                "components/v2/contact/contact-form.tsx",
                "components/v2/customers/report-form.tsx",
                "components/v2/tools/link-input.tsx",
                "components/v2/tools/link-preview-tool.tsx",
                "components/v2/tools/qr-maker-gate.tsx",
                "components/v2/waitlist/waitlist-form.tsx",
            ],
        ),
        files: SITE,
    },
    {
        name: "a plan's price is drawn by PlanCards only (A1, the teaser)",
        pattern: /\btext-mk-price\b/,
        home: ["components/v2/pricing/plan-cards.tsx"],
        allow: {},
        files: SITE,
    },
    {
        name: "plan card data reaches the page through PricingCards (A1)",
        pattern: /\bPlanCardView\b/,
        // The pricing feature (cards, the two tables, the staff preview)
        // and the lib that builds the views; a page elsewhere takes
        // PricingCards.
        home: ["components/v2/pricing/", "lib/"],
        allow: {},
        files: SITE,
    },
    {
        name: "a small caps label is Eyebrow (V12)",
        pattern: both("\\buppercase\\b", "tracking-\\[0\\.1em\\]"),
        home: ["components/v2/eyebrow.tsx"],
        allow: each(
            'step 6 (V12): its own small caps become Eyebrow tone="muted" size="sm"',
            [
                "app/(standalone)/waitlist/page.tsx",
                "components/v2/pricing/compare-table.tsx",
                "components/v2/pricing/usage-table.tsx",
                "components/v2/resources/on-this-page.tsx",
                "components/v2/resources/side-nav.tsx",
                "components/v2/solution/solution-segment.tsx",
            ],
        ),
        files: SITE,
    },
    {
        name: "a page title is PageIntro, its size a token (V6, A7)",
        pattern: /text-\[clamp\(/,
        home: ["components/shared/sections/page-intro.tsx"],
        allow: each(
            'step 6 (A7, V6): its own clamp() H1 becomes PageIntro size="page" | "article"',
            [
                "app/(standalone)/waitlist/page.tsx",
                "app/(v2)/changelog/[slug]/page.tsx",
                "app/(v2)/changelog/page.tsx",
                "app/(v2)/customers/page.tsx",
                "app/(v2)/help/[slug]/page.tsx",
                "app/(v2)/help/page.tsx",
                "app/(v2)/integrations/[provider]/page.tsx",
                "app/(v2)/integrations/page.tsx",
                "app/(v2)/templates/[slug]/page.tsx",
                "app/(v2)/templates/page.tsx",
                "app/(v2)/tools/link-preview/page.tsx",
                "app/(v2)/tools/qr-code-maker/page.tsx",
                "components/v2/about/about-page.tsx",
                "components/v2/legal/legal-page.tsx",
                "components/v2/tools/saroh-share-preview.tsx",
            ],
        ),
        files: SITE,
    },
    {
        name: "a reading column is Container width (V7, A23)",
        pattern: /max-w-\[(?:720|760|768|860|900)px\]/,
        home: ["components/v2/container.tsx"],
        allow: each(
            'step 6 (V7): its own column width becomes Container width="article" | "list"',
            [
                "app/(v2)/changelog/[slug]/page.tsx",
                "app/(v2)/changelog/page.tsx",
                "app/(v2)/customers/page.tsx",
                "app/(v2)/help/page.tsx",
                "app/(v2)/integrations/[provider]/page.tsx",
                "components/v2/changelog/changelog-list.tsx",
                "components/v2/faq.tsx",
                "components/v2/legal/legal-page.tsx",
            ],
        ),
        files: SITE,
    },
    {
        name: "a link card's hover is CardLink's (V5)",
        pattern: /hover:shadow-mk-(?:lift|card)\b/,
        home: ["components/v2/card-link.tsx"],
        allow: each(
            "step 6 (V5): its own card hover becomes CardLink (Ink border + shadow-mk-lift)",
            [
                "app/(v2)/integrations/page.tsx",
                "components/v2/templates/template-card.tsx",
            ],
        ),
        files: SITE,
    },
    {
        name: 'a "Coming soon" badge is Pill tone="soon" (A19)',
        pattern: /\bbg-mk-soon\b/,
        home: ["components/v2/pill.tsx"],
        allow: {
            "components/v2/pricing/compare-table.tsx":
                'step 4 (A19): its "Coming soon" badge becomes Pill tone="soon"',
            "components/v2/pricing/plan-cards.tsx":
                "keep: the staff preview's changed-part highlight, not a badge (check at step 4, A19)",
        },
        files: SITE,
    },
    {
        name: "a choice chip is ChoiceChip (V9, A13)",
        pattern: both("\\bh-9\\b", "\\brounded-full\\b"),
        home: ["components/shared/fields/choice-chips.tsx"],
        allow: each(
            "step 6 (A13, V9): its own chip becomes ChoiceChip (36px, 14px, bg-card)",
            [
                "components/v2/templates/template-viewer.tsx",
                "components/v2/templates/templates-gallery.tsx",
                "components/v2/waitlist/waitlist-form.tsx",
            ],
        ),
        files: SITE,
    },
    {
        name: "a text field is fieldClasses() (V11, A15)",
        pattern: /placeholder:text-/,
        home: ["components/shared/fields/"],
        allow: each(
            "step 6 (A15, V11): its own field classes become fieldClasses() (16px)",
            [
                "components/v2/changelog/changelog-signup.tsx",
                "components/v2/contact/contact-form.tsx",
                "components/v2/customers/report-form.tsx",
                "components/v2/help/help-search.tsx",
                "components/v2/tools/link-input.tsx",
                "components/v2/tools/qr-code-maker.tsx",
                "components/v2/tools/qr-maker-gate.tsx",
                "components/v2/tools/unlock-panel.tsx",
                "components/v2/waitlist/waitlist-form.tsx",
            ],
        ),
        files: SITE,
    },
    {
        name: '"See it in action" is written in content/ only (A6)',
        pattern: /See it in action/,
        home: ["content/"],
        allow: each(
            "step 4 (A6): the words move to content/home.ts, the row becomes HeroActions",
            [
                "components/v2/cta-band.tsx",
                "components/v2/feature/feature-hero.tsx",
                "components/v2/home/home-hero.tsx",
                "components/v2/solution/solution-hero.tsx",
            ],
        ),
        files: SITE,
    },
    {
        name: "an address read in the browser is useAddress() (B7)",
        pattern: /=\s*\(\)\s*=>\s*\(\)\s*=>\s*undefined\b/,
        home: ["lib/page-address.ts", "lib/use-address.ts"],
        allow: each(
            "step 3 (B7): its no-op subscribe becomes useAddress() beside lib/page-address.ts",
            [
                "app/site-tags.tsx",
                "components/v2/customers/report-form.tsx",
                "components/v2/tools/link-preview-tool.tsx",
                "components/v2/waitlist/waitlist-form.tsx",
            ],
        ),
        files: SITE,
    },
    {
        name: "a posted body is read with readPosted() from lib/relay.ts (B9)",
        pattern: /\breq\.json\(\)/,
        home: ["lib/relay.ts"],
        allow: each(
            "step 3 (B9): its body reading becomes readPosted() (its own checks stay)",
            [
                "app/api/business-reports/route.ts",
                "app/api/contact/route.ts",
                "app/api/link-preview/report/route.ts",
                "app/api/link-preview/route.ts",
                "app/api/tools/unlock/route.ts",
                "app/api/waitlist/route.ts",
            ],
        ),
        files: SITE,
    },
    {
        name: "a day is formatted by lib/format/ (B4)",
        pattern:
            /toLocaleDateString|toLocaleString\(\s*"en-|Intl\.DateTimeFormat/,
        home: ["lib/format/"],
        allow: each(
            "step 3 (B4): its own day formatter becomes formatDay() from lib/format/day.ts",
            [
                "content/about.ts",
                "content/changelog.ts",
                "content/help.ts",
                "lib/waitlist.ts",
            ],
        ),
        files: SITE,
    },
    {
        name: '"a, b and c" is sentenceList() (B5)',
        pattern: /\.slice\(0,\s*-1\)\.join\(", "\)/,
        home: ["lib/format/"],
        allow: {
            "lib/plan-teasers.ts":
                "step 3 (B5): sentenceList moves to lib/format/list.ts",
            "content/templates.ts":
                "step 3 (B5): imports sentenceList from lib/format/list.ts",
        },
        files: SITE,
    },
    {
        name: "arrow keys in a row are nextIndex() from lib/roving.ts (B6)",
        pattern: /"Arrow(?:Right|Left)"/,
        home: ["lib/roving.ts"],
        allow: each(
            "step 3 (B6): its own arrow-key maths becomes nextIndex()",
            [
                "components/v2/contact/contact-form.tsx",
                "components/v2/pricing/billing-toggle.tsx",
            ],
        ),
        files: SITE,
    },
    {
        name: "a file download is the package's saveFile() (B8)",
        pattern: /URL\.createObjectURL/,
        home: [],
        allow: {
            "components/v2/tools/qr-download.ts":
                "step 3 (B8): imports saveFile from @saroh/search-pages",
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
        allow: {
            "src/tools/business-card-qr-generator/logic.ts":
                "step 3 (B1): imports the gate's shape (its own is the CodeQL-flagged one)",
        },
        files: PACKAGE,
    },
    {
        name: "package: the clipboard is td-parts.tsx's (A17)",
        pattern: /navigator\.clipboard/,
        home: ["src/tools/td-parts.tsx"],
        allow: {
            "src/tools/gst-calculator/index.tsx":
                "step 3 (A17): its own copy becomes td-parts' useCopy",
        },
        files: PACKAGE,
    },
    {
        name: "package: a file download is qr.tsx's saveFile() (B8)",
        pattern: /URL\.createObjectURL/,
        home: ["src/tools/qr.tsx"],
        allow: {
            "src/tools/download.ts":
                "step 3 (B8): downloadCsv calls saveFile (it revokes the URL too soon)",
        },
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
            rel: "components/v2/solution/plan-teaser-card.tsx",
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
            rel: "components/v2/home/home-band.tsx",
            code: `<div className="flex flex-wrap items-end justify-between gap-10 rounded-mk-band bg-foreground p-mk-band text-background" />`,
        };
        expect(offenders(rule("the Ink closing band"), [band])).toEqual([
            band.rel,
        ]);
    });

    it("the piece's own home passes", () => {
        const home: Source = {
            rel: "components/v2/pricing/plan-cards.tsx",
            code: `<span className="font-display text-mk-price-lg" />`,
        };
        expect(offenders(rule("a plan's price"), [home])).toEqual([]);
    });
});
