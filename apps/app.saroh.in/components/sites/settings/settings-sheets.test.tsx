// @vitest-environment jsdom
/**
 * Website › Settings, read first (owner, 10 Oct): a row for each thing
 * saved, and each row's Edit opening its own side sheet with one Save.
 * Nothing is edited in the row; a refusal keeps the sheet and what was
 * typed; a checklist step and a link with `?edit=` open the sheet in place.
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
    // As Next does: the address's query, as it is now.
    useSearchParams: () => new URLSearchParams(window.location.search),
}));
const updateSettings = vi.fn();
const updateNavigation = vi.fn();
const updateFooter = vi.fn();
vi.mock("@/lib/sites/actions", () => ({
    updateSiteFooter: (...args: unknown[]) => updateFooter(...args) as unknown,
    updateSiteNavigation: (...args: unknown[]) =>
        updateNavigation(...args) as unknown,
    updateSiteSettings: (...args: unknown[]) =>
        updateSettings(...args) as unknown,
    setPublishNeedsApproval: vi.fn(),
}));
const showError = vi.fn();
const showSuccess = vi.fn();
// The address row's QR button: its panel reads only when opened.
vi.mock("@/lib/qr/actions", () => ({
    openQrPanel: vi.fn(),
    makeQrPanelCode: vi.fn(),
}));
vi.mock("@saroh/ui/toast", () => ({
    showError: (...args: unknown[]) => showError(...args) as unknown,
    showSuccess: (...args: unknown[]) => showSuccess(...args) as unknown,
}));
vi.mock("@/components/sites/custom-domain", () => ({
    CustomDomain: () => null,
}));
// The uploader, as one button that hands back a picked picture.
vi.mock("@/components/sites/media-picker", () => ({
    MediaPicker: ({
        onPick,
    }: {
        onPick: (image: {
            src: string;
            width: number;
            height: number;
            bytes: number;
        }) => void;
    }) => (
        <button
            type="button"
            onClick={() =>
                onPick({
                    src: "https://example.com/loaf.jpg",
                    width: 1200,
                    height: 630,
                    bytes: 90_000,
                })
            }
        >
            Upload a picture
        </button>
    ),
}));

const PAGES = [
    { id: "p_home", path: "/", title: "Home", isHome: true, hidden: false },
    { id: "p_about", path: "/about", title: "About", hidden: false },
    { id: "p_find", path: "/find-us", title: "Find us", hidden: false },
];

const site = {
    id: "site_rye",
    name: "Rye",
    can: { manageSettings: true, publish: true },
    currentPublication: null,
    footer: { format: "markdown", value: "Rye, Hill Road" },
    navigation: null,
    pages: PAGES,
    pendingSectionChanges: 0,
    pendingSiteChanges: [],
    postsPrefix: null,
    sellsFrom: {
        storefront: { id: "st_1", name: "Online" },
        choices: [
            { id: "st_1", name: "Online", products: 4 },
            { id: "st_2", name: "Hill Road", products: 1 },
        ],
    },
    shopAwaitsSellsFrom: false,
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

let root: Root;
let host: HTMLDivElement;

beforeEach(() => {
    (
        globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    // Radix's controls measure themselves; jsdom has no layout to measure.
    vi.stubGlobal(
        "ResizeObserver",
        class {
            observe = vi.fn();
            unobserve = vi.fn();
            disconnect = vi.fn();
        },
    );
    Element.prototype.scrollIntoView = vi.fn();
    window.history.replaceState(null, "", "/sites/site_rye/settings");
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    for (const mock of [
        updateSettings,
        updateNavigation,
        updateFooter,
        showError,
        showSuccess,
        refresh,
    ]) {
        mock.mockReset();
    }
    // Every save is taken.
    updateSettings.mockResolvedValue({ ok: true });
    updateNavigation.mockResolvedValue({ ok: true });
    updateFooter.mockResolvedValue({ ok: true });
});

afterEach(() => {
    act(() => root.unmount());
    host.remove();
});

function draw(over: Partial<SiteDetail> = {}) {
    act(() =>
        root.render(
            <SiteSettings site={{ ...site, ...over }} address={address} />,
        ),
    );
}

/** A button by its words, on the page or in a sheet (a portal). */
const item = (name: string, within: ParentNode = document) =>
    Array.from(within.querySelectorAll<HTMLButtonElement>("button")).find(
        (b) => b.textContent === name,
    );
/** A row's Edit, by the name a screen reader gives it. */
const edit = (name: string) =>
    host.querySelector<HTMLButtonElement>(`button[aria-label="${name}"]`);
