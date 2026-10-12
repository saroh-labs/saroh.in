import type { TemplateContext, TemplateManifest } from "@saroh/templates";
import {
    getTemplate,
    instantiateTemplate,
    pageUntouched,
    starterTemplate,
    starterTemplateV3,
} from "@saroh/templates";

import { formatReport, parseArgs } from "../../cli/template-upgrade.cli";
import { sanitizeRichHtml } from "./sanitize";
import { planTemplateStyle } from "./site-create";
import { defaultSiteStyle, parseSiteStyle } from "./site-style";
import { emptyCounts } from "./template-sync";
import type { TemplateUpgradeReport } from "./template-upgrade";
import {
    madeCandidates,
    planLook,
    UPGRADED_TEMPLATE_IDS,
} from "./template-upgrade";

/**
 * The upgrade's decisions that need no database (DEC-141): whether a
 * site's look and footer are still its template's, which profiles an old
 * version is tried against, and what the command prints. What it writes is
 * `template-upgrade.db.spec.ts`; the page rule is `@saroh/templates`'
 * `upgrade.test.ts`.
 */

const salon: TemplateContext = {
    organizationName: "Kesar Salon",
    legalName: "Kesar Salon LLP",
    contactEmail: "kesarsalon@example.com",
    description: "Haircut and Colour in Bengaluru",
    modules: ["WEBSITE", "APPOINTMENTS"],
    serviceIds: ["svc_cut"],
    area: "Bengaluru",
};

const untouched = { style: null, footer: null, templateStyleId: null };

describe("planLook — the look", () => {
    it("is applied to a site whose style nobody chose", () => {
        const look = planLook(
            untouched,
            starterTemplateV3,
            starterTemplate,
            salon,
        );
        expect(look.style).toBe("applied");
        expect(look.nextStyle).toEqual(planTemplateStyle(starterTemplate));
        expect(look.nextStyle?.id).toBe("stone");
        expect(look.nextStyle?.value).toMatchObject({
            fontPair: "source-serif-inter",
            type: { displaySize: 56, bodySize: 17 },
        });
    });

    it("counts a stored default as nobody's choice", () => {
        // Saved once without changing anything: the default, written out.
        for (const style of [defaultSiteStyle(), {}]) {
            expect(
                planLook(
                    { ...untouched, style },
                    starterTemplateV3,
                    starterTemplate,
                    salon,
                ).style,
            ).toBe("applied");
        }
    });

    it.each([
        ["a colour", { colours: { accent: "teal" } }],
        ["a slider", { scalars: { cornerRadius: 12 } }],
        ["a font pair", { fontPair: "newsreader" }],
    ])("is kept when the owner changed %s", (_label, style) => {
        const look = planLook(
            { ...untouched, style },
            starterTemplateV3,
            starterTemplate,
            salon,
        );
        expect(look.style).toBe("kept");
        expect(look.nextStyle).toBeUndefined();
        // Still theirs, whatever it parses to.
        expect(parseSiteStyle(style)).not.toEqual(defaultSiteStyle());
    });

    it("is kept when what is stored cannot be read: never guessed untouched", () => {
        const look = planLook(
            { ...untouched, style: { colours: { accent: "not-a-swatch" } } },
            starterTemplateV3,
            starterTemplate,
            salon,
        );
        expect(look.style).toBe("kept");
    });

    it("for a template with colourways, is the one the site was made in", () => {
        // A later version of the starter, as a move from v4 would see it.
        const next: TemplateManifest = { ...starterTemplate, version: 5 };
        const made = planTemplateStyle(starterTemplate, "harbour");
        const inHarbour = {
            style: made?.value,
            footer: null,
            templateStyleId: "harbour",
        };
        expect(planLook(inHarbour, starterTemplate, next, salon).style).toBe(
            "applied",
        );
        // Recorded as Harbour, wearing Clay: the owner switched.
        expect(
            planLook(
                {
                    ...inHarbour,
                    style: planTemplateStyle(starterTemplate, "clay")?.value,
                },
                starterTemplate,
                next,
                salon,
            ).style,
        ).toBe("kept");
        // A colourway the template never had: unknown, so kept.
        expect(
            planLook(
                { ...inHarbour, templateStyleId: "neon" },
                starterTemplate,
                next,
                salon,
            ).style,
        ).toBe("kept");
    });

    it("has nothing to do for a template with no colourways", () => {
        const plain: TemplateManifest = {
            ...starterTemplateV3,
            version: 9,
        };
        expect(planLook(untouched, starterTemplateV3, plain, salon)).toEqual({
            style: "none",
            footer: "none",
        });
    });
});

describe("planLook — the footer", () => {
    it("is laid on the left, with the business's own line, where there was none", () => {
        const look = planLook(
            untouched,
            starterTemplateV3,
            starterTemplate,
            salon,
        );
        expect(look.footer).toBe("applied");
        expect(look.nextFooter).toEqual({
            format: "markdown",
            value: "Haircut and Colour in Bengaluru",
            layout: "left",
        });
    });

    it("carries no line where nothing is known of the business", () => {
        const look = planLook(untouched, starterTemplateV3, starterTemplate, {
            organizationName: "Acme",
        });
        expect(look.nextFooter).toEqual({
            format: "markdown",
            value: "",
            layout: "left",
        });
    });

    it("is kept when the owner wrote one", () => {
        const look = planLook(
            {
                ...untouched,
                footer: { format: "markdown", value: "Closed Mondays" },
            },
            starterTemplateV3,
            starterTemplate,
            salon,
        );
        expect(look.footer).toBe("kept");
        expect(look.nextFooter).toBeUndefined();
        // The look is its own question.
        expect(look.style).toBe("applied");
    });
});

