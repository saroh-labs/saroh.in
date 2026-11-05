import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { SHOT_KEYS, SOLUTION_FAQ_IDS } from "@saroh/marketing/content-types";

import { officeLine } from "../../saroh.in/content/company";
import { faqs as inFaqs } from "../../saroh.in/content/faq";
import { featureList as inFeatures } from "../../saroh.in/content/features";
import { home as inHome } from "../../saroh.in/content/home";
import { solutionList as inSolutions } from "../../saroh.in/content/solutions";

import { CHANGELOG, changelogPath } from "@/content/changelog";
import { COMING } from "@/content/coming";
import { CONTACT, REGISTERED_OFFICE, SUPPORT_EMAIL } from "@/content/contact";
import { faqs, HOME_FAQ, solutionFaq } from "@/content/faq";
import { featureList, features } from "@/content/features";
import { GUIDE_CONTENT, guideSteps } from "@/content/guides";
import { HELP, HELP_FAQS } from "@/content/help";
import { CTA_BAND, FREE_PLAN_LINE, home } from "@/content/home";
import { INTEGRATIONS } from "@/content/integrations";
import { BILLING, COOKIES, PRIVACY, TERMS } from "@/content/legal";
import { SAROH_SOCIAL } from "@/content/social";
import { solutionList, solutions } from "@/content/solutions";
import { pageSchema } from "@/lib/schema";

import { ONE_PERSON } from "../scripts/check-claims.mjs";

import { pageAt, PAGES } from "./site-map";

const words = (o: unknown) => JSON.stringify(o);

/** The fields of `theirs` that `ours` lacks, down through objects and first array items. */
function missingFields(theirs: unknown, ours: unknown, at = ""): string[] {
    if (Array.isArray(theirs)) {
        // The shape of one item is enough: a page may have fewer of them.
        return theirs[0] && Array.isArray(ours) && ours[0]
            ? missingFields(theirs[0], ours[0], `${at}[]`)
            : [];
    }
    if (typeof theirs !== "object" || theirs === null) return [];
    const mine = (ours ?? {}) as Record<string, unknown>;
    return Object.entries(theirs).flatMap(([key, value]) =>
        key in mine
            ? missingFields(value, mine[key], `${at}.${key}`)
            : [`${at}.${key}`],
    );
}

/** Optional on saroh.in: a site may have no shot or plan note for a line. */
const OPTIONAL = /\.(openNote|label|shot|alt|hero|heroNote)$/;
const missing = (theirs: unknown, ours: unknown) =>
    missingFields(theirs, ours).filter((f) => !OPTIONAL.test(f));

describe("saroh.tech has saroh.in's shape", () => {
    it("the same features and solutions, in the same order", () => {
        expect(featureList.map((f) => f.slug)).toEqual(
            inFeatures.map((f) => f.slug),
        );
        expect(solutionList.map((s) => s.slug)).toEqual(
            inSolutions.map((s) => s.slug),
        );
    });

    it("every field saroh.in's pages have", () => {
        for (const f of inFeatures) {
            expect(missing(f, features[f.slug]), f.slug).toEqual([]);
        }
        for (const s of inSolutions) {
            expect(missing(s, solutions[s.slug]), s.slug).toEqual([]);
        }
        expect(missing(inHome, home)).toEqual([]);
    });

    it("every question saroh.in asks, but its GST ones", () => {
        const here = new Set(Object.keys(faqs));
        const gone = Object.keys(inFaqs).filter((id) => !here.has(id));
        expect(gone.sort()).toEqual(["gst", "gst-solutions"]);
    });

    it("fails a field or a page that goes missing", () => {
        const { closer: _closer, ...cut } = features.orders;
        const orders = inFeatures.find((f) => f.slug === "orders");
        expect(missing(orders, cut)).toEqual([".closer"]);
        const { title: _title, ...step } = features.orders.steps[0];
        expect(
            missing(orders, {
                ...features.orders,
                steps: [step],
            }),
        ).toEqual([".steps[].title"]);
        expect(missing(orders, undefined)).toContain(".slug");
    });
});

