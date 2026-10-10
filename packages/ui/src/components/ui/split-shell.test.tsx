import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { SplitFooter, SplitPanel, SplitShell } from "./split-shell";

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
                <button type="button">Sign in</button>
            </SplitShell>,
        );

        expect(screen.getByRole("button", { name: "Sign in" })).toBeVisible();
    });

    it("renders the panel beside the form when there is one", () => {
        render(
            <SplitShell panel={<SplitPanel heading="One account" />}>
                <button type="button">Sign in</button>
            </SplitShell>,
        );

        expect(screen.getByText("One account")).toBeInTheDocument();
    });

    it("takes the panel away with display, not with a visually-hidden class", () => {
        const { container } = render(
            <SplitShell panel={<SplitPanel heading="One account" />}>
                <button type="button">Sign in</button>
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
                <button type="button">Sign in</button>
            </SplitShell>,
        );

        expect(container.querySelector("aside")).toBeNull();
    });

    it("names Saroh once, so a screen reader does not hear it twice", () => {
        render(
            <SplitShell>
                <button type="button">Sign in</button>
            </SplitShell>,
        );

        expect(screen.getAllByText("Saroh")).toHaveLength(1);
    });
});

/**
 * Privacy, Terms and Help had no link anywhere from signing up to Home (UX
 * audit, 10 Oct). The line sits in the FORM's column, because the panel is
 * gone on a phone.
 */
describe("SplitShell's footer line", () => {
    it("links to Privacy, Terms and Help under the form", () => {
        const { container } = render(
            <SplitShell panel={<SplitPanel heading="One account" />}>
                <button type="button">Sign in</button>
            </SplitShell>,
        );
        const nav = screen.getByRole("navigation", { name: "Legal and help" });

        // Help always has a page; Privacy and Terms from their days.
        expect(
            screen.getByRole("link", { name: "Help" }).getAttribute("href"),
        ).toMatch(/^https:\/\/(www|help)\.saroh\.in/);
        // Not in the half that disappears below 760px.
        expect(container.querySelector("aside")?.contains(nav)).toBe(false);
        expect(nav.closest(".hidden")).toBeNull();
    });

    it("draws the links it is given, in order", () => {
        render(
            <SplitFooter
                links={[
                    { label: "Privacy", href: "https://www.saroh.in/privacy" },
                    { label: "Terms", href: "https://www.saroh.in/terms" },
                    { label: "Help", href: "https://www.saroh.in/help" },
                ]}
            />,
        );

        expect(
            screen
                .getAllByRole("link")
                .map((a) => [a.textContent, a.getAttribute("href")]),
        ).toEqual([
            ["Privacy", "https://www.saroh.in/privacy"],
            ["Terms", "https://www.saroh.in/terms"],
            ["Help", "https://www.saroh.in/help"],
        ]);
    });

    it("draws nothing when there is no page to link to", () => {
        const { container } = render(<SplitFooter links={[]} />);

        expect(container).toBeEmptyDOMElement();
    });

    it("can be left off a screen that must not link out", () => {
        render(
            <SplitShell footer={null}>
                <button type="button">Sign in</button>
            </SplitShell>,
        );

        expect(screen.queryByRole("navigation")).toBeNull();
    });
});

describe("SplitPanel", () => {
    it("numbers the plan and marks the step the person is on", () => {
        render(
            <SplitPanel
                heading="Sell, take bookings, bill and run your website in one place."
                steps={[
                    "Make your account",
                    "Name your business",
                    "Pick what to do first",
                ]}
                currentStep={2}
            />,
        );
        const steps = screen.getAllByRole("listitem");

        expect(steps).toHaveLength(3);
        expect(steps[0]).toHaveTextContent("Done: Make your account");
        expect(steps[1]).toHaveTextContent("Now: Name your business");
        expect(steps[1]).toHaveAttribute("aria-current", "step");
        expect(steps[2]).toHaveTextContent("Next: Pick what to do first");
        expect(steps[2]).not.toHaveAttribute("aria-current");
    });

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
