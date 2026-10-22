// @vitest-environment jsdom
/**
 * Payments › Subscriptions after its audit (12 Oct 2026).
 *
 * - Subscribers opens on who needs the owner: the header leads with "2 need
 *   you · ₹1,800 unpaid" and the list lands on those rows. With nobody to
 *   chase it reads "2 active" and lands on Active, as before.
 * - A view someone chose (the address, the dropdown) wins over that, and
 *   the choice is written to the address.
 * - The views are the shared list's one dropdown, each with its count, and
 *   the list is searched by the subscriber's name and the plan's.
 * - "Renewals last ran" is said only when renewals are late.
 * - The Plans tab counts the plans on sale, and "New plan" is the page's
 *   main button there.
 *
 * `react-dom/client` + `act` directly, as the other screens' tests do.
 */
import type { AnchorHTMLAttributes } from "react";
import { act } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { OnlinePaymentsLock } from "@/lib/billing/access";
import type { Plan, Subscription } from "@/lib/subscriptions/service";
import type { ScreenTab } from "@/lib/subscriptions/view";

import { SubscriptionsScreen } from "./subscriptions-screen";

// The first test draws the whole screen.
vi.setConfig({ testTimeout: 20_000 });

const router = { push: vi.fn(), replace: vi.fn(), refresh: vi.fn() };
vi.mock("next/navigation", () => ({
    useRouter: () => router,
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
// A native select stands in for the product's, which opens a portal. An
// option reads as the dropdown draws it: its label, then its count.
vi.mock("@saroh/ui/option-select", () => ({
    OptionSelect: ({
        value,
        onValueChange,
        options,
        ...aria
    }: {
        value: string;
        onValueChange: (v: string) => void;
        options: { value: string; label: string; count?: number | null }[];
        "aria-label"?: string;
    }) => (
        <select
            aria-label={aria["aria-label"]}
            value={value}
            onChange={(e) => onValueChange(e.target.value)}
        >
            {options.map((o) => (
                <option key={o.value} value={o.value}>
                    {`${o.label} ${o.count ?? ""}`.trim()}
                </option>
            ))}
        </select>
    ),
}));
vi.mock("@saroh/ui/toast", () => ({
    showError: vi.fn(),
    showSuccess: vi.fn(),
    showUndo: vi.fn(),
    dismissToasts: vi.fn(),
}));
vi.mock("@/lib/subscriptions/actions", () => ({
    setPlanArchived: vi.fn(),
    setMembersCanPause: vi.fn(),
    setAutopayChargeTiming: vi.fn(),
}));
// Each has tests of its own; here only whether they are drawn matters.
vi.mock("@/components/gst-rates/missing-rates-notice", () => ({
    MissingRatesNotice: () => null,
}));
vi.mock("./subscribe-dialog", () => ({
    SubscribeDialog: ({ open }: { open: boolean }) =>
        open ? <div role="dialog" aria-label="Subscribe someone" /> : null,
}));
vi.mock("./subscription-quick-look", () => ({
    SubscriptionQuickLook: ({ sub }: { sub: Subscription | null }) =>
        sub ? <div role="dialog" aria-label={sub.contact.name} /> : null,
}));

const NOW = "2026-10-12T06:30:00.000Z";

let n = 0;
const sub = (name: string, over: Partial<Subscription> = {}): Subscription => ({
    id: `s${++n}`,
    status: "ACTIVE",
    plan: { id: "p1", name: "Gym monthly" },
    contact: { id: `c${n}`, name, email: "first.last@example.com" },
    price: "900.00",
    currency: "INR",
    interval: "MONTH",
    timezone: "Asia/Kolkata",
    currentPeriodStart: "2026-10-01T00:00:00.000Z",
    currentPeriodEnd: "2026-11-01T00:00:00.000Z",
    nextRenewalAt: "2026-10-31T18:30:00.000Z",
    startsAt: null,
    endsAt: null,
    pausedAt: null,
    pausedUntil: null,
    cancelledAt: null,
    overdue: false,
    overdueCount: 0,
    unpaidCount: 0,
    unpaidTotal: "0.00",
    oldestUnpaid: null,
    latestInvoice: null,
    paymentFailed: false,
    failedCharge: null,
    collection: null,
    pendingPlan: null,
    startedAt: "2026-03-02T00:00:00.000Z",
    createdAt: "2026-03-02T00:00:00.000Z",
    ...over,
});

/** A renewal that isn't paid: it needs the owner. */
const unpaid = (name: string, over: Partial<Subscription> = {}) =>
    sub(name, {
        paymentFailed: true,
        unpaidCount: 1,
        unpaidTotal: "900.00",
        failedCharge: {
            id: "i1",
            number: "INV-0007",
            dueAt: "2026-10-07T06:30:00.000Z",
            total: "900.00",
        },
        ...over,
    });

const plan = (over: Partial<Plan> = {}): Plan => ({
    id: "p1",
    name: "Gym monthly",
    description: null,
    price: "900.00",
    currency: "INR",
    interval: "MONTH",
    status: "ACTIVE",
    classesPerMonth: null,
    subscriberCount: 4,
    byPrice: [],
    monthly: "900.00",
    monthlyFromMembers: "1800.00",
    createdAt: "2026-06-01T00:00:00.000Z",
    ...over,
});

const CHASE = () => [
    unpaid("Asha Rao"),
    unpaid("Kabir Shah", { plan: { id: "p2", name: "Yoga pass" } }),
    sub("Meera Iyer"),
    sub("Nikhil Verma"),
    sub("Tara Bose", { status: "PAUSED", pausedAt: "2026-10-01T00:00:00Z" }),
    sub("Zoya Khan", {
        status: "CANCELLED",
        cancelledAt: "2026-09-01T00:00:00Z",
    }),
];
const CALM = () => [sub("Meera Iyer"), sub("Nikhil Verma")];

const PLANS = [
    plan(),
    plan({ id: "p2", name: "Yoga pass" }),
    plan({ id: "p3", name: "Old pass", status: "ARCHIVED" }),
    plan({ id: "p4", name: "Next year", status: "DRAFT" }),
];

const LOCK: OnlinePaymentsLock = {
    title: "Memberships come with Plan B",
    body: "You're on Plan A.",
    cta: "See Plan B",
    href: "/settings/billing/plans?plan=b",
};

let root: Root;
let host: HTMLDivElement;

beforeEach(() => {
    (
        globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    window.history.replaceState(null, "", "/billing/subscriptions");
});

afterEach(() => {
    act(() => root.unmount());
    host.remove();
    vi.clearAllMocks();
});

interface Shown {
    subscriptions?: Subscription[];
    plans?: Plan[] | null;
    tab?: ScreenTab;
    view?: string;
    canWrite?: boolean;
    renewalsLate?: string | null;
    plansLocked?: OnlinePaymentsLock | null;
}

function show({
    subscriptions = CHASE(),
    plans = PLANS,
    tab = "subscribers",
    view,
    canWrite = true,
    renewalsLate = null,
    plansLocked = null,
}: Shown = {}) {
    act(() =>
        root.render(
            <SubscriptionsScreen
                subscriptions={subscriptions}
                plans={plans}
                showClasses={false}
                contacts={[]}
                charges={{ state: "ok", data: {} }}
                renewalsLate={renewalsLate}
                canWrite={canWrite}
                initialTab={tab}
                initialView={view}
                nowIso={NOW}
                plansLocked={plansLocked}
            />,
        ),
    );
}

const text = () => host.textContent;
const slot = (name: string) =>
    host.querySelector(`[data-slot="${name}"]`)?.textContent;
const names = () =>
    Array.from(host.querySelectorAll("tbody tr")).map(
        (r) => r.querySelector("button, a")?.textContent ?? "",
    );
const statusFilter = () => {
    const found = host.querySelector<HTMLSelectElement>(
        'select[aria-label="Subscription status"]',
    );
    if (!found) throw new Error("No status dropdown");
    return found;
};
const options = (select: HTMLSelectElement) =>
    Array.from(select.options).map((o) => o.textContent);
function choose(select: HTMLSelectElement, value: string) {
    act(() => {
        select.value = value;
        select.dispatchEvent(new Event("change", { bubbles: true }));
    });
}
const tabNamed = (name: string) => {
    const found = Array.from(
        host.querySelectorAll<HTMLElement>('[role="tab"]'),
    ).find((t) => t.textContent.startsWith(name));
    if (!found) throw new Error(`No "${name}" tab`);
    return found;
};
const actions = () =>
    Array.from(
        host.querySelectorAll('[data-slot="page-actions"] a, button'),
    ).map((b) => b.textContent.trim());

describe("Subscribers opens on who needs you", () => {
    it("leads the header with them and what is unpaid, then the quieter count", () => {
        show();
        expect(host.querySelector("[data-need-you]")?.textContent).toBe(
            "2 need you · ₹1,800 unpaid",
        );
        expect(slot("page-meta")).toBe(
            "2 need you · ₹1,800 unpaid2 active · about ₹1,800 a month",
        );
        expect(slot("page-count")).toBe("6 subscriptions");
    });

    it("lands the list on them, each saying why in its row", () => {
        show();
        expect(statusFilter().value).toBe("failed");
        expect(names().map((n) => n.slice(0, 12))).toEqual([
            "ARAsha RaoGy",
            "KSKabir Shah",
        ]);
        const row = host.querySelector("tbody tr");
        expect(row?.textContent).toContain("Payment failed");
        expect(row?.textContent).toContain(
            "Renewal of ₹900 isn't paid, 5 days past due",
        );
        expect(row?.textContent).toContain("₹900 a month");
    });

    it("no longer says it a second time under the tabs", () => {
        show();
        expect(text()).not.toContain("Show them");
        expect(text()).not.toContain("paid and need you");
        expect(host.querySelector('[role="alert"]')).toBeNull();
    });

    it("with nobody to chase, reads as before and lands on Active", () => {
        show({ subscriptions: CALM() });
        expect(host.querySelector("[data-need-you]")).toBeNull();
        expect(slot("page-meta")).toBe("2 active · about ₹1,800 a month");
        expect(statusFilter().value).toBe("active");
        expect(names()).toHaveLength(2);
    });

    it("a view the address chose wins over the default", () => {
        show({ view: "active" });
        expect(statusFilter().value).toBe("active");
        expect(names()).toHaveLength(2);
        expect(host.querySelector("[data-need-you]")?.textContent).toContain(
            "2 need you",
        );
    });

    it("an older link's ?tab= still lands on its view, and moves to ?view=", () => {
        window.history.replaceState(
            null,
            "",
            "/billing/subscriptions?tab=paused",
        );
        show({ view: "paused" });
        expect(statusFilter().value).toBe("paused");
        expect(names()).toHaveLength(1);
        expect(window.location.search).toBe("?view=paused");
    });
});

describe("status is the view switch", () => {
    it("lists every view with its count, the one it opens on first", () => {
        show();
        expect(options(statusFilter())).toEqual([
            "Need you 2",
            "Active 2",
            "Paused 1",
            "Cancelled 1",
            "All subscriptions 6",
        ]);
        show({ subscriptions: CALM() });
        expect(options(statusFilter())).toEqual([
            "Active 2",
            "Need you 0",
            "Paused 0",
            "Cancelled 0",
            "All subscriptions 2",
        ]);
    });

    it("a choice narrows the list and is written to the address", () => {
        show();
        choose(statusFilter(), "active");
        expect(names()).toHaveLength(2);
        expect(window.location.search).toBe("?view=active");
        choose(statusFilter(), "all");
        expect(names()).toHaveLength(6);
        expect(window.location.search).toBe("?view=all");
        // Back on the view it opens on: the address says nothing.
        choose(statusFilter(), "failed");
        expect(window.location.search).toBe("");
    });

    it("an empty view says so, never that there are no subscriptions", () => {
        show({ subscriptions: CALM(), view: "failed" });
        expect(statusFilter().value).toBe("failed");
        expect(text()).toContain("No subscriptions in “Need you”");
        expect(text()).toContain("2 subscriptions in total.");
    });
});

describe("the list", () => {
    it("is the shared list: a table with a head, and a search", () => {
        show();
        expect(host.querySelector("[data-list-table]")).not.toBeNull();
        expect(
            Array.from(host.querySelectorAll("thead th")).map((th) =>
                th.textContent.trim(),
            ),
        ).toEqual(["Subscriber", "Status", "Next", "Pays"]);
        expect(
            host
                .querySelector('input[type="search"]')
                ?.getAttribute("placeholder"),
        ).toBe("Search subscriptions");
    });

    it("searches the subscriber's name and the plan's name", async () => {
        vi.useFakeTimers();
        try {
            show({ view: "all" });
            const search = host.querySelector<HTMLInputElement>(
                'input[type="search"]',
            );
            if (!search) throw new Error("No search");
            const type = async (term: string) => {
                await act(async () => {
                    Object.getOwnPropertyDescriptor(
                        HTMLInputElement.prototype,
                        "value",
                    )?.set?.call(search, term);
                    search.dispatchEvent(new Event("input", { bubbles: true }));
                    await vi.advanceTimersByTimeAsync(400);
                });
            };
            await type("meera");
            expect(names()).toHaveLength(1);
            expect(names()[0]).toContain("Meera Iyer");
            await type("yoga");
            expect(names()).toHaveLength(1);
            expect(names()[0]).toContain("Kabir Shah");
        } finally {
            vi.useRealTimers();
        }
    });

    it("a row opens the quick look", () => {
        show();
        const first = host.querySelector<HTMLButtonElement>("tbody tr button");
        act(() => first?.click());
        expect(
            host.querySelector('[role="dialog"][aria-label="Asha Rao"]'),
        ).not.toBeNull();
    });

    it("with no one subscribed, says so and offers the first step", () => {
        show({ subscriptions: [] });
        expect(text()).toContain("No one is subscribed yet");
        expect(host.querySelector("[data-list-table]")).toBeNull();
        expect(slot("page-meta")).toBeUndefined();
    });
});

describe("renewals last ran", () => {
    it("says nothing when renewals are on time", () => {
        show();
        expect(text()).not.toContain("Renewals last ran");
        expect(host.querySelector('[data-notice="warning"]')).toBeNull();
    });

    it("warns when they are late", () => {
        show({
            renewalsLate:
                "Renewals last ran 10 Oct, 6:00 am, later than it should have. Renewals wait until it runs again.",
        });
        const warning = host.querySelector('[data-notice="warning"]');
        expect(warning?.getAttribute("role")).toBe("status");
        expect(warning?.textContent).toContain(
            "later than it should have. Renewals wait until it runs again.",
        );
    });
});

describe("the Plans tab", () => {
    it("counts the plans on sale, not the drafts or the archived ones", () => {
        show();
        expect(tabNamed("Plans").textContent).toBe("Plans2");
        expect(tabNamed("Subscribers").textContent).toBe("Subscribers6");
    });

    it("opens from the address, with New plan as the main button", () => {
        show({ tab: "plans" });
        expect(tabNamed("Plans").getAttribute("aria-selected")).toBe("true");
        expect(actions()).toEqual(
            expect.arrayContaining(["Subscribe someone", "New plan"]),
        );
        const newPlan = host.querySelector<HTMLAnchorElement>(
            '[data-slot="page-actions"] a',
        );
        expect(newPlan?.textContent).toBe("New plan");
        expect(newPlan?.getAttribute("href")).toBe("/billing/plans/new");
        // The list of plans, not of subscribers.
        expect(
            host.querySelector('select[aria-label="Plan status"]'),
        ).not.toBeNull();
        expect(
            host.querySelector('select[aria-label="Subscription status"]'),
        ).toBeNull();
    });

    it("picking a tab writes it to the address and drops the other's view", () => {
        window.history.replaceState(
            null,
            "",
            "/billing/subscriptions?view=active",
        );
        show({ view: "active" });
        act(() => tabNamed("Plans").click());
        expect(window.location.search).toBe("?tab=plans");
        expect(
            host.querySelector<HTMLSelectElement>(
                'select[aria-label="Plan status"]',
            )?.value,
        ).toBe("live");
        act(() => tabNamed("Subscribers").click());
        expect(window.location.search).toBe("");
        // No view chosen any more: who needs the owner.
        expect(statusFilter().value).toBe("failed");
    });

    it("offers no New plan on Subscribers, to a role that can't, or without memberships", () => {
        show();
        expect(actions()).not.toContain("New plan");
        show({ tab: "plans", canWrite: false });
        expect(host.querySelector('[data-slot="page-actions"]')).toBeNull();
        show({ tab: "plans", plansLocked: LOCK });
        expect(actions()).not.toContain("New plan");
        expect(actions()).toContain("Subscribe someone");
    });
});
