// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { KEEP_WORDS } from "@/content/feature-keep";

import { KeepPage } from "./keep-page";

const env = vi.hoisted((): Record<string, string | undefined> => ({}));
vi.mock("@/env", () => ({ env }));
vi.mock("@/lib/browser/env", () => ({ browserEnv: env }));
vi.mock("@/lib/pricing", () => ({
    readLivePricing: () => Promise.resolve(null),
}));
afterEach(() => {
    cleanup();
    for (const key of Object.keys(env)) delete env[key];
});

describe("the Keep template (boards FODesk, FOPhone2)", () => {
    it("draws the Ask band only while Ask AI is on", async () => {
        render(await KeepPage({ slug: "orders" }));
        expect(
            screen.queryByRole("heading", { name: "Ask about your orders." }),
        ).toBeNull();
        cleanup();
        env.NEXT_PUBLIC_ASK_AI = "on";
        render(await KeepPage({ slug: "orders" }));
        expect(
            screen.getByRole("heading", { name: "Ask about your orders." }),
        ).toBeTruthy();
    });

    it("keeps the Hinglish answer and the plan names behind their claims", async () => {
        env.NEXT_PUBLIC_ASK_AI = "on";
        const off = render(await KeepPage({ slug: "orders" }));
        expect(off.container.textContent).not.toMatch(
            /Aaj ke liye|Grow and Pro/,
        );
        off.unmount();
        env.NEXT_PUBLIC_CLAIM_ASK_AI_LANGUAGES = "on";
        env.NEXT_PUBLIC_CLAIM_ASK_AI_STOCK = "on";
        env.NEXT_PUBLIC_CLAIM_ASK_AI_PLANS = "on";
        const on = render(await KeepPage({ slug: "orders" }));
        expect(on.container.textContent).toMatch(/Aaj ke liye/);
        expect(on.container.textContent).toMatch(/Ask AI, on Grow and Pro/);
    });

    it("puts every question and answer in the HTML", async () => {
        const { container } = render(await KeepPage({ slug: "orders" }));
        for (const f of KEEP_WORDS.orders.faq ?? []) {
            expect(container.textContent).toContain(f.q);
            expect(container.textContent).toContain(f.a);
        }
    });

    it("marks one word of the headline, on every Keep page", async () => {
        for (const slug of Object.keys(
            KEEP_WORDS,
        ) as (keyof typeof KEEP_WORDS)[]) {
            const { container, unmount } = render(await KeepPage({ slug }));
            const h1 = container.querySelectorAll("h1");
            expect(h1, slug).toHaveLength(1);
            expect(h1[0].querySelectorAll("span"), slug).toHaveLength(1);
            unmount();
        }
    });
});
