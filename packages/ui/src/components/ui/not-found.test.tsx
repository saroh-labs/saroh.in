import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { NotFound } from "./not-found";

describe("NotFound", () => {
    it("names the page with a real heading and labels the region with it", () => {
        render(
            <NotFound
                title="Page not found"
                description="The link may be old."
                primary={{ href: "/", label: "Back to Home" }}
            />,
        );

        const heading = screen.getByRole("heading", {
            level: 1,
            name: "Page not found",
        });
        expect(
            screen.getByRole("region", { name: "Page not found" }),
        ).toContainElement(heading);
        expect(screen.getByText("404")).toBeInTheDocument();
        expect(screen.getByText("The link may be old.")).toBeInTheDocument();
    });

    it("offers the way on as links, at most a primary and a secondary", () => {
        render(
            <NotFound
                title="Page not found"
                description="The link may be old."
                primary={{ href: "/", label: "Go to the home page" }}
                secondary={{ href: "/help", label: "Help" }}
            />,
        );

        const links = screen.getAllByRole("link");
        expect(links).toHaveLength(2);
        expect(
            screen.getByRole("link", { name: "Go to the home page" }),
        ).toHaveAttribute("href", "/");
        expect(screen.getByRole("link", { name: "Help" })).toHaveAttribute(
            "href",
            "/help",
        );
        // Every action carries a visible keyboard focus, never `focus:`.
        for (const link of links) {
            expect(link.className).toContain("focus-visible:ring-2");
        }
    });

    it("draws a record's card with no eyebrow unless asked", () => {
        const { container } = render(
            <NotFound
                variant="card"
                title="No order here"
                description="It may be in another business."
                primary={{ href: "/commerce/orders", label: "Back to orders" }}
            />,
        );

        expect(container.querySelector("[data-not-found=card]")).not.toBeNull();
        expect(screen.queryByText("404")).toBeNull();
        expect(
            screen.getByRole("link", { name: "Back to orders" }),
        ).toHaveAttribute("href", "/commerce/orders");
    });

    it("can sit under a page that already has an h1, and hide the eyebrow", () => {
        render(
            <NotFound
                level={2}
                eyebrow={null}
                title="Page not found"
                description="The link may be old."
                primary={{ href: "/", label: "Back to Home" }}
                mark={<span>Saroh</span>}
            >
                <p>Reference: abc</p>
            </NotFound>,
        );

        expect(
            screen.getByRole("heading", { level: 2, name: "Page not found" }),
        ).toBeInTheDocument();
        expect(screen.queryByText("404")).toBeNull();
        expect(screen.getByText("Saroh")).toBeInTheDocument();
        expect(screen.getByText("Reference: abc")).toBeInTheDocument();
    });
});
