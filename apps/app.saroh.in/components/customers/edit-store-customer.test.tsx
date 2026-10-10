// @vitest-environment jsdom
/**
 * A location's own customer record, read first: the page shows the details
 * as rows and "Edit details" opens the form in a side sheet. The sheet
 * holds every field; a refusal keeps it open with what was typed; a save
 * closes it; Cancel drops the draft.
 */
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { stage } from "@/components/commerce/product-settings/test-kit";
import type { Customer } from "@/lib/customers/service";

import { EditStoreCustomer } from "./edit-store-customer";

const updateCustomer = vi.fn();
vi.mock("@/lib/customers/actions", () => ({
    createCustomer: vi.fn(),
    updateCustomer: (...a: unknown[]) => updateCustomer(...a) as unknown,
}));
const refresh = vi.fn();
vi.mock("next/navigation", () => ({
    useRouter: () => ({ push: vi.fn(), refresh }),
}));
const showError = vi.fn();
const showSuccess = vi.fn();
vi.mock("@saroh/ui/toast", () => ({
    showError: (...a: unknown[]) => showError(...a) as unknown,
    showSuccess: (...a: unknown[]) => showSuccess(...a) as unknown,
}));
vi.mock("@saroh/ui/sheet", async () =>
    (
        await import("@/components/commerce/product-settings/test-kit")
    ).sheetMock(),
);

const ASHA: Customer = {
    id: "cu1",
    email: "asha.rao@example.com",
    firstName: "Asha",
    lastName: "Rao",
    phone: "98200 00000",
    country: "India",
    state: "Karnataka",
    city: "Bengaluru",
    zipCode: "560001",
};

const s = stage();
const render = () =>
    s.render(
        <EditStoreCustomer
            storeId="st1"
            storeName="Indiranagar"
            customer={ASHA}
        />,
    );
const field = (name: string) =>
    s.sheet()?.querySelector<HTMLInputElement>(`input[name="${name}"]`);
/** Presses the form's own button and lets react-hook-form settle. */
async function save() {
    await act(async () => {
        s.button("Save changes", s.sheet())?.click();
        for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0));
    });
}

beforeEach(() => {
    s.mount();
    for (const m of [updateCustomer, refresh, showError, showSuccess])
        m.mockReset();
});
afterEach(() => s.unmount());

describe("Edit details on a location's customer", () => {
    it("is one button until it is opened", () => {
        render();
        expect(s.button("Edit details")).toBeDefined();
        expect(s.sheet()).toBe(null);
        expect(s.inputs()).toHaveLength(0);
    });

    it("opens a sheet named Edit details with every field the record has", () => {
        render();
        s.press("Edit details");
        expect(s.title(s.sheet())).toBe("Edit details");
        for (const [name, value] of [
            ["email", "asha.rao@example.com"],
            ["firstName", "Asha"],
            ["lastName", "Rao"],
            ["phone", "98200 00000"],
            ["city", "Bengaluru"],
            ["state", "Karnataka"],
            ["country", "India"],
            ["zipCode", "560001"],
        ])
            expect(field(name)?.value).toBe(value);
        expect(s.button("Save changes", s.sheet())).toBeDefined();
        expect(s.button("Cancel", s.sheet())).toBeDefined();
    });

    it("saves, closes and refreshes the rows", async () => {
        updateCustomer.mockResolvedValue({ ok: true, data: ASHA });
        render();
        s.press("Edit details");
        s.type(field("phone"), "98200 11111");
        await save();
        expect(updateCustomer).toHaveBeenCalledWith(
            "st1",
            "cu1",
            expect.objectContaining({
                phone: "98200 11111",
                city: "Bengaluru",
            }),
        );
        expect(s.sheet()).toBe(null);
        expect(refresh).toHaveBeenCalled();
        expect(showSuccess).toHaveBeenCalledWith("Saved");
    });

    it("stays open with what was typed when the email is refused", async () => {
        updateCustomer.mockResolvedValue({
            ok: false,
            field: "email",
            error: "Another customer here has that email.",
        });
        render();
        s.press("Edit details");
        s.type(field("email"), "taken@example.com");
        await save();
        expect(s.sheet()).not.toBe(null);
        expect(field("email")?.value).toBe("taken@example.com");
        expect(s.sheet()?.textContent).toContain(
            "Another customer here has that email.",
        );
    });

    it("drops the draft on Cancel, and saves nothing", () => {
        render();
        s.press("Edit details");
        s.type(field("phone"), "000");
        s.press("Cancel", s.sheet());
        expect(s.sheet()).toBe(null);
        expect(updateCustomer).not.toHaveBeenCalled();
        s.press("Edit details");
        expect(field("phone")?.value).toBe("98200 00000");
    });
});
