// @vitest-environment jsdom
import type { ReactNode } from "react";
import { act } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { OrderRead, OrderReadLine } from "@/lib/orders/read";

import { OrderDetail } from "./order-detail";

/**
 * Order Detail is read first (owner, 10 Oct): status, items, payments and
 * the timeline, each with its button, and every change — hand to courier,
 * tracking, edit, refund, how it's fulfilled, cancel — in a side sheet, one
 * at a time. Nothing is recorded until the sheet's own button; Cancel drops
 * the draft; a refusal leaves it open with what was typed; a save closes
 * it and gives the keyboard back.
 *
 * Drawn with `react-dom/client` + `act` on the real page and the real
 * sheet, so the dialog's role, name and focus return are what is tested.
 * The Server Actions, the router and the toasts are stand-ins; the menu,
 * the pay link and the money card are not this file's subject.
 */

const actions = {
    moveStage: vi.fn(),
    saveCourier: vi.fn(),
    undoStage: vi.fn(),
    editBeforePreparing: vi.fn(),
    recordPayment: vi.fn(),
    refundLines: vi.fn(),
    retryRefund: vi.fn(),
    changeFulfilment: vi.fn(),
    cancelOrder: vi.fn(),
};
vi.mock("@/lib/orders/actions", () => ({
    moveStage: (...a: unknown[]) => actions.moveStage(...a) as unknown,
    saveCourier: (...a: unknown[]) => actions.saveCourier(...a) as unknown,
    undoStage: (...a: unknown[]) => actions.undoStage(...a) as unknown,
    editBeforePreparing: (...a: unknown[]) =>
        actions.editBeforePreparing(...a) as unknown,
    recordPayment: (...a: unknown[]) => actions.recordPayment(...a) as unknown,
    refundLines: (...a: unknown[]) => actions.refundLines(...a) as unknown,
    retryRefund: (...a: unknown[]) => actions.retryRefund(...a) as unknown,
    changeFulfilment: (...a: unknown[]) =>
        actions.changeFulfilment(...a) as unknown,
    cancelOrder: (...a: unknown[]) => actions.cancelOrder(...a) as unknown,
}));
const refresh = vi.fn();
vi.mock("next/navigation", () => ({
    useRouter: () => ({ refresh, push: vi.fn(), replace: vi.fn() }),
}));
vi.mock("next/link", () => ({
    default: ({ href, children }: { href: string; children?: ReactNode }) => (
        <a href={href}>{children}</a>
    ),
}));
const toast = {
    showError: vi.fn(),
    showSuccess: vi.fn(),
    showInfo: vi.fn(),
    showWarning: vi.fn(),
    showUndo: vi.fn(),
    dismissToasts: vi.fn(),
};
vi.mock("@saroh/ui/toast", () => ({
    showError: (...a: unknown[]) => toast.showError(...a) as unknown,
    showSuccess: (...a: unknown[]) => toast.showSuccess(...a) as unknown,
    showInfo: (...a: unknown[]) => toast.showInfo(...a) as unknown,
    showWarning: (...a: unknown[]) => toast.showWarning(...a) as unknown,
    showUndo: (...a: unknown[]) => toast.showUndo(...a) as unknown,
    dismissToasts: () => toast.dismissToasts() as unknown,
}));
vi.mock("@/components/commerce/order-actions", () => ({
    OrderActions: () => null,
}));
vi.mock("./pay-link", () => ({
    usePayLink: () => ({ ask: vi.fn(), busy: false, dialog: null }),
    PayLinkBlock: () => null,
}));
// A treatment's "Book visit N" brings the booking dialog's server reads.
vi.mock("./visits-next", () => ({ VisitsNextAction: () => null }));
vi.mock("./money-card", () => ({
    MoneyCard: () => <section aria-label="Money" />,
}));

const line = (over: Partial<OrderReadLine> = {}): OrderReadLine => ({
    id: "l1",
    productId: "p1",
    name: "Seeded loaf",
    variantTitle: null,
    sku: null,
    imageUrl: null,
    allergens: { contains: [], mayContain: [] },
    quantity: 2,
    refundedQuantity: 0,
    price: "120.00",
    ...over,
});

const PICKUP_STEPS = [
    { stage: "NEW", label: "New" },
    { stage: "PREPARING", label: "Preparing" },
    { stage: "READY", label: "Ready" },
    { stage: "COLLECTED", label: "Collected" },
] as OrderRead["steps"];
const SHIPPING_STEPS = [
    { stage: "NEW", label: "New" },
    { stage: "PREPARING", label: "Preparing" },
    { stage: "READY", label: "Ready" },
    { stage: "HANDED_TO_COURIER", label: "With courier" },
    { stage: "DELIVERED", label: "Delivered" },
] as OrderRead["steps"];

