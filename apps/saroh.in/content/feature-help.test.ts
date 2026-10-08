import { describe, expect, it } from "vitest";

import { helpArticles } from "@/lib/help-docs";

import { FEATURE_HELP, featureHelpLinks } from "./feature-help";
import { summarise } from "./help";
import type { PublishContext } from "./resources";
import { FEATURE_SLUGS } from "./types";

/**
 * Features → Help (Resources plan U7): each feature page links its matching
 * Help articles, and only once they are shown (KTD-2), so no link reaches a
 * 404 before Help opens on 17 Oct.
 */

const ROUTES = ["/features/[slug]", "/help", "/help/[slug]"];
const at = (
    iso: string,
    over: Partial<PublishContext> = {},
): PublishContext => ({
    now: new Date(iso),
    preview: false,
    routes: ROUTES,
    ...over,
});
const BEFORE = "2026-10-16T18:29:59.999Z";
const AFTER = "2026-10-16T18:30:00.000Z";

const real = helpArticles();
const articles = real.map(summarise);

describe("FEATURE_HELP", () => {
    it("names only real articles, each with a How to line", () => {
        const slugs = new Set(real.map((a) => a.slug));
        for (const links of Object.values(FEATURE_HELP)) {
            for (const h of links) {
                expect(slugs).toContain(h.slug);
                expect(h.label).toMatch(/^How to /);
            }
        }
    });

    it("maps each feature to its article", () => {
        const map = Object.fromEntries(
            FEATURE_SLUGS.map((f) => [
                f,
                (FEATURE_HELP[f] ?? []).map((h) => h.slug),
            ]),
        );
        expect(map).toEqual({
            dashboard: [],
            products: ["add-your-first-product"],
            orders: ["take-your-first-order"],
            customers: [],
            bookings: ["set-your-teams-hours", "take-a-deposit-when-they-book"],
            subscriptions: ["set-up-a-monthly-plan"],
            billing: ["add-your-gstin"],
            insights: [],
        });
    });
});

describe("featureHelpLinks", () => {
    it("links nothing before Help publishes", () => {
        for (const f of FEATURE_SLUGS) {
            expect(featureHelpLinks(f, articles, at(BEFORE))).toEqual([]);
        }
    });

    it("links the articles from midnight in India on 17 Oct", () => {
        expect(featureHelpLinks("bookings", articles, at(AFTER))).toEqual([
            {
                href: "/help/set-your-teams-hours",
                label: "How to set your team's hours",
            },
            {
                href: "/help/take-a-deposit-when-they-book",
                label: "How to take a deposit when they book",
            },
        ]);
        expect(featureHelpLinks("insights", articles, at(AFTER))).toEqual([]);
    });

    it("a preview shows them early", () => {
        expect(
            featureHelpLinks(
                "products",
                articles,
                at(BEFORE, { preview: true }),
            ),
        ).toEqual([
            {
                href: "/help/add-your-first-product",
                label: "How to add your first product",
            },
        ]);
    });

    it("leaves out an article not published yet, or with no route built", () => {
        const later = articles.map((a) =>
            a.slug === "add-your-gstin" ? { ...a, publishOn: "2026-11-01" } : a,
        );
        expect(featureHelpLinks("billing", later, at(AFTER))).toEqual([]);
        expect(
            featureHelpLinks(
                "billing",
                articles,
                at(AFTER, { routes: ["/help"] }),
            ),
        ).toEqual([]);
        expect(
            featureHelpLinks(
                "billing",
                articles.filter((a) => a.slug !== "add-your-gstin"),
                at(AFTER),
            ),
        ).toEqual([]);
    });
});
