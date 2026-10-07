// @vitest-environment jsdom
/**
 * The photo field's "From an address" panel. "Add photo" is on only when the
 * click will add, it adds the address rebuilt behind https:// (never the
 * text as typed), and an address it won't take says why beside the field,
 * instead of a button that silently does nothing (code review 3).
 *
 * `react-dom/client` + `act` directly, as the other component tests do.
 */
import { act } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AddressPanel } from "./photos-field";

// The panel's neighbours in the file reach the media library; not what is
// tested here.
vi.mock("@/lib/media/actions", () => ({ listLibrary: vi.fn() }));
vi.mock("@/components/sites/media-picker", () => ({
    MediaPicker: () => null,
}));
vi.mock("@saroh/ui/toast", () => ({ showUndo: vi.fn() }));

/**
 * The panel opens the address as a picture before adding it (UX-082):
 * a stand-in Image that loads, or fails for an address with "broken" in it.
 */
class FakeImage {
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    set src(value: string) {
        if (value.includes("broken")) this.onerror?.();
        else this.onload?.();
    }
}
vi.stubGlobal("Image", FakeImage);

let root: Root;
let host: HTMLDivElement;
const onAdd = vi.fn();

beforeEach(() => {
    (
        globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    onAdd.mockReset();
    act(() => root.render(<AddressPanel onAdd={onAdd} />));
});

afterEach(() => {
    act(() => root.unmount());
    host.remove();
});

function field(): HTMLInputElement {
    const label = Array.from(host.querySelectorAll("label")).find(
        (l) => l.textContent === "Photo address",
    );
    const input = label && document.getElementById(label.htmlFor);
    if (!(input instanceof HTMLInputElement)) {
        throw new Error("No Photo address field");
    }
    return input;
}

function addButton(): HTMLButtonElement {
    const hit = Array.from(host.querySelectorAll("button")).find(
        (b) => b.textContent.trim() === "Add photo",
    );
    if (!hit) throw new Error("No Add photo button");
    return hit;
}

/** Type into the field the way React hears it. */
function type(value: string) {
    const input = field();
    act(() => {
        Object.getOwnPropertyDescriptor(
            HTMLInputElement.prototype,
            "value",
        )?.set?.call(input, value);
        input.dispatchEvent(new Event("input", { bubbles: true }));
    });
}

function hint(): string {
    const id = field().getAttribute("aria-describedby");
    return (id && document.getElementById(id)?.textContent) ?? "";
}

describe("AddressPanel", () => {
    it("adds an https address, rebuilt behind https://", () => {
        type("  https://cdn.example.com/a.jpg?w=200  ");
        expect(addButton().disabled).toBe(false);
        expect(hint()).toBe("The shop shows it from that address.");
        expect(field().getAttribute("aria-invalid")).toBeNull();

        act(() => addButton().click());
        expect(onAdd).toHaveBeenCalledWith(
            "https://cdn.example.com/a.jpg?w=200",
            "",
        );
    });

    it("adds a mixed-case https address as the address it rebuilds", () => {
        type("HTTPS://CDN.example.com/A.jpg");
        expect(addButton().disabled).toBe(false);
        act(() => addButton().click());
        expect(onAdd).toHaveBeenCalledWith("https://cdn.example.com/A.jpg", "");
    });

    it.each([
        ["http://cdn.example.com/a.jpg", "Use the https:// address"],
        ["cdn.example.com/a.jpg", "An address starts with https://"],
        [
            "data:image/png;base64,iVBORw0KGgo=",
            "That isn't an address a photo can load from",
        ],
        ["javascript:alert(1)", "That isn't an address a photo can load from"],
        [
            "https://[not-a-host]/a.jpg",
            "That isn't an address a photo can load from",
        ],
    ])("keeps Add photo off for %s and says why", (typed, message) => {
        type(typed);
        expect(addButton().disabled).toBe(true);
        expect(hint()).toBe(message);
        expect(field().getAttribute("aria-invalid")).toBe("true");

        act(() => addButton().click());
        expect(onAdd).not.toHaveBeenCalled();
    });

    it("says so when the address doesn't open as a picture, and can add it anyway", () => {
        type("https://cdn.example.com/broken.jpg");
        act(() => addButton().click());
        expect(onAdd).not.toHaveBeenCalled();
        expect(hint()).toBe(
            "That address didn't open as a picture. Check it, or upload the photo instead.",
        );
        const anyway = Array.from(host.querySelectorAll("button")).find(
            (b) => b.textContent.trim() === "Add it anyway",
        );
        act(() => anyway?.click());
        expect(onAdd).toHaveBeenCalledWith(
            "https://cdn.example.com/broken.jpg",
            "",
        );
    });

    it("says nothing is wrong before anything is typed", () => {
        expect(addButton().disabled).toBe(true);
        expect(hint()).toBe("The shop shows it from that address.");
    });
});
