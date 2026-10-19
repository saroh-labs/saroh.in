// @vitest-environment jsdom
/**
 * Needs you on Home A at a desk (plan U6, `HAPageD`, `HAFailedD`,
 * `HAQuietD`): a line per kind, a disclosure that opens its rows in place
 * with their inline actions (U7 builds the body; until then the rows
 * Needs you always drew), the header count as the sum of the groups, and
 * the three states it can be in.
 */
import { act } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { HomeNeedGroup } from "@/lib/home/service";

import { NeedGroups } from "./need-groups";

// The rows' inline actions call the server; nothing is sent here.
vi.mock("@/lib/api/http", () => ({}));
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
        draw();
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
});
