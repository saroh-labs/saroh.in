// @vitest-environment jsdom
/**
 * Needs you on Home A at a desk (plan U6 and U7, `HAPageD`, `HANeedsD`,
 * `HAFailedD`, `HAQuietD`): a line per kind, a disclosure that opens its
 * rows in place with their inline actions (`NeedGroupBody`), orders open
 * with Home, a closed group's one action, a group emptied here folding,
 * the header count as the sum of the groups, and the states it can be in.
 */
import type { ReactNode } from "react";
import { act } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { HomeNeedGroup } from "@/lib/home/service";

import { NeedGroups } from "./need-groups";

const calls = vi.hoisted(() => ({
    moveStage: vi.fn(),
    undoStage: vi.fn(),
}));

// The rows' inline actions call the server; nothing is sent here.
vi.mock("@/lib/api/http", () => ({}));
vi.mock("@/lib/orders/actions", () => ({
    moveStage: calls.moveStage,
    undoStage: calls.undoStage,
}));
vi.mock("@saroh/ui/toast", () => ({
    showUndo: vi.fn(() => 1),
    showSuccess: vi.fn(),
    showError: vi.fn(),
    showWarning: vi.fn(),
    dismissToast: vi.fn(),
    settleUndo: (run: () => unknown) => run(),
}));
vi.mock("next/navigation", () => ({
    useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
    usePathname: () => "/",
}));

let root: Root;
let host: HTMLDivElement;

