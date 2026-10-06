// @vitest-environment jsdom
/**
 * The Plans tab on a plan without memberships (6 Oct 2026): the notice,
 * with the way up, where "New plan" was; the plans stay listed to open,
 * edit and archive, but nothing new goes on sale — no "New plan", no "Make
 * a plan", no "Sell again", and archiving offers no Undo (it would sell the
 * plan again). Unlocked, the tab is as it was.
 *
 * `react-dom/client` + `act` directly, as the editor's tests do.
 */
import { act } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { OnlinePaymentsLock } from "@/lib/billing/access";
import type { Plan } from "@/lib/subscriptions/service";

import { PlansTab } from "./plans-tab";

const actions = vi.hoisted(() => ({ setPlanArchived: vi.fn() }));
vi.mock("@/lib/subscriptions/actions", () => actions);
vi.mock("next/navigation", () => ({
    useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
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

let root: Root;
let host: HTMLDivElement;

beforeEach(() => {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    actions.setPlanArchived.mockResolvedValue({ ok: true, data: {} });
});

afterEach(() => {
    act(() => root.unmount());
    host.remove();
    vi.clearAllMocks();
});

function tab(plans: Plan[], locked: OnlinePaymentsLock | null) {
    act(() =>
        root.render(
            <PlansTab
                plans={plans}
                canWrite
                showClasses={false}
                locked={locked}
            />,
        ),
    );
}

const buttons = () =>
    Array.from(host.querySelectorAll("a, button")).map((b) =>
        b.textContent.trim(),
    );

describe("the Plans tab without memberships on the plan", () => {
    it("says so with the way up, and offers no new plan", () => {
        tab(
            [
                plan(),
                plan({ id: "plan_2", name: "Yearly", status: "ARCHIVED" }),
            ],
            LOCK,
        );
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
        tab(
            [
                plan(),
                plan({ id: "plan_2", name: "Yearly", status: "ARCHIVED" }),
            ],
            LOCK,
        );
        expect(host.querySelectorAll("article")).toHaveLength(2);
        const all = buttons();
        expect(all.filter((b) => b === "Edit")).toHaveLength(2);
        expect(all).toContain("Archive");
        expect(all).not.toContain("Sell again");
    });

    it("archives without an Undo, which would sell it again", async () => {
        tab([plan()], LOCK);
        const archive = Array.from(host.querySelectorAll("button")).find(
            (b) => b.textContent === "Archive",
        );
        act(() => archive?.click());
        await act(() => Promise.resolve());
        expect(actions.setPlanArchived).toHaveBeenCalledWith("plan_1", true);
        expect(toast.showSuccess).toHaveBeenCalledWith(
            "Monthly archived. Its 3 subscribers carry on; nobody new can join.",
        );
        expect(toast.showUndo).not.toHaveBeenCalled();
    });

    it("with no plans, makes none", () => {
        tab([], LOCK);
        expect(host.textContent).toContain("No plans yet");
        expect(buttons()).not.toContain("Make a plan");
    });
});

describe("the Plans tab with memberships on the plan", () => {
    it("is as it was: New plan, Sell again, Undo, no notice", async () => {
        tab(
            [
                plan(),
                plan({ id: "plan_2", name: "Yearly", status: "ARCHIVED" }),
            ],
            null,
        );
        expect(host.querySelector('[role="status"]')).toBeNull();
        expect(buttons()).toContain("New plan");
        expect(buttons()).toContain("Sell again");
        const archive = Array.from(host.querySelectorAll("button")).find(
            (b) => b.textContent === "Archive",
        );
        act(() => archive?.click());
        await act(() => Promise.resolve());
        expect(toast.showUndo).toHaveBeenCalled();
    });
});