/** A row's words, tags aside. */
const row = (id: string) => host.querySelector(`#${id}`)?.textContent;

const sheets = () => document.querySelectorAll<HTMLElement>('[role="dialog"]');
const sheet = () => document.querySelector<HTMLElement>('[role="dialog"]');
const sheetName = () => {
    const id = sheet()?.getAttribute("aria-labelledby");
    return id ? document.getElementById(id)?.textContent : undefined;
};
const field = <T extends HTMLElement = HTMLInputElement>(id: string) =>
    document.querySelector<T>(`#${id}`);

/** Lets a save's transition and its awaited action settle. */
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

async function pressEscape() {
    await act(async () => {
        document.activeElement?.dispatchEvent(
            new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
        );
        await Promise.resolve();
    });
    await settle();
}

/** Types into a controlled field the way React hears it. */
function type(
    el: HTMLInputElement | HTMLTextAreaElement | null,
    value: string,
) {
    if (!el) throw new Error("Nothing to type in");
    act(() => {
        Object.getOwnPropertyDescriptor(
            Object.getPrototypeOf(el) as object,
            "value",
        )?.set?.call(el, value);
        el.dispatchEvent(new Event("input", { bubbles: true }));
    });
}

describe("the settings' rows", () => {
    it("say what is saved, with no field on the page until a row's Edit", () => {
        draw();
        expect(row("settings-title")).toContain("Rye · your site's name");
        expect(row("settings-description")).toContain("Not written");
        expect(row("settings-footer")).toContain("Rye, Hill Road");
        expect(row("settings-posts-path")).toContain("/blog");
        expect(sheet()).toBeNull();
        expect(host.querySelector("input, textarea, form")).toBeNull();
        expect(host.querySelector('[type="radio"], [role="radio"]')).toBeNull();
    });

    it("a read-only role sees the rows without Edit, and a link opens no sheet", () => {
        window.history.replaceState(
            null,
            "",
            "/sites/site_rye/settings?section=search-and-sharing&edit=title",
        );
        act(() =>
            root.render(
                <SiteSettingsRead
                    site={
                        {
                            ...site,
                            can: { manageSettings: false, publish: false },
                        } as unknown as SiteDetail
                    }
                    address={address}
                />,
            ),
        );
        expect(row("settings-title")).toContain("Rye · your site's name");
        // The address's QR button is for every role; nothing else opens.
        expect(
            host.querySelector(
                'button[aria-haspopup="dialog"]:not([data-qr-button])',
            ),
        ).toBeNull();
        expect(item("Edit", host)).toBeUndefined();
        expect(item("Change", host)).toBeUndefined();
        expect(sheet()).toBeNull();
    });
});

describe("the Title sheet", () => {
    const title = () => field("settings-title-field");

    it("Edit opens it by name, counts as it is typed, and Save shows in the row", async () => {
        draw();
        await press(edit("Edit title"));
        expect(sheetName()).toBe("Title");
        expect(title()?.value).toBe("");
        expect(document.activeElement).toBe(title());
        expect(sheet()?.textContent).toContain(
            "Left empty, your site's name is used: Rye.",
        );
        type(title(), "Rye, a bakery on Hill Road");
        expect(sheet()?.textContent).toContain("26 of about 60 characters.");
        // The link's card is drawn from what is typed, in the sheet.
        expect(sheet()?.textContent).toContain("When shared");
        expect(updateSettings).not.toHaveBeenCalled();
        // Still what is saved, behind the sheet.
        expect(row("settings-title")).toContain("Rye · your site's name");

        await press(item("Save"));
        expect(updateSettings).toHaveBeenCalledTimes(1);
        expect(updateSettings).toHaveBeenCalledWith("site_rye", {
            seoTitle: "Rye, a bakery on Hill Road",
        });
        expect(showSuccess).toHaveBeenCalledWith(
            "Title saved. Publish to make it public.",
        );
        expect(sheet()).toBeNull();
        expect(row("settings-title")).toContain("Rye, a bakery on Hill Road");
        expect(refresh).toHaveBeenCalled();
    });

    it("Cancel saves nothing, returns to the row's Edit, and the next opening starts fresh", async () => {
        draw();
        await press(edit("Edit title"));
        type(title(), "Something else");
        await press(item("Cancel"));
        expect(updateSettings).not.toHaveBeenCalled();
        expect(sheet()).toBeNull();
        expect(row("settings-title")).toContain("Rye · your site's name");
        expect(document.activeElement).toBe(edit("Edit title"));
        await press(edit("Edit title"));
        expect(title()?.value).toBe("");
    });

    it("Escape and the close button drop what was typed too", async () => {
        draw();
        await press(edit("Edit title"));
        type(title(), "Something else");
        await pressEscape();
        expect(sheet()).toBeNull();
        await press(edit("Edit title"));
        type(title(), "Something else");
        await press(item("Close", sheet() ?? document));
        expect(sheet()).toBeNull();
        expect(updateSettings).not.toHaveBeenCalled();
        expect(row("settings-title")).toContain("Rye · your site's name");
    });

    it("a refusal keeps the sheet open with what was typed, and the row as it was", async () => {
        updateSettings.mockResolvedValue({
            ok: false,
            error: "That title is too long.",
        });
        draw();
        await press(edit("Edit title"));
        type(title(), "A title the API refuses");
        await press(item("Save"));
        expect(showError).toHaveBeenCalledWith("That title is too long.");
        expect(sheetName()).toBe("Title");
        expect(title()?.value).toBe("A title the API refuses");
        expect(row("settings-title")).toContain("Rye · your site's name");
        expect(showSuccess).not.toHaveBeenCalled();
    });

    it("can't be dismissed while its save is on its way", async () => {
        let answer: (value: { ok: true }) => void = () => undefined;
        updateSettings.mockReturnValue(
            new Promise((resolve) => {
                answer = resolve;
            }),
        );
        draw();
        await press(edit("Edit title"));
        type(title(), "Rye bakery");
        await press(item("Save"));
        expect(item("Saving…")?.disabled).toBe(true);
        expect(item("Cancel")?.disabled).toBe(true);
        await pressEscape();
        expect(sheetName()).toBe("Title");
        await act(async () => {
            answer({ ok: true });
            await Promise.resolve();
        });
        await settle();
        expect(sheet()).toBeNull();
    });
});