beforeEach(() => {
    (
        globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
});
afterEach(() => {
    act(() => root.unmount());
    document.body.innerHTML = "";
});

const ORDERS: HomeNeedGroup = {
    kind: "ORDERS",
    count: 7,
    late: 3,
    totals: null,
    oldest: null,
    rows: [
        {
            id: "o1",
            code: "COMMERCE_OPEN_ORDERS",
            severity: "OVERDUE",
            title: "Send order #1057 to Aditya Shetty",
            sub: "Placed 23 Sep",
            amountMinor: null,
            currency: null,
            amountIn: null,
            tag: "Late · 26 days",
            tone: "bad",
            href: "/commerce/orders/o1",
            inline: {
                kind: "MARK_SENT",
                label: "Mark sent",
                confirm: "Aditya sees that the order is on its way.",
                yes: "Mark sent",
                done: "Marked sent",
                sends: false,
                undoable: true,
                target: "o1",
                person: "Aditya",
                stage: "SHIPPED",
            },
        },
    ],
    more: 6,
    href: "/commerce/orders",
    codes: ["COMMERCE_OPEN_ORDERS"],
};

const REVIEWS: HomeNeedGroup = {
    ...ORDERS,
    kind: "REVIEWS",
    count: 1,
    late: 0,
    rows: [],
    more: 1,
    href: "/commerce/products?tab=reviews",
    codes: ["COMMERCE_LOW_STAR_REVIEWS"],
};

function draw(props: Partial<Parameters<typeof NeedGroups>[0]> = {}) {
    act(() =>
        root.render(
            <NeedGroups
                groups={[ORDERS, REVIEWS]}
                total={8}
                inProgress={1}
                unavailable={[]}
                next="Enjoy the quiet."
                {...props}
            />,
        ),
    );
}

const groupEl = (kind: string) =>
    host.querySelector<HTMLElement>(`[data-need-group="${kind}"]`);
const toggleOf = (kind: string) =>
    groupEl(kind)?.querySelector<HTMLButtonElement>("button[aria-expanded]");

describe("NeedGroups", () => {
    it("is one region named Needs you, counting every group", () => {
        draw();
        const region = host.querySelector("section");
        const heading = host.querySelector("h2");
        expect(heading?.textContent).toBe("Needs you");
        expect(region?.getAttribute("aria-labelledby")).toBe(heading?.id);
        expect(host.textContent).toContain("8 things");
        expect(host.textContent).toContain("and 1 order on its way");
        expect(host.querySelectorAll("[data-need-group]")).toHaveLength(2);
    });

    it("opens a group's rows in place, with their inline actions", () => {
        draw({ defaultOpen: [] });
        const toggle = toggleOf("ORDERS");
        const bodyOf = () =>
            document.getElementById(
                toggle?.getAttribute("aria-controls") ?? "",
            );
        expect(toggle?.getAttribute("aria-expanded")).toBe("false");
        expect(bodyOf()?.hidden).toBe(true);
        expect(bodyOf()?.textContent).toBe("");
        act(() => toggle?.click());
        expect(toggle?.getAttribute("aria-expanded")).toBe("true");
        expect(groupEl("ORDERS")?.dataset.state).toBe("open");
        const body = document.getElementById(
            toggle?.getAttribute("aria-controls") ?? "",
        );
        expect(body?.hidden).toBe(false);
        expect(body?.textContent).toContain(
            "Send order #1057 to Aditya Shetty",
        );
        // The row's own action, as on the flat list.
        expect(
            Array.from(body?.querySelectorAll("button") ?? []).some(
                (b) => b.textContent === "Mark sent",
            ),
        ).toBe(true);
        expect(body?.textContent).toContain("6 more orders");
        // And closes again.
        act(() => toggle?.click());
        expect(toggle?.getAttribute("aria-expanded")).toBe("false");
        expect(bodyOf()?.textContent).toBe("");
    });

    it("opens with the orders group open, the rest closed (plan U7)", () => {
        draw();
        expect(toggleOf("ORDERS")?.getAttribute("aria-expanded")).toBe("true");
        expect(toggleOf("REVIEWS")?.getAttribute("aria-expanded")).toBe(
            "false",
        );
    });

    it("opens the groups asked for", () => {
        draw({ defaultOpen: ["ORDERS"] });
        expect(toggleOf("ORDERS")?.getAttribute("aria-expanded")).toBe("true");
        expect(toggleOf("REVIEWS")?.getAttribute("aria-expanded")).toBe(
            "false",
        );
    });

    it("says nothing needs you only when every part was read (HAQuietD)", () => {
        draw({
            groups: [],
            total: 0,
            inProgress: 0,
            next: "Next booking: Wednesday 21 Oct at 10:00 am, Sourdough basics.",
        });
        expect(host.textContent).toContain("Nothing needs you.");
        expect(host.textContent).toContain("Next booking: Wednesday");
    });

    it("says what it couldn't check instead (HAFailedD)", () => {
        draw({
            groups: [ORDERS],
            total: 7,
            unavailable: [{ moduleKey: "PAYMENTS", label: "Overdue invoices" }],
        });
        expect(host.textContent).toContain("7 things we could check");
        draw({
            groups: [],
            total: 0,
            unavailable: [{ moduleKey: "PAYMENTS", label: "Overdue invoices" }],
        });
        expect(host.textContent).not.toContain("Nothing needs you.");
        expect(host.textContent).toContain(
            "Nothing else we could check needs you.",
        );
    });

    it("tells a new business what will show here (HAGettingSetUpD)", () => {
        draw({ groups: [], total: 0, inProgress: 0, fresh: true });
        expect(host.textContent).toContain("Nothing needs you yet.");
        expect(host.textContent).toContain(
            "New orders, bookings and enquiries show here.",
        );
    });

    it("a closed group offers its one action, which opens it at that row's confirm (HAFailedD)", () => {
        draw({ groups: [ORDERS, ENQUIRIES], total: 8, defaultOpen: [] });
        const line = groupEl("ENQUIRIES");
        const reply = Array.from(line?.querySelectorAll("button") ?? []).find(
            (b) => b.textContent === "Reply",
        );
        expect(reply).toBeTruthy();
        act(() => reply?.click());
        expect(toggleOf("ENQUIRIES")?.getAttribute("aria-expanded")).toBe(
            "true",
        );
        // The reply box is open on the first row, in place.
        expect(line?.querySelector("textarea")).toBeTruthy();
        // Open, the rows carry the action: the group's own steps aside.
        const header = line?.firstElementChild;
        expect(
            Array.from(header?.querySelectorAll("button") ?? []).some(
                (b) => b.textContent === "Reply",
            ),
        ).toBe(false);
    });

    it("orders and bills keep their own buttons; Remind all goes in the bills slot (U8)", () => {
        const slot = vi.fn((): ReactNode => (
            <button type="button">Remind all</button>
        ));
        draw({ groups: [ORDERS, BILLS], total: 17, remindAll: slot });
        const orders = groupEl("ORDERS");
        const open = Array.from(orders?.querySelectorAll("a") ?? []).find(
            (a) => a.textContent === "Open orders",
        );
        expect(open?.getAttribute("href")).toBe("/commerce/orders");
        const bills = groupEl("BILLS")?.firstElementChild;
        const labels = Array.from(
            bills?.querySelectorAll("a, button") ?? [],
        ).map((el) => el.textContent);
        expect(labels).toContain("Remind all");
        expect(labels).toContain("See bills");
        expect(labels.indexOf("Remind all")).toBeLessThan(
            labels.indexOf("See bills"),
        );
        expect(slot).toHaveBeenCalledWith(BILLS, expect.anything());
    });

    it("a group emptied here folds, and the count drops", async () => {
        calls.moveStage.mockResolvedValue({
            ok: true,
            data: { eventId: "e1" },
        });
        const one = { ...ORDERS, count: 1, more: 0 };
        draw({ groups: [one, REVIEWS], total: 2 });
        expect(host.textContent).toContain("2 things");
        const row = groupEl("ORDERS")?.querySelector("[data-need-row]");
        const press = (name: string) =>
            Array.from(groupEl("ORDERS")?.querySelectorAll("button") ?? [])
                .find((b) => b.textContent === name)
                ?.click();
        expect(row).toBeTruthy();
        act(() => press("Mark sent"));
        act(() => {
            const yes = groupEl("ORDERS")
                ?.querySelector('[role="alertdialog"]')
                ?.querySelector("button");
            yes?.click();
        });
        await act(async () => {
            for (let i = 0; i < 5; i++) await Promise.resolve();
        });
        expect(host.textContent).toContain("1 thing");
        expect(groupEl("ORDERS")?.textContent).toContain("All done");
        expect(toggleOf("ORDERS")?.getAttribute("aria-expanded")).toBe("false");
        // Opened again, the done row is there with its Undo.
        act(() => toggleOf("ORDERS")?.click());
        expect(groupEl("ORDERS")?.textContent).toContain("Marked sent");
    });
});

const ENQUIRIES: HomeNeedGroup = {
    kind: "ENQUIRIES",
    count: 1,
    late: 1,
    totals: null,
    oldest: null,
    rows: [
        {
            id: "c1",
            code: "CRM_UNANSWERED_MESSAGES",
            severity: "ATTENTION",
            title: "Rohan Kapoor · Wedding cake",
            sub: null,
            amountMinor: null,
            currency: null,
            amountIn: null,
            tag: "Waiting 2 days",
            tone: "due",
            href: "/contacts/c1",
            inline: {
                kind: "REPLY",
                label: "Reply",
                confirm: "Rohan gets your reply by email.",
                yes: "Send reply",
                done: "Reply sent",
                sends: true,
                undoable: false,
                target: "c1",
                person: "Rohan",
            },
        },
    ],
    more: 0,
    href: "/leads",
    codes: ["CRM_UNANSWERED_MESSAGES"],
};

const BILLS: HomeNeedGroup = {
    kind: "BILLS",
    count: 10,
    late: 10,
    all: 16,
    totals: [{ currency: "INR", amountMinor: 3_297_000 }],
    oldest: null,
    rows: [],
    more: 10,
    href: "/billing/invoices?view=overdue",
    codes: ["PAYMENTS_OVERDUE_INVOICES"],
};

/** Two cheques waiting, ₹8,400 and ₹5,600 (plan U18's happy path). */
const CHEQUES = {
    count: 2,
    totals: [{ currency: "INR", amountMinor: 1_400_000 }],
    href: "/billing/invoices?view=cheques",
};

const chequesEl = () => host.querySelector<HTMLElement>("[data-cheques-line]");
const lineOrder = () =>
    Array.from(host.querySelectorAll<HTMLElement>("section > ul > li")).map(
        (li) =>
            li.dataset.needGroup ??
            (li.dataset.chequesLine === "" ? "CHEQUES" : "?"),
    );

describe("NeedGroups: cheques not in the bank (plan U18)", () => {
    it("draws one line with the count and total, under the bills, counted as one thing", () => {
        draw({ groups: [ORDERS, BILLS, REVIEWS], total: 18, cheques: CHEQUES });
        const line = chequesEl();
        expect(line?.textContent).toContain(
            "2 cheques not in the bank · ₹14,000",
        );
        expect(line?.textContent).toContain("Received, waiting to clear");
        expect(lineOrder()).toEqual(["ORDERS", "BILLS", "CHEQUES", "REVIEWS"]);
        // 18 in the groups, and the cheques line is one more.
        expect(host.textContent).toContain("19 things");
        // It opens the invoices list filtered to those cheques.
        const links = Array.from(
            line?.querySelectorAll<HTMLAnchorElement>("a") ?? [],
        );
        expect(links.length).toBeGreaterThan(0);
        for (const a of links) {
            expect(a.getAttribute("href")).toBe(
                "/billing/invoices?view=cheques",
            );
        }
        expect(links.some((a) => a.textContent === "See cheques")).toBe(true);
    });

    it("never marks a cheque on Home: no button but the link", () => {
        draw({ groups: [BILLS], total: 10, cheques: CHEQUES });
        expect(chequesEl()?.querySelectorAll("button")).toHaveLength(0);
        expect(chequesEl()?.textContent).not.toMatch(/in the bank$|Bounced/);
    });

    it("says one cheque in the singular", () => {
        draw({
            cheques: {
                ...CHEQUES,
                count: 1,
                totals: [{ currency: "INR", amountMinor: 840_000 }],
            },
        });
        expect(chequesEl()?.textContent).toContain(
            "1 cheque not in the bank · ₹8,400",
        );
    });

    it("says every currency once", () => {
        draw({
            cheques: {
                count: 3,
                totals: [
                    { currency: "INR", amountMinor: 1_400_000 },
                    { currency: "USD", amountMinor: 12_000 },
                ],
                href: "/billing/invoices?view=cheques",
            },
        });
        const t = chequesEl()?.textContent ?? "";
        expect(t).toContain("3 cheques not in the bank · ₹14,000 + ");
        expect(t).toMatch(/\$120/);
    });

    it("draws nothing while no cheque waits", () => {
        draw({ groups: [ORDERS, BILLS], total: 17, cheques: null });
        expect(chequesEl()).toBeNull();
        expect(host.textContent).toContain("17 things");
    });

    it("draws nothing without money access: the API sends no figure", () => {
        // A role without payment:read gets no `chequesWaiting` at all.
        draw({ groups: [ORDERS, BILLS], total: 17 });
        expect(chequesEl()).toBeNull();
        expect(host.textContent).not.toContain("cheque");
    });

    it("is the money group's one line when there are no unpaid bills", () => {
        draw({ groups: [ORDERS, REVIEWS], total: 8, cheques: CHEQUES });
        expect(lineOrder()).toEqual(["ORDERS", "CHEQUES", "REVIEWS"]);
    });

    it("is Needs you's only line when nothing else waits", () => {
        draw({ groups: [], total: 0, cheques: CHEQUES });
        expect(lineOrder()).toEqual(["CHEQUES"]);
        expect(host.textContent).toContain("1 thing");
        expect(host.textContent).not.toContain("Nothing needs you");
    });
});
