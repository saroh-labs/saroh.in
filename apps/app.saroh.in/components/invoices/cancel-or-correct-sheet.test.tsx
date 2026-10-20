// @vitest-environment jsdom
/**
 * Cancel or correct (DEC-173, INVCancelA, U13 #1125): every path the old
 * Cancel invoice dialog had — credit note, Void, Void and write again, the
 * reason it always asked — plus Cancel and write a correct one, the credit
 * note shown before it is made, and a partly paid invoice refused with why.
 * The foot is "Keep invoice", quiet and first, then one destructive button.
 * Refund… on a paid invoice is its own dialog, unchanged; Write again on a
 * void invoice opens a draft with its lines.
 *
 * `react-dom/client` + `act` directly, as the other component tests do.
 */
import { act } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { DetailActionState } from "@/lib/invoices/detail-actions";
import {
    actionsFor,
    allActions,
    detailActions,
} from "@/lib/invoices/detail-actions";

import type { CancelOrCorrectInvoice } from "./cancel-or-correct-sheet";
import {
    CancelOrCorrectSheet,
    cancelTargetOf,
} from "./cancel-or-correct-sheet";
import { RefundInvoiceDialog } from "./invoice-actions";
import { useWriteAgain } from "./use-write-again";

const actions = {
    creditInvoice: vi.fn(),
    creditAndRewriteInvoice: vi.fn(),
    voidInvoice: vi.fn(),
    reissueInvoice: vi.fn(),
    readCreditPreview: vi.fn(),
    writeInvoiceAgain: vi.fn(),
};
vi.mock("@/lib/invoices/actions", () => ({
    creditInvoice: (...a: unknown[]) => actions.creditInvoice(...a) as unknown,
    creditAndRewriteInvoice: (...a: unknown[]) =>
        actions.creditAndRewriteInvoice(...a) as unknown,
    voidInvoice: (...a: unknown[]) => actions.voidInvoice(...a) as unknown,
    reissueInvoice: (...a: unknown[]) =>
        actions.reissueInvoice(...a) as unknown,
    readCreditPreview: (...a: unknown[]) =>
        actions.readCreditPreview(...a) as unknown,
    writeInvoiceAgain: (...a: unknown[]) =>
        actions.writeInvoiceAgain(...a) as unknown,
    deleteInvoice: vi.fn(),
    issueInvoice: vi.fn(),
    recordPayment: vi.fn(),
    setInvoiceLineRates: vi.fn(),
}));
vi.mock("@/lib/gst-rates/actions", () => ({ saveGstRates: vi.fn() }));
vi.mock("@/components/organizations/use-business-details-step", () => ({
    useBusinessDetailsStep: () => ({
        run: <R,>(action: () => Promise<R>) => action(),
        step: null,
    }),
}));
const router = { refresh: vi.fn(), push: vi.fn(), replace: vi.fn() };
vi.mock("next/navigation", () => ({ useRouter: () => router }));
const toast = { showError: vi.fn(), showSuccess: vi.fn() };
vi.mock("@saroh/ui/toast", () => ({
    showError: (...a: unknown[]) => toast.showError(...a) as unknown,
    showSuccess: (...a: unknown[]) => toast.showSuccess(...a) as unknown,
}));

const INVOICE: CancelOrCorrectInvoice = {
    id: "inv_106",
    number: "RC/26-27/0106",
    standing: "OVERDUE",
    who: "Vivek Nair",
    total: "₹8,400",
    expect: { expectStatus: "OVERDUE", expectPaidSoFar: "0.00" },
};
const PREVIEW = {
    ok: true,
    data: { number: "RCCN/26-27/0002", amount: "8400.00", currency: "INR" },
};

let root: Root;
let host: HTMLDivElement;
const onOpenChange = vi.fn();
const onDone = vi.fn();

function phone(narrow: boolean) {
    Object.defineProperty(window, "matchMedia", {
        configurable: true,
        value: (query: string) => ({
            matches: narrow && query.includes("max-width: 759px"),
            media: query,
            addEventListener: () => undefined,
            removeEventListener: () => undefined,
        }),
    });
}

