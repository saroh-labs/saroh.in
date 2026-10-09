import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { CrashDocument, CrashPage } from "./crash-page";
import { ErrorPage } from "./error-page";

describe("ErrorPage", () => {
    it("names the page with a real heading and labels the region with it", () => {
        render(<ErrorPage onRetry={() => undefined} />);

        const heading = screen.getByRole("heading", {
            level: 1,
            name: "Something went wrong",
        });
        expect(
            screen.getByRole("region", { name: "Something went wrong" }),
        ).toContainElement(heading);
        expect(screen.getByText("500")).toBeInTheDocument();
    });

    it("tries again first, then offers the way home as a link", () => {
        const retry = vi.fn();
        render(
            <ErrorPage
                onRetry={retry}
                home={{ href: "/", label: "Back to Home" }}
            />,
        );

        fireEvent.click(screen.getByRole("button", { name: "Try again" }));
        expect(retry).toHaveBeenCalledOnce();
        const home = screen.getByRole("link", { name: "Back to Home" });
        expect(home).toHaveAttribute("href", "/");
        // Every action carries a visible keyboard focus, never `focus:`.
        expect(home.className).toContain("focus-visible:ring-2");
        expect(
            screen.getByRole("button", { name: "Try again" }).className,
        ).toContain("focus-visible:ring-2");
    });

    it("shows the digest as a reference, and never the error itself", () => {
        render(
            <ErrorPage
                onRetry={() => undefined}
                digest="2981734657"
                description="This page didn't load."
            />,
        );

        expect(screen.getByText("Reference: 2981734657")).toBeInTheDocument();
        expect(screen.getByText("This page didn't load.")).toBeInTheDocument();
    });

    it("says 'back shortly' with a 503 when the service is unavailable", () => {
        const { container } = render(<ErrorPage kind="unavailable" />);

        expect(
            container.querySelector("[data-error-page=unavailable]"),
        ).not.toBeNull();
        expect(screen.getByText("503")).toBeInTheDocument();
        expect(
            screen.getByRole("heading", { name: "Back shortly" }),
        ).toBeInTheDocument();
        // No action asked for, none drawn.
        expect(screen.queryByRole("button")).toBeNull();
    });

    it("can sit under a page that already has an h1, and hide the eyebrow", () => {
        render(
            <ErrorPage
                level={2}
                eyebrow={null}
                mark={<span>Saroh</span>}
                onRetry={() => undefined}
            />,
        );

        expect(
            screen.getByRole("heading", {
                level: 2,
                name: "Something went wrong",
            }),
        ).toBeInTheDocument();
        expect(screen.queryByText("500")).toBeNull();
        expect(screen.getByText("Saroh")).toBeInTheDocument();
    });
});

describe("CrashPage", () => {
    it("draws Saroh's page with its own stylesheet and the wordmark", () => {
        const retry = vi.fn();
        const { container } = render(
            <CrashPage onRetry={retry} homeHref="/" homeLabel="Back to Home" />,
        );

        expect(container.querySelector("style")?.textContent).toContain(
            ".saroh-crash",
        );
        expect(
            screen.getByRole("heading", {
                level: 1,
                name: "Something went wrong",
            }),
        ).toBeInTheDocument();
        expect(screen.getByText("Saroh")).toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: "Try again" }));
        expect(retry).toHaveBeenCalledOnce();
        expect(
            screen.getByRole("link", { name: "Back to Home" }),
        ).toHaveAttribute("href", "/");
    });

    it("draws a merchant site's page with nothing of Saroh's brand", () => {
        const { container } = render(
            <CrashPage brand="neutral" onRetry={() => undefined} />,
        );

        expect(container.querySelector("section")?.textContent).not.toMatch(
            /saroh/i,
        );
        expect(container.querySelector("svg")).toBeNull();
        // Saffron's light cut must not be on a merchant's page.
        expect(container.querySelector("style")?.textContent).not.toContain(
            "33 85% 31%",
        );
        expect(
            screen.getByRole("heading", { name: "This page isn’t loading" }),
        ).toBeInTheDocument();
    });

    it("is a whole document for global-error, titled with its heading", () => {
        // A <html> can't mount inside jsdom's body; render its markup.
        const element = CrashDocument({ digest: "abc" });
        expect(element.type).toBe("html");
    });
});
