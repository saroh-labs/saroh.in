// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { featureList } from "@/content/features";

import HowItWorksPage, { metadata } from "./page";

// The env every switch reads: unset is off outside `next dev`, so each test
// turns on what it draws.
const env = vi.hoisted((): Record<string, string | undefined> => ({}));
vi.mock("@/env", () => ({ env }));
vi.mock("@/lib/browser/env", () => ({ browserEnv: env }));
vi.mock("next/font/local", () => ({ default: () => ({ variable: "" }) }));
afterEach(() => {
    cleanup();
    for (const key of Object.keys(env)) delete env[key];
});

const page = () => render(<HowItWorksPage />);

describe("/features, How it works (boards HWDesk, HWPhone2)", () => {
    it("is indexed, with one h1", () => {
        expect(metadata.robots).toBeUndefined();
        page();
        expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    });

    it("lists only the shown features, and never a switched-off one", () => {
        const { container } = page();
        const shown = new Set(featureList.map((f) => `/features/${f.slug}`));
        for (const a of container.querySelectorAll('a[href^="/features/"]')) {
            expect(shown).toContain(a.getAttribute("href"));
        }
        // Social is off here: its chapter and its claims are not drawn.
        expect(
            screen.queryByRole("heading", { name: "Your posts." }),
        ).toBeNull();
        expect(container.textContent).not.toMatch(/Saroh Social/);
    });

    it("draws the posts chapter with its feature, and Saroh Social posting only behind its claim", () => {
        env.NEXT_PUBLIC_SOCIAL = "on";
        const { container, unmount } = page();
        expect(
            screen.getByRole("heading", { name: "Your posts." }),
        ).toBeTruthy();
        expect(container.textContent).not.toMatch(
            /post and schedule it for you/,
        );
        unmount();
        env.NEXT_PUBLIC_CLAIM_SOCIAL_POSTING = "on";
        const on = page();
        expect(on.container.textContent).toMatch(
            /post and schedule it for you/,
        );
    });

    it("asks in Hinglish or Hindi, and names Grow and Pro, only behind their claims", () => {
        env.NEXT_PUBLIC_ASK_AI = "on";
        const { container, unmount } = page();
        expect(container.textContent).not.toMatch(/Hinglish|Is hafte|शनिवार/);
        expect(container.textContent).not.toMatch(/Grow and Pro/);
        unmount();
        env.NEXT_PUBLIC_CLAIM_ASK_AI_LANGUAGES = "on";
        env.NEXT_PUBLIC_CLAIM_ASK_AI_PLANS = "on";
        const on = page();
        expect(on.container.textContent).toMatch(/Is hafte/);
        expect(on.container.textContent).toMatch(/On Grow and Pro\./);
    });

    it("groups the index the owner's way, in that order", () => {
        page();
        const index = screen
            .getByRole("heading", { name: "Every feature, in one list." })
            .closest("section");
        const groups = Array.from(
            index?.querySelectorAll("summary b") ?? [],
        ).map((b) => b.textContent);
        expect(groups).toEqual([
            "Your records",
            "Reaching customers",
            "Asking and connecting",
        ]);
    });

    it("tells how money moves, and that Saroh holds none of it", () => {
        page();
        const money = screen
            .getByRole("heading", { name: "Your money." })
            .closest("section");
        if (!money) throw new Error("no money section");
        expect(
            within(money).getByRole("figure", {
                name: "How the money moves, an example",
            }),
        ).toBeTruthy();
        expect(money.textContent).toMatch(/Holds nothing/);
    });
});
