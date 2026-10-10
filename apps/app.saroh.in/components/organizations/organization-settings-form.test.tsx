// @vitest-environment jsdom
/**
 * Settings › Business, read first (owner, 10 Oct): every tab is rows saying
 * what is saved, and a row's Edit opens its own side sheet with one Save.
 * Here, Identity: Cancel saves nothing, a refusal keeps the sheet open with
 * what was typed, a save closes it and the row reads the new value, a
 * read-only role has no Edit, and a link with `?edit=` opens the right
 * sheet. The other tabs are `business-tax-rows.test.tsx` and
 * `business-hours-section.test.tsx`; the logo, `business-logo-sheet.test.tsx`.
 * Made-up details only.
 */
import { act } from "react";
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
    pressEscape,
    row,
    settings,
    settle,
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

describe("Identity's rows and sheets", () => {
    it("rows say what is saved, with nothing open until a row's Edit", () => {
        draw(settings());
        expect(row("business-kind")?.textContent).toContain("A business");
        expect(row("business-name")?.textContent).toContain("Northwind Supply");
        expect(row("business-logo")?.textContent).toContain("No logo yet");
        expect(row("business-legal-name")?.textContent).toContain(
            "Same as the business name",
        );
        expect(row("business-type")?.textContent).toContain("Individual");
        expect(card("Identity")?.textContent).toContain("No orders yet");
        expect(card("Identity")?.textContent).toContain(
            "From your first order",
        );
        expect(sheet()).toBeNull();
        expect(host.querySelector("input, textarea, form")).toBeNull();
    });

    it("Edit opens the name's sheet; Save sends only the name, closes and the row reads it", async () => {
        const before = settings();
        const after = settings({ name: "Northwind & Co." });
        save.mockResolvedValue({ ok: true, data: after });
        draw(before);
        await press(edit("Edit business name"));
        expect(sheetName()).toBe("Business name");
        expect(input("name")?.value).toBe("Northwind Supply");
        expect(document.activeElement).toBe(input("name"));
        // Only this row's field.
        expect(sheet()?.querySelectorAll("input")).toHaveLength(1);

        await type(input("name"), "Northwind & Co.");
        // What a customer will read, as it is typed.
        expect(
            sheet()?.querySelector('aside[aria-label="How it prints"]')
                ?.textContent,
        ).toContain("Northwind & Co.");
        expect(save).not.toHaveBeenCalled();
        await press(item("Save"));

        expect(save).toHaveBeenCalledWith({ name: "Northwind & Co." });
        expect(showUndo.mock.calls[0]?.[0]).toBe(
            "Business name saved. Invoices from now on use it.",
        );
        expect(sheet()).toBeNull();
        expect(row("business-name")?.textContent).toContain("Northwind & Co.");
        // The page's preview shows what is saved now.
        expect(
            host.querySelector('aside[aria-label="How it prints"]')
                ?.textContent,
        ).toContain("Northwind & Co.");
        // The header switcher shows the name: the page reads again.
        expect(refresh).toHaveBeenCalled();
    });

    it("Cancel, Escape and Close save nothing, and the next opening starts from what is saved", async () => {
        draw(settings());
        await press(edit("Edit business name"));
        await type(input("name"), "Something else");
        await press(item("Cancel"));
        expect(sheet()).toBeNull();
        expect(document.activeElement).toBe(edit("Edit business name"));

        await press(edit("Edit business name"));
        expect(input("name")?.value).toBe("Northwind Supply");
        await type(input("name"), "Something else");
        await pressEscape();
        expect(sheet()).toBeNull();

        await press(edit("Edit business name"));
        await type(input("name"), "Something else");
        await press(item("Close", sheet() ?? document));
        expect(sheet()).toBeNull();

        expect(save).not.toHaveBeenCalled();
        expect(row("business-name")?.textContent).toContain("Northwind Supply");
    });

    it("Save with nothing changed just closes", async () => {
        draw(settings());
        await press(edit("Edit legal name"));
        expect(sheetName()).toBe("Legal name");
        await press(item("Save"));
        expect(save).not.toHaveBeenCalled();
        expect(sheet()).toBeNull();
    });

    it("an empty name is said on its field and not sent", async () => {
        draw(settings());
        await press(edit("Edit business name"));
        await type(input("name"), "   ");
        await press(item("Save"));
        expect(save).not.toHaveBeenCalled();
        expect(sheet()?.textContent).toContain("Name is required");
    });

    it("a refusal keeps the sheet open with what was typed, on the field the API names", async () => {
        save.mockResolvedValue({
            ok: false,
            error: "That name is taken by another business.",
            field: "name",
        });
        draw(settings());
        await press(edit("Edit business name"));
        await type(input("name"), "Rye & Co.");
        await press(item("Save"));
        expect(sheetName()).toBe("Business name");
        expect(input("name")?.value).toBe("Rye & Co.");
        expect(sheet()?.textContent).toContain(
            "That name is taken by another business.",
        );
        expect(showError).not.toHaveBeenCalled();
        expect(row("business-name")?.textContent).toContain("Northwind Supply");
    });

    it("a refusal that names no field here is a toast, and the sheet stays open", async () => {
        save.mockResolvedValue({ ok: false, error: "Couldn't save that." });
        draw(settings());
        await press(edit("Edit business name"));
        await type(input("name"), "Rye & Co.");
        await press(item("Save"));
        expect(showError).toHaveBeenCalledWith("Couldn't save that.");
        expect(sheetName()).toBe("Business name");
        expect(input("name")?.value).toBe("Rye & Co.");
    });

    it("a read-only role sees the rows without Edit, and a link opens no sheet", () => {
        onTab("identity", "&edit=name");
        draw(settings({ kind: "SOLO" }), { canEdit: false });
        expect(row("business-kind")?.textContent).toContain("Just me");
        expect(row("business-name")?.textContent).toContain("Northwind Supply");
        expect(
            host.querySelector("#business-panel")?.querySelector("button"),
        ).toBeNull();
        expect(sheet()).toBeNull();
    });

    it("a link with ?edit= opens that row's sheet, and closing it takes the query out", async () => {
        onTab("identity", "&edit=type");
        window.history.replaceState(
            null,
            "",
            "/settings/organization?section=identity&edit=type",
        );
        draw(settings());
        expect(sheetName()).toBe("Type");
        await press(item("Cancel"));
        expect(sheet()).toBeNull();
        expect(window.location.search).toBe("?section=identity");
    });

    it("a link to a row on another tab opens nothing", () => {
        onTab("identity", "&edit=taxId");
        draw(settings());
        expect(sheet()).toBeNull();
    });

    it("a step on this page that moves the address opens its sheet", () => {
        draw(settings());
        expect(sheet()).toBeNull();
        onTab("identity", "&edit=legalName");
        draw(settings());
        expect(sheetName()).toBe("Legal name");
    });
});

