// @vitest-environment jsdom
/**
 * Change cover: only an address a block would draw goes in the preview
 * `<img>` or is kept as the cover, so a `javascript:` address never is.
 */
import { act } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CoverEditor } from "./details-tab";
import type { PostEditorModel } from "./post-model";

vi.mock("@/components/shared/fields/media-picker", () => ({
    MediaPicker: () => null,
}));

let root: Root | null = null;
afterEach(() => {
    act(() => root?.unmount());
    root = null;
    document.body.innerHTML = "";
});

function open(image: string) {
    const set = vi.fn(() => vi.fn());
    const model = {
        draft: { fields: { image, imageAlt: "" }, set },
    } as unknown as PostEditorModel;
    const host = document.body.appendChild(document.createElement("div"));
    const made = createRoot(host);
    root = made;
    act(() => made.render(<CoverEditor model={model} onDone={vi.fn()} />));
    const use = Array.from(document.querySelectorAll("button")).find(
        (b) => b.textContent === "Use as cover",
    );
    return { img: document.querySelector("img"), use };
}

describe("Change cover", () => {
    it("draws a web address", () => {
        const { img, use } = open("https://example.com/photo.jpg");
        expect(img?.getAttribute("src")).toBe("https://example.com/photo.jpg");
        expect(use?.disabled).toBe(false);
    });

    it("never draws or keeps a javascript: address", () => {
        const { img, use } = open("javascript:alert(1)");
        expect(img).toBeNull();
        expect(document.body.textContent).toContain(
            "No photo found at that address.",
        );
        expect(use?.disabled).toBe(true);
    });
});
