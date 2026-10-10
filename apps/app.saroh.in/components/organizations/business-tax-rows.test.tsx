// @vitest-environment jsdom
/**
 * Settings › Business, read first: Contact, Tax and invoices and Registered
 * address. Rows say what is saved; each Edit opens its own sheet; Cancel
 * saves nothing; a refusal keeps it open; a save closes it and the row
 * reads the new value; a read-only role has no Edit; a link opens the right
 * sheet. Made-up details only.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
    address,
    card,
    draw,
    edit,
    host,
    input,
    item,
    mount,
    onTab,
    press,
    PROFILE,
    remount,
    row,
    settings,
    sheet,
    sheetName,
    type,
    unmount,
} from "./business-settings.test-kit";

const save = vi.fn();
const undoSettings = vi.fn();
const saveLogo = vi.fn();
vi.mock("@/lib/organizations/settings-actions", () => ({
    saveOrganizationSettings: (...args: unknown[]) => save(...args) as unknown,
    undoOrganizationSettings: (...args: unknown[]) =>
        undoSettings(...args) as unknown,
    undoBusinessLogo: vi.fn(),
    undoStorefrontHours: vi.fn(),
    saveBusinessLogo: (...args: unknown[]) => saveLogo(...args) as unknown,
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

const refresh = vi.fn();
vi.mock("next/navigation", () => ({
    useRouter: () => ({ push: vi.fn(), refresh }),
    useSearchParams: () => address.params,
    usePathname: () => "/settings/organization",
}));

// The logo's sheet uploads through the media library: a picked file
// becomes the picture this answers with.
const upload = vi.fn();
vi.mock("@/components/sites/media-picker", () => ({
    useImageUpload: () => ({ upload, busy: false, error: null }),
}));
const updateStorefront = vi.fn();
vi.mock("@/lib/stores/storefront-actions", () => ({
    updateStorefront: (...args: unknown[]) =>
        updateStorefront(...args) as unknown,
}));

beforeEach(() => {
    mount();
    for (const mock of [
        save,
        undoSettings,
        saveLogo,
        showUndo,
        showError,
        refresh,
        upload,
        updateStorefront,
    ]) {
        mock.mockReset();
    }
});

afterEach(unmount);

describe("Contact's rows and sheets", () => {
    it("rows say what is saved, and what an empty one means", () => {
        onTab("contact");
        draw(settings());
        expect(row("business-contact-email")?.textContent).toContain(
            "hello@example.com",
        );
        expect(row("business-phone")?.textContent).toContain(
            "None. Your website shows no Call button.",
        );
        expect(row("business-website")?.textContent).toContain(
            "None outside Saroh",
        );
    });

    it("the phone's sheet refuses a number that isn't one, then saves one that is", async () => {
        const after = settings({
            profile: { ...PROFILE, phone: "+919845012345" },
        });
        save.mockResolvedValue({ ok: true, data: after });
        onTab("contact");
        draw(settings());
        await press(item("Add phone"));
        expect(sheetName()).toBe("Phone on your website");
        await type(input("phone"), "12");
        await press(item("Save"));
        expect(save).not.toHaveBeenCalled();
        expect(
            sheet()?.querySelector('[role="alert"], p[id$="-message"]'),
        ).not.toBeNull();

        await type(input("phone"), "+91 98450 12345");
        await press(item("Save"));
        expect(save).toHaveBeenCalledWith({
            profile: { phone: "+91 98450 12345" },
        });
        expect(showUndo.mock.calls[0]?.[0]).toBe("Phone on your website saved");
        expect(sheet()).toBeNull();
        expect(edit("Edit phone")).not.toBeNull();
    });

    it("a link opens the contact email's sheet", () => {
        onTab("contact", "&edit=contactEmail");
        draw(settings());
        expect(sheetName()).toBe("Contact email");
        expect(input("contactEmail")?.value).toBe("hello@example.com");
    });

    it("a read-only role has no Edit", () => {
        onTab("contact");
        draw(settings(), { canEdit: false });
        expect(
            host.querySelector("#business-panel")?.querySelector("button"),
        ).toBeNull();
    });
});

describe("Tax and invoices' rows and sheets", () => {
    const GSTIN = "29AAGCR4375J1ZU";
    const OTHER = "27AAPFU0939F1ZV";
    const registered = (taxId: string | null = GSTIN) =>
        settings({
            profile: { ...PROFILE, taxId },
            tax: {
                registered: true,
                state: "29",
                stateName: "Karnataka",
                invoicePrefix: "NW",
                deliveryRate: "18",
                deliverySac: "996813",
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

    it("an unregistered business reads Not registered, with no GSTIN or delivery row", () => {
        onTab("tax");
        draw(settings());
        expect(row("business-gst")?.textContent).toContain("Not registered");
        expect(row("business-tax-id")?.textContent).toContain("Tax ID");
        expect(row("business-delivery-gst")).toBeNull();
        expect(card("Tax and invoices")?.textContent).toContain(
            "Set by GST law",
        );
        expect(item("Add tax ID")).toBeDefined();
    });

    it("a registered one reads its GSTIN, its state, its numbers and delivery", () => {
        onTab("tax");
        draw(registered());
        expect(row("business-gst")?.textContent).toContain("Registered");
        expect(row("business-tax-id")?.textContent).toContain(GSTIN);
        expect(card("Tax and invoices")?.textContent).toContain(
            "Karnataka · from the GSTIN",
        );
        expect(row("business-invoice-numbers")?.textContent).toContain(
            "Restarts: Every financial year",
        );
        expect(row("business-delivery-gst")?.textContent).toContain("18%");
        expect(row("business-delivery-gst")?.textContent).toContain("996813");
    });

    it("the GSTIN's sheet holds only the GSTIN; a refusal stays on it, a save closes it", async () => {
        onTab("tax");
        draw(registered());
        await press(edit("Edit GSTIN"));
        expect(sheetName()).toBe("GSTIN");
        expect(sheet()?.querySelectorAll("input")).toHaveLength(1);

        await type(input("taxId"), OTHER);
        save.mockResolvedValueOnce({
            ok: false,
            error: "That GSTIN's check character is wrong.",
            field: "taxId",
        });
        await press(item("Save"));
        expect(sheetName()).toBe("GSTIN");
        expect(input("taxId")?.value).toBe(OTHER);
        expect(sheet()?.textContent).toContain(
            "That GSTIN's check character is wrong.",
        );

        save.mockResolvedValueOnce({
            ok: true,
            data: registered(OTHER),
        });
        await press(item("Save"));
        // The state follows the GSTIN, so the API doesn't refuse the pair.
        expect(save).toHaveBeenLastCalledWith({
            profile: { taxId: OTHER },
            tax: { state: "27" },
        });
        expect(sheet()).toBeNull();
        expect(row("business-tax-id")?.textContent).toContain(OTHER);
    });

    it("turning GST on asks for the GSTIN and the address in the one sheet", async () => {
        onTab("tax");
        draw(settings());
        await press(edit("Change GST registration"));
        expect(sheetName()).toBe("GST registration");
        expect(input("taxId")).toBeNull();
        await press(sheet()?.querySelector<HTMLElement>('[role="switch"]'));
        // The GSTIN, and the registered address a tax invoice prints.
        expect(input("taxId")).not.toBeNull();
        expect(input("addressLine1")).not.toBeNull();
        await press(item("Save"));
        expect(save).not.toHaveBeenCalled();
        expect(sheet()?.textContent).toContain("A tax invoice prints it.");
    });

    it("Cancel on the delivery sheet saves nothing", async () => {
        onTab("tax");
        draw(registered());
        await press(edit("Edit GST on delivery"));
        expect(sheetName()).toBe("GST on delivery");
        await type(input("deliverySac"), "996812");
        await press(item("Cancel"));
        expect(save).not.toHaveBeenCalled();
        expect(row("business-delivery-gst")?.textContent).toContain("996813");
    });

    it("a link opens the GSTIN's sheet; one for delivery asks about GST first when not registered", () => {
        onTab("tax", "&edit=taxId");
        draw(registered(null));
        expect(sheetName()).toBe("GSTIN");
        remount();
        onTab("tax", "&edit=delivery");
        draw(settings());
        expect(sheetName()).toBe("GST registration");
    });

    it("a read-only role has no Edit", () => {
        onTab("tax");
        draw(registered(), { canEdit: false });
        // The Invoices link is not a control of this screen's.
        expect(
            host.querySelector("#business-panel")?.querySelector("button"),
        ).toBeNull();
        expect(row("business-tax-id")?.textContent).toContain(GSTIN);
    });
});

describe("Registered address' row and sheet", () => {
    const at = (city: string, state: string | null) =>
        settings({
            tax: {
                registered: false,
                state,
                stateName: state ? "Karnataka" : null,
                invoicePrefix: null,
                deliveryRate: "18",
                deliverySac: null,
            },
            registeredAddress: {
                line1: "12 Hill Road",
                line2: null,
                city,
                postalCode: "560001",
                state,
                stateName: state ? "Karnataka" : null,
            },
        });
    const noState = () => at("Bengaluru", null);

    it("the row says the address and its country", () => {
        onTab("address");
        draw(noState());
        const text = row("business-registered-address")?.textContent;
        expect(text).toContain("12 Hill Road");
        expect(text).toContain("Bengaluru 560001");
        expect(text).toContain("India");
    });

    it("asks for the state on the sheet's save, and sends nothing (UX-018)", async () => {
        onTab("address");
        draw(noState());
        await press(edit("Edit registered address"));
        expect(sheetName()).toBe("Registered address");
        await type(input("city"), "Bengaluru North");
        await press(item("Save"));
        expect(save).not.toHaveBeenCalled();
        expect(sheet()?.textContent).toContain(
            "Choose your state. It's printed on your invoices, and GST depends on it.",
        );
        // Still open, with what was typed.
        expect(input("city")?.value).toBe("Bengaluru North");
    });

    it("Save sends the lines that changed, closes and the row reads them", async () => {
        save.mockResolvedValue({ ok: true, data: at("Mysuru", "29") });
        onTab("address");
        draw(at("Bengaluru", "29"));
        await press(edit("Edit registered address"));
        await type(input("city"), "Mysuru");
        await press(item("Save"));
        expect(save).toHaveBeenCalledWith({
            registeredAddress: { city: "Mysuru" },
        });
        expect(showUndo.mock.calls[0]?.[0]).toBe(
            "Registered address saved. Invoices from now on use it.",
        );
        expect(sheet()).toBeNull();
        expect(row("business-registered-address")?.textContent).toContain(
            "Mysuru 560001",
        );
    });

    it("a link opens the address sheet; a read-only role gets the row alone", () => {
        onTab("address", "&edit=address");
        draw(settings());
        expect(sheetName()).toBe("Registered address");
        remount();
        draw(settings(), { canEdit: false });
        expect(sheet()).toBeNull();
        expect(
            host.querySelector("#business-panel")?.querySelector("button"),
        ).toBeNull();
    });
});
