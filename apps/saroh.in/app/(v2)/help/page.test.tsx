// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { AnchorHTMLAttributes } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { HELP_GROUPS } from "@/content/help";

import HelpPage from "./page";

/**
 * /help (plan U5): a 404 before Help's day in India; from that day the
 * published articles under their task groups, groups without one left
 * out, and the search over them.
 */
vi.mock("@/env", () => ({ env: {} }));
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
vi.mock("next/navigation", () => ({
    notFound: () => {
        throw new Error("NEXT_NOT_FOUND");
    },
}));

afterEach(() => {
    cleanup();
    vi.useRealTimers();
});

function renderAt(iso: string) {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(iso));
    return render(<HelpPage />);
}

describe("/help", () => {
    it("is a 404 at 23:59 in India on 16 Oct", () => {
        expect(() => renderAt("2026-10-16T18:29:00Z")).toThrow(
            "NEXT_NOT_FOUND",
        );
    });

    it("lists only groups with a published article, from 17 Oct", () => {
        renderAt("2026-10-16T18:31:00Z");
        expect(
            screen.getByRole("heading", { level: 1, name: "How can we help?" }),
        ).toBeTruthy();
        const groups = screen
            .getAllByRole("heading", { level: 3 })
            .map((h) => h.textContent);
        // In the home's order; a group with no article isn't drawn.
        expect(groups).toEqual(HELP_GROUPS.filter((g) => groups.includes(g)));
        expect(groups).toEqual([
            "Get set up",
            "Sell products",
            "Take orders",
            "Take bookings",
            "Get paid",
            "Monthly plans",
            "Your website",
            "Invoices and GST",
        ]);
        expect(
            screen
                .getByRole("link", { name: "Add your first product" })
                .getAttribute("href"),
        ).toBe("/help/add-your-first-product");
    });

    it("searches the published articles, and says who answers when nothing matches", () => {
        renderAt("2026-10-16T18:31:00Z");
        const box = screen.getByRole("searchbox", { name: "Search help" });
        fireEvent.change(box, { target: { value: "add prod" } });
        const results = screen.getByRole("list", { name: "Results" });
        expect(results.textContent).toContain("Add your first product");
        fireEvent.change(box, { target: { value: "rocket" } });
        expect(screen.getByText(/Nothing matches that yet/)).toBeTruthy();
    });
});