describe("What is this? (DEC-070, K5)", () => {
    it("reads what is saved at the top of Identity, in the kind's words", () => {
        draw(settings({ kind: "WORK" }));
        expect(card("Identity")?.textContent).toContain("What this is");
        expect(card("Identity")?.textContent).toContain("A site for my work");
        expect(card("Identity")?.textContent).toContain("Your name or brand");
        expect(card("Identity")?.textContent).not.toContain("Business name");
    });

    it("switching to Just me saves kind SOLO, and offers Undo", async () => {
        const before = settings();
        const after = settings({ kind: "SOLO" });
        save.mockResolvedValue({ ok: true, data: after });
        undoSettings.mockResolvedValue({ ok: true, data: before });
        draw(before);

        await press(edit("Change what this is"));
        expect(sheetName()).toBe("What this is");
        const choices = Array.from(
            sheet()?.querySelectorAll<HTMLButtonElement>(
                '[aria-labelledby="business-kind-label"] [role="radio"]',
            ) ?? [],
        );
        expect(choices.map((c) => c.getAttribute("aria-checked"))).toEqual([
            "true",
            "false",
            "false",
        ]);
        expect(sheet()?.textContent).toContain(
            "Changes the words Saroh uses and what it suggests first. Nothing is turned on or off.",
        );

        await press(choices.find((c) => c.textContent.startsWith("Just me")));
        await press(item("Save"));

        // Only the kind: nothing else was changed.
        expect(save).toHaveBeenCalledWith({ kind: "SOLO" });
        // It prints on nothing, so the toast doesn't say invoices use it.
        expect(showUndo).toHaveBeenCalledTimes(1);
        const [message, onUndo] = showUndo.mock.calls[0] as [
            string,
            () => void,
        ];
        expect(message).toBe("What this is saved");
        // The rows read the new words at once.
        expect(card("Identity")?.textContent).toContain("Just me");
        expect(card("Identity")?.textContent).toContain("Your name or brand");

        // Undo sends the kind back, and the words come back with it.
        await act(async () => {
            onUndo();
            await Promise.resolve();
        });
        await settle();
        expect(undoSettings).toHaveBeenCalledWith(
            expect.objectContaining({
                input: { kind: "BUSINESS" },
                expect: { kind: "SOLO" },
            }),
        );
        expect(card("Identity")?.textContent).toContain("A business");
        expect(card("Identity")?.textContent).toContain("Business name");
    });

    it("reads a kind an older API never sent as a business", () => {
        draw(settings({ kind: undefined }));
        expect(card("Identity")?.textContent).toContain("A business");
        expect(card("Identity")?.textContent).toContain("Business name");
    });
});

