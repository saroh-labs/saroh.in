// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { liveIntegrations, plannedIntegrations } from "@/content/integrations";

import ProviderPage, { generateMetadata } from "./[provider]/page";
import IntegrationsPage, { metadata } from "./page";

afterEach(cleanup);

describe("/integrations", () => {
    it("has one H1 and its own canonical", () => {
        render(IntegrationsPage());
        expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
        expect(metadata.alternates?.canonical).toBe("/integrations");
        expect(metadata.description).toBeTruthy();
    });

    it("gives each live card one link, to its page, and no second Connect", () => {
        const { container } = render(IntegrationsPage());
        const cards = Array.from(container.querySelectorAll("li > a"));
        expect(cards.map((a) => a.getAttribute("href"))).toEqual(
            liveIntegrations.map((i) => `/integrations/${i.slug}`),
        );
        cards.forEach((card, i) => {
            const item = liveIntegrations[i];
            expect(card.textContent).toContain(item.cta);
            expect(card.textContent).toContain(`Connect in ${item.where}`);
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
    });
});

describe("/integrations/[provider]", () => {
    it.each(["razorpay", "cashfree", "email"])(
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
        for (const provider of ["razorpay", "cashfree", "email"]) {
            const params = Promise.resolve({ provider });
            const { container } = render(await ProviderPage({ params }));
            expect(container.textContent).not.toMatch(
                /every plan|Free plan|Free included/i,
            );
            cleanup();
        }
    });
});
