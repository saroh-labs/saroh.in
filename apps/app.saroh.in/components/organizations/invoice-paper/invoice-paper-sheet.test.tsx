// @vitest-environment jsdom
/**
 * Settings › Business › Tax and invoices › Invoice style (DEC-173, U15
 * #1127): the look every new invoice starts in, set by an Owner or Admin
 * in its row's sheet; a role without `org:update` reads it with no Edit.
 * Made-up details only.
 */
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
    address,
    draw,
    edit,
    item,
    mount,
    onTab,
    press,
    row,
    settings,
    sheet,
    sheetName,
    unmount,
} from "@/components/organizations/business-settings/business-settings.test-kit";

const save = vi.fn();
vi.mock("@/lib/organizations/settings-actions", () => ({
    saveOrganizationSettings: (...args: unknown[]) => save(...args) as unknown,
    undoOrganizationSettings: vi.fn(),
    undoBusinessLogo: vi.fn(),
    undoStorefrontHours: vi.fn(),
    saveBusinessLogo: vi.fn(),
}));
const showSuccess = vi.fn();
vi.mock("@saroh/ui/toast", () => ({
    showUndo: vi.fn(),
    showError: vi.fn(),
    showInfo: vi.fn(),
    showSuccess: (...args: unknown[]) => showSuccess(...args) as unknown,
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
    showSuccess.mockReset();
    onTab("tax");
});

afterEach(unmount);

const STYLE_ROW = "business-invoice-style";

function choose(name: string) {
    const hit = Array.from(
        document.querySelectorAll<HTMLElement>('[role="radio"]'),
    ).find(
        (r) =>
            r.getAttribute("aria-label") === name ||
            r.closest("label")?.textContent.startsWith(name),
    );
    if (!hit) throw new Error(`No choice ${name}`);
    act(() => hit.click());
}

describe("Invoice style", () => {
    it("reads Classic in ink until one is chosen", () => {
        draw(settings());
        expect(row(STYLE_ROW)?.textContent).toContain("Classic · ink");
        expect(row(STYLE_ROW)?.textContent).toContain(
            "New invoices start in it.",
        );
    });

    it("an owner sets the business's default in its sheet", async () => {
        save.mockResolvedValue({
            ok: true,
            data: settings({
                invoicePaper: { style: "BAND", colour: "#2F5D50" },
            }),
        });
        draw(settings());
        await press(edit("Edit invoice style"));
        expect(sheetName()).toBe("Invoice style");
        choose("Band");
        choose("Colour #2F5D50");
        await press(item("Save", sheet() ?? document));
        expect(save).toHaveBeenCalledWith({
            invoicePaper: { style: "BAND", colour: "#2F5D50" },
        });
        expect(sheet()).toBeNull();
        expect(row(STYLE_ROW)?.textContent).toContain("Band · #2F5D50");
        // No Undo: issued paper keeps its look whatever the default.
        expect(showSuccess.mock.calls[0]?.[0]).toContain(
            "Invoice style saved.",
        );
    });

    it("a refusal keeps the sheet open and says why", async () => {
        save.mockResolvedValue({
            ok: false,
            error: "Only owners and admins can change this.",
        });
        draw(settings());
        await press(edit("Edit invoice style"));
        choose("Compact");
        await press(item("Save", sheet() ?? document));
        expect(sheet()?.textContent).toContain(
            "Only owners and admins can change this.",
        );
    });

    it("a role without org:update reads it, with no Edit", () => {
        draw(settings({ invoicePaper: { style: "COMPACT", colour: null } }), {
            canEdit: false,
        });
        expect(row(STYLE_ROW)?.textContent).toContain("Compact · ink");
        expect(edit("Edit invoice style")).toBeNull();
    });
});
