// @vitest-environment jsdom
/**
 * Settings › Business › Contact › Social links (DEC-128): one row saying
 * what is linked, and one sheet with a field per network that says where
 * each link will open as it is typed, refuses anything that isn't that
 * network's own address, and stays open on a refusal. Made-up details only.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { BUSINESS_ROW_ID } from "@/lib/organizations/business-rows";

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
    row,
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
});

afterEach(unmount);

const LINKED = {
    instagram: "https://www.instagram.com/rye",
    whatsapp: "https://wa.me/919845012345",
    telegram: "https://t.me/rye_co",
};

const socialRow = () => row(BUSINESS_ROW_ID.social);
/** The line under a field: where it opens, or what is wrong. */
const note = (network: string) =>
    document.getElementById(`business-social-links-panel-${network}-note`)
        ?.textContent ?? "";
const blur = async (el: HTMLInputElement | null) => {
    if (!el) throw new Error("No field to leave");
    const { act } = await import("react");
    await act(async () => {
        el.focus();
        el.blur();
        await Promise.resolve();
    });
};

describe("the Social links row", () => {
    it("says None yet, and offers to add them", () => {
        onTab("contact");
        draw(settings());
        expect(socialRow()?.textContent).toContain("Social links");
        expect(socialRow()?.textContent).toContain("None yet");
        expect(item("Add links")).toBeDefined();
    });

    it("names what is linked, and where it shows", () => {
        onTab("contact");
        draw(settings({ socialLinks: LINKED }));
        expect(socialRow()?.textContent).toContain(
            "Instagram, WhatsApp, Telegram",
        );
        expect(socialRow()?.textContent).toContain("On your website's footer");
        expect(edit("Edit social links")).not.toBeNull();
    });

    it("has no Edit for someone who can't change the business", () => {
        onTab("contact");
        draw(settings({ socialLinks: LINKED }), { canEdit: false });
        expect(socialRow()?.textContent).toContain("Instagram");
        expect(edit("Edit social links")).toBeNull();
        expect(item("Add links")).toBeUndefined();
    });

    it("opens from a link, with ?edit=social", () => {
        onTab("contact", "&edit=social");
        draw(settings());
        expect(sheetName()).toBe("Social links");
    });

    it("opens no sheet from a link for someone who can't edit", () => {
        onTab("contact", "&edit=social");
        draw(settings(), { canEdit: false });
        expect(sheet()).toBeNull();
    });
});

