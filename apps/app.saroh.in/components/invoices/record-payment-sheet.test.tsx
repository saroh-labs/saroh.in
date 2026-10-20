// @vitest-environment jsdom
/**
 * Record payment (DEC-173, U10 #1122; INVRecordPlus): a part payment and
 * all of what is left, a cheque with its number and bank, more than is
 * left refused with what was typed kept, Undo removing what was recorded,
 * the receipt (emailed, or offered on WhatsApp with no provider), the
 * sheet reading an invoice it was only given the id of, and a cheque's
 * two endings with U10's additions: the receipt offered on WhatsApp once
 * in the bank, and "Tell Vivek on WhatsApp after" a bounce. A role
 * without money is the details view's test (U9).
 *
 * `react-dom/client` + `act` directly, as the other component tests do.
 */
import { act } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { actions, toast, router, wa } = vi.hoisted(() => ({
    actions: {
        readInvoice: vi.fn(),
        recordPayment: vi.fn(),
        removePayment: vi.fn(),
        chequeCleared: vi.fn(),
        chequeBounced: vi.fn(),
        shareInvoice: vi.fn(),
    },
    toast: {
        showError: vi.fn(),
        showSuccess: vi.fn(),
        showUndo: vi.fn(() => "toast"),
        UNDO_MS: 10_000,
    },
    router: { refresh: vi.fn(), push: vi.fn(), replace: vi.fn() },
    wa: {
        offerWhatsAppReceipt: vi.fn(() => vi.fn()),
        openWhatsAppShare: vi.fn(() => Promise.resolve(true)),
    },
}));
vi.mock("@/lib/invoices/actions", () => actions);
vi.mock("@saroh/ui/toast", () => toast);
vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("./whatsapp-share", () => wa);
// A picked day, typed: the calendar popover is the date picker's own test.
vi.mock("@saroh/ui/date-picker", () => ({
    DatePicker: ({
        id,
        onValueChange,
        ...aria
    }: {
        id: string;
        value?: Date;
        onValueChange: (d: Date | undefined) => void;
        "aria-label"?: string;
    }) => (
        <input
            id={id}
            aria-label={aria["aria-label"]}
            data-day=""
            onChange={(e) => {
                const [y, m, d] = e.target.value.split("-").map(Number);
                onValueChange(new Date(y, m - 1, d));
            }}
        />
    ),
}));

import { ChequeBouncedDialog, ChequeClearedDialog } from "./cheque-dialogs";
import type { RecordPaymentInvoice } from "./record-payment-sheet";
import { RecordPaymentSheet, UNDONE_REASON } from "./record-payment-sheet";

import type { PaymentTarget } from "@/lib/invoices/record-payment";
import type { Invoice, InvoicePayment } from "@/lib/invoices/service";

const VIVEK: PaymentTarget = {
    id: "inv_106",
    number: "RC/26-27/0106",
    who: "Vivek Nair",
    currency: "INR",
    total: "8400.00",
    leftToPay: "8400.00",
    emailTo: "vivek@example.com",
};

const CHEQUE: InvoicePayment = {
    id: "pay_chq",
    amount: "8400.00",
    currency: "INR",
    method: "CHEQUE",
    reference: null,
    note: null,
    receivedAt: "2026-10-19T05:00:00.000Z",
    recordedAt: "2026-10-19T05:00:00.000Z",
    cheque: { number: "004512", bank: "HDFC Bank" },
    bankStatus: "WAITING",
    clearedAt: null,
    bouncedAt: null,
    bounceReason: null,
    removed: null,
    canRemove: true,
};

/** The invoice the API answers with, after a write. */
function answer(over: Partial<Invoice> = {}, paymentId = "pay_new") {
    return {
        ok: true,
        data: {
            id: "inv_106",
            total: "8400.00",
            currency: "INR",
            leftToPay: "4400.00",
            recorded: { paymentId, replayed: false },
            ...over,
        },
    };
}

let root: Root;
let host: HTMLDivElement;

