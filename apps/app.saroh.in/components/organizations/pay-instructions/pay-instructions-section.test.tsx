// @vitest-environment jsdom
/**
 * Settings › Business › How to pay us (R32), read first: the rows say what
 * is saved, any row's Edit opens the one sheet, its fields refuse what the
 * API would, Save sends only what changed, and the preview shows what a
 * customer will see (the business's own UPI QR, or the generic line when
 * nothing is set), saved on the page and live in the sheet. Made-up details
 * only.
 *
 * `react-dom/client` + `act` directly, as the other component tests do.
 */
import { act } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { PayInstructionsSettings } from "@/lib/organizations/pay-instructions";
import type { OrganizationSettings } from "@/lib/organizations/settings-service";

import { useBusinessSheets } from "@/components/organizations/business-settings/use-business-sheets";
import { PayInstructionsSection } from "./pay-instructions-section";

const save = vi.fn();
vi.mock("@/lib/organizations/settings-actions", () => ({
    saveOrganizationSettings: (...args: unknown[]) => save(...args) as unknown,
}));
const showError = vi.fn();
vi.mock("@saroh/ui/toast", () => ({
    showError: (...args: unknown[]) => showError(...args) as unknown,
}));
vi.mock("next/navigation", () => ({
    useSearchParams: () => new URLSearchParams("section=pay"),
}));

const NONE: PayInstructionsSettings = {
    upiId: null,
    bankAccountName: null,
    bankAccountNumber: null,
    bankIfsc: null,
    bankName: null,
    note: null,
};
const UPI = "northwind.supply@okexample";

let root: Root;
let host: HTMLDivElement;
const onSaved = vi.fn();
const offerUndo = vi.fn();

/** The tab as the page holds it: the page owns which sheet is open. */
function Tab({
    saved,
    canEdit,
}: {
    saved: PayInstructionsSettings | undefined;
    canEdit: boolean;
}) {
    const sheets = useBusinessSheets(
        (which) => (canEdit ? which : null),
        () => undefined,
    );
    return (
        <PayInstructionsSection
            saved={saved}
            businessName="Northwind"
            canEdit={canEdit}
            hidden={false}
            sheets={sheets}
            onSaved={onSaved}
            offerUndo={offerUndo}
        />
    );
}

function draw(saved: PayInstructionsSettings | undefined, canEdit = true) {
    act(() => root.render(<Tab saved={saved} canEdit={canEdit} />));
}

