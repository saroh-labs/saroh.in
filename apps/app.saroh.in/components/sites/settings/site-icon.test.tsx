// @vitest-environment jsdom
/**
 * The "Site icon" row of Website › Settings and its sheet (DEC-120): the
 * row says which icon the site shows (its own, the business logo, a plain
 * tile with its initial); the sheet uploads one, shows it at a tab's and a
 * phone's size, removes it and saves. Nothing saves until Save, a refusal
 * keeps the sheet, and a read-only role has no action.
 */
import { act } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { SiteDetail } from "@/lib/sites/service";
import type { SiteAddress } from "@/lib/sites/share-links";

import { SiteSettings } from "../site-settings";
import { SiteSettingsRead } from "../site-settings-read";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({
    useRouter: () => ({ refresh }),
    useSearchParams: () => new URLSearchParams(window.location.search),
}));
const saveIcon = vi.fn();
const updateSettings = vi.fn();
vi.mock("@/lib/sites/actions", () => ({
    saveSiteIcon: (...args: unknown[]) => saveIcon(...args) as unknown,
    updateSiteSettings: (...args: unknown[]) =>
        updateSettings(...args) as unknown,
    updateSiteFooter: vi.fn(),
    updateSiteNavigation: vi.fn(),
    setPublishNeedsApproval: vi.fn(),
}));
vi.mock("@/lib/qr/actions", () => ({
    openQrPanel: vi.fn(),
    makeQrPanelCode: vi.fn(),
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

const UPLOADED = "https://media.example.com/org/o1/site-image/icon.png";
const LOGO = "https://media.example.com/org/o1/business-logo/logo.png";

// The uploader, as buttons: one hands back an uploaded picture as the real
// one does, and one asks the sheet's own check about a file it would refuse.
vi.mock("@/components/sites/media-picker", () => ({
    MediaPicker: ({
        onPick,
        label,
        check,
    }: {
        onPick: (image: {
            src: string;
            width: number;
            height: number;
            mediaId: string;
        }) => void;
        label?: string;
        check?: (file: { type: string; size: number }) => string;
    }) => (
        <div>
            <button
                type="button"
                data-picker
                onClick={() =>
                    onPick({
                        src: UPLOADED,
                        width: 512,
                        height: 512,
                        mediaId: "media_9",
                    })
                }
            >
                {label}
            </button>
            <button
                type="button"
                onClick={() =>
                    onPick({
                        src: UPLOADED,
                        width: 640,
                        height: 320,
                        mediaId: "media_wide",
                    })
                }
            >
                Pick a wide picture
            </button>
            <output data-check-svg>
                {check?.({ type: "image/svg+xml", size: 900 })}
            </output>
            <output data-check-big>
                {check?.({ type: "image/png", size: 1024 * 1024 + 1 })}
            </output>
            <output data-check-ok>
                {check?.({ type: "image/webp", size: 40_000 })}
            </output>
        </div>
    ),
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
    shopAwaitsSellsFrom: false,
    seoTitle: null,
    seoDescription: null,
    socialImageUrl: null,
    socialImageWidth: null,
    socialImageHeight: null,
    socialImageBytes: null,
    icon: { own: null, businessLogoUrl: null },
} as unknown as SiteDetail;

const OWN = { url: UPLOADED, mediaId: "media_1" };

const address: SiteAddress = {
    host: "rye.saroh.app",
    url: "https://rye.saroh.app",
    platformHost: "rye.saroh.app",
};

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
        "/sites/site_rye/settings?section=search-and-sharing",
    );
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    for (const mock of [
        saveIcon,
        updateSettings,
        showError,
        showSuccess,
        refresh,
    ]) {
        mock.mockReset();
    }
});

afterEach(() => {
    act(() => root.unmount());
    host.remove();
});

function draw(icon: SiteDetail["icon"] = site.icon) {
    act(() =>
        root.render(
            <SiteSettings site={{ ...site, icon }} address={address} />,
        ),
    );
}

const ROW = "settings-site-icon";
const row = () => host.querySelector<HTMLElement>(`#${ROW}`);
const rowIcon = () => row()?.querySelector("img")?.getAttribute("src") ?? "";
const edit = (name: string) =>
    host.querySelector<HTMLButtonElement>(`button[aria-label="${name}"]`);
const sheet = () => document.querySelector<HTMLElement>('[role="dialog"]');
const sheetName = () => {
    const id = sheet()?.getAttribute("aria-labelledby");
    return id ? document.getElementById(id)?.textContent : undefined;
};
const item = (name: string, within: ParentNode = document) =>
    Array.from(within.querySelectorAll<HTMLButtonElement>("button")).find(
        (b) => b.textContent === name,
    );
/** The icon as the sheet draws it in the tab, and on the phone. */
const preview = (which: "tab" | "phone") =>
    sheet()
        ?.querySelector(`[data-icon-preview="${which}"] img`)
        ?.getAttribute("src") ?? "";

async function settle() {
    await act(async () => {
        await new Promise((r) => setTimeout(r, 0));
    });
    await act(async () => {
        await new Promise((r) => setTimeout(r, 0));
    });
}

async function press(button: HTMLElement | null | undefined) {
    if (!button) throw new Error("Nothing to press");
    await act(async () => {
        button.click();
        await Promise.resolve();
    });
    await settle();
}

describe("the Site icon row", () => {
    it("with nothing set: a plain tile with the site's initial, and Add", () => {
        draw();
        expect(row()?.textContent).toContain("Site icon");
        expect(row()?.textContent).toContain("A plain icon with your initial");
        // Part of the draft, like the share image.
        expect(row()?.textContent).toContain("Next publish");
        expect(rowIcon()).toMatch(/^data:image\/svg\+xml,/);
        expect(decodeURIComponent(rowIcon())).toContain(">R</text>");
        expect(edit("Add site icon")?.textContent).toBe("Add");
    });

    it("with a business logo and no icon of its own: the logo, and Add", () => {
        draw({ own: null, businessLogoUrl: LOGO });
        expect(row()?.textContent).toContain("Using your business logo");
        expect(rowIcon()).toBe(LOGO);
        expect(edit("Add site icon")?.textContent).toBe("Add");
    });

    it("with its own: that image, whatever the logo, and Change", () => {
        draw({ own: OWN, businessLogoUrl: LOGO });
        expect(row()?.textContent).toContain("Your own icon");
        expect(rowIcon()).toBe(UPLOADED);
        expect(edit("Change site icon")?.textContent).toBe("Change");
        expect(edit("Add site icon")).toBeNull();
    });

    it("reads an older API's site, with no icon sent, as the plain tile", () => {
        draw(undefined);
        expect(row()?.textContent).toContain("A plain icon with your initial");
    });

    it("a read-only role sees the row and which icon it is, with no action", () => {
        act(() =>
            root.render(
                <SiteSettingsRead
                    site={
                        {
                            ...site,
                            icon: { own: null, businessLogoUrl: LOGO },
                            can: { manageSettings: false, publish: false },
                        } as unknown as SiteDetail
                    }
                    address={address}
                />,
            ),
        );
        expect(row()?.textContent).toContain("Using your business logo");
        expect(rowIcon()).toBe(LOGO);
        expect(row()?.querySelector("button")).toBeNull();
        expect(sheet()).toBeNull();
    });
});

describe("the Site icon sheet", () => {
    it("uploads inside the sheet, shows it at a tab's and a phone's size, and Save shows in the row", async () => {
        saveIcon.mockResolvedValue({
            ok: true,
            data: {
                icon: {
                    own: { url: UPLOADED, mediaId: "media_9" },
                    businessLogoUrl: null,
                },
            },
        });
        draw();
        await press(edit("Add site icon"));
        expect(sheetName()).toBe("Site icon");
        expect(sheet()?.textContent).toContain(
            "PNG, JPG or WebP, at least 192 × 192; square works best.",
        );
        // Before a pick, the sheet draws what the site shows now.
        expect(preview("tab")).toMatch(/^data:image\/svg\+xml,/);
        expect(sheet()?.textContent).toContain(
            "Without its own icon or a business logo, your site shows a plain icon with your initial.",
        );

        await press(item("Choose an image"));
        expect(preview("tab")).toBe(UPLOADED);
        expect(preview("phone")).toBe(UPLOADED);
        expect(sheet()?.textContent).toContain("Your own icon");
        expect(sheet()?.textContent).toContain("In a browser tab");
        expect(sheet()?.textContent).toContain("On a phone's home screen");
        // Nothing saved by picking, and the row still says what is saved.
        expect(saveIcon).not.toHaveBeenCalled();
        expect(row()?.textContent).toContain("A plain icon with your initial");

        await press(item("Save"));
        expect(saveIcon).toHaveBeenCalledTimes(1);
        expect(saveIcon).toHaveBeenCalledWith("site_rye", "media_9");
        expect(showSuccess).toHaveBeenCalledWith(
            "Site icon saved. Publish to make it public.",
        );
        expect(refresh).toHaveBeenCalled();
        expect(sheet()).toBeNull();
        expect(row()?.textContent).toContain("Your own icon");
        expect(rowIcon()).toBe(UPLOADED);
        expect(edit("Change site icon")?.textContent).toBe("Change");
    });

    it("checks a file before it is uploaded: PNG, JPG or WebP, under 1 MB", async () => {
        draw();
        await press(edit("Add site icon"));
        const said = (name: string) =>
            sheet()?.querySelector(`[data-check-${name}]`)?.textContent;
        expect(said("svg")).toBe("That file isn't a PNG, JPG or WebP image.");
        expect(said("big")).toBe(
            "That image is over 1 MB. Choose a smaller one.",
        );
        expect(said("ok")).toBe("");
    });

    it("says so when the picked image isn't square, and still lets it be saved", async () => {
        saveIcon.mockResolvedValue({
            ok: true,
            data: {
                icon: {
                    own: { url: UPLOADED, mediaId: "media_wide" },
                    businessLogoUrl: null,
                },
            },
        });
        draw();
        await press(edit("Add site icon"));
        await press(item("Pick a wide picture"));
        expect(
            sheet()?.querySelector("[data-icon-shape-note]")?.textContent,
        ).toBe(
            "This image isn't square, so it will look squashed in a tab. A square one works best.",
        );
        await press(item("Save"));
        expect(saveIcon).toHaveBeenCalledWith("site_rye", "media_wide");
    });

    it("removes it there: back to the business logo", async () => {
        saveIcon.mockResolvedValue({
            ok: true,
            data: { icon: { own: null, businessLogoUrl: LOGO } },
        });
        draw({ own: OWN, businessLogoUrl: LOGO });
        await press(edit("Change site icon"));
        expect(preview("tab")).toBe(UPLOADED);
        expect(item("Choose another image")).toBeDefined();

        await press(item("Use your business logo"));
        // The sheet shows what the site would show, before anything saves.
        expect(preview("tab")).toBe(LOGO);
        expect(sheet()?.textContent).toContain("Using your business logo");
        expect(saveIcon).not.toHaveBeenCalled();

        await press(item("Save"));
        expect(saveIcon).toHaveBeenCalledWith("site_rye", null);
        expect(showSuccess).toHaveBeenCalledWith(
            "Site icon removed. Publish to make it public.",
        );
        expect(row()?.textContent).toContain("Using your business logo");
        expect(rowIcon()).toBe(LOGO);
        expect(edit("Add site icon")?.textContent).toBe("Add");
    });

    it("removes it there: back to the plain icon, with no business logo", async () => {
        saveIcon.mockResolvedValue({
            ok: true,
            data: { icon: { own: null, businessLogoUrl: null } },
        });
        draw({ own: OWN, businessLogoUrl: null });
        await press(edit("Change site icon"));
        expect(item("Use your business logo")).toBeUndefined();
        await press(item("Use the plain icon"));
        expect(preview("phone")).toMatch(/^data:image\/svg\+xml,/);
        await press(item("Save"));
        expect(saveIcon).toHaveBeenCalledWith("site_rye", null);
        expect(row()?.textContent).toContain("A plain icon with your initial");
    });

    it("a refusal keeps the sheet open with what was picked, and the row as it was", async () => {
        saveIcon.mockResolvedValue({
            ok: false,
            error: "A site icon is under 1 MB. Choose a smaller image.",
        });
        draw();
        await press(edit("Add site icon"));
        await press(item("Choose an image"));
        await press(item("Save"));
        expect(showError).toHaveBeenCalledWith(
            "A site icon is under 1 MB. Choose a smaller image.",
        );
        expect(showSuccess).not.toHaveBeenCalled();
        expect(sheetName()).toBe("Site icon");
        expect(preview("tab")).toBe(UPLOADED);
        expect(row()?.textContent).toContain("A plain icon with your initial");
    });

    it("Cancel saves nothing, and the next opening starts from what is saved", async () => {
        draw();
        await press(edit("Add site icon"));
        await press(item("Choose an image"));
        await press(item("Cancel"));
        expect(saveIcon).not.toHaveBeenCalled();
        expect(sheet()).toBeNull();
        expect(row()?.textContent).toContain("A plain icon with your initial");

        await press(edit("Add site icon"));
        expect(preview("tab")).toMatch(/^data:image\/svg\+xml,/);
    });

    it("Save with nothing changed closes without a write", async () => {
        draw({ own: OWN, businessLogoUrl: null });
        await press(edit("Change site icon"));
        await press(item("Save"));
        expect(saveIcon).not.toHaveBeenCalled();
        expect(sheet()).toBeNull();
    });

    it("a link with ?edit=icon opens it on arrival, in its group", async () => {
        window.history.replaceState(
            null,
            "",
            "/sites/site_rye/settings?edit=icon",
        );
        draw();
        await settle();
        expect(sheetName()).toBe("Site icon");
        // Its group is the one shown behind it.
        expect(
            host
                .querySelector("#settings-panel-search-and-sharing")
                ?.hasAttribute("hidden"),
        ).toBe(false);
        // Closed, the link's query leaves the address.
        await press(item("Cancel"));
        expect(window.location.search).not.toContain("edit=");
    });
});
