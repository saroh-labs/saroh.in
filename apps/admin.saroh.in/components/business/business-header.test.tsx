/** @vitest-environment jsdom */
import {
    cleanup,
    fireEvent,
    render,
    screen,
    waitFor,
    within,
} from "@testing-library/react";
import type { AnchorHTMLAttributes, ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const segments = vi.hoisted(() => ({ value: [] as string[] }));
const toast = vi.hoisted(() => ({ showSuccess: vi.fn(), showError: vi.fn() }));

vi.mock("next/navigation", () => ({
    useSelectedLayoutSegments: () => segments.value,
    useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));
vi.mock("next/link", () => ({
    default: ({
        href,
        children,
        scroll: _scroll,
        ...rest
    }: AnchorHTMLAttributes<HTMLAnchorElement> & {
        href: string;
        scroll?: boolean;
    }) => (
        <a href={href} {...rest}>
            {children}
        </a>
    ),
}));
vi.mock("@/lib/business-actions", () => ({
    openAccessAction: vi.fn(),
    closeAccessAction: vi.fn(),
    suspendAction: vi.fn(),
    reinstateAction: vi.fn(),
    scheduleDeletionAction: vi.fn(),
    placeLegalHoldAction: vi.fn(),
    liftLegalHoldAction: vi.fn(),
}));
vi.mock("@saroh/ui/toast", () => toast);
// The ⋯ menu, open in place: its rows are what a press would show.
vi.mock("@saroh/ui/dropdown-menu", () => ({
    DropdownMenu: ({ children }: { children: ReactNode }) => <>{children}</>,
    DropdownMenuTrigger: ({ children }: { children: ReactNode }) => (
        <>{children}</>
    ),
    DropdownMenuContent: ({ children }: { children: ReactNode }) => (
        <div role="menu">{children}</div>
    ),
    DropdownMenuItem: ({
        children,
        onSelect,
    }: {
        children: ReactNode;
        onSelect?: () => void;
    }) => (
        <button type="button" role="menuitem" onClick={() => onSelect?.()}>
            {children}
        </button>
    ),
    DropdownMenuLabel: ({ children }: { children: ReactNode }) => (
        <p>{children}</p>
    ),
    DropdownMenuSeparator: () => null,
}));

import type { BusinessRow } from "@/lib/businesses";

import { BusinessHeader } from "./business-header";

const summary: BusinessRow = {
    id: "org_1",
    name: "Rye Bakery",
    slug: "rye-bakery",
    lifecycleStatus: "ACTIVE",
    legalHold: false,
    createdAt: "2026-09-01T00:00:00.000Z",
    members: 3,
    enabledModules: ["MODULE_COMMERCE"],
    plan: null,
    effectivePlan: null,
    subscriptionStatus: null,
    lastActiveAt: null,
    attention: ["BILLING_ACTION"],
};

const nobody = { canViewAs: false, canLifecycle: false, canLiftHold: false };

const menuRows = () =>
    within(screen.getByRole("menu"))
        .queryAllByRole("menuitem")
        .map((row) => row.textContent.trim());

beforeEach(() => {
    segments.value = ["(tabs)", "overview"];
    toast.showSuccess.mockReset();
    toast.showError.mockReset();
});
afterEach(cleanup);

describe("BusinessHeader", () => {
    it("names the business, its state and what needs attention", () => {
        render(
            <BusinessHeader summary={summary} session="closed" {...nobody} />,
        );
        expect(
            screen.getByRole("heading", { level: 1, name: "Rye Bakery" }),
        ).toBeTruthy();
        expect(screen.getByText("Active")).toBeTruthy();
        expect(screen.getByText("Billing needs action")).toBeTruthy();
        expect(screen.getByText(/3 people · last active/)).toBeTruthy();
    });

    it("offers only Copy id in ⋯ to staff who may not change its state", () => {
        render(
            <BusinessHeader summary={summary} session="closed" {...nobody} />,
        );
        expect(
            screen.getByRole("button", { name: "More actions" }),
        ).toBeTruthy();
        expect(menuRows()).toEqual(["Copy id"]);
    });

    it("adds Suspend… and Schedule deletion… for staff who may", () => {
        render(
            <BusinessHeader
                summary={summary}
                session="closed"
                {...nobody}
                canLifecycle
            />,
        );
        expect(menuRows()).toEqual([
            "Copy id",
            "Suspend…",
            "Schedule deletion…",
        ]);
    });

    it("offers Lift legal hold… only to staff who may lift one", () => {
        const held: BusinessRow = {
            ...summary,
            lifecycleStatus: "SUSPENDED",
            legalHold: true,
        };
        render(
            <BusinessHeader
                summary={held}
                session="closed"
                {...nobody}
                canLifecycle
            />,
        );
        expect(menuRows()).toEqual(["Copy id"]);
        expect(screen.getAllByText("Legal hold").length).toBeGreaterThan(0);
        cleanup();
        render(
            <BusinessHeader
                summary={held}
                session="closed"
                {...nobody}
                canLifecycle
                canLiftHold
            />,
        );
        expect(menuRows()).toEqual(["Copy id", "Lift legal hold…"]);
    });

    it("copies the business's id", async () => {
        const writeText = vi.fn().mockResolvedValue(undefined);
        Object.defineProperty(navigator, "clipboard", {
            value: { writeText },
            configurable: true,
        });
        render(
            <BusinessHeader summary={summary} session="closed" {...nobody} />,
        );
        fireEvent.click(screen.getByRole("menuitem", { name: "Copy id" }));
        await waitFor(() => expect(writeText).toHaveBeenCalledWith("org_1"));
        await waitFor(() =>
            expect(toast.showSuccess).toHaveBeenCalledWith("Copied the id"),
        );
    });

    it("offers View as the business… or Close support access, only with view-as", () => {
        render(
            <BusinessHeader summary={summary} session="closed" {...nobody} />,
        );
        expect(
            screen.queryByRole("button", { name: "View as the business…" }),
        ).toBeNull();
        cleanup();
        render(
            <BusinessHeader
                summary={summary}
                session="closed"
                {...nobody}
                canViewAs
            />,
        );
        expect(
            screen.getByRole("button", { name: "View as the business…" }),
        ).toBeTruthy();
        cleanup();
        render(
            <BusinessHeader
                summary={summary}
                session="open"
                {...nobody}
                canViewAs
            />,
        );
        expect(
            screen.getByRole("button", { name: "Close support access" }),
        ).toBeTruthy();
        expect(
            screen.queryByRole("button", { name: "View as the business…" }),
        ).toBeNull();
    });

    it("links each tab to its own address, in order", () => {
        render(
            <BusinessHeader summary={summary} session="closed" {...nobody} />,
        );
        const nav = screen.getByRole("navigation", {
            name: "Business sections",
        });
        const links = within(nav)
            .getAllByRole("link")
            .map((a) => [a.textContent.trim(), a.getAttribute("href")]);
        expect(links).toEqual([
            ["Overview", "/businesses/org_1/overview"],
            ["Modules", "/businesses/org_1/modules"],
            ["Billing", "/businesses/org_1/billing"],
            ["Website and payments", "/businesses/org_1/website"],
            ["Team", "/businesses/org_1/team"],
            ["Notes", "/businesses/org_1/notes"],
            ["History", "/businesses/org_1/history"],
        ]);
    });

    it("marks the open tab from the address, skipping the route group", () => {
        segments.value = ["(tabs)", "billing"];
        render(
            <BusinessHeader summary={summary} session="closed" {...nobody} />,
        );
        const current = screen
            .getAllByRole("link")
            .filter((a) => a.getAttribute("aria-current") === "page");
        expect(current.map((a) => a.textContent.trim())).toEqual(["Billing"]);
    });

    it("shows a tab's badge when one is given", () => {
        render(
            <BusinessHeader
                summary={summary}
                session="closed"
                {...nobody}
                badges={{
                    billing: { count: 1, tone: "strong", says: "needs you" },
                }}
            />,
        );
        const billing = screen.getByRole("link", { name: /Billing/ });
        expect(billing.textContent).toContain("1");
    });
});
