// @vitest-environment jsdom
/**
 * Settings › Business › Logo: the logo is uploaded, replaced and taken off
 * inside its row's sheet, and becomes the business's logo only on Save.
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
    press,
    row,
    settings,
    settle,
    sheet,
    sheetName,
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

describe("the logo's sheet", () => {
    const file = (type = "image/png") => new File(["x"], "logo.png", { type });
    const pick = async (f: File) => {
        const picker =
            sheet()?.querySelector<HTMLInputElement>('input[type="file"]');
        if (!picker) throw new Error("No file field");
        await act(async () => {
            Object.defineProperty(picker, "files", {
                value: [f],
                configurable: true,
            });
            picker.dispatchEvent(new Event("change", { bubbles: true }));
            await Promise.resolve();
        });
        await settle();
    };

    it("uploads in the sheet, and sets the logo only on Save", async () => {
        const logo = { url: "https://cdn.example.com/l.png", mediaId: "m1" };
        upload.mockResolvedValue({ src: logo.url, mediaId: "m1" });
        saveLogo.mockResolvedValue({ ok: true, data: settings({ logo }) });
        draw(settings());
        await press(item("Add logo"));
        expect(sheetName()).toBe("Logo");

        await pick(file());
        expect(upload).toHaveBeenCalledTimes(1);
        // The picture shows in the sheet; nothing is the logo yet.
        expect(sheet()?.querySelector("img")?.getAttribute("src")).toBe(
            logo.url,
        );
        expect(saveLogo).not.toHaveBeenCalled();
        expect(row("business-logo")?.textContent).toContain("No logo yet");

        await press(item("Save"));
        expect(saveLogo).toHaveBeenCalledWith("m1");
        expect(sheet()).toBeNull();
        expect(row("business-logo")?.querySelector("img")).not.toBeNull();
        expect(showUndo.mock.calls[0]?.[0]).toBe(
            "Logo saved. It prints on your invoices and receipts.",
        );
    });

    it("a wrong file is said in the sheet before anything is sent", async () => {
        draw(settings());
        await press(item("Add logo"));
        await pick(file("image/svg+xml"));
        expect(upload).not.toHaveBeenCalled();
        expect(sheet()?.querySelector('[role="alert"]')?.textContent).toBe(
            "That file isn't a PNG, JPG or WebP image.",
        );
    });

    it("Remove then Cancel keeps the logo; Remove then Save takes it off", async () => {
        const logo = { url: "https://cdn.example.com/l.png", mediaId: "m1" };
        saveLogo.mockResolvedValue({ ok: true, data: settings() });
        draw(settings({ logo }));
        await press(edit("Edit logo"));
        await press(item("Remove", sheet() ?? document));
        await press(item("Cancel"));
        expect(saveLogo).not.toHaveBeenCalled();
        expect(row("business-logo")?.querySelector("img")).not.toBeNull();

        await press(edit("Edit logo"));
        await press(item("Remove", sheet() ?? document));
        await press(item("Save"));
        expect(saveLogo).toHaveBeenCalledWith(null);
        expect(row("business-logo")?.textContent).toContain("No logo yet");
    });

    it("a refusal keeps the sheet open and says why", async () => {
        upload.mockResolvedValue({
            src: "https://cdn.example.com/l.png",
            mediaId: "m1",
        });
        saveLogo.mockResolvedValue({
            ok: false,
            error: "That image can't be the logo.",
        });
        draw(settings());
        await press(item("Add logo"));
        await pick(file());
        await press(item("Save"));
        expect(sheetName()).toBe("Logo");
        expect(sheet()?.textContent).toContain("That image can't be the logo.");
    });
});
