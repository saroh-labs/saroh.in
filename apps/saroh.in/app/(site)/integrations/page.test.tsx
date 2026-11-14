// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { byComingGroup } from "@/content/coming";
import {
    integrationsIndex as page,
    plannedIntegrations,
    shownIntegrations,
} from "@/content/integrations";

import ProviderPage, { generateMetadata } from "./[provider]/page";
import IntegrationsPage, { metadata } from "./page";

// The switches this "build" has off: each test sets them (U7).
const switches = vi.hoisted(() => ({ off: [] as string[] }));
vi.mock("@/lib/feature-switches", () => ({ featuresOff: () => switches.off }));
vi.mock("@/env", () => ({ env: {} }));

afterEach(() => {
    cleanup();
    switches.off = [];
});

describe("/integrations", () => {
    it("has one H1 and its own canonical", () => {
        render(IntegrationsPage());
        expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
        expect(metadata.alternates?.canonical).toBe("/integrations");
        expect(metadata.description).toBeTruthy();
    });

    it("gives each shown card one link, to its page, and no second Connect", () => {
        const shown = shownIntegrations(switches.off);
        const { container } = render(IntegrationsPage());
        const cards = Array.from(container.querySelectorAll("li > a"));
        expect(cards.map((a) => a.getAttribute("href"))).toEqual(
            shown.map((i) => i.href),
        );
        cards.forEach((card, i) => {
            const item = shown[i];
            expect(card.textContent).toContain(item.cta);
            expect(card.textContent).toContain(item.connect);
            expect(card.textContent).not.toMatch(/\bConnect\b(?! in)/);
            expect(card.querySelectorAll("a, button")).toHaveLength(0);
        });
    });

    it("lists planned rows that never link", () => {
        render(IntegrationsPage());
        const section = screen
            .getByRole("heading", { name: "Planned · not available yet" })
            .closest("section");
        if (!section) throw new Error("no Planned section");
        const rows = within(section).getAllByRole("listitem");
        expect(rows).toHaveLength(plannedIntegrations.length);
        expect(section.querySelectorAll("a")).toHaveLength(0);
        for (const row of rows) {
            expect(row.textContent).toContain("Not available yet");
        }
    });

    it("draws each planned group's label once, over its rows, in order", () => {
        render(IntegrationsPage());
        const section = screen
            .getByRole("heading", { name: page.plannedTitle })
            .closest("section");
        if (!section) throw new Error("no Planned section");
        const labels = within(section).getAllByRole("heading", { level: 3 });
        expect(labels.map((h) => h.textContent)).toEqual([
            "Coming next",
            "Later",
        ]);
        const groups = byComingGroup(plannedIntegrations);
        const lists = within(section).getAllByRole("list");
        expect(lists).toHaveLength(groups.length);
        lists.forEach((list, i) => {
            const group = groups[i];
            expect(list.getAttribute("aria-labelledby")).toBe(labels[i].id);
            const rows = within(list).getAllByRole("listitem");
            // The changelog's layout: the label sits in the first row's
            // "when" column.
            expect(rows.map((row) => row.textContent)).toEqual(
                group.rows.map(
                    (item, row) =>
                        `${row === 0 ? group.label : ""}${item.name}${item.line}${page.notYet}`,
                ),
            );
        });
        // The label is said once, and nothing promises a date.
        expect(section.textContent.match(/Coming next/g)).toHaveLength(1);
        expect(section.textContent).not.toMatch(
            /20\d\d|Jan–Mar|Apr–Jun|Nov–Dec/,
        );
    });

    it("names no plan or price in the planned list, and no provider logo", () => {
        render(IntegrationsPage());
        const section = screen
            .getByRole("heading", { name: page.plannedTitle })
            .closest("section");
        if (!section) throw new Error("no Planned section");
        expect(section.textContent).not.toMatch(
            /every plan|free plan|\bplans?\b|\bgrow\b|\bpro\b|₹|\bprice/i,
        );
        expect(section.textContent).not.toMatch(
            /\bcsv\b|\bpixel\b|google analytics/i,
        );
        expect(section.querySelectorAll("img, svg")).toHaveLength(0);
    });
});

