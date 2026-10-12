// @vitest-environment jsdom
/**
 * The Plans tab on a plan without memberships (6 Oct 2026): the notice,
 * with the way up; the plans stay listed to open, edit and archive, but
 * nothing new goes on sale — no "New plan", no "Sell again", and archiving
 * offers no Undo (it would sell the plan again). Unlocked, the tab offers
 * Sell again and Undo as it always did.
 *
 * Plans are rows of the shared list now (Subscriptions audit, 12 Oct
 * 2026): Edit, Archive and Sell again are in each row's menu, drawn here
 * in place (the product's menu opens in a portal).
 *
 * `react-dom/client` + `act` directly, as the editor's tests do.
 */
import type { AnchorHTMLAttributes, ReactNode } from "react";
import { act } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { OnlinePaymentsLock } from "@/lib/billing/access";
import type { Plan } from "@/lib/subscriptions/service";

import { PlansTab } from "./plans-tab";

const actions = vi.hoisted(() => ({ setPlanArchived: vi.fn() }));
vi.mock("@/lib/subscriptions/actions", () => actions);
// The notice's and the rate step's Server Actions reach the API.
vi.mock("@/lib/gst-rates/actions", () => ({
    saveGstRates: vi.fn(),
    loadMissingRates: vi.fn(),
}));
vi.mock("next/navigation", () => ({
    useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
    unstable_rethrow: () => undefined,
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
// The row menu, open in place: its items are what a press would show.
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
        asChild,
        disabled,
        onSelect,
    }: {
        children: ReactNode;
        asChild?: boolean;
        disabled?: boolean;
        onSelect?: () => void;
    }) =>
        asChild ? (
            <>{children}</>
        ) : (
            <button
                type="button"
                role="menuitem"
                disabled={disabled}
                onClick={onSelect}
            >
                {children}
            </button>
        ),
}));
const toast = vi.hoisted(() => ({
    showError: vi.fn(),
    showSuccess: vi.fn(),
    showUndo: vi.fn(),
    dismissToasts: vi.fn(),
}));
vi.mock("@saroh/ui/toast", () => toast);

/** Words as `membershipPlansLock` gives them, plan names made up. */
const LOCK: OnlinePaymentsLock = {
    title: "Memberships come with Plan B",
    body: "You're on Plan A. Members you already have keep renewing. Your plans stay here to edit or archive, but they're off your site, and new plans can't go on sale until you move to Plan B.",
    cta: "See Plan B",
    href: "/settings/billing?plan=b#change-plan",
};

function plan(over: Partial<Plan> = {}): Plan {
    return {
        id: "plan_1",
        name: "Monthly",
        description: null,
        price: "1200.00",
        currency: "INR",
        interval: "MONTH",
        status: "ACTIVE",
        classesPerMonth: null,
        subscriberCount: 3,
        byPrice: [],
        monthly: "1200.00",
        monthlyFromMembers: "3600.00",
        createdAt: "2026-09-01T00:00:00Z",
        ...over,
    };
}

const BOTH = () => [
    plan(),
    plan({ id: "plan_2", name: "Yearly", status: "ARCHIVED" }),
];

let root: Root;
let host: HTMLDivElement;

beforeEach(() => {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    window.history.replaceState(null, "", "/billing/subscriptions?tab=plans");
    actions.setPlanArchived.mockResolvedValue({ ok: true, data: {} });
});

afterEach(() => {
    act(() => root.unmount());
    host.remove();
    vi.clearAllMocks();
});

/** Every plan is listed, whatever its status: the "all" view. */
function tab(plans: Plan[], locked: OnlinePaymentsLock | null) {
    act(() =>
        root.render(
            <PlansTab
                plans={plans}
                canWrite
                showClasses={false}
                locked={locked}
                initialView="all"
            />,
        ),
    );
}

const buttons = () =>
    Array.from(host.querySelectorAll("a, button")).map((b) =>
        b.textContent.trim(),
    );

const item = (name: string) =>
    Array.from(
        host.querySelectorAll<HTMLButtonElement>('tbody [role="menuitem"]'),
    ).find((b) => b.textContent === name);

describe("the Plans tab without memberships on the plan", () => {
    it("says so with the way up, and offers no new plan", () => {
        tab(BOTH(), LOCK);
        const notice = host.querySelector('[role="status"]');
        expect(notice?.textContent).toContain("Memberships come with Plan B");
        expect(notice?.textContent).toContain(
            "Members you already have keep renewing.",
        );
        const way = host.querySelector<HTMLAnchorElement>(
            'a[href="/settings/billing?plan=b#change-plan"]',
        );
        expect(way?.textContent).toBe("See Plan B");
        expect(buttons()).not.toContain("New plan");
    });

    it("keeps the plans listed to edit and archive, without Sell again", () => {
        tab(BOTH(), LOCK);
        expect(host.querySelectorAll("tbody tr")).toHaveLength(2);
        const all = buttons();
        expect(all.filter((b) => b === "Edit")).toHaveLength(2);
        expect(all).toContain("Archive");
        expect(all).not.toContain("Sell again");
    });

    it("archives without an Undo, which would sell it again", async () => {
        tab([plan()], LOCK);
        act(() => item("Archive")?.click());
        await act(() => Promise.resolve());
        expect(actions.setPlanArchived).toHaveBeenCalledWith("plan_1", true);
        expect(toast.showSuccess).toHaveBeenCalledWith(
            "Monthly archived. Its 3 subscribers carry on, and nobody new can join.",
        );
        expect(toast.showUndo).not.toHaveBeenCalled();
    });

    it("with no plans, makes none", () => {
        tab([], LOCK);
        expect(host.textContent).toContain("No plans yet");
        expect(buttons()).not.toContain("New plan");
    });
});

describe("the Plans tab with memberships on the plan", () => {
    it("is as it was: Sell again, Undo, no notice", async () => {
        tab(BOTH(), null);
        expect(host.querySelector('[role="status"]')).toBeNull();
        expect(buttons()).toContain("Sell again");
        act(() => item("Archive")?.click());
        await act(() => Promise.resolve());
        expect(actions.setPlanArchived).toHaveBeenCalledWith("plan_1", true);
        expect(toast.showUndo).toHaveBeenCalledWith(
            "Monthly archived. Its 3 subscribers carry on, and nobody new can join.",
            expect.any(Function),
            { duration: 10_000 },
        );
    });

    it("sells an archived plan again, with Undo", async () => {
        tab(BOTH(), null);
        act(() => item("Sell again")?.click());
        await act(() => Promise.resolve());
        expect(actions.setPlanArchived).toHaveBeenCalledWith("plan_2", false);
        expect(toast.showUndo).toHaveBeenCalledWith(
            "Yearly is open to sign-ups again.",
            expect.any(Function),
            { duration: 10_000 },
        );
    });

    it("with no plans, offers the first one", () => {
        tab([], null);
        expect(host.textContent).toContain("No plans yet");
        expect(buttons()).toContain("New plan");
    });
});
