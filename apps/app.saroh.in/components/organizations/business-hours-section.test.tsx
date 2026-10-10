// @vitest-environment jsdom
/**
 * Settings › Business, read first: Hours, which are kept on the locations,
 * and How to pay us's place among the tabs (its rows and sheet are
 * `pay-instructions-section.test.tsx`). Made-up details only.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { OpeningHoursDay } from "@/lib/stores/storefronts";

import {
    address,
    draw,
    edit,
    host,
    input,
    item,
    mount,
    ONE_LOCATION,
    onTab,
    press,
    remount,
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

describe("Hours' row and sheet", () => {
    const summary = () =>
        host.querySelector('[data-testid="business-hours-summary"]')
            ?.textContent;
    const panel = () =>
        host.querySelector<HTMLElement>("#business-hours-panel");

    it("says the week in one line, and what is coming soon", () => {
        onTab("hours");
        draw(settings(), { hours: ONE_LOCATION, canEditHours: true });
        expect(summary()).toBe("Mon–Sat 9:00 AM – 6:00 PM · Sun closed");
        expect(panel()?.textContent).toContain("No closures planned");
        expect(panel()?.textContent).toContain("Coming soon");
        expect(panel()?.querySelector("input")).toBeNull();
    });

    it("Edit opens the week; a day that isn't one is refused in place; Save writes the location and closes", async () => {
        updateStorefront.mockImplementation(
            (_id: string, sent: { openingHours: OpeningHoursDay[] }) =>
                Promise.resolve({
                    ok: true,
                    data: { openingHours: sent.openingHours },
                }),
        );
        onTab("hours");
        draw(settings(), { hours: ONE_LOCATION, canEditHours: true });
        await press(edit("Edit opening hours"));
        expect(sheetName()).toBe("Opening hours");
        expect(input("mon")?.value).toBe("09:00–18:00");
        expect(input("sun")?.value).toBe("Closed");

        await type(input("sun"), "ten to four");
        await press(item("Save"));
        expect(updateStorefront).not.toHaveBeenCalled();
        expect(sheet()?.textContent).toContain("Use 07:00–19:00, or Closed.");

        await type(input("sun"), "10:00-16:00");
        await press(item("Save"));
        expect(updateStorefront).toHaveBeenCalledTimes(1);
        expect(updateStorefront.mock.calls[0]?.[0]).toBe("st_hill");
        expect(sheet()).toBeNull();
        expect(summary()).toBe(
            "Mon–Sat 9:00 AM – 6:00 PM · Sun 10:00 AM – 4:00 PM",
        );
        expect(showUndo.mock.calls[0]?.[0]).toBe("Hours saved");
    });

    it("a location that refuses is named, and the sheet stays open with what was typed", async () => {
        updateStorefront.mockResolvedValue({
            ok: false,
            error: "A day has to close after it opens.",
        });
        onTab("hours");
        draw(settings(), { hours: ONE_LOCATION, canEditHours: true });
        await press(edit("Edit opening hours"));
        await type(input("sun"), "10:00-16:00");
        await press(item("Save"));
        expect(showError).toHaveBeenCalledWith(
            "Hill Road: A day has to close after it opens.",
        );
        expect(sheetName()).toBe("Opening hours");
        expect(input("sun")?.value).toBe("10:00-16:00");
        expect(summary()).toBe("Mon–Sat 9:00 AM – 6:00 PM · Sun closed");
    });

    it("Cancel saves nothing", async () => {
        onTab("hours");
        draw(settings(), { hours: ONE_LOCATION, canEditHours: true });
        await press(edit("Edit opening hours"));
        await type(input("mon"), "08:00-20:00");
        await press(item("Cancel"));
        expect(updateStorefront).not.toHaveBeenCalled();
        expect(sheet()).toBeNull();
    });

    it("a link opens the sheet for someone who may change the locations, and for nobody else", () => {
        onTab("hours", "&edit=hours");
        draw(settings(), { hours: ONE_LOCATION, canEditHours: true });
        expect(sheetName()).toBe("Opening hours");
        remount();
        draw(settings(), { hours: ONE_LOCATION, canEditHours: false });
        expect(sheet()).toBeNull();
        expect(edit("Edit opening hours")).toBeNull();
        expect(summary()).toBe("Mon–Sat 9:00 AM – 6:00 PM · Sun closed");
    });

    it("with no location, says where hours are kept and offers no Edit", () => {
        onTab("hours", "&edit=hours");
        draw(settings(), { canEditHours: true });
        expect(panel()?.textContent).toContain(
            "Hours are kept on a location, and this business has none yet.",
        );
        expect(panel()?.querySelector("button")).toBeNull();
        expect(sheet()).toBeNull();
    });
});

describe("How to pay us (R32)", () => {
    it("is a tab of its own, after Tax, with its own preview in place of the invoice's", () => {
        onTab("pay");
        draw(
            settings({
                payInstructions: {
                    upiId: "northwind.supply@okexample",
                    bankAccountName: null,
                    bankAccountNumber: null,
                    bankIfsc: null,
                    bankName: null,
                    note: null,
                },
            }),
        );
        const tabs = Array.from(host.querySelectorAll('[role="tab"]')).map(
            (t) => t.textContent.trim(),
        );
        expect(tabs.indexOf("How to pay us")).toBe(
            tabs.indexOf("Tax and invoices") + 1,
        );
        const panel = host.querySelector<HTMLElement>("#business-pay-panel");
        expect(panel?.closest(".hidden")).toBeNull();
        expect(panel?.textContent).toContain("northwind.supply@okexample");
        expect(
            host
                .querySelector('aside[aria-label="How it prints"]')
                ?.classList.contains("hidden"),
        ).toBe(true);
        // Another tab's rows are not drawn.
        expect(host.querySelector("#business-panel")).toBeNull();
    });

    it("a link opens its sheet", () => {
        onTab("pay", "&edit=pay");
        draw(settings());
        expect(sheetName()).toBe("How to pay us");
    });
});