/** A new pick-up order, paid online: everything about it can still change. */
const order = (over: Partial<OrderRead> = {}): OrderRead => ({
    id: "o1",
    orderId: "1063",
    placedAt: "2026-10-10T08:00:00Z",
    updatedAt: "2026-10-10T08:00:00Z",
    store: { id: "s1", name: "Hill Road" },
    status: "PROCESSING",
    paymentStatus: "PAID",
    refundStanding: "NONE",
    stage: "NEW",
    fulfilmentType: "PICKUP",
    fulfilmentLabel: "Pick-up",
    steps: PICKUP_STEPS,
    stepIndex: 0,
    ticketName: null,
    customer: {
        id: "c1",
        name: "Priya Raman",
        phone: null,
        contactId: null,
        orderCount: 1,
        firstOrderAt: null,
    },
    deliveryAddress: null,
    notes: null,
    trackingUrl: null,
    items: [line(), line({ id: "l2", name: "Rye loaf", quantity: 1 })],
    events: [],
    next: {
        stages: ["PREPARING"],
        undo: null,
        editable: true,
        fulfilment: {
            options: [
                { type: "PICKUP", label: "Pick-up" },
                { type: "LOCAL_DELIVERY", label: "Local delivery" },
            ],
            refusal: null,
        },
        cancel: { refusal: null, pending: false },
        tell: false,
    },
    money: {
        currency: "INR",
        subtotal: "360.00",
        tax: "0.00",
        shipping: "0.00",
        discount: "0.00",
        total: "360.00",
        paid: "360.00",
        refunded: "0.00",
        leftToRefund: "360.00",
        due: "0.00",
        recordedByHand: false,
        discountCode: null,
        refundsBeingConfirmed: [],
    },
    invoices: [],
    ...over,
});

/** A parcel that is ready to hand over, going to an address. */
const readyToShip = (): OrderRead =>
    order({
        fulfilmentType: "SHIPPING",
        fulfilmentLabel: "Shipping",
        steps: SHIPPING_STEPS,
        stage: "READY",
        stepIndex: 2,
        ticketName: "Packing slip",
        deliveryAddress: {
            name: null,
            phone: null,
            line1: "14 Lake View Road",
            line2: null,
            city: "Pune",
            state: "Maharashtra",
            postalCode: "411001",
        },
        next: {
            stages: ["HANDED_TO_COURIER"],
            undo: null,
            editable: false,
            cancel: { refusal: null, pending: false },
        },
    });

/** The same parcel once the courier has it, with no number yet. */
const shipped = (): OrderRead => ({
    ...readyToShip(),
    stage: "HANDED_TO_COURIER",
    stepIndex: 3,
    courierName: "Delhivery",
    trackingNumber: null,
    next: { stages: ["DELIVERED"], undo: null, editable: false },
});

const ALL = {
    stage: true,
    edit: true,
    payLink: true,
    refund: true,
    contact: true,
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
    refresh.mockReset();
    for (const m of [...Object.values(actions), ...Object.values(toast)]) {
        m.mockReset();
    }
    // Left unanswered, a write is a refusal: never an accident that passes.
    for (const m of Object.values(actions)) {
        m.mockResolvedValue({ ok: false, error: "Not set up in this test." });
    }
});

afterEach(() => {
    act(() => root.unmount());
    document.body.innerHTML = "";
});

function render(
    read: OrderRead = order(),
    arrival: "refund" | "courier" | null = null,
) {
    act(() =>
        root.render(
            <OrderDetail
                order={read}
                notes={[]}
                payments={null}
                can={ALL}
                customerHref={null}
                arrival={arrival}
            />,
        ),
    );
}

const dialogs = () =>
    Array.from(document.body.querySelectorAll<HTMLElement>("[role=dialog]"));
const dialog = () => document.body.querySelector<HTMLElement>("[role=dialog]");

function dialogName() {
    const id = dialog()?.getAttribute("aria-labelledby");
    return id ? document.getElementById(id)?.textContent : undefined;
}

/** A button by its words or its accessible name, on the page or in the sheet. */
function button(name: string, within: ParentNode | null = host) {
    const found = Array.from(within?.querySelectorAll("button") ?? []).find(
        (b) =>
            b.textContent.trim() === name ||
            b.getAttribute("aria-label") === name,
    );
    if (!found) throw new Error(`No "${name}" button`);
    return found;
}

