/** @vitest-environment jsdom */
import {
    act,
    cleanup,
    fireEvent,
    render,
    screen,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { BillingToolbar } from "./billing-toolbar";
import { PlanChips, StatusCards } from "./status-cards";

/** The address the components read, changed by each test. */
const nav = { path: "/billing/subscriptions", search: "" };
const push = vi.fn();
const replace = vi.fn();
vi.mock("next/navigation", () => ({
    usePathname: () => nav.path,
    useSearchParams: () => new URLSearchParams(nav.search),
    useRouter: () => ({ push, replace, refresh: vi.fn() }),
}));
vi.mock("next/link", () => ({
    default: ({
        href,
        children,
        scroll: _scroll,
        ...props
    }: {
        href: string;
        children: React.ReactNode;
        scroll?: boolean;
    }) => (
        <a href={href} {...props}>
            {children}
        </a>
    ),
}));

const COUNTS = { paying: 4, failed: 1, trial: 2, ending: 1, ended: 3 };

beforeEach(() => {
    nav.path = "/billing/subscriptions";
    nav.search = "";
    push.mockReset();
    replace.mockReset();
});
afterEach(cleanup);

describe("Billing's status cards", () => {
    it("a card is a toggle: pressed, it filters; pressed again, it clears", () => {
        const { rerender } = render(
            <StatusCards mrrPaise={10_000} currency="INR" counts={COUNTS} />,
        );
        const paying = screen.getByRole("button", { name: /Paying/ });
        expect(paying.getAttribute("aria-pressed")).toBe("false");
        fireEvent.click(paying);
        expect(push).toHaveBeenLastCalledWith(
            "/billing/subscriptions?status=ACTIVE",
            { scroll: false },
        );

        // The address now has it on.
        nav.search = "status=ACTIVE";
        rerender(
            <StatusCards mrrPaise={10_000} currency="INR" counts={COUNTS} />,
        );
        const on = screen.getByRole("button", { name: /Paying/ });
        expect(on.getAttribute("aria-pressed")).toBe("true");
        expect(
            screen
                .getByRole("button", { name: /Ended/ })
                .getAttribute("aria-pressed"),
        ).toBe("false");
        fireEvent.click(on);
        expect(push).toHaveBeenLastCalledWith("/billing/subscriptions", {
            scroll: false,
        });
    });

    it("shows the month's total with its fine print behind ⓘ", () => {
        render(
            <StatusCards mrrPaise={12_345} currency="INR" counts={COUNTS} />,
        );
        expect(screen.getByText("A month, at list price")).toBeTruthy();
        expect(screen.getByText("₹123.45")).toBeTruthy();
        expect(
            screen.getByRole("button", { name: "What this counts" }),
        ).toBeTruthy();
    });
});

describe("plan and search combine", () => {
    it("a plan chip keeps the search", () => {
        nav.search = "q=pay_Abc123";
        render(
            <PlanChips
                plans={[
                    { key: "grow", name: "Grow", count: 2 },
                    { key: "pro", name: "Pro", count: 1 },
                ]}
            />,
        );
        const grow = screen.getByRole("button", { name: /Grow/ });
        expect(grow.getAttribute("aria-pressed")).toBe("false");
        fireEvent.click(grow);
        expect(push).toHaveBeenLastCalledWith(
            "/billing/subscriptions?q=pay_Abc123&plan=grow",
            { scroll: false },
        );
    });

    it("the search keeps the plan, and goes back to page one", () => {
        vi.useFakeTimers();
        try {
            nav.search = "plan=grow&page=3";
            render(<BillingToolbar counts={null} />);
            const box = screen.getByRole("searchbox");
            fireEvent.change(box, { target: { value: "sub_Abc123" } });
            act(() => {
                vi.advanceTimersByTime(500);
            });
            expect(replace).toHaveBeenLastCalledWith(
                "/billing/subscriptions?plan=grow&q=sub_Abc123",
                { scroll: false },
            );
        } finally {
            vi.useRealTimers();
        }
    });

    it("the tabs carry the search, and Needs action says what is open", () => {
        nav.search = "q=rye&plan=grow";
        render(
            <BillingToolbar
                counts={{
                    subscriptions: 9,
                    invoices: 7,
                    openActions: 2,
                    events: 5,
                }}
            />,
        );
        const invoices = screen.getByRole("link", { name: /Invoices/ });
        expect(invoices.getAttribute("href")).toBe("/billing/invoices?q=rye");
        const actions = screen.getByRole("link", { name: /Needs action/ });
        expect(actions.textContent).toContain("2 open");
        expect(
            screen
                .getByRole("link", { name: /Subscriptions/ })
                .getAttribute("aria-current"),
        ).toBe("page");
    });
});
