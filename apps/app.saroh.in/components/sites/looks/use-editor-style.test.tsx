// @vitest-environment jsdom
import { act, useEffect } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { LookId } from "@saroh/block-contract";

import type { SiteStyle, SiteStyleOptions } from "@/lib/sites/style";

import { StylePanel } from "./style-panel";
import { useEditorStyle } from "./use-editor-style";

/**
 * Choosing a look in Website › Style (DEC-172, plan U16): the choice is a
 * draft change the style autosave sends, and a save that fails puts the
 * previous look back and says why in the row.
 */

const updateSiteStyle = vi.fn<(...args: unknown[]) => Promise<unknown>>();
vi.mock("@/lib/sites/actions", () => ({
    updateSiteStyle: (...args: unknown[]) => updateSiteStyle(...args),
}));
const showError = vi.fn<(...args: unknown[]) => void>();
vi.mock("@saroh/ui/toast", () => ({
    showError: (...args: unknown[]) => showError(...args),
    showSuccess: vi.fn(),
}));
vi.mock("@/components/billing/plan-refusal", () => ({
    showPlanRefusal: vi.fn(),
}));
vi.mock("next/image", () => ({ default: () => null }));

const options: SiteStyleOptions = {
    rows: [
        {
            key: "pageGround",
            label: "Page ground",
            swatches: [{ key: "paper", label: "Paper", hsl: "0 0% 100%" }],
        },
    ],
    scalars: [],
};
const classic: SiteStyle = {
    colours: { pageGround: "paper" },
    scalars: {},
};

let host: HTMLDivElement;
let root: Root;
/** The hook's latest answer, as the harness last drew it. */
const seen: { current: ReturnType<typeof useEditorStyle> | null } = {
    current: null,
};

function Harness({
    initialStyle,
    liveLook,
}: {
    initialStyle: SiteStyle;
    liveLook: LookId | null;
}) {
    const style = useEditorStyle({
        siteId: "site-1",
        initialStyle,
        styleOptions: options,
        onSaved: noop,
    });
    useEffect(() => {
        seen.current = style;
    });
    return (
        <StylePanel
            style={style.style}
            options={options}
            onChange={style.setStyle}
            onReset={style.resetStyle}
            saving={style.styleSaving}
            changes={style.lookChanges}
            looks={{
                available: true,
                liveLook,
                published: true,
                templateId: "salon",
                error: style.lookError,
                onChoose: style.chooseLook,
            }}
        />
    );
}
const noop = () => undefined;

beforeEach(() => {
    vi.useFakeTimers();
    updateSiteStyle.mockReset();
    showError.mockReset();
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
});

afterEach(() => {
    act(() => root.unmount());
    host.remove();
    vi.useRealTimers();
    seen.current = null;
});

function render(
    initialStyle: SiteStyle = classic,
    liveLook: LookId | null = null,
) {
    act(() =>
        root.render(
            <Harness initialStyle={initialStyle} liveLook={liveLook} />,
        ),
    );
}

/** Choose one of the look cards (U24b). */
function pick(id: string) {
    const el = host.querySelector<HTMLElement>(`[data-look-choice="${id}"]`);
    if (!el) throw new Error(`No look "${id}"`);
    act(() => el.click());
}
/** The look the card says is in force. */
const current = () =>
    host.querySelector<HTMLElement>("[data-look-current]")?.dataset.lookCurrent;

/** Past the autosave's wait, and the save's answer. */
async function settle() {
    await act(() => vi.advanceTimersByTimeAsync(800));
    await act(async () => {
        await Promise.resolve();
    });
}

