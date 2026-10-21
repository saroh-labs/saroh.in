/** @vitest-environment jsdom */
import type { Catalog } from "@saroh/pricing-catalog";
import { parseCatalog } from "@saroh/pricing-catalog";
import {
    act,
    cleanup,
    fireEvent,
    render,
    screen,
    within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { FreeStyleChoices } from "@/lib/pricing-types";
import { fakeVersion } from "@/test/pricing-fixture";

import { AUTOSAVE_MS } from "../draft-store";
import { PlansShell } from "../plans-shell";
import { tabCatalog, tabData, tabPricing } from "../plans/tab-test-kit";
import { toggleFree } from "./free-styles";

const actions = vi.hoisted(() => ({
    savePricingDraftAction: vi.fn(),
    discardPricingDraftAction: vi.fn(),
    previewPricingAction: vi.fn(),
    pricingImpactAction: vi.fn(),
}));
vi.mock("@/lib/pricing-actions", () => actions);
vi.mock("next/navigation", () => ({
    useRouter: () => ({ refresh: vi.fn(), replace: vi.fn(), push: vi.fn() }),
}));

/** Made up: what the API's build offers. */
const STYLES: FreeStyleChoices = {
    looks: [
        { id: "folio", name: "Folio" },
        { id: "quiet", name: "Quiet" },
        { id: "live", name: "Live" },
    ],
    fontPairs: [
        { id: "archivo", name: "Archivo" },
        { id: "geist", name: "Geist and JetBrains Mono" },
    ],
    colourways: [
        { id: "salon:kesar", name: "Kesar", template: "Salon" },
        { id: "salon:mauve", name: "Mauve", template: "Salon" },
        { id: "gym:acid", name: "Acid", template: "Gym" },
    ],
};

function liveWith(freeStyles?: Catalog["freeStyles"]): Catalog {
    const c = tabCatalog();
    return parseCatalog({ ...c, ...(freeStyles ? { freeStyles } : {}) });
}

function open(catalog = liveWith(), styles: FreeStyleChoices | null = STYLES) {
    return render(
        <PlansShell
            data={tabData({
                pricing: tabPricing({
                    versions: [fakeVersion({ catalog })],
                    ...(styles ? { styles } : {}),
                }),
            })}
            impact={null}
            tab="modules"
        />,
    );
}

async function saved(): Promise<Catalog> {
    await act(() => vi.advanceTimersByTimeAsync(AUTOSAVE_MS));
    const call = actions.savePricingDraftAction.mock.calls.at(-1);
    if (!call) throw new Error("nothing was saved");
    return (call[0] as { catalog: Catalog }).catalog;
}

const checked = (el: HTMLElement) => el.getAttribute("aria-checked") === "true";
const disabled = (el: HTMLElement) => (el as HTMLButtonElement).disabled;

const panel = () =>
    within(
        screen.getByRole("region", {
            name: "Free looks, typefaces and colourways",
        }),
    );

beforeEach(() => {
    vi.useFakeTimers();
    Element.prototype.scrollIntoView = vi.fn();
    actions.pricingImpactAction.mockResolvedValue({ ok: true, data: null });
    actions.savePricingDraftAction.mockResolvedValue({
        ok: true,
        data: { revision: 1, valid: true, errors: [], changes: [] },
    });
    window.history.replaceState(null, "", "/plans?tab=modules");
});
afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.clearAllMocks();
});

describe("Free looks, typefaces and colourways (DEC-177)", () => {
    it("ticks what the live version makes free, and fixes what always is", () => {
        open(liveWith({ looks: ["quiet"], fontPairs: [], colourways: [] }));
        const p = panel();
        expect(checked(p.getByRole("checkbox", { name: /Quiet/ }))).toBe(true);
        expect(checked(p.getByRole("checkbox", { name: /Folio/ }))).toBe(false);
        const classic = p.getByRole("checkbox", { name: /Classic/ });
        expect(checked(classic)).toBe(true);
        expect(disabled(classic)).toBe(true);
        const system = p.getByRole("checkbox", {
            name: /Your visitor's system font/,
        });
        expect(checked(system)).toBe(true);
        expect(disabled(system)).toBe(true);
        expect(p.getByRole("group", { name: /Salon/ })).toBeTruthy();
        expect(p.getByRole("group", { name: "Gym" })).toBeTruthy();
    });

    it("leaves Quiet, Folio and Live tickable when only Classic is free", () => {
        // As the sample catalogue starts (owner, 21 Oct): the owner can
        // still make one free later.
        open(liveWith({ looks: [], fontPairs: [], colourways: [] }));
        const p = panel();
        for (const name of [/Quiet/, /Folio/, /Live/]) {
            const look = p.getByRole("checkbox", { name });
            expect(checked(look)).toBe(false);
            expect(disabled(look)).toBe(false);
        }
        expect(checked(p.getByRole("checkbox", { name: /Classic/ }))).toBe(
            true,
        );
    });

    it("saves a tick into the draft, in Saroh's order, to publish like any change", async () => {
        open(liveWith({ looks: ["live"], fontPairs: [], colourways: [] }));
        fireEvent.click(panel().getByRole("checkbox", { name: /Folio/ }));
        fireEvent.click(panel().getByRole("checkbox", { name: /Mauve/ }));
        fireEvent.click(panel().getByRole("checkbox", { name: /Archivo/ }));
        const draft = await saved();
        expect(draft.freeStyles).toEqual({
            looks: ["folio", "live"],
            fontPairs: ["archivo"],
            colourways: ["salon:mauve"],
        });
    });

    it("lists a free id Saroh no longer has, so it can be unticked", async () => {
        open(liveWith({ looks: ["bold"], fontPairs: [], colourways: [] }));
        const gone = panel().getByRole("checkbox", { name: /bold/ });
        expect(checked(gone)).toBe(true);
        expect(panel().getByText(/no longer in Saroh/)).toBeTruthy();
        fireEvent.click(gone);
        expect((await saved()).freeStyles?.looks).toEqual([]);
    });

    it("draws nothing to tick against an API that lists no styles", () => {
        open(liveWith(), null);
        expect(panel().queryAllByRole("checkbox")).toHaveLength(0);
        expect(panel().getByText(/doesn't list its looks yet/)).toBeTruthy();
    });
});

describe("toggleFree", () => {
    it("adds and removes one id, keeping the others", () => {
        const c = liveWith({
            looks: ["quiet"],
            fontPairs: ["archivo"],
            colourways: [],
        });
        toggleFree(c, "looks", "folio", true, ["folio", "quiet", "live"]);
        expect(c.freeStyles?.looks).toEqual(["folio", "quiet"]);
        toggleFree(c, "looks", "quiet", false, ["folio", "quiet", "live"]);
        expect(c.freeStyles).toEqual({
            looks: ["folio"],
            fontPairs: ["archivo"],
            colourways: [],
        });
    });
});
