// @vitest-environment jsdom
/**
 * New invoice (A), U14 #1126, as someone uses it: it saves as it is typed
 * and becomes a draft at its own address, says what is wrong before saving
 * or issuing, asks a line's GST rate in place before issuing, fills a line
 * from a product, and on a phone keeps the paper behind See it.
 */
import { act } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
    otherRateButton,
    pickRate,
    ratePicker,
    rateShown,
    ratesOffered,
} from "@/components/shared/fields/gst-rate-picker.testing";

import type { InvoiceFormBusiness } from "@/lib/invoices/new-invoice";
import type { Invoice } from "@/lib/invoices/service";

import { InvoiceForm } from "../invoice-form";

const push = vi.fn();
vi.mock("next/navigation", () => ({
    useRouter: () => ({ push, refresh: vi.fn(), replace: vi.fn() }),
    useSearchParams: () => new URLSearchParams(window.location.search),
}));
// On the paper (U15), the business\'s settings save in place.
vi.mock("@/lib/organizations/settings-actions", () => ({
    saveOrganizationSettings: vi.fn(),
    saveOrganizationSettingsInPlace: vi.fn(),
    saveBusinessLogo: vi.fn(),
    saveBusinessLogoInPlace: vi.fn(),
}));
vi.mock("@/components/shared/fields/logo-upload", () => ({
    LogoUpload: () => null,
}));
const actions = vi.hoisted(() => ({
    createInvoice: vi.fn(),
    issueInvoice: vi.fn(),
    updateInvoice: vi.fn(),
}));
vi.mock("@/lib/invoices/actions", () => actions);
vi.mock("@/lib/invoices/link-actions", () => ({ newPayLink: vi.fn() }));
const products = vi.hoisted(() => ({ findInvoiceProducts: vi.fn() }));
vi.mock("@/lib/invoices/product-actions", () => products);
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

const BUSINESS: InvoiceFormBusiness = {
    seller: {
        name: "Rye & Co.",
        address: null,
        gstin: "29AAGCR4375J1ZU",
        state: "Karnataka (29)",
        logo: null,
    },
    state: "29",
    priceMode: "INCLUDED",
    zone: "Asia/Kolkata",
    paper: { style: "CLASSIC", colour: null },
    nextNumber: null,
};

const saved = (over: Partial<Invoice> = {}) => ({
    ok: true,
    data: {
        id: "inv_9",
        contact: { id: "c_1", name: "Asha Rao", email: "asha@example.com" },
        updatedAt: "now",
        ...over,
    },
});

let root: Root;
let host: HTMLDivElement;

beforeEach(() => {
    (
        globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    window.history.replaceState(null, "", "/billing/invoices/new");
    push.mockReset();
    for (const fn of Object.values(actions)) fn.mockReset();
    for (const fn of Object.values(toast)) fn.mockReset();
    products.findInvoiceProducts.mockReset();
    actions.createInvoice.mockResolvedValue(saved());
    actions.updateInvoice.mockResolvedValue(saved());
    actions.issueInvoice.mockResolvedValue(saved({ number: "RC/26-27/0145" }));
});

afterEach(() => {
    vi.useRealTimers();
    act(() => root.unmount());
    host.remove();
    document.body.innerHTML = "";
});

function render(props: Partial<Parameters<typeof InvoiceForm>[0]> = {}) {
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
                business={BUSINESS}
                {...props}
            />,
        ),
    );
}

const field = (label: string) => {
    const el = host.querySelector<HTMLInputElement>(`[aria-label="${label}"]`);
    if (!el) throw new Error(`No field ${label}`);
    return el;
};
/** Type into a field as the keyboard does, for React to hear it. */
function type(label: string, value: string) {
    setValue(field(label), value);
}
function setValue(input: HTMLInputElement | null, value: string) {
    act(() => {
        if (!input) return;
        Object.getOwnPropertyDescriptor(
            Object.getPrototypeOf(input) as object,
            "value",
        )?.set?.call(input, value);
        input.dispatchEvent(new Event("input", { bubbles: true }));
    });
}
const button = (name: string) => {
    const hit = Array.from(host.querySelectorAll("button")).find(
        (b) => b.textContent.trim() === name,
    );
    if (!hit) throw new Error(`No button ${name}`);
    return hit;
};
async function settle() {
    for (let i = 0; i < 8; i++)
        await act(async () => {
            await Promise.resolve();
        });
}
/** The autosave's pause, then its answer. */
async function pause(ms = 900) {
    await act(async () => {
        await vi.advanceTimersByTimeAsync(ms);
    });
    await settle();
}
const text = () => host.textContent.replace(/\s+/g, " ");