describe("the other rows' sheets", () => {
    it("Write opens Description, and its save reaches the row and the checklist's verb", async () => {
        draw();
        expect(edit("Write description")?.textContent).toBe("Write");
        await press(edit("Write description"));
        expect(sheetName()).toBe("Description");
        const box = field<HTMLTextAreaElement>("settings-description-field");
        type(box, "Sourdough, baked every morning.");
        expect(sheet()?.textContent).toContain("31 of about 155 characters.");
        await press(item("Save"));
        expect(updateSettings).toHaveBeenCalledWith("site_rye", {
            seoDescription: "Sourdough, baked every morning.",
        });
        expect(row("settings-description")).toContain(
            "Sourdough, baked every morning.",
        );
        expect(edit("Edit description")?.textContent).toBe("Edit");
    });

    it("the share image is picked inside its sheet, and removed there", async () => {
        draw();
        await press(edit("Add share image"));
        expect(sheetName()).toBe("Share image");
        await press(item("Upload a picture"));
        expect(field("settings-image-field")?.value).toBe(
            "https://example.com/loaf.jpg",
        );
        // Nothing saved by picking.
        expect(updateSettings).not.toHaveBeenCalled();
        await press(item("Save"));
        expect(updateSettings).toHaveBeenCalledWith("site_rye", {
            socialImageUrl: "https://example.com/loaf.jpg",
            socialImageWidth: 1200,
            socialImageHeight: 630,
            socialImageBytes: 90_000,
        });
        expect(row("settings-share-image")).toContain(
            "https://example.com/loaf.jpg",
        );

        await press(edit("Replace share image"));
        await press(item("Remove image"));
        await press(item("Save"));
        expect(updateSettings).toHaveBeenLastCalledWith("site_rye", {
            socialImageUrl: null,
            socialImageWidth: null,
            socialImageHeight: null,
            socialImageBytes: null,
        });
        expect(row("settings-share-image")).toContain("None");
    });

    it("the menu is built, reordered and renamed inside its sheet", async () => {
        draw();
        await press(edit("Build menu"));
        expect(sheetName()).toBe("Menu");
        const inSheet = sheet() ?? document;
        expect(inSheet.textContent).toContain("No pages in the menu yet.");
        await press(item("About", inSheet));
        await press(item("Find us", inSheet));
        await press(
            inSheet.querySelector<HTMLButtonElement>(
                '[aria-label="Move Find us up"]',
            ),
        );
        type(
            inSheet.querySelector<HTMLInputElement>(
                '[aria-label="Menu label for About"]',
            ),
            "Our story",
        );
        // A row's button in the sheet never saves: only Save does.
        expect(updateNavigation).not.toHaveBeenCalled();
        expect(row("settings-menu")).toContain("Not built");

        await press(item("Save"));
        expect(updateNavigation).toHaveBeenCalledWith("site_rye", {
            items: [
                { pageId: "p_find" },
                { pageId: "p_about", label: "Our story" },
            ],
        });
        expect(sheet()).toBeNull();
        expect(row("settings-menu")).toContain("Find us · Our story");
        expect(edit("Edit menu")?.textContent).toBe("Edit");
    });

    it("the footer is written in its sheet, and clearing it removes it", async () => {
        draw();
        await press(edit("Edit footer"));
        expect(sheetName()).toBe("Footer");
        const box = sheet()?.querySelector<HTMLTextAreaElement>(
            'textarea[aria-label="Footer text"]',
        );
        expect(box?.value).toBe("Rye, Hill Road");
        type(box ?? null, "  ");
        await press(item("Save"));
        expect(updateFooter).toHaveBeenCalledWith("site_rye", null);
        expect(showSuccess).toHaveBeenCalledWith(
            "Footer removed. Publish to take it off the site.",
        );
        expect(row("settings-footer")).toContain("Not written");
        expect(edit("Write footer")?.textContent).toBe("Write");
    });

    it("the posts path says where posts will live as it is typed", async () => {
        draw();
        await press(edit("Edit posts path"));
        expect(sheetName()).toBe("Posts path");
        expect(sheet()?.textContent).toContain(
            "Posts will live at rye.saroh.app/blog/…",
        );
        type(field("settings-posts-path-field"), "journal");
        expect(sheet()?.textContent).toContain(
            "Posts will live at rye.saroh.app/journal/…",
        );
        await press(item("Save"));
        expect(updateSettings).toHaveBeenCalledWith("site_rye", {
            postsPrefix: "journal",
        });
        expect(row("settings-posts-path")).toContain("/journal");
    });

    it("Save with nothing changed closes without sending", async () => {
        draw();
        await press(edit("Edit posts path"));
        await press(item("Save"));
        expect(updateSettings).not.toHaveBeenCalled();
        expect(sheet()).toBeNull();
    });

    it("only one sheet is open at a time", async () => {
        draw();
        await press(edit("Edit title"));
        expect(sheets()).toHaveLength(1);
        // The page behind an open sheet is out of reach; were another
        // asked for all the same, it takes the first one's place.
        await press(
            host.querySelector<HTMLAnchorElement>(
                '[data-step="description"] a',
            ),
        );
        expect(sheets()).toHaveLength(1);
        expect(sheetName()).toBe("Description");
        await press(item("Cancel"));
        await press(edit("Edit posts path"));
        expect(sheets()).toHaveLength(1);
        expect(sheetName()).toBe("Posts path");
    });
});

