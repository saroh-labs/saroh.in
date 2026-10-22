// @vitest-environment jsdom
/**
 * Issuing a draft whose line has no GST rate (12 Oct 2026): the API refuses
 * a registered business's tax invoice, naming the lines by their place, and
 * the dialog asks for each rate where Issue was pressed, saves them to the
 * draft and issues it. Nobody is sent to the invoice's editor.
 *
 * `react-dom/client` + `act` directly, as the other component tests do.
 */
import { act } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
    pickRate,
    ratePicker,
    rateShown,
} from "@/components/shared/fields/gst-rate-picker.testing";

import { IssueDialog } from "./invoice-actions";

const actions = { issueInvoice: vi.fn(), setInvoiceLineRates: vi.fn() };
vi.mock("@/lib/invoices/actions", () => ({
    issueInvoice: (...a: unknown[]) => actions.issueInvoice(...a) as unknown,
    setInvoiceLineRates: (...a: unknown[]) =>
        actions.setInvoiceLineRates(...a) as unknown,
    creditInvoice: vi.fn(),
    deleteInvoice: vi.fn(),
    recordPayment: vi.fn(),
    reissueInvoice: vi.fn(),
    voidInvoice: vi.fn(),
}));
const saveGstRates = vi.fn();
vi.mock("@/lib/gst-rates/actions", () => ({
    saveGstRates: (...a: unknown[]) => saveGstRates(...a) as unknown,
}));
// The business's details are on file: that step passes the action through.
vi.mock(
    "@/components/organizations/business-details/use-business-details-step",
    () => ({
        useBusinessDetailsStep: () => ({
            run: <R,>(action: () => Promise<R>) => action(),
            step: null,
        }),
    }),
);
const refresh = vi.fn();
vi.mock("next/navigation", () => ({
    useRouter: () => ({ refresh, push: vi.fn(), replace: vi.fn() }),
}));
const toast = { showError: vi.fn(), showSuccess: vi.fn() };
vi.mock("@saroh/ui/toast", () => ({
    showError: (...a: unknown[]) => toast.showError(...a) as unknown,
    showSuccess: (...a: unknown[]) => toast.showSuccess(...a) as unknown,
}));

// The product's select opens a portal jsdom can't press: a native select
// stands in, with the same options, placeholder and wiring.
vi.mock("@saroh/ui/option-select", () => ({
    OptionSelect: ({
        value,
        onValueChange,
        options,
        placeholder,
        ...aria
    }: {
        value: string;
        onValueChange: (v: string) => void;
        options: { value: string; label: string }[];
        placeholder?: string;
        "aria-label"?: string;
    }) => (
        <select
            aria-label={aria["aria-label"]}
            value={value}
            onChange={(e) => onValueChange(e.target.value)}
        >
            <option value="">{placeholder}</option>
            {options.map((o) => (
                <option key={o.value} value={o.value}>
                    {o.label}
                </option>
            ))}
        </select>
    ),
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
    for (const fn of [
        actions.issueInvoice,
        actions.setInvoiceLineRates,
        saveGstRates,
        refresh,
        toast.showError,
        toast.showSuccess,
    ]) {
        fn.mockReset();
    }
    actions.setInvoiceLineRates.mockResolvedValue({ ok: true });
    act(() =>
        root.render(
            <IssueDialog
                open
                onOpenChange={() => undefined}
                invoice={{
                    id: "inv_1",
                    number: null,
                    standing: "DRAFT",
                    who: "Asha Rao",
                    total: "₹2,400.00",
                }}
            />,
        ),
    );
});

afterEach(() => {
    act(() => root.unmount());
    host.remove();
    document.body.innerHTML = "";
});

async function settle() {
    for (let i = 0; i < 5; i++) {
        await act(async () => {
            await new Promise((r) => setTimeout(r, 0));
        });
    }
}

async function press(name: string) {
    const hit = Array.from(document.querySelectorAll("button")).find(
        (b) => b.textContent.trim() === name,
    );
    if (!hit) throw new Error(`No button ${name}`);
    await act(async () => {
        hit.click();
        await Promise.resolve();
    });
    await settle();
}

const REFUSED = {
    ok: false,
    error: "Catering, Saturday has no GST rate. Choose one to issue this invoice.",
    // The second line of the draft: lines are named by their place, from 0.
    rates: [{ kind: "LINE", id: "1", name: "Catering, Saturday" }],
};

describe("issuing a draft with a line that has no GST rate", () => {
    it("asks for the rate in place, saves it to the draft and issues it", async () => {
        actions.issueInvoice
            .mockResolvedValueOnce(REFUSED)
            .mockResolvedValueOnce({
                ok: true,
                data: { number: "RC/26-27/0007" },
            });
        await press("Issue invoice");

        expect(document.body.textContent).toContain(
            "Catering, Saturday has no GST rate. Choose one to issue this invoice.",
        );
        expect(document.body.textContent).toContain(
            "The rate is saved on this invoice.",
        );
        expect(toast.showError).not.toHaveBeenCalled();

        const picker = ratePicker("GST rate for Catering, Saturday");
        expect(rateShown(picker)).toBe("");
        pickRate(picker, "0");
        await press("Save and issue");

        // Exempt is a rate: 0 is saved on the line, by its place.
        expect(actions.setInvoiceLineRates).toHaveBeenCalledWith("inv_1", {
            1: "0",
        });
        // A typed line has no item to save a rate on.
        expect(saveGstRates).not.toHaveBeenCalled();
        expect(actions.issueInvoice).toHaveBeenCalledTimes(2);
        expect(toast.showSuccess).toHaveBeenCalledWith("RC/26-27/0007 issued.");
        expect(refresh).toHaveBeenCalled();
    });

    it("issues nothing until a rate is chosen", async () => {
        actions.issueInvoice.mockResolvedValue(REFUSED);
        await press("Issue invoice");
        await press("Save and issue");

        expect(document.body.textContent).toContain(
            "Choose a GST rate. Pick 0% if it's exempt or nil-rated.",
        );
        expect(actions.setInvoiceLineRates).not.toHaveBeenCalled();
        expect(actions.issueInvoice).toHaveBeenCalledTimes(1);
    });
});
