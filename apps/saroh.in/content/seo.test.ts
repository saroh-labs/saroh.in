import { describe, expect, it } from "vitest";

import { DESCRIPTION_MAX, pageTitle, TITLE_MAX } from "@/lib/seo";

import { ABOUT } from "./about";
import { CHANGELOG } from "./changelog";
import { CONTACT_PAGE } from "./contact-page";
import { CUSTOMERS } from "./customers";
import { featureList } from "./features";
import { home } from "./home";
import { integrationsIndex } from "./integrations";
import { linkPreview } from "./link-preview";
import { qrCodeMaker } from "./qr-code-maker";
import { solutionList } from "./solutions";
import { WAITLIST_PAGE } from "./waitlist";

/**
 * What every main page says to a search engine (12 Oct 2026): a title that
 * leads with the plain thing someone searches for and ends with the brand,
 * and one sentence under it. An SEO audit found slogans for titles, the
 * page's own lead reused as a 200-character description, three title
 * patterns and the brand twice in one title; this pins the rules that
 * replaced them.
 */
interface Listed {
    path: string;
    title: string;
    description: string;
    /** The category phrase, where the page's content names one. */
    phrase?: string;
    /** The words a visitor reads first (eyebrow, headline, lead). */
    firstScreen?: string;
}

const PAGES: Listed[] = [
    {
        path: "/",
        title: pageTitle(home.seoTitle),
        description: home.seoDescription,
        phrase: home.phrase,
        firstScreen: `${home.eyebrow} ${home.headlineLabel} ${home.sub}`,
    },
    ...featureList.map((f) => ({
        path: `/features/${f.slug}`,
        title: pageTitle(f.seoTitle),
        description: f.seoDescription,
        phrase: f.phrase,
        firstScreen: `${f.headline} ${f.sub}`,
    })),
    ...solutionList.map((s) => ({
        path: `/solutions/${s.slug}`,
        title: pageTitle(s.seoTitle),
        description: s.seoDescription,
        phrase: s.phrase,
        firstScreen: `${s.headline} ${s.sub}`,
    })),
    {
        path: "/integrations",
        title: integrationsIndex.seo.title,
        description: integrationsIndex.seo.description,
    },
    {
        path: "/tools/link-preview",
        title: linkPreview.metaTitle,
        description: linkPreview.metaDescription,
    },
    {
        path: "/tools/qr-code-maker",
        title: qrCodeMaker.metaTitle,
        description: qrCodeMaker.metaDescription,
    },
    {
        path: "/about",
        title: ABOUT.seo.title,
        description: ABOUT.seo.description,
    },
    {
        path: "/contact",
        title: CONTACT_PAGE.seo.title,
        description: CONTACT_PAGE.seo.description,
    },
    {
        path: "/changelog",
        title: CHANGELOG.metaTitle,
        description: CHANGELOG.metaDescription,
    },
    {
        path: "/customers",
        title: CUSTOMERS.seoTitle,
        description: CUSTOMERS.description,
    },
    {
        path: "/waitlist",
        title: WAITLIST_PAGE.seoTitle,
        description: WAITLIST_PAGE.seoDescription,
    },
];

const lower = (text: string) => text.toLowerCase();

