// @vitest-environment jsdom
/**
 * Website › Settings › Contact and social (DEC-125): rows that say what the
 * website shows of how to reach the business, each edited in place in the
 * business's own sheet, with nobody sent to Settings › Business. Read-only
 * for someone who can't change the business, and a read that failed says
 * so rather than "none". Made-up details only.
 */
import { act } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SiteSettings } from "@/components/sites/site-settings";
import { SiteSettingsRead } from "@/components/sites/site-settings-read";
import type {
    OrganizationSettings,
    SiteContactView,
} from "@/lib/organizations/settings-service";
import type { SiteDetail } from "@/lib/sites/service";
import type { SiteAddress } from "@/lib/sites/share-links";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({
    useRouter: () => ({ refresh }),
    useSearchParams: () => new URLSearchParams(window.location.search),
}));
vi.mock("@/lib/sites/actions", () => ({
    updateSiteFooter: vi.fn(),
    updateSiteNavigation: vi.fn(),
    updateSiteSettings: vi.fn(),
    setPublishNeedsApproval: vi.fn(),
    saveSiteIcon: vi.fn(),
}));
vi.mock("@/lib/qr/actions", () => ({
    openQrPanel: vi.fn(),
    makeQrPanelCode: vi.fn(),
}));
const save = vi.fn();
vi.mock("@/lib/organizations/settings-actions", () => ({
    saveOrganizationSettings: (...args: unknown[]) => save(...args) as unknown,
}));
const showError = vi.fn();
const showSuccess = vi.fn();
vi.mock("@saroh/ui/toast", () => ({
    showError: (...args: unknown[]) => showError(...args) as unknown,
    showSuccess: (...args: unknown[]) => showSuccess(...args) as unknown,
}));
vi.mock("@/components/sites/custom-domain", () => ({
    CustomDomain: () => null,
}));
vi.mock("@/components/sites/media-picker", () => ({
    MediaPicker: () => null,
    useImageUpload: () => ({ upload: vi.fn(), busy: false, error: null }),
}));

const site = {
    id: "site_rye",
    name: "Rye",
    can: { manageSettings: true, publish: true },
    currentPublication: null,
    footer: null,
    navigation: null,
    pages: [
        { id: "p_home", path: "/", title: "Home", isHome: true, hidden: false },
    ],
    pendingSectionChanges: 0,
    pendingSiteChanges: [],
    postsPrefix: null,
    sellsFrom: null,
    seoTitle: null,
    seoDescription: null,
    socialImageUrl: null,
    socialImageWidth: null,
    socialImageHeight: null,
    socialImageBytes: null,
} as unknown as SiteDetail;

const address: SiteAddress = {
    host: "rye.saroh.app",
    url: "https://rye.saroh.app",
    platformHost: "rye.saroh.app",
};

const PROFILE: NonNullable<OrganizationSettings["profile"]> = {
    legalName: null,
    type: "individual",
    country: "IN",
    taxId: null,
    contactEmail: null,
    website: null,
    timezone: "Asia/Kolkata",
    phone: null,
};

const business = (over: Partial<OrganizationSettings> = {}) =>
    ({
        id: "org_1",
        name: "Rye & Co.",
        slug: "rye",
        kind: "BUSINESS",
        profile: PROFILE,
        tradingSince: null,
        logo: null,
        socialLinks: {},
        siteShowsRegisteredAddress: false,
        ...over,
    }) satisfies OrganizationSettings;

const NOTHING: SiteContactView = {
    contact: { phone: null, email: null, places: [], social: [] },
    registeredAddressChosen: false,
};

const FULL: SiteContactView = {
    contact: {
        phone: "+919845012345",
        email: "hello@rye.example.com",
        places: [
            {
                source: "location",
                name: "Indiranagar",
                address: "12th Main\nBengaluru",
            },
        ],
        social: [
            { network: "instagram", url: "https://www.instagram.com/rye" },
            { network: "whatsapp", url: "https://wa.me/919845012345" },
        ],
    },
    registeredAddressChosen: false,
};

const FULL_BUSINESS = () =>
    business({
        profile: {
            ...PROFILE,
            phone: "+919845012345",
            contactEmail: "hello@rye.example.com",
        },
        socialLinks: {
            instagram: "https://www.instagram.com/rye",
            whatsapp: "https://wa.me/919845012345",
        },
    });

let root: Root;
let host: HTMLDivElement;

