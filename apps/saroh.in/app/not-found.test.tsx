// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import type { AnchorHTMLAttributes, ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import NotFoundPage from "./not-found";

/** saroh.in's 404: home always, Help only once Help is published. */
vi.mock("next/link", () => ({
    default: ({
        href,
        children,
        ...props
    }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
        <a href={href} {...props}>
            {children}
        </a>
    ),
}));
vi.mock("@/components/v2/site-chrome", () => ({
    SiteChrome: ({ children }: { children: ReactNode }) => (
        <main>{children}</main>
    ),
}));
vi.mock("@/lib/resources-context", () => ({
    resourcesContext: () => ({ now: new Date(), preview: false, routes: [] }),
}));
const helpLive = vi.fn<() => boolean>();
vi.mock("@/lib/help-live", () => ({ helpLive: () => helpLive() }));

afterEach(cleanup);

describe("saroh.in 404", () => {
    it("names the page and leads home", () => {
        helpLive.mockReturnValue(false);
        render(<NotFoundPage />);

        expect(
            screen.getByRole("heading", { level: 1, name: "Page not found" }),
        ).toBeTruthy();
        expect(
            screen
                .getByRole("link", { name: "Go to the home page" })
                .getAttribute("href"),
        ).toBe("/");
        // Help isn't published yet: no link to a page that isn't there.
        expect(screen.queryByRole("link", { name: "Help" })).toBeNull();
    });

    it("offers Help once it is published", () => {
        helpLive.mockReturnValue(true);
        render(<NotFoundPage />);

        expect(
            screen.getByRole("link", { name: "Help" }).getAttribute("href"),
        ).toBe("/help");
    });
});