describe("saved as it is typed", () => {
    it("the draft's address keeps ?mode= only, through a replace Next's router follows", async () => {
        vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
        // Next marks its own history entries `__NA`; a replace carrying the
        // marker is one its router ignores, and later writes back over.
        window.history.replaceState(
            { __NA: true },
            "",
            "/billing/invoices/new?mode=form&contactId=c_1",
        );
        const replaceState = vi.spyOn(window.history, "replaceState");
        render({ initialContactId: "c_1" });
        type("Line 1: what it's for", "Catering platter");
        type("Line 1: price each, INR", "450");
        await pause();
        expect(actions.createInvoice).toHaveBeenCalledTimes(1);
        expect(`${window.location.pathname}${window.location.search}`).toBe(
            "/billing/invoices/inv_9/edit?mode=form",
        );
        const [data] = replaceState.mock.calls.at(-1) ?? [];
        expect(data).toBeNull();
        replaceState.mockRestore();
    });

    it("becomes a draft once who and a line are in, at the draft's own address", async () => {
        vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
        render({ initialContactId: "c_1" });
        type("Line 1: what it's for", "Catering platter");
        await pause();
        // A line with no price yet isn't one the API takes: nothing goes.
        expect(actions.createInvoice).not.toHaveBeenCalled();
        expect(text()).toContain("Not saved yet");

        type("Line 1: price each, INR", "450");
        await pause();
        expect(actions.createInvoice).toHaveBeenCalledTimes(1);
        expect(actions.createInvoice.mock.calls[0]?.[0]).toMatchObject({
            contactId: "c_1",
            currency: "INR",
            lines: [
                {
                    description: "Catering platter",
                    quantity: 1,
                    unitPrice: "450",
                },
            ],
        });
        expect(window.location.pathname).toBe("/billing/invoices/inv_9/edit");
        expect(text()).toContain("Draft · saved");

        // Each change after that changes the same draft.
        type("Line 1: quantity", "3");
        await pause();
        expect(actions.createInvoice).toHaveBeenCalledTimes(1);
        expect(actions.updateInvoice).toHaveBeenCalledTimes(1);
        expect(actions.updateInvoice.mock.calls[0]?.[0]).toBe("inv_9");
        expect(actions.updateInvoice.mock.calls[0]?.[1]).not.toHaveProperty(
            "currency",
        );
    });

    it("a refused save says so, keeps what was typed, and Try again sends it", async () => {
        vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
        actions.createInvoice.mockResolvedValueOnce({
            ok: false,
            error: "Couldn't reach Saroh.",
        });
        render({ initialContactId: "c_1" });
        type("Line 1: what it's for", "Catering platter");
        type("Line 1: price each, INR", "450");
        await pause();
        expect(text()).toContain("Not saved");
        expect(field("Line 1: what it's for").value).toBe("Catering platter");
        act(() => button("Try again").click());
        await settle();
        expect(actions.createInvoice).toHaveBeenCalledTimes(2);
        expect(text()).toContain("Draft · saved");
    });

    it("a refusal that names the buyer's GSTIN is said on the field", async () => {
        vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
        actions.createInvoice.mockResolvedValueOnce({
            ok: false,
            error: "That GSTIN's check character is wrong",
            field: "billToGstin",
        });
        render({ initialContactId: "c_1", registered: true });
        act(() => button("+ Their GSTIN, state and address").click());
        const gstin = host.querySelector<HTMLInputElement>(
            'input[name="billToGstin"]',
        );
        setValue(gstin, "29ABCFB2207K1ZX");
        type("Line 1: what it's for", "Catering platter");
        type("Line 1: price each, INR", "450");
        await pause();
        expect(text()).toContain("That GSTIN's check character is wrong");
        expect(gstin?.getAttribute("aria-invalid")).toBe("true");
    });
});