beforeEach(() => {
    (
        globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    save.mockReset();
    showError.mockReset();
    onSaved.mockReset();
    offerUndo.mockReset();
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

const sheet = () => document.querySelector<HTMLElement>('[role="dialog"]');
const sheetName = () => {
    const id = sheet()?.getAttribute("aria-labelledby");
    return id ? document.getElementById(id)?.textContent : undefined;
};

async function typeInto(name: string, value: string) {
    const el = sheet()?.querySelector<HTMLInputElement | HTMLTextAreaElement>(
        `[name="${name}"]`,
    );
    if (!el) throw new Error(`No field ${name}`);
    act(() => {
        Object.getOwnPropertyDescriptor(
            Object.getPrototypeOf(el) as object,
            "value",
        )?.set?.call(el, value);
        el.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await settle();
}

async function press(name: string, within: ParentNode = document) {
    const hit = Array.from(within.querySelectorAll("button")).find(
        (b) =>
            b.getAttribute("aria-label") === name ||
            b.textContent.trim() === name,
    );
    if (!hit) throw new Error(`No button ${name}`);
    await act(async () => {
        hit.click();
        await Promise.resolve();
    });
    await settle();
}

/** The page's preview: what is saved. */
const preview = () =>
    host.querySelector<HTMLElement>('aside[aria-label="What customers see"]');
/** The sheet's preview: what is being typed. */
const draft = () =>
    sheet()?.querySelector<HTMLElement>(
        'aside[aria-label="What customers see"]',
    );

describe("How to pay us (R32)", () => {
    it("with nothing set, reads Not set and previews the generic line", () => {
        draw(NONE);
        expect(host.textContent).toContain("UPI ID");
        expect(host.textContent).toContain("Not set");
        expect(host.textContent).toContain(
            "Shown to customers on invoices and unpaid orders, so they can pay you by UPI or bank transfer.",
        );
        // Exactly this, with no stray whitespace: the server's and the
        // client's text must match, or React reports a hydration mismatch
        // (UX-086).
        expect(
            preview()?.querySelector('[data-state="empty"] p')?.textContent,
        ).toBe(
            "Nothing set yet. Customers see “Pay Northwind the way they've asked you to.”",
        );
        expect(preview()?.querySelector('[data-testid="upi-qr"]')).toBeNull();
        // Read first: no field until a row's Edit.
        expect(host.querySelector("input, textarea, form")).toBeNull();
        expect(sheet()).toBeNull();
    });

    it("reads an older API that sent none as nothing set", () => {
        draw(undefined);
        expect(host.textContent).toContain("Not set");
    });

    it("reads saved details back, the account number in fours, and previews the QR", () => {
        draw({
            ...NONE,
            upiId: UPI,
            bankAccountName: "Northwind Supply",
            bankAccountNumber: "987654321012",
            bankIfsc: "WXYZ0654321",
            note: "Send a screenshot once paid.",
        });
        const card = host.querySelector('section[aria-label="How to pay us"]');
        expect(card?.textContent).toContain(UPI);
        expect(card?.textContent).toContain("9876 5432 1012");
        expect(card?.textContent).toContain("WXYZ0654321");
        expect(card?.textContent).toContain("Send a screenshot once paid.");
        expect(
            preview()?.querySelector('[data-testid="upi-qr"]'),
        ).not.toBeNull();
        expect(preview()?.textContent).toContain("Pay by bank transfer");
    });

    it("a read-only role sees the rows without Edit", () => {
        draw({ ...NONE, upiId: UPI }, false);
        expect(host.textContent).toContain(UPI);
        // The preview's own Copy is the customer's, not an Edit.
        expect(
            host.querySelector("#business-pay-panel")?.querySelector("button"),
        ).toBeNull();
    });

    it("any row's Edit opens the one sheet, and the keyboard goes back to that row", async () => {
        draw(NONE);
        await press("Add bank details");
        expect(sheetName()).toBe("How to pay us");
        expect(sheet()?.querySelector('[name="upiId"]')).not.toBeNull();
        expect(sheet()?.querySelector('[name="note"]')).not.toBeNull();
        await press("Cancel");
        expect(sheet()).toBeNull();
        expect(document.activeElement?.id).toBe("business-pay-bank-edit");
    });

    it("refuses a UPI ID and an IFSC that aren't, on their fields, and sends nothing", async () => {
        draw(NONE);
        await press("Add UPI ID");
        await typeInto("upiId", "northwind");
        await typeInto("bankAccountName", "Northwind Supply");
        await typeInto("bankAccountNumber", "987654321012");
        await typeInto("bankIfsc", "WXYZ123");
        await press("Save");
        expect(sheet()?.textContent).toContain("That isn't a UPI ID.");
        expect(sheet()?.textContent).toContain("An IFSC is 11 characters");
        expect(save).not.toHaveBeenCalled();
        // The preview leaves out what isn't valid yet.
        expect(draft()?.querySelector('[data-testid="upi-qr"]')).toBeNull();
    });

    it("asks for the rest of the bank details on Save, and sends nothing", async () => {
        draw(NONE);
        await press("Add bank details");
        await typeInto("bankAccountNumber", "987654321012");
        await press("Save");
        expect(sheet()?.textContent).toContain(
            "Add the name on the account, so a transfer reaches you.",
        );
        expect(save).not.toHaveBeenCalled();
    });

    it("shows the new QR live in the sheet, saves only what changed and closes", async () => {
        const saved = { ...NONE, note: "Thanks!" };
        draw(saved);
        await press("Add UPI ID");
        await typeInto("upiId", ` ${UPI} `);
        expect(draft()?.textContent).toContain("Showing your unsaved edit");
        expect(draft()?.querySelector('[data-testid="upi-qr"]')).not.toBeNull();
        // The page still shows what is saved.
        expect(preview()?.querySelector('[data-testid="upi-qr"]')).toBeNull();

        const after = {
            payInstructions: { ...saved, upiId: UPI },
        } as unknown as OrganizationSettings;
        save.mockResolvedValue({ ok: true, data: after });
        await press("Save");
        expect(save).toHaveBeenCalledWith({
            payInstructions: { upiId: UPI },
        });
        expect(offerUndo).toHaveBeenCalledWith("How to pay us saved", null);
        expect(onSaved).toHaveBeenCalledWith(after);
        expect(sheet()).toBeNull();
    });

    it("Cancel saves nothing, and the next opening starts from what is saved", async () => {
        draw({ ...NONE, upiId: UPI });
        await press("Edit UPI ID");
        await typeInto("upiId", "someone@okexample");
        await press("Cancel");
        expect(save).not.toHaveBeenCalled();
        await press("Edit UPI ID");
        expect(
            sheet()?.querySelector<HTMLInputElement>('[name="upiId"]')?.value,
        ).toBe(UPI);
    });

    it("puts the API's refusal on the field it names, and stays open", async () => {
        draw(NONE);
        await press("Add UPI ID");
        await typeInto("upiId", UPI);
        save.mockResolvedValue({
            ok: false,
            error: "That isn't a UPI ID. It looks like yourname@okhdfc.",
            field: "upiId",
        });
        await press("Save");
        expect(sheet()?.textContent).toContain(
            "That isn't a UPI ID. It looks like yourname@okhdfc.",
        );
        expect(showError).not.toHaveBeenCalled();
        expect(onSaved).not.toHaveBeenCalled();
        expect(sheetName()).toBe("How to pay us");
    });
});

describe("How to pay us for a Global business (DEC-204)", () => {
    const GLOBAL: PayInstructionsSettings = { ...NONE, edition: "GLOBAL" };
    const IBAN = "GB82 WEST 1234 5698 7654 32";

    it("shows no UPI row or word, and bank details without a code count", () => {
        draw({
            ...GLOBAL,
            upiId: UPI,
            bankAccountName: "Northwind Supply",
            bankAccountNumber: "GB82WEST12345698765432",
        });
        const panel = host.querySelector("#business-pay-panel");
        expect(panel?.textContent).not.toContain("UPI");
        expect(panel?.textContent).toContain(IBAN);
        expect(host.textContent).not.toContain(UPI);
        expect(preview()?.querySelector('[data-testid="upi-qr"]')).toBeNull();
        expect(preview()?.textContent).toContain("Pay by bank transfer");
    });

    it("a UK business's sheet asks for an IBAN, checks it, and sends it with no code", async () => {
        draw({ ...GLOBAL, country: "GB" });
        await press("Add bank details");
        expect(sheet()?.querySelector('[name="upiId"]')).toBeNull();
        expect(sheet()?.querySelector('[name="bankIfsc"]')).toBeNull();
        const words = sheet()?.textContent;
        expect(words).toContain("Account name");
        expect(words).toContain("IBAN");
        expect(words).toContain("SWIFT/BIC (optional)");
        expect(words).toContain("Bank name");
        expect(words).not.toContain("IFSC");
        expect(words).not.toContain("Bank code");

        await typeInto("bankAccountName", "Northwind Supply");
        await typeInto("bankAccountNumber", "GB83 WEST 1234 5698 7654 32");
        await press("Save");
        expect(sheet()?.textContent).toContain(
            "That IBAN doesn't check out. Look for a missing or swapped character.",
        );
        expect(save).not.toHaveBeenCalled();

        await typeInto("bankAccountNumber", IBAN);
        expect(sheet()?.textContent).not.toContain("doesn't check out");
        expect(draft()?.textContent).toContain("Pay by bank transfer");
        expect(draft()?.textContent).toContain("IBAN");
        save.mockResolvedValue({ ok: true, data: {} });
        await press("Save");
        expect(save).toHaveBeenCalledWith({
            payInstructions: {
                bankAccountName: "Northwind Supply",
                bankAccountNumber: IBAN,
            },
        });
    });

    it("a US business's sheet asks for a routing number that checks, and a SWIFT/BIC", async () => {
        draw({ ...GLOBAL, country: "US" });
        await press("Add bank details");
        const words = sheet()?.textContent;
        expect(words).toContain("Account number");
        expect(words).toContain("Routing number");
        expect(words).not.toContain("IBAN");

        await typeInto("bankAccountName", "Northwind Supply");
        await typeInto("bankAccountNumber", "000123456789");
        await press("Save");
        expect(sheet()?.textContent).toContain(
            "Add the routing number: a transfer needs it with the account number.",
        );
        await typeInto("bankIfsc", "021000022");
        await typeInto("bankSwift", "BOFA");
        await press("Save");
        expect(sheet()?.textContent).toContain(
            "That routing number doesn't check out. Look for a missing or swapped digit.",
        );
        expect(sheet()?.textContent).toContain("That isn't a SWIFT/BIC.");
        expect(save).not.toHaveBeenCalled();

        await typeInto("bankIfsc", "021000021");
        await typeInto("bankSwift", "BOFAUS3N");
        expect(draft()?.textContent).toContain("Routing number");
        expect(draft()?.textContent).toContain("BOFAUS3N");
        save.mockResolvedValue({ ok: true, data: {} });
        await press("Save");
        expect(save).toHaveBeenCalledWith({
            payInstructions: {
                bankAccountName: "Northwind Supply",
                bankAccountNumber: "000123456789",
                bankIfsc: "021000021",
                bankSwift: "BOFAUS3N",
            },
        });
    });

    it.each([
        ["AU", "BSB", "06200", "A BSB is 6 digits, like 062-000."],
        [
            "CA",
            "Transit and institution number",
            "1234-003",
            "Add the 5-digit transit number and the 3-digit institution number, like 12345-003.",
        ],
        [
            "SG",
            "Bank and branch code",
            "717108",
            "Add the 4-digit bank code and the 3-digit branch code, like 7171-081.",
        ],
        [
            "ZA",
            "Branch code",
            "25065",
            "A branch code is 6 digits, like 250655.",
        ],
    ])(
        "a business in %s names its code %s, and refuses a bad one",
        async (country, label, bad, why) => {
            draw({ ...GLOBAL, country });
            await press("Add bank details");
            expect(sheet()?.textContent).toContain(label);
            await typeInto("bankIfsc", bad);
            await press("Save");
            expect(sheet()?.textContent).toContain(why);
        },
    );

    it("a New Zealand business gives one number, and no code field", async () => {
        draw({ ...GLOBAL, country: "NZ" });
        await press("Add bank details");
        expect(sheet()?.querySelector('[name="bankIfsc"]')).toBeNull();
        await typeInto("bankAccountName", "Northwind Supply");
        await typeInto("bankAccountNumber", "12-3456-765432-00");
        await press("Save");
        expect(sheet()?.textContent).toContain(
            "A New Zealand account number is 15 or 16 digits",
        );
    });
});
