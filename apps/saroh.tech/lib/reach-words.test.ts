import { describe, expect, it } from "vitest";

import { aiAppsWords } from "@/content/reach-ai-apps";
import { askAiWords } from "@/content/reach-ask-ai";
import { socialWords } from "@/content/reach-social";
import { websiteWords } from "@/content/reach-website";

import { ONE_PERSON } from "../scripts/check-claims.mjs";

/**
 * The Reach and Ask pages' words (Website, Share and posts, Ask AI, AI
 * apps), with every claim switch on and off, held to the rules
 * `content.test.ts` holds saroh.tech's other words to.
 */
const both = [true, false];
const all = both.flatMap((on) =>
    both.map((other) => ({
        website: websiteWords({ shop: on, templates: other }),
        social: socialWords({
            everyPlan: on,
            posting: other,
            insights: on,
            askSocial: other,
        }),
        askAi: askAiWords({ stockOn: on }),
        aiApps: aiAppsWords(),
    })),
);
/** Every word a page can draw: the string values, never the keys. */
const strings = (v: unknown): string[] =>
    typeof v === "string"
        ? [v]
        : v && typeof v === "object"
          ? Object.entries(v).flatMap(([k, x]) =>
                k === "business" ? [] : strings(x),
            )
          : [];
// A look option carries its whole business (world facts, not words).
const text = JSON.stringify(all, (key, value: unknown) =>
    key === "business" ? undefined : value,
);
/**
 * Website's paid-plan facts, named as coming with paid plans (owner, 16 Nov
 * 2026): the own-domain card (#32) and approval by a reviewer (#33).
 */
const paidFacts =
    /Your own domain( comes with a paid plan\.)?|Comes with a paid plan\. Paid plans open soon\.|Approval before it goes live|Publishing needs approval|Reviewers come with paid plans\./g;
// Features alone names the provider, as "through your own Stripe" (KTD9).
const said = text
    .replace(/through your own Stripe/g, "")
    .replace(paidFacts, "");

describe("saroh.tech's Reach and Ask words", () => {
    it("stay out of what isn't true outside India", () => {
        expect(said).not.toMatch(
            /\b(GST|GSTIN|UPI|HSN|SAC|Razorpay|Cashfree|bills? of supply|Stripe|PayPal|SMS|pay link|deposits?|autopay|custom domain|your own domain|quotes?|estimates?|client pages?|approvals?|acceptance|any currency|see when|reminders?|Hinglish|Hindi|India)\b|₹|\+91/i,
        );
    });

    it("name no paid plan and count no packs while Global is Free only", () => {
        // Own domains are named as coming with paid plans (owner, 16 Nov 2026, #21).
        const domains =
            /A domain you own comes with paid plans(, which open soon)?|a domain you own once paid plans open|Then, with paid plans/g;
        expect(text.replace(domains, "").replace(paidFacts, "")).not.toMatch(
            /\bpaid plans?\b|\bupgrade\b|\bGrow\b|\bPro\b|\bpack(s|ages?)?\b/i,
        );
    });

    it("ask for one person", () => {
        for (const phrase of ONE_PERSON) expect(text).not.toMatch(phrase);
    });

    it("hold to the copy rules: no em dash, semicolon or banned word", () => {
        const sentences = strings(all)
            .filter((v) => v.includes(" "))
            .join("\n");
        expect(sentences).not.toMatch(/—|&mdash;|;/);
        expect(sentences).not.toMatch(
            /!|\b(please|simply|easy|oops|successfully|storefront|inventory|log in|login|slot)\b/i,
        );
    });
});