describe("madeCandidates", () => {
    it("tries the business's name and the site's, with and without its email and legal name", () => {
        const candidates = madeCandidates(starterTemplateV3, salon, "Kesar");
        expect(candidates).toHaveLength(8);
        const headings = new Set(
            candidates.map(
                (c) =>
                    (c.pages[0]?.sections[0]?.content as { heading: string })
                        .heading,
            ),
        );
        expect(headings).toEqual(new Set(["Kesar Salon", "Kesar"]));
    });

    it("never gives an old version a line it was never given", () => {
        // v3's hero would have shown it in place of its note.
        for (const candidate of madeCandidates(
            starterTemplateV3,
            salon,
            "Kesar Salon",
        )) {
            expect(JSON.stringify(candidate)).not.toContain(
                "Haircut and Colour",
            );
        }
    });

    it("matches a site made before the business added its email", () => {
        const made = instantiateTemplate(starterTemplateV3, {
            organizationName: "Kesar Salon",
        });
        const home = made.pages[0];
        if (!home) throw new Error("no home page");
        expect(
            pageUntouched(
                { path: "/", sections: home.sections },
                madeCandidates(starterTemplateV3, salon, "Kesar Salon"),
            ),
        ).toBe(true);
    });

    it("gives one candidate for a business with nothing but its name", () => {
        expect(
            madeCandidates(
                starterTemplateV3,
                { organizationName: "Acme" },
                "Acme",
            ),
        ).toHaveLength(1);
    });
});

describe("what the starter writes, through the sanitizer", () => {
    it("is unchanged, so a page saved without a change is still the template's", () => {
        // A draft is sanitized when it is saved. If that altered the
        // template's own text (About's list of facts, with the business's
        // own words escaped into it), a page saved without a change would
        // stop matching its template and count as edited.
        const { pages } = instantiateTemplate(starterTemplate, {
            ...salon,
            organizationName: 'Rye & "Co."',
            area: "Navi <Mumbai>",
            hasPlace: true,
        });
        const texts = pages
            .flatMap((p) => p.sections)
            .filter((s) => s.type === "richText")
            .map((s) => (s.content as { value: string }).value);
        expect(texts.length).toBeGreaterThan(0);
        for (const value of texts) {
            expect(value).toContain("<dl>");
            expect(sanitizeRichHtml(value)).toBe(value);
        }
    });
});

describe("what the upgrade moves", () => {
    it("is the starter and the two a person starts from, each to a newer version", () => {
        expect(UPGRADED_TEMPLATE_IDS).toEqual([
            "starter",
            "personal",
            "portfolio",
        ]);
        for (const id of UPGRADED_TEMPLATE_IDS) {
            const first = getTemplate(id, 1);
            const latest = getTemplate(id);
            expect(first).toBeDefined();
            expect(latest?.version).toBeGreaterThan(first?.version ?? 0);
            expect((latest?.styles ?? []).length).toBeGreaterThan(0);
        }
    });
});

describe("the command", () => {
    it.each([
        [[], { dryRun: false }],
        [["--dry-run"], { dryRun: true }],
        [["--limit=20"], { dryRun: false, limit: 20 }],
        [["--dry-run", "--business=rye"], { dryRun: true, business: "rye" }],
    ])("reads %j", (argv, args) => {
        expect(parseArgs(argv)).toEqual(args);
    });

    it.each([["--force"], ["--limit=0"], ["--limit=ten"], ["--business="]])(
        "refuses %s rather than guess",
        (arg) => {
            expect(parseArgs([arg])).toBeNull();
        },
    );

    it("prints counts and template names, and nothing of anyone's", () => {
        const report: TemplateUpgradeReport = {
            dryRun: true,
            sites: 12,
            upgraded: 9,
            alreadyCurrent: 2,
            unknownVersion: 1,
            failed: 0,
            styleApplied: 7,
            styleKept: 2,
            footerApplied: 8,
            footerKept: 1,
            counts: {
                ...emptyCounts(),
                pagesReplaced: 11,
                pagesMerged: 4,
                sectionsAdded: 5,
                ownerNotesRemoved: 3,
                modulePagesAdded: 9,
            },
            moves: { "starter@3 → starter@4": 8, "personal@1 → personal@2": 1 },
        };
        const lines = formatReport(report);
        expect(lines[0]).toBe(
            "dry run, nothing written. sites on these templates: 12, would upgrade: 9, already current: 2, unknown version: 1, failed: 0",
        );
        expect(lines[1]).toBe(
            "look: applied 7, kept 2; footer: applied 8, kept 1",
        );
        expect(lines[2]).toContain("replaced 11");
        expect(lines[2]).toContain("owner notes removed 3");
        expect(lines[3]).toBe(
            "moves: personal@1 → personal@2: 1, starter@3 → starter@4: 8",
        );
        // A real run says so.
        expect(formatReport({ ...report, dryRun: false })[0]).toMatch(
            /^sites on these templates: 12, upgraded: 9,/,
        );
    });
});