/** Press it, then let the write it starts and the closing sheet settle. */
async function press(el: HTMLElement) {
    await act(async () => {
        el.click();
        await new Promise((r) => setTimeout(r, 0));
    });
    await act(async () => {
        await new Promise((r) => setTimeout(r, 0));
    });
}

function field(label: string) {
    const el = Array.from(dialog()?.querySelectorAll("label") ?? [])
        .find((l) => l.textContent.trim().startsWith(label))
        ?.querySelector("input");
    if (!el) throw new Error(`No "${label}" field`);
    return el;
}

function type(el: HTMLInputElement, value: string) {
    act(() => {
        Object.getOwnPropertyDescriptor(
            HTMLInputElement.prototype,
            "value",
        )?.set?.call(el, value);
        el.dispatchEvent(new Event("input", { bubbles: true }));
    });
}

async function escape() {
    await act(async () => {
        document.dispatchEvent(
            new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
        );
        await new Promise((r) => setTimeout(r, 0));
    });
}

/** How many of a line the Edit sheet now asks for. */
const quantity = (index: number) =>
    dialog()?.querySelectorAll("[aria-live=polite].tabular-nums")[index]
        ?.textContent;

describe("Order Detail is read first", () => {
    it("draws the order with its buttons and nothing to type in", () => {
        render();
        expect(host.textContent).toContain("#1063");
        expect(host.textContent).toContain("Seeded loaf");
        expect(host.textContent).toContain("Change this order");
        expect(dialog()).toBe(null);
        expect(host.querySelector("input, select, textarea")).toBe(null);
    });

    it("opens each change in a sheet named for it", async () => {
        const opens: [string, string][] = [
            ["Edit items or address", "Edit #1063"],
            ["Refund…", "What are you refunding?"],
            ["Change how it's fulfilled…", "Change how it's fulfilled"],
            ["Cancel order…", "Cancel #1063?"],
        ];
        render();
        for (const [opener, name] of opens) {
            await press(button(opener));
            expect(dialogName()).toBe(name);
            // The page keeps no copy of the fields.
            expect(host.querySelector("input, select, textarea")).toBe(null);
            await press(button("Cancel", dialog()));
            expect(dialog()).toBe(null);
        }
    });

    it("opens Hand to courier from the next step, and says where it goes", async () => {
        render(readyToShip());
        await press(button("Hand to courier"));
        expect(dialogName()).toBe("Hand to courier");
        expect(dialog()?.textContent).toContain(
            "To 14 Lake View Road, Pune 411001, Maharashtra",
        );
        expect(button("Packing slip", dialog())).toBeTruthy();
    });

    it("opens Tracking from the customer card, on its number", async () => {
        render(shipped());
        await press(button("Add the tracking number"));
        expect(dialogName()).toBe("Tracking");
        expect(document.activeElement).toBe(field("Tracking number"));
    });

    it("opens the refund or the courier sheet when the list asked for it", () => {
        render(order(), "refund");
        expect(dialogName()).toBe("What are you refunding?");
        act(() => root.unmount());
        root = createRoot(host);
        render(readyToShip(), "courier");
        expect(dialogName()).toBe("Hand to courier");
    });
});

describe("one sheet at a time", () => {
    it("puts the page out of reach while a sheet is open", async () => {
        render();
        await press(button("Edit items or address"));
        expect(dialogs()).toHaveLength(1);
        // Radix hides everything else from the keyboard and a reader, so
        // no second button on the page can be pressed.
        expect(host.getAttribute("aria-hidden")).toBe("true");

        await press(button("Cancel", dialog()));
        expect(host.getAttribute("aria-hidden")).toBe(null);
        await press(button("Refund…"));
        expect(dialogs()).toHaveLength(1);
        expect(dialogName()).toBe("What are you refunding?");
    });
});

describe("Cancel, Escape and the close button", () => {
    it("leave the order as it was and drop the draft", async () => {
        render();
        const edit = button("Edit items or address");
        act(() => edit.focus());
        await press(edit);
        await press(button("One more Seeded loaf", dialog()));
        expect(quantity(0)).toBe("3");
        await press(button("Cancel", dialog()));

        expect(dialog()).toBe(null);
        expect(actions.editBeforePreparing).not.toHaveBeenCalled();
        expect(refresh).not.toHaveBeenCalled();
        // The keyboard is back on the button that opened it.
        expect(document.activeElement).toBe(edit);

        // Opened again, it starts from the order, not the last draft.
        await press(edit);
        expect(quantity(0)).toBe("2");

        await press(button("One fewer Seeded loaf", dialog()));
        await escape();
        expect(dialog()).toBe(null);
        await press(edit);
        expect(quantity(0)).toBe("2");

        await press(button("Close", dialog()));
        expect(dialog()).toBe(null);
        expect(actions.editBeforePreparing).not.toHaveBeenCalled();
    });

    it("drop a cancel that was never confirmed", async () => {
        render();
        await press(button("Cancel order…"));
        await press(button("Cancel", dialog()));
        expect(dialog()).toBe(null);
        expect(actions.cancelOrder).not.toHaveBeenCalled();
        expect(host.textContent).not.toMatch(/Cancelling/);
    });
});

