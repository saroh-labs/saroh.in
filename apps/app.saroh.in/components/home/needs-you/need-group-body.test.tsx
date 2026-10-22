// @vitest-environment jsdom
/**
 * A Needs you group's body (DEC-171, Home plan U7, boards `HANeedsD`,
 * `HAInlineD`, `HAMemberD`, `HPSheets`): each kind's rows and the line
 * under them, every inline action with its confirm, hold and Undo,
 * including a booking awaiting payment's Send payment link and Turn down,
 * and a role without money. The body is drawn on its own, as a phone's
 * sheet hosts it (U17): it takes the group and the screen's actions.
 */
import { act } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { HomeInline, HomeNeed, HomeNeedGroup } from "@/lib/home/service";

import { NeedGroupBody } from "./need-group-body";
import { useInlineActions } from "./use-inline-actions";

const calls = vi.hoisted(() => ({
    moveStage: vi.fn(),
    undoStage: vi.fn(),
    turnDownBooking: vi.fn(),
    makePayLink: vi.fn(),
    replyAction: vi.fn(),
    replyToReview: vi.fn(),
    remindWithLink: vi.fn(),
    retrySubscription: vi.fn(),
    refundMismatch: vi.fn(),
    toast: {
        showUndo: vi.fn(() => 1),
        showSuccess: vi.fn(),
        showError: vi.fn(),
        showWarning: vi.fn(),
        dismissToast: vi.fn(),
    },
}));

vi.mock("@/lib/api/http", () => ({}));
vi.mock("next/navigation", () => ({
    useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
    usePathname: () => "/",
    unstable_rethrow: () => undefined,
}));
vi.mock("@saroh/ui/toast", () => ({
    ...calls.toast,
    settleUndo: (run: () => unknown) => run(),
}));
vi.mock("@/lib/orders/actions", () => ({
    moveStage: calls.moveStage,
    undoStage: calls.undoStage,
}));
vi.mock("@/lib/services/actions", () => ({
    turnDownBooking: calls.turnDownBooking,
}));
vi.mock("@/components/bookings/pay-link-panel", () => ({
    makePayLink: calls.makePayLink,
}));
vi.mock("@/lib/customer-workspace/actions", () => ({
    replyAction: calls.replyAction,
}));
vi.mock("@/lib/product-reviews/actions", () => ({
    replyToReview: calls.replyToReview,
}));
vi.mock("@/lib/invoices/link-actions", () => ({
    remindWithLink: calls.remindWithLink,
}));
vi.mock("@/lib/subscriptions/actions", () => ({
    retrySubscription: calls.retrySubscription,
}));
vi.mock("@/lib/payments/actions", () => ({
    refundMismatch: calls.refundMismatch,
}));

let root: Root;
let host: HTMLDivElement;

