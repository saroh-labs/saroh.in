/** @vitest-environment jsdom */
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { NeedsYouItem } from "@/lib/home-words";
import { greeting, homeSummary } from "@/lib/home-words";

import { HomeCounts, NeedsYou } from "./needs-you";

/**
 * Home's "Needs you" (admin console redesign U10, R14): a row per kind
 * waiting, each linking to its fix already filtered, and one all-clear line
 * when nothing is.
 */

vi.mock("next/link", () => ({
    default: ({
        href,
        children,
        ...props
    }: {
        href: string;
        children: React.ReactNode;
    }) => (
        <a href={href} {...props}>
            {children}
        </a>
    ),
}));

afterEach(cleanup);

const NOW = new Date("2026-10-19T10:00:00Z");
const HOURS_AGO = (h: number) =>
    new Date(NOW.getTime() - h * 3_600_000).toISOString();

const EVERY: NeedsYouItem[] = [
    { kind: "billing", count: 2, at: HOURS_AGO(30) },
    { kind: "reports", count: 1, at: HOURS_AGO(2) },
    { kind: "help", count: 3, at: HOURS_AGO(1) },
    { kind: "sign-ups", count: 2, at: HOURS_AGO(48) },
    { kind: "jobs", count: 1, at: HOURS_AGO(5) },
];

describe("Needs you", () => {
    it("links each row to its fix", () => {
        render(<NeedsYou needs={EVERY} now={NOW} />);
        const section = screen.getByRole("region", { name: "Needs you" });
        const rows = within(section).getAllByRole("listitem");
        expect(rows).toHaveLength(5);

        const link = (name: string) =>
            within(section).getByRole("link", { name }).getAttribute("href");
        expect(link("Open Needs action")).toBe("/billing/actions");
        expect(link("Review it")).toBe("/reports");
        expect(link("Read them")).toBe("/messages?topic=help");
        expect(link("Help them")).toBe("/users?filter=no-business,unverified");
        expect(link("Open Jobs")).toBe("/operations/jobs?status=FAILED");

        expect(rows[0]?.textContent).toContain("2 billing problems need you");
        expect(rows[0]?.textContent).toContain("The oldest came in yesterday");
        expect(rows[3]?.textContent).toContain(
            "2 sign-ups are stuck before verifying their email",
        );
        expect(rows[4]?.textContent).toContain(
            "A job failed after every retry",
        );
    });

    it("is one all-clear line when nothing is waiting", () => {
        render(<NeedsYou needs={[]} now={NOW} />);
        const section = screen.getByRole("region", { name: "Needs you" });
        expect(section.textContent).toContain(
            "All clear: nothing needs you right now.",
        );
        expect(within(section).queryAllByRole("link")).toHaveLength(0);
        expect(within(section).queryAllByRole("listitem")).toHaveLength(0);
    });

    it("sums what needs you under the greeting", () => {
        const home = (needs: NeedsYouItem[]) => ({
            needs,
            checked: [],
            counts: {
                businesses: 0,
                businessesThisWeek: 0,
                noBusinessYet: 0,
                paying: null,
                jobsFailedToday: null,
            },
        });
        expect(homeSummary(home(EVERY))).toBe("9 things need you.");
        expect(homeSummary(home([EVERY[1]]))).toBe("1 thing needs you.");
        expect(homeSummary(home([]))).toBe(
            "Nothing needs you. Everything is running.",
        );
        // Someone who may not read the counts (an Account manager).
        expect(homeSummary(null)).toBe(
            "Use the menu or the search to find what you came for.",
        );
    });

    it("greets by India's clock", () => {
        // 10:00 UTC is 15:30 in India.
        expect(greeting(NOW)).toBe("Good afternoon");
        expect(greeting(new Date("2026-10-19T01:00:00Z"))).toBe("Good morning");
        expect(greeting(new Date("2026-10-19T14:00:00Z"))).toBe("Good evening");
    });
});

describe("Home's counts", () => {
    it("shows Paying and failed jobs only when the API sends them", () => {
        const { rerender } = render(
            <HomeCounts
                counts={{
                    businesses: 32,
                    businessesThisWeek: 3,
                    noBusinessYet: 4,
                    paying: null,
                    jobsFailedToday: null,
                }}
            />,
        );
        expect(screen.getByText("3 new this week")).toBeTruthy();
        expect(screen.queryByText("Paying")).toBeNull();
        expect(screen.queryByText("Jobs failed today")).toBeNull();

        rerender(
            <HomeCounts
                counts={{
                    businesses: 32,
                    businessesThisWeek: 3,
                    noBusinessYet: 4,
                    paying: 0,
                    jobsFailedToday: 1,
                }}
            />,
        );
        expect(screen.getByText("Paying")).toBeTruthy();
        expect(screen.getByText("Jobs failed today")).toBeTruthy();
    });
});
