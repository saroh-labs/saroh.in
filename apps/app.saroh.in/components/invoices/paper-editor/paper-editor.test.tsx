// @vitest-environment jsdom
/**
 * New invoice "on the paper" (U15 #1127): each part of the paper opens its
 * editor and writes the same draft as the form, the GST particulars a tax
 * invoice must carry are labelled and can't be taken off, and the style
 * rail chooses the draft's own look or the business's default.
 */
import { act } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
    pickRate,
    ratePicker,
    rateShown,
    ratesOffered,
} from "@/components/shared/gst-rate-picker.testing";

import type { InvoiceFormBusiness } from "@/lib/invoices/new-invoice";
import type { Invoice } from "@/lib/invoices/service";

import { InvoiceForm } from "../invoice-form";

vi.mock("next/navigation", () => ({
    useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
    useSearchParams: () => new URLSearchParams(window.location.search),
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
vi.mock("@/components/organizations/use-business-details-step", () => ({
    useBusinessDetailsStep: () => ({
        run: (fn: () => unknown) => fn(),
        ensure: () => Promise.resolve(true),
        step: null,
    }),
}));
const settings = vi.hoisted(() => ({
    saveOrganizationSettings: vi.fn(),
    saveBusinessLogo: vi.fn(),
}));
vi.mock("@/lib/organizations/settings-actions", () => settings);
vi.mock("@/components/shared/logo-upload", () => ({ LogoUpload: () => null }));
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
        address: "3 Hill Road, Indiranagar, Bengaluru 560038",
        gstin: "29AAGCR4375J1ZU",
        state: "Karnataka (29)",
        logo: null,
    },
    state: "29",
    priceMode: "INCLUDED",
    zone: "Asia/Kolkata",
    paper: { style: "CLASSIC", colour: null },
    nextNumber: "RYE/26-27/0032",
    howToPay: ["UPI: rye@okaxis"],
    logoFile: null,
    pay: {
        upiId: "rye@okaxis",
        bankAccountName: null,
        bankAccountNumber: null,
        bankIfsc: null,
        bankName: null,
        note: null,
    },
};

function line(
    description: string,
    quantity: number,
    unitPrice: string,
    rate: string,
    hsnSac: string,
) {
    return {
        id: `l_${description}`,
        description,
        quantity,
        unitPrice,
        amount: unitPrice,
        discount: "0.00",
        gst: {
            hsnSac,
            rate,
            taxableValue: "0",
            cgst: "0",
            sgst: "0",
            igst: "0",
        },
        orderItemId: null,
    };
}

/** Vivek's draft: two trade lines, as the board draws it. */
function draft(over: Partial<Invoice> = {}): Invoice {
    return {
        id: "inv_7",
        status: "DRAFT",
        standing: "DRAFT",
        number: null,
        contact: {
            id: "c_v",
            name: "Vivek Nair · Brew Lane",
            email: "vivek@example.com",
        },
        currency: "INR",
        dueAt: null,
        billToGst: {
            gstin: "29ABCFB2207K1ZL",
            state: "29",
            address: "7 27th Main, HSR Layout Sector 1, Bengaluru 560102",
        },
        lines: [
            line("Sourdough loaf (trade)", 12, "400", "0", "19059010"),
            line("Butter croissant (trade)", 20, "150", "18", "19059020"),
        ],
        paper: { style: "CLASSIC", colour: null },
        paperChoice: { style: null, colour: null },
        ...over,
    } as unknown as Invoice;
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
    window.history.replaceState(
        null,
        "",
        "/billing/invoices/inv_7/edit?mode=paper",
    );
    for (const fn of Object.values(actions)) fn.mockReset();
    for (const fn of Object.values(toast)) fn.mockReset();
    for (const fn of Object.values(settings)) fn.mockReset();
    products.findInvoiceProducts.mockReset();
    actions.updateInvoice.mockImplementation((id: string) =>
        Promise.resolve({ ok: true, data: draft({ id }) }),
    );
    actions.createInvoice.mockResolvedValue({ ok: true, data: draft() });
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
                    {
                        id: "c_v",
                        name: "Vivek Nair · Brew Lane",
                        email: "vivek@example.com",
                    },
                ]}
                defaultCurrency="INR"
                draft={draft()}
                registered
                businessName="Rye & Co."
                providerConnected
                business={BUSINESS}
                canPickProducts
                canSetDefault
                {...props}
            />,
        ),
    );
}