describe("search titles and descriptions", () => {
    it("covers Home, the nine features, the four solutions and the pages beside them", () => {
        expect(PAGES).toHaveLength(1 + 9 + 4 + 8);
    });

    it.each(PAGES)("$path: the title fits, with the brand once, last", (p) => {
        expect(p.title.length, p.title).toBeLessThanOrEqual(TITLE_MAX);
        expect(p.title.endsWith(" · Saroh"), p.title).toBe(true);
        expect(p.title.match(/Saroh/g), p.title).toHaveLength(1);
        // One separator before the brand: no dash, no second dot.
        expect(p.title, p.title).not.toMatch(/[—–|]/);
        expect(p.title.match(/ · /g), p.title).toHaveLength(1);
    });

    it.each(PAGES)("$path: the description is one sentence that fits", (p) => {
        const d = p.description;
        expect(d.length, d).toBeLessThanOrEqual(DESCRIPTION_MAX);
        expect(d.length, d).toBeGreaterThanOrEqual(70);
        expect(d.endsWith("."), d).toBe(true);
        // One sentence: no full stop, question or exclamation mark inside.
        expect(d.slice(0, -1), d).not.toMatch(/[.?!]\s/);
        expect(d, d).not.toMatch(/[—–!]/);
    });

    it("no two pages share a title or a description", () => {
        expect(new Set(PAGES.map((p) => lower(p.title))).size).toBe(
            PAGES.length,
        );
        expect(new Set(PAGES.map((p) => lower(p.description))).size).toBe(
            PAGES.length,
        );
    });

    it("names no price and no plan: the site is in waitlist mode until launch", () => {
        for (const p of PAGES) {
            const said = `${p.title} ${p.description}`;
            expect(said, p.path).not.toMatch(/₹|Rs\.?\s?\d|INR|\d\s?%/);
            expect(said, p.path).not.toMatch(
                /\b(pricing|priced?|plans?|Grow|Pro|trial|upgrade|cheap|affordable)\b/,
            );
            // "Free" of a free tool or a free time, never of a plan.
            expect(said, p.path).not.toMatch(
                /\bfree (plan|to start|forever)|for free|start free/i,
            );
        }
    });

    it("claims no rank, count or customer", () => {
        for (const p of PAGES) {
            expect(`${p.title} ${p.description}`, p.path).not.toMatch(
                /\b(best|leading|trusted|award|#1|No\. ?1|thousands|millions|\d+\+)\b/i,
            );
        }
    });
});

describe("the category phrase", () => {
    const withPhrase = PAGES.filter(
        (p): p is Listed & { phrase: string; firstScreen: string } =>
            p.phrase !== undefined && p.firstScreen !== undefined,
    );

    it("is on Home, every feature and every solution", () => {
        expect(withPhrase).toHaveLength(1 + 9 + 4);
    });

    it.each(withPhrase)(
        "$path: the title leads with it and the description opens with it",
        (p) => {
            expect(lower(p.title).startsWith(lower(p.phrase)), p.title).toBe(
                true,
            );
            // After at most an article: "A website builder for …".
            expect(
                lower(p.description).replace(/^(a|an|the) /, ""),
                p.description,
            ).toSatisfy((d: string) => d.startsWith(lower(p.phrase)));
        },
    );

    it.each(withPhrase)(
        "$path: the first screen says it in plain words",
        (p) => {
            expect(lower(p.firstScreen)).toContain(lower(p.phrase));
        },
    );

    it("no two pages own the same phrase, and none sits inside another's", () => {
        const phrases = withPhrase.map((p) => lower(p.phrase));
        expect(new Set(phrases).size).toBe(phrases.length);
        for (const a of phrases) {
            for (const b of phrases) {
                if (a !== b) expect(b.includes(a), `${a} in ${b}`).toBe(false);
            }
        }
    });

    it("a feature owns the software, a solution the software for a trade", () => {
        for (const s of solutionList) {
            expect(s.seoTitle, s.slug).toMatch(/software/);
            // Its trade is in the phrase: shops, salons, gym, clinic.
            expect(s.phrase, s.slug).toMatch(/shop|salon|gym|clinic/);
        }
        for (const f of featureList) {
            expect(f.phrase, f.slug).not.toMatch(
                /shop|salon|gym|studio|clinic|bakery|parlour/,
            );
        }
    });
});

describe("Home and the waitlist", () => {
    it("do not share one h1", () => {
        expect(WAITLIST_PAGE.h1).not.toBe(home.headlineLabel);
        expect(lower(WAITLIST_PAGE.h1)).not.toContain("handled");
    });
});