beforeEach(() => {
    (
        globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    vi.stubGlobal(
        "ResizeObserver",
        class {
            observe = vi.fn();
            unobserve = vi.fn();
            disconnect = vi.fn();
        },
    );
    Element.prototype.scrollIntoView = vi.fn();
    window.history.replaceState(
        null,
        "",
        "/sites/site_rye/settings?section=contact",
    );
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    for (const mock of [save, showError, showSuccess, refresh]) {
        mock.mockReset();
    }
});

afterEach(() => {
    act(() => root.unmount());
    host.remove();
    document.body.innerHTML = "";
});

function draw(
    contact: SiteContactView | null,
    settings: OrganizationSettings | null,
) {
    act(() =>
        root.render(
            <SiteSettings
                site={site}
                address={address}
                contact={contact}
                business={settings}
            />,
        ),
    );
}

async function settle() {
    for (let i = 0; i < 5; i++) {
        await act(async () => {
            await new Promise((r) => setTimeout(r, 0));
        });
    }
}
async function press(el: HTMLElement | null | undefined) {
    if (!el) throw new Error("Nothing to press");
    await act(async () => {
        el.click();
        await Promise.resolve();
    });
    await settle();
}
async function type(el: HTMLInputElement | null, value: string) {
    if (!el) throw new Error("No field to type in");
    await act(async () => {
        Object.getOwnPropertyDescriptor(
            Object.getPrototypeOf(el) as object,
            "value",
        )?.set?.call(el, value);
        el.dispatchEvent(new Event("input", { bubbles: true }));
        await Promise.resolve();
    });
    await settle();
}

const group = () =>
    host.querySelector<HTMLElement>('[data-settings-group="contact"]');
const rowText = (id: string) =>
    host.querySelector<HTMLElement>(`#${id}`)?.textContent ?? "";
const named = (name: string) =>
    host.querySelector<HTMLButtonElement>(`[aria-label="${name}"]`);
const item = (name: string) =>
    Array.from(document.querySelectorAll<HTMLButtonElement>("button")).find(
        (b) => b.textContent.trim() === name,
    );
const sheet = () => document.querySelector<HTMLElement>('[role="dialog"]');
const sheetName = () => {
    const id = sheet()?.getAttribute("aria-labelledby");
    return id ? document.getElementById(id)?.textContent : undefined;
};
const input = (name: string) =>
    sheet()?.querySelector<HTMLInputElement>(`[name="${name}"]`) ?? null;

describe("the Contact and social rows", () => {
    it("say what the website shows", () => {
        draw(FULL, FULL_BUSINESS());
        expect(rowText("settings-contact-phone")).toContain("+91 98450 12345");
        expect(rowText("settings-contact-email")).toContain(
            "hello@rye.example.com",
        );
        expect(rowText("settings-contact-address")).toContain(
            "12th Main, Bengaluru",
        );
        expect(rowText("settings-contact-social")).toContain(
            "Instagram, WhatsApp",
        );
        // Live, like the phone always was: no row waits for a publish.
        expect(group()?.querySelector('[data-saves="publish"]')).toBeNull();
        expect(group()?.textContent).toContain(
            "A change shows on your website straight away, with no publish.",
        );
    });

    it("say what the website leaves out when nothing is set", () => {
        draw(NOTHING, business());
        expect(rowText("settings-contact-phone")).toContain(
            "None. Your website shows no Call link.",
        );
        expect(rowText("settings-contact-email")).toContain(
            "None. Your website shows no email.",
        );
        expect(rowText("settings-contact-address")).toContain(
            "None. Your website shows no address.",
        );
        expect(rowText("settings-contact-social")).toContain("None yet");
        expect(named("Add phone")).not.toBeNull();
        expect(named("Add social links")).not.toBeNull();
    });

    it("name each place when the website shows several", () => {
        draw(
            {
                ...FULL,
                contact: {
                    ...FULL.contact,
                    places: [
                        {
                            source: "location",
                            name: "Indiranagar",
                            address: "12th Main",
                        },
                        {
                            source: "location",
                            name: "Koramangala",
                            address: "80 Feet Road",
                        },
                    ],
                },
            },
            FULL_BUSINESS(),
        );
        expect(rowText("settings-contact-address")).toContain(
            "Indiranagar: 12th Main",
        );
        expect(rowText("settings-contact-address")).toContain(
            "Koramangala: 80 Feet Road",
        );
    });

    it("have no Edit for someone who can't change the business, and say who can", () => {
        draw(FULL, null);
        expect(rowText("settings-contact-phone")).toContain("+91 98450 12345");
        expect(rowText("settings-contact-social")).toContain(
            "Instagram, WhatsApp",
        );
        expect(named("Edit phone")).toBeNull();
        expect(named("Edit social links")).toBeNull();
        expect(group()?.textContent).toContain(
            "An owner or admin can change them.",
        );
    });

    it("have no Edit for someone who can only read the site", () => {
        act(() =>
            root.render(
                <SiteSettingsRead
                    site={site}
                    address={address}
                    contact={FULL}
                />,
            ),
        );
        expect(rowText("settings-contact-email")).toContain(
            "hello@rye.example.com",
        );
        expect(
            group()?.querySelectorAll('button[aria-haspopup="dialog"]'),
        ).toHaveLength(0);
    });

    it("say the details couldn't be loaded, never that none are set", () => {
        draw(null, null);
        const alert = group()?.querySelector('[role="alert"]');
        expect(alert?.textContent).toContain(
            "Your contact details couldn't be loaded",
        );
        expect(group()?.textContent).not.toContain("None");
    });
});

describe("editing in place", () => {
    it("opens the social links sheet here, and the row reads the save at once", async () => {
        const next = business({
            socialLinks: { instagram: "https://www.instagram.com/rye" },
        });
        save.mockResolvedValue({ ok: true, data: next });
        draw(NOTHING, business());
        await press(named("Add social links"));
        expect(sheetName()).toBe("Social links");
        // Still on Website settings.
        expect(window.location.pathname).toBe("/sites/site_rye/settings");

        await type(input("instagram"), "@rye");
        await press(item("Save"));
        expect(save).toHaveBeenCalledWith({
            socialLinks: { instagram: "@rye" },
        });
        expect(sheet()).toBeNull();
        expect(rowText("settings-contact-social")).toContain("Instagram");
        expect(showSuccess).toHaveBeenCalledWith(
            "Social links saved. Your website shows them now.",
        );
        expect(refresh).toHaveBeenCalled();
    });

    it("opens the phone's own sheet here, and saves through it", async () => {
        const next = business({
            profile: { ...PROFILE, phone: "+919845012345" },
        });
        save.mockResolvedValue({ ok: true, data: next });
        draw(NOTHING, business());
        await press(named("Add phone"));
        expect(sheetName()).toBe("Phone on your website");
        await type(input("phone"), "+91 98450 12345");
        await press(item("Save"));
        expect(save).toHaveBeenCalledWith({
            profile: { phone: "+91 98450 12345" },
        });
        expect(sheet()).toBeNull();
        expect(rowText("settings-contact-phone")).toContain("+91 98450 12345");
    });

    it("keeps the sheet open on a refusal, with what was typed", async () => {
        save.mockResolvedValue({
            ok: false,
            error: "That isn't an X link. Use @yourname or x.com/yourname.",
            field: "socialLinks.x",
        });
        draw(NOTHING, business());
        await press(named("Add social links"));
        await type(input("x"), "@rye");
        await press(item("Save"));
        expect(sheet()).not.toBeNull();
        expect(input("x")?.value).toBe("@rye");
        expect(sheet()?.textContent).toContain("That isn't an X link.");
        expect(rowText("settings-contact-social")).toContain("None yet");
        expect(refresh).not.toHaveBeenCalled();
    });

    it("opens a row's sheet from a link, with ?edit=", () => {
        window.history.replaceState(
            null,
            "",
            "/sites/site_rye/settings?section=contact&edit=contact-social",
        );
        draw(NOTHING, business());
        expect(sheetName()).toBe("Social links");
    });

    it("opens no sheet from a link for someone who can't change the business", () => {
        window.history.replaceState(
            null,
            "",
            "/sites/site_rye/settings?section=contact&edit=contact-social",
        );
        draw(NOTHING, null);
        expect(sheet()).toBeNull();
    });
});

describe("the address on the website", () => {
    it("says the locations supply it, and that the registered address waits", async () => {
        draw(FULL, FULL_BUSINESS());
        await press(named("Edit address on your website"));
        expect(sheetName()).toBe("Address on your website");
        expect(sheet()?.textContent).toContain(
            "Your website shows the address of each location customers visit.",
        );
        expect(sheet()?.textContent).toContain(
            "Indiranagar: 12th Main, Bengaluru",
        );
        expect(sheet()?.textContent).toContain(
            "Your registered address isn't shown while a location has one.",
        );
    });

    it("shows the registered address only when the owner turns it on", async () => {
        save.mockResolvedValue({
            ok: true,
            data: business({ siteShowsRegisteredAddress: true }),
        });
        draw(NOTHING, business());
        await press(named("Edit address on your website"));
        const toggle =
            sheet()?.querySelector<HTMLButtonElement>('[role="switch"]');
        expect(toggle?.getAttribute("aria-checked")).toBe("false");
        expect(sheet()?.textContent).toContain(
            "Leave this off if it is your home.",
        );
        await press(toggle);
        // None on file yet: it says nothing will show until there is.
        expect(sheet()?.textContent).toContain(
            "You haven't added a registered address yet",
        );
        await press(item("Save"));
        expect(save).toHaveBeenCalledWith({
            siteShowsRegisteredAddress: true,
        });
        expect(showSuccess).toHaveBeenCalledWith(
            "Your website shows your registered address now",
        );
        expect(sheet()).toBeNull();
    });

    it("sends nothing when the choice is left as it was", async () => {
        draw(NOTHING, business());
        await press(named("Edit address on your website"));
        await press(item("Save"));
        expect(save).not.toHaveBeenCalled();
        expect(sheet()).toBeNull();
    });
});