describe("a refusal", () => {
    it("keeps the Edit sheet open with what was changed", async () => {
        actions.editBeforePreparing.mockResolvedValue({
            ok: false,
            error: "Preparing has started.",
        });
        render();
        await press(button("Edit items or address"));
        await press(button("One more Seeded loaf", dialog()));
        await press(button("Save — ₹120 more due", dialog()));

        expect(actions.editBeforePreparing).toHaveBeenCalledWith("o1", {
            lines: [{ itemId: "l1", quantity: 3 }],
        });
        expect(toast.showError).toHaveBeenCalledWith("Preparing has started.");
        expect(dialogName()).toBe("Edit #1063");
        expect(quantity(0)).toBe("3");
        expect(refresh).not.toHaveBeenCalled();
    });

    it("keeps the Tracking sheet open with the number typed", async () => {
        actions.saveCourier.mockResolvedValue({
            ok: false,
            error: "That number is too long.",
        });
        render(shipped());
        await press(button("Add the tracking number"));
        type(field("Tracking number"), "1487 2290 3314");
        await press(button("Save", dialog()));

        expect(actions.saveCourier).toHaveBeenCalledWith("o1", {
            trackingNumber: "1487 2290 3314",
        });
        expect(toast.showError).toHaveBeenCalledWith(
            "That number is too long.",
        );
        expect(dialogName()).toBe("Tracking");
        expect(field("Tracking number").value).toBe("1487 2290 3314");
    });

    it("keeps Hand to courier open when the step is refused", async () => {
        actions.moveStage.mockResolvedValue({
            ok: false,
            error: "It isn't paid yet.",
        });
        render(readyToShip());
        await press(button("Hand to courier"));
        type(field("Tracking number"), "BD 9920 1140");
        await press(button("Handed over", dialog()));

        expect(toast.showError).toHaveBeenCalledWith("It isn't paid yet.");
        expect(dialogName()).toBe("Hand to courier");
        expect(field("Tracking number").value).toBe("BD 9920 1140");
        expect(toast.showUndo).not.toHaveBeenCalled();
    });
});

