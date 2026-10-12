// @vitest-environment jsdom
/**
 * Subscriptions › Plans as rows (Subscriptions audit, 12 Oct 2026).
 *
 * - A plan is a row of the shared list: its name with Draft or Archived in
 *   words, its price and how often ("+ GST" where GST is added), what is
 *   included, who is on it, what they bring in a month, and the note for
 *   members on an older price. The row opens the plan.
 * - The views are the list's one dropdown, each with its count: Live (where
 *   it opens), Archived, Drafts and all of them.
 * - Archive and Sell again are in the row's menu, never on its face.
 * - The GST notice says which plans it counts when some are archived.
 * - The standing sentence about price changes is gone from the tab, and
 *   the two settings are rows under the list, not cards above it.
 *
 * `react-dom/client` + `act` directly, as the other screens' tests do.
 */
import type { AnchorHTMLAttributes, ReactNode } from "react";
import { act } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { MissingRates } from "@/lib/gst-rates/missing";
import type { GstOnPrice } from "@/lib/gst/on-price";
import type { Plan, SubscriptionSettings } from "@/lib/subscriptions/service";

import { PlansTab } from "./plans-tab";

// The first test draws the whole tab.
vi.setConfig({ testTimeout: 20_000 });

vi.mock("@/lib/subscriptions/actions", () => ({
    setPlanArchived: vi.fn(),
    setMembersCanPause: vi.fn(),
    setAutopayChargeTiming: vi.fn(),
}));
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
vi.mock("@saroh/ui/toast", () => ({
    showError: vi.fn(),
    showSuccess: vi.fn(),
    showUndo: vi.fn(),
    dismissToasts: vi.fn(),
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
        onSelect,
    }: {
        children: ReactNode;
        asChild?: boolean;
        onSelect?: () => void;
    }) =>
        asChild ? (
            <>{children}</>
        ) : (
            <button type="button" role="menuitem" onClick={onSelect}>
                {children}
            </button>
        ),
}));

const NOW = "2026-09-29T10:00:00Z";

/** 18% added to ₹2,000: a member pays ₹2,360. */
const ADDED: GstOnPrice = {
    mode: "ADDED",
    rate: "18",
    listCents: 200_000,
    gstCents: 36_000,
    payCents: 236_000,
};

const plan = (over: Partial<Plan> = {}): Plan => ({
    id: "p1",
    name: "Gym monthly",
    description: "The gym floor, every day.",
    price: "2000.00",
    currency: "INR",
    interval: "MONTH",
    status: "ACTIVE",
    classesPerMonth: 8,
    subscriberCount: 15,
    byPrice: [
        {
            price: "2000.00",
            currency: "INR",
            interval: "MONTH",
            count: 12,
            current: true,
        },
        {
            price: "1500.00",
            currency: "INR",
            interval: "MONTH",
            count: 3,
            current: false,
        },
    ],
    monthly: "2000.00",
    monthlyFromMembers: "28500.00",
    createdAt: "2026-06-01T00:00:00.000Z",
    ...over,
});

const quiet = (over: Partial<Plan>): Plan =>
    plan({
        subscriberCount: 0,
        byPrice: [],
        monthlyFromMembers: "0.00",
        classesPerMonth: null,
        ...over,
    });

const PLANS = () => [
    plan(),
    quiet({
        id: "p2",
        name: "Yearly",
        price: "12000.00",
        interval: "YEAR",
        monthly: "1000.00",
    }),
    quiet({
        id: "p3",
        name: "Old pass",
        status: "ARCHIVED",
        subscriberCount: 2,
    }),
    quiet({ id: "p4", name: "Next year", status: "DRAFT" }),
];

let root: Root;
let host: HTMLDivElement;