describe("saroh.tech's feature states", () => {
    it("a Limited or Coming soon page says what's true today", () => {
        for (const f of featureList) {
            if (f.state === "full") continue;
            expect(f.worksToday.length, f.slug).toBeGreaterThan(20);
        }
    });

    it("gives the states the ledger gives", () => {
        expect(
            featureList.filter((f) => f.state === "full").map((f) => f.slug),
        ).toEqual(["products", "customers"]);
        expect(
            featureList
                .filter((f) => f.state === "coming-soon")
                .map((f) => f.slug),
        ).toEqual(["subscriptions"]);
    });

    it("marks every part of a Coming soon page, and nothing else", () => {
        for (const f of featureList) {
            for (const part of [...f.steps, ...f.points]) {
                expect(Boolean(part.notYet), `${f.slug}: ${part.title}`).toBe(
                    f.state === "coming-soon",
                );
            }
        }
    });

    it("no page leans on Subscriptions while it can't be used", () => {
        for (const f of featureList) {
            expect(f.worksWith, f.slug).not.toContain("subscriptions");
            if (f.slug !== "subscriptions") {
                expect(words(f), f.slug).not.toMatch(
                    /\b(renewals?|memberships?)\b/i,
                );
            }
        }
        for (const s of solutionList) {
            expect(s.segments.map((g) => g.feature)).not.toContain(
                "subscriptions",
            );
            // Its question's id says "membership"; its words may not.
            expect(words({ ...s, faq: "" }), s.slug).not.toMatch(
                /\b(renewals?|memberships?)\b/i,
            );
        }
    });
});