describe("a save", () => {
    it("closes the Edit sheet, says what it did and re-reads the order", async () => {
        actions.editBeforePreparing.mockResolvedValue({
            ok: true,
            data: { settleCents: 0, dueCents: 0, handBackCents: 0 },
        });
        render();
        const edit = button("Edit items or address");
        act(() => edit.focus());
        await press(edit);
        await press(button("One more Seeded loaf", dialog()));
        await press(button("One fewer Rye loaf", dialog()));
        await press(button("Save", dialog()));

        expect(dialog()).toBe(null);
        expect(toast.showSuccess).toHaveBeenCalledWith("Saved.");
        expect(refresh).toHaveBeenCalledTimes(1);
        expect(document.activeElement).toBe(edit);
    });

    it("can't be dismissed while it is on its way", async () => {
        let answer: (v: unknown) => void = () => undefined;
        actions.editBeforePreparing.mockReturnValue(
            new Promise((resolve) => {
                answer = resolve;
            }),
        );
        render();
        await press(button("Edit items or address"));
        await press(button("One more Seeded loaf", dialog()));
        await press(button("Save — ₹120 more due", dialog()));

        expect(button("Cancel", dialog()).disabled).toBe(true);
        await escape();
        await press(button("Close", dialog()));
        expect(dialogName()).toBe("Edit #1063");

        await act(async () => {
            answer({ ok: true, data: { settleCents: 0 } });
            await new Promise((r) => setTimeout(r, 0));
        });
        await act(async () => {
            await new Promise((r) => setTimeout(r, 0));
        });
        expect(dialog()).toBe(null);
    });

    it("hands over to the courier and offers Undo once the sheet is gone", async () => {
        actions.moveStage.mockResolvedValue({
            ok: true,
            data: { eventId: "e1" },
        });
        render(readyToShip());
        await press(button("Hand to courier"));
        type(field("Tracking number"), "BD 9920 1140");
        await press(button("Handed over", dialog()));

        expect(actions.moveStage).toHaveBeenCalledWith("o1", {
            to: "HANDED_TO_COURIER",
            courierName: "Delhivery",
            trackingNumber: "BD 9920 1140",
        });
        expect(dialog()).toBe(null);
        expect(toast.showUndo).toHaveBeenCalledWith(
            "Handed to Delhivery · BD 9920 1140.",
            expect.any(Function),
            { duration: 10_000 },
        );
        expect(refresh).toHaveBeenCalledTimes(1);
    });

    it("changes how it's fulfilled and closes", async () => {
        actions.changeFulfilment.mockResolvedValue({
            ok: true,
            data: {
                settleCents: 0,
                differenceCents: 0,
                byHand: false,
                told: false,
            },
        });
        render();
        await press(button("Change how it's fulfilled…"));
        const sheet = dialog();
        const delivery = Array.from(
            sheet?.querySelectorAll<HTMLElement>("[role=radio]") ?? [],
        ).find((r) => r.textContent === "Local delivery");
        if (!delivery) throw new Error("No Local delivery");
        await press(delivery);
        for (const [name, value] of [
            ["Street and number", "14 Lake View Road"],
            ["Town or city", "Pune"],
            ["State", "Maharashtra"],
            ["PIN code", "411001"],
        ]) {
            const input = sheet?.querySelector<HTMLInputElement>(
                `input[aria-label="${name}"]`,
            );
            if (!input) throw new Error(`No ${name}`);
            type(input, value);
        }
        type(field("Delivery charge"), "0");
        await press(button("Save", dialog()));

        expect(actions.changeFulfilment).toHaveBeenCalledTimes(1);
        expect(dialog()).toBe(null);
        expect(toast.showSuccess).toHaveBeenCalledWith(
            "Now local delivery.",
            "Nothing was sent to Priya.",
        );
    });
});

describe("a refund and a cancel are held on the page, with Undo", () => {
    it("closes the refund sheet into the ten-second hold, and Undo sends nothing", async () => {
        render();
        await press(button("Refund…"));
        const first = dialog()?.querySelector<HTMLElement>("[role=checkbox]");
        if (!first) throw new Error("No line to tick");
        await press(first);
        await press(button("Refund ₹240", dialog()));

        expect(dialog()).toBe(null);
        expect(host.textContent).toMatch(/Refunding ₹240 in \d+s/);
        expect(actions.refundLines).not.toHaveBeenCalled();

        await press(button("Undo"));
        expect(toast.showInfo).toHaveBeenCalledWith(
            "Refund cancelled. Nothing was sent back.",
        );
        expect(actions.refundLines).not.toHaveBeenCalled();
        expect(host.textContent).not.toMatch(/Refunding/);
    });

    it("refunds what was chosen when the hold is ended now", async () => {
        actions.refundLines.mockResolvedValue({
            ok: true,
            data: { amountCents: 24000, beingConfirmed: false },
        });
        render();
        await press(button("Refund…"));
        const first = dialog()?.querySelector<HTMLElement>("[role=checkbox]");
        if (!first) throw new Error("No line to tick");
        await press(first);
        await press(button("Refund ₹240", dialog()));
        await press(button("Refund now"));

        expect(actions.refundLines).toHaveBeenCalledWith(
            "o1",
            expect.objectContaining({
                lines: [{ itemId: "l1", quantity: 2 }],
                putBack: [],
                reason: null,
                goodwill: null,
            }),
        );
        expect(toast.showSuccess).toHaveBeenCalledWith(
            "Refunded ₹240. The rest of the order stands.",
            undefined,
        );
    });

    it("closes the cancel sheet into its hold, and says how much goes back first", async () => {
        render();
        await press(button("Cancel order…"));
        expect(dialog()?.textContent).toContain(
            "It stays on record as cancelled, never deleted.",
        );
        expect(dialog()?.textContent).toContain("₹360");
        await press(button("Refund ₹360", dialog()));

        expect(dialog()).toBe(null);
        expect(host.textContent).toMatch(
            /Cancelling and refunding ₹360 in \d+s/,
        );
        expect(actions.cancelOrder).not.toHaveBeenCalled();
        await press(button("Undo"));
        expect(toast.showInfo).toHaveBeenCalledWith(
            "Not cancelled. Nothing was sent back.",
        );
        expect(actions.cancelOrder).not.toHaveBeenCalled();
    });
});
