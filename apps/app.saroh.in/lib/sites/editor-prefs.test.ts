import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * What the editor restores a merchant to (#287).
 *
 * Every read here is defensive on purpose — `localStorage` throws outright in
 * some privacy modes, returns null when cleared, and holds whatever an older
 * version of this code wrote. The defence had no test, so nothing said whether
 * a bad stored value degraded to a default or took the editor down with it.
 *
 * The module caches at module level, so each test imports it fresh
 * (`resetModules`) rather than inheriting the previous test's cache — which is
 * also the bug `placeOnServer` exists to avoid on the server.
 */

/** A `localStorage` that holds what a test puts in it. */
function storage(seed: Record<string, string> = {}) {
    const map = new Map(Object.entries(seed));
    return {
        getItem: (k: string) => map.get(k) ?? null,
        setItem: (k: string, v: string) => void map.set(k, v),
        removeItem: (k: string) => void map.delete(k),
        clear: () => map.clear(),
        // `Array.from`, not a spread: this app's tsconfig targets an older
        // level, where spreading a Map iterator needs downlevelIteration.
        key: (i: number) => Array.from(map.keys())[i] ?? null,
        get length() {
            return map.size;
        },
    } as Storage;
}

function useStorage(store: Storage) {
    vi.stubGlobal("window", { localStorage: store, dispatchEvent: () => true });
}

/** Fresh module, so the module-level cache starts empty. */
async function load() {
    vi.resetModules();
    return import("./editor-prefs");
}

beforeEach(() => {
    useStorage(storage());
});

afterEach(() => {
    vi.unstubAllGlobals();
});

describe("clamping a dragged panel", () => {
    it("keeps a width inside the range the layout can draw", async () => {
        const prefs = await load();
        expect(prefs.clampRail(prefs.RAIL_MIN - 50)).toBe(prefs.RAIL_MIN);
        expect(prefs.clampRail(prefs.RAIL_MAX + 50)).toBe(prefs.RAIL_MAX);
        expect(prefs.clampPanel(prefs.PANEL_MIN - 1)).toBe(prefs.PANEL_MIN);
        expect(prefs.clampPanel(prefs.PANEL_MAX + 1)).toBe(prefs.PANEL_MAX);
    });

    it("falls back to the default for a width that is not a number", async () => {
        const prefs = await load();
        // NaN and Infinity both fall back rather than clamping: a non-finite
        // width would collapse the grid track to nothing, and NaN survives
        // every comparison a `<`/`>` clamp could make.
        expect(prefs.clampRail(Number.NaN)).toBe(prefs.RAIL_DEFAULT);
        expect(prefs.clampPanel(Number.POSITIVE_INFINITY)).toBe(
            prefs.PANEL_DEFAULT,
        );
    });
});

describe("reading the chrome back", () => {
    it("returns the defaults when nothing has been stored", async () => {
        const prefs = await load();
        expect(prefs.getChrome()).toEqual(prefs.CHROME_DEFAULT);
    });

    it("survives storage that throws, which is a real privacy mode", async () => {
        useStorage({
            getItem: () => {
                throw new Error("SecurityError: storage is blocked");
            },
        } as unknown as Storage);
        const prefs = await load();
        expect(prefs.getChrome()).toEqual(prefs.CHROME_DEFAULT);
    });

    it("survives a stored value that is not JSON", async () => {
        useStorage(storage({ "saroh.editor.chrome": "{not json" }));
        const prefs = await load();
        expect(prefs.getChrome()).toEqual(prefs.CHROME_DEFAULT);
    });

    it("clamps a stored width rather than trusting it", async () => {
        useStorage(
            storage({
                "saroh.editor.chrome": JSON.stringify({
                    railWidth: 9000,
                    panelWidth: 1,
                    device: "desktop",
                }),
            }),
        );
        const prefs = await load();
        const chrome = prefs.getChrome();
        expect(chrome.railWidth).toBe(prefs.RAIL_MAX);
        expect(chrome.panelWidth).toBe(prefs.PANEL_MIN);
    });

    it("refuses a device the preview cannot draw", async () => {
        useStorage(
            storage({
                "saroh.editor.chrome": JSON.stringify({ device: "watch" }),
            }),
        );
        const prefs = await load();
        // The preview switches on exactly three, so a fourth would render
        // nothing at all.
        expect(prefs.getChrome().device).toBe("desktop");
    });

    it("merges a patch against the store, not against a caller's snapshot", async () => {
        const prefs = await load();
        prefs.setChrome({ device: "phone" });
        prefs.setChrome({ railWidth: 260 });
        // Two updates in one tick would each overwrite the other if the caller
        // spread its own render's snapshot; merging in the store is what makes
        // both survive.
        expect(prefs.getChrome()).toMatchObject({
            device: "phone",
            railWidth: 260,
        });
    });
});

describe("where the merchant was in one site", () => {
    const KEY = "saroh.editor.site.site_1";

    it("selects the first section when there is one, and nothing when there is not", async () => {
        const prefs = await load();
        expect(prefs.getPlace("site_1", 3).selectedIndex).toBe(0);
        expect(prefs.getPlace("site_2", 0).selectedIndex).toBeNull();
    });

    it("drops a remembered index the page no longer has", async () => {
        useStorage(
            storage({
                [KEY]: JSON.stringify({ selectedIndex: 7, rail: "sections" }),
            }),
        );
        const prefs = await load();
        // Sections get deleted between visits; selecting index 7 of a
        // 3-section page blanks the field panel with no way to tell why.
        expect(prefs.getPlace("site_1", 3).selectedIndex).toBe(0);
    });

    it("keeps an index the page still has", async () => {
        useStorage(storage({ [KEY]: JSON.stringify({ selectedIndex: 2 }) }));
        const prefs = await load();
        expect(prefs.getPlace("site_1", 3).selectedIndex).toBe(2);
    });

    it("refuses a rail tab that does not exist", async () => {
        useStorage(storage({ [KEY]: JSON.stringify({ rail: "nonsense" }) }));
        const prefs = await load();
        expect(prefs.getPlace("site_1", 1).rail).toBe("sections");
    });

    it("refuses a scroll offset that would go nowhere useful", async () => {
        useStorage(
            storage({
                [KEY]: JSON.stringify({ scrollTop: -40 }),
            }),
        );
        const prefs = await load();
        expect(prefs.getPlace("site_1", 1).scrollTop).toBe(0);
    });

    it("keeps each site's place separate", async () => {
        const prefs = await load();
        prefs.setPlace("site_1", 3, { selectedIndex: 2 });
        // Coming back to section 2 of a DIFFERENT site would be nonsense.
        expect(prefs.getPlace("site_2", 3).selectedIndex).toBe(0);
    });
});

describe("what the server renders", () => {
    it("is the defaults, for everyone, whatever this process has cached", async () => {
        const prefs = await load();
        prefs.setChrome({ device: "phone" });
        prefs.setPlace("site_1", 3, { selectedIndex: 2 });

        /*
         * The cache is module-level, so on a server it is shared by every
         * request in the process — one visitor's selected section would be
         * served to the next. These two functions exist to not read it.
         */
        expect(prefs.getChromeOnServer()).toEqual(prefs.CHROME_DEFAULT);
        expect(prefs.placeOnServer(3)).toEqual({
            selectedIndex: 0,
            rail: "sections",
            scrollTop: 0,
        });
    });
});
