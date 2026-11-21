import { render, screen } from "@testing-library/react";
import type * as NextLink from "next/link";
import { describe, expect, it, vi } from "vitest";

import { AccountTabBar } from "./tab-bar";

/**
 * The tab bar's pending mark: while a pressed tab's page is on its way the
 * old page stays and a bar in the site's own accent shows under that tab
 * (never Saroh's colours). `SITE_ACCOUNT_AREA` is off locally, so this is
 * where it is seen.
 */

vi.mock("next/navigation", () => ({ usePathname: () => "/account" }));

let pendingHref: string | null = null;
vi.mock("next/link", async (importActual) => {
    const actual = await importActual<typeof NextLink>();
    const { createContext, createElement, useContext } = await import("react");
    const Href = createContext<string | null>(null);
    return {
        ...actual,
        default: (props: { href: string }) =>
            createElement(
                Href.Provider,
                { value: props.href },
                createElement(actual.default, props),
            ),
        useLinkStatus: () => ({ pending: useContext(Href) === pendingHref }),
    };
});

const tabs = [
    { key: "home" as const, label: "Home" },
    { key: "bookings" as const, label: "Bookings" },
];

describe("the account tab bar's pending mark", () => {
    it("shows nothing until a tab is pressed", () => {
        pendingHref = null;
        const { container } = render(<AccountTabBar tabs={tabs} />);
        expect(container.querySelector("[data-link-pending]")).toBeNull();
    });

    it("marks the pressed tab only, in the site's accent", () => {
        pendingHref = "/account/bookings";
        render(<AccountTabBar tabs={tabs} />);
        const pressed = screen.getByRole("link", { name: "Bookings" });
        const mark = pressed.querySelector("[data-link-pending]");
        expect(mark?.getAttribute("aria-hidden")).toBe("true");
        expect(mark?.className).toContain("bg-site-accent");
        expect(pressed.className).toContain("relative");
        expect(
            screen
                .getByRole("link", { name: "Home" })
                .querySelector("[data-link-pending]"),
        ).toBeNull();
    });
});