describe("saroh.tech's words", () => {
    const all = {
        features,
        solutions,
        faqs,
        home,
        FREE_PLAN_LINE,
        CTA_BAND,
        HELP,
        HELP_FAQS,
    };
    const sold = words(all);

    it("don't sell or count class packs, which no plan offers (DEC-099)", () => {
        // The question's id is shared with saroh.in; its words may not say it.
        const claims = sold.replaceAll("gyms-pack-and-membership", "");
        expect(claims).not.toMatch(/\bpack(s|ages?)?\b/i);
    });

    it("ask for one person, until plans are on sale (DEC-203)", () => {
        // Ids shared with saroh.in; their words may not say it.
        const claims = sold
            .replaceAll('"team":', "")
            .replaceAll("salons-choose-stylist", "");
        for (const phrase of ONE_PERSON) expect(claims).not.toMatch(phrase);
    });

    it("stay out of what isn't true outside India", () => {
        const banned =
            /\b(GST|GSTIN|UPI|HSN|SAC|Razorpay|Cashfree|bills? of supply|Stripe|PayPal|SMS|pay link|deposits?|autopay|custom domain|your own domain|quotes?|estimates?|client pages?|approvals?|acceptance|any currency|see when|reminders?)\b|₹/i;
        // Home names its two free tools; help has the free reminder writer, and
        // `currencies` says who uses saroh.in. Nothing else may.
        const { tools: _tools, ...homeWords } = home;
        const { HELP: _help, ...rest } = { ...all, home: homeWords };
        expect(words(rest)).not.toMatch(banned);
        expect(
            words(
                HELP.filter((a) => a.group !== "Free tools").map(
                    ({ related: _related, ...a }) => a,
                ),
            ),
        ).not.toMatch(banned);
    });

    it("name India only to send a business in India to saroh.in", () => {
        expect(sold.match(/\bIndia\b/g)).toHaveLength(1);
        expect(faqs.currencies.a).toContain("in India uses saroh.in");
    });

    it("don't promise email to a customer, or name a provider of our plans", () => {
        expect(sold).not.toMatch(
            /\b(email(ed)? (to|the|your) customer|send a reminder|merchant of record)\b/i,
        );
    });

    it("hold to the copy rules: no em dash, semicolon or banned word", () => {
        const sentences = [
            ...sold.matchAll(/"((?:[^"\\]|\\.)* (?:[^"\\]|\\.)*)"/g),
        ]
            .map((m) => m[1])
            .join("\n");
        expect(sentences).not.toMatch(/—|&mdash;|;/);
        expect(sentences).not.toMatch(
            /!|\b(please|simply|easy|oops|successfully|storefront|inventory|log in|login|slot)\b/i,
        );
    });

    it("give saroh.in's company facts, and only saroh.tech's address", () => {
        const legal = words([TERMS, PRIVACY]);
        expect(REGISTERED_OFFICE.join(", ")).toBe(officeLine());
        expect(legal).toContain(officeLine());
        expect(legal).toContain(SUPPORT_EMAIL);
        expect(legal).not.toContain("@saroh.in");
    });

    it("point the structured data at saroh.tech's own accounts", () => {
        const home = pageAt("/");
        const sameAs = home && pageSchema(home)[0].sameAs;
        expect(sameAs).toEqual(SAROH_SOCIAL.map((s) => s.href));
        expect(sameAs).toContain("https://x.com/sarohtech");
        expect(sameAs).toContain("https://www.instagram.com/sarohtech");
    });

    it("name only who handles data on Global", () => {
        expect(words(PRIVACY)).not.toMatch(
            /Razorpay|Cashfree|Google Analytics|MSG91|DPDP|grievance|Data Fiduciary/i,
        );
    });

    it("have nothing false left in legal", () => {
        expect(words([TERMS, PRIVACY, COOKIES, BILLING])).not.toMatch(
            /\b(Stripe|PayPal|merchant of record)\b|\bquotes,/i,
        );
    });

    it("say your place and your online shop: a Free business has one place customers visit", () => {
        expect(words({ ...all, CONTACT })).not.toMatch(
            /\b(every|each|all|two|several|other) (locations?|branch(es)?)\b|\bbetween locations\b|\bbranches\b|\bstock (for|by|at) (each )?location\b/i,
        );
    });

    it("name Home's button as Home does, and don't send what's handed over at a counter", () => {
        const text = words({ features, solutions });
        expect(text).not.toMatch(/\bhand over an order\b/i);
        expect(text).toMatch(/\bMark an order sent\b/);
        expect(text).not.toMatch(/\bsend (the morning's|today's) orders\b/i);
    });

    it("name Insights in the screen's words", () => {
        const insights = words([features.insights, solutions.shops]);
        expect(insights).not.toMatch(/\b(site )?views\b/i);
        expect(insights).toContain("Am I making more money?");
        expect(words(features.insights)).toContain("Paid orders and bookings");
    });

    it("have no marker left", () => {
        expect(words(all)).not.toContain("[confirm");
    });

    it("every cross-link and shot lands", () => {
        const shots = new Set<string>(SHOT_KEYS);
        for (const f of featureList) {
            expect(f.worksWith.length, f.slug).toBeGreaterThan(0);
            for (const w of f.worksWith) expect(features[w], w).toBeTruthy();
            for (const u of f.usedBy) expect(solutions[u], u).toBeTruthy();
            expect(shots.has(f.hero.shot), f.slug).toBe(true);
            expect(f.steps.length, f.slug).toBeGreaterThan(0);
            expect(f.points.length, f.slug).toBeGreaterThan(0);
            for (const s of f.steps)
                expect(shots.has(s.shot), s.shot).toBe(true);
        }
        for (const s of solutionList) {
            expect(SOLUTION_FAQ_IDS).toContain(s.faq);
            for (const id of solutionFaq(s.faq))
                expect(faqs[id], id).toBeTruthy();
            for (const g of s.segments) {
                expect(features[g.feature], g.feature).toBeTruthy();
                if (g.shot) expect(shots.has(g.shot), g.shot).toBe(true);
            }
        }
        for (const id of HOME_FAQ) expect(faqs[id], id).toBeTruthy();
    });

    it("say to search what saroh.in's pages say, within the limits", () => {
        for (const p of [...featureList, ...solutionList]) {
            expect(p.seoTitle.length, p.slug).toBeLessThanOrEqual(52);
            expect(p.seoDescription.length, p.slug).toBeLessThanOrEqual(150);
            expect(p.sub.toLowerCase(), p.slug).toContain(p.phrase);
            expect(p.seoTitle.toLowerCase(), p.slug).toContain(
                p.phrase.split(" ")[0],
            );
        }
        expect(`${home.seoTitle} | Saroh`.length).toBeLessThanOrEqual(60);
        expect(home.seoDescription.length).toBeLessThanOrEqual(155);
        expect(home.eyebrow.toLowerCase()).toContain(home.phrase);
    });
});

