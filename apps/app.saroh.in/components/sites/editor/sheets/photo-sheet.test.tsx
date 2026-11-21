// @vitest-environment jsdom
import { act, useState } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { EditorModel } from "../shell/editor-model";
import { PhotoSheet, sizeLine } from "./photo-sheet";

const TOO_BIG =
    "That photo is over 10 MB. Export it smaller and upload it again.";
vi.mock("@/components/shared/fields/media-picker", () => ({
    // The API refuses an oversize photo before the bytes go up.
    useImageUpload: () => {
        const [error, setError] = useState<string | null>(null);
        return {
            upload: () => {
                setError(TOO_BIG);
                return Promise.resolve(null);
            },
            busy: false,
            progress: null,
            error,
            setError,
        };
    },
}));
vi.mock("@/lib/media/actions", () => ({
    listLibrary: () =>
        Promise.resolve([
            {
                id: "m1",
                filename: "sample-front.jpg",
                contentType: "image/jpeg",
                status: "READY",
                url: "https://media.example.com/sample-front.jpg",
                createdAt: "2026-11-01T00:00:00.000Z",
            },
            {
                id: "m2",
                filename: "sample-chair.jpg",
                contentType: "image/jpeg",
                status: "READY",
                url: "https://media.example.com/sample-chair.jpg",
                createdAt: "2026-11-01T00:00:00.000Z",
            },
        ]),
}));
vi.mock("@/lib/sites/actions", () => ({}));
vi.mock("@saroh/ui/toast", () => ({
    showSuccess: vi.fn(),
    showError: vi.fn(),
}));

/**
 * The photo sheet (U46d, `fix/WXKMedia`): replace, Describe the photo and
 * the focus point, written into the section's draft. Sample data only.
 */
/** The element, or the test fails naming what was missing. */
function must<T>(v: T | null | undefined, what: string): T {
    if (v == null) throw new Error(`No ${what}`);
    return v;
}

let root: Root;
let host: HTMLDivElement;
const replaceAt = vi.fn();
const FRONT = "https://media.example.com/sample-front.jpg";

function model(readOnly = false): EditorModel {
    return {
        readOnly,
        page: { id: "p", title: "Services", path: "/services" },
        draft: {
            sections: [
                {
                    type: "hero",
                    version: 2,
                    content: {
                        heading: "Welcome in",
                        image: { src: FRONT, alt: "The salon from the road" },
                    },
                },
            ],
            replaceAt,
        },
    } as unknown as EditorModel;
}

beforeEach(() => {
    (
        globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
    vi.clearAllMocks();
});

afterEach(() => {
    act(() => root.unmount());
    host.remove();
});

async function open(m = model()) {
    act(() =>
        root.render(
            <PhotoSheet
                model={m}
                target={{ index: 0, field: "image" }}
                onClose={vi.fn()}
            />,
        ),
    );
    await act(async () => {
        await Promise.resolve();
    });
}

const sheet = () => document.querySelector<HTMLElement>("[role=dialog]");
const button = (name: string) =>
    Array.from(document.querySelectorAll<HTMLButtonElement>("button")).find(
        (b) => b.textContent.trim() === name,
    );
const inSheet = <E extends Element>(sel: string) =>
    must(must(sheet(), "sheet").querySelector<E>(sel), sel);
const altBox = () => inSheet<HTMLTextAreaElement>("textarea");
const press = (el: HTMLElement) => {
    act(() => el.click());
};
const use = () =>
    act(() => {
        inSheet("form").dispatchEvent(
            new Event("submit", { bubbles: true, cancelable: true }),
        );
    });
const written = () =>
    (replaceAt.mock.calls.at(-1)?.[1] as { content: { image: object } }).content
        .image;

describe("the photo sheet", () => {
    it("says what it replaces, where", async () => {
        await open();
        expect(sheet()?.textContent).toContain("Replace the top photo");
        expect(sheet()?.textContent).toContain("Services · Welcome in");
    });

    it("keeps the description when the photo stays the same, and starts afresh for another", async () => {
        await open();
        expect(altBox().value).toBe("The salon from the road");
        press(
            inSheet<HTMLButtonElement>(
                "[data-photo-library] button:nth-child(2)",
            ),
        );
        expect(altBox().value).toBe("");
        press(
            inSheet<HTMLButtonElement>(
                "[data-photo-library] button:nth-child(1)",
            ),
        );
        expect(altBox().value).toBe("The salon from the road");
        use();
        expect(written()).toEqual({
            src: FRONT,
            alt: "The salon from the road",
        });
    });

    it("writes the focus point it was moved to", async () => {
        await open();
        const dot = inSheet<HTMLElement>("[role=slider]");
        for (const key of ["ArrowUp", "ArrowLeft"]) {
            act(() => {
                dot.dispatchEvent(
                    new KeyboardEvent("keydown", { key, bubbles: true }),
                );
            });
        }
        expect(dot.dataset.focusPoint).toBe("45,45");
        use();
        expect(written()).toMatchObject({ focus: { x: 45, y: 45 } });
    });

    it("refuses an oversize photo by its name and the limit", async () => {
        await open();
        const file = new File(["x"], "wedding-big.jpg", { type: "image/jpeg" });
        const input = inSheet<HTMLInputElement>("input[type=file]");
        Object.defineProperty(input, "files", {
            value: { item: () => file, length: 1 },
        });
        await act(async () => {
            input.dispatchEvent(new Event("change", { bubbles: true }));
            await Promise.resolve();
        });
        expect(sheet()?.textContent).toContain(`wedding-big.jpg: ${TOO_BIG}`);
    });

    it("a reader never opens it", async () => {
        await open(model(true));
        expect(sheet()).toBeNull();
        expect(button("Use this photo")).toBeUndefined();
    });
});

describe("the size line", () => {
    it("reads the photo's own size", () => {
        expect(sizeLine(2400, 1600)).toBe(
            "2400 × 1600 · Large, sharp on every screen",
        );
        expect(sizeLine(640, 480)).toMatch(/^640 × 480 · Small/);
        expect(sizeLine()).toBe("");
    });
});