describe("/integrations with the AI apps switch", () => {
    function pageWith(aiApps: "on" | "off") {
        switches.off = aiApps === "on" ? [] : ["ai-apps"];
        return IntegrationsPage;
    }

    it("off: today's flat list, with no AI app and no group heading", () => {
        const Page = pageWith("off");
        const { container } = render(Page());
        expect(screen.getByText(page.intro)).toBeTruthy();
        expect(
            Array.from(container.querySelectorAll("li > a")).map((a) =>
                a.getAttribute("href"),
            ),
        ).toEqual([
            "/integrations/razorpay",
            "/integrations/cashfree",
            "/integrations/email",
        ]);
        expect(screen.queryByRole("heading", { name: "AI apps" })).toBeNull();
        expect(container.textContent).not.toMatch(/Claude|ChatGPT/);
    });

    it("on: the AI apps group first, a card per walked app, then Payments and email", () => {
        const Page = pageWith("on");
        const { container } = render(Page());
        expect(screen.getByText(page.introWithAi)).toBeTruthy();
        const groups = screen
            .getAllByRole("heading", { level: 2 })
            .map((h) => h.textContent);
        expect(groups.slice(0, 2)).toEqual(["AI apps", "Payments and email"]);
        const ai = screen
            .getByRole("heading", { name: "AI apps" })
            .closest("section");
        if (!ai) throw new Error("no AI apps group");
        expect(
            Array.from(ai.querySelectorAll("li > a")).map((a) =>
                a.getAttribute("href"),
            ),
        ).toEqual(["/integrations/claude", "/integrations/chatgpt"]);
        // The group's own link, to what AI apps can do.
        expect(
            within(ai)
                .getByRole("link", { name: /How AI apps work with Saroh/ })
                .getAttribute("href"),
        ).toBe("/features/ai-apps");
        // A card whose dev sign-in walk isn't done is never shown.
        expect(container.textContent).not.toMatch(/Perplexity|Zapier|n8n/);
    });
});

describe("shownIntegrations", () => {
    it("hides an AI app card until its dev sign-in walk, and the group while the switch is off", () => {
        const on = shownIntegrations([]).map((c) => c.slug);
        expect(on).toEqual([
            "claude",
            "chatgpt",
            "razorpay",
            "cashfree",
            "email",
        ]);
        expect(shownIntegrations(["ai-apps"]).map((c) => c.slug)).toEqual([
            "razorpay",
            "cashfree",
            "email",
        ]);
    });
});

describe("/integrations/[provider]", () => {
    it.each(["razorpay", "cashfree", "email", "claude", "chatgpt"])(
        "%s renders its steps and never links to itself",
        async (provider) => {
            const params = Promise.resolve({ provider });
            const { container } = render(await ProviderPage({ params }));
            expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(
                1,
            );
            const steps = within(
                screen.getByRole("list", { name: "Steps" }),
            ).getAllByRole("button");
            expect(steps.length).toBeGreaterThanOrEqual(3);
            expect(
                steps.filter((b) => b.getAttribute("aria-current") === "step"),
            ).toHaveLength(1);
            const hrefs = Array.from(container.querySelectorAll("a")).map((a) =>
                a.getAttribute("href"),
            );
            expect(hrefs).not.toContain(`/integrations/${provider}`);
            expect(hrefs).toContain("/integrations");
            const meta = await generateMetadata({ params });
            expect(meta.alternates?.canonical).toBe(
                `/integrations/${provider}`,
            );
            expect(meta.description).toBeTruthy();
        },
    );

    it("names no plan on any page", async () => {
        for (const provider of [
            "razorpay",
            "cashfree",
            "email",
            "claude",
            "chatgpt",
        ]) {
            const params = Promise.resolve({ provider });
            const { container } = render(await ProviderPage({ params }));
            expect(container.textContent).not.toMatch(
                /every plan|Free plan|Free included/i,
            );
            cleanup();
        }
    });
});

describe("/integrations/claude and /integrations/chatgpt", () => {
    it.each(["claude", "chatgpt"])(
        "%s sits under AI apps, points to what AI apps can do, and draws Saroh's own screens",
        async (provider) => {
            const params = Promise.resolve({ provider });
            const { container } = render(await ProviderPage({ params }));
            expect(container.textContent).toContain("AI apps");
            expect(
                screen
                    .getByRole("link", { name: /See what AI apps can do/ })
                    .getAttribute("href"),
            ).toBe("/features/ai-apps");
            const panels = Array.from(container.querySelectorAll("figure")).map(
                (f) => f.getAttribute("aria-label"),
            );
            expect(panels).toEqual([
                expect.stringMatching(
                    /^Step 1 in (Claude|ChatGPT) › Connectors$/,
                ),
                "Step 2 in Saroh › Sign in",
                "Step 3 in Saroh › Connect an app",
                "Step 4 in Saroh › Allow an app",
            ]);
            expect(container.textContent).toContain("https://mcp.saroh.in/mcp");
            // Unconfirmed third-party words stay out (plan: [CHECK] marks).
            expect(container.textContent).not.toMatch(
                /\[CHECK|Customize ›|Plugins/,
            );
        },
    );

    it("draws no link to a Help article that isn't live", async () => {
        const params = Promise.resolve({ provider: "claude" });
        const { container } = render(await ProviderPage({ params }));
        const hrefs = Array.from(container.querySelectorAll("a")).map((a) =>
            a.getAttribute("href"),
        );
        const { helpArticles } = await import("@/lib/help-docs");
        const exists = helpArticles().some((a) => a.slug === "connect-claude");
        if (!exists) expect(hrefs).not.toContain("/help/connect-claude");
        expect(hrefs).toContain("/integrations/chatgpt");
    });
});
