/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { AnchorHTMLAttributes } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
    useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
    usePathname: () => "/businesses",
    useSearchParams: () => new URLSearchParams(),
}));
vi.mock("next/link", () => ({
    default: ({
        href,
        children,
        ...rest
    }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
        <a href={href} {...rest}>
            {children}
        </a>
    ),
}));

import type { BusinessRow } from "@/lib/businesses";

import { BusinessTable } from "./business-table";

const row = {
    id: "org_1",
    name: "Gulmohar Studio",
    slug: "gulmohar",
    lifecycleStatus: "ACTIVE",
    legalHold: false,
    attention: ["NO_ACTIVITY"],
    plan: null,
    effectivePlan: null,
    subscriptionStatus: null,
    enabledModules: [],
    members: 2,
    lastActiveAt: null,
} as unknown as BusinessRow;

afterEach(cleanup);

describe("BusinessTable (admin audit F1, F2, F9)", () => {
    it("opens the business from anywhere on the row, through its name's link", () => {
        render(<BusinessTable rows={[row]} range="Showing 1–1" />);
        const link = screen.getAllByRole("link", {
            name: /Gulmohar Studio/,
        })[0];
        const clicked = vi.fn((event: Event) => event.preventDefault());
        link.addEventListener("click", clicked);
        const cell = screen.getAllByText("2")[0];
        fireEvent.click(cell);
        expect(clicked).toHaveBeenCalledTimes(1);
        // A modified click is left to the browser.
        fireEvent.click(cell, { metaKey: true });
        expect(clicked).toHaveBeenCalledTimes(1);
    });

    it("draws one count and no second pager", () => {
        render(<BusinessTable rows={[row]} range="Showing 1–1" />);
        expect(screen.getAllByText("Showing 1–1").length).toBeGreaterThan(0);
        expect(screen.queryByText(/Rows per page/)).toBeNull();
    });

    it("says Never active, not a 7-day gap, for a business never used", () => {
        render(<BusinessTable rows={[row]} range="Showing 1–1" />);
        expect(screen.getAllByText("Never active").length).toBeGreaterThan(0);
    });
});
