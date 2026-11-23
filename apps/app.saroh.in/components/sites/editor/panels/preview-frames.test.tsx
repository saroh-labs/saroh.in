// @vitest-environment jsdom
import type { ReactNode } from "react";
import { act } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { EditorModel } from "../shell/editor-model";
import {
    fitScale,
    PREVIEW_FRAMES_READY,
    PreviewFrames,
} from "./preview-frames";

vi.mock("next/navigation", () => ({
    useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("@/components/sites/canvas/section-preview", () => ({
    DraftPreview: () => <div data-draft="" />,
}));
vi.mock("@/components/sites/canvas/device-frame", () => ({
    DeviceFrame: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

/** Preview at three sizes (U46f, `fix/WXMPreview`). */
let root: Root;
let host: HTMLDivElement;

function model(over: Partial<EditorModel> = {}) {
    return {
        siteId: "site_1",
        pageId: "pg_1",
        pages: [],
        page: { id: "pg_1", path: "/", title: "Bridal packages" },
        siteName: "Sample Salon",
        address: null,
        layout: "wide",
        readOnly: false,
        unsaved: false,
        status: { label: "Live · 5 changes waiting", tone: "info", waiting: 5 },
        draft: { sections: [] },
        siteStyle: { style: {}, trying: null },
        styleOptions: {},
        canvasChrome: { name: "Sample", navigation: [], footer: null },
        publish: { neverPublished: false },
        releases: {
            available: true,
            abilities: { canUpdate: true },
            setMaking: vi.fn(),
        },
        ...over,
    } as unknown as EditorModel;
}

beforeEach(() => {
    (
        globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
});
afterEach(() => {
    act(() => root.unmount());
    host.remove();
});

function render(m: EditorModel, onBack = vi.fn()) {
    act(() => root.render(<PreviewFrames model={m} onBack={onBack} />));
    return onBack;
}
const frames = () =>
    Array.from(document.querySelectorAll("[data-preview-frame]")).map((f) =>
        f.getAttribute("data-preview-frame"),
    );
const button = (name: string) =>
    Array.from(document.querySelectorAll("button")).find(
        (b) => (b.getAttribute("aria-label") ?? b.textContent) === name,
    );
const click = (el: Element | null | undefined) => {
    expect(el).toBeTruthy();
    act(() => (el as HTMLElement).click());
};

describe("PreviewFrames (U46f)", () => {
    it("is built: the shell draws it in the canvas's place", () => {
        expect(PREVIEW_FRAMES_READY).toBe(true);
    });

    it("All three draws desktop, tablet and phone; one size draws one", () => {
        render(model());
        expect(document.body.textContent).toContain(
            "Bridal packages · the draft, with 5 changes not yet live",
        );
        expect(frames()).toEqual(["desktop", "tablet", "phone"]);
        expect(document.querySelectorAll("[data-draft]")).toHaveLength(3);
        click(button("Tablet"));
        expect(frames()).toEqual(["tablet"]);
        // One frame: nothing to scroll together.
        expect(document.querySelector("#preview-scroll-together")).toBeNull();
        click(button("All three"));
        expect(frames()).toHaveLength(3);
    });

    it("Scroll together is on, and turns off", () => {
        render(model());
        const toggle = document.querySelector("#preview-scroll-together");
        expect(toggle?.getAttribute("aria-checked")).toBe("true");
        click(toggle);
        expect(toggle?.getAttribute("aria-checked")).toBe("false");
    });

    it("Scroll together moves the others to the same place on the page", () => {
        render(model());
        const boxes = Array.from(
            document.querySelectorAll<HTMLDivElement>(
                "[data-preview-frame] > div",
            ),
        );
        for (const box of boxes) {
            Object.defineProperty(box, "scrollHeight", { value: 2000 });
            Object.defineProperty(box, "clientHeight", { value: 1000 });
        }
        boxes[0].scrollTop = 500;
        act(() => {
            boxes[0].dispatchEvent(new Event("scroll"));
        });
        expect(boxes[1].scrollTop).toBe(500);
        expect(boxes[2].scrollTop).toBe(500);
    });

    it("Back to editing goes back; Share a test link makes one", () => {
        const m = model();
        const onBack = render(m);
        click(button("Share a test link"));
        expect(m.releases.setMaking).toHaveBeenCalledWith(true);
        click(button("Back to editing"));
        expect(onBack).toHaveBeenCalled();
    });

    it("a reader, or test links off: no Share a test link", () => {
        render(model({ readOnly: true }));
        expect(button("Share a test link")).toBeUndefined();
    });

    it("on a phone: the phone width only", () => {
        render(model({ layout: "phone" }));
        expect(frames()).toEqual(["phone"]);
        expect(button("All three")).toBeUndefined();
    });
});

describe("fitScale", () => {
    it("fits the three side by side, never above the page's own size", () => {
        // (1920 - 64 - 80 - 6) / 2598: frames and gaps fit, no sideways scroll
        expect(fitScale([1440, 768, 390], 1920)).toBeCloseTo(0.6813, 3);
        for (const room of [1280, 1920, 2560]) {
            const s = fitScale([1440, 768, 390], room);
            expect(2598 * s + 64 + 80 + 6).toBeLessThanOrEqual(room + 0.01);
        }
        expect(fitScale([390], 1920)).toBe(1);
        expect(fitScale([1280], 0)).toBe(0.25);
    });
});