beforeEach(() => {
    (
        globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    vi.useFakeTimers();
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    for (const fn of [
        calls.moveStage,
        calls.undoStage,
        calls.turnDownBooking,
        calls.makePayLink,
        calls.replyAction,
        calls.replyToReview,
        calls.remindWithLink,
        calls.retrySubscription,
        calls.refundMismatch,
        ...Object.values(calls.toast),
    ])
        fn.mockClear();
});
afterEach(() => {
    act(() => root.unmount());
    document.body.innerHTML = "";
    vi.useRealTimers();
});

/** The body as a host draws it: the screen owns the actions. */
function Host({ group }: { group: HomeNeedGroup }) {
    const actions = useInlineActions();
    return <NeedGroupBody group={group} actions={actions} />;
}

function draw(group: HomeNeedGroup) {
    act(() => root.render(<Host group={group} />));
}

/** Let the server actions' promises settle. */
async function settle() {
    await act(async () => {
        for (let i = 0; i < 5; i++) await Promise.resolve();
    });
}

/** Ten seconds pass: whatever was held is sent. */
async function holdEnds() {
    act(() => {
        vi.advanceTimersByTime(10_000);
    });
    await settle();
}

const rows = () =>
    Array.from(host.querySelectorAll<HTMLElement>("[data-need-row]"));
const rowOf = (text: string) => {
    const found = rows().find((r) => r.textContent.includes(text));
    if (!found) throw new Error(`no row with ${text}`);
    return found;
};
const buttonIn = (el: ParentNode, name: string | RegExp) => {
    const found = Array.from(el.querySelectorAll("button")).find((b) =>
        typeof name === "string"
            ? b.textContent === name
            : name.test(b.textContent),
    );
    if (!found) throw new Error(`no button ${String(name)}`);
    return found;
};
const confirmIn = (row: HTMLElement): HTMLElement => {
    const found = row.querySelector<HTMLElement>('[role="alertdialog"]');
    if (!found) throw new Error("no confirm open");
    return found;
};
const hasButton = (el: ParentNode, name: string) =>
    Array.from(el.querySelectorAll("button")).some(
        (b) => b.textContent === name,
    );
const linkIn = (el: ParentNode, name: string) =>
    Array.from(el.querySelectorAll("a")).find((a) => a.textContent === name);

function need(over: Partial<HomeNeed> & Pick<HomeNeed, "id">): HomeNeed {
    return {
        code: "COMMERCE_OPEN_ORDERS",
        severity: "ATTENTION",
        title: "A row",
        sub: null,
        amountMinor: null,
        currency: null,
        amountIn: null,
        tag: null,
        tone: "due",
        href: `/x/${over.id}`,
        ...over,
    };
}

function inline(
    over: Partial<HomeInline> & Pick<HomeInline, "kind">,
): HomeInline {
    return {
        label: "Do it",
        confirm: "This does it.",
        yes: "Do it",
        done: "Done",
        sends: false,
        undoable: false,
        target: "t1",
        person: null,
        ...over,
    };
}

function group(
    over: Partial<HomeNeedGroup> & Pick<HomeNeedGroup, "kind">,
): HomeNeedGroup {
    return {
        count: 1,
        late: 0,
        totals: null,
        oldest: null,
        rows: [],
        more: 0,
        href: "/list",
        codes: [],
        ...over,
    };
}

const MARK_SENT = need({
    id: "o1",
    title: "Send order #1057 to Aditya Shetty",
    sub: "Placed 23 Sep · 26 days late",
    amountMinor: 102_000,
    currency: "INR",
    amountIn: "sub",
    tag: "Late · 26 days",
    tone: "bad",
    href: "/commerce/orders/o1",
    inline: inline({
        kind: "MARK_SENT",
        label: "Mark sent",
        confirm: "Aditya sees that the order is on its way.",
        yes: "Mark sent",
        done: "Marked sent",
        undoable: true,
        target: "o1",
        person: "Aditya",
        stage: "SHIPPED",
    }),
});

const ORDERS = group({
    kind: "ORDERS",
    count: 7,
    late: 3,
    rows: [MARK_SENT],
    more: 6,
    href: "/commerce/orders",
    codes: ["COMMERCE_OPEN_ORDERS"],
});

const TURN_DOWN = inline({
    kind: "TURN_DOWN",
    label: "Turn down",
    confirm:
        "This cancels Kavya's Cake tasting on Wed 21 Oct. Kavya is told, the payment link stops working, and the time opens up for someone else.",
    yes: "Turn down",
    done: "Turned down",
    sends: true,
    target: "b1",
    person: "Kavya",
});

const PAY_LINK = inline({
    kind: "SEND_PAY_LINK",
    label: "Send payment link",
    confirm:
        "This makes a new payment link for Kavya's Cake tasting, and the link sent before stops working. Saroh doesn't send it: share it with Kavya on WhatsApp or SMS.",
    yes: "Make the link",
    done: "Payment link ready",
    target: "b1",
    person: "Kavya",
});

const AWAITING = group({
    kind: "AWAITING_PAYMENT",
    count: 1,
    rows: [
        need({
            id: "b1",
            code: "APPOINTMENTS_AWAITING_PAYMENT",
            title: "Kavya Iyer · Cake tasting",
            sub: "Wed 21 Oct, 12:00",
            amountMinor: 50_000,
            currency: "INR",
            amountIn: "sub",
            href: "/bookings/b1",
            inline: PAY_LINK,
            second: TURN_DOWN,
        }),
    ],
    href: "/bookings",
    codes: ["APPOINTMENTS_AWAITING_PAYMENT"],
});

describe("NeedGroupBody: each kind", () => {
    it("orders: each row links to its order, with its action, then the rest", () => {
        draw(ORDERS);
        const row = rowOf("Send order #1057");
        expect(row.querySelector("a")?.getAttribute("href")).toBe(
            "/commerce/orders/o1",
        );
        expect(row.textContent).toContain("₹1,020");
        expect(row.textContent).toContain("Late · 26 days");
        expect(hasButton(row, "Mark sent")).toBe(true);
        expect(linkIn(host, "6 more orders")?.getAttribute("href")).toBe(
            "/commerce/orders",
        );
    });

    it("bills: the rest of the overdue and the bills not due yet", () => {
        draw(
            group({
                kind: "BILLS",
                count: 10,
                late: 10,
                all: 16,
                more: 5,
                href: "/billing/invoices?view=overdue",
                rows: [
                    need({
                        id: "i1",
                        code: "PAYMENTS_OVERDUE_INVOICES",
                        title: "from Shruti Menon",
                        amountMinor: 1_125_000,
                        currency: "INR",
                        amountIn: "title",
                        tag: "Late · 29 days",
                        tone: "bad",
                        inline: inline({
                            kind: "SEND_REMINDER",
                            label: "Send reminder",
                            sends: true,
                        }),
                    }),
                ],
                codes: ["PAYMENTS_OVERDUE_INVOICES"],
            }),
        );
        expect(host.textContent).toContain("₹11,250 from Shruti Menon");
        expect(hasButton(rowOf("Shruti"), "Send reminder")).toBe(true);
        expect(linkIn(host, "5 more overdue, 6 not due yet")).toBeTruthy();
    });

    it("awaiting payment: Send payment link, and Turn down quietly beside it", () => {
        draw(AWAITING);
        const row = rowOf("Kavya Iyer");
        expect(row.textContent).toContain("₹500");
        const buttons = Array.from(row.querySelectorAll("button")).map(
            (b) => b.textContent,
        );
        expect(buttons).toEqual(["Send payment link", "Turn down"]);
        expect(host.textContent).not.toContain("more");
    });

    it("enquiries and reviews: Reply", () => {
        draw(
            group({
                kind: "ENQUIRIES",
                rows: [
                    need({
                        id: "c1",
                        code: "CRM_UNANSWERED_MESSAGES",
                        title: "Rohan Kapoor · Wedding cake",
                        tag: "Waiting 2 days",
                        inline: inline({
                            kind: "REPLY",
                            label: "Reply",
                            yes: "Send reply",
                            sends: true,
                            person: "Rohan",
                        }),
                    }),
                ],
                more: 2,
                count: 3,
            }),
        );
        expect(hasButton(rowOf("Rohan"), "Reply")).toBe(true);
        expect(linkIn(host, "2 more enquiries")).toBeTruthy();
    });

    it("payments: Retry by payment link and Refund", () => {
        draw(
            group({
                kind: "PAYMENTS",
                count: 2,
                rows: [
                    need({
                        id: "s1",
                        code: "PAYMENTS_FAILED_RENEWALS",
                        title: "Priya Raman's card was declined",
                        inline: inline({
                            kind: "RETRY",
                            label: "Retry by payment link",
                            via: "PAY_LINK",
                        }),
                    }),
                    need({
                        id: "r1",
                        code: "PAYMENTS_REFUNDS_OWED",
                        title: "Refund ₹500 to Anil Gupta",
                        inline: inline({
                            kind: "REFUND",
                            label: "Refund ₹500",
                        }),
                    }),
                ],
            }),
        );
        expect(hasButton(rowOf("Priya"), "Retry by payment link")).toBe(true);
        expect(hasButton(rowOf("Anil"), "Refund ₹500")).toBe(true);
    });

    it("low stock: Add stock on the product's stock, and where levels are set", () => {
        draw(
            group({
                kind: "STOCK",
                count: 2,
                rows: [
                    need({
                        id: "sl1",
                        code: "COMMERCE_STOCK_LOW",
                        title: "Seeded multigrain loaf",
                        sub: "3 left · sells about 9 a day",
                        tag: "Low",
                        href: "/commerce/stock?product=p1",
                    }),
                ],
                more: 1,
                href: "/commerce/stock?show=needs",
                codes: ["COMMERCE_STOCK_LOW"],
            }),
        );
        const row = rowOf("Seeded multigrain loaf");
        expect(linkIn(row, "Add stock")?.getAttribute("href")).toBe(
            "/commerce/stock?product=p1",
        );
        expect(host.textContent).toContain(
            "Only products with a stock level show here.",
        );
        expect(linkIn(host, "Set stock levels")?.getAttribute("href")).toBe(
            "/commerce/stock",
        );
        expect(linkIn(host, "1 more product")).toBeTruthy();
    });

    it("setup: the row is a link and nothing more", () => {
        draw(
            group({
                kind: "SETUP",
                rows: [
                    need({
                        id: "w1",
                        code: "SITES_NOT_LIVE",
                        title: "Your website isn't live",
                        href: "/sites/w1",
                    }),
                ],
            }),
        );
        expect(rowOf("website").querySelectorAll("button")).toHaveLength(0);
        expect(rowOf("website").querySelector("a")?.getAttribute("href")).toBe(
            "/sites/w1",
        );
    });
});

describe("NeedGroupBody: inline actions", () => {
    it("Mark sent confirms in the row, then Undo puts the order back", async () => {
        calls.moveStage.mockResolvedValue({
            ok: true,
            data: { eventId: "e1" },
        });
        calls.undoStage.mockResolvedValue({ ok: true, data: { told: false } });
        draw(ORDERS);
        act(() => buttonIn(rowOf("#1057"), "Mark sent").click());
        const confirm = rowOf("#1057").querySelector('[role="alertdialog"]');
        expect(confirm?.textContent).toContain("Aditya sees that the order");
        // Nothing moves until the confirm's own button.
        expect(calls.moveStage).not.toHaveBeenCalled();
        act(() => buttonIn(confirm as HTMLElement, "Mark sent").click());
        await settle();
        expect(calls.moveStage).toHaveBeenCalledWith("o1", { to: "SHIPPED" });
        const row = rowOf("#1057");
        expect(row.textContent).toMatch(/Marked sent \d{1,2}:\d{2} [ap]m/);
        expect(row.querySelector(".line-through")).toBeTruthy();
        act(() => buttonIn(row, "Undo").click());
        await settle();
        expect(calls.undoStage).toHaveBeenCalledWith("o1", "e1");
        expect(hasButton(rowOf("#1057"), "Mark sent")).toBe(true);
    });

    it("Reply opens its box in the row, named, counted, and held ten seconds", async () => {
        calls.replyAction.mockResolvedValue({ ok: true, data: {} });
        draw(
            group({
                kind: "ENQUIRIES",
                rows: [
                    need({
                        id: "c1",
                        code: "CRM_UNANSWERED_MESSAGES",
                        title: "Rohan Kapoor · Wedding cake",
                        inline: inline({
                            kind: "REPLY",
                            label: "Reply",
                            confirm: "Rohan gets your reply by email.",
                            yes: "Send reply",
                            done: "Reply sent to Rohan",
                            sends: true,
                            target: "contact-1",
                            person: "Rohan",
                        }),
                    }),
                ],
            }),
        );
        act(() => buttonIn(rowOf("Rohan"), "Reply").click());
        const box = host.querySelector("textarea");
        expect(box).toBeTruthy();
        const label = host.querySelector(`label[for="${box?.id}"]`);
        expect(label?.textContent).toBe("Reply to Rohan");
        expect(box?.maxLength).toBe(2000);
        expect(host.textContent).toContain("0 of 2,000");
        // Nothing to send yet.
        expect(buttonIn(host, "Send reply").disabled).toBe(true);
        act(() => {
            const descriptor = Object.getOwnPropertyDescriptor(
                HTMLTextAreaElement.prototype,
                "value",
            );
            descriptor?.set?.call(box, "Yes, we can.");
            box?.dispatchEvent(new Event("input", { bubbles: true }));
        });
        expect(host.textContent).toContain("12 of 2,000");
        act(() => buttonIn(host, "Send reply").click());
        await settle();
        expect(calls.replyAction).not.toHaveBeenCalled();
        await holdEnds();
        expect(calls.replyAction).toHaveBeenCalledWith(
            "contact-1",
            "Yes, we can.",
        );
        expect(rowOf("Rohan").textContent).toContain("Reply sent to Rohan");
    });

    it("Retry by payment link gives the new link to copy", async () => {
        calls.retrySubscription.mockResolvedValue({
            ok: true,
            data: { url: "https://pay.example.com/l/abc", paid: false },
        });
        draw(
            group({
                kind: "PAYMENTS",
                rows: [
                    need({
                        id: "s1",
                        code: "PAYMENTS_FAILED_RENEWALS",
                        title: "Priya Raman's card was declined",
                        inline: inline({
                            kind: "RETRY",
                            label: "Retry by payment link",
                            yes: "Make a new link",
                            done: "New link made",
                            target: "sub-1",
                            via: "PAY_LINK",
                        }),
                    }),
                ],
            }),
        );
        act(() => buttonIn(rowOf("Priya"), "Retry by payment link").click());
        act(() => buttonIn(host, "Make a new link").click());
        await settle();
        expect(calls.retrySubscription).toHaveBeenCalledWith(
            "sub-1",
            "PAY_LINK",
        );
        const row = rowOf("Priya");
        expect(row.textContent).toContain("New link made");
        expect(row.textContent).toMatch(/Copy/);
    });

    it("Send payment link is held ten seconds, then makes the link to copy", async () => {
        calls.makePayLink.mockResolvedValue({
            ok: true,
            url: "https://pay.example.com/b/xyz",
        });
        draw(AWAITING);
        act(() => buttonIn(rowOf("Kavya"), "Send payment link").click());
        const confirm = rowOf("Kavya").querySelector('[role="alertdialog"]');
        expect(confirm?.textContent).toContain(
            "the link sent before stops working",
        );
        act(() => buttonIn(confirm as HTMLElement, "Make the link").click());
        await settle();
        expect(rowOf("Kavya").textContent).toContain(
            "Making the link in 10 seconds",
        );
        expect(calls.makePayLink).not.toHaveBeenCalled();
        await holdEnds();
        expect(calls.makePayLink).toHaveBeenCalledWith("b1");
        const row = rowOf("Kavya");
        expect(row.textContent).toContain("Payment link ready");
        expect(row.textContent).toMatch(/Copy/);
    });

    it("Send payment link undone makes no link", async () => {
        draw(AWAITING);
        act(() => buttonIn(rowOf("Kavya"), "Send payment link").click());
        act(() => buttonIn(host, "Make the link").click());
        await settle();
        act(() => buttonIn(rowOf("Kavya"), "Undo").click());
        await settle();
        await holdEnds();
        expect(calls.makePayLink).not.toHaveBeenCalled();
        expect(hasButton(rowOf("Kavya"), "Send payment link")).toBe(true);
    });

    it("Turn down is held with Undo, and undone leaves the booking as it was", async () => {
        draw(AWAITING);
        act(() => buttonIn(rowOf("Kavya"), "Turn down").click());
        const confirm = rowOf("Kavya").querySelector('[role="alertdialog"]');
        expect(confirm?.textContent).toContain("This cancels Kavya's");
        act(() => buttonIn(confirm as HTMLElement, "Turn down").click());
        await settle();
        expect(rowOf("Kavya").textContent).toContain(
            "Turning down in 10 seconds",
        );
        expect(calls.toast.showUndo).toHaveBeenCalledWith(
            "Turning down in 10 seconds",
            expect.any(Function),
            expect.anything(),
        );
        act(() => buttonIn(rowOf("Kavya"), "Undo").click());
        await settle();
        await holdEnds();
        expect(calls.turnDownBooking).not.toHaveBeenCalled();
        expect(calls.toast.showSuccess).toHaveBeenCalledWith(
            "Not turned down. The booking stands.",
        );
        expect(hasButton(rowOf("Kavya"), "Turn down")).toBe(true);
    });

    it("Turn down, left to run, cancels the booking through its own cancel", async () => {
        calls.turnDownBooking.mockResolvedValue({ ok: true, data: {} });
        draw(AWAITING);
        act(() => buttonIn(rowOf("Kavya"), "Turn down").click());
        act(() => buttonIn(confirmIn(rowOf("Kavya")), "Turn down").click());
        await settle();
        await holdEnds();
        expect(calls.turnDownBooking).toHaveBeenCalledWith("b1");
        const row = rowOf("Kavya");
        expect(row.textContent).toContain("Turned down");
        expect(hasButton(row, "Undo")).toBe(false);
    });

    it("a booking paid during the hold stands, and the row says They just paid (review #11)", async () => {
        calls.turnDownBooking.mockResolvedValue({
            ok: false,
            error: "They just paid. The booking stands.",
            paid: true,
        });
        draw(AWAITING);
        act(() => buttonIn(rowOf("Kavya"), "Turn down").click());
        act(() => buttonIn(confirmIn(rowOf("Kavya")), "Turn down").click());
        await settle();
        await holdEnds();
        const row = rowOf("Kavya");
        expect(row.textContent).toContain("They just paid");
        expect(row.textContent).not.toContain("Turned down");
        expect(calls.toast.showError).not.toHaveBeenCalled();
        expect(calls.toast.showSuccess).toHaveBeenCalledWith(
            "They just paid",
            "The booking stands.",
        );
    });

    it("a refused Turn down puts the row back and says why", async () => {
        calls.turnDownBooking.mockResolvedValue({
            ok: false,
            error: "This booking has already started.",
        });
        draw(AWAITING);
        act(() => buttonIn(rowOf("Kavya"), "Turn down").click());
        act(() => buttonIn(confirmIn(rowOf("Kavya")), "Turn down").click());
        await settle();
        await holdEnds();
        expect(calls.toast.showError).toHaveBeenCalledWith(
            "The booking wasn't turned down.",
            "This booking has already started.",
        );
        expect(hasButton(rowOf("Kavya"), "Turn down")).toBe(true);
    });

    it("Cancel closes the confirm and nothing happens; one confirm at a time", () => {
        draw(AWAITING);
        act(() => buttonIn(rowOf("Kavya"), "Send payment link").click());
        expect(host.querySelectorAll('[role="alertdialog"]')).toHaveLength(1);
        act(() => buttonIn(host, "Cancel").click());
        expect(host.querySelectorAll('[role="alertdialog"]')).toHaveLength(0);
        expect(calls.makePayLink).not.toHaveBeenCalled();
    });
});

describe("NeedGroupBody: a role without money (DEC-098)", () => {
    it("shows the rows without amounts, and only what the role may do", () => {
        draw(
            group({
                kind: "AWAITING_PAYMENT",
                rows: [
                    need({
                        id: "b1",
                        code: "APPOINTMENTS_AWAITING_PAYMENT",
                        title: "Kavya Iyer · Cake tasting",
                        sub: "Wed 21 Oct, 12:00",
                        // The API sent no amount, and no Send payment link
                        // (A8): Turn down is the row's own action.
                        inline: TURN_DOWN,
                    }),
                ],
            }),
        );
        const row = rowOf("Kavya");
        expect(row.textContent).not.toContain("₹");
        const buttons = Array.from(row.querySelectorAll("button")).map(
            (b) => b.textContent,
        );
        expect(buttons).toEqual(["Turn down"]);
    });
});
