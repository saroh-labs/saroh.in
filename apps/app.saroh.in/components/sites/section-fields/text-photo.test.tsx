// @vitest-environment jsdom
/**
 * The text block's photo in the inspector (round 2 G7): choose one, describe
 * it, put it on the left or the right, or take it off.
 *
 * `react-dom/client` + `act` directly, as `editor-canvas.test.tsx` does. The
 * media library is stood in for: uploading is its own module's job, and this
 * pins what the text block does with the photo it hands back.
 */
import { act } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { RichTextContent } from "@/lib/sites/service";

import { TextPhotoFields } from "./text-photo";

vi.mock("@/components/sites/media-picker", () => ({
    MediaPicker: ({
        label,
        onPick,
    }: {
        label?: string;
        onPick: (img: { src: string; width?: number; height?: number }) => void;
    }) => (
        <button
            type="button"
            data-picker
            onClick={() =>
                onPick({
                    src: "https://cdn.example.com/counter.jpg",
                    width: 800,
                    height: 600,
                })
            }
        >
            {label}
        </button>
    ),
}));

type Photo = Pick<RichTextContent, "image" | "imageSide">;

let root: Root;
let host: HTMLDivElement;

function render(value: Photo) {
    const onChange = vi.fn<(next: Photo) => void>();
    act(() => {
        root.render(<TextPhotoFields value={value} onChange={onChange} />);
    });
    return onChange;
}

function button(name: string): HTMLButtonElement {
    const found = Array.from(host.querySelectorAll("button")).find(
        (b) => b.textContent.trim() === name,
    );
    if (!found) throw new Error(`No "${name}" button`);
    return found;
}

function click(el: HTMLElement) {
    act(() => {
        el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
}

/** Type into a React-controlled input. */
function type(input: HTMLInputElement, value: string) {
    const descriptor = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
    );
    act(() => {
        descriptor?.set?.call(input, value);
        input.dispatchEvent(new Event("input", { bubbles: true }));
    });
}

const PHOTO: Photo = {
    image: { src: "https://cdn.example.com/old.jpg", alt: "The old shop" },
};

beforeEach(() => {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
});

afterEach(() => {
    act(() => root.unmount());
    host.remove();
});

describe("the text block's photo", () => {
    it("offers an upload, and nothing else, when there is no photo", () => {
        render({});
        expect(button("Upload a photo…")).toBeTruthy();
        expect(host.textContent).toContain("Beside the text.");
        expect(host.querySelector("input")).toBeNull();
        expect(host.textContent).not.toContain("Remove");
        expect(host.textContent).not.toContain("Photo side");
    });

    it("keeps the photo the library hands back, with its size", () => {
        const onChange = render({});
        click(button("Upload a photo…"));
        expect(onChange).toHaveBeenCalledWith({
            image: {
                src: "https://cdn.example.com/counter.jpg",
                alt: undefined,
                width: 800,
                height: 600,
            },
            imageSide: undefined,
        });
    });

    it("asks for a description, needed before publishing", () => {
        render({ image: { src: "https://cdn.example.com/a.jpg" } });
        const input = host.querySelector("input");
        expect(input?.placeholder).toMatch(/can't see it/);
        expect(host.textContent).toContain("Needed before you publish.");
        // The hint is the field's description, not a floating line.
        const hint = document.getElementById(
            input?.getAttribute("aria-describedby") ?? "",
        );
        expect(hint?.textContent).toBe("Needed before you publish.");
    });

    it("writes the description onto the photo", () => {
        const onChange = render(PHOTO);
        expect(host.textContent).not.toContain("Needed before you publish.");
        const input = host.querySelector("input");
        if (!input) throw new Error("No description field");
        type(input, "The counter");
        expect(onChange).toHaveBeenLastCalledWith({
            image: { ...PHOTO.image, alt: "The counter" },
            imageSide: undefined,
        });
    });

    it("replaces a photo, keeping the side and what was written", () => {
        const onChange = render({ ...PHOTO, imageSide: "left" });
        click(button("Replace…"));
        expect(onChange).toHaveBeenCalledWith({
            image: {
                src: "https://cdn.example.com/counter.jpg",
                alt: "The old shop",
                width: 800,
                height: 600,
            },
            imageSide: "left",
        });
    });

    it("shows the right as chosen when no side is stored, and moves it left", () => {
        const onChange = render(PHOTO);
        expect(button("Right").getAttribute("data-state")).toBe("on");
        expect(button("Left").getAttribute("data-state")).toBe("off");
        click(button("Left"));
        expect(onChange).toHaveBeenCalledWith({
            image: PHOTO.image,
            imageSide: "left",
        });
    });

    it("takes the photo off with Remove", () => {
        const onChange = render({ ...PHOTO, imageSide: "left" });
        click(button("Remove"));
        expect(onChange).toHaveBeenCalledWith({});
    });
});
