// @vitest-environment jsdom
/**
 * Settings › Business, read first: Hours, which are kept on the locations
 * (How to pay us's place among the tabs is `organization-settings-form.test.tsx`).
 * Made-up details only.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { OpeningHoursDay } from "@/lib/stores/storefronts";

import {
    address,
    draw,
    edit,
    host,
    item,
    mount,
    ONE_LOCATION,
    onTab,
    press,
    remount,
    settings,
    sheet,
    sheetName,
    unmount,
} from "@/components/organizations/business-settings/business-settings.test-kit";

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
vi.mock("@/components/shared/fields/media-picker", () => ({
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
        expect(summary()).toBe("Mon to Sat 9:00 am to 6:00 pm · Sun closed");
        expect(panel()?.textContent).toContain("No closures planned");
        expect(panel()?.textContent).toContain("Coming soon");
        expect(panel()?.querySelector("input")).toBeNull();
    });

    /** A choice in the sheet's "Open days" control, by its words. */
    const days = (label: string) =>
        Array.from(
            sheet()?.querySelectorAll<HTMLElement>('[role="radio"]') ?? [],
        ).find((el) => el.textContent.trim() === label) ?? null;
    const sentWeek = () =>
        (
            updateStorefront.mock.calls[0]?.[1] as
                { openingHours: OpeningHoursDay[] } | undefined
        )?.openingHours;

    it("Edit opens the week as days and hours to pick, nothing to type; Save writes the location and closes", async () => {
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
        // The location's own fields: the saved week reads as Mon to Sat.
        expect(days("Mon to Sat")?.getAttribute("aria-checked")).toBe("true");
        expect(sheet()?.querySelector('input[type="text"]')).toBeNull();
        expect(sheet()?.textContent).not.toContain("or Closed");

        await press(days("Every day"));
        await press(item("Save"));
        expect(updateStorefront).toHaveBeenCalledTimes(1);
        expect(updateStorefront.mock.calls[0]?.[0]).toBe("st_hill");
        expect(sentWeek()?.every((d) => !d.closed)).toBe(true);
        expect(sheet()).toBeNull();
        expect(summary()).not.toContain("Sun closed");
        expect(showUndo.mock.calls[0]?.[0]).toBe("Hours saved.");
    });

    it("a location that refuses is named, and the sheet stays open with what was chosen", async () => {
        updateStorefront.mockResolvedValue({
            ok: false,
            error: "A day has to close after it opens.",
        });
        onTab("hours");
        draw(settings(), { hours: ONE_LOCATION, canEditHours: true });
        await press(edit("Edit opening hours"));
        await press(days("Every day"));
        await press(item("Save"));
        expect(showError).toHaveBeenCalledWith(
            "Hours weren't saved for Hill Road.",
            "A day has to close after it opens.",
        );
        expect(sheetName()).toBe("Opening hours");
        expect(days("Every day")?.getAttribute("aria-checked")).toBe("true");
        expect(summary()).toBe("Mon to Sat 9:00 am to 6:00 pm · Sun closed");
    });

    it("Cancel saves nothing", async () => {
        onTab("hours");
        draw(settings(), { hours: ONE_LOCATION, canEditHours: true });
        await press(edit("Edit opening hours"));
        await press(days("Every day"));
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
        expect(summary()).toBe("Mon to Sat 9:00 am to 6:00 pm · Sun closed");
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