describe("guides", () => {
    it("every guide page in the site map has words, and the reverse", () => {
        const pages = PAGES.filter((p) => p.type === "guide").map(
            (p) => p.path,
        );
        expect(GUIDE_CONTENT.map((g) => `/guides/${g.slug}`).sort()).toEqual(
            pages.sort(),
        );
    });

    it("every internal link is a page in the site map", () => {
        for (const g of GUIDE_CONTENT) {
            expect(pageAt(g.tool.href), g.tool.href).toBeTruthy();
            for (const slug of g.next) {
                expect(pageAt(`/guides/${slug}`), slug).toBeTruthy();
            }
        }
    });

    it("sends no one but https to an outside page", () => {
        const hrefs = GUIDE_CONTENT.flatMap((g) =>
            g.sections.flatMap((s) =>
                s.blocks.flatMap((b) =>
                    b.kind === "sources" ? b.items.map((i) => i.href) : [],
                ),
            ),
        );
        expect(hrefs.length).toBeGreaterThan(0);
        for (const href of hrefs) expect(href).toMatch(/^https:\/\//);
    });

    it("has no em dashes, and step guides have steps for HowTo", () => {
        expect(words(GUIDE_CONTENT)).not.toContain("—");
        const steps = GUIDE_CONTENT.filter(
            (g) => g.slug === "how-to-write-an-invoice",
        ).flatMap(guideSteps);
        expect(steps).toHaveLength(8);
    });
});

describe("what's coming", () => {
    const rows = COMING.flatMap((g) => g.rows.map((r) => r.name));

    it("is one list, on the changelog and on Integrations", () => {
        expect(INTEGRATIONS.planned).toBe(COMING);
        const page = readFileSync(
            join(__dirname, "../app/changelog/page.tsx"),
            "utf8",
        );
        expect(page).toContain("groups={COMING}");
    });

    it("has Subscriptions, before the Autopay that depends on it", () => {
        expect(rows.indexOf("Subscriptions")).toBeGreaterThanOrEqual(0);
        expect(rows.indexOf("Subscriptions")).toBeLessThan(
            rows.indexOf("Autopay"),
        );
    });
});

describe("the changelog", () => {
    it("is newest first, and every entry has its page in the site map", () => {
        const dates = CHANGELOG.map((e) => e.date);
        expect(dates).toEqual([...dates].sort().reverse());
        for (const e of CHANGELOG) {
            expect(e.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
            expect(pageAt(changelogPath(e))?.unreviewed).toBe(true);
            if (e.try) expect(pageAt(e.try.href), e.try.href).toBeTruthy();
        }
    });
});

describe("content pages are held back until someone reads them", () => {
    it("guides and the changelog are all unreviewed", () => {
        for (const p of PAGES.filter((p) =>
            ["guide", "guides", "changelog"].includes(p.type),
        )) {
            expect(p.unreviewed, p.path).toBe(true);
            expect(p.title.length, p.path).toBeLessThanOrEqual(60);
        }
    });
});