describe("the Social links sheet", () => {
    it("has a field per network, each with what it accepts", async () => {
        onTab("contact");
        draw(settings());
        await press(item("Add links"));
        expect(sheetName()).toBe("Social links");
        for (const [network, placeholder] of [
            ["instagram", "@yourname or instagram.com/yourname"],
            ["facebook", "yourpage or facebook.com/yourpage"],
            ["whatsapp", "+91 98450 12345"],
            ["youtube", "@yourchannel or youtube.com/@yourchannel"],
            ["x", "@yourname or x.com/yourname"],
            ["linkedin", "linkedin.com/company/yourname"],
            ["pinterest", "yourname or pinterest.com/yourname"],
            ["telegram", "@yourname or t.me/yourname"],
        ]) {
            expect(input(network)?.placeholder, network).toBe(placeholder);
            // A visible label, never the placeholder alone.
            const id = input(network)?.id ?? "";
            expect(
                sheet()?.querySelector(`label[for="${id}"]`)?.textContent,
            ).not.toBe("");
        }
    });

    it("has no Google Maps field: that is an address's map, not a social link", async () => {
        onTab("contact");
        draw(settings());
        await press(item("Add links"));
        expect(input("googleMaps")).toBeNull();
        expect(sheet()?.textContent).not.toContain("Google Maps");
    });

    it("starts from what is saved", async () => {
        onTab("contact");
        draw(settings({ socialLinks: LINKED }));
        await press(edit("Edit social links"));
        expect(input("instagram")?.value).toBe("instagram.com/rye");
        expect(input("whatsapp")?.value).toBe("+91 98450 12345");
        expect(note("instagram")).toBe("Opens instagram.com/rye");
    });

    it("says where a link will open as it is typed", async () => {
        onTab("contact");
        draw(settings());
        await press(item("Add links"));
        expect(note("instagram")).toBe("");
        await type(input("instagram"), "@rye.bakery");
        expect(note("instagram")).toBe("Opens instagram.com/rye.bakery");
        await type(input("x"), "https://twitter.com/rye_bakery");
        expect(note("x")).toBe("Opens x.com/rye_bakery");
    });

    it("says what is wrong once the field is left, not while typing", async () => {
        onTab("contact");
        draw(settings());
        await press(item("Add links"));
        await type(input("facebook"), "https://evil.example/rye");
        expect(note("facebook")).toBe("");
        await blur(input("facebook"));
        expect(note("facebook")).toBe(
            "That isn't a Facebook link. Use yourpage or facebook.com/yourpage.",
        );
        expect(input("facebook")?.getAttribute("aria-invalid")).toBe("true");
    });

    it("holds Save on a link it can't keep, and sends nothing", async () => {
        onTab("contact");
        draw(settings());
        await press(item("Add links"));
        await type(input("instagram"), "https://evil.example/rye");
        await press(item("Save"));
        expect(save).not.toHaveBeenCalled();
        expect(sheet()).not.toBeNull();
        expect(note("instagram")).toContain("That isn't an Instagram link.");
        expect(input("instagram")?.value).toBe("https://evil.example/rye");
    });

    it("saves only what changed, and the row reads it at once", async () => {
        save.mockResolvedValue({
            ok: true,
            data: settings({
                socialLinks: {
                    ...LINKED,
                    instagram: "https://www.instagram.com/rye.bakery",
                    x: "https://x.com/rye",
                },
            }),
        });
        onTab("contact");
        draw(settings({ socialLinks: LINKED }));
        await press(edit("Edit social links"));
        await type(input("instagram"), "@rye.bakery");
        await type(input("x"), "@rye");
        await press(item("Save"));

        expect(save).toHaveBeenCalledWith({
            socialLinks: { instagram: "@rye.bakery", x: "@rye" },
        });
        expect(sheet()).toBeNull();
        expect(socialRow()?.textContent).toContain(
            "Instagram, WhatsApp, X, Telegram",
        );
        expect(showSuccess).toHaveBeenCalledWith(
            "Social links saved. Your website shows them now.",
        );
    });

    it("clears a link left empty", async () => {
        save.mockResolvedValue({ ok: true, data: settings() });
        onTab("contact");
        draw(settings({ socialLinks: { instagram: LINKED.instagram } }));
        await press(edit("Edit social links"));
        await type(input("instagram"), "");
        await press(item("Save"));
        expect(save).toHaveBeenCalledWith({ socialLinks: { instagram: "" } });
        expect(socialRow()?.textContent).toContain("None yet");
        expect(showSuccess).toHaveBeenCalledWith(
            "Social links removed from your website",
        );
    });

    it("sends nothing when nothing changed", async () => {
        onTab("contact");
        draw(settings({ socialLinks: LINKED }));
        await press(edit("Edit social links"));
        await press(item("Save"));
        expect(save).not.toHaveBeenCalled();
        expect(sheet()).toBeNull();
    });

    it("keeps the sheet open on a refusal, under the field it names", async () => {
        save.mockResolvedValue({
            ok: false,
            error: "That isn't a YouTube channel link. Use @yourchannel or youtube.com/@yourchannel.",
            field: "socialLinks.youtube",
        });
        onTab("contact");
        draw(settings());
        await press(item("Add links"));
        await type(input("youtube"), "@ryebakery");
        await press(item("Save"));

        expect(sheet()).not.toBeNull();
        expect(input("youtube")?.value).toBe("@ryebakery");
        expect(note("youtube")).toContain("That isn't a YouTube channel link.");
        expect(socialRow()?.textContent).toContain("None yet");
        // Typing in the field again takes the refusal away.
        await type(input("youtube"), "@ryebakery2");
        expect(note("youtube")).toBe("Opens youtube.com/@ryebakery2");
    });

    it("says a refusal with no field in the sheet, and keeps what was typed", async () => {
        save.mockResolvedValue({
            ok: false,
            error: "You don't have access to change this.",
        });
        onTab("contact");
        draw(settings());
        await press(item("Add links"));
        await type(input("telegram"), "@rye_co");
        await press(item("Save"));
        expect(sheet()?.textContent).toContain(
            "You don't have access to change this.",
        );
        expect(input("telegram")?.value).toBe("@rye_co");
    });

    it("drops the draft on Cancel", async () => {
        onTab("contact");
        draw(settings({ socialLinks: LINKED }));
        await press(edit("Edit social links"));
        await type(input("instagram"), "@someone.else");
        await press(item("Cancel"));
        expect(save).not.toHaveBeenCalled();
        await press(edit("Edit social links"));
        expect(input("instagram")?.value).toBe("instagram.com/rye");
    });

    it("offers the business phone for WhatsApp when one is set", async () => {
        onTab("contact");
        draw(settings({ profile: { ...PROFILE, phone: "+919845012345" } }));
        await press(item("Add links"));
        await press(item("Use the business phone"));
        expect(input("whatsapp")?.value).toBe("+91 98450 12345");
        expect(note("whatsapp")).toBe("Opens wa.me/919845012345");
        // Used: the offer is gone.
        expect(item("Use the business phone")).toBeUndefined();
    });

    it("offers no business phone when none is set", async () => {
        onTab("contact");
        draw(settings());
        await press(item("Add links"));
        expect(item("Use the business phone")).toBeUndefined();
    });
});