beforeEach(() => {
    (
        globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    for (const fn of [
        ...Object.values(actions),
        toast.showError,
        toast.showSuccess,
        toast.showUndo,
        ...Object.values(router),
        ...Object.values(wa),
    ]) {
        fn.mockReset();
    }
    toast.showUndo.mockReturnValue("toast");
    wa.offerWhatsAppReceipt.mockReturnValue(vi.fn());
    wa.openWhatsAppShare.mockResolvedValue(true);
});

afterEach(() => {
    act(() => root.unmount());
    document.body.innerHTML = "";
});

// — helpers ———————————————————————————————————————————————————

const plain = (s: string | null | undefined) =>
    (s ?? "")
        .replace(/\u00a0/g, " ")
        .replace(/\s+/g, " ")
        .trim();

function button(name: string | RegExp) {
    const hit = Array.from(document.body.querySelectorAll("button")).find(
        (b) => {
            const w = plain(b.textContent);
            return typeof name === "string" ? w === name : name.test(w);
        },
    );
    if (!hit) throw new Error(`No "${String(name)}" button`);
    return hit;
}

const hasButton = (name: string | RegExp) => {
    try {
        button(name);
        return true;
    } catch {
        return false;
    }
};

/** A tick's box by the words beside it. */
function tick(words: string): HTMLElement {
    const l = Array.from(document.body.querySelectorAll("label")).find((el) =>
        plain(el.textContent).includes(words),
    );
    const box = l?.getAttribute("for")
        ? document.getElementById(l.getAttribute("for") ?? "")
        : null;
    if (!box) throw new Error(`No "${words}" tick`);
    return box;
}

/** A field's control by the words of its label. */
function field(label: string): HTMLInputElement {
    const l = Array.from(document.body.querySelectorAll("label")).find((el) =>
        plain(el.textContent).startsWith(label),
    );
    const id = l?.getAttribute("for");
    const el = id ? document.getElementById(id) : null;
    if (!el) throw new Error(`No "${label}" field`);
    return el as HTMLInputElement;
}

async function type(el: HTMLInputElement | HTMLTextAreaElement, value: string) {
    act(() => {
        const proto =
            el instanceof HTMLTextAreaElement
                ? HTMLTextAreaElement.prototype
                : HTMLInputElement.prototype;
        Object.getOwnPropertyDescriptor(proto, "value")?.set?.call(el, value);
        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await Promise.resolve();
}

/** The picked day's box (the date picker's stand-in). */
function dayBox(): HTMLInputElement {
    const box = document.querySelector<HTMLInputElement>("[data-day]");
    if (!box) throw new Error("No day box");
    return box;
}

async function press(el: HTMLElement) {
    await act(async () => {
        el.click();
        await new Promise((r) => setTimeout(r, 20));
    });
}

async function settle() {
    await act(async () => {
        await new Promise((r) => setTimeout(r, 30));
    });
}

const text = () => plain(document.body.textContent);

function drawSheet(invoice: RecordPaymentInvoice = VIVEK) {
    const onOpenChange = vi.fn();
    act(() =>
        root.render(
            <RecordPaymentSheet
                open
                onOpenChange={onOpenChange}
                invoice={invoice}
            />,
        ),
    );
    return onOpenChange;
}

/** The last Undo's words, its description and its way back. */
function lastUndo() {
    const call = toast.showUndo.mock.calls.at(-1) as unknown as
        [string, () => Promise<unknown>, { description?: string }?] | undefined;
    if (!call) throw new Error("No Undo toast");
    return { words: call[0], undo: call[1], description: call[2]?.description };
}

// — the sheet ———————————————————————————————————————————————————

describe("Record payment", () => {
    it("opens on all of what is left, with the invoice's line", async () => {
        drawSheet();
        await settle();
        expect(text()).toContain(
            "RC/26-27/0106 · Vivek Nair · ₹8,400 left of ₹8,400",
        );
        expect(field("Amount received").value).toBe("8400");
        expect(field("Amount received").getAttribute("inputmode")).toBe(
            "decimal",
        );
        expect(text()).toContain(
            "All of what's left. Type less for a part payment.",
        );
        expect(button("Record ₹8,400")).toBeTruthy();
        // UPI is chosen first, as it always was.
        expect(button("UPI").getAttribute("aria-checked")).toBe("true");
        expect(text()).toContain("UPI reference");
    });

    it("records a part payment, says what is left, and Undo removes it", async () => {
        const onOpenChange = drawSheet();
        await settle();
        await type(field("Amount received"), "4000");
        expect(text()).toContain(
            "₹4,400 stays to pay. The invoice reads “Partly paid”.",
        );
        await press(button("Cash"));
        actions.recordPayment.mockResolvedValue(answer());
        await press(button("Record ₹4,000"));
        await settle();

        expect(actions.recordPayment).toHaveBeenCalledWith(
            "inv_106",
            expect.objectContaining({ method: "CASH", amount: "4000.00" }),
        );
        const sent = actions.recordPayment.mock.calls[0]?.[1] as {
            receivedAt?: string;
        };
        expect(sent.receivedAt).toBeTruthy();
        expect(onOpenChange).toHaveBeenCalledWith(false);
        const u = lastUndo();
        expect(u.words).toBe("₹4,000 recorded on RC/26-27/0106. ₹4,400 left.");
        // Email is connected: the receipt goes by itself, and is said.
        expect(u.description).toBe("Receipt emailed to vivek@example.com");
        expect(wa.offerWhatsAppReceipt).not.toHaveBeenCalled();

        actions.removePayment.mockResolvedValue({
            ok: true,
            data: { leftToPay: "8400.00" },
        });
        await act(async () => {
            await u.undo();
        });
        expect(actions.removePayment).toHaveBeenCalledWith(
            "inv_106",
            "pay_new",
            UNDONE_REASON,
        );
        expect(router.refresh).toHaveBeenCalled();
    });

    it("records all of it and says it is paid in full", async () => {
        drawSheet();
        await settle();
        actions.recordPayment.mockResolvedValue(answer({ leftToPay: "0.00" }));
        await press(button("Record ₹8,400"));
        await settle();
        expect(actions.recordPayment).toHaveBeenCalledWith(
            "inv_106",
            expect.objectContaining({ method: "UPI", amount: "8400.00" }),
        );
        expect(lastUndo().words).toBe(
            "₹8,400 recorded on RC/26-27/0106. Paid in full.",
        );
    });

    it("puts all of it back from Another amount", async () => {
        drawSheet();
        await settle();
        await press(button("Another amount"));
        expect(field("Amount received").value).toBe("");
        await type(field("Amount received"), "1000");
        await press(button("All ₹8,400"));
        expect(field("Amount received").value).toBe("8400");
    });

    it("asks a cheque's number and bank, and records it waiting for the bank", async () => {
        drawSheet();
        await settle();
        expect(() => field("Cheque no.")).toThrow();
        await press(button("Cheque"));
        expect(field("Cheque no.")).toBeTruthy();
        expect(text()).toContain("Recorded as not in the bank yet.");
        // A cheque's receipt waits for the bank.
        expect(text()).toContain(
            "The receipt is emailed to vivek@example.com once you mark the cheque as in the bank.",
        );

        // The number is asked for, and nothing is written without it.
        await press(button("Record ₹8,400"));
        await settle();
        expect(actions.recordPayment).not.toHaveBeenCalled();
        expect(text()).toContain("Enter the cheque number.");

        await type(field("Cheque no."), "004512");
        await type(field("Bank"), "HDFC Bank");
        actions.recordPayment.mockResolvedValue(answer({ leftToPay: "0.00" }));
        await press(button("Record ₹8,400"));
        await settle();
        expect(actions.recordPayment).toHaveBeenCalledWith(
            "inv_106",
            expect.objectContaining({
                method: "CHEQUE",
                amount: "8400.00",
                chequeNumber: "004512",
                chequeBank: "HDFC Bank",
            }),
        );
        const u = lastUndo();
        expect(u.words).toBe(
            "Cheque for ₹8,400 recorded on RC/26-27/0106. Not in the bank yet.",
        );
        // "Receipt emailed" is never said for a cheque.
        expect(u.description).toBeUndefined();
        expect(wa.offerWhatsAppReceipt).not.toHaveBeenCalled();
    });

    it("refuses more than is left, keeps what was typed, and writes nothing", async () => {
        const onOpenChange = drawSheet();
        await settle();
        await type(field("Amount received"), "9000");
        await press(button("Record ₹9,000"));
        await settle();
        expect(actions.recordPayment).not.toHaveBeenCalled();
        expect(onOpenChange).not.toHaveBeenCalledWith(false);
        expect(text()).toContain(
            "₹9,000 is ₹600 more than what's left (₹8,400).",
        );
        expect(field("Amount received").value).toBe("9000");
        expect(field("Amount received").getAttribute("aria-invalid")).toBe(
            "true",
        );
        // Its way out: record what is left.
        await press(button("Record ₹8,400"));
        expect(field("Amount received").value).toBe("8400");
        expect(text()).not.toContain("more than what's left");
    });

    it("says the API's overpay refusal on the amount and stays open", async () => {
        const onOpenChange = drawSheet();
        await settle();
        actions.recordPayment.mockResolvedValue({
            ok: false,
            error: "That is more than what is left to pay (4400.00).",
            field: "amount",
        });
        await press(button("Record ₹8,400"));
        await settle();
        expect(text()).toContain(
            "That is more than what is left to pay (4400.00).",
        );
        expect(onOpenChange).not.toHaveBeenCalledWith(false);
        expect(toast.showUndo).not.toHaveBeenCalled();
    });

    it("refuses nothing typed", async () => {
        drawSheet();
        await settle();
        await type(field("Amount received"), "");
        await press(button("Record payment"));
        await settle();
        expect(actions.recordPayment).not.toHaveBeenCalled();
        expect(text()).toContain("Enter the amount received.");
    });

    it("with no email provider, offers the receipt on WhatsApp once Undo has passed", async () => {
        drawSheet({ ...VIVEK, emailTo: null });
        await settle();
        expect(text()).toContain(
            "No email provider yet, so Saroh can't email the receipt. Share it on WhatsApp after recording.",
        );
        const takeBack = vi.fn();
        wa.offerWhatsAppReceipt.mockReturnValue(takeBack);
        actions.recordPayment.mockResolvedValue(answer({ leftToPay: "0.00" }));
        await press(button("Record ₹8,400"));
        await settle();
        // No share sheet passed in: WhatsApp opens straight away.
        expect(wa.offerWhatsAppReceipt).toHaveBeenCalledWith(
            "inv_106",
            "Vivek Nair",
            10_000,
            undefined,
        );
        const u = lastUndo();
        expect(u.description).toBeUndefined();
        // Undo takes the offer back with the payment.
        actions.removePayment.mockResolvedValue({ ok: true, data: {} });
        await act(async () => {
            await u.undo();
        });
        expect(takeBack).toHaveBeenCalled();
    });

    it("records on another day picked", async () => {
        drawSheet();
        await settle();
        await press(button("Yesterday"));
        await press(button("Pick"));
        await press(button("Record ₹8,400"));
        await settle();
        expect(text()).toContain("Pick the day it came in.");
        expect(actions.recordPayment).not.toHaveBeenCalled();
        await type(dayBox(), "2026-10-12");
        actions.recordPayment.mockResolvedValue(answer());
        await press(button("Record ₹8,400"));
        await settle();
        const sent = actions.recordPayment.mock.calls[0]?.[1] as {
            receivedAt: string;
        };
        const day = new Date(sent.receivedAt);
        expect([day.getFullYear(), day.getMonth(), day.getDate()]).toEqual([
            2026, 9, 12,
        ]);
    });

    it("reads an invoice it was given only the id of, and says when it can't", async () => {
        actions.readInvoice.mockResolvedValueOnce({
            ok: false,
            error: "That invoice could not be loaded.",
        });
        drawSheet({ id: "inv_106", who: "Vivek Nair" });
        await settle();
        expect(text()).toContain(
            "Couldn't load this invoice. Nothing has changed.",
        );
        actions.readInvoice.mockResolvedValueOnce({
            ok: true,
            data: {
                id: "inv_106",
                number: "RC/26-27/0106",
                currency: "INR",
                total: "8400.00",
                leftToPay: "4400.00",
                send: { channels: [], reason: "NO_EMAIL_PROVIDER" },
            },
        });
        await press(button("Try again"));
        await settle();
        expect(text()).toContain(
            "RC/26-27/0106 · Vivek Nair · ₹4,400 left of ₹8,400",
        );
        expect(field("Amount received").value).toBe("4400");
    });
});

// — a cheque's two endings ——————————————————————————————————————————

const ON = { id: "inv_106", number: "RC/26-27/0106", dueAt: null };

describe("A cheque waiting for the bank", () => {
    it("in the bank with no email provider: the receipt is offered on WhatsApp", async () => {
        const onClose = vi.fn();
        act(() =>
            root.render(
                <ChequeClearedDialog
                    invoice={ON}
                    payment={CHEQUE}
                    who="Vivek Nair"
                    emailsReceipt={false}
                    onClose={onClose}
                    onChanged={() => undefined}
                />,
            ),
        );
        actions.chequeCleared.mockResolvedValue({ ok: true, data: {} });
        await press(button("Mark as in the bank"));
        await settle();
        expect(actions.chequeCleared).toHaveBeenCalledWith(
            "inv_106",
            "pay_chq",
            expect.any(String),
        );
        expect(onClose).toHaveBeenCalled();
        const said = toast.showSuccess.mock.calls.at(-1) as unknown as [
            string,
            string | undefined,
            { label: string; onClick: () => void } | undefined,
        ];
        expect(said[0]).toBe("Cheque 004512 is in the bank.");
        expect(said[2]?.label).toBe("Share receipt on WhatsApp");
        said[2]?.onClick();
        expect(wa.openWhatsAppShare).toHaveBeenCalledWith("inv_106", "RECEIPT");
    });

    it("in the bank with email: the receipt goes by email, nothing to share", async () => {
        act(() =>
            root.render(
                <ChequeClearedDialog
                    invoice={ON}
                    payment={CHEQUE}
                    who="Vivek Nair"
                    emailsReceipt
                    onClose={() => undefined}
                    onChanged={() => undefined}
                />,
            ),
        );
        actions.chequeCleared.mockResolvedValue({ ok: true, data: {} });
        await press(button("Mark as in the bank"));
        await settle();
        const said = toast.showSuccess.mock.calls.at(-1) as unknown as [
            string,
            string | undefined,
            unknown,
        ];
        expect(said[1]).toContain("by email");
        expect(said[2]).toBeUndefined();
    });

    it("bounced: one confirm, owed again, and Vivek told on WhatsApp after", async () => {
        const onClose = vi.fn();
        const opened = { close: vi.fn() } as unknown as Window;
        const open = vi.spyOn(window, "open").mockReturnValue(opened);
        act(() =>
            root.render(
                <ChequeBouncedDialog
                    invoice={ON}
                    payment={CHEQUE}
                    who="Vivek Nair"
                    timeZone="Asia/Kolkata"
                    onClose={onClose}
                    onChanged={() => undefined}
                />,
            ),
        );
        expect(text()).toContain("Cheque 004512 bounced?");
        expect(hasButton("Keep the payment")).toBe(true);
        await type(field("Why"), "insufficient funds");
        await press(tick("Tell Vivek on WhatsApp after"));
        actions.chequeBounced.mockResolvedValue({ ok: true, data: {} });
        await press(button("Mark as bounced"));
        await settle();
        expect(actions.chequeBounced).toHaveBeenCalledWith(
            "inv_106",
            "pay_chq",
            { reason: "insufficient funds" },
        );
        expect(wa.openWhatsAppShare).toHaveBeenCalledWith(
            "inv_106",
            "REMINDER",
            opened,
        );
        open.mockRestore();
    });

    it("a refused bounce stays open and closes the tab it opened", async () => {
        const onClose = vi.fn();
        const opened = { close: vi.fn() };
        const open = vi
            .spyOn(window, "open")
            .mockReturnValue(opened as unknown as Window);
        act(() =>
            root.render(
                <ChequeBouncedDialog
                    invoice={ON}
                    payment={CHEQUE}
                    who="Vivek Nair"
                    timeZone="Asia/Kolkata"
                    onClose={onClose}
                    onChanged={() => undefined}
                />,
            ),
        );
        await press(tick("Tell Vivek on WhatsApp after"));
        actions.chequeBounced.mockResolvedValue({
            ok: false,
            error: "This cheque is already in the bank.",
        });
        await press(button("Mark as bounced"));
        await settle();
        expect(opened.close).toHaveBeenCalled();
        expect(toast.showError).toHaveBeenCalledWith(
            "This cheque is already in the bank.",
        );
        expect(onClose).not.toHaveBeenCalled();
        expect(wa.openWhatsAppShare).not.toHaveBeenCalled();
        open.mockRestore();
    });

    it("bounced without the tick opens nothing", async () => {
        const open = vi.spyOn(window, "open");
        act(() =>
            root.render(
                <ChequeBouncedDialog
                    invoice={ON}
                    payment={CHEQUE}
                    who="Vivek Nair"
                    timeZone="Asia/Kolkata"
                    onClose={() => undefined}
                    onChanged={() => undefined}
                />,
            ),
        );
        actions.chequeBounced.mockResolvedValue({ ok: true, data: {} });
        await press(button("Mark as bounced"));
        await settle();
        expect(open).not.toHaveBeenCalled();
        expect(wa.openWhatsAppShare).not.toHaveBeenCalled();
        open.mockRestore();
    });
});