describe("choosing a look", () => {
    it("saves Folio to the draft and says it isn't published yet", async () => {
        updateSiteStyle.mockResolvedValue({ ok: true, data: { id: "site-1" } });
        render();
        pick("folio");
        expect(current()).toBe("folio");
        await settle();
        expect(updateSiteStyle).toHaveBeenCalledTimes(1);
        expect(updateSiteStyle).toHaveBeenCalledWith(
            "site-1",
            expect.objectContaining({ look: "folio" }),
        );
        expect(host.textContent).toContain("Not live yet");
        expect(seen.current?.savedLook).toBe("folio");
    });

    it("goes back to Classic by leaving the look out", async () => {
        updateSiteStyle.mockResolvedValue({ ok: true, data: { id: "site-1" } });
        render({ ...classic, look: "quiet" }, "quiet");
        expect(host.textContent).not.toContain("Not live yet");
        pick("classic");
        await settle();
        const sent = updateSiteStyle.mock.calls[0][1] as SiteStyle;
        expect(sent).not.toHaveProperty("look");
        expect(host.textContent).toContain(
            "Not live yet. Your site stays Quiet until you publish.",
        );
    });

    it("keeps the previous look when the save is refused, and says why in the row", async () => {
        updateSiteStyle.mockResolvedValue({
            ok: false,
            error: "Looks aren't available for this business yet",
        });
        render();
        pick("live");
        await settle();
        expect(current()).toBe("classic");
        expect(seen.current?.style.look).toBeUndefined();
        expect(host.querySelector('[role="alert"]')?.textContent).toBe(
            "Looks aren't available for this business yet. The look stays Classic.",
        );
        // Said in the row, not as a toast too.
        expect(showError).not.toHaveBeenCalled();
    });

    it("keeps the previous look when Saroh can't be reached", async () => {
        updateSiteStyle.mockRejectedValue(new Error("offline"));
        render({ ...classic, look: "quiet" });
        pick("folio");
        await settle();
        expect(current()).toBe("quiet");
        expect(host.querySelector('[role="alert"]')?.textContent).toBe(
            "Couldn't reach Saroh. The look stays Quiet.",
        );
    });

    it("clears the failure with the next choice", async () => {
        updateSiteStyle.mockResolvedValueOnce({ ok: false, error: "No." });
        render();
        pick("live");
        await settle();
        expect(host.querySelector('[role="alert"]')).not.toBeNull();
        pick("quiet");
        expect(host.querySelector('[role="alert"]')).toBeNull();
    });

    it("keeps the look through Reset, which is colours, type and spacing", () => {
        render({ ...classic, look: "folio", fontPair: "editorial" });
        act(() => seen.current?.resetStyle());
        expect(seen.current?.style.look).toBe("folio");
        expect(seen.current?.style).not.toHaveProperty("fontPair");
    });

    it("toasts a failed save that didn't change the look, as before", async () => {
        updateSiteStyle.mockResolvedValue({ ok: false, error: "Nope." });
        render({ ...classic, look: "quiet" });
        act(() =>
            seen.current?.setStyle({
                ...classic,
                look: "quiet",
                fontPair: "x",
            }),
        );
        await settle();
        expect(showError).toHaveBeenCalledWith("Nope.");
        expect(seen.current?.lookError).toBeNull();
        expect(seen.current?.style.look).toBe("quiet");
    });
});

describe("component styles and the look (DEC-237)", () => {
    const customised: SiteStyle = {
        ...classic,
        look: "folio",
        components: { buttons: "rounded" },
    };

    it("keeps the choices through a look switch; Reset to the look takes them away", () => {
        render(customised);
        act(() => seen.current?.chooseLook("live"));
        expect(seen.current?.style).toMatchObject({
            look: "live",
            components: { buttons: "rounded" },
        });
        act(() => seen.current?.resetStyle());
        expect(seen.current?.style).not.toHaveProperty("components");
        expect(seen.current?.style.look).toBe("live");
    });

    it("drops them for the new look's own", () => {
        render(customised);
        act(() => seen.current?.chooseLook("quiet", false));
        expect(seen.current?.style.look).toBe("quiet");
        expect(seen.current?.style).not.toHaveProperty("components");
    });

    it("saves a choice to the draft", async () => {
        updateSiteStyle.mockResolvedValue({ ok: true, data: { id: "site-1" } });
        render();
        act(() =>
            seen.current?.setStyle({
                ...classic,
                components: { cards: "flat" },
            }),
        );
        await settle();
        expect(updateSiteStyle).toHaveBeenCalledWith(
            "site-1",
            expect.objectContaining({ components: { cards: "flat" } }),
        );
    });
});

describe("Changes to the look and Reset (U24b)", () => {
    const withSpacing: SiteStyle = {
        colours: { pageGround: "paper" },
        scalars: { pageMargin: 24 },
    };
    const spacingOptions = {
        scalars: [
            {
                key: "pageMargin",
                label: "Page margin",
                min: 16,
                max: 80,
                step: 1,
                unit: "px",
                default: 38,
            },
        ],
    };

    it("puts stored spacing back with Reset, and lists it with an Undo", () => {
        options.scalars = spacingOptions.scalars;
        try {
            render(withSpacing);
            act(() => seen.current?.resetStyle());
            expect(seen.current?.style.scalars).toEqual({ pageMargin: 38 });
            const list = seen.current?.lookChanges.list ?? [];
            expect(list[0]).toMatchObject({
                part: "Look",
                words: "Reset to Classic",
            });
            act(() => seen.current?.lookChanges.undo(list[0].id));
            expect(seen.current?.style.scalars).toEqual({ pageMargin: 24 });
            expect(seen.current?.lookChanges.list).toEqual([]);
        } finally {
            options.scalars = [];
        }
    });

    it("lists each change newest first, and Undo puts back only its own", () => {
        render();
        act(() => seen.current?.chooseLook("quiet"));
        act(() =>
            seen.current?.setStyle({
                ...classic,
                look: "quiet",
                components: { cards: "flat" },
            }),
        );
        const list = seen.current?.lookChanges.list ?? [];
        expect(list.map((c) => c.part)).toEqual(["Buttons and shapes", "Look"]);
        expect(list[1].words).toBe("Classic to Quiet");
        act(() => seen.current?.lookChanges.undo(list[1].id));
        expect(seen.current?.style.look).toBeUndefined();
        expect(seen.current?.style.components).toEqual({ cards: "flat" });
        expect(host.textContent).toContain("Changes to the look");
        expect(host.querySelectorAll("[data-look-changes] li")).toHaveLength(1);
    });
});