describe("links that open a row's sheet", () => {
    it("a checklist step opens its group and its sheet in place", async () => {
        draw();
        const write = host.querySelector<HTMLAnchorElement>(
            '[data-step="description"] a',
        );
        expect(write?.textContent).toContain("Write");
        await press(write);
        expect(
            host.querySelector('[role="tab"][aria-selected="true"]')
                ?.textContent,
        ).toBe("Search and sharing");
        expect(sheetName()).toBe("Description");
        expect(document.activeElement).toBe(
            field("settings-description-field"),
        );
        // Still this page: nothing navigated.
        expect(window.location.pathname).toBe("/sites/site_rye/settings");
        await press(item("Cancel"));
        expect(document.activeElement).toBe(edit("Write description"));
    });

    it("?edit= opens the right sheet on arrival, in its group, and closing takes it out of the address", async () => {
        window.history.replaceState(
            null,
            "",
            "/sites/site_rye/settings?edit=menu",
        );
        draw();
        await settle();
        expect(sheetName()).toBe("Menu");
        expect(
            host.querySelector('[role="tab"][aria-selected="true"]')
                ?.textContent,
        ).toBe("Menu and footer");
        await press(item("Cancel"));
        expect(sheet()).toBeNull();
        expect(window.location.search).toBe("?section=menu-and-footer");
    });

    it("an unknown ?edit= opens nothing", () => {
        window.history.replaceState(
            null,
            "",
            "/sites/site_rye/settings?edit=everything",
        );
        draw();
        expect(sheet()).toBeNull();
    });

    it("the readiness step's #sells-from opens the Shop group and its sheet", async () => {
        window.history.replaceState(
            null,
            "",
            "/sites/site_rye/settings#sells-from",
        );
        draw();
        await act(async () => {
            await new Promise((r) => requestAnimationFrame(r));
        });
        await settle();
        expect(
            host.querySelector('[role="tab"][aria-selected="true"]')
                ?.textContent,
        ).toBe("Shop");
        expect(sheetName()).toBe("Sells from");
        await press(item("Cancel"));
        expect(window.location.hash).toBe("");
        expect(window.location.search).toBe("?section=shop");
    });
});
