// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { helpArticles } from "@/lib/help-docs";

import { HelpStep } from "./help-step";

/** A step draws one picture: a capture, a pending frame, a drawing, or app cards (U9). */
afterEach(cleanup);

const article = (slug: string) => {
    const a = helpArticles().find((x) => x.slug === slug);
    if (!a) throw new Error(`${slug} is missing`);
    return a;
};

describe("HelpStep", () => {
    it("draws a captured shot as today", () => {
        const { container } = render(
            <HelpStep step={article("connect-razorpay").steps[0]} index={0} />,
        );
        expect(container.querySelector("img")?.getAttribute("src")).toMatch(
            /^\/shots\/help\//,
        );
    });

    it("draws a pending shot as a frame named by its caption", () => {
        const step = { ...article("connect-claude").steps[0] };
        step.shot = "help-not-captured-1";
        render(<HelpStep step={step} index={0} />);
        expect(screen.getByRole("img", { name: step.caption })).toBeTruthy();
    });

    it("draws another app's screen as a captioned drawing, all text", () => {
        const step = article("connect-claude").steps[1];
        const { container } = render(<HelpStep step={step} index={1} />);
        expect(step.panel?.kind).toBe("form");
        expect(container.querySelector("figcaption")?.textContent).toMatch(
            /^A drawing of Claude's/,
        );
        expect(container.querySelector("img")).toBeNull();
        expect(container.textContent).toContain("https://mcp.saroh.in/mcp");
    });

    it("draws app cards at their anchors, with the step's own anchor", () => {
        const steps = article("connect-other-ai-apps").steps;
        const { container } = render(
            <>
                <HelpStep step={steps[1]} index={1} />
                <HelpStep step={steps[3]} index={3} />
            </>,
        );
        for (const id of ["perplexity", "le-chat", "coding-tools", "cursor"]) {
            expect(container.querySelector(`#${id}`), id).not.toBeNull();
        }
        expect(container.textContent).toContain(
            "claude mcp add --transport http saroh https://mcp.saroh.in/mcp",
        );
    });
});