beforeEach(() => {
    (
        globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    window.history.replaceState(null, "", "/billing/subscriptions?tab=plans");
});

afterEach(() => {
    act(() => root.unmount());
    host.remove();
    vi.clearAllMocks();
});

interface Shown {
    plans?: Plan[] | null;
    canWrite?: boolean;
    showClasses?: boolean;
    view?: string;
    missingRates?: MissingRates | null;
    settings?: SubscriptionSettings | null;
}

function show({
    plans = PLANS(),
    canWrite = true,
    showClasses = true,
    view,
    missingRates = null,
    settings = null,
}: Shown = {}) {
    act(() =>
        root.render(
            <PlansTab
                plans={plans}
                canWrite={canWrite}
                showClasses={showClasses}
                initialView={view}
                missingRates={missingRates}
                settings={settings}
                nowIso={NOW}
            />,
        ),
    );
}

const text = () => host.textContent;
const heads = () =>
    Array.from(host.querySelectorAll("thead th")).map((th) =>
        th.textContent.trim(),
    );
const rows = () => Array.from(host.querySelectorAll("tbody tr"));
function rowOf(name: string): Element {
    const found = rows().find((r) => r.textContent.includes(name));
    if (!found) throw new Error(`No row for "${name}"`);
    return found;
}
/** A row's cells as words, without what `hidden` picks out, or the menu. */
function cellWords(name: string, hidden: string): string[] {
    return Array.from(rowOf(name).querySelectorAll("td")).map((td) => {
        const copy = td.cloneNode(true) as HTMLElement;
        copy.querySelectorAll(`${hidden}, [role="menu"]`).forEach((el) => {
            el.remove();
        });
        return copy.textContent.trim();
    });
}
/** A row's cells, as a desk reads them: the phone's words left out. */
const cells = (name: string) => cellWords(name, ".min-\\[760px\\]\\:hidden");
/** The same cells as a phone's row says them, with no column names. */
const phoneWords = (name: string) =>
    cellWords(name, ".max-\\[759\\.98px\\]\\:hidden");
const viewFilter = () => {
    const found = host.querySelector<HTMLSelectElement>(
        'select[aria-label="Plan status"]',
    );
    if (!found) throw new Error("No view dropdown");
    return found;
};
function choose(value: string) {
    const select = viewFilter();
    act(() => {
        select.value = value;
        select.dispatchEvent(new Event("change", { bubbles: true }));
    });
}

describe("plans are rows", () => {
    it("draws the shared list: a table with a head, a row a plan, and no cards", () => {
        show({ view: "all" });
        expect(host.querySelector("[data-list-table]")).not.toBeNull();
        expect(host.querySelector("article")).toBeNull();
        expect(rows()).toHaveLength(4);
        expect(heads()).toEqual([
            "Plan",
            "Price",
            "What is included",
            "Subscribers",
            "Brings in a month",
            "Actions",
        ]);
    });

    it("says a plan's price, what is included, who is on it and what they bring in", () => {
        show();
        expect(cells("Gym monthly").slice(0, 5)).toEqual([
            "Gym monthly",
            "₹2,000 a month",
            "8 classes a month",
            "153 still on ₹1,500, and they keep it",
            "₹28,500",
        ]);
        expect(cells("Yearly").slice(0, 3)).toEqual([
            "Yearly",
            "₹12,000 a year",
            "Unlimited classes",
        ]);
    });

    it("the price the business set says + GST where GST is added, and the older price too", () => {
        show({
            plans: [plan({ gst: ADDED, monthlyFromMembers: "33630.00" })],
        });
        const [, price, , subscribers, monthly] = cells("Gym monthly");
        expect(price).toBe("₹2,000 a month + GST");
        expect(subscribers).toBe("153 still on ₹1,500 + GST, and they keep it");
        // Money coming in is what members pay, GST and all: no "+ GST".
        expect(monthly).toBe("₹33,630");
    });

    it("draws a dash, not a sentence, for a plan nobody is on", () => {
        show();
        const [, , , subscribers, monthly] = cells("Yearly");
        expect(subscribers).toBe("—None");
        expect(monthly).toBe("—None");
        expect(text()).not.toContain("No subscribers yet · ");
    });

    it("says when everyone on a plan is paused", () => {
        show({
            plans: [quiet({ name: "Paused lot", subscriberCount: 2 })],
        });
        expect(cells("Paused lot").slice(3, 5)).toEqual([
            "2",
            "None paying right now",
        ]);
    });

    it("on a phone, where there are no column names, each figure says what it is", () => {
        show();
        const [, , , subscribers, monthly] = phoneWords("Gym monthly");
        expect(subscribers).toBe(
            "15 subscribers3 still on ₹1,500, and they keep it",
        );
        expect(monthly).toBe("brings in ₹28,500 a month");
        expect(phoneWords("Yearly").slice(3, 5)).toEqual([
            "No subscribers yet",
            "",
        ]);
    });

    it("leaves the classes column out where the business sells none", () => {
        show({ showClasses: false });
        expect(heads()).not.toContain("What is included");
        expect(text()).not.toContain("Unlimited classes");
    });

    it("the row opens the plan", () => {
        show();
        const link = rowOf("Gym monthly").querySelector("td a");
        expect(link?.getAttribute("href")).toBe("/billing/plans/p1");
        expect(link?.textContent).toBe("Gym monthly");
    });

    it("says Archived, Draft and Unpublished changes in words", () => {
        show({
            view: "all",
            plans: [
                ...PLANS(),
                quiet({
                    id: "p5",
                    name: "Being changed",
                    pendingChangedAt: "2026-09-20T00:00:00Z",
                }),
            ],
        });
        expect(cells("Old pass")[0]).toBe("Old passArchived");
        expect(cells("Next year")[0]).toBe("Next yearDraft");
        expect(cells("Being changed")[0]).toBe(
            "Being changedUnpublished changes",
        );
        // An archived plan is in the same list, quieter.
        expect(
            rowOf("Old pass").querySelector("td a span span")?.className,
        ).toContain("text-muted-foreground");
    });
});

describe("the views", () => {
    it("opens on Live, and counts each view", () => {
        show();
        expect(viewFilter().value).toBe("live");
        expect(
            Array.from(viewFilter().options).map((o) => o.textContent),
        ).toEqual(["Live 2", "Archived 1", "Drafts 1", "All plans 4"]);
        expect(rows().map((r) => r.querySelector("a")?.textContent)).toEqual([
            "Gym monthly",
            "Yearly",
        ]);
        // How many are showing, of how many there are.
        expect(
            host.querySelector('[data-slot="list-count"]')?.textContent,
        ).toBe("2 of 4 plans");
    });

    it("a choice narrows the list and is written to the address", () => {
        show();
        choose("archived");
        expect(rows()).toHaveLength(1);
        expect(rows()[0]?.textContent).toContain("Old pass");
        expect(window.location.search).toBe("?tab=plans&view=archived");
        choose("drafts");
        expect(rows()[0]?.textContent).toContain("Next year");
        choose("live");
        expect(window.location.search).toBe("?tab=plans");
    });

    it("opens on the view the address chose, and on Live for one it doesn't know", () => {
        show({ view: "archived" });
        expect(viewFilter().value).toBe("archived");
        act(() => root.unmount());
        root = createRoot(host);
        show({ view: "failed" });
        expect(viewFilter().value).toBe("live");
    });
});

describe("a row's actions", () => {
    const menuOf = (name: string) =>
        Array.from(
            rowOf(name).querySelectorAll(
                '[role="menu"] a, [role="menu"] button',
            ),
        ).map((b) => b.textContent.trim());

    it("keeps Archive and Sell again off the row's face, in its menu", () => {
        show({ view: "all" });
        expect(
            rowOf("Gym monthly").querySelector(
                'button[aria-label="More actions for Gym monthly"]',
            ),
        ).not.toBeNull();
        expect(menuOf("Gym monthly")).toEqual(["Edit", "Archive"]);
        expect(menuOf("Old pass")).toEqual(["Edit", "Sell again"]);
        // A draft is never on sale: nothing to archive.
        expect(menuOf("Next year")).toEqual(["Edit"]);
        expect(
            rowOf("Gym monthly")
                .querySelector('[role="menu"] a')
                ?.getAttribute("href"),
        ).toBe("/billing/plans/p1/edit");
    });

    it("offers none to a role that can't change subscriptions", () => {
        show({ canWrite: false });
        expect(host.querySelector('[role="menu"]')).toBeNull();
        expect(heads()).not.toContain("Actions");
    });
});

describe("what stands above and under the list", () => {
    const missing = (ids: string[]): MissingRates => ({
        registered: true,
        items: ids.map((id) => ({ kind: "PLAN", id, name: id })),
        more: false,
    });

    it("no longer says the standing sentence about price changes", () => {
        show({ missingRates: missing([]) });
        expect(text()).not.toContain("Changing a price only changes");
        show({ missingRates: { ...missing([]), registered: false } });
        expect(text()).not.toContain("Changing a price only changes");
    });

    it("the GST notice says which plans it means when some are archived", () => {
        show({ missingRates: missing(["p1", "p2", "p3"]) });
        expect(host.querySelector('[data-notice="neutral"]')?.textContent).toBe(
            "3 plans have no GST rate. Until you choose one, their tax invoices show no GST. 1 of them is archived, with members still on it.Choose rates",
        );
    });

    it("the GST notice keeps its own words when every plan it counts is live", () => {
        show({ missingRates: missing(["p1", "p2"]) });
        expect(host.querySelector('[data-notice="neutral"]')?.textContent).toBe(
            "2 plans have no GST rate. Until you choose one, their tax invoices show no GST.Choose rates",
        );
    });

    it("puts the two settings under the list, as rows", () => {
        show({
            settings: {
                membersCanPause: true,
                accountArea: true,
                autopay: {
                    available: true,
                    chargeTiming: "DAY_AFTER_RENEWAL",
                    leadDays: 2,
                    noticeHours: 26,
                    dueDays: 7,
                },
            },
        });
        const list = host.querySelector("[data-list-table]");
        const group = host.querySelector(
            'section[aria-labelledby="plan-settings"]',
        );
        expect(group?.querySelector("h2")?.textContent).toBe(
            "Settings for every plan",
        );
        if (!list || !group) throw new Error("No list or settings");
        expect(
            list.compareDocumentPosition(group) &
                Node.DOCUMENT_POSITION_FOLLOWING,
        ).toBeTruthy();
        // Rows to read, not a switch and three cards to scroll past.
        expect(host.querySelector('[role="switch"]')).toBeNull();
        expect(host.querySelector('input[type="radio"]')).toBeNull();
    });

    it("says when the plans couldn't be read, and nothing else", () => {
        show({ plans: null });
        expect(text()).toContain("Couldn't load");
        expect(host.querySelector("[data-list-table]")).toBeNull();
    });
});
