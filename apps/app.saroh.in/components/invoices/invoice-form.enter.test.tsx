// @vitest-environment jsdom
/**
 * Enter in an invoice field never issues it. Issuing numbers the invoice
 * and locks its lines, so it is a press of its own button. The form's one
 * submit, which Enter runs, keeps the draft. Pinned on the new invoice and
 * on a draft being changed (the edit route draws the same form).
 */
import { act } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Invoice } from "@/lib/invoices/service";

import { InvoiceForm } from "./invoice-form";

const push = vi.fn();
vi.mock("next/navigation", () => ({
    useRouter: () => ({ push, refresh: vi.fn(), replace: vi.fn() }),
    useSearchParams: () => new URLSearchParams(window.location.search),
}));
// On the paper (U15), the business\'s settings save in place.
vi.mock("@/lib/organizations/settings-actions", () => ({
    saveOrganizationSettings: vi.fn(),
    saveBusinessLogo: vi.fn(),
}));
vi.mock("@/components/shared/logo-upload", () => ({ LogoUpload: () => null }));
const actions = vi.hoisted(() => ({
    createInvoice: vi.fn(),
    createPayLink: vi.fn(),
    issueInvoice: vi.fn(),
    updateInvoice: vi.fn(),
}));
vi.mock("@/lib/invoices/actions", () => actions);
vi.mock("@/lib/invoices/link-actions", () => ({ newPayLink: vi.fn() }));
vi.mock("@/lib/invoices/product-actions", () => ({
    findInvoiceProducts: vi.fn(),
}));
vi.mock("@/lib/contacts/create", () => ({ createContact: vi.fn() }));
vi.mock(
    "@/components/organizations/business-details/use-business-details-step",
    () => ({
        useBusinessDetailsStep: () => ({
            run: (fn: () => unknown) => fn(),
            ensure: () => Promise.resolve(true),
            step: null,
        }),
    }),
);
const toast = vi.hoisted(() => ({
    showSuccess: vi.fn(),
    showError: vi.fn(),
}));
vi.mock("@saroh/ui/toast", async (importOriginal) => ({
    ...(await importOriginal<object>()),
    ...toast,
}));

const DRAFT = {
    id: "inv_1",
    currency: "INR",
    dueAt: "2026-10-24T18:29:59.000Z",
    contact: { id: "c_1", name: "Asha Rao", email: "asha@example.com" },
    billToGst: null,
    lines: [{ description: "Logo design", quantity: 1, unitPrice: "4500" }],
} as unknown as Invoice;

const SAVED = {
    ok: true,
    data: { id: "inv_1", contact: { name: "Asha Rao" }, updatedAt: "now" },
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
    push.mockReset();
    for (const fn of Object.values(actions)) fn.mockReset();
    for (const fn of Object.values(toast)) fn.mockReset();
    actions.updateInvoice.mockResolvedValue(SAVED);
    actions.createInvoice.mockResolvedValue(SAVED);
    actions.issueInvoice.mockResolvedValue({
        ok: true,
        data: { ...SAVED.data, number: "INV-0007" },
    });
});

afterEach(() => {
    act(() => root.unmount());
    host.remove();
    document.body.innerHTML = "";
});

function render(draft?: Invoice) {
    act(() =>
        root.render(
            <InvoiceForm
                contacts={[
                    { id: "c_1", name: "Asha Rao", email: "asha@example.com" },
                ]}
                defaultCurrency="INR"
                registered={false}
                businessName="Rye & Co."
                providerConnected={false}
                draft={draft}
            />,
        ),
    );
}

const form = () => {
    const el = host.querySelector("form");
    if (!el) throw new Error("No form");
    return el;
};
/** The visible copy: the desk's header buttons come first. */
const named = (name: string) => {
    const hit = Array.from(form().querySelectorAll("button")).find(
        (b) => b.textContent.trim() === name,
    );
    if (!hit) throw new Error(`No button ${name}`);
    return hit;
};
/** Let the form's async validation and the save finish. */
async function settle() {
    for (let i = 0; i < 8; i++)
        await act(async () => {
            await Promise.resolve();
        });
}

describe("Enter in the invoice form", () => {
    it("the form's only submit button is the draft's; Issue is a plain button", () => {
        render(DRAFT);
        const submits = new Set(
            Array.from(
                form().querySelectorAll<HTMLButtonElement>(
                    'button[type="submit"]',
                ),
            ).map((b) => b.textContent.trim()),
        );
        expect(submits).toEqual(new Set(["Save draft"]));
        expect(named("Issue it").type).toBe("button");

        act(() => root.unmount());
        root = createRoot(host);
        render();
        expect(
            new Set(
                Array.from(
                    form().querySelectorAll<HTMLButtonElement>(
                        'button[type="submit"]',
                    ),
                ).map((b) => b.textContent.trim()),
            ),
        ).toEqual(new Set(["Save draft"]));
        expect(named("Issue it").type).toBe("button");
    });

    it("no single-line field submits by a route of its own", () => {
        render(DRAFT);
        // Enter in an <input> runs the form's default button and nothing
        // else: no field carries a key handler that could issue.
        for (const input of Array.from(form().querySelectorAll("input"))) {
            expect(input.getAttribute("form")).toBeNull();
        }
        expect(form().querySelectorAll('input[type="submit"]')).toHaveLength(0);
    });

    it("submitting the form, as Enter does, keeps the draft and never issues", async () => {
        render(DRAFT);
        act(() => form().requestSubmit());
        await settle();
        // Nothing changed since it opened: it is already saved.
        expect(actions.updateInvoice).not.toHaveBeenCalled();
        expect(actions.issueInvoice).not.toHaveBeenCalled();
        expect(toast.showSuccess).toHaveBeenCalledWith(
            "Saved as a draft for Asha Rao. No number yet.",
        );
        expect(push).toHaveBeenCalledWith("/billing/invoices/inv_1");
    });

    it("on a new invoice with no line yet, Enter does nothing", async () => {
        render();
        // The default button is off until there is a line, and a form
        // whose default button is off isn't submitted by Enter.
        expect(named("Save draft").disabled).toBe(true);
        expect(named("Issue it").disabled).toBe(true);
        await settle();
        expect(actions.createInvoice).not.toHaveBeenCalled();
        expect(actions.issueInvoice).not.toHaveBeenCalled();
    });

    it("pressing Issue it is what issues", async () => {
        render(DRAFT);
        act(() => named("Issue it").click());
        await settle();
        expect(actions.issueInvoice).toHaveBeenCalledWith("inv_1");
        expect(toast.showSuccess).toHaveBeenCalledWith(
            "INV-0007 issued. Its lines are locked.",
        );
        expect(push).toHaveBeenCalledWith("/billing/invoices/inv_1");
    });
});
