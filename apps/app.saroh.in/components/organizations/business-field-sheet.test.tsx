// @vitest-environment jsdom
/**
 * Settings › Business's sheets and the rules that span two rows: only the
 * fields in a sheet hold its Save, and what a sheet's own change needs
 * from another row is asked for in that sheet, so nobody is sent to
 * another tab halfway. Made-up details only.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
    address,
    draw,
    edit,
    input,
    item,
    mount,
    onTab,
    press,
    PROFILE,
    settings,
    sheet,
    sheetName,
    type,
    unmount,
} from "./business-settings.test-kit";

const save = vi.fn();
vi.mock("@/lib/organizations/settings-actions", () => ({
    saveOrganizationSettings: (...args: unknown[]) => save(...args) as unknown,
    undoOrganizationSettings: vi.fn(),
    undoBusinessLogo: vi.fn(),
    undoStorefrontHours: vi.fn(),
    saveBusinessLogo: vi.fn(),
}));

const showError = vi.fn();
vi.mock("@saroh/ui/toast", () => ({
    showUndo: vi.fn(),
    showError: (...args: unknown[]) => showError(...args) as unknown,
    showInfo: vi.fn(),
    showSuccess: vi.fn(),
    dismissToast: vi.fn(),
}));

vi.mock("next/navigation", () => ({
    useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
    useSearchParams: () => address.params,
    usePathname: () => "/settings/organization",
}));
vi.mock("@/components/sites/media-picker", () => ({
    useImageUpload: () => ({ upload: vi.fn(), busy: false, error: null }),
}));
vi.mock("@/lib/stores/storefront-actions", () => ({
    updateStorefront: vi.fn(),
}));

beforeEach(() => {
    mount();
    save.mockReset();
    showError.mockReset();
});

afterEach(unmount);

const GSTIN = "29AAGCR4375J1ZU";

/** Registered under older rules, with no registered address on file. */
const noAddress = () =>
    settings({
        profile: { ...PROFILE, taxId: null },
        tax: {
            registered: true,
            state: "29",
            stateName: "Karnataka",
            invoicePrefix: "NW",
            deliveryRate: "18",
            deliverySac: null,
        },
        registeredAddress: {
            line1: null,
            line2: null,
            city: null,
            postalCode: null,
            state: "29",
            stateName: "Karnataka",
        },
    });

describe("a rule that spans two rows", () => {
    it("something amiss in another row never holds a row's own save", async () => {
        save.mockResolvedValue({ ok: true, data: noAddress() });
        draw(noAddress());
        await press(edit("Edit business name"));
        await type(input("name"), "Northwind & Co.");
        await press(item("Save"));
        expect(save).toHaveBeenCalledWith({ name: "Northwind & Co." });
        expect(showError).not.toHaveBeenCalled();
        expect(sheet()).toBeNull();
    });

    it("the GSTIN's sheet asks for the address a registered business still owes, so one Save covers both", async () => {
        save.mockResolvedValue({ ok: true, data: noAddress() });
        onTab("tax", "&edit=taxId");
        draw(noAddress());
        expect(sheetName()).toBe("GSTIN");
        expect(input("addressLine1")).not.toBeNull();

        await type(input("taxId"), GSTIN);
        await press(item("Save"));
        // Held by the address, in the sheet, with what was typed.
        expect(save).not.toHaveBeenCalled();
        expect(sheet()?.textContent).toContain("A tax invoice prints it.");
        expect(input("taxId")?.value).toBe(GSTIN);

        await type(input("addressLine1"), "12 Hill Road");
        await type(input("city"), "Bengaluru");
        await type(input("postalCode"), "560001");
        await press(item("Save"));
        expect(save).toHaveBeenCalledWith({
            profile: { taxId: GSTIN },
            tax: { state: "29" },
            registeredAddress: {
                line1: "12 Hill Road",
                city: "Bengaluru",
                postalCode: "560001",
            },
        });
        expect(sheet()).toBeNull();
    });

    it("a registered business whose address is whole is asked for its GSTIN alone", () => {
        const whole = noAddress();
        onTab("tax", "&edit=taxId");
        draw({
            ...whole,
            registeredAddress: {
                line1: "12 Hill Road",
                line2: null,
                city: "Bengaluru",
                postalCode: "560001",
                state: "29",
                stateName: "Karnataka",
            },
        });
        expect(sheetName()).toBe("GSTIN");
        expect(input("addressLine1")).toBeNull();
    });
});