describe("what is wrong is said before anything is saved", () => {
    it("Issue with nobody chosen asks who it's for", async () => {
        render();
        type("Line 1: what it's for", "Catering platter");
        type("Line 1: price each, INR", "450");
        act(() => button("Issue it").click());
        await settle();
        expect(text()).toContain("Choose who it's for");
        expect(actions.createInvoice).not.toHaveBeenCalled();
        expect(actions.issueInvoice).not.toHaveBeenCalled();
    });

    it("a quantity of none is said on its line, and the keyboard goes there", async () => {
        render({ initialContactId: "c_1" });
        type("Line 1: what it's for", "Catering platter");
        type("Line 1: price each, INR", "450");
        type("Line 1: quantity", "0");
        act(() => host.querySelector("form")?.requestSubmit());
        await settle();
        await act(async () => {
            await new Promise((r) => setTimeout(r, 40));
        });
        expect(text()).toContain("At least 1");
        expect(field("Line 1: quantity").getAttribute("aria-invalid")).toBe(
            "true",
        );
        expect(document.activeElement).toBe(field("Line 1: quantity"));
        expect(actions.createInvoice).not.toHaveBeenCalled();
    });

    it("a line with no GST rate on a registered business is asked for in place", async () => {
        render({
            registered: true,
            draft: {
                id: "inv_1",
                currency: "INR",
                dueAt: null,
                contact: {
                    id: "c_1",
                    name: "Asha Rao",
                    email: "asha@example.com",
                },
                billToGst: null,
                lines: [
                    {
                        description: "Logo design",
                        quantity: 1,
                        unitPrice: "4500",
                        gst: null,
                    },
                ],
            } as unknown as Invoice,
        });
        act(() => button("Issue it").click());
        await settle();
        expect(text()).toContain(
            "Choose this line's GST rate. Pick 0% if it's exempt or nil-rated.",
        );
        expect(field("Line 1: GST rate").getAttribute("aria-invalid")).toBe(
            "true",
        );
        expect(actions.issueInvoice).not.toHaveBeenCalled();
    });

    it("chooses a line's rate by button, and one behind Other rate (DEC-176)", async () => {
        render({ initialContactId: "c_1", registered: true });
        type("Line 1: what it's for", "Diamond setting");
        type("Line 1: price each, INR", "1000");
        const picker = ratePicker("Line 1: GST rate", host);
        // The box's "Not set" stays, first, beside the main rates.
        expect(ratesOffered(picker)).toEqual(["", "0", "5", "18", "40"]);
        expect(rateShown(picker)).toBe("");
        pickRate(picker, "5");
        await settle();
        expect(rateShown(picker)).toBe("5");
        pickRate(picker, "1.5");
        await settle();
        expect(rateShown(picker)).toBe("1.5");
        expect(otherRateButton(picker).getAttribute("aria-expanded")).toBe(
            "true",
        );
        expect(text()).toContain("GST 1.5%");
    });
});

describe("+ Pick from your products", () => {
    it("fills the line with the product's name, price, GST rate and HSN", async () => {
        products.findInvoiceProducts.mockResolvedValue({
            ok: true,
            data: {
                items: [
                    {
                        id: "p_1",
                        name: "Focaccia (trade)",
                        price: "220",
                        gstRate: "5",
                        gstPriceMode: null,
                        hsnCode: "19059090",
                        variants: [],
                    },
                ],
                more: false,
            },
        });
        render({
            initialContactId: "c_1",
            registered: true,
            canPickProducts: true,
        });
        act(() => button("+ Pick from your products").click());
        await act(async () => {
            await new Promise((r) => setTimeout(r, 320));
        });
        await settle();
        const option = Array.from(
            document.querySelectorAll<HTMLElement>('[role="option"]'),
        ).find((o) => o.textContent.includes("Focaccia (trade)"));
        expect(option?.textContent).toContain("₹220 · GST 5% · HSN 19059090");
        act(() => option?.click());
        await settle();
        expect(field("Line 1: what it's for").value).toBe("Focaccia (trade)");
        expect(field("Line 1: price each, INR").value).toBe("220");
        expect(field("Line 1: HSN or SAC").value).toBe("19059090");
        expect(rateShown(ratePicker("Line 1: GST rate", host))).toBe("5");
        // The paper shows it at once.
        expect(text()).toContain("GST 5% · HSN 19059090");
    });

    it("says when the products couldn't be searched, with Try again", async () => {
        products.findInvoiceProducts.mockResolvedValue({
            ok: false,
            error: "Your products couldn't be searched just now. Try again.",
        });
        render({ initialContactId: "c_1", canPickProducts: true });
        act(() => button("+ Pick from your products").click());
        await act(async () => {
            await new Promise((r) => setTimeout(r, 320));
        });
        await settle();
        expect(document.body.textContent).toContain(
            "Your products couldn't be searched just now.",
        );
        expect(
            Array.from(document.querySelectorAll("button")).some(
                (b) => b.textContent.trim() === "Try again",
            ),
        ).toBe(true);
    });
});

describe("on a phone", () => {
    it("See how it will look opens the paper, and hides it again", () => {
        render();
        const toggle = button("See how it will look");
        const aside = host.querySelector("aside");
        expect(toggle.getAttribute("aria-expanded")).toBe("false");
        expect(aside?.className).toContain("max-sm:hidden");
        act(() => toggle.click());
        expect(
            button("Hide how it will look").getAttribute("aria-expanded"),
        ).toBe("true");
        expect(aside?.className).not.toContain("max-sm:hidden");
    });

    it("the foot's total follows the lines", () => {
        render({ initialContactId: "c_1" });
        type("Line 1: what it's for", "Catering platter");
        type("Line 1: quantity", "3");
        type("Line 1: price each, INR", "450");
        const foot = host.querySelector('[data-testid="phone-foot"]');
        expect(foot?.textContent).toContain("₹1,350");
    });
});