beforeEach(() => {
    (
        globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    for (const fn of [
        ...Object.values(actions),
        router.refresh,
        router.push,
        toast.showError,
        toast.showSuccess,
        onOpenChange,
        onDone,
    ]) {
        fn.mockReset();
    }
    actions.readCreditPreview.mockResolvedValue(PREVIEW);
    phone(false);
});

afterEach(() => {
    act(() => root.unmount());
    host.remove();
    document.body.innerHTML = "";
});

async function flush() {
    for (let i = 0; i < 5; i++) await Promise.resolve();
}

async function draw(
    props: Partial<Parameters<typeof CancelOrCorrectSheet>[0]> = {},
) {
    await act(async () => {
        root.render(
            <CancelOrCorrectSheet
                open
                onOpenChange={onOpenChange}
                invoice={INVOICE}
                registered
                {...props}
            />,
        );
        await flush();
    });
}

const sheet = () => {
    const el = document.querySelector('[role="dialog"]');
    if (!el) throw new Error("The sheet is not open");
    return el as HTMLElement;
};

function button(name: string): HTMLButtonElement {
    const hit = Array.from(sheet().querySelectorAll("button")).find(
        (b) => b.textContent.trim() === name,
    );
    if (!hit) throw new Error(`No button ${name}`);
    return hit;
}

const buttons = () =>
    Array.from(sheet().querySelectorAll("button"))
        .map((b) => b.textContent.trim())
        .filter(Boolean);

const choice = (label: string) => {
    const hit = Array.from(
        sheet().querySelectorAll<HTMLButtonElement>('button[role="radio"]'),
    ).find((b) =>
        sheet()
            .querySelector(`label[for="${b.id}"]`)
            ?.textContent.startsWith(label),
    );
    if (!hit) throw new Error(`No choice ${label}`);
    return hit;
};

const why = () => {
    const input = sheet().querySelector<HTMLInputElement>(
        'input[placeholder^="Wrong amount"]',
    );
    if (!input) throw new Error("No Why field");
    return input;
};

function type(value: string) {
    const input = why();
    act(() => {
        // React reads the value through the prototype's setter.
        // eslint-disable-next-line @typescript-eslint/unbound-method -- called with the input below
        const set = Object.getOwnPropertyDescriptor(
            HTMLInputElement.prototype,
            "value",
        )?.set;
        set?.call(input, value);
        input.dispatchEvent(new Event("input", { bubbles: true }));
    });
}

async function press(name: string) {
    await act(async () => {
        button(name).click();
        await flush();
    });
}

describe("Cancel or correct, GST-registered", () => {
    it("names the invoice, offers both ways and shows the credit note first", async () => {
        await draw();
        const text = sheet().textContent;
        expect(text).toContain("Cancel or correct RC/26-27/0106");
        expect(text).toContain("₹8,400 · Vivek Nair · not paid");
        expect(choice("Cancel all of it").getAttribute("aria-checked")).toBe(
            "true",
        );
        expect(choice("Cancel and write a correct one")).toBeTruthy();
        // "Take some off" is Phase 2, with the credit note page.
        expect(text).not.toContain("Take some off");
        expect(text).toContain("Printed on the credit note.");
        expect(actions.readCreditPreview).toHaveBeenCalledWith("inv_106");
        expect(text).toContain("Credit note · RCCN/26-27/0002");
        expect(text).toContain("−₹8,400");
        expect(text).toContain("Against RC/26-27/0106 · Vivek Nair");
    });

    it("Keep invoice comes first and quiet; one destructive button", async () => {
        await draw();
        const foot = sheet().querySelector("[data-overlay-foot]");
        const footButtons = Array.from(foot?.querySelectorAll("button") ?? []);
        expect(footButtons.map((b) => b.textContent.trim())).toEqual([
            "Keep invoice",
            "Issue credit note ₹8,400",
        ]);
        expect(footButtons[0]?.getAttribute("type")).toBe("button");
        expect(footButtons[1]?.getAttribute("type")).toBe("submit");
        // No other button in the sheet cancels anything.
        expect(buttons().filter((b) => /Void|credit note/.test(b))).toEqual([
            "Issue credit note ₹8,400",
        ]);
    });

    it("a missing reason is said on the press, with the keyboard on Why", async () => {
        await draw();
        await press("Issue credit note ₹8,400");
        expect(actions.creditInvoice).not.toHaveBeenCalled();
        expect(sheet().querySelector('[role="alert"]')?.textContent).toBe(
            "Say why it is being cancelled.",
        );
        expect(why().getAttribute("aria-invalid")).toBe("true");
        expect(document.activeElement).toBe(why());
    });

    it("Cancel all of it: the credit note, said, and the page refreshed", async () => {
        actions.creditInvoice.mockResolvedValue({
            ok: true,
            data: { id: "cn_2", number: "RCCN/26-27/0002" },
        });
        await draw();
        type("Wrong amount");
        await press("Issue credit note ₹8,400");
        // What the screen showed goes too: the API refuses a stale one (#2).
        expect(actions.creditInvoice).toHaveBeenCalledWith(
            "inv_106",
            "Wrong amount",
            { expectStatus: "OVERDUE", expectPaidSoFar: "0.00" },
        );
        expect(toast.showSuccess).toHaveBeenCalledWith(
            "RC/26-27/0106 cancelled with credit note RCCN/26-27/0002.",
        );
        expect(onOpenChange).toHaveBeenCalledWith(false);
        expect(router.refresh).toHaveBeenCalled();
        expect(router.push).not.toHaveBeenCalled();
    });

    it("Cancel and write a correct one: both in one call, and the draft opens", async () => {
        actions.creditAndRewriteInvoice.mockResolvedValue({
            ok: true,
            data: {
                creditNote: { id: "cn_3", number: "RCCN/26-27/0003" },
                draft: { id: "draft_9" },
            },
        });
        await draw();
        act(() => choice("Cancel and write a correct one").click());
        type("Wrong person");
        await press("Issue credit note ₹8,400");
        expect(actions.creditAndRewriteInvoice).toHaveBeenCalledWith(
            "inv_106",
            "Wrong person",
            { expectStatus: "OVERDUE", expectPaidSoFar: "0.00" },
        );
        expect(actions.creditInvoice).not.toHaveBeenCalled();
        expect(toast.showSuccess).toHaveBeenCalledWith(
            "RC/26-27/0106 cancelled with credit note RCCN/26-27/0003. A corrected draft is open.",
        );
        expect(router.push).toHaveBeenCalledWith(
            "/billing/invoices/draft_9/edit",
        );
    });

    it("with onDone, the caller decides what follows: nothing is navigated", async () => {
        actions.creditAndRewriteInvoice.mockResolvedValue({
            ok: true,
            data: {
                creditNote: { id: "cn_3", number: "RCCN/26-27/0003" },
                draft: { id: "draft_9" },
            },
        });
        await draw({ onDone });
        act(() => choice("Cancel and write a correct one").click());
        type("Wrong person");
        await press("Issue credit note ₹8,400");
        expect(onDone).toHaveBeenCalledWith({
            kind: "draft",
            draftId: "draft_9",
        });
        expect(router.push).not.toHaveBeenCalled();
        expect(router.refresh).not.toHaveBeenCalled();
    });

    it("a refusal stays open with what was typed, and says why", async () => {
        actions.creditInvoice.mockResolvedValue({
            ok: false,
            error: "This invoice is already credited.",
        });
        await draw();
        type("Wrong amount");
        await press("Issue credit note ₹8,400");
        expect(toast.showError).toHaveBeenCalledWith(
            "This invoice is already credited.",
        );
        expect(onOpenChange).not.toHaveBeenCalledWith(false);
        expect(why().value).toBe("Wrong amount");
    });

    it("a preview that can't load: said in place, and the button still works", async () => {
        actions.readCreditPreview.mockResolvedValue({
            ok: false,
            error: "Couldn't load the credit note.",
        });
        actions.creditInvoice.mockResolvedValue({
            ok: true,
            data: { id: "cn_2", number: "RCCN/26-27/0002" },
        });
        await draw();
        expect(sheet().textContent).toContain(
            "Couldn't load the credit note. Its number is given when it is issued.",
        );
        // The amount falls back to the invoice's total.
        expect(button("Issue credit note ₹8,400").disabled).toBe(false);
        type("Returned");
        await press("Issue credit note ₹8,400");
        expect(actions.creditInvoice).toHaveBeenCalled();
    });

    it("each opening starts fresh", async () => {
        await draw();
        act(() => choice("Cancel and write a correct one").click());
        type("Wrong");
        await draw({ open: false });
        await draw({ open: true });
        expect(choice("Cancel all of it").getAttribute("aria-checked")).toBe(
            "true",
        );
        expect(why().value).toBe("");
    });
});

describe("Cancel or correct, not registered", () => {
    it("offers Void it and Void and write again, and no credit note", async () => {
        await draw({ registered: false });
        expect(choice("Void it").getAttribute("aria-checked")).toBe("true");
        expect(choice("Void and write again")).toBeTruthy();
        expect(sheet().textContent).not.toContain("The credit note");
        expect(sheet().textContent).toContain(
            "Kept on the invoice, for whoever reads it later.",
        );
        expect(actions.readCreditPreview).not.toHaveBeenCalled();
        expect(button("Void invoice")).toBeTruthy();
    });

    it("Void it: voided, said, refreshed", async () => {
        actions.voidInvoice.mockResolvedValue({ ok: true, data: {} });
        await draw({ registered: false });
        await press("Void invoice");
        expect(sheet().querySelector('[role="alert"]')?.textContent).toBe(
            "Say why it is being voided.",
        );
        type("Typo in the amount");
        await press("Void invoice");
        expect(actions.voidInvoice).toHaveBeenCalledWith(
            "inv_106",
            "Typo in the amount",
        );
        expect(toast.showSuccess).toHaveBeenCalledWith("RC/26-27/0106 voided.");
        expect(router.refresh).toHaveBeenCalled();
    });

    it("Void and write again: the corrected draft opens", async () => {
        actions.reissueInvoice.mockResolvedValue({
            ok: true,
            data: { id: "draft_4" },
        });
        await draw({ registered: false });
        act(() => choice("Void and write again").click());
        type("Wrong person");
        await press("Void and write again");
        expect(actions.reissueInvoice).toHaveBeenCalledWith(
            "inv_106",
            "Wrong person",
        );
        expect(router.push).toHaveBeenCalledWith(
            "/billing/invoices/draft_4/edit",
        );
    });
});

describe("a partly paid invoice", () => {
    const partly = { ...INVOICE, partlyPaid: true, paidSoFar: "₹1,000" };

    it("says why it can't be cancelled and what can be done; the button is off", async () => {
        await draw({ invoice: partly });
        const text = sheet().textContent;
        expect(text).toContain("₹8,400 · Vivek Nair · ₹1,000 paid");
        expect(text).toContain("Part of this invoice is paid");
        expect(text).toContain("₹1,000 of ₹8,400 has come in.");
        expect(text).toContain("remove its payments first");
        expect(text).toContain("record the rest when it comes in");
        expect(text).toContain(
            "Part of this invoice is paid. Remove its payments before cancelling it.",
        );
        // Nothing is promised about later.
        expect(text).not.toMatch(/coming|soon|later/i);
        expect(sheet().querySelector('[role="radiogroup"]')).toBeNull();
        expect(actions.readCreditPreview).not.toHaveBeenCalled();
        const main = button("Issue credit note ₹8,400");
        expect(main.disabled).toBe(true);
        expect(button("Keep invoice").disabled).toBe(false);
    });

    it("not registered: the same refusal, Void invoice off", async () => {
        await draw({ invoice: partly, registered: false });
        expect(button("Void invoice").disabled).toBe(true);
        expect(actions.voidInvoice).not.toHaveBeenCalled();
    });
});

describe("on a phone", () => {
    it("is the screen, Keep invoice under the button", async () => {
        phone(true);
        await draw();
        const foot = sheet().querySelector("[data-overlay-foot]");
        const row = foot?.querySelector("div.flex-col-reverse");
        // Stacked with the button on top: Keep is first in the DOM, drawn last.
        expect(row).toBeTruthy();
        expect(
            Array.from(row?.querySelectorAll("button") ?? []).map((b) =>
                b.textContent.trim(),
            ),
        ).toEqual(["Keep invoice", "Issue credit note ₹8,400"]);
    });
});

describe("who is offered it", () => {
    const base: DetailActionState = {
        standing: "OVERDUE",
        credit: false,
        fromOrder: false,
        canWrite: true,
        sendable: true,
        reminding: false,
        reminderWaits: false,
        payOnline: true,
        charging: false,
        hasPdf: true,
        linkBusy: false,
        pdfBusy: false,
    };
    const ids = (over: Partial<DetailActionState>) =>
        detailActions({ ...base, ...over }).map((a) => a.id);

    it("an owner or admin: Cancel or correct on an owed invoice", () => {
        expect(ids({})).toContain("cancel");
    });

    it("a role that only reads: never offered", () => {
        expect(ids({ canWrite: false })).not.toContain("cancel");
        const rebuilt = actionsFor(
            {
                standing: "OVERDUE",
                kind: "INVOICE",
                source: "MANUAL",
                number: "RC/26-27/0106",
                reissuedAsId: null,
            },
            { read: true, write: false },
        );
        expect(allActions(rebuilt).map((a) => a.id)).not.toContain("cancel");
    });

    it("an order's invoice: never offered (its money moves on the order)", () => {
        expect(ids({ fromOrder: true })).not.toContain("cancel");
    });
});

describe("cancelTargetOf", () => {
    it("reads the API's invoice into the sheet's", () => {
        expect(
            cancelTargetOf({
                id: "inv_1",
                number: "RC/26-27/0106",
                standing: "ISSUED",
                currency: "INR",
                total: "8400.00",
                contact: null,
                billTo: { name: "Vivek Nair", email: null },
                partlyPaid: true,
                paidSoFar: "1000.00",
            }),
        ).toEqual({
            id: "inv_1",
            number: "RC/26-27/0106",
            standing: "ISSUED",
            who: "Vivek Nair",
            total: expect.stringContaining("8,400") as string,
            partlyPaid: true,
            paidSoFar: expect.stringContaining("1,000") as string,
            expect: { expectStatus: "ISSUED", expectPaidSoFar: "1000.00" },
        });
    });
});

describe("Refund… on a paid invoice, unchanged", () => {
    it("asks why, issues the credit note, one destructive button", async () => {
        actions.creditInvoice.mockResolvedValue({
            ok: true,
            data: { id: "cn_5", number: "RCCN/26-27/0005" },
        });
        await act(async () => {
            root.render(
                <RefundInvoiceDialog
                    open
                    onOpenChange={onOpenChange}
                    invoice={{ ...INVOICE, standing: "PAID" }}
                    expect={{
                        expectStatus: "PAID",
                        expectPaidSoFar: "8400.00",
                    }}
                />,
            );
            await flush();
        });
        const text = sheet().textContent;
        expect(text).toContain("Refund RC/26-27/0106 with a credit note?");
        expect(text).toContain("Pay Vivek Nair back yourself.");
        const foot = sheet().querySelector("[data-overlay-foot]");
        expect(
            Array.from(foot?.querySelectorAll("button") ?? []).map((b) =>
                b.textContent.trim(),
            ),
        ).toEqual(["Keep invoice", "Issue the credit note"]);
        await press("Issue the credit note");
        expect(actions.creditInvoice).not.toHaveBeenCalled();
        type("Returned");
        await press("Issue the credit note");
        expect(actions.creditInvoice).toHaveBeenCalledWith(
            "inv_106",
            "Returned",
            { expectStatus: "PAID", expectPaidSoFar: "8400.00" },
        );
        expect(toast.showSuccess).toHaveBeenCalledWith(
            "RC/26-27/0106 cancelled with credit note RCCN/26-27/0005.",
        );
    });
});

describe("Write again on a void invoice", () => {
    let run: ReturnType<typeof useWriteAgain>["run"] = () => Promise.resolve();
    function Probe() {
        run = useWriteAgain().run;
        return null;
    }

    it("makes the draft and opens it", async () => {
        actions.writeInvoiceAgain.mockResolvedValue({
            ok: true,
            data: { id: "draft_7" },
        });
        act(() => root.render(<Probe />));
        await act(async () => {
            await run({ id: "inv_void", number: "PF-0007" });
        });
        expect(actions.writeInvoiceAgain).toHaveBeenCalledWith("inv_void");
        expect(toast.showSuccess).toHaveBeenCalledWith(
            "PF-0007 written again. A draft with its lines is open.",
        );
        expect(router.push).toHaveBeenCalledWith(
            "/billing/invoices/draft_7/edit",
        );
    });

    it("a refusal is said, and nothing opens", async () => {
        actions.writeInvoiceAgain.mockResolvedValue({
            ok: false,
            error: "This invoice was already written again. Open that draft instead.",
        });
        act(() => root.render(<Probe />));
        await act(async () => {
            await run({ id: "inv_void", number: "PF-0007" });
        });
        expect(toast.showError).toHaveBeenCalledWith(
            "This invoice was already written again. Open that draft instead.",
        );
        expect(router.push).not.toHaveBeenCalled();
    });
});
