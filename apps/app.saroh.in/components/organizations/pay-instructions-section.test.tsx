// @vitest-environment jsdom
/**
 * Settings › Business › How to pay us (R32): the card reads what is saved,
 * the fields refuse what the API would, Save sends only what changed, and
 * the preview shows what a customer will see — the business's own UPI QR,
 * or the generic line when nothing is set. Made-up details only.
 *
 * `react-dom/client` + `act` directly, as the other component tests do.
 */
import { act } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { PayInstructionsSettings } from "@/lib/organizations/pay-instructions";
import type { OrganizationSettings } from "@/lib/organizations/settings-service";

import { PayInstructionsSection } from "./pay-instructions-section";

const save = vi.fn();
vi.mock("@/lib/organizations/settings-actions", () => ({
    saveOrganizationSettings: (...args: unknown[]) => save(...args) as unknown,
}));
const showError = vi.fn();
vi.mock("@saroh/ui/toast", () => ({
    showError: (...args: unknown[]) => showError(...args) as unknown,
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
const onDone = vi.fn();
const onSaved = vi.fn();
const offerUndo = vi.fn();

function draw(saved: PayInstructionsSettings | undefined, editing = false) {
    act(() =>
        root.render(
            <PayInstructionsSection
                saved={saved}
                businessName="Northwind"
                editing={editing}
                canEdit
                onEdit={vi.fn()}
                onDone={onDone}
                onDirty={vi.fn()}
                onSaved={onSaved}
                hidden={false}
                offerUndo={offerUndo}
            />,
        ),
    );
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
    onDone.mockReset();
    onSaved.mockReset();
    offerUndo.mockReset();
});

afterEach(() => {
    act(() => root.unmount());
    host.remove();
});

async function settle() {
    for (let i = 0; i < 5; i++) {
        await act(async () => {
            await new Promise((r) => setTimeout(r, 0));
        });
    }
}

function typeInto(name: string, value: string) {
    const el = host.querySelector<HTMLInputElement | HTMLTextAreaElement>(
        `[name="${name}"]`,
    );
    if (!el) throw new Error(`No field ${name}`);
    const proto =
        el instanceof HTMLTextAreaElement
            ? HTMLTextAreaElement.prototype
            : HTMLInputElement.prototype;
    act(() => {
        Object.getOwnPropertyDescriptor(proto, "value")?.set?.call(el, value);
        el.dispatchEvent(new Event("input", { bubbles: true }));
    });
}

function button(name: string): HTMLButtonElement {
    const hit = Array.from(host.querySelectorAll("button")).find(
        (b) => b.textContent.trim() === name,
    );
    if (!hit) throw new Error(`No button ${name}`);
    return hit;
}

const preview = () =>
    host.querySelector<HTMLElement>('aside[aria-label="What customers see"]');

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
        expect(preview()?.querySelector("p.border-dashed")?.textContent).toBe(
            "Nothing set yet. Customers see “Pay Northwind the way they've asked you to.”",
        );
        expect(preview()?.textContent).toContain(
            "Customers see “Pay Northwind the way they've asked you to.”",
        );
        expect(preview()?.querySelector('[data-testid="upi-qr"]')).toBeNull();
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

    it("refuses a UPI ID and an IFSC that aren't, on their fields, with Save off", async () => {
        draw(NONE, true);
        typeInto("upiId", "northwind");
        typeInto("bankAccountName", "Northwind Supply");
        typeInto("bankAccountNumber", "987654321012");
        typeInto("bankIfsc", "WXYZ123");
        await settle();
        expect(host.textContent).toContain("That isn't a UPI ID.");
        expect(host.textContent).toContain("An IFSC is 11 characters");
        expect(button("Save").disabled).toBe(true);
        // The preview leaves out what isn't valid yet.
        expect(preview()?.querySelector('[data-testid="upi-qr"]')).toBeNull();
    });

    it("asks for the rest of the bank details on Save, and sends nothing", async () => {
        draw(NONE, true);
        typeInto("bankAccountNumber", "987654321012");
        await settle();
        await act(async () => {
            button("Save").click();
            await Promise.resolve();
        });
        await settle();
        expect(host.textContent).toContain(
            "Add the name on the account, so a transfer reaches you.",
        );
        expect(save).not.toHaveBeenCalled();
    });

    it("saves only what changed, and shows the new QR live while typing", async () => {
        const saved = { ...NONE, note: "Thanks!" };
        draw(saved, true);
        typeInto("upiId", ` ${UPI} `);
        await settle();
        expect(preview()?.textContent).toContain("Showing your unsaved edit");
        expect(
            preview()?.querySelector('[data-testid="upi-qr"]'),
        ).not.toBeNull();

        const after = {
            payInstructions: { ...saved, upiId: UPI },
        } as unknown as OrganizationSettings;
        save.mockResolvedValue({ ok: true, data: after });
        await act(async () => {
            button("Save").click();
            await Promise.resolve();
        });
        await settle();
        expect(save).toHaveBeenCalledWith({
            payInstructions: { upiId: UPI },
        });
        expect(offerUndo).toHaveBeenCalledWith("How to pay us saved", null);
        expect(onSaved).toHaveBeenCalledWith(after);
        expect(onDone).toHaveBeenCalled();
    });

    it("puts the API's refusal on the field it names", async () => {
        draw(NONE, true);
        typeInto("upiId", UPI);
        await settle();
        save.mockResolvedValue({
            ok: false,
            error: "That isn't a UPI ID. It looks like yourname@okhdfc.",
            field: "upiId",
        });
        await act(async () => {
            button("Save").click();
            await Promise.resolve();
        });
        await settle();
        expect(host.textContent).toContain(
            "That isn't a UPI ID. It looks like yourname@okhdfc.",
        );
        expect(showError).not.toHaveBeenCalled();
        expect(onDone).not.toHaveBeenCalled();
    });
});
