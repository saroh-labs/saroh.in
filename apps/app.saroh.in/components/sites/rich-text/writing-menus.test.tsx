// @vitest-environment jsdom
import type { Editor } from "@tiptap/react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";

import { SlashMenu } from "./writing-menus";

vi.mock("@/components/shared/fields/media-picker", () => ({
    MediaPicker: () => null,
}));

(
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
    document.body.innerHTML = "";
});

/**
 * Tiptap emits "create" a tick after mount and only THEN sets
 * isInitialized (editor audit #1, 21 Nov): a menu that waited on the flag
 * inside its create handler never listened, and "/" just typed "/".
 */
it('"/" on an empty line opens the add menu once the editor is created', () => {
    const dom = document.createElement("div");
    document.body.appendChild(dom);
    const handlers: (() => void)[] = [];
    const editor = {
        isInitialized: false,
        isDestroyed: false,
        on: (_: string, fn: () => void) => handlers.push(fn),
        off: () => undefined,
        view: { dom, coordsAtPos: () => ({ bottom: 10, left: 10 }) },
        state: {
            selection: {
                from: 1,
                empty: true,
                $from: {
                    parent: {
                        type: { name: "paragraph" },
                        content: { size: 0 },
                    },
                },
            },
        },
        chain: () => ({ focus: () => ({ run: () => true }) }),
    } as unknown as Editor;

    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    act(() => root.render(<SlashMenu editor={editor} />));
    // Tiptap's order: create first, the flag after.
    act(() => handlers.forEach((fn) => fn()));
    (editor as { isInitialized: boolean }).isInitialized = true;

    const key = new KeyboardEvent("keydown", { key: "/", cancelable: true });
    act(() => {
        dom.dispatchEvent(key);
    });
    expect(key.defaultPrevented).toBe(true);
    expect(
        document.querySelector('[aria-label="Type to filter"]'),
    ).not.toBeNull();
    act(() => root.unmount());
});
