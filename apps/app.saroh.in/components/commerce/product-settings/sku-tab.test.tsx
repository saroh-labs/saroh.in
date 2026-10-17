// @vitest-environment jsdom
/**
 * Product settings › SKUs: two variants named alike are advice, never a
 * block; nothing is said in red on a page nobody has touched; turning
 * suggestions off never checks the pattern; Save is always there.
 */
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { SkuPreview } from "@/lib/products/settings";

import { SkuTab } from "./sku-tab";
import { stage } from "./test-kit";

const saveSkuPattern = vi.fn();
const previewSkuPattern = vi.fn();
vi.mock("@/lib/products/settings-actions", () => ({
    saveSkuPattern: (...a: unknown[]) => saveSkuPattern(...a) as unknown,
    previewSkuPattern: (...a: unknown[]) => previewSkuPattern(...a) as unknown,
}));
vi.mock("next/navigation", () => ({
    useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("@saroh/ui/toast", () => ({
    showError: vi.fn(),
    showUndo: vi.fn(),
}));

const ADVICE =
    "Hindi · Paperback and Hindi · Hardcover both shorten to HIND. The editor will add -2, -3 to tell them apart.";
const PREVIEW: SkuPreview = {
    rows: [
        {
            productId: "p1",
            product: "Godaan",
            variant: "Hindi · Paperback",
            now: "",
            next: "GOD01-HIND",
        },
        {
            productId: "p1",
            product: "Godaan",
            variant: "Hindi · Hardcover",
            now: "",
            next: "GOD01-HIND-2",
        },
    ],
    total: 2,
    problem: "",
    advice: ADVICE,
};
const SAVED = { pattern: "{NAME3}{N}-{VALUE}", suggest: true, n: 3 };

const s = stage();
const render = () =>
    s.render(<SkuTab settings={SAVED} preview={PREVIEW} canWrite />);
const patternField = () => s.inputs()[0];
const suggestBox = () =>
    document.querySelector<HTMLButtonElement>('[role="checkbox"]');

beforeEach(() => {
    s.mount();
    saveSkuPattern.mockReset().mockResolvedValue({
        ok: true,
        data: { pattern: SAVED.pattern, suggest: false, n: 3 },
    });
    previewSkuPattern.mockReset().mockResolvedValue(PREVIEW);
});
afterEach(() => s.unmount());

describe("SKUs", () => {
    it("opens with advice, not an error, and nothing to save", () => {
        render();
        expect(document.querySelector('[role="alert"]')).toBe(null);
        expect(s.text()).toContain(ADVICE);
        expect(s.text()).toContain("GOD01-HIND-2");
        expect(s.button("Save")).toBeUndefined();
    });

    it("turns suggestions off and saves, never checking the pattern", async () => {
        render();
        act(() => suggestBox()?.click());
        expect(s.button("Save")?.disabled).toBe(false);
        s.press("Save");
        await s.settle();
        expect(saveSkuPattern).toHaveBeenCalledWith(SAVED.pattern, false);
    });

    it("off, a broken pattern is not sent: the saved one stays", async () => {
        render();
        s.type(patternField(), "{SIZE}");
        act(() => suggestBox()?.click());
        expect(document.querySelector('[role="alert"]')).toBe(null);
        s.press("Save");
        await s.settle();
        expect(saveSkuPattern).toHaveBeenCalledWith(SAVED.pattern, false);
    });

    it("on, a pattern changed into a broken one is said, and Save stays on", async () => {
        render();
        s.type(patternField(), "{NAME3}{SIZE}");
        expect(s.text()).toContain("Only {NAME3}, {CAT}, {VALUE} and {N}");
        // Said once, under the field; the save bar only points to it.
        expect(document.querySelectorAll('[role="alert"]')).toHaveLength(1);
        const save = s.button("Save");
        expect(save?.disabled).toBe(false);
        s.press("Save");
        await s.settle();
        expect(saveSkuPattern).not.toHaveBeenCalled();
    });
});
