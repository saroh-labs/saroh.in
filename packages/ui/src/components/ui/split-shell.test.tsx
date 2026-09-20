import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { SplitPanel, SplitShell } from "./split-shell";

/**
 * What these assert is the ONE rule the shell exists to keep: the panel is a
 * second voice, never the only one. Everything else here is layout, and layout
 * is checked by opening the page.
 *
 * What they cannot assert is the breakpoint itself. This package runs jsdom,
 * which evaluates no media queries, so no assertion here can tell a panel that
 * is gone at 375px from one that is not. The test checks the TREATMENT — that
 * disappearing is `display:none` and not a visually-hidden class that keeps
 * reading the panel aloud to the people who cannot see it — and the boundary
 * is verified in a browser.
 */
describe("SplitShell", () => {
    it("renders the form it is given", () => {
        render(
            <SplitShell>
                <button type="button">Log in</button>
            </SplitShell>,
        );

        expect(screen.getByRole("button", { name: "Log in" })).toBeVisible();
    });

    it("renders the panel beside the form when there is one", () => {
        render(
            <SplitShell panel={<SplitPanel heading="One account" />}>
                <button type="button">Log in</button>
            </SplitShell>,
        );

        expect(screen.getByText("One account")).toBeInTheDocument();
    });

    it("takes the panel away with display, not with a visually-hidden class", () => {
        const { container } = render(
            <SplitShell panel={<SplitPanel heading="One account" />}>
                <button type="button">Log in</button>
            </SplitShell>,
        );
        const aside = container.querySelector("aside");

        expect(aside?.className).toContain("hidden");
        expect(aside?.className).not.toContain("sr-only");
        expect(aside?.className).not.toContain("opacity-0");
    });

    it("gives the form the whole width when there is no panel", () => {
        const { container } = render(
            <SplitShell>
                <button type="button">Log in</button>
            </SplitShell>,
        );

        expect(container.querySelector("aside")).toBeNull();
    });

    it("names Saroh once, so a screen reader does not hear it twice", () => {
        render(
            <SplitShell>
                <button type="button">Log in</button>
            </SplitShell>,
        );

        expect(screen.getAllByText("Saroh")).toHaveLength(1);
    });
});

describe("SplitPanel", () => {
    it("renders each point it is given", () => {
        render(
            <SplitPanel
                eyebrow="Welcome back"
                heading="One account, every business"
                body="Switch between them from the top of the workspace."
                points={[
                    "A bookkeeper can hold read-only access",
                    "Nothing is shared except you",
                ]}
            />,
        );

        expect(screen.getByText("Welcome back")).toBeVisible();
        expect(screen.getAllByRole("listitem")).toHaveLength(2);
    });

    it("renders a heading alone when that is all there is", () => {
        render(<SplitPanel heading="One account" />);

        expect(screen.getByText("One account")).toBeVisible();
        expect(screen.queryByRole("list")).toBeNull();
    });
});