describe("the addresses named apart (DEC-069, L12)", () => {
    it("draws no address row in Identity: the Web address card is its one place", () => {
        draw(settings());
        expect(card("Identity")?.textContent).not.toContain(
            "Workspace address",
        );
        expect(card("Identity")?.textContent).not.toContain("Can't be changed");
        expect(card("Identity")?.textContent).not.toContain("northwind");
    });

    it('names the registered address row "Registered address"', () => {
        onTab("address");
        draw(settings());
        expect(row("business-registered-address")?.textContent).toContain(
            "Registered address",
        );
        expect(row("business-registered-address")?.textContent).toContain(
            "No registered address yet",
        );
        expect(item("Add address")).toBeDefined();
    });
});

describe("the business type a business that said Registered still owes (prelaunch)", () => {
    const said = (type: string | null, registered: boolean | null) =>
        settings({
            profile: {
                legalName: null,
                type,
                country: "IN",
                taxId: null,
                contactEmail: "hello@example.com",
                website: null,
                timezone: "Asia/Kolkata",
                phone: null,
                registered,
            },
        });

    it("says why on the row, and in the sheet the checklist opens", async () => {
        draw(said(null, true));
        expect(row("business-type")?.textContent).toContain(
            "Not chosen yet. You said it's registered.",
        );
        await press(item("Choose type"));
        expect(sheetName()).toBe("Type");
        expect(sheet()?.textContent).toContain(
            "You said at setup that the business is registered. Choose which kind before you take money.",
        );
    });

    it("goes back to the plain words once a type is chosen", async () => {
        draw(said("llp", true));
        expect(row("business-type")?.textContent).toContain("LLP");
        await press(edit("Edit type"));
        expect(sheet()?.textContent).not.toContain("You said at setup");
        expect(sheet()?.textContent).toContain(
            "An individual trades in their own name",
        );
    });

    it("never says it to a business that didn't say Registered", async () => {
        draw(said(null, null));
        expect(row("business-type")?.textContent).not.toContain(
            "You said it's registered",
        );
        await press(item("Choose type"));
        expect(sheet()?.textContent).not.toContain("You said at setup");
    });
});
