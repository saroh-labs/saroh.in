// @vitest-environment jsdom
/**
 * Settings › Business › Tax and invoices, "GST on your prices" (12 Oct
 * 2026): a GST-registered business reads which way its prices carry GST
 * and changes it in the row's sheet; the save says which way it now is and
 * offers Undo; a refusal keeps the sheet open and the row as stored. A
 * business that isn't registered has no row and is told nothing of it.
 * Made-up details only.
 */
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
    address,
    card,
    draw,
    edit,
    item,
    mount,
    onTab,
    press,
    PROFILE,
    remount,
    row,
    settings,
    settle,
    sheet,
    sheetName,
    unmount,
} from "./business-settings.test-kit";

const save = vi.fn();
const undoSettings = vi.fn();
vi.mock("@/lib/organizations/settings-actions", () => ({
    saveOrganizationSettings: (...args: unknown[]) => save(...args) as unknown,
    undoOrganizationSettings: (...args: unknown[]) =>
        undoSettings(...args) as unknown,
    undoBusinessLogo: vi.fn(),
    undoStorefrontHours: vi.fn(),
    saveBusinessLogo: vi.fn(),
}));

const showUndo = vi.fn();
const showError = vi.fn();
vi.mock("@saroh/ui/toast", () => ({
    showUndo: (...args: unknown[]) => showUndo(...args) as unknown,
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
    for (const mock of [save, undoSettings, showUndo, showError]) {
        mock.mockReset();
    }
});

afterEach(unmount);

const registered = (priceMode?: "INCLUDED" | "ADDED") =>
    settings({
        profile: { ...PROFILE, taxId: "29AAGCR4375J1ZU" },
        tax: {
            registered: true,
            state: "29",
            stateName: "Karnataka",
            invoicePrefix: "NW",
            deliveryRate: "18",
            deliverySac: "996813",
            ...(priceMode ? { priceMode } : {}),
        },
        registeredAddress: {
            line1: "12 Hill Road",
            line2: null,
            city: "Bengaluru",
            postalCode: "560001",
            state: "29",
            stateName: "Karnataka",
        },
    });

const ROW = "business-gst-on-prices";
const EDIT = "Edit GST on your prices";

/** The sheet's two radios, in order. */
const radios = () =>
    Array.from(
        sheet()?.querySelectorAll<HTMLButtonElement>('[role="radio"]') ?? [],
    );
/** A choice's radio, by the words its row starts with. */
const choice = (words: string) =>
    radios().find((radio) =>
        document
            .querySelector(`label[for="${radio.id}"]`)
            ?.textContent.startsWith(words),
    );

describe("the row", () => {
    it("says which way prices carry GST, and reads an older API as included", () => {
        onTab("tax");
        draw(registered("INCLUDED"));
        expect(row(ROW)?.textContent).toContain("GST on your prices");
        expect(row(ROW)?.textContent).toContain("Prices include GST");
        remount();
        draw(registered("ADDED"));
        expect(row(ROW)?.textContent).toContain("GST is added to prices");
        remount();
        draw(registered());
        expect(row(ROW)?.textContent).toContain("Prices include GST");
    });

    it("is not there for a business that isn't registered, and a link for it opens nothing", () => {
        onTab("tax", "&edit=priceMode");
        draw(settings());
        expect(row(ROW)).toBeNull();
        const text = card("Tax and invoices")?.textContent ?? "";
        expect(text).not.toContain("GST on your prices");
        expect(text).not.toContain("include GST");
        expect(text).not.toContain("GST is added");
        expect(sheet()).toBeNull();
    });

    it("has no Edit for a read-only role", () => {
        onTab("tax");
        draw(registered("ADDED"), { canEdit: false });
        expect(row(ROW)?.textContent).toContain("GST is added to prices");
        expect(edit(EDIT)).toBeNull();
    });
});

describe("the sheet", () => {
    it("holds the two choices with what each means, and what the choice leaves alone", async () => {
        onTab("tax");
        draw(registered());
        await press(edit(EDIT));
        expect(sheetName()).toBe("GST on your prices");
        expect(radios().map((r) => r.getAttribute("aria-checked"))).toEqual([
            "true",
            "false",
        ]);
        const text = sheet()?.textContent ?? "";
        expect(text).toContain("My prices include GST");
        expect(text).toContain(
            "A ₹1,000 price is ₹1,000 to pay. The GST inside it shows on the invoice.",
        );
        expect(text).toContain("GST is added to my prices");
        expect(text).toContain(
            "A ₹1,000 price at 18% is ₹1,180 to pay. Customers see the GST before they pay.",
        );
        expect(text).toContain(
            "This is for the prices of your services and products. You can set a single service or product differently where you edit it. A delivery charge, a course, a class pack, a membership plan and a line you type on an invoice are charged as typed, with GST included. Orders and bookings already made keep what they were charged.",
        );
    });

    it("a link opens it for a registered business", () => {
        onTab("tax", "&edit=priceMode");
        draw(registered("ADDED"));
        expect(sheetName()).toBe("GST on your prices");
        expect(radios().map((r) => r.getAttribute("aria-checked"))).toEqual([
            "false",
            "true",
        ]);
    });

    it("choosing the other way saves only the price mode, says so and offers Undo, which writes the old one back", async () => {
        const before = registered("INCLUDED");
        save.mockResolvedValue({ ok: true, data: registered("ADDED") });
        undoSettings.mockResolvedValue({ ok: true, data: before });
        onTab("tax");
        draw(before);
        await press(edit(EDIT));
        await press(choice("GST is added to my prices"));
        await press(item("Save"));

        expect(save).toHaveBeenCalledWith({ tax: { priceMode: "ADDED" } });
        expect(sheet()).toBeNull();
        expect(row(ROW)?.textContent).toContain("GST is added to prices");
        expect(showUndo).toHaveBeenCalledTimes(1);
        const [message, onUndo] = showUndo.mock.calls[0] as [
            string,
            () => void,
        ];
        expect(message).toBe("GST is now added to your prices");

        await act(async () => {
            onUndo();
            await Promise.resolve();
        });
        await settle();
        expect(undoSettings).toHaveBeenCalledWith(
            expect.objectContaining({
                input: { tax: { priceMode: "INCLUDED" } },
                expect: { "tax.priceMode": "ADDED" },
            }),
        );
        expect(row(ROW)?.textContent).toContain("Prices include GST");
    });

    it("going back to included says so", async () => {
        save.mockResolvedValue({ ok: true, data: registered("INCLUDED") });
        onTab("tax");
        draw(registered("ADDED"));
        await press(edit(EDIT));
        await press(choice("My prices include GST"));
        await press(item("Save"));
        expect(save).toHaveBeenCalledWith({ tax: { priceMode: "INCLUDED" } });
        expect(showUndo.mock.calls[0]?.[0]).toBe("Prices now include GST");
    });

    it("Save with nothing changed, and Cancel, send nothing", async () => {
        onTab("tax");
        draw(registered("INCLUDED"));
        await press(edit(EDIT));
        await press(item("Save"));
        expect(sheet()).toBeNull();
        await press(edit(EDIT));
        await press(choice("GST is added to my prices"));
        await press(item("Cancel"));
        expect(save).not.toHaveBeenCalled();
        expect(row(ROW)?.textContent).toContain("Prices include GST");
    });

    it("a save that fails is said, the sheet stays open and the row keeps what is stored", async () => {
        save.mockResolvedValue({
            ok: false,
            error: "Only a GST-registered business chooses how its prices carry GST.",
            field: "priceMode",
        });
        onTab("tax");
        draw(registered("INCLUDED"));
        await press(edit(EDIT));
        await press(choice("GST is added to my prices"));
        await press(item("Save"));
        // The API named the field: its reason sits under the choice.
        expect(sheetName()).toBe("GST on your prices");
        expect(sheet()?.textContent).toContain(
            "Only a GST-registered business chooses how its prices carry GST.",
        );
        expect(choice("GST is added to my prices")?.ariaChecked).toBe("true");
        expect(showUndo).not.toHaveBeenCalled();
        expect(row(ROW)?.textContent).toContain("Prices include GST");

        // A failure that names no field is said in a toast.
        save.mockResolvedValue({
            ok: false,
            error: "Couldn't save your business details.",
        });
        await press(item("Save"));
        expect(showError).toHaveBeenCalledWith(
            "Couldn't save your business details.",
        );
        expect(sheetName()).toBe("GST on your prices");
        expect(row(ROW)?.textContent).toContain("Prices include GST");
    });
});