const all = () => document.body;
const text = () => all().textContent.replace(/\s+/g, " ");
const paper = () => {
    const el = host.querySelector<HTMLElement>("article.invoice-paper");
    if (!el) throw new Error("No paper");
    return el;
};
const paperText = () => paper().textContent.replace(/\s+/g, " ");
/** A part's control, by the start of its name. */
function part(name: string) {
    const hit = Array.from(
        host.querySelectorAll<HTMLButtonElement>("[data-part-control]"),
    ).find((b) => b.getAttribute("aria-label")?.startsWith(name));
    if (!hit) throw new Error(`No part ${name}`);
    return hit;
}
function button(name: string, within: ParentNode = all()) {
    const hit = Array.from(within.querySelectorAll("button")).find(
        (b) => b.textContent.trim() === name,
    );
    if (!hit) throw new Error(`No button ${name}`);
    return hit;
}
const hasButton = (name: string) =>
    Array.from(all().querySelectorAll("button")).some(
        (b) => b.textContent.trim() === name,
    );
/** A field by its visible label, anywhere on the page (popovers portal). */
function byLabel(name: string) {
    const label = Array.from(all().querySelectorAll("label")).find(
        (l) => l.textContent.trim() === name,
    );
    const id = label?.getAttribute("for");
    const input = id ? document.getElementById(id) : null;
    if (!(input instanceof HTMLInputElement)) {
        throw new Error(`No field ${name}`);
    }
    return input;
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
async function settle() {
    for (let i = 0; i < 8; i++)
        await act(async () => {
            await Promise.resolve();
        });
}
async function pause(ms = 900) {
    await act(async () => {
        await vi.advanceTimersByTimeAsync(ms);
    });
    await settle();
}
const lastSave = () =>
    actions.updateInvoice.mock.calls.at(-1)?.[1] as Record<string, unknown>;
/** A radio of the style rail or a swatch, by its name. */
function choose(name: string) {
    const hit = Array.from(
        all().querySelectorAll<HTMLElement>('[role="radio"]'),
    ).find(
        (r) =>
            r.getAttribute("aria-label") === name ||
            r.textContent.trim().startsWith(name) ||
            r.closest("label")?.textContent.startsWith(name),
    );
    if (!hit) throw new Error(`No choice ${name}`);
    act(() => hit.click());
}

describe("editing a part of the paper", () => {
    it("a line's quantity changed on the paper changes the totals and the tax, and saves", async () => {
        vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
        render();
        expect(paperText()).toContain("₹7,800");
        act(() => part("Change line 2: Butter croissant (trade)").click());
        expect(text()).toContain("Line 2");
        setValue(byLabel("Qty"), "24");
        // 12 × ₹400 + 24 × ₹150, the croissants' 18% inside.
        expect(paperText()).toContain("₹8,400");
        expect(paperText()).toContain("24 × ₹150");
        expect(paperText()).toContain("₹274.58");
        await pause();
        expect(actions.updateInvoice).toHaveBeenCalled();
        expect(actions.updateInvoice.mock.calls.at(-1)?.[0]).toBe("inv_7");
        expect(lastSave().lines).toEqual([
            expect.objectContaining({ quantity: 12 }),
            expect.objectContaining({
                description: "Butter croissant (trade)",
                quantity: 24,
                gstRate: "18",
            }),
        ]);
    });

    it("a line's GST is chosen as a chip, and Remove line takes it off", async () => {
        render();
        act(() => part("Change line 2").click());
        const rate = ratePicker("GST", all());
        // The shared picker (DEC-176): no "Not set", the line's 18% pressed.
        expect(ratesOffered(rate)).toEqual(["0", "5", "18", "40"]);
        expect(rateShown(rate)).toBe("18");
        pickRate(rate, "5");
        expect(paperText()).toContain("GST 5% · HSN 19059020");
        act(() => button("Remove line").click());
        await settle();
        expect(paperText()).not.toContain("Butter croissant");
        expect(paperText()).toContain("₹4,800");
    });

    it("a line's 1.5% behind Other rate splits into CGST and SGST at 0.75% each", () => {
        render();
        act(() => part("Change line 2").click());
        pickRate(ratePicker("GST", all()), "1.5");
        expect(rateShown(ratePicker("GST", all()))).toBe("1.5");
        expect(paperText()).toContain("GST 1.5% · HSN 19059020");
        expect(paperText()).toContain("CGST 0.75%");
        expect(paperText()).toContain("SGST 0.75%");
    });

    it("who it's billed to opens the same fields as the form, the place of supply following them", () => {
        render();
        act(() => part("Change who it's billed to").click());
        expect(text()).toContain("Billed to");
        const gstin = all().querySelector<HTMLInputElement>(
            'input[name="billToGstin"]',
        );
        expect(gstin?.value).toBe("29ABCFB2207K1ZL");
        expect(text()).toContain("Karnataka: CGST + SGST");
    });

    it("when it's due is the form's chips", () => {
        render();
        act(() => part("Change when it's due").click());
        choose("7 days");
        expect(paperText()).toMatch(/Due \d+ [A-Z][a-z]{2}/);
    });

    it("Add a line finds a product as it is typed, and puts it on the paper", async () => {
        products.findInvoiceProducts.mockResolvedValue({
            ok: true,
            data: {
                items: [
                    {
                        id: "p_f",
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
        render();
        act(() => button("Add a line · type or pick a product").click());
        setValue(
            all().querySelector<HTMLInputElement>("[cmdk-input]"),
            "focac",
        );
        await act(async () => {
            await new Promise((r) => setTimeout(r, 320));
        });
        await settle();
        expect(products.findInvoiceProducts).toHaveBeenLastCalledWith("focac");
        const option = Array.from(
            all().querySelectorAll<HTMLElement>('[role="option"]'),
        ).find((o) => o.textContent.includes("Focaccia (trade)"));
        expect(option?.textContent).toContain("₹220 · GST 5% · HSN 19059090");
        act(() => option?.click());
        await settle();
        expect(paperText()).toContain("Focaccia (trade)");
        expect(paperText()).toContain("GST 5% · HSN 19059090 · 1 × ₹220");
        expect(paperText()).toContain("₹8,020");
    });

    it("what was typed becomes a new line, opened for its price and GST", async () => {
        products.findInvoiceProducts.mockResolvedValue({
            ok: true,
            data: { items: [], more: false },
        });
        render();
        act(() => button("Add a line · type or pick a product").click());
        setValue(
            all().querySelector<HTMLInputElement>("[cmdk-input]"),
            "Olive bread",
        );
        const typed = Array.from(
            all().querySelectorAll<HTMLElement>('[role="option"]'),
        ).find((o) => o.textContent.includes("as a new line"));
        expect(typed?.textContent).toContain("You'll set price and GST");
        act(() => typed?.click());
        await act(async () => {
            await new Promise((r) => setTimeout(r, 10));
        });
        await settle();
        // On the paper to be finished, and its editor open.
        expect(paperText()).toContain("Olive bread");
        expect(paperText()).toContain("Set its quantity and price");
        expect(text()).toContain("Line 3");
        expect(byLabel("What it's for").value).toBe("Olive bread");
    });
});

describe("the GST fields a tax invoice must carry", () => {
    it("are labelled with where they come from", () => {
        render();
        const tags = Array.from(paper().querySelectorAll("[data-locked]")).map(
            (t) => t.textContent.trim(),
        );
        expect(tags).toEqual(
            expect.arrayContaining([
                "Seller",
                "Next in series",
                "Name, address, GSTIN",
                "Set from the customer",
                "Per rate",
                "Required",
            ]),
        );
    });

    it("the seller, the GSTIN, the number and the section 31 line can't be taken off", () => {
        render();
        act(() => part("The number").click());
        expect(text()).toContain(
            "Issuing gives it the next number, RYE/26-27/0032",
        );
        expect(text()).toContain("can't be typed or taken off");
        expect(hasButton("Remove line")).toBe(false);
        act(() => part("The seller").click());
        expect(text()).toContain("Your name, address and GSTIN come from");
        expect(hasButton("Remove line")).toBe(false);
        // The footer has no control at all: nothing opens it.
        expect(
            paper()
                .querySelector('[data-part="footer"]')
                ?.querySelector("button"),
        ).toBeNull();
        expect(paperText()).toContain(
            "Tax invoice under section 31, CGST Act.",
        );
        expect(paperText()).toContain("GSTIN 29AAGCR4375J1ZU");
    });

    it.each(["Classic", "Band", "Compact"])(
        "%s still prints every particular on the paper",
        (style) => {
            render();
            choose(style);
            const out = paperText();
            for (const words of [
                "Rye & Co.",
                "3 Hill Road, Indiranagar",
                "GSTIN 29AAGCR4375J1ZU",
                "Number when issued",
                "Vivek Nair · Brew Lane",
                "7 27th Main, HSR Layout",
                "GSTIN 29ABCFB2207K1ZL",
                "HSN 19059020",
                "Butter croissant (trade)",
                "20 × ₹150",
                "₹7,800",
                "Taxable value",
                "GST 18%",
                "CGST 9%",
                "Karnataka (29) · CGST + SGST",
                "Reverse charge does not apply.",
            ]) {
                expect(out, `${style}: ${words}`).toContain(words);
            }
        },
    );
});

describe("the style rail", () => {
    it("follows the business's default until a look is chosen, and says so", () => {
        render();
        expect(paper().dataset.style).toBe("CLASSIC");
        expect(text()).toContain("Your default look: Classic · ink.");
        expect(hasButton("Use my default")).toBe(false);
    });

    it("sits beside the paper on a wide screen, not at the page's far edge (#1161)", () => {
        render();
        const rail = host.querySelector<HTMLElement>(
            'aside[aria-label="Style"]',
        );
        const grid = rail?.parentElement;
        // The paper's track is capped at its own width, so no free space
        // opens between it and the rail; one column below the desk.
        expect(grid?.className).toContain(
            "min-[1100px]:grid-cols-[minmax(0,820px)_260px]",
        );
        expect(grid?.className).not.toContain("1fr");
        expect(grid?.firstElementChild?.className).toContain("max-w-[820px]");
    });

    it("Band and a colour are the draft's own, drawn and saved", async () => {
        vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
        render();
        choose("Band");
        choose("Colour #2F5D50");
        expect(paper().dataset.style).toBe("BAND");
        const band = paper().querySelector<HTMLElement>("[data-band]");
        expect(band?.dataset.band).toBe("white");
        expect(band?.style.backgroundColor).toBe("rgb(47, 93, 80)");
        expect(text()).toContain("This invoice's own look.");
        await pause();
        expect(lastSave()).toMatchObject({
            paperStyle: "BAND",
            paperColour: "#2F5D50",
        });
        // Compact changes the layout: the buyer moves into the head.
        choose("Compact");
        const head = paper().querySelector("header");
        expect(head?.textContent).toContain("Vivek Nair");
    });

    it("a colour that can't be read is drawn deeper, and one typed wrong changes nothing", () => {
        render();
        const own = byLabel("Or your own");
        setValue(own, "zz");
        act(() => button("Use it").click());
        expect(text()).toContain("A colour is # and six letters or digits");
        expect(paper().dataset.style).toBe("CLASSIC");
        setValue(own, "#F6E7A1");
        act(() => button("Use it").click());
        expect(text()).toContain("Drawn a little deeper on the paper");
        const title = Array.from(paper().querySelectorAll("p")).find(
            (p) => p.textContent.trim() === "Tax invoice",
        );
        // Not the pale yellow itself: a deeper one that reads on white.
        expect(title?.style.color).not.toBe("");
        expect(title?.style.color).not.toBe("rgb(246, 231, 161)");
    });

    it("Use my default goes back to following the business's look", async () => {
        vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
        render({
            draft: draft({
                paper: { style: "COMPACT", colour: "#9B2C4A" },
                paperChoice: { style: "COMPACT", colour: "#9B2C4A" },
            }),
        });
        expect(paper().dataset.style).toBe("COMPACT");
        expect(text()).toContain("This invoice's own look.");
        act(() => button("Use my default").click());
        expect(paper().dataset.style).toBe("CLASSIC");
        await pause();
        expect(lastSave()).toMatchObject({ paperStyle: "", paperColour: "" });
    });

    it("Make this my default sets the business's look, and the draft then follows it", async () => {
        settings.saveOrganizationSettings.mockResolvedValue({
            ok: true,
            data: {
                name: "Rye & Co.",
                tax: { registered: true, state: "29", stateName: "Karnataka" },
                profile: { timezone: "Asia/Kolkata", taxId: "29AAGCR4375J1ZU" },
                invoicePaper: { style: "BAND", colour: "#6B3F1D" },
            },
        });
        render();
        choose("Band");
        choose("Colour #6B3F1D");
        act(() => button("Make this my default").click());
        await settle();
        expect(settings.saveOrganizationSettings).toHaveBeenCalledWith({
            invoicePaper: { style: "BAND", colour: "#6B3F1D" },
        });
        expect(text()).toContain("Your default look: Band · #6B3F1D.");
        expect(paper().dataset.style).toBe("BAND");
        expect(toast.showSuccess).toHaveBeenCalled();
    });

    it("a role without org:update chooses the draft's look but never the default", () => {
        render({ canSetDefault: false });
        choose("Band");
        expect(paper().dataset.style).toBe("BAND");
        expect(hasButton("Make this my default")).toBe(false);
        expect(hasButton("Change")).toBe(false);
        expect(text()).toContain(
            "Only an owner or admin can change the default.",
        );
        act(() => part("How to pay you").click());
        expect(hasButton("Change how to pay us")).toBe(false);
    });
});

describe("the form and the paper", () => {
    it("switching between them keeps the draft, and the address says which", () => {
        window.history.replaceState(null, "", "/billing/invoices/inv_7/edit");
        render();
        const qty = host.querySelector<HTMLInputElement>(
            '[aria-label="Line 2: quantity"]',
        );
        setValue(qty, "30");
        act(() => button("On the paper").click());
        expect(window.location.search).toBe("?mode=paper");
        expect(paperText()).toContain("30 × ₹150");
        act(() => part("Change line 2").click());
        setValue(byLabel("Qty"), "31");
        act(() => button("Form").click());
        expect(window.location.search).toBe("");
        expect(
            host.querySelector<HTMLInputElement>(
                '[aria-label="Line 2: quantity"]',
            )?.value,
        ).toBe("31");
    });
});

describe("on a phone", () => {
    it("a part opens in a sheet from the foot, and the style is behind Style", () => {
        // jsdom has none: a phone's answer, taken away after.
        window.matchMedia = ((query: string) => ({
            matches: true,
            media: query,
            addEventListener: () => undefined,
            removeEventListener: () => undefined,
        })) as unknown as typeof window.matchMedia;
        try {
            render();
            expect(text()).toContain("Tap any part to change it.");
            expect(host.querySelector('aside[aria-label="Style"]')).toBeNull();
            act(() => part("Change line 1").click());
            expect(all().querySelector("[data-header-sheet]")).not.toBeNull();
            expect(text()).toContain("Line 1");
        } finally {
            Reflect.deleteProperty(window, "matchMedia");
        }
    });
});
